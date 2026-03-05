/**
 * Phase 31 — Species & Race System
 *
 * Data-driven species definitions that compose Archetype + BodyPlan + innate traits
 * + capabilities + physiological overrides into a single declarative record.
 *
 * Covers:
 *   Fantasy humanoids  — elf, dwarf, halfling, orc, ogre, goblin, troll (7)
 *   Sci-fi humanoids   — Vulcan, Klingon, Romulan (3)
 *   Mythological       — dragon, centaur, satyr (3)
 *   Fictional          — Heechee (1)
 */

import type { Archetype }            from "./archetypes.js";
import type { IndividualAttributes } from "./types.js";
import type { BodyPlan }             from "./sim/bodyplan.js";
import type { TraitId }              from "./traits.js";
import type { CapabilitySource }     from "./sim/capability.js";
import type { Weapon }               from "./equipment.js";
import type { SkillMap }             from "./sim/skills.js";
import { type Q, q, SCALE, to }      from "./units.js";
import { generateIndividual }        from "./generate.js";
import { applyTraitsToAttributes }   from "./traits.js";
import { HUMANOID_PLAN, AVIAN_PLAN, CENTAUR_PLAN } from "./sim/bodyplan.js";

// ── Types ──────────────────────────────────────────────────────────────────────

/** Runtime metabolic overrides attached to Entity.physiology (Phase 31). */
export interface SpeciesPhysiology {
  /** True = ectotherm; stepCoreTemp is skipped entirely in the kernel. */
  coldBlooded?: boolean;
  /**
   * Multiply the computed BMR before caloric drain.
   * q(1.0) = normal; q(0.70) = slower starvation (e.g. meditative Vulcan);
   * q(1.20) = high metabolism (e.g. aggressive Klingon).
   */
  bmrMultiplier?: Q;
  /**
   * Natural fur / scales / blubber insulation added to the armour insulation sum.
   * Same unit as Armour.insulation_m2KW [m²K/W].
   * Troll hide ≈ 0.08, Dragon scales ≈ 0.05.
   */
  naturalInsulation_m2KW?: number;
}

/**
 * Everything `generateSpeciesIndividual` returns — the caller uses this to
 * assemble a full Entity (set attributes, physiology, bodyPlan, apply traits,
 * attach capabilities, add natural weapons to loadout).
 */
export interface SpeciesEntitySpec {
  attributes:         IndividualAttributes;
  physiology?:        SpeciesPhysiology;
  bodyPlan?:          BodyPlan;
  innateTraits:       TraitId[];
  innateCapabilities: CapabilitySource[];
  naturalWeapons:     Weapon[];
  skillAptitudes?:    SkillMap;
}

