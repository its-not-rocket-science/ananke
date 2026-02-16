import { expect, test } from "vitest";
import { q } from "../src/units";
import { TUNING } from "../src/sim/tuning";
import { stepWorld } from "../src/sim/kernel";
import { generateIndividual } from "../src/generate";
import { HUMAN_BASE } from "../src/archetypes";
import { defaultCondition } from "../src/sim/condition";
import { defaultInjury } from "../src/sim/injury";
import { defaultIntent } from "../src/sim/intent";
import { defaultAction } from "../src/sim/action";
import { v3 } from "../src/sim/vec3";

function mkEntity(id: number) {
  const attrs = generateIndividual(id * 100, HUMAN_BASE);
  return {
    id,
    attributes: attrs,
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items: [] },
    traits: [],
    position_m: v3(0, 0, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(),
    action: defaultAction(),
    condition: defaultCondition(),
    injury: defaultInjury(),
  };
}

test("tactical: standing is delayed; arcade: standing is instant", () => {
  const a = mkEntity(1);
  a.condition.prone = true;

  // injure legs heavily
  a.injury.byRegion.leftLeg.structuralDamage = q(0.9);
  a.injury.byRegion.rightLeg.structuralDamage = q(0.9);

  const worldA = { tick: 0, seed: 1, entities: [structuredClone(a)] };
  const worldT = { tick: 0, seed: 1, entities: [structuredClone(a)] };

  // attempt to stand
  const cmds = new Map<number, any[]>();
  cmds.set(1, [{ kind: "setProne", prone: false }]);

  stepWorld(worldA as any, cmds as any, { tractionCoeff: q(0.9), tuning: TUNING.arcade });
  stepWorld(worldT as any, cmds as any, { tractionCoeff: q(0.9), tuning: TUNING.tactical });

  expect(worldA.entities[0]?.condition.prone).toBe(false);
  expect(worldT.entities[0]?.condition.prone).toBe(true);
  expect(worldT.entities[0]?.condition.standBlockedTicks).toBeGreaterThan(0);
});

test("sim: unconscious drops weapons; tactical: keeps them", () => {
  const eSim = mkEntity(1);
  const eTac = mkEntity(1);

  // give both a weapon
  eSim.loadout.items = [{ kind: "weapon", id: "club", name: "Club", mass_kg: 1000, bulk: q(0.2), strikeEffectiveMassFrac: q(0.4), damage: { surfaceFrac: q(0.4), internalFrac: q(0.4), structuralFrac: q(0.2), bleedFactor: q(0.5), penetrationBias: q(0.2) } }] as any;
  eTac.loadout.items = structuredClone(eSim.loadout.items);

  // KO them
  eSim.injury.consciousness = q(0);
  eTac.injury.consciousness = q(0);

  const wSim = { tick: 0, seed: 2, entities: [eSim] };
  const wTac = { tick: 0, seed: 2, entities: [eTac] };

  stepWorld(wSim as any, new Map() as any, { tractionCoeff: q(0.9), tuning: TUNING.sim });
  stepWorld(wTac as any, new Map() as any, { tractionCoeff: q(0.9), tuning: TUNING.tactical });

  expect(wSim.entities[0]?.condition.unconsciousTicks).toBeGreaterThan(0);
  expect(wTac.entities[0]?.condition.unconsciousTicks).toBeGreaterThan(0);

  expect(wSim.entities[0]?.loadout.items.some((it: any) => it.kind === "weapon")).toBe(false);
  expect(wTac.entities[0]?.loadout.items.some((it: any) => it.kind === "weapon")).toBe(true);
});