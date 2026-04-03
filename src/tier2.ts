// Tier 2 — Experimental host-facing surface.
// Usable, but subject to change across minor versions.

export * from "./archetypes.js";
export * from "./generate.js";
export * from "./equipment.js";
export * from "./weapons.js";
export * from "./presets.js";
export * from "./channels.js";
export * from "./traits.js";
export * from "./describe.js";

export * from "./sim/vec3.js";
export * from "./sim/condition.js";
export * from "./sim/injury.js";
export * from "./sim/kinds.js";
export * from "./sim/body.js";

export * from "./model3d.js";
export * from "./bridge/index.js";

export * from "./world-factory.js";
export * from "./scenario.js";

export * from "./navigation/causal-chain.js";

export * from "./serialization/binary.js";
export * from "./history/timetravel.js";
export * from "./history/autosave.js";
