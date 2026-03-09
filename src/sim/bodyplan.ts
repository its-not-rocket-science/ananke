// src/sim/bodyplan.ts — Phase 8: Universal Body and Species System
//
// Body plans are data files. Adding a new species requires authoring a BodyPlan
// and an Archetype baseline; the simulation kernel does not need modification.
//
// The `id` of each BodySegment becomes the key in InjuryState.byRegion.

import type { Q, I32 } from "../units.js";
import { q } from "../units.js";
import { DamageChannel } from "../channels.js";
import { SegmentCoverageProfile } from "../anatomy/anatomy-contracts.js";

// ─── locomotion and CNS models ────────────────────────────────────────────────

export interface LocomotionModel {
  /** Primary locomotion mechanism. */
  type: "biped" | "quadruped" | "hexapod" | "undulation" | "flight" | "distributed";

  /**
   * Phase 8B: flight capability.  Present only for winged body plans.
   * Wings are segments; liftCapacity_kg is the total mass the creature can sustain aloft.
   */
  flight?: {
    /** Segment IDs used for lift (must match BodySegment.id values in the same plan). */
    wingSegments: string[];
    /** Maximum liftable mass (SCALE.kg units; e.g. 3000 = 3 kg). */
    liftCapacity_kg: I32;
    /** Energy cost multiplier relative to ground movement (Q; q(2.0) = double cost). */
    flightStaminaCost: Q;
    /** Mobility reduction per unit of average wing structural damage (Q multiplier). */
    wingDamagePenalty: Q;
  };
}

export interface CNSLayout {
  /** Whether the nervous system is concentrated or spread through the body. */
  type: "centralized" | "distributed";
}

// ─── segment ─────────────────────────────────────────────────────────────────

/**
 * One functional segment in a body plan.
 * The `id` is also the key in InjuryState.byRegion.
 */
export interface BodySegment {
  /** Unique within the plan; used as the injury region key. */
  id: string;
  /** Parent segment id (for anatomical hierarchy); null for the root segment. */
  parent: string | null;
  /** Mass in fixed-point kg units (SCALE.kg = 1000, so 5 kg = 5000). */
  mass_kg: I32;
  /**
   * Hit probability weight per damage channel (Q, 0..SCALE.Q).
   * Omitted channels fall back to the Kinetic weight.
   * The kinetic weights should sum to approximately SCALE.Q across all segments.
   */
  exposureWeight: Partial<Record<DamageChannel, Q>>;
  /** Contribution to locomotion capability. */
  locomotionRole?: "primary" | "secondary" | "none";
  /** Contribution to manipulation capability. */
  manipulationRole?: "primary" | "secondary" | "none";
  /** Central nervous system contribution. */
  cnsRole?: "central" | "ganglionic" | "none";

  tags?: string[];

  // ── Phase 8B: exoskeleton biology ─────────────────────────────────────────

  /** Structural biology of this segment.  Absent = endoskeleton default. */
  structureType?: "endoskeleton" | "exoskeleton" | "hydrostatic" | "gelatinous";

  /**
   * For exoskeletons: structural damage level (Q) at which the shell is breached.
   * Below breach: all incoming damage routes to structuralDamage only.
   * At or above breach: normal surface / internal / structural split applies.
   */
  breachThreshold?: Q;

  /**
   * Fluid transport system type.
   * "open" = arthropod hemolymph; "closed" = vertebrate blood; "none" = dry.
   */
  fluidSystem?: "closed" | "open" | "none";

  /**
   * Hemolymph loss rate (Q) per tick when an open-fluid segment is breached.
   * Feeds InjuryState.hemolymphLoss (parallel to the vertebrate fluidLoss model).
   */
  hemolymphLossRate?: Q;

  /**
   * Is this segment a joint (articulation between hardened plates)?
   * Joints take extra structural damage from kinetic impacts.
   */
  isJoint?: boolean;

  /**
   * Structural damage multiplier applied to strInc when isJoint = true.
   * e.g. q(1.5) = joints take 50% more structural damage than adjacent plates.
   */
  jointDamageMultiplier?: Q;

