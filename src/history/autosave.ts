import type { WorldState } from "../sim/world.js";
import { exportWorldState, importWorldState } from "../serialization/binary.js";

export interface AutosaveConfig {
  everyNTicks?: number;
  onEntityDeath?: boolean;
  autosaveKey?: string;
}

export interface AutosaveStorage {
  save(key: string, bytes: Uint8Array): Promise<void>;
  load(key: string): Promise<Uint8Array | undefined>;
}

export class AutosaveManager {
  private readonly cfg: Required<AutosaveConfig>;
  private readonly storage: AutosaveStorage;

  constructor(storage?: AutosaveStorage, cfg: AutosaveConfig = {}) {
    this.storage = storage ?? defaultAutosaveStorage();
    this.cfg = {
      everyNTicks: cfg.everyNTicks ?? 100,
      onEntityDeath: cfg.onEntityDeath ?? true,
      autosaveKey: cfg.autosaveKey ?? "ananke:last-autosave",
    };
  }

  async maybeAutosave(world: WorldState, previous?: WorldState): Promise<void> {
    const tickPolicy = this.cfg.everyNTicks > 0 && world.tick % this.cfg.everyNTicks === 0;
    const deathPolicy = this.cfg.onEntityDeath && previous ? hasDeath(previous, world) : false;
    if (tickPolicy || deathPolicy) {
      await this.saveNow(world);
    }
  }

  async saveNow(world: WorldState): Promise<void> {
    await this.storage.save(this.cfg.autosaveKey, exportWorldState(world));
  }

  async recover(): Promise<WorldState | undefined> {
    const bytes = await this.storage.load(this.cfg.autosaveKey);
    if (!bytes) return undefined;
    return importWorldState(bytes);
  }
}

export function defaultAutosaveStorage(): AutosaveStorage {
  if (typeof window === "undefined") return new NodeAutosaveStorage();
  return new IndexedDbAutosaveStorage();
}

class NodeAutosaveStorage implements AutosaveStorage {
  async save(key: string, bytes: Uint8Array): Promise<void> {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const os = await import("node:os");
    const dir = path.join(os.homedir(), ".ananke", "autosave");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, sanitizeKey(key) + ".bin"), bytes);
  }

  async load(key: string): Promise<Uint8Array | undefined> {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const os = await import("node:os");
    try {
      const bytes = await fs.readFile(path.join(os.homedir(), ".ananke", "autosave", sanitizeKey(key) + ".bin"));
      return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    } catch {
      return undefined;
    }
  }
}

class IndexedDbAutosaveStorage implements AutosaveStorage {
  private readonly dbName = "ananke-autosave";
  private readonly storeName = "snapshots";

  async save(key: string, bytes: Uint8Array): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).put(bytes, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async load(key: string): Promise<Uint8Array | undefined> {
    const db = await this.open();
    return new Promise<Uint8Array | undefined>((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readonly");
      const req = tx.objectStore(this.storeName).get(key);
      req.onsuccess = () => resolve(req.result ? new Uint8Array(req.result as ArrayBufferLike) : undefined);
      req.onerror = () => reject(req.error);
    });
  }

  private async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}

function hasDeath(previous: WorldState, next: WorldState): boolean {
  const prevAlive = previous.entities.filter(e => !e.injury.dead).length;
  const nextAlive = next.entities.filter(e => !e.injury.dead).length;
  return nextAlive < prevAlive;
}

function sanitizeKey(input: string): string {
  return input.replace(/[^a-z0-9_.-]/gi, "_");
}
