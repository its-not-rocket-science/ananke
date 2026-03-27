// test/disease.test.ts — Phase 56: Disease & Epidemic Simulation

import { describe, it, expect } from "vitest";
import { q } from "../src/units.js";
import {
  DISEASE_PROFILES,
  getDiseaseProfile,
  exposeToDisease,
  stepDiseaseForEntity,
  computeTransmissionRisk,
  spreadDisease,
  CONTACT_RANGE_Sm,
} from "../src/sim/disease.js";
import { mkHumanoidEntity } from "../src/sim/testing.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fresh(id = 1) { return mkHumanoidEntity(id, 1, 0, 0); }

/** Advance disease state N times by 1 day (86 400 s). */
function stepNDays(entity: ReturnType<typeof fresh>, days: number, seed = 42, tick = 0) {
  const results = [];
  for (let i = 0; i < days; i++) {
    results.push(stepDiseaseForEntity(entity, 86_400, seed, tick + i));
  }
  return results;
}

/** Create an entity that is already symptomatic with a given disease. */
function mkSymptomatic(id: number, diseaseId: string) {
  const e = fresh(id);
  const profile = getDiseaseProfile(diseaseId)!;
  e.activeDiseases = [{
    diseaseId,
    phase:          "symptomatic",
    elapsedSeconds: 0,
  }];
  // Suppress the incubation step that would normally precede this.
  void profile;
  return e;
}

// ── Data integrity ─────────────────────────────────────────────────────────────

describe("DISEASE_PROFILES data integrity", () => {
  it("catalogue has exactly 6 entries", () => {
    expect(DISEASE_PROFILES.length).toBe(6);
  });

  it("every profile has id, name, transmissionRoute, mortalityRate_Q ≥ 0", () => {
    for (const p of DISEASE_PROFILES) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.name).toBe("string");
      expect(["airborne","contact","vector","waterborne"]).toContain(p.transmissionRoute);
      expect(p.mortalityRate_Q).toBeGreaterThanOrEqual(0);
      expect(p.symptomSeverity_Q).toBeGreaterThan(0);
      expect(p.incubationPeriod_s).toBeGreaterThan(0);
      expect(p.symptomaticDuration_s).toBeGreaterThan(0);
    }
  });

  it("plague_pneumonic has the highest mortalityRate_Q", () => {
    const plague = getDiseaseProfile("plague_pneumonic")!;
    for (const p of DISEASE_PROFILES) {
      if (p.id !== plague.id) expect(plague.mortalityRate_Q).toBeGreaterThan(p.mortalityRate_Q);
    }
  });

  it("plague_pneumonic baseTransmissionRate_Q > common_fever baseTransmissionRate_Q", () => {
    expect(getDiseaseProfile("plague_pneumonic")!.baseTransmissionRate_Q)
      .toBeGreaterThan(getDiseaseProfile("common_fever")!.baseTransmissionRate_Q);
  });

  it("dysentery immunityDuration_s === 0 (no immunity granted)", () => {
    expect(getDiseaseProfile("dysentery")!.immunityDuration_s).toBe(0);
  });

  it("wound_fever and plague_pneumonic grant permanent immunity (immunityDuration_s === -1)", () => {
    expect(getDiseaseProfile("wound_fever")!.immunityDuration_s).toBe(-1);
    expect(getDiseaseProfile("plague_pneumonic")!.immunityDuration_s).toBe(-1);
  });

  it("getDiseaseProfile returns undefined for unknown id", () => {
    expect(getDiseaseProfile("unknown_disease_xyz")).toBeUndefined();
  });
});

// ── exposeToDisease ────────────────────────────────────────────────────────────

