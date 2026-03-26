// test/diplomacy.test.ts — Phase 80: Diplomacy & Treaties

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  TREATY_FRAGILE_THRESHOLD,
  TREATY_BASE_STRENGTH,
  TREATY_DECAY_PER_DAY,
  TREATY_BREAK_INFAMY,
  createTreatyRegistry,
  treatyKey,
  signTreaty,
  getTreaty,
  getActiveTreaties,
  isTreatyExpired,
  stepTreatyStrength,
  reinforceTreaty,
  isTreatyFragile,
  breakTreaty,
  computeDiplomaticPrestige,
  areInAnyTreaty,
} from "../src/diplomacy.js";
import { createRenownRegistry, getRenownRecord } from "../src/renown.js";

// ── createTreatyRegistry ───────────────────────────────────────────────────────

describe("createTreatyRegistry", () => {
  it("creates an empty registry", () => {
    expect(createTreatyRegistry().treaties.size).toBe(0);
  });
});

// ── treatyKey ─────────────────────────────────────────────────────────────────

describe("treatyKey", () => {
  it("is symmetric — order of polity IDs does not matter", () => {
    expect(treatyKey("A", "B", "peace")).toBe(treatyKey("B", "A", "peace"));
  });

  it("differs by treaty type", () => {
    expect(treatyKey("A", "B", "peace")).not.toBe(treatyKey("A", "B", "trade_pact"));
  });

  it("works for identical-length IDs", () => {
    const k1 = treatyKey("polity1", "polity2", "non_aggression");
    const k2 = treatyKey("polity2", "polity1", "non_aggression");
    expect(k1).toBe(k2);
  });
});

// ── signTreaty ────────────────────────────────────────────────────────────────

describe("signTreaty", () => {
  it("creates a treaty with base strength", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "peace");
    expect(t.strength_Q).toBe(TREATY_BASE_STRENGTH["peace"]);
    expect(t.polityAId).toBe("A");
    expect(t.polityBId).toBe("B");
    expect(t.type).toBe("peace");
    expect(t.signedTick).toBe(0);
    expect(t.expiryTick).toBe(-1);
  });

  it("stores treaty in registry", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "trade_pact");
    expect(r.treaties.size).toBe(1);
  });

  it("sets finite expiry when durationTicks provided", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "non_aggression", 100, 365);
    expect(t.expiryTick).toBe(465);
  });

  it("stores tribute clauses", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "peace", 0, -1, q(0.05) as any, q(0.02) as any);
    expect(t.tributeFromA_Q).toBe(q(0.05));
    expect(t.tributeFromB_Q).toBe(q(0.02));
  });

  it("replaces existing treaty on re-sign (renewal)", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "peace", 0);
    signTreaty(r, "A", "B", "peace", 10);
    expect(r.treaties.size).toBe(1);
    expect(getTreaty(r, "A", "B", "peace")?.signedTick).toBe(10);
  });

  it("military_alliance has higher base strength than trade_pact", () => {
    expect(TREATY_BASE_STRENGTH["military_alliance"]).toBeGreaterThan(
      TREATY_BASE_STRENGTH["trade_pact"],
    );
  });
});

// ── getTreaty ─────────────────────────────────────────────────────────────────

describe("getTreaty", () => {
  it("returns the treaty for a known pair", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "peace");
    expect(getTreaty(r, "A", "B", "peace")).toBeDefined();
  });

  it("is symmetric — order of polity IDs does not matter", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "peace");
    expect(getTreaty(r, "B", "A", "peace")).toBeDefined();
  });

  it("returns undefined for unknown pair", () => {
    const r = createTreatyRegistry();
    expect(getTreaty(r, "A", "B", "peace")).toBeUndefined();
  });

  it("returns undefined for different treaty type", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "peace");
    expect(getTreaty(r, "A", "B", "trade_pact")).toBeUndefined();
  });
});

// ── getActiveTreaties ─────────────────────────────────────────────────────────

describe("getActiveTreaties", () => {
  it("returns all treaties involving the polity", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "peace");
    signTreaty(r, "A", "C", "trade_pact");
    signTreaty(r, "B", "C", "non_aggression");
    expect(getActiveTreaties(r, "A")).toHaveLength(2);
    expect(getActiveTreaties(r, "B")).toHaveLength(2);
    expect(getActiveTreaties(r, "C")).toHaveLength(2);
  });

  it("returns empty array for polity with no treaties", () => {
    const r = createTreatyRegistry();
    expect(getActiveTreaties(r, "X")).toHaveLength(0);
  });

  it("works when polity is in polityBId position", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "peace");
    const treaties = getActiveTreaties(r, "B");
    expect(treaties).toHaveLength(1);
  });
});

// ── isTreatyExpired ────────────────────────────────────────────────────────────

describe("isTreatyExpired", () => {
  it("permanent treaty never expires", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "peace", 0, -1);
    expect(isTreatyExpired(t, 999_999)).toBe(false);
  });

  it("finite treaty is not expired before expiryTick", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "peace", 0, 365);
    expect(isTreatyExpired(t, 364)).toBe(false);
  });

  it("finite treaty is expired at expiryTick", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "peace", 0, 365);
    expect(isTreatyExpired(t, 365)).toBe(true);
  });

  it("finite treaty is expired after expiryTick", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "peace", 0, 365);
    expect(isTreatyExpired(t, 400)).toBe(true);
  });
});

