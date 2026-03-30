// src/host-loop.ts — PA-8: Host Integration Bridge Protocol
//
// Stable, versioned wire format for the Ananke sidecar ↔ renderer bridge.
// All values on the wire are in real SI units (floats).
//
// Usage in a sidecar:
//   import { serializeBridgeFrame, HostLoopConfig } from "@ananke/host-loop";
//
// Usage in a renderer client (Unity, Godot, Web):
//   const frame: BridgeFrame = JSON.parse(rawWebSocketMessage);
//   // field names and types are stable across minor versions
//
// Schema version string: BRIDGE_SCHEMA_VERSION.
// Increment the version suffix (v1 → v2) only on breaking wire changes.

import { SCALE, q, clampQ, qMul } from "./units.js";
import type { Q } from "./units.js";
import type { Entity } from "./sim/entity.js";
import type { WorldState } from "./sim/world.js";
import {
  deriveAnimationHints,
  derivePoseModifiers,
  deriveGrappleConstraint,
  deriveMassDistribution,
  type AnimationHints,
  type PoseModifier,
  type GrapplePoseConstraint,
} from "./model3d.js";

// ── Protocol constants ─────────────────────────────────────────────────────────

/** Wire schema identifier — included in every BridgeFrame. */
export const BRIDGE_SCHEMA_VERSION = "ananke.bridge.frame.v1" as const;

/** Default sidecar tick rate (Hz). */
export const DEFAULT_TICK_HZ = 20;

/** Default sidecar WebSocket/HTTP port. */
export const DEFAULT_BRIDGE_PORT = 3001;

/** Default sidecar host. */
export const DEFAULT_BRIDGE_HOST = "127.0.0.1";

/** Default WebSocket stream path. */
export const DEFAULT_STREAM_PATH = "/stream";

// ── Wire types ────────────────────────────────────────────────────────────────

/**
 * 3D vector in real metres (float).
 * Converts from fixed-point SCALE.m: `x_m = x_Sm / SCALE.m`.
 */
export interface BridgeVec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Entity physiological condition (Q-values as [0, 1] floats).
 * Divide the underlying Q value by SCALE.Q (10 000) to get floats.
 */
export interface BridgeCondition {
  /** Shock intensity. q(0) = no shock; q(1.0) = incapacitating. */
  shockQ: number;
  /** Fear intensity. q(0) = calm; q(1.0) = panic. */
  fearQ: number;
  /** Consciousness level. q(0) = unconscious; q(1.0) = fully alert. */
  consciousnessQ: number;
  /** Cumulative fluid loss. q(0) = none; q(1.0) = lethal. */
  fluidLossQ: number;
  /** True if the entity is clinically dead. */
  dead: boolean;
}

/**
 * Animation blend weights and state flags for a renderer character controller.
 * All Q-values are [0, 1] floats.
 *
 * Locomotive blends are mutually exclusive; typically only one is nonzero.
 */
export interface BridgeAnimation {
  // Locomotion
  idle:   number;
  walk:   number;
  run:    number;
  sprint: number;
  crawl:  number;
  // Combat/condition overlays
  guardingQ:  number;
  attackingQ: number;
  shockQ:     number;
  fearQ:      number;
  // State flags
  prone:       boolean;
  unconscious: boolean;
  dead:        boolean;
  // Convenience composites (derived, not from entity state directly)
  /** Dominant animation state as a single string (see `derivePrimaryState`). */
  primaryState:    string;
  /** Max locomotion blend weight — useful for speed-parameterised blend trees. */
  locomotionBlend: number;
  /** Worst-case injury deformation weight across all body segments. */
  injuryWeight:    number;
}

/**
 * Per-body-segment pose modifier — drives deformation or damage blend shapes.
 * Q-values are [0, 1] floats.
 */
export interface BridgePoseModifier {
  segmentId:   string;
  /** Overall deformation blend: max(structuralQ, surfaceQ). */
  impairmentQ: number;
  structuralQ: number;
  surfaceQ:    number;
  /**
   * Anatomical offset for this segment at full impairment, in real metres.
   * Apply to the bone's local position to show slumping/collapse.
   */
  localOffset_m: BridgeVec3;
}

/**
 * Grapple constraint describing hold/held relationships between entities.
 */
export interface BridgeGrappleConstraint {
  isHolder:        boolean;
  holdingEntityId: number;  // 0 when not holding
  isHeld:          boolean;
  heldByIds:       number[];
  /** Grapple positional state. */
  position: "standing" | "prone" | "pinned" | "mounted";
  /** Grip strength [0, 1]. */
  gripQ:    number;
}

/**
 * Complete per-entity snapshot for one simulation tick.
 */
