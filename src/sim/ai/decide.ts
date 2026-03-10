import type { Entity } from "../entity.js";
import type { WorldState } from "../world.js";
import type { WorldIndex } from "../indexing.js";
import type { SpatialIndex } from "../spatial.js";
import type { Command } from "../commands.js";
import { q, clampQ, qMul, mulDiv, SCALE, type I32, Q } from "../../units.js";
import { pickTarget, updateFocus } from "./targeting.js";
import type { AIPolicy } from "./types.js";
import { findWeapon } from "../../equipment.js";
import { v3, normaliseDirCheapQ } from "../vec3.js";
import { DEFAULT_PERCEPTION, DEFAULT_SENSORY_ENV, type SensoryEnvironment } from "../sensory.js";
import { isRouting, moraleThreshold } from "../morale.js";
import { eventSeed } from "../seeds.js";
import { type ObstacleGrid, coverFractionAtPosition, terrainKey } from "../terrain.js";
import { getSkill } from "../skills.js";
import { TICK_HZ } from "../tick.js";
import { effectiveStanding, STANDING_FRIENDLY_THRESHOLD, type FactionRegistry } from "../../faction.js";
import {
  computeEffectiveRetreatRange,
  computeDefenceIntensityBoost,
  applyLoyaltyBias,
  applyOpportunismBias,
  computeEffectiveLoyalty,
} from "./personality.js";

type DefenceMode = "none" | "block" | "parry" | "dodge";

