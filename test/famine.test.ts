// test/famine.test.ts — Phase 97: Famine Relief & Rationing

import { describe, it, expect } from "vitest";
import {
  SHORTAGE_THRESHOLD_Q,
  FAMINE_THRESHOLD_Q,
  CATASTROPHE_THRESHOLD_Q,
  FAMINE_PHASE_DEATH_Q,
  FAMINE_PHASE_MIGRATION_Q,
  FAMINE_PHASE_UNREST_Q,
  RATIONING_REDUCTION_Q,
  RATIONING_UNREST_Q,
  RELIEF_IMPORT_COST_CU_PER_SU,
  SEVERITY_DELTA_PER_DAY,
  createFamineState,
  computeFaminePhase,
  computeFaminePressures,
  stepFamine,
  computeRationedConsumption,
  stepRationedGranary,
  computeReliefImport,
  isFamineActive,
  isCatastrophicFamine,
} from "../src/famine.js";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";
import type { Polity } from "../src/polity.js";
import type { TechEra } from "../src/sim/tech.js";
import type { GranaryState } from "../src/granary.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePolity(population = 1000, treasury_cu = 10_000): Polity {
  return {
    id: "p1", name: "Test",
    factionId: "f1", locationIds: [],
    population, treasury_cu,
    techEra: 2 as TechEra,
    militaryStrength_Q: q(0.50) as Q,
    stabilityQ: q(0.70) as Q,
    moraleQ: q(0.60) as Q,
  } as Polity;
}

function makeGranary(grain_su = 100_000): GranaryState {
  return { polityId: "p1", grain_su };
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("CATASTROPHE_THRESHOLD_Q < FAMINE_THRESHOLD_Q < SHORTAGE_THRESHOLD_Q", () => {
    expect(CATASTROPHE_THRESHOLD_Q).toBeLessThan(FAMINE_THRESHOLD_Q);
    expect(FAMINE_THRESHOLD_Q).toBeLessThan(SHORTAGE_THRESHOLD_Q);
  });

  it("catastrophe has highest death bonus", () => {
    expect(FAMINE_PHASE_DEATH_Q.catastrophe)
      .toBeGreaterThan(FAMINE_PHASE_DEATH_Q.famine);
    expect(FAMINE_PHASE_DEATH_Q.famine)
      .toBeGreaterThan(FAMINE_PHASE_DEATH_Q.shortage);
    expect(FAMINE_PHASE_DEATH_Q.none).toBe(0);
  });

  it("catastrophe has highest migration push", () => {
    const max = Math.max(...Object.values(FAMINE_PHASE_MIGRATION_Q));
    expect(FAMINE_PHASE_MIGRATION_Q.catastrophe).toBe(max);
    expect(FAMINE_PHASE_MIGRATION_Q.none).toBe(0);
  });

  it("catastrophe has highest base unrest", () => {
    const max = Math.max(...Object.values(FAMINE_PHASE_UNREST_Q));
    expect(FAMINE_PHASE_UNREST_Q.catastrophe).toBe(max);
    expect(FAMINE_PHASE_UNREST_Q.none).toBe(0);
  });

  it("starvation_rations has highest consumption reduction", () => {
    const max = Math.max(...Object.values(RATIONING_REDUCTION_Q));
    expect(RATIONING_REDUCTION_Q.starvation_rations).toBe(max);
    expect(RATIONING_REDUCTION_Q.none).toBe(0);
  });

  it("starvation_rations has highest rationing unrest", () => {
    const max = Math.max(...Object.values(RATIONING_UNREST_Q));
    expect(RATIONING_UNREST_Q.starvation_rations).toBe(max);
    expect(RATIONING_UNREST_Q.none).toBe(0);
  });

  it("severity deltas: none decays, shortage accrues slightly, catastrophe accrues most", () => {
    expect(SEVERITY_DELTA_PER_DAY.none).toBeLessThan(0);
    expect(SEVERITY_DELTA_PER_DAY.shortage).toBeGreaterThan(0);
    expect(SEVERITY_DELTA_PER_DAY.catastrophe)
      .toBeGreaterThan(SEVERITY_DELTA_PER_DAY.famine);
  });

  it("RELIEF_IMPORT_COST_CU_PER_SU is positive", () => {
    expect(RELIEF_IMPORT_COST_CU_PER_SU).toBeGreaterThan(0);
  });
});

