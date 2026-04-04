import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export interface WasmCommand {
  entityIdx: number;
  dx: number;
  dy: number;
  targetIdx: number;
}

export interface WasmSnapshotRow {
  id: number;
  x: number;
  y: number;
  hpQ: number;
  alive: boolean;
}

export interface WasmBackend {
  available: boolean;
  world_create: (seed: number) => number;
  world_loadEntities: (packed: Int32Array) => number;
  world_step: (commands: WasmCommand[]) => number;
  world_extractSnapshot: () => WasmSnapshotRow[];
}

interface CoreExports {
  memory: WebAssembly.Memory;
  ENTITY_STRIDE_I32: WebAssembly.Global;
  allocWords: (words: number) => number;
  world_create: (seed: number) => number;
  world_loadEntities: (ptr: number, count: number) => number;
  world_step: (commandsPtr: number) => number;
  world_extractSnapshot: () => number;
}

function fallbackBackend(): WasmBackend {
  let seed = 1;
  let world = new Int32Array(0);

  return {
    available: false,
    world_create(nextSeed: number) {
      seed = nextSeed | 0;
      return seed;
    },
    world_loadEntities(packed: Int32Array) {
      world = packed.slice();
      return world.length;
    },
    world_step(commands: WasmCommand[]) {
      for (const command of commands) {
        const base = command.entityIdx * 10;
        if (base < 0 || base + 9 >= world.length) continue;
        world[base + 4] = (world[base + 4] ?? 0) + (command.dx | 0);
        world[base + 5] = (world[base + 5] ?? 0) + (command.dy | 0);
        world[base + 2] = (world[base + 2] ?? 0) + world[base + 4]!;
        world[base + 3] = (world[base + 3] ?? 0) + world[base + 5]!;
      }
      return commands.length;
    },
    world_extractSnapshot() {
      const rows: WasmSnapshotRow[] = [];
      for (let i = 0; i < world.length; i += 10) {
        rows.push({
          id: world[i] ?? 0,
          x: world[i + 2] ?? 0,
          y: world[i + 3] ?? 0,
          hpQ: world[i + 6] ?? 0,
          alive: (world[i + 6] ?? 0) > 0,
        });
      }
      return rows;
    },
  };
}

export async function initAnankeWasm(): Promise<WasmBackend> {
  if (typeof WebAssembly === "undefined") return fallbackBackend();

  try {
    const candidates = [
      new URL("../../wasm/ananke-core.wasm", import.meta.url),
      new URL("../../../wasm/ananke-core.wasm", import.meta.url),
    ];
    let instance: WebAssembly.WebAssemblyInstantiatedSource | null = null;
    for (const candidate of candidates) {
      try {
        const wasm = await readFile(fileURLToPath(candidate));
        instance = await WebAssembly.instantiate(wasm);
        break;
      } catch {
        // try next candidate
      }
    }
    if (!instance) return fallbackBackend();
    const ex = instance.instance.exports as unknown as CoreExports;
    const mem32 = () => new Int32Array(ex.memory.buffer);

    let commandPtr = 0;
    let commandCapWords = 0;
    let entityPtr = 0;
    let entityCapWords = 0;


    function ensureMemory(wordsRequiredFromBase: number): void {
      const bytesNeeded = wordsRequiredFromBase * 4;
      const current = ex.memory.buffer.byteLength;
      if (bytesNeeded <= current) return;
      const missing = bytesNeeded - current;
      const pages = Math.ceil(missing / 65536);
      ex.memory.grow(pages);
    }

    function ensureWords(requiredWords: number, slot: "command" | "entity"): number {
      if (slot === "command") {
        if (requiredWords > commandCapWords) {
          commandPtr = ex.allocWords(requiredWords);
          commandCapWords = requiredWords;
        }
        return commandPtr;
      }
      if (requiredWords > entityCapWords) {
        entityPtr = ex.allocWords(requiredWords);
        entityCapWords = requiredWords;
      }
      return entityPtr;
    }

    return {
      available: true,
      world_create(seed) {
        return ex.world_create(seed | 0);
      },
      world_loadEntities(packed) {
        const ptr = ensureWords(packed.length, "entity");
        ensureMemory((ptr >> 2) + packed.length);
        mem32().set(packed, ptr >> 2);
        return ex.world_loadEntities(ptr, Math.trunc(packed.length / Number(ex.ENTITY_STRIDE_I32.value)));
      },
      world_step(commands) {
        const words = 1 + commands.length * 4;
        const ptr = ensureWords(words, "command");
        ensureMemory((ptr >> 2) + words);
        const view = mem32();
        let cursor = ptr >> 2;
        view[cursor++] = commands.length;
        for (const cmd of commands) {
          view[cursor++] = cmd.entityIdx | 0;
          view[cursor++] = cmd.dx | 0;
          view[cursor++] = cmd.dy | 0;
          view[cursor++] = cmd.targetIdx | 0;
        }
        return ex.world_step(ptr);
      },
      world_extractSnapshot() {
        const ptr = ex.world_extractSnapshot();
        ensureMemory((ptr >> 2) + 1);
        let view = mem32();
        const base = ptr >> 2;
        const count = view[base] ?? 0;
        ensureMemory(base + 1 + count * 5);
        view = mem32();
        const rows: WasmSnapshotRow[] = [];
        let cursor = base + 1;
        for (let i = 0; i < count; i++) {
          rows.push({
            id: view[cursor++] ?? 0,
            x: view[cursor++] ?? 0,
            y: view[cursor++] ?? 0,
            hpQ: view[cursor++] ?? 0,
            alive: (view[cursor++] ?? 0) === 1,
          });
        }
        return rows;
      },
    };
  } catch {
    return fallbackBackend();
  }
}
