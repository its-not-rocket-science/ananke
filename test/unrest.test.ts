// test/unrest.test.ts — Phase 90: Civil Unrest & Rebellion

import { describe, it, expect } from "vitest";
import {
  UNREST_MORALE_WEIGHT_Q,
  UNREST_STABILITY_WEIGHT_Q,
  UNREST_ACTION_THRESHOLD_Q,
  REBELLION_THRESHOLD_Q,
  REBELLION_TREASURY_RAID_Q,
  computeUnrestLevel,
  stepUnrest,
  resolveRebellion,
} from "../src/unrest.js";
import { createPolity } from "../src/polity.js";
import { q, SCALE, mulDiv } from "../src/units.js";
import type { Q } from "../src/units.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePolity(morale = q(0.60) as Q, stability = q(0.70) as Q, military?: Q) {
  const p = createPolity("p1", "Test", "f1", [], 50_000, 300_000, "Medieval");
  p.moraleQ    = morale;
  p.stabilityQ = stability;
  if (military != null) p.militaryStrength_Q = military;
  return p;
}

// ── Constants ──────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("UNREST_ACTION_THRESHOLD_Q is q(0.30)", () => {
    expect(UNREST_ACTION_THRESHOLD_Q).toBe(q(0.30));
  });

  it("REBELLION_THRESHOLD_Q is q(0.65)", () => {
    expect(REBELLION_THRESHOLD_Q).toBe(q(0.65));
  });

  it("morale weight is q(0.30)", () => {
    expect(UNREST_MORALE_WEIGHT_Q).toBe(q(0.30));
  });

  it("stability weight is q(0.25)", () => {
    expect(UNREST_STABILITY_WEIGHT_Q).toBe(q(0.25));
  });
});

// ── computeUnrestLevel ────────────────────────────────────────────────────────

describe("computeUnrestLevel", () => {
  it("high morale and stability with no external factors → low unrest", () => {
    const p = makePolity(SCALE.Q as Q, SCALE.Q as Q);
    expect(computeUnrestLevel(p)).toBe(0);
  });

  it("zero morale and stability → high unrest from base factors", () => {
    const p = makePolity(0 as Q, 0 as Q);
    const u = computeUnrestLevel(p);
    // morale contrib = 1.0 × 0.30 = q(0.30)
    // stability contrib = 1.0 × 0.25 = q(0.25)
    // total = q(0.55) minimum
    expect(u).toBeGreaterThanOrEqual(q(0.50));
  });

  it("morale deficit contributes MORALE_WEIGHT × deficit", () => {
    const p       = makePolity(SCALE.Q as Q, SCALE.Q as Q);  // no base unrest
    p.moraleQ     = q(0.20) as Q;
    const u       = computeUnrestLevel(p);
    const expected = mulDiv(SCALE.Q - q(0.20), UNREST_MORALE_WEIGHT_Q, SCALE.Q);
    // stability=SCALE.Q → no stability contrib; no factors
    expect(u).toBe(expected);
  });

  it("famine pressure increases unrest", () => {
    const p  = makePolity();
    const u0 = computeUnrestLevel(p);
    const u1 = computeUnrestLevel(p, { faminePressure_Q: q(0.80) as Q });
    expect(u1).toBeGreaterThan(u0);
  });

  it("epidemic pressure increases unrest", () => {
    const p  = makePolity();
    const u0 = computeUnrestLevel(p);
    const u1 = computeUnrestLevel(p, { epidemicPressure_Q: q(0.60) as Q });
    expect(u1).toBeGreaterThan(u0);
  });

  it("heresy risk increases unrest", () => {
    const p  = makePolity();
    const u0 = computeUnrestLevel(p);
    const u1 = computeUnrestLevel(p, { heresyRisk_Q: q(0.50) as Q });
    expect(u1).toBeGreaterThan(u0);
  });

  it("weak feudal bond (near zero) increases unrest", () => {
    const p  = makePolity();
    const u0 = computeUnrestLevel(p);
    const u1 = computeUnrestLevel(p, { weakestBond_Q: q(0.05) as Q });
    expect(u1).toBeGreaterThan(u0);
  });

  it("strong feudal bond (near SCALE.Q) has negligible effect", () => {
    const p  = makePolity();
    const u0 = computeUnrestLevel(p);
    const u1 = computeUnrestLevel(p, { weakestBond_Q: SCALE.Q as Q });
    expect(u1).toBe(u0);  // SCALE.Q - SCALE.Q = 0 feudal deficit
  });

  it("all factors at max produces high unrest", () => {
    const p = makePolity(0 as Q, 0 as Q);
    const u = computeUnrestLevel(p, {
      faminePressure_Q:   SCALE.Q as Q,
      epidemicPressure_Q: SCALE.Q as Q,
      heresyRisk_Q:       SCALE.Q as Q,
      weakestBond_Q:      0 as Q,
    });
    expect(u).toBeGreaterThan(REBELLION_THRESHOLD_Q);
  });

  it("result is clamped to [0, SCALE.Q]", () => {
    const p = makePolity(0 as Q, 0 as Q);
    const u = computeUnrestLevel(p, {
      faminePressure_Q: SCALE.Q as Q,
      epidemicPressure_Q: SCALE.Q as Q,
    });
    expect(u).toBeLessThanOrEqual(SCALE.Q);
    expect(u).toBeGreaterThanOrEqual(0);
  });

  it("omitting all optional factors gives same result as empty object", () => {
    const p = makePolity();
    expect(computeUnrestLevel(p)).toBe(computeUnrestLevel(p, {}));
  });
});