// ── stepTreatyStrength ─────────────────────────────────────────────────────────

describe("stepTreatyStrength", () => {
  it("decays strength each day", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "non_aggression");
    const before = t.strength_Q;
    stepTreatyStrength(t);
    expect(t.strength_Q).toBe(before - TREATY_DECAY_PER_DAY["non_aggression"]);
  });

  it("boost slows decay", () => {
    const r = createTreatyRegistry();
    const t1 = signTreaty(r, "A", "B", "trade_pact");
    const t2 = signTreaty(r, "A", "C", "trade_pact");
    stepTreatyStrength(t1, 0 as any);
    stepTreatyStrength(t2, q(0.01) as any);
    expect(t2.strength_Q).toBeGreaterThan(t1.strength_Q);
  });

  it("strength cannot go below 0", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "peace");
    t.strength_Q = 0 as any;
    stepTreatyStrength(t);
    expect(t.strength_Q).toBe(0);
  });

  it("strength cannot exceed SCALE.Q", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "military_alliance");
    t.strength_Q = q(0.99) as any;
    stepTreatyStrength(t, q(0.10) as any);
    expect(t.strength_Q).toBeLessThanOrEqual(SCALE.Q);
  });

  it("military_alliance decays slowest", () => {
    const decays = Object.values(TREATY_DECAY_PER_DAY);
    expect(TREATY_DECAY_PER_DAY["military_alliance"]).toBe(Math.min(...decays));
  });
});

// ── reinforceTreaty ────────────────────────────────────────────────────────────

describe("reinforceTreaty", () => {
  it("increases treaty strength", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "trade_pact");
    const before = t.strength_Q;
    reinforceTreaty(t, q(0.10) as any);
    expect(t.strength_Q).toBe(before + q(0.10));
  });

  it("clamps to SCALE.Q", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "military_alliance");
    t.strength_Q = q(0.95) as any;
    reinforceTreaty(t, q(0.20) as any);
    expect(t.strength_Q).toBe(SCALE.Q);
  });

  it("clamps to 0 for negative delta", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "peace");
    t.strength_Q = q(0.05) as any;
    reinforceTreaty(t, -q(0.20) as any);
    expect(t.strength_Q).toBe(0);
  });
});

// ── isTreatyFragile ────────────────────────────────────────────────────────────

describe("isTreatyFragile", () => {
  it("returns false above fragile threshold", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "peace");
    expect(isTreatyFragile(t)).toBe(false);
  });

  it("returns false at exactly the threshold", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "peace");
    t.strength_Q = TREATY_FRAGILE_THRESHOLD;
    expect(isTreatyFragile(t)).toBe(false);
  });

  it("returns true below the threshold", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "trade_pact");
    t.strength_Q = (TREATY_FRAGILE_THRESHOLD - 1) as any;
    expect(isTreatyFragile(t)).toBe(true);
  });

  it("returns true at zero strength", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "non_aggression");
    t.strength_Q = 0 as any;
    expect(isTreatyFragile(t)).toBe(true);
  });
});

// ── breakTreaty ───────────────────────────────────────────────────────────────

describe("breakTreaty", () => {
  it("removes the treaty from the registry", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "peace");
    expect(breakTreaty(r, "A", "B", "peace")).toBe(true);
    expect(r.treaties.size).toBe(0);
  });

  it("returns false if treaty does not exist", () => {
    const r = createTreatyRegistry();
    expect(breakTreaty(r, "A", "B", "peace")).toBe(false);
  });

  it("adds infamy to breaker ruler", () => {
    const r = createTreatyRegistry();
    const renownR = createRenownRegistry();
    signTreaty(r, "A", "B", "military_alliance");
    breakTreaty(r, "A", "B", "military_alliance", 42, renownR);
    const record = getRenownRecord(renownR, 42);
    expect(record.infamy_Q).toBe(TREATY_BREAK_INFAMY["military_alliance"]);
  });

  it("military_alliance break carries higher infamy than trade_pact", () => {
    expect(TREATY_BREAK_INFAMY["military_alliance"]).toBeGreaterThan(
      TREATY_BREAK_INFAMY["trade_pact"],
    );
  });

  it("does not add infamy if breakerRulerId omitted", () => {
    const r = createTreatyRegistry();
    const renownR = createRenownRegistry();
    signTreaty(r, "A", "B", "peace");
    breakTreaty(r, "A", "B", "peace", undefined, renownR);
    expect(renownR.records.size).toBe(0);
  });

  it("does not throw if renownRegistry omitted", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "non_aggression");
    expect(() => breakTreaty(r, "A", "B", "non_aggression", 7)).not.toThrow();
  });

  it("treaty is removed even without renown registry", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "trade_pact");
    breakTreaty(r, "A", "B", "trade_pact", 7);
    expect(getTreaty(r, "A", "B", "trade_pact")).toBeUndefined();
  });

  it("is symmetric — works regardless of argument order", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "peace");
    expect(breakTreaty(r, "B", "A", "peace")).toBe(true);
    expect(r.treaties.size).toBe(0);
  });
});

