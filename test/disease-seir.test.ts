// test/disease-seir.test.ts — Phase 73: Enhanced Epidemiological Models
//
// Covers all Phase 73 additions to src/sim/disease.ts:
//   ageSusceptibility_Q, vaccinate, applyNPI/removeNPI/hasNPI,
//   computeTransmissionRisk (extended), computeR0, stepSEIR,
//   registerDiseaseProfile, MEASLES profile.
//
// All 37 existing Phase 56 disease tests continue to pass unmodified.

import { describe, it, expect, beforeEach } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  // Phase 56 — still needed as building blocks
  getDiseaseProfile,
  exposeToDisease,
  computeTransmissionRisk,
  CONTACT_RANGE_Sm,
  // Phase 73 — new exports
  VaccinationRecord,
  NPIRegistry,
  NPI_MASK_REDUCTION_Q,
  DAILY_CONTACTS_ESTIMATE,
  MEASLES,
  ageSusceptibility_Q,
  vaccinate,
  applyNPI,
  removeNPI,
  hasNPI,
  computeR0,
  stepSEIR,
  registerDiseaseProfile,
} from "../src/sim/disease.js";
import { mkHumanoidEntity } from "../src/sim/testing.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fresh(id = 1) { return mkHumanoidEntity(id, 1, 0, 0); }

function mkSymptomatic(id: number, diseaseId: string) {
  const e = fresh(id);
  e.activeDiseases = [{ diseaseId, phase: "symptomatic", elapsedSeconds: 0 }];
  return e;
}

function mkNPIRegistry(): NPIRegistry {
  return new Map();
}

// ── ageSusceptibility_Q ────────────────────────────────────────────────────────

describe("ageSusceptibility_Q", () => {
  it("infant (age 2) returns ×1.30 susceptibility", () => {
    expect(ageSusceptibility_Q(2)).toBe(13_000);
  });

  it("child (age 10) returns ×0.80 susceptibility", () => {
    expect(ageSusceptibility_Q(10)).toBe(8_000);
  });

  it("adult (age 35) returns ×1.00 baseline", () => {
    expect(ageSusceptibility_Q(35)).toBe(SCALE.Q);
  });

  it("early elderly (age 65) returns ×1.20 susceptibility", () => {
    expect(ageSusceptibility_Q(65)).toBe(12_000);
  });

  it("late elderly (age 80) returns ×1.50 susceptibility", () => {
    expect(ageSusceptibility_Q(80)).toBe(15_000);
  });

  it("boundary: age exactly 5 returns child bracket (×0.80)", () => {
    expect(ageSusceptibility_Q(5)).toBe(8_000);
  });

  it("boundary: age exactly 60 returns early-elderly bracket (×1.20)", () => {
    expect(ageSusceptibility_Q(60)).toBe(12_000);
  });
});

// ── vaccinate ──────────────────────────────────────────────────────────────────

describe("vaccinate", () => {
  it("creates a VaccinationRecord with doseCount 1", () => {
    const e = fresh();
    vaccinate(e, "common_fever", q(0.85) as VaccinationRecord["efficacy_Q"]);
    expect(e.vaccinations).toHaveLength(1);
    expect(e.vaccinations![0].diseaseId).toBe("common_fever");
    expect(e.vaccinations![0].efficacy_Q).toBe(q(0.85));
    expect(e.vaccinations![0].doseCount).toBe(1);
  });

  it("booster: second call increments doseCount and updates efficacy", () => {
    const e = fresh();
    vaccinate(e, "plague_pneumonic", q(0.70) as VaccinationRecord["efficacy_Q"]);
    vaccinate(e, "plague_pneumonic", q(0.90) as VaccinationRecord["efficacy_Q"]);
    expect(e.vaccinations).toHaveLength(1);
    expect(e.vaccinations![0].doseCount).toBe(2);
    expect(e.vaccinations![0].efficacy_Q).toBe(q(0.90));
  });

  it("multiple diseases create separate records", () => {
    const e = fresh();
    vaccinate(e, "common_fever",    q(0.80) as VaccinationRecord["efficacy_Q"]);
    vaccinate(e, "plague_pneumonic", q(0.90) as VaccinationRecord["efficacy_Q"]);
    expect(e.vaccinations).toHaveLength(2);
  });

  it("vaccinated target has reduced transmission risk", () => {
    const fever = getDiseaseProfile("common_fever")!;
    const carrier = mkSymptomatic(1, "common_fever");
    const unvacc  = fresh(2);
    const vacc    = fresh(3);
    vaccinate(vacc, "common_fever", q(0.95) as VaccinationRecord["efficacy_Q"]);

    const riskUnvacc = computeTransmissionRisk(carrier, unvacc, 0, fever);
    const riskVacc   = computeTransmissionRisk(carrier, vacc,   0, fever);
    expect(riskVacc).toBeLessThan(riskUnvacc);
  });

  it("100 % efficacy vaccination reduces risk to zero", () => {
    const fever = getDiseaseProfile("common_fever")!;
    const carrier = mkSymptomatic(1, "common_fever");
    const target  = fresh(2);
    vaccinate(target, "common_fever", SCALE.Q as VaccinationRecord["efficacy_Q"]);
    expect(computeTransmissionRisk(carrier, target, 0, fever)).toBe(0);
  });
});