/** Declarative species record. */
export interface SpeciesDefinition {
  id:                  string;
  name:                string;
  description:         string;
  archetype:           Archetype;
  bodyPlan?:           BodyPlan;
  innateTraits?:       TraitId[];
  innateCapabilities?: CapabilitySource[];
  naturalWeapons?:     Weapon[];
  physiology?:         SpeciesPhysiology;
  skillAptitudes?:     SkillMap;
  lore?:               string;
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Generate an individual from a species definition using a deterministic seed.
 * Applies innate traits via `applyTraitsToAttributes` (which deep-copies attrs).
 */
export function generateSpeciesIndividual(
  species: SpeciesDefinition,
  seed:    number,
): SpeciesEntitySpec {
  const base  = generateIndividual(seed >>> 0, species.archetype);
  const attrs = species.innateTraits?.length
    ? applyTraitsToAttributes(base, species.innateTraits)
    : base;
  const spec: SpeciesEntitySpec = {
    attributes:         attrs,
    innateTraits:       species.innateTraits       ?? [],
    innateCapabilities: species.innateCapabilities ?? [],
    naturalWeapons:     species.naturalWeapons     ?? [],
  };
  if (species.physiology    !== undefined) spec.physiology    = species.physiology;
  if (species.bodyPlan      !== undefined) spec.bodyPlan      = species.bodyPlan;
  if (species.skillAptitudes !== undefined) spec.skillAptitudes = species.skillAptitudes;
  return spec;
}

// ── Natural weapons ────────────────────────────────────────────────────────────

/** Dragon fore-claw — heavy rending/piercing natural weapon. */
const DRAGON_CLAW: Weapon = {
  id:   "dragon_claw",
  name: "Dragon claw",
  kind: "weapon",
  mass_kg:   to.kg(2.0),
  bulk:      q(0),         // natural weapon — zero carry bulk
  reach_m:   to.m(2.0),
  readyTime_s: to.s(0.5),
  handlingMul: q(1.10),
  strikeEffectiveMassFrac: q(0.28),
  strikeSpeedMul: q(1.30),
  momentArm_m: to.m(0.80),
  handedness: "natural",
  damage: {
    surfaceFrac:    q(0.45),
    internalFrac:   q(0.40),
    structuralFrac: q(0.15),
    bleedFactor:    q(0.90),
    penetrationBias: q(0.65),
  },
};

/** Satyr horn — short horn-thrust natural weapon. */
const SATYR_HORN: Weapon = {
  id:   "satyr_horn",
  name: "Satyr horn",
  kind: "weapon",
  mass_kg:   to.kg(0.30),
  bulk:      q(0),
  reach_m:   to.m(0.28),
  readyTime_s: to.s(0.40),
  handlingMul: q(1.00),
  strikeEffectiveMassFrac: q(0.50),
  strikeSpeedMul: q(0.90),
  momentArm_m: to.m(0.14),
  handedness: "natural",
  damage: {
    surfaceFrac:    q(0.25),
    internalFrac:   q(0.60),
    structuralFrac: q(0.15),
    bleedFactor:    q(0.65),
    penetrationBias: q(0.80),
  },
};

// ── Dragon capabilities ────────────────────────────────────────────────────────

/** Dragon fire breath — 60° forward cone, 1-second sustained burst. */
const DRAGON_FIRE_BREATH_CAP: CapabilitySource = {
  id:           "dragon_fire_breath",
  label:        "Dragon fire breath",
  tags:         ["biological", "fire"],
  reserve_J:    24_000,
  maxReserve_J: 24_000,
  regenModel:   { type: "rest", regenRate_W: 6 },  // slow regen — ~4 000 s to refill
  effects: [{
    id:               "fire_cone",
    castTime_ticks:   0,
    cost_J:           4_000,
    coneHalfAngle_rad: Math.PI / 3,   // 60° half-angle
    coneDir:           "facing",
    sustainedTicks:    20,            // fires for 1 s at 20 Hz
    payload: {
      kind:    "weaponImpact",
      profile: {
        surfaceFrac:    q(0.80),   // mostly surface burns
        internalFrac:   q(0.15),
        structuralFrac: q(0.05),
        bleedFactor:    q(0.05),
        penetrationBias: q(0.05),
      },
      energy_J: 800,
    },
  }],
};

// ── Fantasy humanoids ──────────────────────────────────────────────────────────

/** Elf — graceful, keen-sensed, sylvan endurance. */
export const ELF_SPECIES: SpeciesDefinition = {
  id:          "elf",
  name:        "Elf",
  description: "Tall, slender humanoid with exceptional senses, dexterity, and long lifespan.",
  bodyPlan:    HUMANOID_PLAN,
  physiology:  { bmrMultiplier: q(0.85) as Q },
  archetype: {
    stature_m: to.m(1.85),  mass_kg: to.kg(62),
    visionRange_m: to.m(500), visionArcDeg: 140, hearingRange_m: to.m(80),
    decisionLatency_s: to.s(0.40), attentionDepth: 5, threatHorizon_m: to.m(60),
    statureVar: q(0.06), massVar: q(0.10),
    reachVar: q(0.08), actuatorScaleVar: q(0.14), structureScaleVar: q(0.12),
    actuatorMassFrac: q(0.38), actuatorMassVar: q(0.14),
    peakForce_N: to.N(1600), peakForceVar: q(0.18),
    peakPower_W: to.W(1100), peakPowerVar: q(0.22),
    continuousPower_W: to.W(240), continuousPowerVar: q(0.20),
    reserveEnergy_J: to.J(22_000), reserveEnergyVar: q(0.28),
    conversionEfficiency: q(0.88), efficiencyVar: q(0.08),
    reactionTime_s: to.s(0.17), reactionTimeVar: q(0.20),
    controlQuality: q(0.82), controlVar: q(0.16),
    stability: q(0.72), stabilityVar: q(0.18),
    fineControl: q(0.88), fineControlVar: q(0.14),
    surfaceIntegrity: q(0.95), surfaceVar: q(0.14),
    bulkIntegrity:    q(0.95), bulkVar:    q(0.14),
    structureIntegrity: q(0.95), structVar: q(0.14),
    distressTolerance: q(0.40), distressVar: q(0.28),
    shockTolerance:    q(0.50), shockVar:   q(0.28),
    concussionTolerance: q(0.48), concVar:  q(0.28),
    heatTolerance: q(0.45), heatVar: q(0.28),
    coldTolerance: q(0.70), coldVar: q(0.22),
    fatigueRate: q(0.80), fatigueVar: q(0.20),
    recoveryRate: q(1.10), recoveryVar: q(0.22),
  },
  lore: "Long-lived woodland folk; keen senses and fine motor precision exceed human norms.",
};

/** Dwarf — stocky, dense-boned, underground-adapted. */
export const DWARF_SPECIES: SpeciesDefinition = {
  id:          "dwarf",
  name:        "Dwarf",
  description: "Compact, heavily-built humanoid adapted to subterranean environments.",
  bodyPlan:    HUMANOID_PLAN,
  innateTraits: ["reinforcedStructure"],
  archetype: {
    stature_m: to.m(1.40),  mass_kg: to.kg(78),
    visionRange_m: to.m(100), visionArcDeg: 110, hearingRange_m: to.m(80),
    decisionLatency_s: to.s(0.50), attentionDepth: 4, threatHorizon_m: to.m(30),
    statureVar: q(0.05), massVar: q(0.12),
    reachVar: q(0.08), actuatorScaleVar: q(0.16), structureScaleVar: q(0.12),
    actuatorMassFrac: q(0.45), actuatorMassVar: q(0.16),
    peakForce_N: to.N(2200), peakForceVar: q(0.20),
    peakPower_W: to.W(1300), peakPowerVar: q(0.24),
    continuousPower_W: to.W(260), continuousPowerVar: q(0.22),
    reserveEnergy_J: to.J(22_000), reserveEnergyVar: q(0.28),
    conversionEfficiency: q(0.87), efficiencyVar: q(0.09),
    reactionTime_s: to.s(0.24), reactionTimeVar: q(0.22),
    controlQuality: q(0.76), controlVar: q(0.18),
    stability: q(0.85), stabilityVar: q(0.14),
    fineControl: q(0.74), fineControlVar: q(0.20),
    surfaceIntegrity: q(1.10), surfaceVar: q(0.14),
    bulkIntegrity:    q(1.10), bulkVar:    q(0.14),
    structureIntegrity: q(1.20), structVar: q(0.14),
    distressTolerance: q(0.70), distressVar: q(0.24),
    shockTolerance:    q(0.72), shockVar:   q(0.24),
    concussionTolerance: q(0.68), concVar:  q(0.22),
    heatTolerance: q(0.65), heatVar: q(0.26),
    coldTolerance: q(0.72), coldVar: q(0.22),
    fatigueRate: q(0.92), fatigueVar: q(0.22),
    recoveryRate: q(1.15), recoveryVar: q(0.20),
  },
  lore: "Dense-boned mountain folk; superior structural integrity and acute hearing in tunnels.",
};

/** Halfling — small, nimble, with surprising resilience. */
export const HALFLING_SPECIES: SpeciesDefinition = {
  id:          "halfling",
  name:        "Halfling",
  description: "Small, light-footed humanoid with remarkable balance and composure.",
  bodyPlan:    HUMANOID_PLAN,
  physiology:  { bmrMultiplier: q(1.10) as Q },
  archetype: {
    stature_m: to.m(1.10),  mass_kg: to.kg(35),
    visionRange_m: to.m(150), visionArcDeg: 130, hearingRange_m: to.m(60),
    decisionLatency_s: to.s(0.45), attentionDepth: 4, threatHorizon_m: to.m(35),
    statureVar: q(0.06), massVar: q(0.14),
    reachVar: q(0.10), actuatorScaleVar: q(0.16), structureScaleVar: q(0.14),
    actuatorMassFrac: q(0.40), actuatorMassVar: q(0.18),
    peakForce_N: to.N(900),  peakForceVar: q(0.22),
    peakPower_W: to.W(600),  peakPowerVar: q(0.26),
    continuousPower_W: to.W(140), continuousPowerVar: q(0.24),
    reserveEnergy_J: to.J(14_000), reserveEnergyVar: q(0.30),
    conversionEfficiency: q(0.86), efficiencyVar: q(0.10),
    reactionTime_s: to.s(0.15), reactionTimeVar: q(0.22),
    controlQuality: q(0.80), controlVar: q(0.18),
    stability: q(0.82), stabilityVar: q(0.16),
    fineControl: q(0.80), fineControlVar: q(0.20),
    surfaceIntegrity: q(1.0), surfaceVar: q(0.18),
    bulkIntegrity:    q(1.0), bulkVar:    q(0.18),
    structureIntegrity: q(1.0), structVar: q(0.18),
    distressTolerance: q(0.60), distressVar: q(0.28),
    shockTolerance:    q(0.55), shockVar:   q(0.28),
    concussionTolerance: q(0.52), concVar:  q(0.28),
    heatTolerance: q(0.52), heatVar: q(0.30),
    coldTolerance: q(0.55), coldVar: q(0.28),
    fatigueRate: q(0.88), fatigueVar: q(0.22),
    recoveryRate: q(1.05), recoveryVar: q(0.22),
  },
  lore: "Unassuming but surprisingly tenacious; nimble feet give exceptional balance.",
};

/** Orc — powerful, pain-ignorant, high metabolic rate. */
export const ORC_SPECIES: SpeciesDefinition = {
  id:          "orc",
  name:        "Orc",
  description: "Heavily-muscled, aggressive humanoid with a high pain threshold.",
  bodyPlan:    HUMANOID_PLAN,
  physiology:  { bmrMultiplier: q(1.15) as Q },
  archetype: {
    stature_m: to.m(1.95),  mass_kg: to.kg(105),
    visionRange_m: to.m(150), visionArcDeg: 120, hearingRange_m: to.m(50),
    decisionLatency_s: to.s(0.55), attentionDepth: 3, threatHorizon_m: to.m(35),
    statureVar: q(0.08), massVar: q(0.16),
    reachVar: q(0.10), actuatorScaleVar: q(0.18), structureScaleVar: q(0.16),
    actuatorMassFrac: q(0.46), actuatorMassVar: q(0.18),
    peakForce_N: to.N(2600), peakForceVar: q(0.22),
    peakPower_W: to.W(1600), peakPowerVar: q(0.26),
    continuousPower_W: to.W(300), continuousPowerVar: q(0.24),
    reserveEnergy_J: to.J(26_000), reserveEnergyVar: q(0.30),
    conversionEfficiency: q(0.85), efficiencyVar: q(0.10),
    reactionTime_s: to.s(0.24), reactionTimeVar: q(0.24),
    controlQuality: q(0.72), controlVar: q(0.20),
    stability: q(0.74), stabilityVar: q(0.20),
    fineControl: q(0.62), fineControlVar: q(0.24),
    surfaceIntegrity: q(1.05), surfaceVar: q(0.16),
    bulkIntegrity:    q(1.05), bulkVar:    q(0.16),
    structureIntegrity: q(1.05), structVar: q(0.16),
    distressTolerance: q(0.80), distressVar: q(0.22),
    shockTolerance:    q(0.75), shockVar:   q(0.22),
    concussionTolerance: q(0.60), concVar:  q(0.24),
    heatTolerance: q(0.55), heatVar: q(0.28),
    coldTolerance: q(0.52), coldVar: q(0.28),
    fatigueRate: q(1.10), fatigueVar: q(0.22),
    recoveryRate: q(1.00), recoveryVar: q(0.22),
  },
  lore: "High aggression correlates with high metabolic drain; remarkable pain tolerance.",
};

/** Ogre — massive, brutish, very slow decision-making. */
export const OGRE_SPECIES: SpeciesDefinition = {
  id:          "ogre",
  name:        "Ogre",
  description: "Giant humanoid with immense strength but poor coordination and slow cognition.",
  bodyPlan:    HUMANOID_PLAN,
  archetype: {
    stature_m: to.m(2.90),  mass_kg: to.kg(320),
    visionRange_m: to.m(120), visionArcDeg: 120, hearingRange_m: to.m(40),
    decisionLatency_s: to.s(1.0), attentionDepth: 2, threatHorizon_m: to.m(30),
    statureVar: q(0.10), massVar: q(0.20),
    reachVar: q(0.12), actuatorScaleVar: q(0.20), structureScaleVar: q(0.18),
    actuatorMassFrac: q(0.44), actuatorMassVar: q(0.20),
    peakForce_N: to.N(6000), peakForceVar: q(0.24),
    peakPower_W: to.W(3000), peakPowerVar: q(0.28),
    continuousPower_W: to.W(500), continuousPowerVar: q(0.26),
    reserveEnergy_J: to.J(50_000), reserveEnergyVar: q(0.30),
    conversionEfficiency: q(0.82), efficiencyVar: q(0.12),
    reactionTime_s: to.s(0.45), reactionTimeVar: q(0.28),
    controlQuality: q(0.55), controlVar: q(0.24),
    stability: q(0.78), stabilityVar: q(0.22),
    fineControl: q(0.45), fineControlVar: q(0.28),
    surfaceIntegrity: q(1.10), surfaceVar: q(0.18),
    bulkIntegrity:    q(1.10), bulkVar:    q(0.18),
    structureIntegrity: q(1.20), structVar: q(0.18),
    distressTolerance: q(0.75), distressVar: q(0.24),
    shockTolerance:    q(0.78), shockVar:   q(0.24),
    concussionTolerance: q(0.65), concVar:  q(0.26),
    heatTolerance: q(0.60), heatVar: q(0.28),
    coldTolerance: q(0.62), coldVar: q(0.28),
    fatigueRate: q(1.05), fatigueVar: q(0.24),
    recoveryRate: q(0.95), recoveryVar: q(0.24),
  },
  lore: "Raw power constrained by poor fine motor skill and sluggish cognition.",
};

/** Goblin — small, cowardly, extremely fast reactions. */
export const GOBLIN_SPECIES: SpeciesDefinition = {
  id:          "goblin",
  name:        "Goblin",
  description: "Small, scrappy humanoid with the fastest reflexes of any humanoid species.",
  bodyPlan:    HUMANOID_PLAN,
  archetype: {
    stature_m: to.m(1.20),  mass_kg: to.kg(28),
    visionRange_m: to.m(120), visionArcDeg: 130, hearingRange_m: to.m(55),
    decisionLatency_s: to.s(0.35), attentionDepth: 4, threatHorizon_m: to.m(30),
    statureVar: q(0.08), massVar: q(0.16),
    reachVar: q(0.10), actuatorScaleVar: q(0.18), structureScaleVar: q(0.16),
    actuatorMassFrac: q(0.40), actuatorMassVar: q(0.18),
    peakForce_N: to.N(700),  peakForceVar: q(0.24),
    peakPower_W: to.W(450),  peakPowerVar: q(0.28),
    continuousPower_W: to.W(110), continuousPowerVar: q(0.26),
    reserveEnergy_J: to.J(10_000), reserveEnergyVar: q(0.30),
    conversionEfficiency: q(0.84), efficiencyVar: q(0.12),
    reactionTime_s: to.s(0.13), reactionTimeVar: q(0.22),
    controlQuality: q(0.68), controlVar: q(0.22),
    stability: q(0.60), stabilityVar: q(0.22),
    fineControl: q(0.72), fineControlVar: q(0.24),
    surfaceIntegrity: q(0.85), surfaceVar: q(0.20),
    bulkIntegrity:    q(0.85), bulkVar:    q(0.20),
    structureIntegrity: q(0.85), structVar: q(0.20),
    distressTolerance: q(0.25), distressVar: q(0.30),
    shockTolerance:    q(0.30), shockVar:   q(0.30),
    concussionTolerance: q(0.38), concVar:  q(0.30),
    heatTolerance: q(0.45), heatVar: q(0.30),
    coldTolerance: q(0.45), coldVar: q(0.30),
    fatigueRate: q(1.05), fatigueVar: q(0.24),
    recoveryRate: q(0.95), recoveryVar: q(0.24),
  },
  lore: "Survival instinct manifests as extreme flight reflex; low pain threshold accelerates retreat.",
};

/** Troll — massive regenerator, devastatingly vulnerable to fire. */
export const TROLL_SPECIES: SpeciesDefinition = {
  id:          "troll",
  name:        "Troll",
  description: "Large, fast-regenerating humanoid with thick hide — but fire halts healing entirely.",
  bodyPlan:    HUMANOID_PLAN,
  innateTraits: ["reinforcedStructure"],
  physiology:  {
    naturalInsulation_m2KW: 0.08,  // thick hide — cold-adapted
  },
  archetype: {
    stature_m: to.m(2.50),  mass_kg: to.kg(180),
    visionRange_m: to.m(100), visionArcDeg: 120, hearingRange_m: to.m(55),
    decisionLatency_s: to.s(0.65), attentionDepth: 3, threatHorizon_m: to.m(30),
    statureVar: q(0.10), massVar: q(0.18),
    reachVar: q(0.12), actuatorScaleVar: q(0.20), structureScaleVar: q(0.18),
    actuatorMassFrac: q(0.44), actuatorMassVar: q(0.20),
    peakForce_N: to.N(5000), peakForceVar: q(0.24),
    peakPower_W: to.W(2500), peakPowerVar: q(0.28),
    continuousPower_W: to.W(400), continuousPowerVar: q(0.26),
    reserveEnergy_J: to.J(40_000), reserveEnergyVar: q(0.30),
    conversionEfficiency: q(0.84), efficiencyVar: q(0.12),
    reactionTime_s: to.s(0.35), reactionTimeVar: q(0.26),
    controlQuality: q(0.65), controlVar: q(0.22),
    stability: q(0.80), stabilityVar: q(0.20),
    fineControl: q(0.42), fineControlVar: q(0.28),
    surfaceIntegrity: q(1.15), surfaceVar: q(0.16),
    bulkIntegrity:    q(1.15), bulkVar:    q(0.16),
    structureIntegrity: q(1.20), structVar: q(0.16),
    distressTolerance: q(0.70), distressVar: q(0.24),
    shockTolerance:    q(0.72), shockVar:   q(0.24),
    concussionTolerance: q(0.60), concVar:  q(0.26),
    heatTolerance: q(0.15), heatVar: q(0.20),   // catastrophically fire-vulnerable
    coldTolerance: q(0.80), coldVar: q(0.18),
    fatigueRate: q(1.00), fatigueVar: q(0.22),
    recoveryRate: q(2.00), recoveryVar: q(0.20),  // rapid regeneration
  },
  lore: "Legendary regeneration is suppressed by fire damage — the classical trollslayer strategy.",
};

// ── Sci-fi humanoids ───────────────────────────────────────────────────────────

/** Vulcan — disciplined, strong, meditative metabolism; very low individual variance. */
export const VULCAN_SPECIES: SpeciesDefinition = {
  id:          "vulcan",
  name:        "Vulcan",
  description: "Logically disciplined desert humanoid with exceptional strength and pain mastery.",
  bodyPlan:    HUMANOID_PLAN,
  physiology:  { bmrMultiplier: q(0.72) as Q },  // meditative metabolism — slow starvation
  archetype: {
    stature_m: to.m(1.85),  mass_kg: to.kg(85),
    visionRange_m: to.m(250), visionArcDeg: 120, hearingRange_m: to.m(60),
    decisionLatency_s: to.s(0.35), attentionDepth: 5, threatHorizon_m: to.m(50),
    statureVar: q(0.04), massVar: q(0.06),   // uniform society — low variance
    reachVar: q(0.05), actuatorScaleVar: q(0.08), structureScaleVar: q(0.07),
    actuatorMassFrac: q(0.44), actuatorMassVar: q(0.08),
    peakForce_N: to.N(2800), peakForceVar: q(0.08),
    peakPower_W: to.W(1400), peakPowerVar: q(0.10),
    continuousPower_W: to.W(280), continuousPowerVar: q(0.10),
    reserveEnergy_J: to.J(28_000), reserveEnergyVar: q(0.12),
    conversionEfficiency: q(0.90), efficiencyVar: q(0.05),
    reactionTime_s: to.s(0.16), reactionTimeVar: q(0.10),
    controlQuality: q(0.85), controlVar: q(0.08),
    stability: q(0.80), stabilityVar: q(0.10),
    fineControl: q(0.88), fineControlVar: q(0.08),
    surfaceIntegrity: q(1.05), surfaceVar: q(0.08),
    bulkIntegrity:    q(1.05), bulkVar:    q(0.08),
    structureIntegrity: q(1.05), structVar: q(0.08),
    distressTolerance: q(0.90), distressVar: q(0.08),  // Vulcan pain suppression
    shockTolerance:    q(0.75), shockVar:   q(0.10),
    concussionTolerance: q(0.62), concVar:  q(0.10),
    heatTolerance: q(0.70), heatVar: q(0.12),  // desert-origin heat adaptation
    coldTolerance: q(0.75), coldVar: q(0.12),
    fatigueRate: q(0.85), fatigueVar: q(0.08),
    recoveryRate: q(1.10), recoveryVar: q(0.08),
  },
  lore: "Meditative disciplines reduce basal metabolic demand and suppress pain response.",
};

/** Klingon — aggressive warrior with redundant organs and thick cranial ridges. */
export const KLINGON_SPECIES: SpeciesDefinition = {
  id:          "klingon",
  name:        "Klingon",
  description: "Warrior humanoid with redundant organ systems and exceptional shock tolerance.",
  bodyPlan:    HUMANOID_PLAN,
  physiology:  { bmrMultiplier: q(1.20) as Q },  // high-aggression metabolism
  archetype: {
    stature_m: to.m(1.90),  mass_kg: to.kg(95),
    visionRange_m: to.m(200), visionArcDeg: 120, hearingRange_m: to.m(50),
    decisionLatency_s: to.s(0.50), attentionDepth: 4, threatHorizon_m: to.m(40),
    statureVar: q(0.07), massVar: q(0.14),
    reachVar: q(0.08), actuatorScaleVar: q(0.16), structureScaleVar: q(0.14),
    actuatorMassFrac: q(0.46), actuatorMassVar: q(0.16),
    peakForce_N: to.N(2400), peakForceVar: q(0.20),
    peakPower_W: to.W(1500), peakPowerVar: q(0.24),
    continuousPower_W: to.W(300), continuousPowerVar: q(0.22),
    reserveEnergy_J: to.J(30_000), reserveEnergyVar: q(0.26),
    conversionEfficiency: q(0.87), efficiencyVar: q(0.09),
    reactionTime_s: to.s(0.20), reactionTimeVar: q(0.20),
    controlQuality: q(0.78), controlVar: q(0.18),
    stability: q(0.78), stabilityVar: q(0.18),
    fineControl: q(0.74), fineControlVar: q(0.20),
    surfaceIntegrity: q(1.25), surfaceVar: q(0.12),  // cranial ridges, thick skin
    bulkIntegrity:    q(1.10), bulkVar:    q(0.14),
    structureIntegrity: q(1.10), structVar: q(0.14),
    distressTolerance: q(0.85), distressVar: q(0.16),
    shockTolerance:    q(0.88), shockVar:   q(0.14),  // redundant organs (brak'lul)
    concussionTolerance: q(0.72), concVar:  q(0.18),  // thick forehead ridges
    heatTolerance: q(0.60), heatVar: q(0.24),
    coldTolerance: q(0.60), coldVar: q(0.24),
    fatigueRate: q(1.05), fatigueVar: q(0.20),
    recoveryRate: q(1.20), recoveryVar: q(0.18),
  },
  lore: "Redundant cardiovascular and digestive systems (brak'lul) provide extreme shock resilience.",
};

/** Romulan — disciplined but more emotionally variable than Vulcans. */
export const ROMULAN_SPECIES: SpeciesDefinition = {
  id:          "romulan",
  name:        "Romulan",
  description: "Cunning, disciplined humanoid sharing Vulcan physiology but greater emotional range.",
  bodyPlan:    HUMANOID_PLAN,
  physiology:  { bmrMultiplier: q(0.85) as Q },
  archetype: {
    stature_m: to.m(1.80),  mass_kg: to.kg(80),
    visionRange_m: to.m(220), visionArcDeg: 120, hearingRange_m: to.m(55),
    decisionLatency_s: to.s(0.40), attentionDepth: 5, threatHorizon_m: to.m(45),
    statureVar: q(0.06), massVar: q(0.12),
    reachVar: q(0.07), actuatorScaleVar: q(0.14), structureScaleVar: q(0.12),
    actuatorMassFrac: q(0.43), actuatorMassVar: q(0.14),
    peakForce_N: to.N(2200), peakForceVar: q(0.16),
    peakPower_W: to.W(1300), peakPowerVar: q(0.20),
    continuousPower_W: to.W(270), continuousPowerVar: q(0.18),
    reserveEnergy_J: to.J(26_000), reserveEnergyVar: q(0.22),
    conversionEfficiency: q(0.89), efficiencyVar: q(0.07),
    reactionTime_s: to.s(0.19), reactionTimeVar: q(0.18),
    controlQuality: q(0.82), controlVar: q(0.15),
    stability: q(0.78), stabilityVar: q(0.16),
    fineControl: q(0.82), fineControlVar: q(0.16),
    surfaceIntegrity: q(1.02), surfaceVar: q(0.12),
    bulkIntegrity:    q(1.02), bulkVar:    q(0.12),
    structureIntegrity: q(1.02), structVar: q(0.12),
    distressTolerance: q(0.70), distressVar: q(0.20),
    shockTolerance:    q(0.68), shockVar:   q(0.20),
    concussionTolerance: q(0.58), concVar:  q(0.22),
    heatTolerance: q(0.65), heatVar: q(0.22),
    coldTolerance: q(0.68), coldVar: q(0.22),
    fatigueRate: q(0.88), fatigueVar: q(0.16),
    recoveryRate: q(1.08), recoveryVar: q(0.16),
  },
  lore: "Shared ancestry with Vulcans produces similar physical capability; emotional volatility creates wider variance.",
};

// ── Mythological ───────────────────────────────────────────────────────────────

/** Dragon — immense fire-breathing reptilian with scales and flight capability. */
export const DRAGON_SPECIES: SpeciesDefinition = {
  id:          "dragon",
  name:        "Dragon",
  description: "Massive scaled flier with natural armour, devastating fire breath, and powerful claws.",
  bodyPlan:    AVIAN_PLAN,
  innateCapabilities: [DRAGON_FIRE_BREATH_CAP],
  naturalWeapons: [DRAGON_CLAW],
  physiology: {
    naturalInsulation_m2KW: 0.05,  // dense scales
  },
  archetype: {
    stature_m: to.m(5.00),  mass_kg: to.kg(2000),
    visionRange_m: to.m(1000), visionArcDeg: 180, hearingRange_m: to.m(200),
    decisionLatency_s: to.s(0.40), attentionDepth: 6, threatHorizon_m: to.m(200),
    statureVar: q(0.12), massVar: q(0.20),
    reachVar: q(0.10), actuatorScaleVar: q(0.18), structureScaleVar: q(0.16),
    actuatorMassFrac: q(0.42), actuatorMassVar: q(0.18),
    peakForce_N: to.N(50000), peakForceVar: q(0.22),
    peakPower_W: to.W(40000), peakPowerVar: q(0.26),
    continuousPower_W: to.W(8000), continuousPowerVar: q(0.24),
    reserveEnergy_J: to.J(400_000), reserveEnergyVar: q(0.28),
    conversionEfficiency: q(0.85), efficiencyVar: q(0.10),
    reactionTime_s: to.s(0.22), reactionTimeVar: q(0.20),
    controlQuality: q(0.75), controlVar: q(0.18),
    stability: q(0.88), stabilityVar: q(0.14),
    fineControl: q(0.68), fineControlVar: q(0.22),
    surfaceIntegrity: q(2.00), surfaceVar: q(0.14),    // dragon scales
    bulkIntegrity:    q(1.60), bulkVar:    q(0.14),
    structureIntegrity: q(1.80), structVar: q(0.14),
    distressTolerance: q(0.82), distressVar: q(0.18),
    shockTolerance:    q(0.80), shockVar:   q(0.18),
    concussionTolerance: q(0.85), concVar:  q(0.16),
    heatTolerance: q(0.95), heatVar: q(0.06),  // fire-producing endotherm
    coldTolerance: q(0.60), coldVar: q(0.22),
    fatigueRate: q(0.90), fatigueVar: q(0.20),
    recoveryRate: q(1.30), recoveryVar: q(0.20),
  },
  lore: "An apex predator. Fire breath is a biological weapon; scales provide armour equivalent to plate.",
};

/** Centaur — horse body with human torso; CENTAUR_PLAN anatomy. */
export const CENTAUR_SPECIES: SpeciesDefinition = {
  id:          "centaur",
  name:        "Centaur",
  description: "Horse-bodied humanoid with equine lower body and human upper torso.",
  bodyPlan:    CENTAUR_PLAN,
  archetype: {
    stature_m: to.m(2.20),  mass_kg: to.kg(350),
    visionRange_m: to.m(300), visionArcDeg: 150, hearingRange_m: to.m(80),
    decisionLatency_s: to.s(0.45), attentionDepth: 4, threatHorizon_m: to.m(60),
    statureVar: q(0.08), massVar: q(0.16),
    reachVar: q(0.08), actuatorScaleVar: q(0.18), structureScaleVar: q(0.16),
    actuatorMassFrac: q(0.42), actuatorMassVar: q(0.18),
    peakForce_N: to.N(8000), peakForceVar: q(0.22),
    peakPower_W: to.W(3500), peakPowerVar: q(0.26),
    continuousPower_W: to.W(1000), continuousPowerVar: q(0.22),
    reserveEnergy_J: to.J(80_000), reserveEnergyVar: q(0.28),
    conversionEfficiency: q(0.88), efficiencyVar: q(0.09),
    reactionTime_s: to.s(0.22), reactionTimeVar: q(0.22),
    controlQuality: q(0.78), controlVar: q(0.18),
    stability: q(0.88), stabilityVar: q(0.14),  // four-legged stability
    fineControl: q(0.74), fineControlVar: q(0.20),
    surfaceIntegrity: q(1.10), surfaceVar: q(0.16),
    bulkIntegrity:    q(1.10), bulkVar:    q(0.16),
    structureIntegrity: q(1.15), structVar: q(0.16),
    distressTolerance: q(0.65), distressVar: q(0.24),
    shockTolerance:    q(0.68), shockVar:   q(0.24),
    concussionTolerance: q(0.55), concVar:  q(0.26),
    heatTolerance: q(0.55), heatVar: q(0.28),
    coldTolerance: q(0.65), coldVar: q(0.24),
    fatigueRate: q(0.88), fatigueVar: q(0.22),
    recoveryRate: q(1.05), recoveryVar: q(0.22),
  },
  lore: "Equine lower body grants exceptional speed and endurance; combat reach advantage from height.",
};

/** Satyr — goat-human hybrid with natural horn and extraordinary balance. */
export const SATYR_SPECIES: SpeciesDefinition = {
  id:          "satyr",
  name:        "Satyr",
  description: "Goat-legged humanoid with a natural horn attack and excellent rough-terrain balance.",
  bodyPlan:    HUMANOID_PLAN,
  naturalWeapons: [SATYR_HORN],
  archetype: {
    stature_m: to.m(1.55),  mass_kg: to.kg(70),
    visionRange_m: to.m(180), visionArcDeg: 150, hearingRange_m: to.m(70),
    decisionLatency_s: to.s(0.45), attentionDepth: 4, threatHorizon_m: to.m(40),
    statureVar: q(0.07), massVar: q(0.14),
    reachVar: q(0.10), actuatorScaleVar: q(0.18), structureScaleVar: q(0.16),
    actuatorMassFrac: q(0.42), actuatorMassVar: q(0.18),
    peakForce_N: to.N(1600), peakForceVar: q(0.22),
    peakPower_W: to.W(1100), peakPowerVar: q(0.26),
    continuousPower_W: to.W(240), continuousPowerVar: q(0.24),
    reserveEnergy_J: to.J(22_000), reserveEnergyVar: q(0.30),
    conversionEfficiency: q(0.88), efficiencyVar: q(0.10),
    reactionTime_s: to.s(0.19), reactionTimeVar: q(0.22),
    controlQuality: q(0.80), controlVar: q(0.18),
    stability: q(0.88), stabilityVar: q(0.14),  // goat-footing balance
    fineControl: q(0.72), fineControlVar: q(0.22),
    surfaceIntegrity: q(1.0), surfaceVar: q(0.18),
    bulkIntegrity:    q(1.0), bulkVar:    q(0.18),
    structureIntegrity: q(1.0), structVar: q(0.18),
    distressTolerance: q(0.55), distressVar: q(0.28),
    shockTolerance:    q(0.55), shockVar:   q(0.28),
    concussionTolerance: q(0.52), concVar:  q(0.28),
    heatTolerance: q(0.55), heatVar: q(0.28),
    coldTolerance: q(0.58), coldVar: q(0.28),
    fatigueRate: q(0.72), fatigueVar: q(0.22),  // vigorous constitution
    recoveryRate: q(1.10), recoveryVar: q(0.22),
  },
  lore: "Goat hooves provide unmatched balance on rough terrain; horn delivers surprising impact force.",
};

// ── Fictional ──────────────────────────────────────────────────────────────────

/**
 * Heechee — Fred Pohl's Gateway aliens.
 * Thin, soft-bodied, technologically advanced; fragile but extraordinarily precise.
 */
export const HEECHEE_SPECIES: SpeciesDefinition = {
  id:          "heechee",
  name:        "Heechee",
  description: "Slender, soft-bodied alien with exceptional fine motor precision and large sensory organs.",
  bodyPlan:    HUMANOID_PLAN,
  innateTraits: ["fragileStructure"],
  physiology:  { bmrMultiplier: q(0.90) as Q },
  archetype: {
    stature_m: to.m(1.60),  mass_kg: to.kg(50),
    visionRange_m: to.m(280), visionArcDeg: 160, hearingRange_m: to.m(90),
    decisionLatency_s: to.s(0.35), attentionDepth: 6, threatHorizon_m: to.m(55),
    statureVar: q(0.06), massVar: q(0.12),
    reachVar: q(0.08), actuatorScaleVar: q(0.14), structureScaleVar: q(0.12),
    actuatorMassFrac: q(0.36), actuatorMassVar: q(0.14),
    peakForce_N: to.N(900),  peakForceVar: q(0.20),
    peakPower_W: to.W(500),  peakPowerVar: q(0.24),
    continuousPower_W: to.W(120), continuousPowerVar: q(0.22),
    reserveEnergy_J: to.J(14_000), reserveEnergyVar: q(0.28),
    conversionEfficiency: q(0.85), efficiencyVar: q(0.10),
    reactionTime_s: to.s(0.18), reactionTimeVar: q(0.20),
    controlQuality: q(0.88), controlVar: q(0.14),
    stability: q(0.68), stabilityVar: q(0.20),
    fineControl: q(0.92), fineControlVar: q(0.10),  // exceptional precision
    surfaceIntegrity: q(0.60), surfaceVar: q(0.18),  // soft body
    bulkIntegrity:    q(0.65), bulkVar:    q(0.18),
    structureIntegrity: q(0.55), structVar: q(0.16),  // minimal skeletal density
    distressTolerance: q(0.42), distressVar: q(0.28),
    shockTolerance:    q(0.45), shockVar:   q(0.28),
    concussionTolerance: q(0.48), concVar:  q(0.28),
    heatTolerance: q(0.48), heatVar: q(0.28),
    coldTolerance: q(0.52), coldVar: q(0.28),
    fatigueRate: q(0.95), fatigueVar: q(0.22),
    recoveryRate: q(0.90), recoveryVar: q(0.22),
  },
  lore: "Evolved for technological manipulation, not combat; their engineering precision is unmatched.",
};

// ── Collections ────────────────────────────────────────────────────────────────

export const FANTASY_HUMANOID_SPECIES: readonly SpeciesDefinition[] = [
  ELF_SPECIES, DWARF_SPECIES, HALFLING_SPECIES, ORC_SPECIES,
  OGRE_SPECIES, GOBLIN_SPECIES, TROLL_SPECIES,
];

export const SCIFI_HUMANOID_SPECIES: readonly SpeciesDefinition[] = [
  VULCAN_SPECIES, KLINGON_SPECIES, ROMULAN_SPECIES,
];

export const MYTHOLOGICAL_SPECIES: readonly SpeciesDefinition[] = [
  DRAGON_SPECIES, CENTAUR_SPECIES, SATYR_SPECIES,
];

export const FICTIONAL_SPECIES: readonly SpeciesDefinition[] = [
  HEECHEE_SPECIES,
];

export const ALL_SPECIES: readonly SpeciesDefinition[] = [
  ...FANTASY_HUMANOID_SPECIES,
  ...SCIFI_HUMANOID_SPECIES,
  ...MYTHOLOGICAL_SPECIES,
  ...FICTIONAL_SPECIES,
];
