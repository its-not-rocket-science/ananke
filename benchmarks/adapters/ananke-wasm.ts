import { initAnankeWasm, type WasmCommand } from "../../src/wasm/bridge.js";
import type { BaselineAdapter } from "./types.js";

const now = () => performance.now();

export const anankeWasmAdapter: BaselineAdapter = {
  id: "ananke-wasm",
  label: "Ananke WASM",
  async run(scenario) {
    const backend = await initAnankeWasm();
    const world = scenario.setup();

    const packed = new Int32Array(world.entities.length * 10);
    world.entities.forEach((entity, i) => {
      const b = i * 10;
      packed[b] = entity.id;
      packed[b + 1] = entity.teamId;
      packed[b + 2] = entity.position_m.x;
      packed[b + 3] = entity.position_m.y;
      packed[b + 4] = entity.velocity_mps.x;
      packed[b + 5] = entity.velocity_mps.y;
      packed[b + 6] = entity.injury.dead ? 0 : 10_000;
      packed[b + 7] = 2500;
      packed[b + 8] = 6200;
      packed[b + 9] = 4600;
    });

    backend.world_create(world.seed);
    backend.world_loadEntities(packed);

    const warmup = scenario.warmupTicks ?? 0;
    const commandBuffer: WasmCommand[] = [];
    for (let i = 0; i < warmup; i++) {
      scenario.beforeTick?.(world, i);
      backend.world_step(commandBuffer);
    }

    const heapStart = process.memoryUsage().heapUsed;
    const t0 = now();
    for (let i = 0; i < scenario.ticks; i++) {
      scenario.beforeTick?.(world, i);
      backend.world_step(commandBuffer);
    }
    const elapsedMs = now() - t0;
    const heapEnd = process.memoryUsage().heapUsed;
    const tickMs = elapsedMs / scenario.ticks;

    return {
      tickMs,
      ticksPerSec: tickMs > 0 ? 1000 / tickMs : 0,
      heapDeltaMB: (heapEnd - heapStart) / (1024 * 1024),
      ...(backend.available ? {} : { notes: "WASM unavailable; fallback TS bridge path used." }),
    };
  },
};
