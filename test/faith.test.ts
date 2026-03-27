// test/faith.test.ts — Phase 85: Religion & Faith Systems

import { describe, it, expect } from "vitest";
import { q, SCALE, type Q } from "../src/units.js";
import {
  SOLAR_CHURCH,
  EARTH_SPIRITS,
  MERCHANT_CULT,
  CONVERSION_BASE_RATE_Q,
  HERESY_THRESHOLD_Q,
  FAITH_DIPLOMATIC_BONUS_Q,
  FAITH_DIPLOMATIC_PENALTY_Q,
  createFaithRegistry,
  registerFaith,
  getFaith,
  getPolityFaiths,
  setPolityFaith,
  getDominantFaith,
  sharesDominantFaith,
  computeConversionPressure,
  stepFaithConversion,
  computeHeresyRisk,
  computeFaithDiplomaticModifier,
} from "../src/faith.js";

// ── createFaithRegistry ────────────────────────────────────────────────────────

describe("createFaithRegistry", () => {
  it("creates empty registry", () => {
    const r = createFaithRegistry();
    expect(r.faiths.size).toBe(0);
    expect(r.polityFaiths.size).toBe(0);
  });
});

// ── registerFaith / getFaith ───────────────────────────────────────────────────

describe("registerFaith / getFaith", () => {
  it("registers and retrieves a faith", () => {
    const r = createFaithRegistry();
    registerFaith(r, SOLAR_CHURCH);
    expect(getFaith(r, "solar_church")).toBe(SOLAR_CHURCH);
  });

  it("returns undefined for unknown faith", () => {
    const r = createFaithRegistry();
    expect(getFaith(r, "unknown")).toBeUndefined();
  });

  it("replaces existing faith on re-register", () => {
    const r = createFaithRegistry();
    registerFaith(r, SOLAR_CHURCH);
    const updated = { ...SOLAR_CHURCH, name: "Reformed Solar Church" };
    registerFaith(r, updated);
    expect(getFaith(r, "solar_church")!.name).toBe("Reformed Solar Church");
  });
});

// ── sample faiths sanity ───────────────────────────────────────────────────────

describe("sample faiths", () => {
  it("SOLAR_CHURCH is exclusive with high fervor", () => {
    expect(SOLAR_CHURCH.exclusive).toBe(true);
    expect(SOLAR_CHURCH.fervor_Q).toBeGreaterThan(q(0.50));
    expect(SOLAR_CHURCH.tolerance_Q).toBeLessThan(q(0.50));
  });

  it("EARTH_SPIRITS is syncretic with high tolerance", () => {
    expect(EARTH_SPIRITS.exclusive).toBe(false);
    expect(EARTH_SPIRITS.tolerance_Q).toBeGreaterThan(q(0.70));
  });

  it("MERCHANT_CULT is syncretic with moderate fervor", () => {
    expect(MERCHANT_CULT.exclusive).toBe(false);
  });
});

// ── setPolityFaith / getPolityFaiths ───────────────────────────────────────────

describe("setPolityFaith", () => {
  it("creates new record", () => {
    const r = createFaithRegistry();
    setPolityFaith(r, "P1", "solar_church", q(0.80));
    const list = getPolityFaiths(r, "P1");
    expect(list).toHaveLength(1);
    expect(list[0].adherents_Q).toBe(q(0.80));
  });

  it("updates existing record", () => {
    const r = createFaithRegistry();
    setPolityFaith(r, "P1", "solar_church", q(0.60));
    setPolityFaith(r, "P1", "solar_church", q(0.80));
    expect(getPolityFaiths(r, "P1")).toHaveLength(1);
    expect(getPolityFaiths(r, "P1")[0].adherents_Q).toBe(q(0.80));
  });

  it("can hold multiple faiths", () => {
    const r = createFaithRegistry();
    setPolityFaith(r, "P1", "solar_church",  q(0.60));
    setPolityFaith(r, "P1", "earth_spirits", q(0.30));
    expect(getPolityFaiths(r, "P1")).toHaveLength(2);
  });

  it("clamps adherents to [0, SCALE.Q]", () => {
    const r = createFaithRegistry();
    setPolityFaith(r, "P1", "solar_church", (SCALE.Q * 2) as Q);
    expect(getPolityFaiths(r, "P1")[0].adherents_Q).toBe(SCALE.Q);
    setPolityFaith(r, "P1", "solar_church", -100 as Q);
    expect(getPolityFaiths(r, "P1")[0].adherents_Q).toBe(0);
  });

  it("returns empty array for unknown polity", () => {
    const r = createFaithRegistry();
    expect(getPolityFaiths(r, "UNKNOWN")).toHaveLength(0);
  });
});

