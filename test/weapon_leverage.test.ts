import { expect, test } from "vitest";
import { Loadout, STARTER_WEAPONS } from "../src/equipment";
import { parryLeverageQ } from "../src/sim/combat";
import { generateIndividual } from "../src/generate";
import { HUMAN_BASE } from "../src/archetypes";
import { clampQ, q, qMul, SCALE } from "../src/units";
import { defaultAction } from "../src/sim/action";
import { defaultCondition } from "../src/sim/condition";
import { defaultInjury } from "../src/sim/injury";
import { defaultIntent } from "../src/sim/intent";
import { v3 } from "../src/sim/vec3";
import { EnergyState, Entity, GrappleState, IndividualAttributes } from "../src";

function makeAttacker(attr: object): Entity  {  
  return {
    id: 1,
    teamId: 1,
    loadout: { items: []} as Loadout,
    attributes: {} as IndividualAttributes,
    traits: [],
    position_m: v3(0, 0, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(),
    action: defaultAction(),
    condition: defaultCondition(),
    injury: defaultInjury(),
    energy: {} as EnergyState,
    grapple: {} as GrappleState,
      ...attr
  };
}

test("longer moment arm yields higher parry leverage (club > knife)", () => {
  const club = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;
  const knife = STARTER_WEAPONS.find(w => w.id === "wpn_knife")!;

  const attrs = generateIndividual(123, HUMAN_BASE);

  const attacker = makeAttacker({loadout: { items: [club] } as Loadout, attributes: attrs, energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) } });

  const Lclub = parryLeverageQ(club, attacker);
  const Lknife = parryLeverageQ(knife, attacker);

  expect(Lclub).toBeGreaterThan(Lknife);
});

test("higher leverage reduces parry damage multiplier (club parry mitigates more)", () => {
  const club = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;
  const knife = STARTER_WEAPONS.find(w => w.id === "wpn_knife")!;

  const attrs = generateIndividual(456, HUMAN_BASE);

  const attacker = makeAttacker(attrs);

  const Lclub = parryLeverageQ(club , attacker);
  const Lknife = parryLeverageQ(knife, attacker);

  // This matches the intended parry mitigation shape:
  // m = clamp(0.25 - 0.15*(defenceMul-1), 0.10..0.45)
  const parryMul = (leverage: number) => {
    const defenceMul = leverage; // handedness not applied here (both are oneHand)
    return clampQ(
      q(0.25) - qMul(q(0.15), (defenceMul - SCALE.Q) ),
      q(0.10),
      q(0.45)
    );
  };

  const mClub = parryMul(Lclub);
  const mKnife = parryMul(Lknife);

  // lower multiplier => more mitigation
  expect(mClub).toBeLessThan(mKnife);
});