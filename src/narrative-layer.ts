/**
 * @module ananke/narrative
 * @tier2 Experimental — breaking changes get a CHANGELOG entry.
 *
 * Narrative and chronicle systems: event chronicles, story arc detection,
 * narrative rendering, legends, mythology, stress testing, combat metrics,
 * and arena scenarios.
 *
 * Import via subpath:
 *   import { addChronicleEntry, detectStoryArcs } from "@its-not-rocket-science/ananke/narrative"
 */

export * from "./chronicle.js";
export * from "./story-arcs.js";
export * from "./narrative-render.js";
export * from "./legend.js";
export * from "./mythology.js";
export * from "./narrative.js";
export * from "./narrative-stress.js";
export * from "./metrics.js";
export * from "./arena.js";
export * from "./narrative/combat-logger.js";
export * from "./narrative/plausibility.js";
