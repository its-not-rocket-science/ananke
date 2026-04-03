// src/debug.ts
//
// Phase 13 — Visual Debug Layer
//
// Pure data-extraction functions. No rendering, no kernel changes.
// Each function transforms WorldState or TraceEvent[] into a structured
// snapshot that a host renderer can consume directly.

import type { WorldState } from "./sim/world.js";
import type { Vec3 } from "./sim/vec3.js";
import type { Q } from "./units.js";
import type { TraceEvent } from "./sim/trace.js";
import { TraceKinds } from "./sim/kinds.js";
import { explainOutcome, type Explanation, type ExplanationContext, type TickRange } from "./navigation/causal-chain.js";

// ─── Motion vectors ───────────────────────────────────────────────────────────

/**
 * Per-entity motion state — position, velocity, and facing direction.
 * Suitable for overlaying movement arrows in a host renderer.
 * Includes dead entities (last-known position before death).
 */
export interface MotionVector {
  entityId: number;
  teamId: number;
  position_m: Vec3;
  velocity_mps: Vec3;
  /** Facing direction from ActionState.facingDirQ (fixed-point unit vector). */
  facing: Vec3;
}

/**
 * Extract per-entity motion vectors from the current world state.
 * Call once per tick after stepWorld to get the latest motion snapshot.
 */
export function extractMotionVectors(world: WorldState): MotionVector[] {
  return world.entities.map(e => ({
    entityId: e.id,
    teamId: e.teamId,
    position_m: e.position_m,
    velocity_mps: e.velocity_mps,
    facing: e.action.facingDirQ,
  }));
}

// ─── Hit traces ───────────────────────────────────────────────────────────────

/**
 * A resolved melee hit — energy delivered to a specific body region.
 * Derived from TraceKinds.Attack events.
 */
export interface HitTraceEntry {
  tick: number;
  attackerId: number;
  targetId: number;
  region: string;
  energy_J: number;
  blocked: boolean;
  parried: boolean;
  shieldBlocked: boolean;
  armoured: boolean;
}

/**
 * A resolved projectile hit — energy at impact for a specific body region.
 * Derived from TraceKinds.ProjectileHit events where hit === true.
 */
export interface ProjectileHitEntry {
  tick: number;
  shooterId: number;
  targetId: number;
  region: string;
  distance_m: number;
  energyAtImpact_J: number;
}

export interface HitTraceResult {
  meleeHits: HitTraceEntry[];
  projectileHits: ProjectileHitEntry[];
}

/**
 * Extract melee and projectile hit data from a flat trace event array.
 * Pass events accumulated by CollectingTrace for a span of ticks.
 * Only confirmed hits (blocked=false or energy>0 for melee; hit=true for projectiles)
 * are included — missed shots and full blocks are omitted.
 */
export function extractHitTraces(events: TraceEvent[]): HitTraceResult {
  const meleeHits: HitTraceEntry[] = [];
  const projectileHits: ProjectileHitEntry[] = [];

  for (const ev of events) {
    if (ev.kind === TraceKinds.Attack) {
      meleeHits.push({
        tick:         ev.tick,
        attackerId:   ev.attackerId,
        targetId:     ev.targetId,
        region:       ev.region,
        energy_J:     ev.energy_J,
        blocked:      ev.blocked,
        parried:      ev.parried,
        shieldBlocked: ev.shieldBlocked,
        armoured:     ev.armoured,
      });
    } else if (ev.kind === TraceKinds.ProjectileHit && ev.hit && ev.region !== undefined) {
      projectileHits.push({
        tick:             ev.tick,
        shooterId:        ev.shooterId,
        targetId:         ev.targetId,
        region:           ev.region,
        distance_m:       ev.distance_m,
        energyAtImpact_J: ev.energyAtImpact_J,
      });
    }
  }

  return { meleeHits, projectileHits };
}

// ─── Condition heatmap ────────────────────────────────────────────────────────

/**
 * Per-entity condition snapshot for heatmap visualisation.
 * All values are fixed-point (Q range 0–10000 unless noted).
 */
export interface ConditionSample {
  entityId: number;
  teamId: number;
  position_m: Vec3;
  /** Psychological fear level (0 = calm, q(1.0) = maximum fear). */
  fearQ: Q;
  /** Physiological shock (0 = none, q(1.0) = catastrophic). */
  shock: Q;
  /** Consciousness level (q(1.0) = fully alert, q(0) = unconscious). */
  consciousness: Q;
  /** Cumulative fluid loss (0 = none, q(1.0) = fatal). */
  fluidLoss: Q;
  dead: boolean;
}

/**
 * Extract per-entity condition state from the current world state.
 * Includes dead entities (position = last known position before death).
 * To sample condition at any past tick, call replayTo(tick) first:
 *   const past = replayTo(replay, tick, ctx);
 *   const samples = extractConditionSamples(past);
 */
export function extractConditionSamples(world: WorldState): ConditionSample[] {
  return world.entities.map(e => ({
    entityId:     e.id,
    teamId:       e.teamId,
    position_m:   e.position_m,
    fearQ:        e.condition.fearQ ?? 0,
    shock:        e.injury.shock,
    consciousness: e.injury.consciousness,
    fluidLoss:    e.injury.fluidLoss,
    dead:         e.injury.dead,
  }));
}


// ─── Causal chain explanations ───────────────────────────────────────────────

/**
 * Convenience adapter for debugger UIs that need a reasoned explanation
 * for an entity outcome over a tick range.
 */
export function explainOutcomeFromTrace(
  entityId: number,
  tickRange: TickRange,
  context: ExplanationContext,
): Explanation {
  return explainOutcome(entityId, tickRange, context);
}