export function decideCommandsForEntity(
  world: WorldState,
  index: WorldIndex,
  spatial: SpatialIndex,
  self: Entity,
  policy: AIPolicy,
  env: SensoryEnvironment = DEFAULT_SENSORY_ENV,
  obstacleGrid?: ObstacleGrid,
  cellSize_m?: I32,
): readonly Command[] {
  if (self.injury.dead) return [];

  // Feature 4: surrendered entities are permanently passive
  if ((self.condition).surrendered) {
    return [
      { kind: "defend", mode: "none" as DefenceMode, intensity: q(0) },
      { kind: "setProne", prone: true },
    ];
  }

  // tick down AI cooldowns
  if (!self.ai) self.ai = { focusTargetId: 0, retargetCooldownTicks: 0, decisionCooldownTicks: 0 };
  if ((self.ai).decisionCooldownTicks === undefined) (self.ai).decisionCooldownTicks = 0;
  self.ai.retargetCooldownTicks = Math.max(0, self.ai.retargetCooldownTicks - 1);
  self.ai.decisionCooldownTicks = Math.max(0, self.ai.decisionCooldownTicks - 1);

  // Phase 4: decision latency — while cooling down, skip replanning and repeat current intent.
  if (self.ai.decisionCooldownTicks > 0) {
    // Emit the same defend and move as last tick (intent is already set from previous tick).
    return [];
  }

  // Charge latency for next decision cycle
  const perc = (self.attributes).perception ?? DEFAULT_PERCEPTION;
  // Phase 7: tactics.hitTimingOffset_s reduces decision latency (max 50% reduction)
  const tacticsSkill = getSkill(self.skills, "tactics");
  const adjustedLatency_s = Math.max(
    Math.trunc(perc.decisionLatency_s / 2),
    perc.decisionLatency_s + tacticsSkill.hitTimingOffset_s,
  );
  // Phase 33: logicalMathematical reduces decision latency (faster tactical processing)
  // Formula: mul = q(1.20) − logMath × q(0.40); human (0.60) → ×0.96; Vulcan (0.95) → ×0.82
  const logMath = self.attributes.cognition?.logicalMathematical ?? 0;
  const logLatencyMul: Q = logMath
    ? clampQ((q(1.20) - Math.trunc(mulDiv(q(0.40), logMath, SCALE.Q))) as Q, q(0.50), q(1.20))
    : SCALE.Q as Q;
  const scaledLatency_s = logMath ? mulDiv(adjustedLatency_s, logLatencyMul, SCALE.Q) : adjustedLatency_s;
  const latencyTicks = Math.max(1, Math.trunc((scaledLatency_s * TICK_HZ) / SCALE.s));
  self.ai.decisionCooldownTicks = latencyTicks;

  // Phase 5: morale states — routing flees; hesitant suppresses attacks
  const fearQ = (self.condition).fearQ ?? q(0);
  const distressTol = self.attributes.resilience.distressTolerance;
  const fearResp = (self.attributes.resilience).fearResponse ?? "flight";

  // Phase 47: personality-driven overrides
  const personality = self.personality;

  // Feature 6: berserk entities never route or hesitate
  // Phase 47: high-aggression entities (> q(0.70)) also override hesitation
  const isHesitant = fearResp !== "berserk" &&
    !isRouting(fearQ, distressTol) &&
    fearQ >= qMul(moraleThreshold(distressTol), q(0.70)) &&
    (!personality || personality.aggression < q(0.70));

  if (fearResp !== "berserk" && isRouting(fearQ, distressTol)) {
    // Feature 6: freeze archetype routes by freezing instead of fleeing
    if (fearResp === "freeze") {
      return [];
    }

    // Feature 4: panic action variety — seeded surrender/freeze/flee roll
    const panicSeed = eventSeed(world.seed, world.tick, self.id, 0, 0xFA115);
    const surrenderChance = Math.trunc(qMul(q(0.10), (SCALE.Q - distressTol) as Q));
    const freezeChance    = Math.trunc(qMul(q(0.15), (SCALE.Q - distressTol) as Q));
    const r = panicSeed % SCALE.Q;
    if (r < surrenderChance) {
      (self.condition).surrendered = true;
      return [
        { kind: "defend", mode: "none" as DefenceMode, intensity: q(0) },
        { kind: "setProne", prone: true },
      ];
    }
    if (r < surrenderChance + freezeChance) {
      return [];
    }

    const nearestThreat = pickTarget(world, self, index, spatial, policy, env);
    if (nearestThreat) {
      const fdx = self.position_m.x - nearestThreat.position_m.x;
      const fdy = self.position_m.y - nearestThreat.position_m.y;
      return [
        { kind: "defend", mode: "none" as DefenceMode, intensity: q(0) },
        {
          kind: "move",
          dir: normaliseDirCheapQ(v3(fdx !== 0 || fdy !== 0 ? fdx : 1, fdy, 0)),
          intensity: q(1.0),
          mode: "sprint",
        },
      ];
    }
    return [{ kind: "defend", mode: "none" as DefenceMode, intensity: q(0) }];
  }

  // Phase 3 extension: suppression response — go prone when sustained under fire (low distressTol only)
  const suppressedTicks = (self.condition).suppressedTicks ?? 0;
  if (suppressedTicks >= 3 && distressTol < q(0.50)) {
    const suppCmds: Command[] = [{ kind: "defend", mode: "none" as DefenceMode, intensity: q(0) }];
    if (!self.condition.prone) {
      suppCmds.push({ kind: "setProne", prone: true });
    }
    return suppCmds;
  }

  let target = pickTarget(world, self, index, spatial, policy, env);

  // Phase 47: personality-driven target bias (loyalty before opportunism)
  const effectiveLoyalty = computeEffectiveLoyalty(self, world);
  target = applyLoyaltyBias(self, world, target, effectiveLoyalty);
  if (personality) {
    target = applyOpportunismBias(self, world, target, personality.opportunism);
  }

  // Phase 24: faction standing — suppress attack on friendly entities.
  // Self-defence override: if self has taken damage (shock > 0 or fluid loss > 0),
  // faction check is bypassed (attacker is fought back regardless of standing).
  if (target && self.faction) {
    const factionRegistry = (world).__factionRegistry as FactionRegistry | undefined;
    if (factionRegistry) {
      const standing = effectiveStanding(factionRegistry, self, target);
      const selfDefence = self.injury.shock > 0 || self.injury.fluidLoss > 0;
      if (!selfDefence && standing >= STANDING_FRIENDLY_THRESHOLD) {
        target = undefined;
      }
    }
  }

  updateFocus(self, target, policy);

  // Default defend
  let defendMode: DefenceMode = "none";
  let defendIntensity = q(0);

  if (target) {
    const dx = target.position_m.x - self.position_m.x;
    const dy = target.position_m.y - self.position_m.y;
    const d2 = BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy);

    const threatR = Math.max(1, policy.threatRange_m);
    const threatD2 = BigInt(threatR) * BigInt(threatR);

    if (d2 < threatD2) {
      defendMode = pickDefenceModeDeterministic(policy);
      // Phase 47: caution boosts/reduces defence intensity (±q(0.20) max at extremes)
      defendIntensity = personality
        ? computeDefenceIntensityBoost(policy.defendWhenThreatenedQ, personality.caution)
        : clampQ(policy.defendWhenThreatenedQ, q(0), q(1.0));
    }
  }

  const cmds: Command[] = [];
  cmds.push({ kind: "defend", mode: defendMode, intensity: defendIntensity });

  if (!target) {
    // still emit a “no move”
    cmds.push({ kind: "move", dir: v3(0, 0, 0), intensity: q(0), mode: "walk" });
    return cmds;
  }

  // movement: try to maintain desired range
  const dx = target.position_m.x - self.position_m.x;
  const dy = target.position_m.y - self.position_m.y;
  const distApprox = approxDist(dx, dy);

  const want = policy.desiredRange_m;
  const engage = policy.engageRange_m;

  // Move toward if too far, back off if too close
  // Phase 47: aggression shifts the effective retreat range (aggressive → less retreat)
  const effectiveRetreatRange = personality
    ? computeEffectiveRetreatRange(policy.retreatRange_m, personality.aggression)
    : policy.retreatRange_m;
  let dirX = 0, dirY = 0;
  if (distApprox > want) { dirX = dx; dirY = dy; }
  else if (distApprox < effectiveRetreatRange) { dirX = -dx; dirY = -dy; }

  let moveMode: "sprint" | "run" | "walk" = distApprox > engage ? "sprint" : "run";

  // Phase 6: cover-seeking — if exposed to enemies with no cover, move toward the best adjacent cell.
  const aiCellSize = cellSize_m ?? Math.trunc(4 * SCALE.m);
  const selfCoverQ = obstacleGrid
    ? coverFractionAtPosition(obstacleGrid, aiCellSize, self.position_m.x, self.position_m.y)
    : 0;
  const coverThreshold: Q = suppressedTicks > 0 ? q(0.50) : q(0.30);
  if (selfCoverQ < coverThreshold && !isRouting(fearQ, distressTol)) {
    const enemyCount = world.entities.filter(
      en => en.teamId !== self.teamId && !en.injury.dead &&
        approxDist(en.position_m.x - self.position_m.x, en.position_m.y - self.position_m.y) < Math.trunc(30 * SCALE.m),
    ).length;
    if (enemyCount > 0) {
      const coverDir = findBestCoverDir(self, obstacleGrid, aiCellSize);
      if (coverDir) {
        dirX = coverDir.x;
        dirY = coverDir.y;
        moveMode = "run";
      }
    }
  }

  if (dirX !== 0 || dirY !== 0) {
    cmds.push({
      kind: "move",
      dir: normaliseDirCheapQ(v3(dirX, dirY, 0)),
      intensity: q(1.0),
      mode: moveMode,
    });
  } else {
    cmds.push({
      kind: "move",
      dir: v3(0, 0, 0),
      intensity: q(0),
      mode: "walk",
    });
  }

  // attack when within engage range — hesitant or rallying entities hold back
  const weapon = findWeapon(self.loadout, undefined);
  const isRallying = ((self.condition).rallyCooldownTicks ?? 0) > 0;
  if (weapon && !isHesitant && !isRallying) {
    const reach = weapon.reach_m ?? Math.trunc(self.attributes.morphology.stature_m * 0.45);
    if (distApprox <= reach + Math.trunc(0.25 * SCALE.m)) {
      cmds.push({
        kind: "attack",
        targetId: target.id,
        weaponId: weapon.id,
        intensity: q(1.0),
        mode: "strike",
      });
    }
  }

  return cmds;
}

