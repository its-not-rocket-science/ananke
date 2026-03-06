// src/model3d.ts
//
// Phase 14 — 3D Model Integration
//
// Pure data-extraction functions for driving 3D character rigs. No kernel
// changes, no simulation state mutations. The host renderer maps the output
// types to its own skeleton/animation system.

import type { WorldState } from "./sim/world.js";
import type { Entity } from "./sim/entity.js";
import type { GrapplePosition } from "./sim/entity.js";
import type { Q } from "./units.js";
import { q, SCALE } from "./units.js";
import { DefenceModes } from "./sim/kinds.js";

// ─── Canonical segment offsets ────────────────────────────────────────────────

/**
 * Normalised spatial offset for a body segment, expressed as fractions of
 * stature. y=0 at feet, y=1 at crown. x<0 = anatomical left, x>0 = right.
 * z is omitted; assume planar for inertia estimation.
 */
interface CanonicalOffset { xFrac: number; yFrac: number; }

function lateralSign(id: string): number {
  if (id.includes("left")  || id.endsWith("_l")) return -1;
  if (id.includes("right") || id.endsWith("_r")) return  1;
  return 0;
}

/**
 * Canonical vertical and lateral offset for a segment, derived from its ID
 * by keyword matching. Used for CoG and inertia estimation.
 */
function getCanonicalOffset(segId: string): CanonicalOffset {
  const id  = segId.toLowerCase();
  const lat = lateralSign(id);
  if (/head|skull|cranium/.test(id))         return { xFrac: 0,          yFrac: 0.94 };
  if (/neck/.test(id))                        return { xFrac: 0,          yFrac: 0.80 };
  if (/thorax|torso|chest|trunk/.test(id))    return { xFrac: 0,          yFrac: 0.63 };
  if (/abdomen|belly/.test(id))               return { xFrac: 0,          yFrac: 0.52 };
  if (/pelvis|hip(?!bone)/.test(id))          return { xFrac: 0,          yFrac: 0.43 };
  if (/shoulder/.test(id))                    return { xFrac: lat * 0.20, yFrac: 0.72 };
  if (/forearm|lower.?arm/.test(id))          return { xFrac: lat * 0.22, yFrac: 0.56 };
  if (/upper.?arm/.test(id))                  return { xFrac: lat * 0.20, yFrac: 0.68 };
  if (/arm/.test(id))                         return { xFrac: lat * 0.20, yFrac: 0.62 };
  if (/hand/.test(id))                        return { xFrac: lat * 0.25, yFrac: 0.44 };
  if (/thigh|upper.?leg/.test(id))            return { xFrac: lat * 0.07, yFrac: 0.33 };
  if (/shin|calf|lower.?leg|foreleg|midleg|hindleg/.test(id))
                                              return { xFrac: lat * 0.07, yFrac: 0.17 };
  if (/leg/.test(id))                         return { xFrac: lat * 0.07, yFrac: 0.25 };
  if (/foot|hoof|paw/.test(id))               return { xFrac: lat * 0.07, yFrac: 0.03 };
  if (/tail/.test(id))                        return { xFrac: 0,          yFrac: 0.35 };
  if (/wing/.test(id))                        return { xFrac: lat * 0.50, yFrac: 0.65 };
  return { xFrac: 0, yFrac: 0.50 }; // unknown: geometric midpoint
}

// ─── Mass distribution ────────────────────────────────────────────────────────

/** Per-segment mass and its fraction of total body mass. */
export interface SegmentMass {
  segmentId: string;
  /** Fixed-point kg (SCALE.kg = 1000; 5 kg = 5000). */
  mass_kg: number;
  /** Fraction of total body mass (Q; q(1.0) = 100% of body mass). */
  fractionQ: Q;
}

/**
 * Mass distribution and estimated centre of gravity for an entity.
 * CoG is in real metres above the entity's foot position (world y = 0).
 */
export interface MassDistribution {
  /** Total body mass in fixed-point kg (SCALE.kg = 1000). */
  totalMass_kg: number;
  segments: SegmentMass[];
  /**
   * Estimated centre of gravity in real metres.
   * y = height above feet; x = lateral offset (negative = anatomical left).
   */
  cogOffset_m: { x: number; y: number };
}

/**
 * Derive mass distribution and centre of gravity from entity body plan.
 * Falls back to a single "body" segment at the geometric midpoint when no
 * body plan is present.
 */
