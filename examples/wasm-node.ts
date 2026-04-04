import { initAnankeWasm } from "../src/wasm/bridge.js";

const bridge = await initAnankeWasm();
console.log(`backend=${bridge.backend}`);
bridge.world_create(42);
bridge.world_step(new Int32Array([0, 1, 0, 1, -1, 0]));
console.log(bridge.world_extractSnapshot().slice(0, 2));