// ── NPI helpers ────────────────────────────────────────────────────────────────

describe("applyNPI / removeNPI / hasNPI", () => {
  it("applyNPI registers an NPI for a polity", () => {
    const reg = mkNPIRegistry();
    applyNPI(reg, "mask_mandate", "polity_a");
    expect(hasNPI(reg, "mask_mandate", "polity_a")).toBe(true);
  });

  it("hasNPI returns false before applyNPI", () => {
    const reg = mkNPIRegistry();
    expect(hasNPI(reg, "quarantine", "polity_a")).toBe(false);
  });

  it("removeNPI deactivates an NPI", () => {
    const reg = mkNPIRegistry();
    applyNPI(reg, "quarantine", "polity_b");
    removeNPI(reg, "quarantine", "polity_b");
    expect(hasNPI(reg, "quarantine", "polity_b")).toBe(false);
  });

  it("different polities and NPI types are independent keys", () => {
    const reg = mkNPIRegistry();
    applyNPI(reg, "mask_mandate", "polity_a");
    applyNPI(reg, "quarantine",   "polity_b");
    expect(hasNPI(reg, "mask_mandate", "polity_a")).toBe(true);
    expect(hasNPI(reg, "quarantine",   "polity_b")).toBe(true);
    expect(hasNPI(reg, "mask_mandate", "polity_b")).toBe(false);
    expect(hasNPI(reg, "quarantine",   "polity_a")).toBe(false);
  });

  it("removeNPI on non-existent NPI is a no-op", () => {
    const reg = mkNPIRegistry();
    expect(() => removeNPI(reg, "quarantine", "nobody")).not.toThrow();
  });
});

// ── computeTransmissionRisk extensions ────────────────────────────────────────

