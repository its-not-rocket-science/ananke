import { expect, test } from "vitest";
import { generateIndividual } from "../src/generate";
import { HUMAN_BASE } from "../src/archetypes";
import { q, SCALE } from "../src/units";
import { STARTER_WEAPONS, type Loadout } from "../src/equipment";
import { stepWorld } from "../src/sim/kernel";
import { defaultCondition } from "../src/sim/condition";
import { defaultInjury } from "../src/sim/injury";
import { defaultIntent } from "../src/sim/intent";
import { defaultAction } from "../src/sim/action";
import { v3 } from "../src/sim/vec3";
import type { WorldState } from "../src/sim/world";
import type { CommandMap } from "../src/sim/commands";
import { ALL_REGIONS } from "../src/sim/body";

function mkWorld(seed: number, aAttrs: any, bAttrs: any, loadoutA: Loadout): WorldState {
  return {
    tick: 0,
    seed,
    entities: [
      {
        id: 1,
        teamId: 1,
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
        teamId: 2,
        attributes: bAttrs,
        energy: { reserveEnergy_J: bAttrs.performance.reserveEnergy_J, fatigue: q(0) },
        loadout: { items: [] },
        traits: [],
        position_m: v3(Math.trunc(50.0 * SCALE.m), 0, 0),
        velocity_mps: v3(0, 0, 0),
        intent: defaultIntent(),
        action: defaultAction(),
        condition: defaultCondition(),
        injury: defaultInjury(),
      },
    ],
  };
}

function displacementX(w: WorldState): number {
  return w.entities[0]!.position_m.x;
}

function totalDamage(w: WorldState): number {
  const inj = w.entities[1]!.injury;
  let sum = 0;
  for (const r of ALL_REGIONS) {
    const rr = inj.byRegion[r];
    sum += rr.surfaceDamage + rr.internalDamage + rr.structuralDamage;
  }
  return sum;
}

test("leg structural damage reduces movement distance", () => {
  const aAttrs = generateIndividual(1, HUMAN_BASE);
  const bAttrs = generateIndividual(2, HUMAN_BASE);
  const loadoutA: Loadout = { items: [] };

  const healthy = mkWorld(100, aAttrs, bAttrs, loadoutA);
  const injured = mkWorld(100, aAttrs, bAttrs, loadoutA);

  injured.entities[0]!.injury.byRegion.leftLeg.structuralDamage = q(0.9);
  injured.entities[0]!.injury.byRegion.rightLeg.structuralDamage = q(0.9);

  const cmds: CommandMap = new Map();
  cmds.set(1, [{ kind: "move", dir: v3(SCALE.Q, 0, 0), intensity: q(1.0), mode: "sprint" }]);

  for (let i = 0; i < 10; i++) {
    stepWorld(healthy, cmds, { tractionCoeff: q(0.9) });
    stepWorld(injured, cmds, { tractionCoeff: q(0.9) });
  }

  expect(displacementX(injured)).toBeLessThan(displacementX(healthy));
});

test("arm structural damage reduces attack effectiveness", () => {
  const aAttrs = generateIndividual(10, HUMAN_BASE);
  const bAttrs = generateIndividual(11, HUMAN_BASE);

  const wpn = STARTER_WEAPONS[0]!;
  const loadoutA: Loadout = { items: [wpn] };

  const healthy = mkWorld(500, aAttrs, bAttrs, loadoutA);
  const injured = mkWorld(500, aAttrs, bAttrs, loadoutA);

  injured.entities[0]!.injury.byRegion.leftArm.structuralDamage = q(0.9);
  injured.entities[0]!.injury.byRegion.rightArm.structuralDamage = q(0.9);

  const cmds: CommandMap = new Map();
  cmds.set(1, [{ kind: "attack", targetId: 2, weaponId: wpn.id, intensity: q(1.0) }]);

  stepWorld(healthy, cmds, { tractionCoeff: q(0.9) });
  stepWorld(injured, cmds, { tractionCoeff: q(0.9) });

  expect(totalDamage(injured)).toBeLessThanOrEqual(totalDamage(healthy));
});