// ── stepUnrest ────────────────────────────────────────────────────────────────

describe("stepUnrest", () => {
  it("unrest below threshold causes no decay", () => {
    const p = makePolity(q(0.80) as Q, q(0.80) as Q);
    const moraleBefore    = p.moraleQ;
    const stabilityBefore = p.stabilityQ;
    const r = stepUnrest(p, q(0.20) as Q, 30);  // below UNREST_ACTION_THRESHOLD_Q
    expect(r.moraleDecay_Q).toBe(0);
    expect(r.stabilityDecay_Q).toBe(0);
    expect(p.moraleQ).toBe(moraleBefore);
    expect(p.stabilityQ).toBe(stabilityBefore);
  });

  it("high unrest drains morale and stability", () => {
    const p = makePolity(q(0.80) as Q, q(0.80) as Q);
    const r = stepUnrest(p, q(0.60) as Q, 30);
    expect(r.moraleDecay_Q).toBeGreaterThan(0);
    expect(r.stabilityDecay_Q).toBeGreaterThan(0);
    expect(p.moraleQ).toBeLessThan(q(0.80));
    expect(p.stabilityQ).toBeLessThan(q(0.80));
  });

  it("drain scales with excess above threshold", () => {
    const p1 = makePolity(q(0.80) as Q, q(0.80) as Q);
    const p2 = makePolity(q(0.80) as Q, q(0.80) as Q);
    const r1 = stepUnrest(p1, q(0.40) as Q, 30);  // small excess
    const r2 = stepUnrest(p2, q(0.80) as Q, 30);  // large excess
    expect(r2.moraleDecay_Q).toBeGreaterThan(r1.moraleDecay_Q);
  });

  it("drain scales with elapsed days", () => {
    const p1 = makePolity(q(0.80) as Q, q(0.80) as Q);
    const p2 = makePolity(q(0.80) as Q, q(0.80) as Q);
    const r1 = stepUnrest(p1, q(0.60) as Q, 7);
    const r2 = stepUnrest(p2, q(0.60) as Q, 30);
    expect(r2.moraleDecay_Q).toBeGreaterThan(r1.moraleDecay_Q);
  });

  it("morale never goes below zero", () => {
    const p = makePolity(q(0.01) as Q, q(0.80) as Q);
    stepUnrest(p, SCALE.Q as Q, 365);
    expect(p.moraleQ).toBeGreaterThanOrEqual(0);
  });

  it("stability never goes below zero", () => {
    const p = makePolity(q(0.80) as Q, q(0.01) as Q);
    stepUnrest(p, SCALE.Q as Q, 365);
    expect(p.stabilityQ).toBeGreaterThanOrEqual(0);
  });

  it("rebellionRisk flag set when unrest exceeds REBELLION_THRESHOLD_Q", () => {
    const p = makePolity();
    const r = stepUnrest(p, q(0.70) as Q, 1);
    expect(r.rebellionRisk).toBe(true);
  });

  it("rebellionRisk flag not set when unrest is below threshold", () => {
    const p = makePolity();
    const r = stepUnrest(p, q(0.50) as Q, 1);
    expect(r.rebellionRisk).toBe(false);
  });

  it("returns unrestLevel_Q unchanged in result", () => {
    const p = makePolity();
    const r = stepUnrest(p, q(0.55) as Q, 1);
    expect(r.unrestLevel_Q).toBe(q(0.55));
  });
});

// ── resolveRebellion ──────────────────────────────────────────────────────────

