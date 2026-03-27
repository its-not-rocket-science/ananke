// test/monetary.test.ts — Phase 101: Currency & Monetary Policy

import { describe, it, expect } from "vitest";
import {
  MONETARY_CRISIS_THRESHOLD_Q,
  MONETARY_MAX_UNREST_Q,
  MONETARY_TRADE_FLOOR_Q,
  POLICY_PURITY_DELTA_PER_DAY,
  POLICY_INFLATION_DELTA_PER_DAY,
  POLICY_DAILY_MINT_FRAC_Q,
  createMonetaryState,
  computePurchasingPower_Q,
  computeMonetaryTradeMultiplier_Q,
  computeMonetaryUnrest_Q,
  computeDebasementGain_cu,
  stepMonetary,
  isMonetaryCrisis,
  isCoinageSound,
} from "../src/monetary.js";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";
import type { Polity } from "../src/polity.js";
import type { TechEra } from "../src/sim/tech.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePolity(treasury_cu = 100_000): Polity {
  return {
    id: "p1", name: "Test",
    factionId: "f1", locationIds: [],
    population: 10_000, treasury_cu,
    techEra: 2 as TechEra,
    militaryStrength_Q: q(0.60) as Q,
    stabilityQ: q(0.70) as Q,
    moraleQ: q(0.60) as Q,
  } as Polity;
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("MONETARY_CRISIS_THRESHOLD_Q is between q(0.50) and q(0.80)", () => {
    expect(MONETARY_CRISIS_THRESHOLD_Q).toBeGreaterThan(q(0.50));
    expect(MONETARY_CRISIS_THRESHOLD_Q).toBeLessThan(q(0.80));
  });

  it("emergency_printing has largest mint fraction", () => {
    const max = Math.max(...Object.values(POLICY_DAILY_MINT_FRAC_Q));
    expect(POLICY_DAILY_MINT_FRAC_Q.emergency_printing).toBe(max);
    expect(POLICY_DAILY_MINT_FRAC_Q.stable).toBe(0);
  });

  it("stable policy has positive purity recovery and negative inflation", () => {
    expect(POLICY_PURITY_DELTA_PER_DAY.stable).toBeGreaterThan(0);
    expect(POLICY_INFLATION_DELTA_PER_DAY.stable).toBeLessThan(0);
  });

  it("emergency_printing has most negative purity delta and most positive inflation delta", () => {
    const minPurity = Math.min(...Object.values(POLICY_PURITY_DELTA_PER_DAY));
    expect(POLICY_PURITY_DELTA_PER_DAY.emergency_printing).toBe(minPurity);
    const maxInflation = Math.max(...Object.values(POLICY_INFLATION_DELTA_PER_DAY));
    expect(POLICY_INFLATION_DELTA_PER_DAY.emergency_printing).toBe(maxInflation);
  });

  it("MONETARY_TRADE_FLOOR_Q is below q(0.60)", () => {
    expect(MONETARY_TRADE_FLOOR_Q).toBeLessThan(q(0.60));
    expect(MONETARY_TRADE_FLOOR_Q).toBeGreaterThan(0);
  });
});

// ── createMonetaryState ───────────────────────────────────────────────────────

describe("createMonetaryState", () => {
  it("starts with full purity and zero inflation", () => {
    const s = createMonetaryState("p1");
    expect(s.coinPurity_Q).toBe(SCALE.Q);
    expect(s.inflationLevel_Q).toBe(0);
  });

  it("starts with no monetary crisis", () => {
    expect(createMonetaryState("p1").monetaryCrisis).toBe(false);
  });

  it("stores polityId", () => {
    expect(createMonetaryState("abc").polityId).toBe("abc");
  });
});

// ── computePurchasingPower_Q ──────────────────────────────────────────────────

