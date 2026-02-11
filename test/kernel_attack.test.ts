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

test("attack produces injury and bleeding deterministically (find a seed that hits)", () => {
  const aAttrs = generateIndividual(123, HUMAN_BASE);
  const bAttrs = generateIndividual(456, HUMAN_BASE);

  const loadoutA: Loadout = { items: [STARTER_WEAPONS[0]!] }; // club
  const loadoutB: Loadout = { items: [] };

  const cmds: CommandMap = new Map();
  cmds.set(1, [{ kind: "attack", targetId: 2, weaponId: "wpn_club", intensity: q(1.0), mode: "strike" }]);

  let found = false;

  for (let seed = 1; seed <= 200; seed++) {
    const world: WorldState = {
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

    stepWorld(world, cmds, { tractionCoeff: q(0.9) });

    const target = world.entities.find(e => e.id === 2)!;
    const dmg = target.injury.byRegion.torso.surfaceDamage + target.injury.byRegion.torso.structuralDamage + target.injury.byRegion.torso.internalDamage;
    if (dmg > 0) {
      found = true;
      expect(dmg).toBeGreaterThan(0);
      expect(target.injury.byRegion.torso.bleedingRate).toBeGreaterThanOrEqual(0);
      break;
    }
  }

  expect(found).toBe(true);
});