describe("resolveRebellion", () => {
  it("always returns a valid outcome", () => {
    const _p = makePolity();
    const valid: Set<string> = new Set(["quelled", "uprising", "civil_war"]);
    for (let tick = 0; tick < 20; tick++) {
      const pol = makePolity();
      const r   = resolveRebellion(pol, 42, tick);
      expect(valid.has(r.outcome)).toBe(true);
    }
  });

  it("quelled outcome has smaller penalties than uprising", () => {
    // Find a quelled and an uprising across seeds
    let quelledMorale = 0, uprisingMorale = 0;
    for (let tick = 0; tick < 100; tick++) {
      const pol = makePolity(q(0.60) as Q, q(0.60) as Q, q(0.90) as Q);
      const r   = resolveRebellion(pol, 99, tick);
      if (r.outcome === "quelled")   quelledMorale  = Math.abs(r.moraleHit_Q);
      if (r.outcome === "uprising")  uprisingMorale = Math.abs(r.moraleHit_Q);
    }
    if (quelledMorale > 0 && uprisingMorale > 0) {
      expect(quelledMorale).toBeLessThan(uprisingMorale);
    }
  });

  it("resolveRebellion is deterministic for same seed and tick", () => {
    const p1 = makePolity();
    const p2 = makePolity();
    const r1 = resolveRebellion(p1, 42, 100);
    const r2 = resolveRebellion(p2, 42, 100);
    expect(r1.outcome).toBe(r2.outcome);
  });

  it("different ticks may produce different outcomes", () => {
    const outcomes = new Set<string>();
    for (let tick = 0; tick < 50; tick++) {
      const pol = makePolity(q(0.20) as Q, q(0.20) as Q);
      outcomes.add(resolveRebellion(pol, 1, tick).outcome);
    }
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it("quelled rebellion plunders no treasury", () => {
    // Force a quelled outcome with very high military strength
    for (let tick = 0; tick < 100; tick++) {
      const pol = makePolity(q(0.50) as Q, q(0.50) as Q, SCALE.Q as Q);
      const r   = resolveRebellion(pol, 7, tick);
      if (r.outcome === "quelled") {
        expect(r.treasuryLoss).toBe(0);
        break;
      }
    }
  });

  it("uprising plunders REBELLION_TREASURY_RAID_Q of treasury", () => {
    for (let tick = 0; tick < 100; tick++) {
      const pol = makePolity(q(0.30) as Q, q(0.30) as Q, q(0.30) as Q);
      const treasuryBefore = pol.treasury_cu;
      const r   = resolveRebellion(pol, 3, tick);
      if (r.outcome === "uprising") {
        const expected = Math.floor(mulDiv(treasuryBefore, REBELLION_TREASURY_RAID_Q, SCALE.Q));
        expect(r.treasuryLoss).toBe(expected);
        break;
      }
    }
  });

  it("mutates polity morale and stability", () => {
    const p = makePolity(q(0.60) as Q, q(0.60) as Q);
    const moraleBefore    = p.moraleQ;
    const stabilityBefore = p.stabilityQ;
    resolveRebellion(p, 42, 1);
    expect(p.moraleQ).toBeLessThan(moraleBefore);
    expect(p.stabilityQ).toBeLessThan(stabilityBefore);
  });

  it("morale and stability never go below zero after rebellion", () => {
    const p = makePolity(q(0.01) as Q, q(0.01) as Q);
    resolveRebellion(p, 42, 1);
    expect(p.moraleQ).toBeGreaterThanOrEqual(0);
    expect(p.stabilityQ).toBeGreaterThanOrEqual(0);
  });

  it("treasury never goes below zero after rebellion", () => {
    const p = makePolity();
    p.treasury_cu = 0;
    resolveRebellion(p, 42, 1);
    expect(p.treasury_cu).toBe(0);
  });
});

// ── Integration: full pressure scenario ──────────────────────────────────────

describe("integration", () => {
  it("starving plague polity with weak bonds crosses rebellion threshold", () => {
    const p = makePolity(q(0.20) as Q, q(0.20) as Q);
    const u = computeUnrestLevel(p, {
      faminePressure_Q:   q(0.80) as Q,
      epidemicPressure_Q: q(0.60) as Q,
      weakestBond_Q:      q(0.10) as Q,
    });
    expect(u).toBeGreaterThan(REBELLION_THRESHOLD_Q);
    const r = stepUnrest(p, u, 1);
    expect(r.rebellionRisk).toBe(true);
  });

  it("stable prosperous polity stays below action threshold", () => {
    const p = makePolity(SCALE.Q as Q, SCALE.Q as Q);
    const u = computeUnrestLevel(p, {
      faminePressure_Q:   0 as Q,
      epidemicPressure_Q: 0 as Q,
    });
    expect(u).toBeLessThanOrEqual(UNREST_ACTION_THRESHOLD_Q);
    const r = stepUnrest(p, u, 30);
    expect(r.moraleDecay_Q).toBe(0);
  });
});