describe("computePurchasingPower_Q", () => {
  it("returns SCALE.Q with full purity and zero inflation", () => {
    const s = createMonetaryState("p");
    expect(computePurchasingPower_Q(s)).toBe(SCALE.Q);
  });

  it("falls when purity degrades", () => {
    const s = createMonetaryState("p");
    s.coinPurity_Q = q(0.60) as Q;
    expect(computePurchasingPower_Q(s)).toBeLessThan(SCALE.Q);
  });

  it("falls when inflation rises", () => {
    const s = createMonetaryState("p");
    s.inflationLevel_Q = q(0.40) as Q;
    expect(computePurchasingPower_Q(s)).toBeLessThan(SCALE.Q);
  });

  it("lower with both purity degraded and inflation high", () => {
    const pristine  = createMonetaryState("p");
    const debased   = createMonetaryState("p");
    debased.coinPurity_Q     = q(0.50) as Q;
    debased.inflationLevel_Q = q(0.50) as Q;
    expect(computePurchasingPower_Q(debased))
      .toBeLessThan(computePurchasingPower_Q(pristine));
  });

  it("minimum is q(0.05) — never reaches zero", () => {
    const s = createMonetaryState("p");
    s.coinPurity_Q     = 0 as Q;
    s.inflationLevel_Q = SCALE.Q as Q;
    expect(computePurchasingPower_Q(s)).toBeGreaterThanOrEqual(q(0.05));
  });

  it("always in [q(0.05), SCALE.Q]", () => {
    const s = createMonetaryState("p");
    for (const [p, i] of [[1.0, 0.0], [0.5, 0.5], [0.2, 0.8], [0.0, 1.0]]) {
      s.coinPurity_Q     = q(p) as Q;
      s.inflationLevel_Q = q(i) as Q;
      const pp = computePurchasingPower_Q(s);
      expect(pp).toBeGreaterThanOrEqual(q(0.05));
      expect(pp).toBeLessThanOrEqual(SCALE.Q);
    }
  });
});

// ── computeMonetaryTradeMultiplier_Q ──────────────────────────────────────────

describe("computeMonetaryTradeMultiplier_Q", () => {
  it("returns SCALE.Q at full purity", () => {
    const s = createMonetaryState("p");
    expect(computeMonetaryTradeMultiplier_Q(s)).toBe(SCALE.Q);
  });

  it("falls as purity degrades", () => {
    const s = createMonetaryState("p");
    s.coinPurity_Q = q(0.40) as Q;
    expect(computeMonetaryTradeMultiplier_Q(s)).toBeLessThan(SCALE.Q);
  });

  it("never falls below MONETARY_TRADE_FLOOR_Q", () => {
    const s = createMonetaryState("p");
    s.coinPurity_Q = 0 as Q;
    expect(computeMonetaryTradeMultiplier_Q(s)).toBeGreaterThanOrEqual(MONETARY_TRADE_FLOOR_Q);
  });

  it("higher purity = higher trade multiplier", () => {
    const lo = createMonetaryState("p");
    lo.coinPurity_Q = q(0.30) as Q;
    const hi = createMonetaryState("p");
    hi.coinPurity_Q = q(0.80) as Q;
    expect(computeMonetaryTradeMultiplier_Q(hi))
      .toBeGreaterThan(computeMonetaryTradeMultiplier_Q(lo));
  });
});

// ── computeMonetaryUnrest_Q ───────────────────────────────────────────────────

describe("computeMonetaryUnrest_Q", () => {
  it("returns 0 with zero inflation", () => {
    const s = createMonetaryState("p");
    expect(computeMonetaryUnrest_Q(s)).toBe(0);
  });

  it("returns MONETARY_MAX_UNREST_Q at full inflation", () => {
    const s = createMonetaryState("p");
    s.inflationLevel_Q = SCALE.Q as Q;
    expect(computeMonetaryUnrest_Q(s)).toBe(MONETARY_MAX_UNREST_Q);
  });

  it("scales linearly with inflation", () => {
    const lo = createMonetaryState("p");
    lo.inflationLevel_Q = q(0.30) as Q;
    const hi = createMonetaryState("p");
    hi.inflationLevel_Q = q(0.70) as Q;
    expect(computeMonetaryUnrest_Q(hi)).toBeGreaterThan(computeMonetaryUnrest_Q(lo));
  });

  it("never exceeds MONETARY_MAX_UNREST_Q", () => {
    const s = createMonetaryState("p");
    s.inflationLevel_Q = SCALE.Q as Q;
    expect(computeMonetaryUnrest_Q(s)).toBeLessThanOrEqual(MONETARY_MAX_UNREST_Q);
  });
});

