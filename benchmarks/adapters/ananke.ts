import { runAnankeTick } from "../scenarios/common.js";
import type { BaselineAdapter } from "./types.js";

const now = () => performance.now();

export const anankeAdapter: BaselineAdapter = {
  id: "ananke-ts",
  label: "Ananke TS",
  async run(scenario) {
    const world = scenario.setup();
    const warmup = scenario.warmupTicks ?? 0;

    for (let i = 0; i < warmup; i++) {
      scenario.beforeTick?.(world, i);
      runAnankeTick(world);
    }

    const heapStart = process.memoryUsage().heapUsed;
    const t0 = now();
    for (let i = 0; i < scenario.ticks; i++) {
      scenario.beforeTick?.(world, i);
      runAnankeTick(world);
    }
    const elapsedMs = now() - t0;
    const heapEnd = process.memoryUsage().heapUsed;
    const tickMs = elapsedMs / scenario.ticks;

    return {
      tickMs,
      ticksPerSec: tickMs > 0 ? 1000 / tickMs : 0,
      heapDeltaMB: (heapEnd - heapStart) / (1024 * 1024),
    };
  },
};
