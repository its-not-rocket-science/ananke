import { anankeAdapter } from "./ananke.js";
import { gridSageAdapter } from "./gridsage.js";
import { unityDotsAdapter } from "./unity-dots.js";
import { handRolledJsAdapter } from "./hand-rolled-js.js";
import { wasmAdapter } from "./wasm.js";

export const adapters = [anankeAdapter, wasmAdapter, gridSageAdapter, unityDotsAdapter, handRolledJsAdapter];
