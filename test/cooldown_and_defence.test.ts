import { expect, test } from "vitest";

import { q, SCALE } from "../src/units";
import { STARTER_ARMOUR, STARTER_WEAPONS, type Loadout } from "../src/equipment";

import { ALL_REGIONS } from "../src/sim/body";
import type { CommandMap } from "../src/sim/commands";
import { stepWorld } from "../src/sim/kernel";
import type { WorldState } from "../src/sim/world";

import { mkHumanoidEntity, mkWorld } from "./helpers/entities";

const CLUB_ID = "wpn_club";

function totalDamage(world: WorldState): number {
  const target = world.entities.find(e => e.id === 2)!;
  const inj = target.injury;

  let sum = 0;
  for (const r of ALL_REGIONS) {
    const rr = inj.byRegion[r];
    sum += rr.surfaceDamage + rr.internalDamage + rr.structuralDamage;
  }
  return sum;
}

function mkClubLoadout(): Loadout {
  const club = STARTER_WEAPONS.find(w => w.id === CLUB_ID);
  if (!club) throw new Error(`Missing starter weapon: ${CLUB_ID}`);
  return { items: [club] };
}

function runDuel(
  seed: number,
  defendMode: "none" | "block" | "parry" | "dodge",
  targetLoadout: Loadout,
  ticks = 60
): number {
  const attacker = mkHumanoidEntity(1, 1, 0, 0);
  const target = mkHumanoidEntity(2, 2, Math.trunc(0.55 * SCALE.m), 0);

  attacker.loadout = mkClubLoadout();
  target.loadout = targetLoadout;

  // Keep defence probabilities non-trivial and stable.
  attacker.attributes.control.controlQuality = q(0.95);
  attacker.attributes.control.fineControl = q(0.95);
  target.attributes.control.controlQuality = q(0.95);
  target.attributes.control.stability = q(0.95);

  const world = mkWorld(seed, [attacker, target]);

  const cmds: CommandMap = new Map();
  cmds.set(1, [{ kind: "attack", targetId: 2, weaponId: CLUB_ID, intensity: q(1.0) }]);
  cmds.set(2, [{ kind: "defend", mode: defendMode, intensity: q(1.0) }]);

  for (let i = 0; i < ticks; i++) {
    stepWorld(world, cmds, { tractionCoeff: q(0.9) } as any);
  }

  return totalDamage(world);
}

test("attack cooldown prevents striking every tick", () => {
  const attacker = mkHumanoidEntity(1, 1, 0, 0);
  const target = mkHumanoidEntity(2, 2, Math.trunc(0.55 * SCALE.m), 0);

  attacker.loadout = mkClubLoadout();
  target.loadout = { items: [] };

  const world = mkWorld(777, [attacker, target]);

  const cmds: CommandMap = new Map();
  cmds.set(1, [{ kind: "attack", targetId: 2, weaponId: CLUB_ID, intensity: q(1.0) }]);

  stepWorld(world, cmds, { tractionCoeff: q(0.9) } as any);
  const after1 = totalDamage(world);

  stepWorld(world, cmds, { tractionCoeff: q(0.9) } as any);
  const after2 = totalDamage(world);

  expect(after2).toBe(after1);
});

test("block/parry reduces delivered damage on average", () => {
  const bare: Loadout = { items: [] };

  let noneSum = 0;
  let blockSum = 0;
  let parrySum = 0;

  for (let i = 0; i < 80; i++) {
    const seed = 5000 + i;
    noneSum += runDuel(seed, "none", bare);
    blockSum += runDuel(seed, "block", bare);
    parrySum += runDuel(seed, "parry", bare);
  }

  expect(blockSum).toBeLessThan(noneSum);
  expect(parrySum).toBeLessThanOrEqual(blockSum);
});

test("armour coverage + penetration reduces damage on average", () => {
  const bare: Loadout = { items: [] };
  const arm: Loadout = { items: [STARTER_ARMOUR[1]!] };

  let bareSum = 0;
  let armSum = 0;

  for (let i = 0; i < 100; i++) {
    const seed = 3000 + i;
    bareSum += runDuel(seed, "none", bare);
    armSum += runDuel(seed, "none", arm);
  }

  expect(armSum).toBeLessThan(bareSum);
});