// ── getDominantFaith ───────────────────────────────────────────────────────────

describe("getDominantFaith", () => {
  it("returns faith with highest adherents", () => {
    const r = createFaithRegistry();
    setPolityFaith(r, "P1", "solar_church",  q(0.30));
    setPolityFaith(r, "P1", "earth_spirits", q(0.60));
    expect(getDominantFaith(r, "P1")!.faithId).toBe("earth_spirits");
  });

  it("returns undefined for polity with no faiths", () => {
    const r = createFaithRegistry();
    expect(getDominantFaith(r, "P1")).toBeUndefined();
  });

  it("works with a single faith", () => {
    const r = createFaithRegistry();
    setPolityFaith(r, "P1", "solar_church", q(0.90));
    expect(getDominantFaith(r, "P1")!.faithId).toBe("solar_church");
  });
});

// ── sharesDominantFaith ────────────────────────────────────────────────────────

describe("sharesDominantFaith", () => {
  it("returns true when both have same dominant faith", () => {
    const r = createFaithRegistry();
    setPolityFaith(r, "A", "solar_church", q(0.90));
    setPolityFaith(r, "B", "solar_church", q(0.80));
    expect(sharesDominantFaith(r, "A", "B")).toBe(true);
  });

  it("returns false when dominant faiths differ", () => {
    const r = createFaithRegistry();
    setPolityFaith(r, "A", "solar_church",  q(0.80));
    setPolityFaith(r, "B", "earth_spirits", q(0.80));
    expect(sharesDominantFaith(r, "A", "B")).toBe(false);
  });

  it("returns false when either polity has no faith", () => {
    const r = createFaithRegistry();
    setPolityFaith(r, "A", "solar_church", q(0.80));
    expect(sharesDominantFaith(r, "A", "B")).toBe(false);
  });
});

// ── computeConversionPressure ──────────────────────────────────────────────────

describe("computeConversionPressure", () => {
  it("returns 0 for zero missionary presence", () => {
    expect(computeConversionPressure(SOLAR_CHURCH, 0)).toBe(0);
  });

  it("returns positive pressure for positive missionary presence", () => {
    expect(computeConversionPressure(SOLAR_CHURCH, q(0.80))).toBeGreaterThan(0);
  });

  it("high fervor faith converts faster than low fervor", () => {
    const presence = q(0.80);
    expect(computeConversionPressure(SOLAR_CHURCH, presence))
      .toBeGreaterThan(computeConversionPressure(EARTH_SPIRITS, presence));
  });

  it("pressure scales with missionary presence", () => {
    const low  = computeConversionPressure(SOLAR_CHURCH, q(0.20));
    const high = computeConversionPressure(SOLAR_CHURCH, q(0.80));
    expect(high).toBeGreaterThan(low);
  });

  it("is clamped to [0, SCALE.Q]", () => {
    const p = computeConversionPressure(SOLAR_CHURCH, SCALE.Q);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(SCALE.Q);
  });
});

// ── stepFaithConversion ────────────────────────────────────────────────────────