export interface BridgeEntitySnapshot {
  entityId: number;
  teamId:   number;
  tick:     number;
  /** World position in real metres. */
  position_m:   BridgeVec3;
  /** Velocity in real m/s. */
  velocity_mps: BridgeVec3;
  /** Normalised facing direction (unit vector). */
  facing:       BridgeVec3;
  /** Mass in real kg. */
  massKg:       number;
  /** Centre-of-gravity offset from foot position (real metres). */
  cogOffset_m:  { x: number; y: number };
  animation:    BridgeAnimation;
  pose:         BridgePoseModifier[];
  grapple:      BridgeGrappleConstraint;
  condition:    BridgeCondition;
}

/**
 * Complete serialized frame for one simulation tick.
 * JSON-encoded and sent over WebSocket / HTTP.
 */
export interface BridgeFrame {
  /** Fixed schema identifier — check this before deserializing. */
  schema:      typeof BRIDGE_SCHEMA_VERSION;
  scenarioId:  string;
  tick:        number;
  tickHz:      number;
  /** ISO 8601 generation timestamp — for latency diagnostics only. */
  generatedAt: string;
  entities:    BridgeEntitySnapshot[];
}

/**
 * Sidecar configuration — passed to `serializeBridgeFrame` and used by
 * host loop implementations.
 */
export interface HostLoopConfig {
  /** Stable identifier for this scenario (e.g. `"knight-vs-brawler"`). */
  scenarioId: string;
  /** Simulation tick rate in Hz. Default: `DEFAULT_TICK_HZ` (20). */
  tickHz?: number;
  /** Listening port. Default: `DEFAULT_BRIDGE_PORT` (3001). */
  port?: number;
  /** Listening host. Default: `DEFAULT_BRIDGE_HOST`. */
  host?: string;
}

// ── Primary state derivation ──────────────────────────────────────────────────

/**
 * Derive a single animation state string from `AnimationHints`.
 *
 * Priority: dead > unconscious > prone/crawl > attack > flee (run/sprint) > idle.
 * Renderer character controllers use this to drive top-level state machines
 * when a detailed blend tree is not available.
 *
 * @returns One of: `"dead"` | `"unconscious"` | `"prone"` | `"attack"` | `"flee"` | `"idle"`
 */
export function derivePrimaryState(animation: AnimationHints): string {
  if (animation.dead)        return "dead";
  if (animation.unconscious) return "unconscious";
  if (animation.prone || animation.crawl > 0) return "prone";
  if (animation.attackingQ > 0)               return "attack";
  if (animation.sprint > 0 || animation.run > 0) return "flee";
  return "idle";
}

// ── Pose offset per segment ───────────────────────────────────────────────────

/**
 * Anatomical local-space offset for a body segment at maximum impairment.
 *
 * Applied as: `bone.localPosition += poseOffset * impairmentQ`.
 * Values are in real metres (float).
 *
 * @param segmentId   Canonical segment identifier (e.g. `"head"`, `"leftArm"`).
 * @param impairmentQ Impairment blend weight [0, 1] float.
 * @returns Local-space offset in real metres.
 */
