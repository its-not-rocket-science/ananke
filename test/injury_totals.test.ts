import { expect, test } from "vitest";
import { defaultInjury } from "../src/sim/injury";
import { ALL_REGIONS } from "../src/sim/body";
import { q } from "../src/units";
import {
  totalSurfaceDamage,
  totalInternalDamage,
  totalStructuralDamage,
  totalBleedingRate,
} from "../src/sim/injury";

test("injury totals sum across all regions", () => {
  const inj = defaultInjury();

  inj.byRegion.head.surfaceDamage = q(0.1);
  inj.byRegion.torso.internalDamage = q(0.2);
  inj.byRegion.leftLeg.structuralDamage = q(0.3);
  inj.byRegion.rightArm.bleedingRate = q(0.4);

  expect(totalSurfaceDamage(inj)).toBe(q(0.1));
  expect(totalInternalDamage(inj)).toBe(q(0.2));
  expect(totalStructuralDamage(inj)).toBe(q(0.3));
  expect(totalBleedingRate(inj)).toBe(q(0.4));
});

test("injury totals are zero for default injury", () => {
  const inj = defaultInjury();

  expect(totalSurfaceDamage(inj)).toBe(0);
  expect(totalInternalDamage(inj)).toBe(0);
  expect(totalStructuralDamage(inj)).toBe(0);
  expect(totalBleedingRate(inj)).toBe(0);

  // also ensures all regions exist (Record is populated)
  for (const r of ALL_REGIONS) {
    expect(inj.byRegion[r]).toBeTruthy();
  }
});