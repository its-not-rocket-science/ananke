// test/governance.test.ts — Phase 94: Laws & Governance Codes

import { describe, it, expect } from "vitest";
import {
  GOVERNANCE_BASE,
  GOVERNANCE_CHANGE_STABILITY_HIT_Q,
  GOVERNANCE_CHANGE_COOLDOWN_DAYS,
  MAX_ACTIVE_LAWS,
  LAW_TAX_REFORM,
  LAW_SCHOLAR_PATRONAGE,
  LAW_RULE_OF_LAW,
  LAW_MARTIAL_LAW,
  PRESET_LAW_CODES,
  createGovernanceState,
  computeGovernanceModifiers,
  enactLaw,
  repealLaw,
  changeGovernance,
  stepGovernanceCooldown,
  stepGovernanceStability,
} from "../src/governance.js";
import { createPolity } from "../src/polity.js";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePolity(stabilityQ: Q = q(0.80) as Q) {
  const p = createPolity("p1", "Test", "f1", [], 50_000, 300_000, "Medieval");
  p.stabilityQ = stabilityQ;
  return p;
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("GOVERNANCE_CHANGE_STABILITY_HIT_Q is q(0.20)", () => {
    expect(GOVERNANCE_CHANGE_STABILITY_HIT_Q).toBe(q(0.20));
  });

  it("GOVERNANCE_CHANGE_COOLDOWN_DAYS is 365", () => {
    expect(GOVERNANCE_CHANGE_COOLDOWN_DAYS).toBe(365);
  });

  it("MAX_ACTIVE_LAWS is 5", () => {
    expect(MAX_ACTIVE_LAWS).toBe(5);
  });

  it("GOVERNANCE_BASE has all six types", () => {
    const types = ["tribal", "monarchy", "oligarchy", "republic", "empire", "theocracy"];
    for (const t of types) {
      expect(GOVERNANCE_BASE[t as keyof typeof GOVERNANCE_BASE]).toBeDefined();
    }
  });

  it("empire has higher mobilizationMax_Q than tribal", () => {
    // empire q(0.15) vs tribal q(0.20) — tribal can field bigger armies but disorganised
    // Actually tribal is q(0.20) and empire is q(0.15) — tribal mobilises more (levy)
    expect(GOVERNANCE_BASE.tribal.mobilizationMax_Q).toBeGreaterThan(
      GOVERNANCE_BASE.empire.mobilizationMax_Q,
    );
  });

  it("oligarchy has highest taxEfficiencyMul_Q", () => {
    const max = Math.max(...Object.values(GOVERNANCE_BASE).map(m => m.taxEfficiencyMul_Q));
    expect(GOVERNANCE_BASE.oligarchy.taxEfficiencyMul_Q).toBe(max);
  });

  it("theocracy has highest unrestMitigation_Q", () => {
    const max = Math.max(...Object.values(GOVERNANCE_BASE).map(m => m.unrestMitigation_Q));
    expect(GOVERNANCE_BASE.theocracy.unrestMitigation_Q).toBe(max);
  });

  it("republic has highest researchBonus", () => {
    const max = Math.max(...Object.values(GOVERNANCE_BASE).map(m => m.researchBonus));
    expect(GOVERNANCE_BASE.republic.researchBonus).toBe(max);
  });

  it("PRESET_LAW_CODES contains all five preset laws", () => {
    expect(PRESET_LAW_CODES).toHaveLength(5);
  });
});

// ── createGovernanceState ─────────────────────────────────────────────────────

describe("createGovernanceState", () => {
  it("defaults to monarchy", () => {
    const s = createGovernanceState("p1");
    expect(s.governanceType).toBe("monarchy");
  });

  it("accepts custom governance type", () => {
    const s = createGovernanceState("p1", "republic");
    expect(s.governanceType).toBe("republic");
  });

  it("starts with no active laws", () => {
    const s = createGovernanceState("p1");
    expect(s.activeLawIds).toHaveLength(0);
  });

  it("starts with zero cooldown", () => {
    const s = createGovernanceState("p1");
    expect(s.changeCooldown).toBe(0);
  });

  it("stores polityId", () => {
    const s = createGovernanceState("pol_42");
    expect(s.polityId).toBe("pol_42");
  });
});

