import { expect, test } from "vitest";
import { generateIndividual } from "../src/generate";
import { HUMAN_BASE } from "../src/archetypes";
import { q, SCALE } from "../src/units";
import { STARTER_WEAPONS, STARTER_ARMOUR, type Loadout } from "../src/equipment";

import { stepWorld } from "../src/sim/kernel";
import { defaultCondition } from "../src/sim/condition";
import { defaultInjury } from "../src/sim/injury";
import { defaultIntent } from "../src/sim/intent";
import { defaultAction } from "../src/sim/action";
import { v3 } from "../src/sim/vec3";
import type { WorldState } from "../src/sim/world";
import type { CommandMap } from "../src/sim/commands";
import { ALL_REGIONS } from "../src/sim/body";

function mkWorld(seed: number, aAttrs: any, bAttrs: any, loadoutA: Loadout, loadoutB: Loadout): WorldState {
  return {
    tick: 0,
    seed,
    entities: [
      {
        id: 1,
        attributes: aAttrs,
        energy: { reserveEnergy_J: aAttrs.performance.reserveEnergy_J, fatigue: q(0) },
        loadout: loadoutA,
        traits: [],
        position_m: v3(0, 0, 0),
        velocity_mps: v3(0, 0, 0),
        intent: defaultIntent(),
        action: defaultAction(),
        condition: defaultCondition(),
        injury: defaultInjury(),
      },
      {
        id: 2,
        attributes: bAttrs,
        energy: { reserveEnergy_J: bAttrs.performance.reserveEnergy_J, fatigue: q(0) },
        loadout: loadoutB,
        traits: [],
        position_m: v3(Math.trunc(0.6 * SCALE.m), 0, 0),
        velocity_mps: v3(0, 0, 0),
        intent: defaultIntent(),
        action: defaultAction(),
        condition: defaultCondition(),
        injury: defaultInjury(),
      },
    ],
  };
}

function totalDamage(w: WorldState): number {
  const inj = w.entities[1]!.injury;
  let sum = 0;
  for (const r of ALL_REGIONS) {
    const rr = inj.byRegion[r];
    sum += (rr?.surfaceDamage ?? 0) + (rr?.internalDamage ?? 0) + (rr?.structuralDamage ?? 0);
  }
  return sum;
}

test("attack cooldown prevents striking every tick", () => {
  const aAttrs = generateIndividual(1, HUMAN_BASE);
  const bAttrs = generateIndividual(2, HUMAN_BASE);

  const loadoutA: Loadout = { items: [STARTER_WEAPONS[0]!] };
  const world = mkWorld(777, aAttrs, bAttrs, loadoutA, { items: [] });

  const cmds: CommandMap = new Map();
  cmds.set(1, [{ kind: "attack", targetId: 2, weaponId: "wpn_club", intensity: q(1.0) }]);

  stepWorld(world, cmds, { tractionCoeff: q(0.9) });
  const after1 = totalDamage(world);

  stepWorld(world, cmds, { tractionCoeff: q(0.9) });
  const after2 = totalDamage(world);

  expect(after2).toBe(after1);
});

test("block/parry reduces delivered damage (find a seed where defence changes outcome)", () => {
  const aAttrs = generateIndividual(10, HUMAN_BASE);
  const bAttrs = generateIndividual(11, HUMAN_BASE);

  const wClub = STARTER_WEAPONS[0]!;
  const loadoutA: Loadout = { items: [wClub] };

  const baseAtk: CommandMap = new Map();
  baseAtk.set(1, [{ kind: "attack", targetId: 2, weaponId: wClub.id, intensity: q(1.0) }]);

  const run = (seed: number, defMode: "none" | "block" | "parry") => {
    const w = mkWorld(seed, aAttrs, bAttrs, loadoutA, { items: [] });
    const cmds: CommandMap = new Map(baseAtk);
    if (defMode !== "none") cmds.set(2, [{ kind: "defend", mode: defMode, intensity: q(1.0) }]);
    stepWorld(w, cmds, { tractionCoeff: q(0.9) });
    return totalDamage(w);
  };

  let found = false;
  for (let seed = 1; seed <= 20000; seed++) {
    const none = run(seed, "none");
    if (none <= 0) continue;

    const block = run(seed, "block");
    const parry = run(seed, "parry");

    // Defence can reduce damage either by mitigating (block/parry) or by converting the hit to a miss.
    const defenceChanged = block < none || parry < none;
    if (!defenceChanged) continue;

    expect(block).toBeLessThanOrEqual(none);
    expect(parry).toBeLessThanOrEqual(none);
    found = true;
    break;
  }

  expect(found).toBe(true);
});

test("armour coverage + penetration reduces damage on average", () => {
  const aAttrs = generateIndividual(20, HUMAN_BASE);
  const bAttrs = generateIndividual(21, HUMAN_BASE);

  const loadoutA: Loadout = { items: [STARTER_WEAPONS[0]!] };
  const loadoutBare: Loadout = { items: [] };
  const loadoutArm: Loadout = { items: [STARTER_ARMOUR[1]!] };

  const strikeOnce = (seed: number, targetLoadout: Loadout) => {
    const w = mkWorld(seed, aAttrs, bAttrs, loadoutA, targetLoadout);
    const cmds: CommandMap = new Map();
    cmds.set(1, [{ kind: "attack", targetId: 2, weaponId: "wpn_club", intensity: q(1.0) }]);
    stepWorld(w, cmds, { tractionCoeff: q(0.9) });
    return totalDamage(w);
  };

  let bareSum = 0;
  let armSum = 0;
  for (let i = 0; i < 30; i++) {
    bareSum += strikeOnce(3000 + i, loadoutBare);
    armSum += strikeOnce(3000 + i, loadoutArm);
  }

  expect(armSum).toBeLessThan(bareSum);
});