// ── createFamineState ─────────────────────────────────────────────────────────

describe("createFamineState", () => {
  it("starts in none phase", () => {
    const s = createFamineState("polity_1");
    expect(s.phase).toBe("none");
  });

  it("starts with zero daysInPhase and severity", () => {
    const s = createFamineState("polity_1");
    expect(s.daysInPhase).toBe(0);
    expect(s.cumulativeSeverity_Q).toBe(0);
  });

  it("stores polityId", () => {
    expect(createFamineState("abc").polityId).toBe("abc");
  });
});

// ── computeFaminePhase ────────────────────────────────────────────────────────

describe("computeFaminePhase", () => {
  it("returns none at full supply", () => {
    expect(computeFaminePhase(SCALE.Q as Q)).toBe("none");
  });

  it("returns none just above shortage threshold", () => {
    expect(computeFaminePhase(SHORTAGE_THRESHOLD_Q)).toBe("none");
  });

  it("returns shortage just below shortage threshold", () => {
    expect(computeFaminePhase((SHORTAGE_THRESHOLD_Q - 1) as Q)).toBe("shortage");
  });

  it("returns shortage just above famine threshold", () => {
    expect(computeFaminePhase(FAMINE_THRESHOLD_Q)).toBe("shortage");
  });

  it("returns famine just below famine threshold", () => {
    expect(computeFaminePhase((FAMINE_THRESHOLD_Q - 1) as Q)).toBe("famine");
  });

  it("returns famine just above catastrophe threshold", () => {
    expect(computeFaminePhase(CATASTROPHE_THRESHOLD_Q)).toBe("famine");
  });

  it("returns catastrophe just below catastrophe threshold", () => {
    expect(computeFaminePhase((CATASTROPHE_THRESHOLD_Q - 1) as Q)).toBe("catastrophe");
  });

  it("returns catastrophe at zero supply", () => {
    expect(computeFaminePhase(0 as Q)).toBe("catastrophe");
  });
});

// ── computeFaminePressures ────────────────────────────────────────────────────

describe("computeFaminePressures", () => {
  it("none phase with no rationing returns all zeros", () => {
    const s = createFamineState("p");
    const p = computeFaminePressures(s);
    expect(p.deathBonus_Q).toBe(0);
    expect(p.migrationPush_Q).toBe(0);
    expect(p.unrestPressure_Q).toBe(0);
  });

  it("catastrophe phase has non-zero death and migration", () => {
    const s = createFamineState("p");
    s.phase = "catastrophe";
    const p = computeFaminePressures(s);
    expect(p.deathBonus_Q).toBeGreaterThan(0);
    expect(p.migrationPush_Q).toBeGreaterThan(0);
  });

  it("rationing adds unrest even in none phase", () => {
    const s = createFamineState("p");
    const p = computeFaminePressures(s, "emergency");
    expect(p.unrestPressure_Q).toBeGreaterThan(0);
  });

  it("unrest is sum of famine + rationing components", () => {
    const s = createFamineState("p");
    s.phase = "famine";
    const p = computeFaminePressures(s, "tight");
    const expected = FAMINE_PHASE_UNREST_Q.famine + RATIONING_UNREST_Q.tight;
    expect(p.unrestPressure_Q).toBe(expected);
  });

  it("unrest is clamped to SCALE.Q", () => {
    const s = createFamineState("p");
    s.phase = "catastrophe";
    const p = computeFaminePressures(s, "starvation_rations");
    expect(p.unrestPressure_Q).toBeLessThanOrEqual(SCALE.Q);
  });

  it("higher famine phases produce higher death bonus", () => {
    const disaster = createFamineState("p");
    disaster.phase = "catastrophe";
    const fam = createFamineState("p");
    fam.phase = "famine";
    expect(computeFaminePressures(disaster).deathBonus_Q)
      .toBeGreaterThan(computeFaminePressures(fam).deathBonus_Q);
  });
});

