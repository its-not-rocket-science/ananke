import type { WorldState } from "../world.js";
import type { Entity } from "../entity.js";
import type { WorldIndex } from "../indexing.js";
import type { SpatialIndex } from "../spatial.js";
import type { TraceSink } from "../trace.js";

import { SCALE, q, clampQ, qMul, type Q } from "../../units.js";
import { queryNearbyIds } from "../spatial.js";
import { coverFractionAtPosition } from "../terrain.js";
import { TraceKinds } from "../kinds.js";
import {
  FEAR_PER_SUPPRESSION_TICK,
  FEAR_FOR_ALLY_DEATH,
  FEAR_INJURY_MUL,
  FEAR_OUTNUMBERED,
  FEAR_ROUTING_CASCADE,
  fearDecayPerTick,
  isRouting,
  LEADER_AURA_FEAR_REDUCTION,
  BANNER_AURA_FEAR_REDUCTION,
  AURA_RADIUS_m,
  RALLY_COOLDOWN_TICKS,
} from "../morale.js";
import { KernelContext } from "../context.js";

/**
 * Per-entity morale update — accumulates fear from all sources and applies decay.
 * Emits a MoraleRoute trace event whenever the entity crosses the routing threshold.
 */
export function stepMoraleForEntity(
  world: WorldState,
  e: Entity,
  index: WorldIndex,
  spatial: SpatialIndex,
  aliveBeforeTick: Set<number>,
  teamRoutingFrac: Map<number, number>,
  trace: TraceSink,
  ctx: KernelContext,
): void {
  if (e.injury.dead) return;

  const distressTol = e.attributes.resilience.distressTolerance;
  const MORALE_RADIUS_m = Math.trunc(30 * SCALE.m); // 30 m awareness radius

  const nearbyIds = queryNearbyIds(spatial, e.position_m, MORALE_RADIUS_m);

  let nearbyAllyCount = 0;
  let nearbyEnemyCount = 0;
  let allyDeathsThisTick = 0;

  for (const nId of nearbyIds) {
    if (nId === e.id) continue;
    const neighbor = index.byId.get(nId);
    if (!neighbor) continue;

    if (neighbor.teamId === e.teamId) {
      if (!neighbor.injury.dead) {
        nearbyAllyCount++;
      } else if (aliveBeforeTick.has(nId)) {
        allyDeathsThisTick++;
      }
    } else if (!neighbor.injury.dead) {
      nearbyEnemyCount++;
    }
  }

  // Feature 6: berserk entities ignore all fear — always clear fear and return early
  const fearResponse = (e.attributes.resilience).fearResponse ?? "flight";
  if (fearResponse === "berserk") {
    e.condition.fearQ = q(0);
    return;
  }

  let fearQ = e.condition.fearQ!;
  const wasRouting = isRouting(fearQ, distressTol);

  // 1. Suppression ticks add fear per tick — scaled by caliber multiplier (Feature 1)
  if (e.condition.suppressedTicks > 0) {
    const supMul = e.condition.suppressionFearMul ?? (SCALE.Q as Q);
    fearQ = clampQ(fearQ + qMul(FEAR_PER_SUPPRESSION_TICK, supMul), 0, SCALE.Q);
  }
  // 2. Ally deaths this tick — with diminishing returns (Feature 2)
  if (allyDeathsThisTick > 0) {
    // Reset window if last death was >100 ticks ago (5s at TICK_HZ=20)
    if (world.tick - e.condition.lastAllyDeathTick > 100) {
      e.condition.recentAllyDeaths = 0;
    }
    // Multiplier: q(1.0) for first death, -q(0.15) per prior, floor q(0.40)
    const mul = Math.max(q(0.40), q(1.0) - Math.trunc(e.condition.recentAllyDeaths * 1500)) as Q;
    fearQ = clampQ(fearQ + Math.trunc(allyDeathsThisTick * qMul(FEAR_FOR_ALLY_DEATH, mul)), 0, SCALE.Q);
    e.condition.recentAllyDeaths += allyDeathsThisTick;
    e.condition.lastAllyDeathTick = world.tick;
  }
  // 3. Self-injury (shock accumulation) adds fear per tick
  fearQ = clampQ(fearQ + qMul(e.injury.shock, FEAR_INJURY_MUL), 0, SCALE.Q);
  // 4. Being outnumbered by visible enemies adds fear per tick
  // Include self in friendly count: entity + its allies vs enemies.
  if (nearbyEnemyCount > nearbyAllyCount + 1) {
    fearQ = clampQ(fearQ + FEAR_OUTNUMBERED, 0, SCALE.Q);
  }
  // 5. Routing cascade: more than half the team is already routing
  if ((teamRoutingFrac.get(e.teamId) ?? 0) > 0.50) {
    fearQ = clampQ(fearQ + FEAR_ROUTING_CASCADE, 0, SCALE.Q);
  }

  // Fear decay — faster with high tolerance and nearby allies (cohesion)
  fearQ = clampQ(fearQ - fearDecayPerTick(distressTol, nearbyAllyCount), 0, SCALE.Q);

  // Feature 3: leader and standard-bearer aura decay
  let leaderCount = 0;
  let bannerCount = 0;
  const auraIds = queryNearbyIds(spatial, e.position_m, AURA_RADIUS_m);
  for (const aId of auraIds) {
    if (aId === e.id) continue;
    const ally = index.byId.get(aId);
    if (!ally || ally.injury.dead || ally.teamId !== e.teamId) continue;
    const traits: string[] = ally.traits ?? [];
    if (traits.includes("leader")) leaderCount++;
    if (traits.includes("standardBearer")) bannerCount++;
  }
  if (leaderCount > 0) {
    fearQ = clampQ(fearQ - leaderCount * LEADER_AURA_FEAR_REDUCTION, 0, SCALE.Q);
  }
  if (bannerCount > 0) {
    fearQ = clampQ(fearQ - bannerCount * BANNER_AURA_FEAR_REDUCTION, 0, SCALE.Q);
  }

  // Phase 6: cover provides a psychological safety bonus
  const moraleCellSize = ctx.cellSize_m ?? Math.trunc(4 * SCALE.m);
  const coverForMorale = ctx.obstacleGrid
    ? coverFractionAtPosition(ctx.obstacleGrid, moraleCellSize, e.position_m.x, e.position_m.y)
    : 0;
  if (coverForMorale > q(0.5)) {
    fearQ = clampQ(fearQ - q(0.01), 0, SCALE.Q);
  }

  // Feature 5: rally — detect routing → normal transition and set cooldown
  const nowRouting = isRouting(fearQ, distressTol);
  if (wasRouting && !nowRouting) {
    e.condition.rallyCooldownTicks = RALLY_COOLDOWN_TICKS;
  }
  e.condition.fearQ = fearQ;

  // Emit trace when routing state crosses threshold
  if (!wasRouting && nowRouting) {
    trace.onEvent({ kind: TraceKinds.MoraleRoute, tick: world.tick, entityId: e.id, fearQ });
  } else if (wasRouting && !nowRouting) {
    trace.onEvent({ kind: TraceKinds.MoraleRally, tick: world.tick, entityId: e.id, fearQ }); // Phase 18
  }
}