  /**
   * Can this segment regenerate structural integrity via a molt event?
   * When true, completing a molt cycle reduces structuralDamage by q(0.10).
   */
  regeneratesViaMolting?: boolean;

  // ── Phase 8C: exoskeleton-specific armor ──────────────────────────────────

  /**
   * Intrinsic structural armor resist (joules) — energy absorbed by the shell
   * before damage channels are allocated.  Distinct from worn equipment armour.
   * Absent or 0 = no intrinsic resistance.
   */
  intrinsicArmor_J?: number;
}

export type BodySegmentId = BodySegment["id"];

// ─── body plan ───────────────────────────────────────────────────────────────

export interface BodyPlan {
  id: string;
  segments: BodySegment[];
  locomotion: LocomotionModel;
  cnsLayout: CNSLayout;
  coverageProfiles?: readonly SegmentCoverageProfile[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Get the exposure weight for a segment on a given damage channel.
 * Falls back to the kinetic weight when the channel is not explicitly specified.
 */
export function getExposureWeight(seg: BodySegment, channel: DamageChannel): Q {
  return seg.exposureWeight[channel] ?? seg.exposureWeight[DamageChannel.Kinetic] ?? q(0);
}

/**
 * Resolve which segment is struck, given a uniform [0, SCALE.Q) random value.
 * Uses kinetic exposure weights for physical-impact hits.
 */
export function resolveHitSegment(plan: BodyPlan, r01: Q): BodySegmentId {
  let cum = 0;
  for (const seg of plan.segments) {
    cum += seg.exposureWeight[DamageChannel.Kinetic] ?? 0;
    if (r01 < cum) return seg.id;
  }
  // Fallback: last segment (handles rounding)
  return plan.segments[plan.segments.length - 1]!.id;
}

/** Return all segment ids from a body plan. */
export function segmentIds(plan: BodyPlan): readonly string[] {
  return plan.segments.map(s => s.id);
}

// ─── body plan data ───────────────────────────────────────────────────────────
//
// Kinetic exposure weights sum to exactly 10000 (SCALE.Q) per plan.
// Other channels are specified where they differ meaningfully; otherwise
// they fall back to the kinetic weight via getExposureWeight().

/**
 * Standard humanoid (human, elf, robot):
 * bilateral upright, 4 limbs, centralized CNS.
 */
export const HUMANOID_PLAN: BodyPlan = {
  id: "humanoid",
  locomotion: { type: "biped" },
  cnsLayout: { type: "centralized" },
  segments: [
    {
      id: "head",
      parent: null,
      mass_kg: 5000 as I32,
      exposureWeight: {
        [DamageChannel.Kinetic]:    q(0.12),
        [DamageChannel.Thermal]:    q(0.18),
        [DamageChannel.Electrical]: q(0.10),
        [DamageChannel.Radiation]:  q(0.12),
        [DamageChannel.Chemical]:   q(0.16),
      },
      cnsRole: "central",
      tags: ["head", "shield-small-cover"],
    },
    {
      id: "torso",
      parent: null,
      mass_kg: 35000 as I32,
      exposureWeight: {
        [DamageChannel.Kinetic]:    q(0.50),
        [DamageChannel.Thermal]:    q(0.28),
        [DamageChannel.Electrical]: q(0.22),
        [DamageChannel.Radiation]:  q(0.52),
        [DamageChannel.Chemical]:   q(0.36),
      },
      cnsRole: "ganglionic",
      tags: ["torso", "shield-small-cover"],
    },
    {
      id: "leftArm",
      parent: "torso",
      mass_kg: 4000 as I32,
      exposureWeight: {
        [DamageChannel.Kinetic]:    q(0.095),
        [DamageChannel.Thermal]:    q(0.14),
        [DamageChannel.Electrical]: q(0.22),
        [DamageChannel.Radiation]:  q(0.09),
        [DamageChannel.Chemical]:   q(0.12),
      },
      manipulationRole: "primary",
      tags: ["arm", "shield-small-cover"],
    },
    {
      id: "rightArm",
      parent: "torso",
      mass_kg: 4000 as I32,
      exposureWeight: {
        [DamageChannel.Kinetic]:    q(0.095),
        [DamageChannel.Thermal]:    q(0.14),
        [DamageChannel.Electrical]: q(0.22),
        [DamageChannel.Radiation]:  q(0.09),
        [DamageChannel.Chemical]:   q(0.12),
      },
      manipulationRole: "primary",
      tags: ["arm", "shield-small-cover"],
    },
    {
      id: "leftLeg",
      parent: "torso",
      mass_kg: 10000 as I32,
      exposureWeight: {
        [DamageChannel.Kinetic]:    q(0.095),
        [DamageChannel.Thermal]:    q(0.13),
        [DamageChannel.Electrical]: q(0.12),
        [DamageChannel.Radiation]:  q(0.09),
        [DamageChannel.Chemical]:   q(0.12),
      },
      locomotionRole: "primary",
      tags: ["leg"],
    },
    {
      id: "rightLeg",
      parent: "torso",
      mass_kg: 10000 as I32,
      exposureWeight: {
        [DamageChannel.Kinetic]:    q(0.095),
        [DamageChannel.Thermal]:    q(0.13),
        [DamageChannel.Electrical]: q(0.12),
        [DamageChannel.Radiation]:  q(0.09),
        [DamageChannel.Chemical]:   q(0.12),
      },
      locomotionRole: "primary",
      tags: ["leg"],
    },
  ],
};

/**
 * Quadruped (dog, horse, bear):
 * 4 locomotion limbs, lower centre of gravity, no dedicated manipulation.
 */
export const QUADRUPED_PLAN: BodyPlan = {
  id: "quadruped",
  locomotion: { type: "quadruped" },
  cnsLayout: { type: "centralized" },
  segments: [
    {
      id: "head",
      parent: null,
      mass_kg: 4000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.10) },
      cnsRole: "central",
    },
    {
      id: "neck",
      parent: "head",
      mass_kg: 6000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.08) },
    },
    {
      id: "torso",
      parent: null,
      mass_kg: 40000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.43) },
      cnsRole: "ganglionic",
    },
    {
      id: "tail",
      parent: "torso",
      mass_kg: 3000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.03) },
    },
    {
      id: "frontLeftLeg",
      parent: "torso",
      mass_kg: 5000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.10) },
      locomotionRole: "primary",
    },
    {
      id: "frontRightLeg",
      parent: "torso",
      mass_kg: 5000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.10) },
      locomotionRole: "primary",
    },
    {
      id: "rearLeftLeg",
      parent: "torso",
      mass_kg: 7000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.08) },
      locomotionRole: "primary",
    },
    {
      id: "rearRightLeg",
      parent: "torso",
      mass_kg: 7000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.08) },
      locomotionRole: "primary",
    },
  ],
};
// QUADRUPED kinetic sum: 1000+800+4300+300+1000+1000+800+800 = 10000 ✓

