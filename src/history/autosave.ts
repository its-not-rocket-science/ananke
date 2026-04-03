import type { WorldState } from "../sim/world.js";
import { exportWorldState, importWorldState } from "../serialization/binary.js";

export interface AutosaveConfig {
  everyNTicks?: number;
  onEntityDeath?: boolean;
}

export interface AutosaveStorage {
  save(key: string, data: Uint8Array): Promise<void>;
  load(key: string): Promise<Uint8Array | null>;
}

export function createNodeAutosaveStorage(basePath = ".autosave"): AutosaveStorage {
  return {
    async save(key, data) {
      const fs = await import("node:fs/promises");
      await fs.mkdir(basePath, { recursive: true });
      await fs.writeFile(`${basePath}/${key}.bin`, data);
    },
    async load(key) {
      const fs = await import("node:fs/promises");
      try {
        const bytes = await fs.readFile(`${basePath}/${key}.bin`);
        return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      } catch {
        return null;
      }
    },
  };
}

export function createIndexedDbAutosaveStorage(dbName = "ananke-autosave"): AutosaveStorage {
  async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => void): Promise<T> {
    const db = await openDb(dbName);
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("saves", mode);
      const store = tx.objectStore("saves");
      run(store);
      tx.oncomplete = () => resolve(undefined as T);
      tx.onerror = () => reject(tx.error ?? new Error("autosave: indexeddb tx failed"));
    });
  }

  return {
    async save(key, data) {
      await withStore<void>("readwrite", store => { store.put(data, key); });
    },
    async load(key) {
      const db = await openDb(dbName);
      return await new Promise<Uint8Array | null>((resolve, reject) => {
        const tx = db.transaction("saves", "readonly");
        const req = tx.objectStore("saves").get(key);
        req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null);
        req.onerror = () => reject(req.error ?? new Error("autosave: indexeddb get failed"));
      });
    },
  };
}

async function openDb(name: string): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("saves")) db.createObjectStore("saves");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("autosave: indexeddb open failed"));
  });
}

export class AutosaveManager {
  private readonly cfg: Required<AutosaveConfig>;

  constructor(
    private readonly key: string,
    private readonly storage: AutosaveStorage,
    config: AutosaveConfig = {},
  ) {
    this.cfg = {
      everyNTicks: config.everyNTicks ?? 100,
      onEntityDeath: config.onEntityDeath ?? false,
    };
  }

  async maybeAutosave(world: WorldState, reason: "tick" | "entity_death" | "command"): Promise<boolean> {
    const dueToTick = reason === "tick" && world.tick % this.cfg.everyNTicks === 0;
    const dueToDeath = reason === "entity_death" && this.cfg.onEntityDeath;
    const dueToCommand = reason === "command";
    if (!dueToTick && !dueToDeath && !dueToCommand) return false;

    await this.storage.save(this.key, exportWorldState(world));
    return true;
  }

  async recoverLastAutosave(): Promise<WorldState | null> {
    const blob = await this.storage.load(this.key);
    if (!blob) return null;
    return importWorldState(blob);
  }
}