// ── computeDebasementGain_cu ──────────────────────────────────────────────────

describe("computeDebasementGain_cu", () => {
  it("returns 0 for stable policy", () => {
    const polity = makePolity(100_000);
    expect(computeDebasementGain_cu(polity, "stable", 1)).toBe(0);
  });

  it("returns positive gain for debasement", () => {
    const polity = makePolity(100_000);
    expect(computeDebasementGain_cu(polity, "slight_debasement", 1)).toBeGreaterThan(0);
  });

  it("scales with elapsedDays", () => {
    const polity = makePolity(100_000);
    const day1   = computeDebasementGain_cu(polity, "heavy_debasement", 1);
    const day7   = computeDebasementGain_cu(polity, "heavy_debasement", 7);
    expect(day7).toBe(day1 * 7);
  });

  it("emergency_printing gains more than slight_debasement", () => {
    const polity = makePolity(100_000);
    expect(computeDebasementGain_cu(polity, "emergency_printing", 1))
      .toBeGreaterThan(computeDebasementGain_cu(polity, "slight_debasement", 1));
  });

  it("scales with treasury size", () => {
    const small = makePolity(10_000);
    const large = makePolity(100_000);
    expect(computeDebasementGain_cu(large, "heavy_debasement", 1))
      .toBe(computeDebasementGain_cu(small, "heavy_debasement", 1) * 10);
  });
});

// ── stepMonetary ──────────────────────────────────────────────────────────────

describe("stepMonetary — stable", () => {
  it("stable policy does not increase treasury", () => {
    const polity = makePolity(100_000);
    const state  = createMonetaryState("p");
    const before = polity.treasury_cu;
    stepMonetary(polity, state, "stable", 30);
    expect(polity.treasury_cu).toBe(before);
  });

  it("stable policy recovers purity from degraded state", () => {
    const polity = makePolity();
    const state  = createMonetaryState("p");
    state.coinPurity_Q = q(0.50) as Q;
    stepMonetary(polity, state, "stable", 30);
    expect(state.coinPurity_Q).toBeGreaterThan(q(0.50));
  });

  it("stable policy reduces inflation", () => {
    const polity = makePolity();
    const state  = createMonetaryState("p");
    state.inflationLevel_Q = q(0.40) as Q;
    stepMonetary(polity, state, "stable", 30);
    expect(state.inflationLevel_Q).toBeLessThan(q(0.40));
  });

  it("purity clamped to SCALE.Q — cannot exceed full purity", () => {
    const polity = makePolity();
    const state  = createMonetaryState("p");  // already at SCALE.Q
    stepMonetary(polity, state, "stable", 1000);
    expect(state.coinPurity_Q).toBeLessThanOrEqual(SCALE.Q);
  });
});

describe("stepMonetary — debasement", () => {
  it("increases treasury", () => {
    const polity = makePolity(100_000);
    const state  = createMonetaryState("p");
    const before = polity.treasury_cu;
    stepMonetary(polity, state, "heavy_debasement", 30);
    expect(polity.treasury_cu).toBeGreaterThan(before);
  });

  it("degrades coin purity", () => {
    const polity = makePolity();
    const state  = createMonetaryState("p");
    stepMonetary(polity, state, "heavy_debasement", 30);
    expect(state.coinPurity_Q).toBeLessThan(SCALE.Q);
  });

  it("accrues inflation", () => {
    const polity = makePolity();
    const state  = createMonetaryState("p");
    stepMonetary(polity, state, "heavy_debasement", 30);
    expect(state.inflationLevel_Q).toBeGreaterThan(0);
  });

  it("emergency_printing inflates faster than slight_debasement", () => {
    const p1 = makePolity(); const s1 = createMonetaryState("p");
    const p2 = makePolity(); const s2 = createMonetaryState("p");
    stepMonetary(p1, s1, "emergency_printing",  30);
    stepMonetary(p2, s2, "slight_debasement",   30);
    expect(s1.inflationLevel_Q).toBeGreaterThan(s2.inflationLevel_Q);
  });

  it("sets monetaryCrisis when inflation reaches threshold", () => {
    const polity = makePolity(10_000_000);
    const state  = createMonetaryState("p");
    // Emergency printing: +50/day inflation; threshold = q(0.60) = 6000; need 120 days
    stepMonetary(polity, state, "emergency_printing", 130);
    expect(state.monetaryCrisis).toBe(true);
  });

  it("purity and inflation clamped to [0, SCALE.Q]", () => {
    const polity = makePolity(10_000_000);
    const state  = createMonetaryState("p");
    stepMonetary(polity, state, "emergency_printing", 10_000);
    expect(state.coinPurity_Q).toBeGreaterThanOrEqual(0);
    expect(state.inflationLevel_Q).toBeLessThanOrEqual(SCALE.Q);
  });
});

