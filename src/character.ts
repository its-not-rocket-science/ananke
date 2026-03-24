/**
 * @module ananke/character
 * @tier2 Experimental — breaking changes get a CHANGELOG entry.
 *
 * Character lifecycle: aging, sleep, disease, wound healing, thermoregulation,
 * nutrition, medical treatment, toxicology, and skill progression.
 *
 * Import via subpath:
 *   import { stepAging, stepSleep } from "@its-not-rocket-science/ananke/character"
 */

export * from "./sim/aging.js";
export * from "./sim/sleep.js";
export * from "./sim/disease.js";
export * from "./sim/wound-aging.js";
export * from "./sim/thermoregulation.js";
export * from "./sim/nutrition.js";
export * from "./sim/medical.js";
export * from "./sim/toxicology.js";
export * from "./progression.js";