export function derivePoseOffset(segmentId: string, impairmentQ: number): BridgeVec3 {
  // 6% of stature at full impairment (clamp to [0, SCALE.Q])
  const weightQ  = clampQ(Math.round(impairmentQ * SCALE.Q) as Q, q(0) as Q, SCALE.Q as Q);
  const offsetQ  = qMul(weightQ, q(0.06) as Q);
  const offset   = offsetQ / SCALE.Q;

  // `+ 0` normalises IEEE-754 negative-zero (−0) to plain 0.
  switch (segmentId) {
    case "head":     return { x: 0,                     y: (-offset * 0.35) + 0, z: 0 };
    case "torso":
    case "thorax":
    case "abdomen":  return { x: 0,                     y: (-offset * 0.50) + 0, z: 0 };
    case "leftArm":  return { x: (-offset) + 0,         y: 0,                    z: 0 };
    case "rightArm": return { x:  offset,                y: 0,                    z: 0 };
    case "leftLeg":  return { x: (-offset * 0.45) + 0,  y: (-offset) + 0,        z: 0 };
    case "rightLeg": return { x:  offset * 0.45,         y: (-offset) + 0,        z: 0 };
    default:         return { x: 0,                     y: 0,                    z: 0 };
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function scaleVec3(v: { x: number; y: number; z: number }, divisor: number): BridgeVec3 {
  return { x: v.x / divisor, y: v.y / divisor, z: v.z / divisor };
}

function normalizeFacing(v: { x: number; y: number; z: number }): BridgeVec3 {
  const mag = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / mag, y: v.y / mag, z: v.z / mag };
}

function buildBridgeAnimation(animation: AnimationHints, pose: PoseModifier[]): BridgeAnimation {
  const locomotionBlend = Math.max(
    animation.idle, animation.walk, animation.run,
    animation.sprint, animation.crawl,
  ) / SCALE.Q;

  const injuryWeight = pose.reduce(
    (worst, m) => Math.max(worst, m.impairmentQ),
    0,
  ) / SCALE.Q;

  return {
    idle:         animation.idle   / SCALE.Q,
    walk:         animation.walk   / SCALE.Q,
    run:          animation.run    / SCALE.Q,
    sprint:       animation.sprint / SCALE.Q,
    crawl:        animation.crawl  / SCALE.Q,
    guardingQ:    animation.guardingQ  / SCALE.Q,
    attackingQ:   animation.attackingQ / SCALE.Q,
    shockQ:       animation.shockQ     / SCALE.Q,
    fearQ:        animation.fearQ      / SCALE.Q,
    prone:        animation.prone,
    unconscious:  animation.unconscious,
    dead:         animation.dead,
    primaryState: derivePrimaryState(animation),
    locomotionBlend,
    injuryWeight,
  };
}

function buildBridgeGrapple(grapple: GrapplePoseConstraint): BridgeGrappleConstraint {
  return {
    isHolder:        grapple.isHolder,
    holdingEntityId: grapple.holdingEntityId ?? 0,
    isHeld:          grapple.isHeld,
    heldByIds:       grapple.heldByIds,
    position:        grapple.position,
    gripQ:           grapple.gripQ / SCALE.Q,
  };
}

function buildBridgeCondition(entity: Entity): BridgeCondition {
  return {
    shockQ:          entity.injury.shock          / SCALE.Q,
    fearQ:           (entity.condition.fearQ ?? 0) / SCALE.Q,
    consciousnessQ:  entity.injury.consciousness  / SCALE.Q,
    fluidLossQ:      entity.injury.fluidLoss       / SCALE.Q,
    dead:            entity.injury.dead,
  };
}

function buildEntitySnapshot(entity: Entity, tick: number): BridgeEntitySnapshot {
  const animation = deriveAnimationHints(entity);
  const pose      = derivePoseModifiers(entity);
  const grapple   = deriveGrappleConstraint(entity);
  const mass      = deriveMassDistribution(entity);

  return {
    entityId:     entity.id,
    teamId:       entity.teamId,
    tick,
    position_m:   scaleVec3(entity.position_m, SCALE.m),
    velocity_mps: scaleVec3(entity.velocity_mps, SCALE.m),
    facing:       normalizeFacing(entity.action.facingDirQ),
    massKg:       mass.totalMass_kg / SCALE.kg,
    cogOffset_m:  mass.cogOffset_m,
    animation:    buildBridgeAnimation(animation, pose),
    pose:         pose.map(pm => ({
      segmentId:    pm.segmentId,
      impairmentQ:  pm.impairmentQ  / SCALE.Q,
      structuralQ:  pm.structuralQ  / SCALE.Q,
      surfaceQ:     pm.surfaceQ     / SCALE.Q,
      localOffset_m: derivePoseOffset(pm.segmentId, pm.impairmentQ / SCALE.Q),
    })),
    grapple:   buildBridgeGrapple(grapple),
    condition: buildBridgeCondition(entity),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Serialize a complete simulation tick into the stable bridge wire format.
 *
 * This is the canonical sidecar serializer.  Replaces per-project
 * `serialiseFrame` implementations in Unity and Godot sidecars.
 *
 * @param world   Current world state after `stepWorld()`.
 * @param config  Sidecar configuration.
 * @returns       A `BridgeFrame` safe to `JSON.stringify` and send over WebSocket.
 *
 * @example
 * ```ts
 * import { serializeBridgeFrame } from "@its-not-rocket-science/ananke/host-loop";
 *
 * function tick() {
 *   stepWorld(world, commands, ctx);
 *   const frame = serializeBridgeFrame(world, { scenarioId: "my-duel", tickHz: 20 });
 *   broadcast(JSON.stringify(frame));
 * }
 * ```
 */
export function serializeBridgeFrame(world: WorldState, config: HostLoopConfig): BridgeFrame {
  return {
    schema:      BRIDGE_SCHEMA_VERSION,
    scenarioId:  config.scenarioId,
    tick:        world.tick,
    tickHz:      config.tickHz ?? DEFAULT_TICK_HZ,
    generatedAt: new Date().toISOString(),
    entities:    world.entities.map(e => buildEntitySnapshot(e, world.tick)),
  };
}