export function deriveMassDistribution(entity: Entity): MassDistribution {
  const stature_m = entity.attributes.morphology.stature_m / SCALE.m;

  if (entity.bodyPlan) {
    const segs         = entity.bodyPlan.segments;
    const totalMass_kg = segs.reduce((s, seg) => s + seg.mass_kg, 0);
    const totalReal    = totalMass_kg / SCALE.kg;
    let cogX = 0;
    let cogY = 0;

    const segments: SegmentMass[] = segs.map(seg => {
      const off    = getCanonicalOffset(seg.id);
      const mass_r = seg.mass_kg / SCALE.kg;
      cogX += mass_r * off.xFrac * stature_m;
      cogY += mass_r * off.yFrac * stature_m;
      const fractionQ = (totalMass_kg > 0
        ? Math.min(SCALE.Q, Math.round((seg.mass_kg / totalMass_kg) * SCALE.Q))
        : 0) as Q;
      return { segmentId: seg.id, mass_kg: seg.mass_kg, fractionQ };
    });

    return {
      totalMass_kg,
      segments,
      cogOffset_m: {
        x: totalReal > 0 ? cogX / totalReal : 0,
        y: totalReal > 0 ? cogY / totalReal : stature_m / 2,
      },
    };
  }

  // No body plan: single point mass at geometric midpoint
  const totalMass_kg = entity.attributes.morphology.mass_kg;
  return {
    totalMass_kg,
    segments: [{ segmentId: "body", mass_kg: totalMass_kg, fractionQ: SCALE.Q as Q }],
    cogOffset_m: { x: 0, y: stature_m / 2 },
  };
}

// ─── Inertia tensor ───────────────────────────────────────────────────────────

/**
 * Simplified diagonal inertia tensor about the entity's principal axes
 * (kg·m²). z offsets are assumed zero (planar estimation).
 */
export interface InertiaTensor {
  /** About vertical (yaw) axis — governs turn rate. */
  yaw_kgm2: number;
  /** About lateral (pitch) axis — governs forward lean. */
  pitch_kgm2: number;
  /** About fore-aft (roll) axis — governs side lean. */
  roll_kgm2: number;
}

/**
 * Derive a simplified diagonal inertia tensor from entity body plan.
 * Falls back to a solid-sphere approximation when no body plan is present.
 */
export function deriveInertiaTensor(entity: Entity): InertiaTensor {
  const stature_m = entity.attributes.morphology.stature_m / SCALE.m;

  if (entity.bodyPlan) {
    let I_yaw = 0, I_pitch = 0, I_roll = 0;
    for (const seg of entity.bodyPlan.segments) {
      const off = getCanonicalOffset(seg.id);
      const m   = seg.mass_kg / SCALE.kg;
      const x   = off.xFrac * stature_m;
      const y   = off.yFrac * stature_m;
      // I = m × r_perp² for rotation about each axis (z = 0)
      I_yaw   += m * (x * x);
      I_pitch += m * (y * y);
      I_roll  += m * (x * x + y * y);
    }
    return { yaw_kgm2: I_yaw, pitch_kgm2: I_pitch, roll_kgm2: I_roll };
  }

  // Solid-sphere approximation: I = 2/5 × m × r²
  const m = entity.attributes.morphology.mass_kg / SCALE.kg;
  const r = stature_m / 4; // effective radius ≈ stature / 4
  const I = 0.4 * m * r * r;
  return { yaw_kgm2: I, pitch_kgm2: I, roll_kgm2: I };
}

// ─── Animation hints ──────────────────────────────────────────────────────────

/**
 * Animation blend weights and state flags derived from entity physical state.
 * Locomotion weights (idle/walk/run/sprint/crawl) are mutually exclusive;
 * exactly one is SCALE.Q when the entity is mobile.
 * All Q values in [0, SCALE.Q].
 */
export interface AnimationHints {
  /** Locomotion blend — mutually exclusive. */
  idle:   Q;
  walk:   Q;
  run:    Q;
  sprint: Q;
  crawl:  Q;
  /** Active defence blend weight (derived from intent.defence.intensity). */
  guardingQ: Q;
  /**
   * Attack blend weight — nonzero while attack cooldown is active, indicating
   * the entity is mid-swing or recovering from a strike.
   */
  attackingQ: Q;
  /** Physiological condition overlays (direct pass-through from entity state). */
  shockQ: Q;
  fearQ:  Q;
  /** Positional state flags. */
  prone:       boolean; // intent.prone OR grapple position prone/pinned
  unconscious: boolean;
  dead:        boolean;
}

/** Consciousness threshold below which the entity is treated as unconscious for animation. */
const ANIM_UNCONSCIOUS_THRESHOLD: Q = q(0.20) as Q;

/**
 * Derive animation hints from entity intent, condition, and injury state.
 */
