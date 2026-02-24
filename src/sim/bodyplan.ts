// src/sim/bodyplan.ts — Phase 8: Universal Body and Species System
//
// Body plans are data files. Adding a new species requires authoring a BodyPlan
// and an Archetype baseline; the simulation kernel does not need modification.
//
// The `id` of each BodySegment becomes the key in InjuryState.byRegion.

import type { Q, I32 } from "../units.js";
import { q } from "../units.js";
import { DamageChannel } from "../channels.js";

// ─── locomotion and CNS models ────────────────────────────────────────────────

export interface LocomotionModel {
  /** Primary locomotion mechanism. */
  type: "biped" | "quadruped" | "hexapod" | "undulation" | "flight" | "distributed";
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
}

// ─── body plan ───────────────────────────────────────────────────────────────

export interface BodyPlan {
  id: string;
  segments: BodySegment[];
  locomotion: LocomotionModel;
  cnsLayout: CNSLayout;
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
export function resolveHitSegment(plan: BodyPlan, r01: Q): string {
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