/**
 * Theropod (large bipedal predator, fantasy drake):
 * bipedal, heavy tail counterbalance, vestigial forelimbs.
 */
export const THEROPOD_PLAN: BodyPlan = {
  id: "theropod",
  locomotion: { type: "biped" },
  cnsLayout: { type: "centralized" },
  segments: [
    {
      id: "head",
      parent: null,
      mass_kg: 15000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.10) },
      cnsRole: "central",
    },
    {
      id: "neck",
      parent: "head",
      mass_kg: 12000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.08) },
    },
    {
      id: "torso",
      parent: null,
      mass_kg: 80000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.38) },
      cnsRole: "ganglionic",
    },
    {
      id: "tail",
      parent: "torso",
      mass_kg: 30000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.15) },
    },
    {
      id: "leftArm",
      parent: "torso",
      mass_kg: 6000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.03) },
      manipulationRole: "secondary",
    },
    {
      id: "rightArm",
      parent: "torso",
      mass_kg: 6000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.03) },
      manipulationRole: "secondary",
    },
    {
      id: "leftLeg",
      parent: "torso",
      mass_kg: 25000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.12) },
      locomotionRole: "primary",
    },
    {
      id: "rightLeg",
      parent: "torso",
      mass_kg: 25000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.11) },
      locomotionRole: "primary",
    },
  ],
};

