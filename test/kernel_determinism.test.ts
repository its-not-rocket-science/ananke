import { describe, expect, test } from "vitest";
import { generateIndividual } from "../src/generate";
import { HUMAN_BASE } from "../src/archetypes";
import { q } from "../src/units";

import { stepWorld, DT_S } from "../src/sim/kernel";
import { defaultCondition } from "../src/sim/condition";
import { defaultInjury } from "../src/sim/injury";
import { defaultIntent } from "../src/sim/intent";
import { v3 } from "../src/sim/vec3";
import type { WorldState } from "../src/sim/world";
import { defaultAction } from "../src/sim/action";

test("kernel determinism: same initial state => same after N ticks", () => {
  const attrs = generateIndividual(123, HUMAN_BASE);

  const mkWorld = (): WorldState => ({
    tick: 0,
    seed: 999,
    entities: [{
      id: 1,
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
    }],
  });

  const w1 = mkWorld();
  const w2 = mkWorld();

  const cmds = new Map(); // no commands yet

  for (let i = 0; i < 200; i++) {
    stepWorld(w1, cmds, { tractionCoeff: q(0.9) });
    stepWorld(w2, cmds, { tractionCoeff: q(0.9) });
  }

  expect(w1).toEqual(w2);
});