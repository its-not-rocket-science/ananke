import type { Entity } from "../entity";
import type { WorldState } from "../world";
import type { WorldIndex } from "../indexing";
import type { SpatialIndex } from "../spatial";
import type { Command } from "../commands";
import { q, clampQ, SCALE } from "../../units";
import { pickTarget, updateFocus } from "./targeting";
import type { AIPolicy } from "./types";
import { findWeapon } from "../../equipment";
import { v3, normaliseDirCheapQ } from "../vec3";

type DefenceMode = "none" | "block" | "parry" | "dodge";

export function decideCommandsForEntity(
  world: WorldState,
  index: WorldIndex,
  spatial: SpatialIndex,
  self: Entity,
  policy: AIPolicy
): readonly Command[] {
  if (self.injury.dead) return [];

  // tick down AI cooldown
  if (!self.ai) self.ai = { focusTargetId: 0, retargetCooldownTicks: 0 };
  self.ai.retargetCooldownTicks = Math.max(0, self.ai.retargetCooldownTicks - 1);

  const target = pickTarget(world.seed, world.tick, self, index, spatial, policy);
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

  // attack when within engage range (explicit targetId, deterministic)
  const weapon = findWeapon(self.loadout, undefined);
  if (weapon) {
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