// ── isMonetaryCrisis / isCoinageSound ──────────────────────────────────────────

describe("isMonetaryCrisis", () => {
  it("false at start", () => {
    expect(isMonetaryCrisis(createMonetaryState("p"))).toBe(false);
  });

  it("true when monetaryCrisis flag set", () => {
    const s = createMonetaryState("p");
    s.monetaryCrisis = true;
    expect(isMonetaryCrisis(s)).toBe(true);
  });
});

describe("isCoinageSound", () => {
  it("true at full purity with default threshold", () => {
    expect(isCoinageSound(createMonetaryState("p"))).toBe(true);
  });

  it("false when purity is low", () => {
    const s = createMonetaryState("p");
    s.coinPurity_Q = q(0.40) as Q;
    expect(isCoinageSound(s)).toBe(false);
  });

  it("respects custom threshold", () => {
    const s = createMonetaryState("p");
    s.coinPurity_Q = q(0.60) as Q;
    expect(isCoinageSound(s, q(0.50) as Q)).toBe(true);
    expect(isCoinageSound(s, q(0.70) as Q)).toBe(false);
  });
});

// ── Integration ───────────────────────────────────────────────────────────────

describe("integration", () => {
  it("emergency debasement then recovery cycle", () => {
    const polity = makePolity(50_000);
    const state  = createMonetaryState("p1");

    // 60 days of heavy debasement
    stepMonetary(polity, state, "heavy_debasement", 60);
    expect(state.coinPurity_Q).toBeLessThan(SCALE.Q);
    expect(state.inflationLevel_Q).toBeGreaterThan(0);
    const peakInflation = state.inflationLevel_Q;
    const mintedTreasury = polity.treasury_cu;

    // Treasury grew due to minting
    expect(mintedTreasury).toBeGreaterThan(50_000);

    // 180 days of stable policy — inflation falls
    stepMonetary(polity, state, "stable", 180);
    expect(state.inflationLevel_Q).toBeLessThan(peakInflation);
    expect(state.coinPurity_Q).toBeGreaterThan(0);
  });

  it("monetary crisis degrades trade and purchasing power", () => {
    const polity = makePolity(10_000_000);
    const state  = createMonetaryState("p1");

    // Drive to crisis
    stepMonetary(polity, state, "emergency_printing", 130);
    expect(state.monetaryCrisis).toBe(true);

    const pp    = computePurchasingPower_Q(state);
    const trade = computeMonetaryTradeMultiplier_Q(state);
    const unrest = computeMonetaryUnrest_Q(state);

    expect(pp).toBeLessThan(q(0.50));
    expect(trade).toBeLessThan(SCALE.Q);
    expect(unrest).toBeGreaterThan(0);
  });

  it("stable currency outperforms debased in real purchasing power over 2 years", () => {
    const ps = makePolity(100_000); const ss = createMonetaryState("p");
    const pd = makePolity(100_000); const sd = createMonetaryState("p");

    stepMonetary(ps, ss, "stable",           365 * 2);
    stepMonetary(pd, sd, "heavy_debasement", 365 * 2);

    // Debased treasury is nominally higher but real purchasing power is lower
    expect(pd.treasury_cu).toBeGreaterThan(ps.treasury_cu);         // nominal win
    expect(computePurchasingPower_Q(ss))
      .toBeGreaterThan(computePurchasingPower_Q(sd));                // real loss
  });
});
