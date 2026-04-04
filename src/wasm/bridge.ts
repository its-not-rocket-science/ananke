import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export interface WasmSnapshotEntity {
  x: number;
  y: number;
  hp: number;
  alive: number;
}

export interface AnankeWasmBridge {
  backend: "wasm" | "ts";
  world_create: (seed: number) => number;
  world_step: (commands: Int32Array) => number;
  world_extractSnapshot: () => WasmSnapshotEntity[];
}

interface CoreExports {
  memory: WebAssembly.Memory;
  alloc: (size: number) => number;
  world_create: (seed: number) => number;
  world_step: (commandsPtr: number, commandCount: number) => number;
  world_extractSnapshot: (outPtr: number) => number;
  snapshot_size_for: (n: number) => number;
}

function createTsFallback(): AnankeWasmBridge {
  const entities: WasmSnapshotEntity[] = [];
  let seed = 1;
  const next = () => (seed = (seed * 1664525 + 1013904223) | 0);

  return {
    backend: "ts",
    world_create(worldSeed) {
      entities.length = 0;
      seed = worldSeed | 0;
      for (let i = 0; i < 256; i++) {
        entities.push({ x: (next() & 0x3fff) - 0x1fff, y: (next() & 0x3fff) - 0x1fff, hp: 1000, alive: 1 });
      }
      return entities.length;
    },
    world_step(commands) {
      for (let i = 0; i < commands.length; i += 3) {
        const idx = commands[i]!;
        if (!entities[idx] || entities[idx]!.alive === 0) continue;
        entities[idx]!.x += commands[i + 1]!;
        entities[idx]!.y += commands[i + 2]!;
      }
      return entities.length;
    },
    world_extractSnapshot() {
      return entities.map((entity) => ({ ...entity }));
    },
  };
}

export async function initAnankeWasm(): Promise<AnankeWasmBridge> {
  try {
    if (typeof WebAssembly === "undefined") return createTsFallback();

    const wasmPath = fileURLToPath(new URL("../../wasm/ananke-core.wasm", import.meta.url));
    const bytes = await readFile(wasmPath);
    const instance = await WebAssembly.instantiate(bytes, {});
    const ex = instance.instance.exports as unknown as CoreExports;

    return {
      backend: "wasm",
      world_create(seed: number) {
        return ex.world_create(seed | 0);
      },
      world_step(commands: Int32Array) {
        const ptr = ex.alloc(commands.byteLength);
        new Int32Array(ex.memory.buffer, ptr, commands.length).set(commands);
        return ex.world_step(ptr, Math.trunc(commands.length / 3));
      },
      world_extractSnapshot() {
        const count = ex.world_step(ex.alloc(0), 0);
        const size = ex.snapshot_size_for(count);
        const outPtr = ex.alloc(size);
        ex.world_extractSnapshot(outPtr);
        const raw = new Int32Array(ex.memory.buffer, outPtr, Math.trunc(size / 4));
        const entities: WasmSnapshotEntity[] = [];
        const n = raw[0] ?? 0;
        for (let i = 0; i < n; i++) {
          const o = 1 + i * 4;
          entities.push({ x: raw[o]!, y: raw[o + 1]!, hp: raw[o + 2]!, alive: raw[o + 3]! });
        }
        return entities;
      },
    };
  } catch {
    return createTsFallback();
  }
}
