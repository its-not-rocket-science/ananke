import { expect, test } from "vitest";
import { STARTER_WEAPONS } from "../src/equipment";
import { parryLeverageQ } from "../src/sim/combat";
import { generateIndividual } from "../src/generate";
import { HUMAN_BASE } from "../src/archetypes";
import { clampQ, q, qMul, SCALE } from "../src/units";
import { defaultAction } from "../src/sim/action";
import { defaultCondition } from "../src/sim/condition";
import { defaultInjury } from "../src/sim/injury";
import { defaultIntent } from "../src/sim/intent";
import { v3 } from "../src/sim/vec3";

test("longer moment arm yields higher parry leverage (club > knife)", () => {
  const club = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;
  const knife = STARTER_WEAPONS.find(w => w.id === "wpn_knife")!;

  const attrs = generateIndividual(123, HUMAN_BASE);

  // minimal attacker entity for leverage calc
  const attacker: any = {
    id: 1,
    attributes: attrs,
    loadout: { items: [club] },
    traits: [],
    position_m: v3(0, 0, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(),
    action: defaultAction(),
    condition: defaultCondition(),
    injury: defaultInjury(),
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
  };

  const Lclub = parryLeverageQ(club as any, attacker);
  const Lknife = parryLeverageQ(knife as any, attacker);

  expect(Lclub).toBeGreaterThan(Lknife);
});

test("higher leverage reduces parry damage multiplier (club parry mitigates more)", () => {
  const club = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;
  const knife = STARTER_WEAPONS.find(w => w.id === "wpn_knife")!;

  const attrs = generateIndividual(456, HUMAN_BASE);

  const attacker: any = { id: 1, attributes: attrs };

  const Lclub = parryLeverageQ(club as any, attacker);
  const Lknife = parryLeverageQ(knife as any, attacker);

  // This matches the intended parry mitigation shape:
  // m = clamp(0.25 - 0.15*(defenceMul-1), 0.10..0.45)
  const parryMul = (leverage: any) => {
    const defenceMul = leverage; // handedness not applied here (both are oneHand)
    return clampQ(
      q(0.25) - qMul(q(0.15), (defenceMul - SCALE.Q) as any),
      q(0.10),
      q(0.45)
    );
  };

  const mClub = parryMul(Lclub);
  const mKnife = parryMul(Lknife);

  // lower multiplier => more mitigation
  expect(mClub).toBeLessThan(mKnife);
});