/**
 * Sauropod (long neck and tail, 4 locomotion limbs):
 * brachiosaurus-type, massive torso, slow-moving.
 */
export const SAUROPOD_PLAN: BodyPlan = {
  id: "sauropod",
  locomotion: { type: "quadruped" },
  cnsLayout: { type: "distributed" },
  segments: [
    {
      id: "head",
      parent: null,
      mass_kg: 10000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.03) },
      cnsRole: "central",
    },
    {
      id: "neck",
      parent: "head",
      mass_kg: 50000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.12) },
    },
    {
      id: "torso",
      parent: null,
      mass_kg: 200000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.35) },
      cnsRole: "ganglionic",
    },
    {
      id: "tail",
      parent: "torso",
      mass_kg: 60000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.15) },
    },
    {
      id: "frontLeftLeg",
      parent: "torso",
      mass_kg: 30000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.10) },
      locomotionRole: "primary",
    },
    {
      id: "frontRightLeg",
      parent: "torso",
      mass_kg: 30000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.10) },
      locomotionRole: "primary",
    },
    {
      id: "rearLeftLeg",
      parent: "torso",
      mass_kg: 35000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.08) },
      locomotionRole: "primary",
    },
    {
      id: "rearRightLeg",
      parent: "torso",
      mass_kg: 35000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.07) },
      locomotionRole: "primary",
    },
  ],
};

/**
 * Avian (bird, winged creature):
 * hollow bones, wings as forelimbs, legs for perching/walking.
 */
export const AVIAN_PLAN: BodyPlan = {
  id: "avian",
  locomotion: { type: "flight" },
  cnsLayout: { type: "centralized" },
  segments: [
    {
      id: "head",
      parent: null,
      mass_kg: 1000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.08) },
      cnsRole: "central",
    },
    {
      id: "torso",
      parent: null,
      mass_kg: 5000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.42) },
      cnsRole: "ganglionic",
    },
    {
      id: "leftWing",
      parent: "torso",
      mass_kg: 2000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.20) },
      locomotionRole: "primary",
      manipulationRole: "secondary",
    },
    {
      id: "rightWing",
      parent: "torso",
      mass_kg: 2000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.20) },
      locomotionRole: "primary",
      manipulationRole: "secondary",
    },
    {
      id: "leftLeg",
      parent: "torso",
      mass_kg: 1000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.05) },
      locomotionRole: "secondary",
    },
    {
      id: "rightLeg",
      parent: "torso",
      mass_kg: 1000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.05) },
      locomotionRole: "secondary",
    },
  ],
};

/**
 * Vermiform (snake, worm):
 * no discrete limbs, lateral undulation locomotion.
 */
export const VERMIFORM_PLAN: BodyPlan = {
  id: "vermiform",
  locomotion: { type: "undulation" },
  cnsLayout: { type: "distributed" },
  segments: [
    {
      id: "head",
      parent: null,
      mass_kg: 2000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.08) },
      cnsRole: "central",
    },
    {
      id: "neckSeg",
      parent: "head",
      mass_kg: 5000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.20) },
      cnsRole: "ganglionic",
      locomotionRole: "secondary",
    },
    {
      id: "midBody",
      parent: "neckSeg",
      mass_kg: 10000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.48) },
      locomotionRole: "primary",
    },
    {
      id: "tailSeg",
      parent: "midBody",
      mass_kg: 5000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.24) },
      locomotionRole: "secondary",
    },
  ],
};

/**
 * Centaur (combined horse and humanoid upper body):
 * 4 locomotion limbs + 2 manipulation limbs.
 */
