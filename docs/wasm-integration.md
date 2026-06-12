# WASM integration (advanced)

Ananke ships AssemblyScript WASM kernels (`dist/as/*.wasm`) and a public Node loader on the
`@its-not-rocket-science/ananke/wasm-kernel` subpath.

## Node.js

```ts pseudocode
import { loadWasmKernel } from "@its-not-rocket-science/ananke/wasm-kernel";

const kernel = await loadWasmKernel();
const report = kernel.shadowStep(world, world.tick);
console.log(report.summary);
```

## Browser

Use the same bridge API, but host `wasm/ananke-core.wasm` at a public URL and adapt loading to `fetch(...).arrayBuffer()`.

## Cloudflare Workers

Bundle the bridge and embed the wasm binary as a module asset; initialize once per isolate and reuse `bridge` per request.

## Fallback behavior

`loadWasmKernel()` throws if WASM artifacts are missing (for example before
`npm run build:wasm:all`). For hosts that want explicit fallback behavior, catch that error and
continue with the TypeScript kernel path.

- WebAssembly is unavailable
- wasm loading fails
- instantiation throws
