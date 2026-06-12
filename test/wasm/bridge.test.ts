import { describe, expect, it } from "vitest";
import { initAnankeWasm } from "../../src/wasm/bridge.js";

describe("wasm bridge", () => {
  it("initializes fallback or wasm backend", async () => {
    const bridge = await initAnankeWasm();
    expect(["wasm", "ts"]).toContain(bridge.backend);
  });

  it("creates world, steps commands, extracts snapshot", async () => {
    const bridge = await initAnankeWasm();
    const n = bridge.world_create(1337);
    expect(n).toBeGreaterThan(0);

    const commands = new Int32Array([0, 1, 1, 1, -1, 1, 2, 0, -1]);
    const afterStep = bridge.world_step(commands);
    expect(afterStep).toBe(n);

    const snapshot = bridge.world_extractSnapshot();
    expect(snapshot).toHaveLength(n);
    expect(snapshot[0]!.hp).toBeGreaterThan(0);
  });
});
