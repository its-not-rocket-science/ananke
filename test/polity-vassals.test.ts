/**
 * Phase 70 — Stratified Political Simulation ("Vassal Web" Layer)
 *
 * Covers:
 *  - applyGrievanceEvent
 *  - stepVassalLoyalty — all 7 loyalty types, multiple scenarios each
 *  - computeVassalContribution — full / partial / zero loyalty
 *  - computeEffectiveMilitary — command-chain filtering
 *  - detectRebellionRisk
 *  - resolveSuccessionCrisis — peaceful and contested outcomes
 */

import { describe, it, expect } from "vitest";
import {
  applyGrievanceEvent,
  stepVassalLoyalty,
  computeVassalContribution,
  computeEffectiveMilitary,
  detectRebellionRisk,
  resolveSuccessionCrisis,
  CONTRIBUTION_FLOOR_Q,
  CONTRIBUTION_FULL_Q,
  TERRIFIED_MAX_LOYALTY_Q,
  KIN_BOUND_BASE_Q,
  RIVAL_DECAY_Q,
  GRIEVANCE_DECAY_Q,
} from "../src/polity-vassals.js";
import type { VassalNode, LoyaltyType } from "../src/polity-vassals.js";
import type { Polity } from "../src/polity.js";
import { q, SCALE } from "../src/units.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePolity(overrides: Partial<Polity> = {}): Polity {
  return {
    id:                "liege_realm",
    name:              "The Realm",
    factionId:         "realm",
    locationIds:       ["loc_1"],
    population:        100_000,
    treasury_cu:       50_000,
    techEra:           "medieval",
    militaryStrength_Q: q(0.70) as ReturnType<typeof q>,
    stabilityQ:        q(0.80) as ReturnType<typeof q>,
    moraleQ:           q(0.60) as ReturnType<typeof q>,
    ...overrides,
  };
}

function makeVassal(loyaltyType: LoyaltyType, overrides: Partial<VassalNode> = {}): VassalNode {
  return {
    id:          "house_harlow",
    polityId:    "liege_realm",
    territory_Q: q(0.20) as ReturnType<typeof q>,
    military_Q:  q(0.25) as ReturnType<typeof q>,
    treasury_cu: 10_000,
    loyalty: {
      type:        loyaltyType,
      loyaltyQ:    q(0.60) as ReturnType<typeof q>,
      grievance_Q: q(0.00) as ReturnType<typeof q>,
    },
    ...overrides,
  };
}

const NO_RIVALS: Polity[] = [];

// ── applyGrievanceEvent ───────────────────────────────────────────────────────

describe("applyGrievanceEvent", () => {
  it("adds grievance to a vassal", () => {
    const v = makeVassal("ideological");
    const updated = applyGrievanceEvent(v, q(0.30) as ReturnType<typeof q>);
    expect(updated.loyalty.grievance_Q).toBe(q(0.30));
    expect(updated.loyalty.loyaltyQ).toBe(q(0.60)); // loyalty unchanged
  });

  it("clamps grievance at SCALE.Q", () => {
    const v = makeVassal("honor_bound", {
      loyalty: { type: "honor_bound", loyaltyQ: q(0.70) as ReturnType<typeof q>, grievance_Q: q(0.90) as ReturnType<typeof q> },
    });
    const updated = applyGrievanceEvent(v, q(0.30) as ReturnType<typeof q>);
    expect(updated.loyalty.grievance_Q).toBe(SCALE.Q);
  });

  it("does not mutate the original node", () => {
    const v = makeVassal("transactional");
    applyGrievanceEvent(v, q(0.20) as ReturnType<typeof q>);
    expect(v.loyalty.grievance_Q).toBe(q(0.00));
  });
});

// ── stepVassalLoyalty — ideological ──────────────────────────────────────────