describe("stepFaithConversion", () => {
  it("increases adherents for syncretic faith without affecting others", () => {
    const r = createFaithRegistry();
    registerFaith(r, EARTH_SPIRITS);
    registerFaith(r, MERCHANT_CULT);
    setPolityFaith(r, "P1", "earth_spirits", q(0.40));
    setPolityFaith(r, "P1", "merchant_cult", q(0.30));
    stepFaithConversion(r, "P1", "earth_spirits", q(0.10));
    const list = getPolityFaiths(r, "P1");
    expect(list.find(p => p.faithId === "earth_spirits")!.adherents_Q).toBe(q(0.50));
    expect(list.find(p => p.faithId === "merchant_cult")!.adherents_Q).toBe(q(0.30));
  });

  it("exclusive faith gain displaces other exclusive faiths", () => {
    const r = createFaithRegistry();
    registerFaith(r, SOLAR_CHURCH);
    const rival: typeof SOLAR_CHURCH = { ...SOLAR_CHURCH, faithId: "rival_church", name: "Rival", exclusive: true };
    registerFaith(r, rival);
    setPolityFaith(r, "P1", "solar_church", q(0.50));
    setPolityFaith(r, "P1", "rival_church", q(0.50));
    stepFaithConversion(r, "P1", "solar_church", q(0.10));
    const list = getPolityFaiths(r, "P1");
    const solar = list.find(p => p.faithId === "solar_church")!;
    const rival_ = list.find(p => p.faithId === "rival_church")!;
    expect(solar.adherents_Q).toBe(q(0.60));
    expect(rival_.adherents_Q).toBe(q(0.40));
  });

  it("exclusive faith gain does not displace syncretic faiths", () => {
    const r = createFaithRegistry();
    registerFaith(r, SOLAR_CHURCH);
    registerFaith(r, EARTH_SPIRITS);
    setPolityFaith(r, "P1", "solar_church",  q(0.60));
    setPolityFaith(r, "P1", "earth_spirits", q(0.40));
    stepFaithConversion(r, "P1", "solar_church", q(0.10));
    const list = getPolityFaiths(r, "P1");
    expect(list.find(p => p.faithId === "earth_spirits")!.adherents_Q).toBe(q(0.40));
  });

  it("creates new record if faith not yet present", () => {
    const r = createFaithRegistry();
    registerFaith(r, EARTH_SPIRITS);
    stepFaithConversion(r, "P1", "earth_spirits", q(0.10));
    expect(getPolityFaiths(r, "P1")[0].adherents_Q).toBe(q(0.10));
  });

  it("zero delta is a no-op", () => {
    const r = createFaithRegistry();
    registerFaith(r, SOLAR_CHURCH);
    setPolityFaith(r, "P1", "solar_church", q(0.70));
    stepFaithConversion(r, "P1", "solar_church", 0);
    expect(getPolityFaiths(r, "P1")[0].adherents_Q).toBe(q(0.70));
  });

  it("adherents cannot go below 0 via negative delta", () => {
    const r = createFaithRegistry();
    registerFaith(r, EARTH_SPIRITS);
    setPolityFaith(r, "P1", "earth_spirits", q(0.10));
    stepFaithConversion(r, "P1", "earth_spirits", -q(0.50));
    expect(getPolityFaiths(r, "P1")[0].adherents_Q).toBe(0);
  });
});

// ── computeHeresyRisk ──────────────────────────────────────────────────────────

describe("computeHeresyRisk", () => {
  it("returns 0 when no faiths present", () => {
    const r = createFaithRegistry();
    expect(computeHeresyRisk(r, "P1")).toBe(0);
  });

  it("returns 0 when dominant faith is syncretic", () => {
    const r = createFaithRegistry();
    registerFaith(r, EARTH_SPIRITS);
    registerFaith(r, SOLAR_CHURCH);
    setPolityFaith(r, "P1", "earth_spirits", q(0.80));
    setPolityFaith(r, "P1", "solar_church",  q(0.20));
    expect(computeHeresyRisk(r, "P1")).toBe(0);
  });

  it("returns 0 when minority exclusive faith is below threshold", () => {
    const r = createFaithRegistry();
    registerFaith(r, SOLAR_CHURCH);
    const rival = { ...SOLAR_CHURCH, faithId: "rival", exclusive: true } as typeof SOLAR_CHURCH;
    registerFaith(r, rival);
    setPolityFaith(r, "P1", "solar_church", q(0.90));
    setPolityFaith(r, "P1", "rival",        q(0.10)); // below q(0.15) threshold
    expect(computeHeresyRisk(r, "P1")).toBe(0);
  });

  it("returns positive risk when minority exclusive faith exceeds threshold", () => {
    const r = createFaithRegistry();
    registerFaith(r, SOLAR_CHURCH);
    const rival = { ...SOLAR_CHURCH, faithId: "rival", exclusive: true } as typeof SOLAR_CHURCH;
    registerFaith(r, rival);
    setPolityFaith(r, "P1", "solar_church", q(0.60));
    setPolityFaith(r, "P1", "rival",        q(0.40)); // above q(0.15) threshold
    expect(computeHeresyRisk(r, "P1")).toBeGreaterThan(0);
  });

  it("higher minority presence → higher heresy risk", () => {
    const r = createFaithRegistry();
    registerFaith(r, SOLAR_CHURCH);
    const rival = { ...SOLAR_CHURCH, faithId: "rival", exclusive: true } as typeof SOLAR_CHURCH;
    registerFaith(r, rival);

    setPolityFaith(r, "P1", "solar_church", q(0.70));
    setPolityFaith(r, "P1", "rival",        q(0.30));

    setPolityFaith(r, "P2", "solar_church", q(0.50));
    setPolityFaith(r, "P2", "rival",        q(0.50));

    expect(computeHeresyRisk(r, "P2")).toBeGreaterThan(computeHeresyRisk(r, "P1"));
  });

  it("syncretic minority does not trigger heresy", () => {
    const r = createFaithRegistry();
    registerFaith(r, SOLAR_CHURCH);
    registerFaith(r, EARTH_SPIRITS);
    setPolityFaith(r, "P1", "solar_church",  q(0.60));
    setPolityFaith(r, "P1", "earth_spirits", q(0.40));
    expect(computeHeresyRisk(r, "P1")).toBe(0);
  });
});