export const CENTAUR_PLAN: BodyPlan = {
  id: "centaur",
  locomotion: { type: "quadruped" },
  cnsLayout: { type: "centralized" },
  segments: [
    {
      id: "head",
      parent: null,
      mass_kg: 5000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.06) },
      cnsRole: "central",
    },
    {
      id: "upperTorso",
      parent: null,
      mass_kg: 25000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.18) },
      cnsRole: "ganglionic",
    },
    {
      id: "lowerTorso",
      parent: "upperTorso",
      mass_kg: 40000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.22) },
    },
    {
      id: "leftArm",
      parent: "upperTorso",
      mass_kg: 4000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.08) },
      manipulationRole: "primary",
    },
    {
      id: "rightArm",
      parent: "upperTorso",
      mass_kg: 4000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.08) },
      manipulationRole: "primary",
    },
    {
      id: "frontLeftLeg",
      parent: "lowerTorso",
      mass_kg: 10000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.09) },
      locomotionRole: "primary",
    },
    {
      id: "frontRightLeg",
      parent: "lowerTorso",
      mass_kg: 10000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.09) },
      locomotionRole: "primary",
    },
    {
      id: "rearLeftLeg",
      parent: "lowerTorso",
      mass_kg: 12000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.10) },
      locomotionRole: "primary",
    },
    {
      id: "rearRightLeg",
      parent: "lowerTorso",
      mass_kg: 12000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.10) },
      locomotionRole: "primary",
    },
  ],
};

/**
 * Octopoid (octopus-type):
 * distributed manipulation, all arms contribute to locomotion.
 */
export const OCTOPOID_PLAN: BodyPlan = {
  id: "octopoid",
  locomotion: { type: "distributed" },
  cnsLayout: { type: "distributed" },
  segments: [
    {
      id: "mantle",
      parent: null,
      mass_kg: 5000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.28) },
      cnsRole: "central",
    },
    { id: "arm1", parent: "mantle", mass_kg: 1500 as I32, exposureWeight: { [DamageChannel.Kinetic]: q(0.09) }, manipulationRole: "primary", locomotionRole: "secondary" },
    { id: "arm2", parent: "mantle", mass_kg: 1500 as I32, exposureWeight: { [DamageChannel.Kinetic]: q(0.09) }, manipulationRole: "primary", locomotionRole: "secondary" },
    { id: "arm3", parent: "mantle", mass_kg: 1500 as I32, exposureWeight: { [DamageChannel.Kinetic]: q(0.09) }, manipulationRole: "primary", locomotionRole: "secondary" },
    { id: "arm4", parent: "mantle", mass_kg: 1500 as I32, exposureWeight: { [DamageChannel.Kinetic]: q(0.09) }, manipulationRole: "primary", locomotionRole: "secondary" },
    { id: "arm5", parent: "mantle", mass_kg: 1500 as I32, exposureWeight: { [DamageChannel.Kinetic]: q(0.09) }, manipulationRole: "primary", locomotionRole: "secondary" },
    { id: "arm6", parent: "mantle", mass_kg: 1500 as I32, exposureWeight: { [DamageChannel.Kinetic]: q(0.09) }, manipulationRole: "primary", locomotionRole: "secondary" },
    { id: "arm7", parent: "mantle", mass_kg: 1500 as I32, exposureWeight: { [DamageChannel.Kinetic]: q(0.09) }, manipulationRole: "primary", locomotionRole: "secondary" },
    { id: "arm8", parent: "mantle", mass_kg: 1500 as I32, exposureWeight: { [DamageChannel.Kinetic]: q(0.09) }, manipulationRole: "primary", locomotionRole: "secondary" },
  ],
};

/**
 * Phase 8B reference plan: giant grasshopper (arthropod exoskeleton).
 * Demonstrates all Phase 8B fields:
 *  - All segments have structureType: "exoskeleton"
 *  - Thorax has fluidSystem: "open" + hemolymphLossRate
 *  - Wings have breachThreshold, isJoint, jointDamageMultiplier
 *  - Legs have regeneratesViaMolting: true
 *  - locomotion.flight wired to wing segment IDs
 *
 * Kinetic exposure weights sum to exactly 10000 (SCALE.Q).
 */