// ── stepFamine ────────────────────────────────────────────────────────────────

describe("stepFamine", () => {
  it("returns false when phase unchanged", () => {
    const s = createFamineState("p");
    const changed = stepFamine(s, SCALE.Q as Q, 7);
    expect(changed).toBe(false);
    expect(s.phase).toBe("none");
  });

  it("returns true when phase changes from none to shortage", () => {
    const s = createFamineState("p");
    const changed = stepFamine(s, (SHORTAGE_THRESHOLD_Q - 1) as Q, 1);
    expect(changed).toBe(true);
    expect(s.phase).toBe("shortage");
  });

  it("resets daysInPhase to 0 on phase change, then increments", () => {
    const s = createFamineState("p");
    s.daysInPhase = 50;
    stepFamine(s, (FAMINE_THRESHOLD_Q - 1) as Q, 7);
    expect(s.daysInPhase).toBe(7);
  });

  it("increments daysInPhase when phase unchanged", () => {
    const s = createFamineState("p");
    stepFamine(s, SCALE.Q as Q, 10);
    expect(s.daysInPhase).toBe(10);
    stepFamine(s, SCALE.Q as Q, 5);
    expect(s.daysInPhase).toBe(15);
  });

  it("severity accrues during famine phase", () => {
    const s = createFamineState("p");
    stepFamine(s, (FAMINE_THRESHOLD_Q - 1) as Q, 30);
    expect(s.cumulativeSeverity_Q).toBeGreaterThan(0);
  });

  it("severity decays during none phase", () => {
    const s = createFamineState("p");
    s.cumulativeSeverity_Q = q(0.50) as Q;
    stepFamine(s, SCALE.Q as Q, 10);
    expect(s.cumulativeSeverity_Q).toBeLessThan(q(0.50));
  });

  it("severity never goes below 0", () => {
    const s = createFamineState("p");
    s.cumulativeSeverity_Q = 0 as Q;
    stepFamine(s, SCALE.Q as Q, 1000);
    expect(s.cumulativeSeverity_Q).toBeGreaterThanOrEqual(0);
  });

  it("severity never exceeds SCALE.Q", () => {
    const s = createFamineState("p");
    s.cumulativeSeverity_Q = (SCALE.Q - 5) as Q;
    stepFamine(s, 0 as Q, 100);
    expect(s.cumulativeSeverity_Q).toBeLessThanOrEqual(SCALE.Q);
  });

  it("catastrophe accrues severity faster than shortage", () => {
    const cat = createFamineState("p");
    const sho = createFamineState("p");
    stepFamine(cat, 0 as Q, 10);
    stepFamine(sho, (SHORTAGE_THRESHOLD_Q - 1) as Q, 10);
    expect(cat.cumulativeSeverity_Q).toBeGreaterThan(sho.cumulativeSeverity_Q);
  });

  it("phase transition: shortage → famine", () => {
    const s = createFamineState("p");
    stepFamine(s, (SHORTAGE_THRESHOLD_Q - 1) as Q, 1);
    expect(s.phase).toBe("shortage");
    stepFamine(s, (FAMINE_THRESHOLD_Q - 1) as Q, 1);
    expect(s.phase).toBe("famine");
  });
});

// ── computeRationedConsumption ────────────────────────────────────────────────

describe("computeRationedConsumption", () => {
  it("no rationing = full consumption", () => {
    const polity = makePolity(1000);
    const full = computeRationedConsumption(polity, "none", 1);
    expect(full).toBe(1000);
  });

  it("tight rationing reduces by 20%", () => {
    const polity = makePolity(1000);
    const demand = computeRationedConsumption(polity, "tight", 1);
    expect(demand).toBe(800);
  });

  it("emergency rationing reduces by 40%", () => {
    const polity = makePolity(1000);
    const demand = computeRationedConsumption(polity, "emergency", 1);
    expect(demand).toBe(600);
  });

  it("starvation_rations reduces by 60%", () => {
    const polity = makePolity(1000);
    const demand = computeRationedConsumption(polity, "starvation_rations", 1);
    expect(demand).toBe(400);
  });

  it("scales linearly with elapsedDays", () => {
    const polity = makePolity(500);
    const day1  = computeRationedConsumption(polity, "tight", 1);
    const day7  = computeRationedConsumption(polity, "tight", 7);
    expect(day7).toBe(day1 * 7);
  });

  it("starvation_rations < emergency < tight < none", () => {
    const polity = makePolity(2000);
    const none    = computeRationedConsumption(polity, "none",               1);
    const tight   = computeRationedConsumption(polity, "tight",              1);
    const emerg   = computeRationedConsumption(polity, "emergency",          1);
    const starve  = computeRationedConsumption(polity, "starvation_rations", 1);
    expect(none > tight && tight > emerg && emerg > starve).toBe(true);
  });
});