describe("exposeToDisease", () => {
  it("adds an incubating DiseaseState and returns true", () => {
    const e = fresh();
    const ok = exposeToDisease(e, "common_fever");
    expect(ok).toBe(true);
    expect(e.activeDiseases).toHaveLength(1);
    expect(e.activeDiseases![0].phase).toBe("incubating");
    expect(e.activeDiseases![0].diseaseId).toBe("common_fever");
  });

  it("returns false and makes no change for an unknown disease id", () => {
    const e = fresh();
    const ok = exposeToDisease(e, "nonexistent");
    expect(ok).toBe(false);
    expect(e.activeDiseases).toBeUndefined();
  });

  it("returns false if already infected with the same disease", () => {
    const e = fresh();
    exposeToDisease(e, "common_fever");
    const ok2 = exposeToDisease(e, "common_fever");
    expect(ok2).toBe(false);
    expect(e.activeDiseases).toHaveLength(1);
  });

  it("returns false for an entity with a valid permanent immunity record", () => {
    const e = fresh();
    e.immunity = [{ diseaseId: "wound_fever", remainingSeconds: -1 }];
    const ok = exposeToDisease(e, "wound_fever");
    expect(ok).toBe(false);
  });

  it("returns false for an entity with a valid temporary immunity record", () => {
    const e = fresh();
    e.immunity = [{ diseaseId: "common_fever", remainingSeconds: 10 * 86_400 }];
    const ok = exposeToDisease(e, "common_fever");
    expect(ok).toBe(false);
  });

  it("allows exposure after temporary immunity expires (remainingSeconds === 0)", () => {
    const e = fresh();
    e.immunity = [{ diseaseId: "dysentery", remainingSeconds: 0 }]; // expired
    const ok = exposeToDisease(e, "dysentery");
    expect(ok).toBe(true);
  });

  it("allows simultaneous infection with different diseases", () => {
    const e = fresh();
    exposeToDisease(e, "common_fever");
    exposeToDisease(e, "dysentery");
    expect(e.activeDiseases).toHaveLength(2);
  });
});

// ── stepDiseaseForEntity ───────────────────────────────────────────────────────

describe("stepDiseaseForEntity", () => {
  it("returns empty result for an entity with no diseases", () => {
    const e = fresh();
    const r = stepDiseaseForEntity(e, 86_400, 1, 0);
    expect(r.advancedToSymptomatic).toHaveLength(0);
    expect(r.recovered).toHaveLength(0);
    expect(r.died).toBe(false);
    expect(r.fatigueApplied).toBe(0);
  });

  it("incubating disease transitions to symptomatic after incubationPeriod_s", () => {
    // common_fever: incubationPeriod_s = 1 day
    const e = fresh();
    exposeToDisease(e, "common_fever");
    // Step 1 day → should transition
    const r = stepDiseaseForEntity(e, 86_400, 1, 0);
    expect(r.advancedToSymptomatic).toContain("common_fever");
    expect(e.activeDiseases![0].phase).toBe("symptomatic");
  });

  it("incubating disease does NOT transition before incubationPeriod_s", () => {
    const e = fresh();
    exposeToDisease(e, "common_fever");
    const r = stepDiseaseForEntity(e, 86_399, 1, 0); // 1 second short
    expect(r.advancedToSymptomatic).toHaveLength(0);
    expect(e.activeDiseases![0].phase).toBe("incubating");
  });

  it("symptomatic disease drains fatigue proportional to severity × elapsed", () => {
    // common_fever: symptomSeverity_Q = q(0.10) = 1000; 1 day → fatigueInc = 1000
    const e = mkSymptomatic(1, "common_fever");
    const r = stepDiseaseForEntity(e, 86_400, 1, 0);
    expect(r.fatigueApplied).toBe(1000);
    expect(e.energy.fatigue).toBe(1000);
  });

  it("symptomatic disease clears after symptomaticDuration_s and grants immunity", () => {
    // wound_fever: 7-day symptomatic; permanent immunity; mortalityRate=q(0.05)
    // Use a seed that will NOT trigger mortality (roll >= 500 out of 10000)
    const e = mkSymptomatic(1, "wound_fever");
    // Step 8 days — ensures symptomatic duration (7 days) is passed.
    // Find a seed where mortality roll >= q(0.05)=500
    // eventSeed(42, 7, 1, 0, diseaseIdSalt("wound_fever")) % 10000 — let's use seed 42 and check
    const results = stepNDays(e, 8, 42, 0);
    const recoveryResult = results.find(r => r.recovered.includes("wound_fever"));
    expect(recoveryResult).toBeDefined();
    // Check immunity was granted
    const hasImmunity = e.immunity?.some(r => r.diseaseId === "wound_fever" && r.remainingSeconds === -1);
    expect(hasImmunity).toBe(true);
  });

  it("cleared disease is removed from activeDiseases", () => {
    const e = mkSymptomatic(1, "common_fever");
    stepNDays(e, 5, 1, 0); // common_fever: 3-day symptomatic
    expect(e.activeDiseases?.some(d => d.diseaseId === "common_fever")).toBe(false);
  });

  it("temporary immunity timer decrements each step", () => {
    const e = fresh();
    e.immunity = [{ diseaseId: "common_fever", remainingSeconds: 3 * 86_400 }];
    stepDiseaseForEntity(e, 86_400, 1, 0); // 1 day
    expect(e.immunity![0].remainingSeconds).toBe(2 * 86_400);
  });

  it("permanent immunity timer is NOT decremented (stays -1)", () => {
    const e = fresh();
    e.immunity = [{ diseaseId: "wound_fever", remainingSeconds: -1 }];
    stepDiseaseForEntity(e, 86_400 * 365, 1, 0); // 1 year
    expect(e.immunity![0].remainingSeconds).toBe(-1);
  });

  it("dead entity step returns all-zero result immediately", () => {
    const e = mkSymptomatic(1, "plague_pneumonic");
    e.injury.dead = true;
    const r = stepDiseaseForEntity(e, 86_400, 1, 0);
    expect(r.advancedToSymptomatic).toHaveLength(0);
    expect(r.died).toBe(false);
    expect(r.fatigueApplied).toBe(0);
  });
});

