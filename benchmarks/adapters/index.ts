import { anankeAdapter } from "./ananke.js";
import { anankeWasmAdapter } from "./ananke-wasm.js";
import { gridSageAdapter } from "./gridsage.js";
import { unityDotsAdapter } from "./unity-dots.js";
import { handRolledJsAdapter } from "./hand-rolled-js.js";

export const adapters = [anankeAdapter, anankeWasmAdapter, gridSageAdapter, unityDotsAdapter, handRolledJsAdapter];