export const GRASSHOPPER_PLAN: BodyPlan = {
  id: "grasshopper",
  locomotion: {
    type: "hexapod",
    flight: {
      wingSegments: ["forewing_l", "forewing_r", "hindwing_l", "hindwing_r"],
      liftCapacity_kg: 10000 as I32,   // 10 kg — just enough to carry itself
      flightStaminaCost: q(2.0) as Q,  // flight costs 2× ground stamina
      wingDamagePenalty: q(0.8) as Q,  // 80% speed loss per unit of wing damage
    },
  },
  cnsLayout: { type: "distributed" },
  segments: [
    {
      id: "head",
      parent: null,
      mass_kg: 1000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.05) },
      cnsRole: "central",
      structureType: "exoskeleton",
      breachThreshold: q(0.5),
      fluidSystem: "none",
    },
    {
      id: "thorax",
      parent: null,
      mass_kg: 3000 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.35) },
      cnsRole: "ganglionic",
      structureType: "exoskeleton",
      breachThreshold: q(0.4),
      fluidSystem: "open",
      hemolymphLossRate: q(0.002),
      intrinsicArmor_J: 40,   // Phase 8C: chitinous shell absorbs 40 J before channel split
    },
    {
      id: "forewing_l",
      parent: "thorax",
      mass_kg: 500 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.08) },
      locomotionRole: "primary",
      structureType: "exoskeleton",
      breachThreshold: q(0.3),
      isJoint: true,
      jointDamageMultiplier: q(1.5),
    },
    {
      id: "forewing_r",
      parent: "thorax",
      mass_kg: 500 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.08) },
      locomotionRole: "primary",
      structureType: "exoskeleton",
      breachThreshold: q(0.3),
      isJoint: true,
      jointDamageMultiplier: q(1.5),
    },
    {
      id: "hindwing_l",
      parent: "thorax",
      mass_kg: 700 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.10) },
      locomotionRole: "primary",
      structureType: "exoskeleton",
      breachThreshold: q(0.3),
      isJoint: true,
      jointDamageMultiplier: q(1.5),
    },
    {
      id: "hindwing_r",
      parent: "thorax",
      mass_kg: 700 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.10) },
      locomotionRole: "primary",
      structureType: "exoskeleton",
      breachThreshold: q(0.3),
      isJoint: true,
      jointDamageMultiplier: q(1.5),
    },
    {
      id: "foreleg_l",
      parent: "thorax",
      mass_kg: 500 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.035) },
      locomotionRole: "secondary",
      structureType: "exoskeleton",
      breachThreshold: q(0.5),
      regeneratesViaMolting: true,
    },
    {
      id: "foreleg_r",
      parent: "thorax",
      mass_kg: 500 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.035) },
      locomotionRole: "secondary",
      structureType: "exoskeleton",
      breachThreshold: q(0.5),
      regeneratesViaMolting: true,
    },
    {
      id: "midleg_l",
      parent: "thorax",
      mass_kg: 500 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.035) },
      locomotionRole: "secondary",
      structureType: "exoskeleton",
      breachThreshold: q(0.5),
      regeneratesViaMolting: true,
    },
    {
      id: "midleg_r",
      parent: "thorax",
      mass_kg: 500 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.035) },
      locomotionRole: "secondary",
      structureType: "exoskeleton",
      breachThreshold: q(0.5),
      regeneratesViaMolting: true,
    },
    {
      id: "hindleg_l",
      parent: "thorax",
      mass_kg: 800 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.05) },
      locomotionRole: "primary",
      structureType: "exoskeleton",
      breachThreshold: q(0.5),
      regeneratesViaMolting: true,
    },
    {
      id: "hindleg_r",
      parent: "thorax",
      mass_kg: 800 as I32,
      exposureWeight: { [DamageChannel.Kinetic]: q(0.05) },
      locomotionRole: "primary",
      structureType: "exoskeleton",
      breachThreshold: q(0.5),
      regeneratesViaMolting: true,
    },
  ],
};
// GRASSHOPPER_PLAN kinetic sum: 500+3500+800+800+1000+1000+350+350+350+350+500+500 = 10000 ✓