describe("computeTransmissionRisk — Phase 73 extensions", () => {
  it("mask mandate reduces airborne transmission risk by 60 %", () => {
    const fever = getDiseaseProfile("common_fever")!;
    const carrier = mkSymptomatic(1, "common_fever");
    const target  = fresh(2);

    const riskBase = computeTransmissionRisk(carrier, target, 0, fever);
    const riskMask = computeTransmissionRisk(carrier, target, 0, fever, { maskMandate: true });

    // Risk should be ~40 % of base (×0.40 after 60 % reduction)
    const expected = Math.round(riskBase * (SCALE.Q - NPI_MASK_REDUCTION_Q) / SCALE.Q);
    expect(riskMask).toBe(expected);
    expect(riskMask).toBeLessThan(riskBase);
  });

  it("mask mandate has no effect on contact-route diseases", () => {
    const wf = getDiseaseProfile("wound_fever")!;
    const carrier = mkSymptomatic(1, "wound_fever");
    const target  = fresh(2);

    const riskBase = computeTransmissionRisk(carrier, target, 0, wf);
    const riskMask = computeTransmissionRisk(carrier, target, 0, wf, { maskMandate: true });
    expect(riskMask).toBe(riskBase);
  });

  it("infant target (×1.30) has higher risk than adult target", () => {
    const fever   = getDiseaseProfile("common_fever")!;
    const carrier = mkSymptomatic(1, "common_fever");

    const infant = fresh(2);
    infant.age = { ageSeconds: 2 * 365 * 86_400 };  // 2 years

    const adult = fresh(3);
    adult.age = { ageSeconds: 35 * 365 * 86_400 };  // 35 years

    const riskInfant = computeTransmissionRisk(carrier, infant, 0, fever);
    const riskAdult  = computeTransmissionRisk(carrier, adult,  0, fever);
    expect(riskInfant).toBeGreaterThan(riskAdult);
  });

  it("child target (×0.80) has lower risk than adult target", () => {
    const fever   = getDiseaseProfile("common_fever")!;
    const carrier = mkSymptomatic(1, "common_fever");

    const child = fresh(2);
    child.age = { ageSeconds: 10 * 365 * 86_400 };

    const adult = fresh(3);
    adult.age = { ageSeconds: 35 * 365 * 86_400 };

    expect(computeTransmissionRisk(carrier, child, 0, fever))
      .toBeLessThan(computeTransmissionRisk(carrier, adult, 0, fever));
  });

  it("age susceptibility is capped at SCALE.Q (never exceeds full risk)", () => {
    const fever   = getDiseaseProfile("common_fever")!;
    const carrier = mkSymptomatic(1, "common_fever");
    const ancient = fresh(2);
    ancient.age = { ageSeconds: 100 * 365 * 86_400 };  // 100 years (×1.50)

    const risk = computeTransmissionRisk(carrier, ancient, 0, fever);
    expect(risk).toBeLessThanOrEqual(SCALE.Q);
  });

  it("no options param is backward-compatible (no change from old callers)", () => {
    const fever = getDiseaseProfile("common_fever")!;
    const carrier = mkSymptomatic(1, "common_fever");
    const target  = fresh(2);
    // 5-arg call identical to old 4-arg call result
    expect(computeTransmissionRisk(carrier, target, 0, fever, undefined))
      .toBe(computeTransmissionRisk(carrier, target, 0, fever));
  });
});

// ── computeR0 ─────────────────────────────────────────────────────────────────

describe("computeR0", () => {
  it("returns a positive float for common_fever", () => {
    const fever = getDiseaseProfile("common_fever")!;
    const map = new Map(Array.from({ length: 10 }, (_, i) => [i + 1, fresh(i + 1)]));
    const r0 = computeR0(fever, map);
    expect(r0).toBeGreaterThan(0);
  });

  it("plague has higher R0 than common_fever in same population", () => {
    const fever  = getDiseaseProfile("common_fever")!;
    const plague = getDiseaseProfile("plague_pneumonic")!;
    const map = new Map(Array.from({ length: 20 }, (_, i) => [i + 1, fresh(i + 1)]));
    expect(computeR0(plague, map)).toBeGreaterThan(computeR0(fever, map));
  });

  it("R0 is capped at DAILY_CONTACTS_ESTIMATE contacts when population is large", () => {
    const plague = getDiseaseProfile("plague_pneumonic")!;
    const small  = new Map(Array.from({ length: 5 },   (_, i) => [i, fresh(i)]));
    const large  = new Map(Array.from({ length: 100 }, (_, i) => [i, fresh(i)]));
    const veryLarge = new Map(Array.from({ length: 500 }, (_, i) => [i, fresh(i)]));
    // Large and very-large should produce the same R0 (contacts capped at 15)
    expect(computeR0(plague, large)).toBe(computeR0(plague, veryLarge));
    // Small population has fewer contacts → lower R0
    expect(computeR0(plague, small)).toBeLessThan(computeR0(plague, large));
  });

  it("empty entity map still returns a positive R0 (uses max(1, 0))", () => {
    const fever = getDiseaseProfile("common_fever")!;
    expect(computeR0(fever, new Map())).toBeGreaterThan(0);
  });
});

// ── registerDiseaseProfile + MEASLES ──────────────────────────────────────────