// ── stepRationedGranary ───────────────────────────────────────────────────────

describe("stepRationedGranary", () => {
  it("no policy drains full demand", () => {
    const polity  = makePolity(100);
    const granary = makeGranary(10_000);
    const consumed = stepRationedGranary(polity, granary, "none", 1);
    expect(consumed).toBe(100);
    expect(granary.grain_su).toBe(9900);
  });

  it("tight rationing drains less than normal", () => {
    const polity  = makePolity(1000);
    const g1      = makeGranary(500_000);
    const g2      = makeGranary(500_000);
    stepRationedGranary(polity, g1, "none",  7);
    stepRationedGranary(polity, g2, "tight", 7);
    expect(g2.grain_su).toBeGreaterThan(g1.grain_su);
  });

  it("grain never goes below zero", () => {
    const polity  = makePolity(1_000_000);
    const granary = makeGranary(10);
    stepRationedGranary(polity, granary, "none", 1);
    expect(granary.grain_su).toBe(0);
  });

  it("returns actual consumed (capped when granary runs low)", () => {
    const polity  = makePolity(1000);
    const granary = makeGranary(300);   // less than 1-day demand of 1000
    const consumed = stepRationedGranary(polity, granary, "none", 1);
    expect(consumed).toBe(300);
    expect(granary.grain_su).toBe(0);
  });
});

// ── computeReliefImport ───────────────────────────────────────────────────────

describe("computeReliefImport", () => {
  it("adds grain and deducts treasury", () => {
    const polity  = makePolity(1000, 2000);
    const granary = makeGranary(0);
    const added   = computeReliefImport(polity, granary, 2000, 5000);
    expect(added).toBe(1000);   // 2000 cu / 2 cu per su
    expect(granary.grain_su).toBe(1000);
    expect(polity.treasury_cu).toBe(0);
  });

  it("is capped by granary capacity", () => {
    const polity  = makePolity(1000, 100_000);
    const granary = makeGranary(4500);
    const added   = computeReliefImport(polity, granary, 100_000, 5000);
    expect(added).toBe(500);           // only 500 su of space left
    expect(granary.grain_su).toBe(5000);
  });

  it("is capped by available treasury", () => {
    const polity  = makePolity(1000, 100);
    const granary = makeGranary(0);
    const added   = computeReliefImport(polity, granary, 100_000, 100_000);
    expect(added).toBe(50);            // only 100 cu / 2 = 50 su affordable
    expect(polity.treasury_cu).toBe(0);
  });

  it("is capped by budget parameter", () => {
    const polity  = makePolity(1000, 10_000);
    const granary = makeGranary(0);
    const added   = computeReliefImport(polity, granary, 200, 100_000);
    expect(added).toBe(100);           // budget 200 / 2 = 100 su
  });

  it("returns 0 when granary already full", () => {
    const polity  = makePolity(1000, 10_000);
    const granary = makeGranary(5000);
    const added   = computeReliefImport(polity, granary, 10_000, 5000);
    expect(added).toBe(0);
    expect(polity.treasury_cu).toBe(10_000);   // no spend
  });

  it("returns 0 when treasury is empty", () => {
    const polity  = makePolity(1000, 0);
    const granary = makeGranary(0);
    const added   = computeReliefImport(polity, granary, 1000, 5000);
    expect(added).toBe(0);
  });
});

