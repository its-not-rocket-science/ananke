/**
 * @module ananke/combat
 * @tier2 Experimental — breaking changes get a CHANGELOG entry.
 *
 * Combat extensions: ranged weapons, grappling, formation tactics, mounted
 * combat, environmental hazards, morale, sensory systems, weather, terrain,
 * skills, and biome effects.
 *
 * Import via subpath:
 *   import { resolveRangedAttack, stepGrapple } from "@its-not-rocket-science/ananke/combat"
 */

export * from "./sim/ranged.js";
export * from "./sim/grapple.js";
export * from "./sim/formation-combat.js";
export * from "./sim/mount.js";
export * from "./sim/hazard.js";
export * from "./sim/morale.js";
export * from "./sim/sensory.js";
export * from "./sim/sensory-extended.js";
export * from "./sim/weather.js";
export * from "./sim/terrain.js";
export * from "./sim/skills.js";
export * from "./sim/biome.js";
