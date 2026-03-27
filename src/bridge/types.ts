// src/bridge/types.ts — Bridge core interfaces

import type { Vec3 } from "../sim/vec3.js";
import type { Q } from "../units.js";
import type { AnimationHints, PoseModifier, GrapplePoseConstraint } from "../model3d.js";
import type { MotionVector, ConditionSample } from "../debug.js";

// ─── Mapping configuration ──────────────────────────────────────────────────────

/**
 * Maps a simulation segment ID to a renderer bone name, with optional offsets.
 */
export interface SegmentMapping {
  segmentId: string;
  boneName: string;
  /** Optional offset in fixed-point metres (SCALE.m). */
  positionOffset?: Vec3;
  /** Optional rotation offset (Euler angles) in fixed-point degrees? Not used yet. */
  rotationOffset?: Vec3;
}

/**
 * Complete mapping for a body plan.
 */
export interface BodyPlanMapping {
  /** Matches BodyPlan.id */
  bodyPlanId: string;
  segments: SegmentMapping[];
}

/**
 * Bridge configuration supplied by the host renderer.
 */
export interface BridgeConfig {
  mappings: BodyPlanMapping[];
  /** Allow extrapolation when render time is ahead of the latest simulation tick. Default false. */
  extrapolationAllowed?: boolean;
  /** Bone name to use for unmapped segments (default "root"). */
  defaultBoneName?: string;
}

// ─── Interpolated state ────────────────────────────────────────────────────────

/**
 * Per‑segment pose data after mapping to bone names.
 */
export interface MappedPoseModifier {
  segmentId: string;
  boneName: string;
  impairmentQ: Q;
  structuralQ: Q;
  surfaceQ: Q;
}

/**
 * Fully interpolated state for a single entity at a specific render time.
 */
export interface InterpolatedState {
  entityId: number;
  teamId: number;
  position_m: Vec3;
  velocity_mps: Vec3;
  facing: Vec3;
  animation: AnimationHints;
  poseModifiers: MappedPoseModifier[];
  grapple: GrapplePoseConstraint;
  condition: {
    shockQ: Q;
    fearQ: Q;
    consciousness: Q;
    fluidLoss: Q;
    dead: boolean;
  };
  /** Interpolation factor t ∈ [0, SCALE.Q] between fromTick and toTick. */
  interpolationFactor: Q;
  fromTick: number;
  toTick: number;
}

// ─── Internal snapshot storage ─────────────────────────────────────────────────

/**
 * Aggregated snapshot for one entity at one tick.
 */
export interface TickSnapshot {
  entityId: number;
  teamId: number;
  tick: number;
  position_m: Vec3;
  velocity_mps: Vec3;
  facing: Vec3;
  animation: AnimationHints;
  poseModifiers: PoseModifier[];
  grapple: GrapplePoseConstraint;
  condition: {
    shockQ: Q;
    fearQ: Q;
    consciousness: Q;
    fluidLoss: Q;
    dead: boolean;
  };
}

// ─── Bridge engine outputs ─────────────────────────────────────────────────────

export interface BridgeUpdate {
  snapshots: TickSnapshot[];
  motion?: MotionVector[];
  condition?: ConditionSample[];
}

export type InterpolationMode = "lerp" | "extrapolate" | "hold";