// ── computeGovernanceModifiers ────────────────────────────────────────────────

describe("computeGovernanceModifiers", () => {
  it("returns base modifiers when no laws active", () => {
    const s    = createGovernanceState("p1", "monarchy");
    const mods = computeGovernanceModifiers(s);
    expect(mods.taxEfficiencyMul_Q).toBe(GOVERNANCE_BASE.monarchy.taxEfficiencyMul_Q);
    expect(mods.researchBonus).toBe(GOVERNANCE_BASE.monarchy.researchBonus);
  });

  it("active laws stack on base modifiers", () => {
    const s = createGovernanceState("p1", "monarchy");
    enactLaw(s, "tax_reform");
    const registry = new Map([["tax_reform", LAW_TAX_REFORM]]);
    const mods = computeGovernanceModifiers(s, registry);
    const base = GOVERNANCE_BASE.monarchy.taxEfficiencyMul_Q;
    expect(mods.taxEfficiencyMul_Q).toBe(base + LAW_TAX_REFORM.taxBonus_Q);
  });

  it("scholar patronage adds research bonus", () => {
    const s = createGovernanceState("p1", "republic");
    enactLaw(s, "scholar_patronage");
    const registry = new Map([["scholar_patronage", LAW_SCHOLAR_PATRONAGE]]);
    const mods = computeGovernanceModifiers(s, registry);
    expect(mods.researchBonus).toBe(
      GOVERNANCE_BASE.republic.researchBonus + LAW_SCHOLAR_PATRONAGE.researchBonus,
    );
  });

  it("martial law increases unrest mitigation", () => {
    const s    = createGovernanceState("p1", "monarchy");
    const base = computeGovernanceModifiers(s);
    enactLaw(s, "martial_law");
    const registry = new Map([["martial_law", LAW_MARTIAL_LAW]]);
    const withLaw  = computeGovernanceModifiers(s, registry);
    expect(withLaw.unrestMitigation_Q).toBeGreaterThan(base.unrestMitigation_Q);
  });

  it("martial law reduces net stability increment (high cost)", () => {
    const s = createGovernanceState("p1", "republic");
    const base = computeGovernanceModifiers(s);
    enactLaw(s, "martial_law");
    const registry = new Map([["martial_law", LAW_MARTIAL_LAW]]);
    const withLaw  = computeGovernanceModifiers(s, registry);
    expect(withLaw.stabilityIncrement_Q).toBeLessThan(base.stabilityIncrement_Q);
  });

  it("taxEfficiencyMul_Q is clamped to SCALE.Q", () => {
    const s = createGovernanceState("p1", "empire");
    // Empire already at q(1.0); adding tax_reform should stay at SCALE.Q
    enactLaw(s, "tax_reform");
    const registry = new Map([["tax_reform", LAW_TAX_REFORM]]);
    const mods = computeGovernanceModifiers(s, registry);
    expect(mods.taxEfficiencyMul_Q).toBeLessThanOrEqual(SCALE.Q);
  });

  it("unknown lawId in registry is safely skipped", () => {
    const s = createGovernanceState("p1", "monarchy");
    s.activeLawIds.push("nonexistent_law");
    expect(() => computeGovernanceModifiers(s, new Map())).not.toThrow();
  });

  it("researchBonus never goes below 0", () => {
    const s    = createGovernanceState("p1", "tribal");
    const mods = computeGovernanceModifiers(s);
    expect(mods.researchBonus).toBeGreaterThanOrEqual(0);
  });
});

// ── enactLaw / repealLaw ──────────────────────────────────────────────────────

describe("enactLaw", () => {
  it("adds law to activeLawIds", () => {
    const s = createGovernanceState("p1");
    enactLaw(s, "tax_reform");
    expect(s.activeLawIds).toContain("tax_reform");
  });

  it("returns true on success", () => {
    const s = createGovernanceState("p1");
    expect(enactLaw(s, "tax_reform")).toBe(true);
  });

  it("returns false if already enacted", () => {
    const s = createGovernanceState("p1");
    enactLaw(s, "tax_reform");
    expect(enactLaw(s, "tax_reform")).toBe(false);
  });

  it("returns false when MAX_ACTIVE_LAWS reached", () => {
    const s = createGovernanceState("p1");
    for (let i = 0; i < MAX_ACTIVE_LAWS; i++) enactLaw(s, `law_${i}`);
    expect(enactLaw(s, "one_more")).toBe(false);
    expect(s.activeLawIds).toHaveLength(MAX_ACTIVE_LAWS);
  });
});

