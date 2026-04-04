# WASM integration guide

The Ananke core hot path can run in `wasm/ananke-core.wasm` via the bridge at `src/wasm/bridge.ts`.

## Node.js

```ts
import { initAnankeWasm } from "@its-not-rocket-science/ananke/dist/src/wasm/bridge.js";

const wasm = await initAnankeWasm();
wasm.world_create(1337);
```

## Browser

Host `wasm/ananke-core.wasm` as a static asset and call `initAnankeWasm()` from bundled code.
If loading fails or WebAssembly is unsupported, bridge falls back to a TypeScript path.

## Cloudflare Workers

Bundle the bridge and include `wasm/ananke-core.wasm` in your worker assets. The bridge API is async and edge-safe.

## Bridge API

- `await initAnankeWasm()`
- `world_create(seed)`
- `world_loadEntities(packedI32)`
- `world_step(commands)`
- `world_extractSnapshot()`
