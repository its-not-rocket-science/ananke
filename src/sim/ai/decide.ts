import type { Entity } from "../entity.js";
import type { WorldState } from "../world.js";
import type { WorldIndex } from "../indexing.js";
import type { SpatialIndex } from "../spatial.js";
import type { Command } from "../commands.js";
import { q, clampQ, qMul, SCALE } from "../../units.js";
import { pickTarget, updateFocus } from "./targeting.js";
import type { AIPolicy } from "./types.js";
import { findWeapon } from "../../equipment.js";
import { v3, normaliseDirCheapQ } from "../vec3.js";
import { DEFAULT_PERCEPTION, DEFAULT_SENSORY_ENV, type SensoryEnvironment } from "../sensory.js";
import { isRouting, moraleThreshold } from "../morale.js";

// Local constant — avoids circular dependency with kernel.ts which exports TICK_HZ.
const TICK_HZ = 20;

type DefenceMode = "none" | "block" | "parry" | "dodge";

export function decideCommandsForEntity(
  world: WorldState,
  index: WorldIndex,
  spatial: SpatialIndex,
  self: Entity,
  policy: AIPolicy,
  env: SensoryEnvironment = DEFAULT_SENSORY_ENV,
): readonly Command[] {
  if (self.injury.dead) return [];

  // tick down AI cooldowns
  if (!self.ai) self.ai = { focusTargetId: 0, retargetCooldownTicks: 0, decisionCooldownTicks: 0 };
  if ((self.ai as any).decisionCooldownTicks === undefined) (self.ai as any).decisionCooldownTicks = 0;
  self.ai.retargetCooldownTicks = Math.max(0, self.ai.retargetCooldownTicks - 1);
  self.ai.decisionCooldownTicks = Math.max(0, self.ai.decisionCooldownTicks - 1);

  // Phase 4: decision latency — while cooling down, skip replanning and repeat current intent.
  if (self.ai.decisionCooldownTicks > 0) {
    // Emit the same defend and move as last tick (intent is already set from previous tick).
    return [];
  }

  // Charge latency for next decision cycle
  const perc = (self.attributes as any).perception ?? DEFAULT_PERCEPTION;
  const latencyTicks = Math.max(1, Math.trunc((perc.decisionLatency_s * TICK_HZ) / SCALE.s));
  self.ai.decisionCooldownTicks = latencyTicks;

  // Phase 5: morale states — routing flees; hesitant suppresses attacks
  const fearQ = (self.condition as any).fearQ ?? q(0);
  const distressTol = self.attributes.resilience.distressTolerance;
  // Hesitant: >70 % of morale threshold but not yet routing — refuse to initiate attacks
  const isHesitant = !isRouting(fearQ, distressTol) &&
    fearQ >= qMul(moraleThreshold(distressTol), q(0.70));

  if (isRouting(fearQ, distressTol)) {
    const nearestThreat = pickTarget(world.seed, world.tick, self, index, spatial, policy, env);
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

  const target = pickTarget(world.seed, world.tick, self, index, spatial, policy, env);
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
      defendIntensity = clampQ(policy.defendWhenThreatenedQ, q(0), q(1.0));
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
  let dirX = 0, dirY = 0;
  if (distApprox > want) { dirX = dx; dirY = dy; }
  else if (distApprox < policy.retreatRange_m) { dirX = -dx; dirY = -dy; }

  if (dirX !== 0 || dirY !== 0) {
    cmds.push({
      kind: "move",
      dir: normaliseDirCheapQ(v3(dirX, dirY, 0)),
      intensity: q(1.0),
      mode: distApprox > engage ? "sprint" : "run",
    });
  } else {
    cmds.push({
      kind: "move",
      dir: v3(0, 0, 0),
      intensity: q(0),
      mode: "walk",
    });
  }

  // attack when within engage range — hesitant entities hold back
  const weapon = findWeapon(self.loadout, undefined);
  if (weapon && !isHesitant) {
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