function pickDefenceModeDeterministic(policy: AIPolicy): DefenceMode {
  // Deterministic selection (no RNG): allow dodge path.
  // If dodge preference is strong, dodge. Else if parry preference strong, parry. Else block.
  if (policy.dodgeBiasQ > policy.parryBiasQ && policy.dodgeBiasQ > q(0.50)) return "dodge";
  if (policy.parryBiasQ > q(0.35)) return "parry";
  return "block";
}

function approxDist(dx: number, dy: number): number {
  const adx = dx < 0 ? -dx : dx;
  const ady = dy < 0 ? -dy : dy;
  return adx > ady ? adx + (ady >> 1) : ady + (adx >> 1);
}

/**
 * Scan the 8 adjacent cells and return a direction toward the one with the highest
 * cover fraction that is better than the current cell (and not impassable).
 * Returns undefined if already at the local cover maximum.
 */
function findBestCoverDir(
  self: Entity,
  grid: ObstacleGrid | undefined,
  cellSize_m: I32,
): { x: number; y: number; z: number } | undefined {
  if (!grid) return undefined;
  const cs = Math.max(1, cellSize_m);
  const cx = Math.trunc(self.position_m.x / cs);
  const cy = Math.trunc(self.position_m.y / cs);
  const currentCover = grid.get(terrainKey(cx, cy)) ?? 0;

  let bestCover = currentCover;
  let bestDx = 0, bestDy = 0;
  for (let ddx = -1; ddx <= 1; ddx++) {
    for (let ddy = -1; ddy <= 1; ddy++) {
      if (ddx === 0 && ddy === 0) continue;
      const frac = grid.get(terrainKey(cx + ddx, cy + ddy)) ?? 0;
      // Prefer higher cover but skip impassable cells (q(1.0) = SCALE.Q)
      if (frac > bestCover && frac < SCALE.Q) {
        bestCover = frac;
        bestDx = ddx;
        bestDy = ddy;
      }
    }
  }

  if (bestDx === 0 && bestDy === 0) return undefined;
  return { x: bestDx, y: bestDy, z: 0 };
}