// ── computeDiplomaticPrestige ─────────────────────────────────────────────────

describe("computeDiplomaticPrestige", () => {
  it("returns 0 for polity with no treaties", () => {
    const r = createTreatyRegistry();
    expect(computeDiplomaticPrestige(r, "A")).toBe(0);
  });

  it("returns sum of treaty strengths clamped to SCALE.Q", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "peace");
    signTreaty(r, "A", "C", "trade_pact");
    const prestige = computeDiplomaticPrestige(r, "A");
    const expected = TREATY_BASE_STRENGTH["peace"] + TREATY_BASE_STRENGTH["trade_pact"];
    // clamped
    expect(prestige).toBe(Math.min(expected, SCALE.Q));
  });

  it("clamps to SCALE.Q for many treaties", () => {
    const r = createTreatyRegistry();
    for (let i = 0; i < 10; i++) {
      signTreaty(r, "A", `P${i}`, "military_alliance");
    }
    expect(computeDiplomaticPrestige(r, "A")).toBeLessThanOrEqual(SCALE.Q);
  });

  it("polity with more treaties has higher prestige", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "trade_pact");
    signTreaty(r, "A", "C", "trade_pact");
    signTreaty(r, "B", "C", "trade_pact");
    expect(computeDiplomaticPrestige(r, "A")).toBeGreaterThan(
      computeDiplomaticPrestige(r, "B") - 1, // A has 2, B has 2 too
    );
  });
});

// ── areInAnyTreaty ─────────────────────────────────────────────────────────────

describe("areInAnyTreaty", () => {
  it("returns true when polities share any treaty", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "trade_pact");
    expect(areInAnyTreaty(r, "A", "B")).toBe(true);
  });

  it("is symmetric", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "peace");
    expect(areInAnyTreaty(r, "B", "A")).toBe(true);
  });

  it("returns false when no treaty exists", () => {
    const r = createTreatyRegistry();
    expect(areInAnyTreaty(r, "A", "B")).toBe(false);
  });

  it("returns false after the treaty is broken", () => {
    const r = createTreatyRegistry();
    signTreaty(r, "A", "B", "non_aggression");
    breakTreaty(r, "A", "B", "non_aggression");
    expect(areInAnyTreaty(r, "A", "B")).toBe(false);
  });
});

// ── constants sanity ───────────────────────────────────────────────────────────

describe("constants", () => {
  it("TREATY_FRAGILE_THRESHOLD is q(0.20)", () => {
    expect(TREATY_FRAGILE_THRESHOLD).toBe(q(0.20));
  });

  it("all treaty types have base strength > fragile threshold", () => {
    for (const type of ["non_aggression", "trade_pact", "peace", "military_alliance", "royal_marriage"] as const) {
      expect(TREATY_BASE_STRENGTH[type]).toBeGreaterThan(TREATY_FRAGILE_THRESHOLD);
    }
  });

  it("military_alliance break infamy > peace > non_aggression > trade_pact", () => {
    expect(TREATY_BREAK_INFAMY["military_alliance"]).toBeGreaterThan(TREATY_BREAK_INFAMY["peace"]);
    expect(TREATY_BREAK_INFAMY["peace"]).toBeGreaterThan(TREATY_BREAK_INFAMY["non_aggression"]);
    expect(TREATY_BREAK_INFAMY["non_aggression"]).toBeGreaterThan(TREATY_BREAK_INFAMY["trade_pact"]);
  });
});

// ── integration: decay to fragile ────────────────────────────────────────────

describe("treaty decay to fragile", () => {
  it("non_aggression decays to fragile after sufficient days", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "non_aggression");
    // q(0.55) base, q(0.20) threshold, q(0.003)/day → (0.55-0.20)/0.003 ≈ 116.7 days → 117 to go below
    for (let i = 0; i < 117; i++) stepTreatyStrength(t);
    expect(isTreatyFragile(t)).toBe(true);
  });

  it("military_alliance stays healthy much longer than non_aggression", () => {
    const r = createTreatyRegistry();
    const ta = signTreaty(r, "A", "B", "military_alliance");
    const tn = signTreaty(r, "A", "C", "non_aggression");
    for (let i = 0; i < 117; i++) {
      stepTreatyStrength(ta);
      stepTreatyStrength(tn);
    }
    expect(isTreatyFragile(tn)).toBe(true);
    expect(isTreatyFragile(ta)).toBe(false);
  });

  it("reinforcement prevents decay to fragile", () => {
    const r = createTreatyRegistry();
    const t = signTreaty(r, "A", "B", "non_aggression");
    for (let day = 0; day < 117; day++) {
      stepTreatyStrength(t);
      if (day % 10 === 0) reinforceTreaty(t, q(0.04) as any);
    }
    expect(isTreatyFragile(t)).toBe(false);
  });
});
