# WASM integration (advanced)

Ananke ships an AssemblyScript core (`wasm/ananke-core.wasm`) and a TypeScript bridge (`src/wasm/bridge.ts`).

## Node.js

```ts pseudocode
import { initAnankeWasm } from "@its-not-rocket-science/ananke/dist/src/wasm/bridge.js";

const bridge = await initAnankeWasm();
bridge.world_create(1337);
bridge.world_step(new Int32Array([0, 1, 0]));
console.log(bridge.world_extractSnapshot()[0]);
```

## Browser

Use the same bridge API, but host `wasm/ananke-core.wasm` at a public URL and adapt loading to `fetch(...).arrayBuffer()`.

## Cloudflare Workers

Bundle the bridge and embed the wasm binary as a module asset; initialize once per isolate and reuse `bridge` per request.

## Fallback behavior

`initAnankeWasm()` falls back to a TypeScript backend automatically if:

- WebAssembly is unavailable
- wasm loading fails
- instantiation throws
