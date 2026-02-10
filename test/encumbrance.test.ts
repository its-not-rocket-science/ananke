import { describe, expect, test } from "vitest";
import { generateIndividual } from "../src/generate";
import { HUMAN_BASE } from "../src/archetypes";
import { q } from "../src/units";
import { computeEncumbrance, STARTER_ARMOUR, STARTER_WEAPONS, type Loadout } from "../src/equipment";
import { deriveMovementCaps } from "../src/derive";

describe("encumbrance", () => {
  test("no items => minimal penalties", () => {
    const a = generateIndividual(123, HUMAN_BASE);
    const loadout: Loadout = { items: [] };
    const { penalties } = computeEncumbrance(a, loadout);
    expect(penalties.speedMul).toBeGreaterThanOrEqual(q(0.99));
    expect(penalties.overloaded).toBe(false);
  });

  test("heavy load => worse speed/accel", () => {
    const a = generateIndividual(123, HUMAN_BASE);
    const loadout: Loadout = { items: [
      ...STARTER_ARMOUR,
      ...STARTER_WEAPONS,
      { id: "gear_rocks", kind: "gear", name: "Bag of rocks", mass_kg: a.morphology.mass_kg, bulk: q(2.2) },
    ]};
    const { penalties } = computeEncumbrance(a, loadout);
    expect(penalties.speedMul).toBeLessThan(q(0.80));
    expect(penalties.accelMul).toBeLessThan(q(0.80));
  });

  test("derived movement caps incorporate armour + encumbrance", () => {
    const a = generateIndividual(999, HUMAN_BASE);
    const none: Loadout = { items: [] };
    const arm: Loadout = { items: [STARTER_ARMOUR[1]] };

    const caps0 = deriveMovementCaps(a, none, { tractionCoeff: q(0.9) });
    const caps1 = deriveMovementCaps(a, arm, { tractionCoeff: q(0.9) });

    expect(caps1.maxSprintSpeed_mps).toBeLessThan(caps0.maxSprintSpeed_mps);
    expect(caps1.maxAcceleration_mps2).toBeLessThan(caps0.maxAcceleration_mps2);
  });
});
