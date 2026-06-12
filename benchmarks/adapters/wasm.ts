import { initAnankeWasm } from "../../src/wasm/bridge.js";
import type { BaselineAdapter } from "./types.js";

const now = () => performance.now();

export const wasmAdapter: BaselineAdapter = {
  id: "ananke-wasm",
  label: "Ananke (WASM core)",
  async run(scenario) {
    const bridge = await initAnankeWasm();
    const entityCount = scenario.setup().entities.length;
    const commands = new Int32Array(Math.max(3, entityCount * 3));
    bridge.world_create(1);

    for (let i = 0; i < commands.length; i += 3) {
      commands[i] = (i / 3) % 256;
      commands[i + 1] = (i / 3) % 2 === 0 ? 1 : -1;
      commands[i + 2] = 0;
    }

    const warmup = scenario.warmupTicks ?? 0;
    const step = bridge.world_stepBatch ?? ((cmds: Int32Array, count: number) => bridge.world_step(cmds.subarray(0, count * 3)));

    for (let i = 0; i < warmup; i++) step(commands, Math.trunc(commands.length / 3));

    const t0 = now();
    for (let i = 0; i < scenario.ticks; i++) step(commands, Math.trunc(commands.length / 3));
    const elapsedMs = now() - t0;
    const tickMs = elapsedMs / scenario.ticks;

    return {
      tickMs,
      ticksPerSec: tickMs > 0 ? 1000 / tickMs : 0,
      notes: `backend=${bridge.backend}`,
    };
  },
};
