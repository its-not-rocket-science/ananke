// src/metrics.ts — Phase 13: combat metrics and analytics

import type { TraceEvent, TraceSink } from "./sim/trace.js";
import { TraceKinds } from "./sim/kinds.js";

// ── Data types ────────────────────────────────────────────────────────────────

/** Accumulated metrics derived from a sequence of trace events. */
export interface CombatMetrics {
  /** Total energy (J) delivered by each attacker entity (melee + ranged). */
  damageDealt: Map<number, number>;

  /** Number of successful hit events (melee Attack or ranged hit) per attacker. */
  hitsLanded: Map<number, number>;

  /** Number of times each entity was hit. */
  hitsTaken: Map<number, number>;

  /** First tick at which each entity received a KO event. */
  tickOfKO: Map<number, number>;

  /** First tick at which each entity died. */
  tickOfDeath: Map<number, number>;

  /**
   * First tick at which each entity was incapacitated (KO or death, whichever came first).
   * Entities that remained combat-capable throughout are absent from this map.
   */
  tickToIncapacitation: Map<number, number>;
}

// ── Core analytics ────────────────────────────────────────────────────────────

/**
 * Derive combat metrics from a flat array of trace events.
 * Events from any number of ticks may be mixed; ordering is not required.
 */
export function collectMetrics(events: readonly TraceEvent[]): CombatMetrics {
  const damageDealt = new Map<number, number>();
  const hitsLanded  = new Map<number, number>();
  const hitsTaken   = new Map<number, number>();
  const tickOfKO    = new Map<number, number>();
  const tickOfDeath = new Map<number, number>();

  for (const ev of events) {
    if (ev.kind === TraceKinds.Attack) {
      damageDealt.set(ev.attackerId, (damageDealt.get(ev.attackerId) ?? 0) + ev.energy_J);
      hitsLanded.set(ev.attackerId,  (hitsLanded.get(ev.attackerId)  ?? 0) + 1);
      hitsTaken.set(ev.targetId,     (hitsTaken.get(ev.targetId)     ?? 0) + 1);

    } else if (ev.kind === TraceKinds.ProjectileHit && ev.hit) {
      damageDealt.set(ev.shooterId, (damageDealt.get(ev.shooterId) ?? 0) + ev.energyAtImpact_J);
      hitsLanded.set(ev.shooterId,  (hitsLanded.get(ev.shooterId)  ?? 0) + 1);
      if (ev.targetId !== undefined) {
        hitsTaken.set(ev.targetId, (hitsTaken.get(ev.targetId) ?? 0) + 1);
      }

    } else if (ev.kind === TraceKinds.KO) {
      if (!tickOfKO.has(ev.entityId)) tickOfKO.set(ev.entityId, ev.tick);

    } else if (ev.kind === TraceKinds.Death) {
      if (!tickOfDeath.has(ev.entityId)) tickOfDeath.set(ev.entityId, ev.tick);
    }
  }

  // tickToIncapacitation = min(tickOfKO, tickOfDeath) per entity
  const tickToIncapacitation = new Map<number, number>();
  for (const [id, t] of tickOfKO)    tickToIncapacitation.set(id, t);
  for (const [id, t] of tickOfDeath) {
    const prev = tickToIncapacitation.get(id);
    tickToIncapacitation.set(id, prev === undefined ? t : Math.min(prev, t));
  }

  return { damageDealt, hitsLanded, hitsTaken, tickOfKO, tickOfDeath, tickToIncapacitation };
}

/**
 * Fraction of `entityIds` that were never incapacitated (KO or death) in `events`.
 * Returns 1.0 if `entityIds` is empty.
 */
export function survivalRate(
  events: readonly TraceEvent[],
  entityIds: readonly number[],
): number {
  if (entityIds.length === 0) return 1.0;
  const { tickToIncapacitation } = collectMetrics(events);
  const incapCount = entityIds.filter(id => tickToIncapacitation.has(id)).length;
  return (entityIds.length - incapCount) / entityIds.length;
}

/**
 * Mean tick-to-incapacitation across the given entities.
 * Entities that were never incapacitated contribute `totalTicks` to the average
 * (i.e. they survived the full duration).
 *
 * Returns `totalTicks` if no entity was incapacitated.
 */
export function meanTimeToIncapacitation(
  events: readonly TraceEvent[],
  entityIds: readonly number[],
  totalTicks: number,
): number {
  if (entityIds.length === 0) return totalTicks;
  const { tickToIncapacitation } = collectMetrics(events);
  const total = entityIds.reduce((sum, id) => {
    return sum + (tickToIncapacitation.get(id) ?? totalTicks);
  }, 0);
  return total / entityIds.length;
}

// ── CollectingTrace ───────────────────────────────────────────────────────────

/**
 * A TraceSink that accumulates all events into an array for later analysis.
 *
 * Usage:
 *   const tracer = new CollectingTrace();
 *   stepWorld(world, cmds, { ...ctx, trace: tracer });
 *   const metrics = collectMetrics(tracer.events);
 */
export class CollectingTrace implements TraceSink {
  readonly events: TraceEvent[] = [];

  onEvent(ev: TraceEvent): void {
    this.events.push(ev);
  }

  /** Remove all accumulated events. */
  clear(): void {
    this.events.length = 0;
  }
}