// ── computeFaithDiplomaticModifier ────────────────────────────────────────────

describe("computeFaithDiplomaticModifier", () => {
  it("shared dominant faith → positive bonus", () => {
    const r = createFaithRegistry();
    registerFaith(r, SOLAR_CHURCH);
    setPolityFaith(r, "A", "solar_church", q(0.90));
    setPolityFaith(r, "B", "solar_church", q(0.85));
    expect(computeFaithDiplomaticModifier(r, "A", "B")).toBe(FAITH_DIPLOMATIC_BONUS_Q);
  });

  it("exclusive vs exclusive different faith → penalty", () => {
    const r = createFaithRegistry();
    registerFaith(r, SOLAR_CHURCH);
    const rival = { ...SOLAR_CHURCH, faithId: "rival_faith" } as typeof SOLAR_CHURCH;
    registerFaith(r, rival);
    setPolityFaith(r, "A", "solar_church", q(0.90));
    setPolityFaith(r, "B", "rival_faith",  q(0.90));
    expect(computeFaithDiplomaticModifier(r, "A", "B")).toBe(-FAITH_DIPLOMATIC_PENALTY_Q);
  });

  it("syncretic vs exclusive different faith → no modifier", () => {
    const r = createFaithRegistry();
    registerFaith(r, SOLAR_CHURCH);
    registerFaith(r, EARTH_SPIRITS);
    setPolityFaith(r, "A", "solar_church",  q(0.90));
    setPolityFaith(r, "B", "earth_spirits", q(0.90));
    expect(computeFaithDiplomaticModifier(r, "A", "B")).toBe(0);
  });

  it("polity with no faith → no modifier", () => {
    const r = createFaithRegistry();
    setPolityFaith(r, "A", "solar_church", q(0.90));
    expect(computeFaithDiplomaticModifier(r, "A", "B")).toBe(0);
  });

  it("bonus is positive, penalty is negative", () => {
    expect(FAITH_DIPLOMATIC_BONUS_Q).toBeGreaterThan(0);
    expect(FAITH_DIPLOMATIC_PENALTY_Q).toBeGreaterThan(0);
  });
});

// ── constants sanity ───────────────────────────────────────────────────────────

describe("constants", () => {
  it("CONVERSION_BASE_RATE_Q > 0", () => {
    expect(CONVERSION_BASE_RATE_Q).toBeGreaterThan(0);
  });

  it("HERESY_THRESHOLD_Q = q(0.15)", () => {
    expect(HERESY_THRESHOLD_Q).toBe(q(0.15));
  });

  it("FAITH_DIPLOMATIC_BONUS_Q = q(0.10)", () => {
    expect(FAITH_DIPLOMATIC_BONUS_Q).toBe(q(0.10));
  });
});

// ── integration: conversion over time ─────────────────────────────────────────

describe("conversion over time", () => {
  it("missionary presence gradually increases adherents", () => {
    const r = createFaithRegistry();
    registerFaith(r, EARTH_SPIRITS);
    setPolityFaith(r, "P1", "earth_spirits", q(0.10));
    const presence = q(0.80);
    for (let day = 0; day < 30; day++) {
      const pressure = computeConversionPressure(EARTH_SPIRITS, presence);
      stepFaithConversion(r, "P1", "earth_spirits", pressure);
    }
    expect(getPolityFaiths(r, "P1")[0].adherents_Q).toBeGreaterThan(q(0.10));
  });

  it("exclusive high-fervor faith displaces rival over time", () => {
    const r = createFaithRegistry();
    registerFaith(r, SOLAR_CHURCH);
    const rival = { ...SOLAR_CHURCH, faithId: "rival", fervor_Q: q(0.30), name: "Rival" } as typeof SOLAR_CHURCH;
    registerFaith(r, rival);
    setPolityFaith(r, "P1", "solar_church", q(0.50));
    setPolityFaith(r, "P1", "rival",        q(0.50));
    const presence = q(1.0);
    for (let day = 0; day < 50; day++) {
      const pressure = computeConversionPressure(SOLAR_CHURCH, presence);
      stepFaithConversion(r, "P1", "solar_church", pressure);
    }
    const list = getPolityFaiths(r, "P1");
    expect(list.find(p => p.faithId === "solar_church")!.adherents_Q)
      .toBeGreaterThan(list.find(p => p.faithId === "rival")!.adherents_Q);
  });
});