// ── computeTransmissionRisk ────────────────────────────────────────────────────

describe("computeTransmissionRisk", () => {
  it("airborne: full rate at dist 0", () => {
    const fever = getDiseaseProfile("common_fever")!;
    const carrier = mkSymptomatic(1, "common_fever");
    const target  = fresh(2);
    const risk = computeTransmissionRisk(carrier, target, 0, fever);
    expect(risk).toBe(fever.baseTransmissionRate_Q);
  });

  it("airborne: zero risk at or beyond airborneRange_Sm", () => {
    const fever = getDiseaseProfile("common_fever")!;
    const carrier = mkSymptomatic(1, "common_fever");
    const target  = fresh(2);
    const risk = computeTransmissionRisk(carrier, target, fever.airborneRange_Sm, fever);
    expect(risk).toBe(q(0));
  });

  it("airborne: risk decreases with distance (midpoint < full rate)", () => {
    const fever = getDiseaseProfile("common_fever")!;
    const carrier = mkSymptomatic(1, "common_fever");
    const t1 = fresh(2), t2 = fresh(3);
    const riskNear = computeTransmissionRisk(carrier, t1, 0, fever);
    const riskMid  = computeTransmissionRisk(carrier, t2, Math.trunc(fever.airborneRange_Sm / 2), fever);
    expect(riskMid).toBeGreaterThan(0);
    expect(riskMid).toBeLessThan(riskNear);
  });

  it("contact: full rate within CONTACT_RANGE_Sm", () => {
    const wf = getDiseaseProfile("wound_fever")!;
    const carrier = mkSymptomatic(1, "wound_fever");
    const target  = fresh(2);
    const risk = computeTransmissionRisk(carrier, target, CONTACT_RANGE_Sm - 1, wf);
    expect(risk).toBe(wf.baseTransmissionRate_Q);
  });

  it("contact: zero risk beyond CONTACT_RANGE_Sm", () => {
    const wf = getDiseaseProfile("wound_fever")!;
    const carrier = mkSymptomatic(1, "wound_fever");
    const target  = fresh(2);
    const risk = computeTransmissionRisk(carrier, target, CONTACT_RANGE_Sm + 1, wf);
    expect(risk).toBe(q(0));
  });

  it("returns q(0) if carrier is still incubating", () => {
    const fever = getDiseaseProfile("common_fever")!;
    const carrier = fresh(1);
    exposeToDisease(carrier, "common_fever"); // incubating
    const target = fresh(2);
    expect(computeTransmissionRisk(carrier, target, 0, fever)).toBe(q(0));
  });

  it("returns q(0) if target is already infected with the disease", () => {
    const fever = getDiseaseProfile("common_fever")!;
    const carrier = mkSymptomatic(1, "common_fever");
    const target  = mkSymptomatic(2, "common_fever");
    expect(computeTransmissionRisk(carrier, target, 0, fever)).toBe(q(0));
  });

  it("returns q(0) if target has a valid immunity record", () => {
    const fever = getDiseaseProfile("common_fever")!;
    const carrier = mkSymptomatic(1, "common_fever");
    const target  = fresh(2);
    target.immunity = [{ diseaseId: "common_fever", remainingSeconds: -1 }];
    expect(computeTransmissionRisk(carrier, target, 0, fever)).toBe(q(0));
  });
});

