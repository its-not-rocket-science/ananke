// ── Tier 1 — Stable host API ─────────────────────────────────────────────────
// This is the only import path companion projects and hosts should use:
//   import { stepWorld, createWorld, q, SCALE } from "@its-not-rocket-science/ananke"
//
// Breaking changes to any export here require a major semver bump (x.0.0) and
// a migration guide in CHANGELOG.md.  See STABLE_API.md for the full contract.
//
// Tier 2 (experimental) and Tier 3 (internal) exports are accessible via direct
// module imports, e.g. import { stepAging } from ".../dist/src/sim/aging.js"

export * from "./units.js";          // q(), SCALE, qMul, qDiv, clampQ, mulDiv, to, from, sqrtQ
export * from "./types.js";          // IndividualAttributes, core scalar types
export * from "./archetypes.js";     // Archetype, BodyPlan, built-in species presets
export * from "./generate.js";       // generateIndividual()
export * from "./equipment.js";      // WEAPONS database, EquipmentCatalogue
export * from "./describe.js";       // describeCharacter(), formatCharacterSheet(), formatOneLine()

export * from "./sim/vec3.js";       // Vec3, lerpVec3, addVec3
export * from "./sim/condition.js";  // ConditionSnapshot, condition constants
export * from "./sim/injury.js";     // InjuryRegion, BodyRegion, injury constants
export * from "./sim/entity.js";     // Entity (stable fields: id, pos, mass_kg, attributes…)
export * from "./sim/commands.js";   // CommandMap, EntityCommand, action verbs
export * from "./sim/kernel.js";     // stepWorld(), applyImpactToInjury(), applyExplosion()
export * from "./sim/body.js";       // BodyPlan, BodySegment, humanoid / quadruped plans
export * from "./sim/world.js";      // WorldState, KernelContext

export * from "./model3d.js";        // extractRigSnapshots(), deriveAnimationHints(), RigSnapshot, AnimationHints
export * from "./replay.js";         // ReplayRecorder, replayTo(), serializeReplay(), deserializeReplay()
export * from "./bridge/index.js";   // BridgeEngine, InterpolatedState, BridgeConfig

export * from "./world-factory.js";  // createWorld(), EntitySpec, ARCHETYPE_MAP, ITEM_MAP
export * from "./scenario.js";       // loadScenario(), validateScenario(), AnankeScenario