// ── isFamineActive / isCatastrophicFamine ─────────────────────────────────────

describe("isFamineActive", () => {
  it("false when phase is none", () => {
    const s = createFamineState("p");
    expect(isFamineActive(s)).toBe(false);
  });

  it("true for shortage", () => {
    const s = createFamineState("p");
    s.phase = "shortage";
    expect(isFamineActive(s)).toBe(true);
  });

  it("true for famine", () => {
    const s = createFamineState("p");
    s.phase = "famine";
    expect(isFamineActive(s)).toBe(true);
  });

  it("true for catastrophe", () => {
    const s = createFamineState("p");
    s.phase = "catastrophe";
    expect(isFamineActive(s)).toBe(true);
  });
});

describe("isCatastrophicFamine", () => {
  it("false for none/shortage/famine", () => {
    for (const phase of ["none", "shortage", "famine"] as const) {
      const s = createFamineState("p");
      s.phase = phase;
      expect(isCatastrophicFamine(s)).toBe(false);
    }
  });

  it("true only for catastrophe", () => {
    const s = createFamineState("p");
    s.phase = "catastrophe";
    expect(isCatastrophicFamine(s)).toBe(true);
  });
});

// ── Integration ───────────────────────────────────────────────────────────────

describe("integration", () => {
  it("full lifecycle: food drops → famine → relief import → recovery", () => {
    // Small population so relief budget (50k cu) covers >50% granary capacity
    // cap = 50 × 730 = 36,500 su; affordable = 50k/2 = 25k su → foodQ ≈ 69% → "none"
    const polity  = makePolity(50, 50_000);
    const granary = makeGranary(10);      // critically low: < catastrophe threshold
    const state   = createFamineState("p1");
    const cap     = polity.population * 730;   // GRANARY_CAPACITY_DAYS

    // Classify initial famine phase — near-empty granary
    // foodSupply_Q ≈ 100 / (1000×730) ≈ q(0.000137) → catastrophe
    const foodQ = Math.round(granary.grain_su * SCALE.Q / cap) as Q;
    stepFamine(state, foodQ, 1);
    expect(state.phase).toBe("catastrophe");
    expect(isCatastrophicFamine(state)).toBe(true);

    // Famine pressures should be high
    const pressures = computeFaminePressures(state, "emergency");
    expect(pressures.deathBonus_Q).toBeGreaterThan(0);
    expect(pressures.migrationPush_Q).toBeGreaterThan(q(0.40));

    // Relief import fills granary
    const added = computeReliefImport(polity, granary, polity.treasury_cu, cap);
    expect(added).toBeGreaterThan(0);

    // After import, food supply recovers to none
    const foodQ2 = Math.round(granary.grain_su * SCALE.Q / cap) as Q;
    const changed = stepFamine(state, foodQ2, 1);
    expect(changed).toBe(true);
    expect(state.phase).toBe("none");
    expect(isFamineActive(state)).toBe(false);

    // But cumulative severity persists
    expect(state.cumulativeSeverity_Q).toBeGreaterThan(0);
  });

  it("rationing extends granary life during drought", () => {
    const polity   = makePolity(1000);
    const g_none   = makeGranary(30_000);
    const g_ration = makeGranary(30_000);

    for (let day = 0; day < 30; day++) {
      stepRationedGranary(polity, g_none,   "none",      1);
      stepRationedGranary(polity, g_ration, "emergency", 1);
    }

    expect(g_ration.grain_su).toBeGreaterThan(g_none.grain_su);
  });

  it("severity accumulates over prolonged famine then decays on recovery", () => {
    const state = createFamineState("p");
    for (let d = 0; d < 50; d++) {
      stepFamine(state, (FAMINE_THRESHOLD_Q - 1) as Q, 1);
    }
    const peakSeverity = state.cumulativeSeverity_Q;
    expect(peakSeverity).toBeGreaterThan(0);

    // Recover
    for (let d = 0; d < 100; d++) {
      stepFamine(state, SCALE.Q as Q, 1);
    }
    expect(state.cumulativeSeverity_Q).toBeLessThan(peakSeverity);
  });
});
