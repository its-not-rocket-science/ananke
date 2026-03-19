// ── Tier 1 — Stable host API ─────────────────────────────────────────────────
// These exports form the public integration surface.  Breaking changes require
// a major semver bump (x.0.0) and a migration guide in CHANGELOG.md.
// Safe to import directly in host applications and typed as stable in STABLE_API.md.

export * from "./units.js";      // q(), SCALE, qMul, mulDiv — fixed-point arithmetic
export * from "./types.js";      // IndividualAttributes, core scalar types
export * from "./archetypes.js"; // Archetype, BodyPlan, built-in species presets
export * from "./generate.js";   // generateIndividual()
export * from "./equipment.js";  // WEAPONS database, EquipmentCatalogue

export * from "./sim/vec3.js";       // Vec3, lerpVec3, addVec3 — 3-D vector helpers
export * from "./sim/condition.js";  // ConditionSnapshot, condition constants
export * from "./sim/injury.js";     // InjuryRegion, BodyRegion, injury constants
export * from "./sim/entity.js";     // Entity (stable fields: id, pos, mass_kg, attributes…)
export * from "./sim/commands.js";   // CommandMap, EntityCommand, action verbs
export * from "./sim/kernel.js";     // stepWorld(), applyImpactToInjury(), applyExplosion()
export * from "./sim/body.js";       // BodyPlan, BodySegment, humanoid / quadruped plans
export * from "./sim/world.js";      // WorldState, KernelContext, createWorld()

// ── Tier 2 — Advanced / experimental API ─────────────────────────────────────
// Tested and usable subsystems under active development.  May change between
// minor versions (0.x.0); CHANGELOG.md will document any breaking change.
// Reference STABLE_API.md §Tier 2 for the full export list per module.

export * from "./channels.js";            // damage channel constants (BLUNT, SLASH, …)
export * from "./traits.js";              // trait descriptors
export * from "./derive.js";              // derived attribute helpers
export * from "./sim/intent.js";          // IntentMap, buildIntent()
export * from "./sim/action.js";          // ActionResult, resolveAction()
export * from "./sim/combat.js";          // resolveHit(), resolveParry(), applyCombat()

export * from "./quest.js";               // Quest, QuestObjective, questStep()
export * from "./quest-generators.js";    // generateQuest(), generateQuestChain()
export * from "./relationships.js";       // RelationshipMap, updateRelationship()
export * from "./relationships-effects.js"; // applyRelationshipEffect()
export * from "./inventory.js";           // Inventory, equipItem(), addItemToInventory()
export * from "./item-durability.js";     // durability helpers, resolveRepair()
export * from "./settlement.js";          // Settlement, stepSettlement()
export * from "./settlement-services.js"; // service resolution helpers
export * from "./chronicle.js";           // ChronicleEntry, addChronicleEntry()
export * from "./story-arcs.js";          // StoryArc, detectArcs()
export * from "./narrative-render.js";    // renderEntry(), renderChronicle(), generateNarrative()
export * from "./world-generation.js";    // WorldTemplate, generateWorld()
export * from "./bridge/index.js";        // BridgeEngine, extractRigSnapshots(), MotionVector

export * from "./sim/trace.js";           // SimTrace, traceStep() — debugging / profiling

// ── Tier 3 — Internal / kernel API ───────────────────────────────────────────
// Exported for power users and diagnostic tooling.  Not stability-guaranteed;
// may change at any time without a changelog entry.  Prefer Tier 1/2 surfaces
// in production host code.  See STABLE_API.md §Tier 3 for rationale.

export * from "./rng.js";            // makeRng(), eventSeed() — RNG internals
export * from "./dist.js";           // distribution primitives
export * from "./lod.js";            // level-of-detail helpers
export * from "./sim/impairment.js"; // low-level impairment accumulators
export * from "./sim/indexing.js";   // SpatialIndex internals
export * from "./sim/tuning.js";     // kernel tuning constants (may be adjusted)
export * from "./sim/testing.js";    // mkHumanoidEntity() and other test helpers
