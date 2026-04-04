import { initAnankeWasm } from "../src/wasm/bridge.js";

const wasm = await initAnankeWasm();
wasm.world_create(42);
const entities = new Int32Array([
  1, 1, 0, 0, 0, 0, 10_000, 2_500, 6_200, 4_600,
  2, 2, 2_000, 0, 0, 0, 10_000, 2_500, 6_200, 4_600,
]);
wasm.world_loadEntities(entities);
wasm.world_step([{ entityIdx: 0, dx: 20, dy: 0, targetIdx: 1 }]);
console.log(wasm.world_extractSnapshot());