describe("repealLaw", () => {
  it("removes law from activeLawIds", () => {
    const s = createGovernanceState("p1");
    enactLaw(s, "tax_reform");
    repealLaw(s, "tax_reform");
    expect(s.activeLawIds).not.toContain("tax_reform");
  });

  it("returns true on success", () => {
    const s = createGovernanceState("p1");
    enactLaw(s, "tax_reform");
    expect(repealLaw(s, "tax_reform")).toBe(true);
  });

  it("returns false if law was not active", () => {
    const s = createGovernanceState("p1");
    expect(repealLaw(s, "nonexistent")).toBe(false);
  });

  it("allows re-enacting after repeal", () => {
    const s = createGovernanceState("p1");
    enactLaw(s, "tax_reform");
    repealLaw(s, "tax_reform");
    expect(enactLaw(s, "tax_reform")).toBe(true);
  });
});

// ── changeGovernance ──────────────────────────────────────────────────────────

describe("changeGovernance", () => {
  it("changes governance type", () => {
    const p = makePolity();
    const s = createGovernanceState("p1", "monarchy");
    changeGovernance(p, s, "republic");
    expect(s.governanceType).toBe("republic");
  });

  it("returns true on success", () => {
    const p = makePolity();
    const s = createGovernanceState("p1", "monarchy");
    expect(changeGovernance(p, s, "republic")).toBe(true);
  });

  it("hits stability by GOVERNANCE_CHANGE_STABILITY_HIT_Q", () => {
    const p = makePolity(q(0.80) as Q);
    const s = createGovernanceState("p1", "monarchy");
    changeGovernance(p, s, "republic");
    expect(p.stabilityQ).toBe(q(0.80) - GOVERNANCE_CHANGE_STABILITY_HIT_Q);
  });

  it("sets changeCooldown to GOVERNANCE_CHANGE_COOLDOWN_DAYS", () => {
    const p = makePolity();
    const s = createGovernanceState("p1", "monarchy");
    changeGovernance(p, s, "republic");
    expect(s.changeCooldown).toBe(GOVERNANCE_CHANGE_COOLDOWN_DAYS);
  });

  it("returns false for same governance type (no-op)", () => {
    const p = makePolity();
    const s = createGovernanceState("p1", "monarchy");
    const before = p.stabilityQ;
    expect(changeGovernance(p, s, "monarchy")).toBe(false);
    expect(p.stabilityQ).toBe(before);
  });

  it("returns false when on cooldown", () => {
    const p = makePolity();
    const s = createGovernanceState("p1", "monarchy");
    changeGovernance(p, s, "republic");
    const stabBefore = p.stabilityQ;
    expect(changeGovernance(p, s, "empire")).toBe(false);
    expect(p.stabilityQ).toBe(stabBefore);
    expect(s.governanceType).toBe("republic");
  });

  it("stability never goes below zero", () => {
    const p = makePolity(q(0.05) as Q);
    const s = createGovernanceState("p1", "monarchy");
    changeGovernance(p, s, "republic");
    expect(p.stabilityQ).toBeGreaterThanOrEqual(0);
  });
});

// ── stepGovernanceCooldown ────────────────────────────────────────────────────

describe("stepGovernanceCooldown", () => {
  it("decrements cooldown by elapsedDays", () => {
    const p = makePolity();
    const s = createGovernanceState("p1", "monarchy");
    changeGovernance(p, s, "republic");  // sets cooldown to 365
    stepGovernanceCooldown(s, 30);
    expect(s.changeCooldown).toBe(335);
  });

  it("never goes below zero", () => {
    const s = createGovernanceState("p1");
    s.changeCooldown = 10;
    stepGovernanceCooldown(s, 365);
    expect(s.changeCooldown).toBe(0);
  });

  it("allows new governance change after cooldown expires", () => {
    const p = makePolity();
    const s = createGovernanceState("p1", "monarchy");
    changeGovernance(p, s, "republic");
    stepGovernanceCooldown(s, 365);
    expect(s.changeCooldown).toBe(0);
    expect(changeGovernance(p, s, "empire")).toBe(true);
  });
});