// ── spreadDisease ──────────────────────────────────────────────────────────────

describe("spreadDisease", () => {
  it("returns 0 exposures for an empty pair list", () => {
    const r = spreadDisease(new Map(), [], 1, 0);
    expect(r.newExposures).toBe(0);
  });

  it("deterministic: same inputs produce same newExposures", () => {
    const carrier = mkSymptomatic(1, "plague_pneumonic");
    const target  = fresh(2);
    const map = new Map([[1, carrier], [2, target]]);
    const pairs = [{ carrierId: 1, targetId: 2, dist_Sm: 0 }];
    const r1 = spreadDisease(map, pairs, 42, 0);

    // Reset target for second run
    const carrier2 = mkSymptomatic(1, "plague_pneumonic");
    const target2  = fresh(2);
    const map2 = new Map([[1, carrier2], [2, target2]]);
    const r2 = spreadDisease(map2, pairs, 42, 0);

    expect(r1.newExposures).toBe(r2.newExposures);
  });

  it("spreads highly contagious disease (plague) at zero distance", () => {
    // plague: baseTransmissionRate = q(0.80). Roll < 8000 → exposes.
    // With seed 42, tick 0, carrierId=1, targetId=2, salt=plague_pneumonic salt:
    // We check any seed produces at least some transmission in 10 attempts.
    let anyExposed = false;
    for (let s = 0; s < 10; s++) {
      const carrier = mkSymptomatic(1, "plague_pneumonic");
      const target  = fresh(2);
      const map = new Map([[1, carrier], [2, target]]);
      const r = spreadDisease(map, [{ carrierId: 1, targetId: 2, dist_Sm: 0 }], s, 0);
      if (r.newExposures > 0) { anyExposed = true; break; }
    }
    expect(anyExposed).toBe(true);
  });

  it("does not spread to immune targets", () => {
    const carrier = mkSymptomatic(1, "plague_pneumonic");
    const target  = fresh(2);
    target.immunity = [{ diseaseId: "plague_pneumonic", remainingSeconds: -1 }];
    const map   = new Map([[1, carrier], [2, target]]);
    const pairs = [{ carrierId: 1, targetId: 2, dist_Sm: 0 }];
    // Even with a seed that would trigger transmission, target is immune
    let exposures = 0;
    for (let s = 0; s < 20; s++) {
      exposures += spreadDisease(map, pairs, s, 0).newExposures;
    }
    expect(exposures).toBe(0);
  });

  it("does not spread from dead carrier", () => {
    const carrier = mkSymptomatic(1, "common_fever");
    carrier.injury.dead = true;
    const target = fresh(2);
    const map    = new Map([[1, carrier], [2, target]]);
    const r = spreadDisease(map, [{ carrierId: 1, targetId: 2, dist_Sm: 0 }], 1, 0);
    expect(r.newExposures).toBe(0);
  });

  it("wasting_sickness (5 % rate) has lower spread probability than plague (80 %)", () => {
    // Run 50 attempts for each — wasting should expose fewer targets on average.
    let wastingCount = 0, plagueCount = 0;
    for (let s = 0; s < 50; s++) {
      const c1 = mkSymptomatic(1, "wasting_sickness");
      const t1 = fresh(2);
      wastingCount += spreadDisease(
        new Map([[1, c1], [2, t1]]),
        [{ carrierId: 1, targetId: 2, dist_Sm: 0 }], s, 0,
      ).newExposures;

      const c2 = mkSymptomatic(3, "plague_pneumonic");
      const t2 = fresh(4);
      plagueCount += spreadDisease(
        new Map([[3, c2], [4, t2]]),
        [{ carrierId: 3, targetId: 4, dist_Sm: 0 }], s, 0,
      ).newExposures;
    }
    expect(plagueCount).toBeGreaterThan(wastingCount);
  });
});