describe("registerDiseaseProfile + MEASLES", () => {
  beforeEach(() => {
    // Ensure MEASLES is always registered for this describe block
    registerDiseaseProfile(MEASLES);
  });

  it("MEASLES has useSeir === true", () => {
    expect(MEASLES.useSeir).toBe(true);
  });

  it("registerDiseaseProfile makes MEASLES available via getDiseaseProfile", () => {
    expect(getDiseaseProfile("measles")).toBe(MEASLES);
  });

  it("MEASLES R0 is in range [12, 18] for population ≥ 16", () => {
    const map = new Map(Array.from({ length: 20 }, (_, i) => [i + 1, fresh(i + 1)]));
    const r0 = computeR0(MEASLES, map);
    expect(r0).toBeGreaterThanOrEqual(12);
    expect(r0).toBeLessThanOrEqual(18);
  });

  it("exposeToDisease works for registered MEASLES", () => {
    const e = fresh();
    const ok = exposeToDisease(e, "measles");
    expect(ok).toBe(true);
    expect(e.activeDiseases![0].phase).toBe("incubating");
  });

  it("DAILY_CONTACTS_ESTIMATE is exported and equals 15", () => {
    expect(DAILY_CONTACTS_ESTIMATE).toBe(15);
  });
});

// ── stepSEIR ──────────────────────────────────────────────────────────────────

describe("stepSEIR", () => {
  beforeEach(() => {
    registerDiseaseProfile(MEASLES);
  });

  it("returns empty result for entity with no active disease", () => {
    const e = fresh();
    const r = stepSEIR(e, 86_400, MEASLES, 42, 0);
    expect(r.advancedToSymptomatic).toHaveLength(0);
    expect(r.died).toBe(false);
    expect(r.fatigueApplied).toBe(0);
  });

  it("returns empty result for dead entity", () => {
    const e = fresh();
    e.activeDiseases = [{ diseaseId: "measles", phase: "incubating", elapsedSeconds: 0 }];
    e.injury.dead = true;
    const r = stepSEIR(e, 86_400, MEASLES, 42, 0);
    expect(r.died).toBe(false);
    expect(r.fatigueApplied).toBe(0);
  });

  it("advances incubation → symptomatic after incubationPeriod_s", () => {
    registerDiseaseProfile(MEASLES);
    const e = fresh();
    exposeToDisease(e, "measles");
    // measles: 14-day incubation → step 15 days
    for (let i = 0; i < 14; i++) {
      stepSEIR(e, 86_400, MEASLES, 42, i);
    }
    // After 14 steps the disease should have transitioned
    const state = e.activeDiseases?.find(d => d.diseaseId === "measles");
    expect(state?.phase).toBe("symptomatic");
  });

  it("only processes the target disease — other diseases are unaffected", () => {
    registerDiseaseProfile(MEASLES);
    const e = fresh();
    exposeToDisease(e, "measles");
    // Also add a separate disease manually
    e.activeDiseases!.push({
      diseaseId:      "dysentery",
      phase:          "incubating",
      elapsedSeconds: 0,
    });
    const initialDysenteryElapsed = e.activeDiseases!.find(d => d.diseaseId === "dysentery")!.elapsedSeconds;

    // stepSEIR should only affect measles
    stepSEIR(e, 86_400, MEASLES, 42, 0);

    const dysentery = e.activeDiseases!.find(d => d.diseaseId === "dysentery");
    // dysentery elapsed should NOT have advanced (stepSEIR only touched measles)
    expect(dysentery?.elapsedSeconds).toBe(initialDysenteryElapsed);
  });

  it("drains fatigue while symptomatic", () => {
    registerDiseaseProfile(MEASLES);
    const e = fresh();
    e.activeDiseases = [{ diseaseId: "measles", phase: "symptomatic", elapsedSeconds: 0 }];
    const r = stepSEIR(e, 86_400, MEASLES, 42, 0);
    // MEASLES.symptomSeverity_Q = q(0.15) = 1500; 1 day → 1500
    expect(r.fatigueApplied).toBe(1500);
  });
});