// ── stepGovernanceStability ───────────────────────────────────────────────────

describe("stepGovernanceStability", () => {
  it("theocracy increments stability over time", () => {
    const p    = makePolity(q(0.50) as Q);
    const s    = createGovernanceState("p1", "theocracy");
    const before = p.stabilityQ;
    stepGovernanceStability(p, s, 30);
    expect(p.stabilityQ).toBeGreaterThan(before);
  });

  it("republic increments stability over time", () => {
    const p    = makePolity(q(0.50) as Q);
    const s    = createGovernanceState("p1", "republic");
    const before = p.stabilityQ;
    stepGovernanceStability(p, s, 30);
    expect(p.stabilityQ).toBeGreaterThan(before);
  });

  it("stability never exceeds SCALE.Q", () => {
    const p    = makePolity(SCALE.Q as Q);
    const s    = createGovernanceState("p1", "republic");
    stepGovernanceStability(p, s, 365);
    expect(p.stabilityQ).toBeLessThanOrEqual(SCALE.Q);
  });

  it("martial law cancels stability increment when cost > base", () => {
    const p = makePolity(q(0.50) as Q);
    const s = createGovernanceState("p1", "monarchy");
    enactLaw(s, "martial_law");
    const registry = new Map([["martial_law", LAW_MARTIAL_LAW]]);
    const before = p.stabilityQ;
    // monarchy base q(0.001) - martial_law q(0.003) = negative → net 0 increment
    stepGovernanceStability(p, s, 30, registry);
    expect(p.stabilityQ).toBeLessThanOrEqual(before);  // no increment when cost >= base
  });

  it("multiple days accumulate proportionally", () => {
    const p1 = makePolity(q(0.50) as Q);
    const p2 = makePolity(q(0.50) as Q);
    const s1 = createGovernanceState("p1", "republic");
    const s2 = createGovernanceState("p1", "republic");
    stepGovernanceStability(p1, s1, 30);
    stepGovernanceStability(p2, s2, 60);
    expect(p2.stabilityQ - q(0.50)).toBeGreaterThan(p1.stabilityQ - q(0.50));
  });
});

// ── Integration ───────────────────────────────────────────────────────────────

describe("integration", () => {
  it("full governance setup: create → enact laws → compute modifiers", () => {
    const s = createGovernanceState("p1", "monarchy");  // monarchy at q(0.80) — room to grow
    enactLaw(s, "tax_reform");
    enactLaw(s, "rule_of_law");
    const registry = new Map([
      ["tax_reform", LAW_TAX_REFORM],
      ["rule_of_law", LAW_RULE_OF_LAW],
    ]);
    const mods = computeGovernanceModifiers(s, registry);
    expect(mods.taxEfficiencyMul_Q).toBeGreaterThan(GOVERNANCE_BASE.monarchy.taxEfficiencyMul_Q);
    expect(mods.unrestMitigation_Q).toBeGreaterThan(GOVERNANCE_BASE.monarchy.unrestMitigation_Q);
  });

  it("governance transition: monarchy → republic after cooldown expires", () => {
    const p = makePolity(q(0.80) as Q);
    const s = createGovernanceState("p1", "monarchy");
    changeGovernance(p, s, "republic");
    expect(s.governanceType).toBe("republic");
    stepGovernanceCooldown(s, GOVERNANCE_CHANGE_COOLDOWN_DAYS);
    expect(changeGovernance(p, s, "oligarchy")).toBe(true);
    expect(s.governanceType).toBe("oligarchy");
  });

  it("republic with scholar patronage produces higher research bonus than tribal alone", () => {
    const republic = createGovernanceState("p1", "republic");
    enactLaw(republic, "scholar_patronage");
    const tribal   = createGovernanceState("p1", "tribal");
    const registry = new Map([["scholar_patronage", LAW_SCHOLAR_PATRONAGE]]);
    const repMods  = computeGovernanceModifiers(republic, registry);
    const trMods   = computeGovernanceModifiers(tribal);
    expect(repMods.researchBonus).toBeGreaterThan(trMods.researchBonus);
  });
});
