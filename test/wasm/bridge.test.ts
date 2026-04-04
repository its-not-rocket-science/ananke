import { describe, it, expect } from "vitest";
import { initAnankeWasm } from "../../src/wasm/bridge.js";

describe("wasm bridge", () => {
  it("falls back safely when wasm module is unavailable", async () => {
    const bridge = await initAnankeWasm();
    bridge.world_create(1);
    bridge.world_loadEntities(new Int32Array([
      1, 1, 0, 0, 0, 0, 10_000, 2_500, 6_200, 4_600,
    ]));

    const stepped = bridge.world_step([{ entityIdx: 0, dx: 10, dy: 0, targetIdx: 0 }]);
    const snapshot = bridge.world_extractSnapshot();

    expect(stepped).toBeGreaterThanOrEqual(1);
    expect(snapshot.length).toBe(1);
    expect(snapshot[0]!.id).toBe(1);
  });

  it("supports empty command buffers", async () => {
    const bridge = await initAnankeWasm();
    bridge.world_create(2);
    bridge.world_loadEntities(new Int32Array([
      1, 1, 0, 0, 0, 0, 10_000, 2_500, 6_200, 4_600,
      2, 2, 900, 0, 0, 0, 10_000, 2_500, 6_200, 4_600,
    ]));

    bridge.world_step([]);
    const snapshot = bridge.world_extractSnapshot();
    expect(snapshot).toHaveLength(2);
  });
});