describe("stepVassalLoyalty — ideological", () => {
  it("loyalty slowly increases when content (no grievance)", () => {
    const v = makeVassal("ideological", {
      loyalty: { type: "ideological", loyaltyQ: q(0.60) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const updated = stepVassalLoyalty(v, makePolity(), NO_RIVALS, 1, 1);
    expect(updated.loyalty.loyaltyQ).toBeGreaterThan(q(0.60));
  });

  it("high grievance causes loyalty drain", () => {
    const v = makeVassal("ideological", {
      loyalty: { type: "ideological", loyaltyQ: q(0.60) as ReturnType<typeof q>, grievance_Q: q(0.50) as ReturnType<typeof q> },
    });
    const updated = stepVassalLoyalty(v, makePolity(), NO_RIVALS, 1, 1);
    expect(updated.loyalty.loyaltyQ).toBeLessThan(q(0.60));
  });

  it("grievance decays each tick", () => {
    const v = makeVassal("ideological", {
      loyalty: { type: "ideological", loyaltyQ: q(0.60) as ReturnType<typeof q>, grievance_Q: q(0.20) as ReturnType<typeof q> },
    });
    const updated = stepVassalLoyalty(v, makePolity(), NO_RIVALS, 1, 1);
    expect(updated.loyalty.grievance_Q).toBeLessThan(q(0.20));
  });

  it("is unaffected by rival treasury advantage", () => {
    const richRival = makePolity({ id: "rival", treasury_cu: 999_999 });
    const v = makeVassal("ideological", {
      loyalty: { type: "ideological", loyaltyQ: q(0.70) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const without = stepVassalLoyalty(v, makePolity(), NO_RIVALS, 1, 1);
    const withRival = stepVassalLoyalty(v, makePolity(), [richRival], 1, 1);
    // Ideological loyalty ignores economic rivals
    expect(without.loyalty.loyaltyQ).toBe(withRival.loyalty.loyaltyQ);
  });
});

// ── stepVassalLoyalty — transactional ────────────────────────────────────────

describe("stepVassalLoyalty — transactional", () => {
  it("loyalty rises when liege has treasury advantage", () => {
    const richLiege = makePolity({ treasury_cu: 100_000 });
    const poorRival = makePolity({ id: "rival", treasury_cu: 10_000 });
    const v = makeVassal("transactional", {
      loyalty: { type: "transactional", loyaltyQ: q(0.50) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const updated = stepVassalLoyalty(v, richLiege, [poorRival], 1, 1);
    expect(updated.loyalty.loyaltyQ).toBeGreaterThan(q(0.50));
  });

  it("loyalty falls when rivals have treasury advantage", () => {
    const poorLiege = makePolity({ treasury_cu: 5_000 });
    const richRival = makePolity({ id: "rival", treasury_cu: 100_000 });
    const v = makeVassal("transactional", {
      loyalty: { type: "transactional", loyaltyQ: q(0.70) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const updated = stepVassalLoyalty(v, poorLiege, [richRival], 1, 1);
    expect(updated.loyalty.loyaltyQ).toBeLessThan(q(0.70));
  });

  it("grievance bleeds loyalty even when liege is wealthy", () => {
    const richLiege = makePolity({ treasury_cu: 200_000 });
    const v = makeVassal("transactional", {
      loyalty: { type: "transactional", loyaltyQ: q(0.80) as ReturnType<typeof q>, grievance_Q: q(0.80) as ReturnType<typeof q> },
    });
    const without = stepVassalLoyalty(v, richLiege, NO_RIVALS, 1, 1);
    const vNoGrievance = makeVassal("transactional", {
      loyalty: { type: "transactional", loyaltyQ: q(0.80) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const withoutGrievance = stepVassalLoyalty(vNoGrievance, richLiege, NO_RIVALS, 1, 1);
    expect(without.loyalty.loyaltyQ).toBeLessThan(withoutGrievance.loyalty.loyaltyQ);
  });
});

// ── stepVassalLoyalty — terrified ────────────────────────────────────────────

describe("stepVassalLoyalty — terrified", () => {
  it("loyalty collapses to q(0) when liege is no stronger than vassal", () => {
    const weakLiege = makePolity({ militaryStrength_Q: q(0.20) as ReturnType<typeof q> });
    const v = makeVassal("terrified", {
      military_Q: q(0.25) as ReturnType<typeof q>, // vassal as strong as liege
      loyalty: { type: "terrified", loyaltyQ: q(0.60) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const updated = stepVassalLoyalty(v, weakLiege, NO_RIVALS, 1, 1);
    expect(updated.loyalty.loyaltyQ).toBe(q(0.0));
  });

  it("loyalty slowly recovers when liege is clearly stronger", () => {
    const strongLiege = makePolity({ militaryStrength_Q: q(0.90) as ReturnType<typeof q> });
    const v = makeVassal("terrified", {
      military_Q: q(0.20) as ReturnType<typeof q>,
      loyalty: { type: "terrified", loyaltyQ: q(0.30) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const updated = stepVassalLoyalty(v, strongLiege, NO_RIVALS, 1, 1);
    expect(updated.loyalty.loyaltyQ).toBeGreaterThan(q(0.30));
  });

  it("loyalty is capped at TERRIFIED_MAX_LOYALTY_Q", () => {
    const strongLiege = makePolity({ militaryStrength_Q: q(1.0) as ReturnType<typeof q> });
    let v = makeVassal("terrified", {
      military_Q: q(0.05) as ReturnType<typeof q>,
      loyalty: { type: "terrified", loyaltyQ: q(0.65) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    // Run many ticks to ensure cap is respected
    for (let i = 0; i < 100; i++) {
      v = stepVassalLoyalty(v, strongLiege, NO_RIVALS, 1, i);
    }
    expect(v.loyalty.loyaltyQ).toBeLessThanOrEqual(TERRIFIED_MAX_LOYALTY_Q);
  });
});

// ── stepVassalLoyalty — honor_bound ──────────────────────────────────────────

describe("stepVassalLoyalty — honor_bound", () => {
  it("loyalty recovers slowly without grievance", () => {
    const v = makeVassal("honor_bound", {
      loyalty: { type: "honor_bound", loyaltyQ: q(0.60) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const updated = stepVassalLoyalty(v, makePolity(), NO_RIVALS, 1, 1);
    expect(updated.loyalty.loyaltyQ).toBeGreaterThan(q(0.60));
  });

  it("high grievance causes sharp loyalty drain", () => {
    const v = makeVassal("honor_bound", {
      loyalty: { type: "honor_bound", loyaltyQ: q(0.70) as ReturnType<typeof q>, grievance_Q: q(0.60) as ReturnType<typeof q> },
    });
    const updated = stepVassalLoyalty(v, makePolity(), NO_RIVALS, 1, 1);
    expect(updated.loyalty.loyaltyQ).toBeLessThan(q(0.70));
  });

  it("grievance decays slower than other types (honor_bound remembers)", () => {
    const v1 = makeVassal("honor_bound", {
      loyalty: { type: "honor_bound", loyaltyQ: q(0.60) as ReturnType<typeof q>, grievance_Q: q(0.30) as ReturnType<typeof q> },
    });
    const v2 = makeVassal("ideological", {
      loyalty: { type: "ideological", loyaltyQ: q(0.60) as ReturnType<typeof q>, grievance_Q: q(0.30) as ReturnType<typeof q> },
    });
    const r1 = stepVassalLoyalty(v1, makePolity(), NO_RIVALS, 1, 1);
    const r2 = stepVassalLoyalty(v2, makePolity(), NO_RIVALS, 1, 1);
    expect(r1.loyalty.grievance_Q).toBeGreaterThan(r2.loyalty.grievance_Q);
  });
});

// ── stepVassalLoyalty — opportunistic ────────────────────────────────────────

describe("stepVassalLoyalty — opportunistic", () => {
  it("loyalty rises toward liege morale when liege is strongest", () => {
    const highMoraleLiege = makePolity({ moraleQ: q(0.90) as ReturnType<typeof q> });
    const v = makeVassal("opportunistic", {
      loyalty: { type: "opportunistic", loyaltyQ: q(0.40) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const updated = stepVassalLoyalty(v, highMoraleLiege, NO_RIVALS, 1, 1);
    expect(updated.loyalty.loyaltyQ).toBeGreaterThan(q(0.40));
  });

  it("loyalty falls toward rival morale when rival is stronger", () => {
    const weakLiege  = makePolity({ moraleQ: q(0.20) as ReturnType<typeof q> });
    const strongRival = makePolity({ id: "rival", moraleQ: q(0.90) as ReturnType<typeof q> });
    const v = makeVassal("opportunistic", {
      loyalty: { type: "opportunistic", loyaltyQ: q(0.70) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const updated = stepVassalLoyalty(v, weakLiege, [strongRival], 1, 1);
    expect(updated.loyalty.loyaltyQ).toBeLessThan(q(0.70));
  });
});

// ── stepVassalLoyalty — kin_bound ────────────────────────────────────────────

describe("stepVassalLoyalty — kin_bound", () => {
  it("loyalty recovers toward KIN_BOUND_BASE_Q without grievance", () => {
    const v = makeVassal("kin_bound", {
      loyalty: { type: "kin_bound", loyaltyQ: q(0.60) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const updated = stepVassalLoyalty(v, makePolity(), NO_RIVALS, 1, 1);
    expect(updated.loyalty.loyaltyQ).toBeGreaterThan(q(0.60));
    expect(updated.loyalty.loyaltyQ).toBeLessThanOrEqual(KIN_BOUND_BASE_Q);
  });

  it("does not exceed KIN_BOUND_BASE_Q", () => {
    let v = makeVassal("kin_bound", {
      loyalty: { type: "kin_bound", loyaltyQ: q(0.50) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    for (let i = 0; i < 200; i++) {
      v = stepVassalLoyalty(v, makePolity(), NO_RIVALS, 1, i);
    }
    expect(v.loyalty.loyaltyQ).toBeLessThanOrEqual(KIN_BOUND_BASE_Q);
  });

  it("is resilient against economic rivals (does not track them)", () => {
    const richRival = makePolity({ id: "rival", treasury_cu: 999_999 });
    const v = makeVassal("kin_bound", {
      loyalty: { type: "kin_bound", loyaltyQ: q(0.80) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const without = stepVassalLoyalty(v, makePolity(), NO_RIVALS, 1, 1);
    const withRival = stepVassalLoyalty(v, makePolity(), [richRival], 1, 1);
    expect(without.loyalty.loyaltyQ).toBe(withRival.loyalty.loyaltyQ);
  });
});

// ── stepVassalLoyalty — ideological_rival ────────────────────────────────────

describe("stepVassalLoyalty — ideological_rival", () => {
  it("loyalty decays every tick regardless of conditions", () => {
    const v = makeVassal("ideological_rival", {
      loyalty: { type: "ideological_rival", loyaltyQ: q(0.60) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const updated = stepVassalLoyalty(v, makePolity(), NO_RIVALS, 1, 1);
    expect(updated.loyalty.loyaltyQ).toBeLessThan(q(0.60));
  });

  it("decays by RIVAL_DECAY_Q per tick", () => {
    const v = makeVassal("ideological_rival", {
      loyalty: { type: "ideological_rival", loyaltyQ: q(0.60) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const updated = stepVassalLoyalty(v, makePolity(), NO_RIVALS, 1, 1);
    expect(updated.loyalty.loyaltyQ).toBe(q(0.60) - RIVAL_DECAY_Q);
  });

  it("eventually decays to q(0) even with a generous liege", () => {
    const generousLiege = makePolity({ treasury_cu: 999_999, moraleQ: q(1.0) as ReturnType<typeof q> });
    let v = makeVassal("ideological_rival", {
      loyalty: { type: "ideological_rival", loyaltyQ: q(0.50) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    for (let i = 0; i < 200; i++) {
      v = stepVassalLoyalty(v, generousLiege, NO_RIVALS, 1, i);
    }
    expect(v.loyalty.loyaltyQ).toBe(q(0.0));
  });
});

// ── computeVassalContribution ────────────────────────────────────────────────

describe("computeVassalContribution", () => {
  it("returns full contribution at full loyalty", () => {
    const v = makeVassal("ideological", {
      military_Q:  q(0.30) as ReturnType<typeof q>,
      treasury_cu: 10_000,
      loyalty: { type: "ideological", loyaltyQ: q(0.80) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const c = computeVassalContribution(v);
    expect(c.troops_Q).toBe(q(0.30));
    expect(c.treasury_cu).toBe(10_000);
  });

  it("returns zero at or below CONTRIBUTION_FLOOR_Q", () => {
    const v = makeVassal("ideological", {
      military_Q:  q(0.30) as ReturnType<typeof q>,
      treasury_cu: 10_000,
      loyalty: { type: "ideological", loyaltyQ: CONTRIBUTION_FLOOR_Q, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const c = computeVassalContribution(v);
    expect(c.troops_Q).toBe(0);
    expect(c.treasury_cu).toBe(0);
  });

  it("returns partial contribution between floor and full", () => {
    // loyaltyQ exactly halfway between floor (q(0.20)) and full (q(0.50))
    const midQ = Math.round((CONTRIBUTION_FLOOR_Q + CONTRIBUTION_FULL_Q) / 2) as ReturnType<typeof q>;
    const v = makeVassal("ideological", {
      military_Q:  SCALE.Q as ReturnType<typeof q>, // use SCALE.Q to make math clean
      treasury_cu: 10_000,
      loyalty: { type: "ideological", loyaltyQ: midQ, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    const c = computeVassalContribution(v);
    expect(c.troops_Q).toBeGreaterThan(0);
    expect(c.troops_Q).toBeLessThan(SCALE.Q);
  });
});

// ── computeEffectiveMilitary ──────────────────────────────────────────────────

describe("computeEffectiveMilitary", () => {
  it("returns sum of loyal vassal troops_Q", () => {
    const vassals: VassalNode[] = [
      makeVassal("ideological", {
        id: "v1", military_Q: q(0.30) as ReturnType<typeof q>,
        loyalty: { type: "ideological", loyaltyQ: q(0.80) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
      }),
      makeVassal("ideological", {
        id: "v2", military_Q: q(0.20) as ReturnType<typeof q>,
        loyalty: { type: "ideological", loyaltyQ: q(0.80) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
      }),
    ];
    const effective = computeEffectiveMilitary(vassals);
    expect(effective).toBe(q(0.30) + q(0.20));
  });

  it("disloyal vassals contribute nothing", () => {
    const vassals: VassalNode[] = [
      makeVassal("terrified", {
        id: "v1", military_Q: q(0.40) as ReturnType<typeof q>,
        loyalty: { type: "terrified", loyaltyQ: q(0.10) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
      }),
    ];
    const effective = computeEffectiveMilitary(vassals);
    expect(effective).toBe(0);
  });

  it("returns zero for empty vassal list", () => {
    expect(computeEffectiveMilitary([])).toBe(0);
  });
});

// ── detectRebellionRisk ───────────────────────────────────────────────────────

describe("detectRebellionRisk", () => {
  it("returns near zero for a loyal, content vassal", () => {
    const v = makeVassal("ideological", {
      loyalty: { type: "ideological", loyaltyQ: q(1.0) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> },
    });
    expect(detectRebellionRisk(v)).toBeLessThan(q(0.35));
  });

  it("returns high risk for a disloyal, aggrieved vassal", () => {
    const v = makeVassal("transactional", {
      loyalty: { type: "transactional", loyaltyQ: q(0.05) as ReturnType<typeof q>, grievance_Q: q(0.90) as ReturnType<typeof q> },
    });
    expect(detectRebellionRisk(v)).toBeGreaterThan(q(0.70));
  });

  it("grief without disloyalty still elevates risk", () => {
    const v = makeVassal("honor_bound", {
      loyalty: { type: "honor_bound", loyaltyQ: q(0.80) as ReturnType<typeof q>, grievance_Q: q(0.80) as ReturnType<typeof q> },
    });
    const risk = detectRebellionRisk(v);
    expect(risk).toBeGreaterThan(q(0.20));
  });
});

// ── resolveSuccessionCrisis ───────────────────────────────────────────────────

describe("resolveSuccessionCrisis", () => {
  it("produces a deterministic outcome from the same seed", () => {
    const polity = makePolity();
    const vassals: VassalNode[] = [
      makeVassal("ideological", { id: "v1", military_Q: q(0.40) as ReturnType<typeof q>, loyalty: { type: "ideological", loyaltyQ: q(0.80) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> } }),
      makeVassal("honor_bound", { id: "v2", military_Q: q(0.30) as ReturnType<typeof q>, loyalty: { type: "honor_bound", loyaltyQ: q(0.70) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> } }),
    ];
    const r1 = resolveSuccessionCrisis(polity, vassals, "prince_aldric", 42, 100);
    const r2 = resolveSuccessionCrisis(polity, vassals, "prince_aldric", 42, 100);
    expect(r1.successful).toBe(r2.successful);
    expect(r1.supportQ).toBe(r2.supportQ);
  });

  it("loyaltyDeltas are populated for all vassals", () => {
    const polity = makePolity();
    const vassals: VassalNode[] = [
      makeVassal("ideological",      { id: "v1" }),
      makeVassal("transactional",    { id: "v2" }),
      makeVassal("ideological_rival",{ id: "v3" }),
    ];
    const result = resolveSuccessionCrisis(polity, vassals, "heir_z", 1, 1);
    expect(result.loyaltyDeltas.size).toBe(3);
  });

  it("ideological_rival almost never supports the heir", () => {
    // Run 100 seeds; ideological_rival should support < 20% of the time
    const polity = makePolity();
    const vassals: VassalNode[] = [
      makeVassal("ideological_rival", { id: "rival", military_Q: q(0.50) as ReturnType<typeof q>, loyalty: { type: "ideological_rival", loyaltyQ: q(0.50) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> } }),
    ];
    let successes = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const r = resolveSuccessionCrisis(polity, vassals, "heir", seed, 1);
      if (r.successful) successes++;
    }
    expect(successes).toBeLessThan(20);
  });

  it("ideological vassals usually support the heir", () => {
    const polity = makePolity();
    const vassals: VassalNode[] = [
      makeVassal("ideological", { id: "loyal", military_Q: q(0.50) as ReturnType<typeof q>, loyalty: { type: "ideological", loyaltyQ: q(0.90) as ReturnType<typeof q>, grievance_Q: q(0.00) as ReturnType<typeof q> } }),
    ];
    let successes = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const r = resolveSuccessionCrisis(polity, vassals, "heir", seed, 1);
      if (r.successful) successes++;
    }
    expect(successes).toBeGreaterThan(60);
  });

  it("honor_bound with high grievance rarely supports heir", () => {
    const polity = makePolity();
    const vassals: VassalNode[] = [
      makeVassal("honor_bound", { id: "aggrieved", military_Q: q(0.50) as ReturnType<typeof q>, loyalty: { type: "honor_bound", loyaltyQ: q(0.50) as ReturnType<typeof q>, grievance_Q: q(0.80) as ReturnType<typeof q> } }),
    ];
    let successes = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const r = resolveSuccessionCrisis(polity, vassals, "heir", seed, 1);
      if (r.successful) successes++;
    }
    expect(successes).toBeLessThan(35);
  });

  it("returns zero supportQ for empty vassal list", () => {
    const result = resolveSuccessionCrisis(makePolity(), [], "heir", 1, 1);
    expect(result.supportQ).toBe(0);
    expect(result.successful).toBe(false);
  });
});

// ── Grievance decay constant ──────────────────────────────────────────────────

describe("GRIEVANCE_DECAY_Q", () => {
  it("is exported and positive", () => {
    expect(GRIEVANCE_DECAY_Q).toBeGreaterThan(0);
    expect(GRIEVANCE_DECAY_Q).toBeLessThanOrEqual(q(0.05));
  });
});