export function deriveAnimationHints(entity: Entity): AnimationHints {
  const dead        = entity.injury.dead;
  const unconscious = !dead && entity.injury.consciousness < ANIM_UNCONSCIOUS_THRESHOLD;
  const prone       = entity.intent.prone
                   || entity.grapple.position === "prone"
                   || entity.grapple.position === "pinned";

  // Locomotion — zero out when not mobile
  const mobile = !dead && !unconscious;
  let idle: Q   = q(0) as Q;
  let walk: Q   = q(0) as Q;
  let run:  Q   = q(0) as Q;
  let sprint: Q = q(0) as Q;
  let crawl: Q  = q(0) as Q;

  if (mobile) {
    if      (entity.intent.move.intensity === 0)       idle   = SCALE.Q as Q;
    else if (entity.intent.move.mode === "walk")       walk   = SCALE.Q as Q;
    else if (entity.intent.move.mode === "run")        run    = SCALE.Q as Q;
    else if (entity.intent.move.mode === "sprint")     sprint = SCALE.Q as Q;
    else if (entity.intent.move.mode === "crawl")      crawl  = SCALE.Q as Q;
    else                                               idle   = SCALE.Q as Q;
  }

  const guardingQ  = (!dead && entity.intent.defence.mode !== DefenceModes.None
    ? entity.intent.defence.intensity
    : q(0)) as Q;

  const attackingQ = (!dead && entity.action.attackCooldownTicks > 0
    ? SCALE.Q : 0) as Q;

  return {
    idle, walk, run, sprint, crawl,
    guardingQ,
    attackingQ,
    shockQ: entity.injury.shock,
    fearQ:  entity.condition.fearQ ?? 0,
    prone,
    unconscious,
    dead,
  };
}

// ─── Pose modifiers ───────────────────────────────────────────────────────────

/**
 * Per-region injury state as a deformation blend weight for the host rig.
 * A host renderer maps each segmentId to a skeleton bone and drives blend
 * shape or constraint weights from impairmentQ.
 */
export interface PoseModifier {
  segmentId:    string;
  /** Overall deformation blend: max(structuralQ, surfaceQ). */
  impairmentQ:  Q;
  structuralQ:  Q;
  surfaceQ:     Q;
}

/**
 * Derive per-region pose modifiers from entity injury state.
 * Returns one entry per injury region (byRegion keys).
 */
export function derivePoseModifiers(entity: Entity): PoseModifier[] {
  return Object.entries(entity.injury.byRegion).map(([segmentId, region]) => ({
    segmentId,
    structuralQ:  region.structuralDamage as Q,
    surfaceQ:     region.surfaceDamage    as Q,
    impairmentQ:  Math.max(region.structuralDamage, region.surfaceDamage) as Q,
  }));
}

// ─── Grapple pose constraint ──────────────────────────────────────────────────

/**
 * Grapple relationship for pose-constraint solving.
 * A host renderer uses this to lock relative pose between grappling entities.
 */
export interface GrapplePoseConstraint {
  isHolder:        boolean;
  holdingEntityId?: number;
  isHeld:          boolean;
  heldByIds:       number[];
  position:        GrapplePosition;
  gripQ:           Q;
}

/**
 * Derive grapple pose constraint from entity grapple state.
 */
export function deriveGrappleConstraint(entity: Entity): GrapplePoseConstraint {
  const g = entity.grapple;
  return {
    isHolder: g.holdingTargetId !== 0,
    ...(g.holdingTargetId !== 0 ? { holdingEntityId: g.holdingTargetId } : {}),
    isHeld:    g.heldByIds.length > 0,
    heldByIds: [...g.heldByIds],
    position:  g.position,
    gripQ:     g.gripQ,
  };
}

// ─── Full rig snapshot ────────────────────────────────────────────────────────

/**
 * Complete per-entity rig data for a single simulation tick.
 * Aggregates all Phase 14 outputs for convenient host consumption.
 * Call extractRigSnapshots once per tick after stepWorld.
 */
export interface RigSnapshot {
  entityId:  number;
  teamId:    number;
  tick:      number;
  mass:      MassDistribution;
  inertia:   InertiaTensor;
  animation: AnimationHints;
  pose:      PoseModifier[];
  grapple:   GrapplePoseConstraint;
}

/**
 * Extract a full rig snapshot for every entity in the world.
 * Combine with extractMotionVectors and extractConditionSamples from
 * src/debug.ts for a complete per-tick visualisation feed.
 */
export function extractRigSnapshots(world: WorldState): RigSnapshot[] {
  return world.entities.map(e => ({
    entityId:  e.id,
    teamId:    e.teamId,
    tick:      world.tick,
    mass:      deriveMassDistribution(e),
    inertia:   deriveInertiaTensor(e),
    animation: deriveAnimationHints(e),
    pose:      derivePoseModifiers(e),
    grapple:   deriveGrappleConstraint(e),
  }));
}
