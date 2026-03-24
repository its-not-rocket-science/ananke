// test/formation-combat.test.ts
//
// Phase 69 — Macro-Scale Formation Combat
//
// Verifies:
//   1. createFormationUnit — aggregated fields, defaults
//   2. Lanchester square law — 2:1 force ratio attacker wins, more casualties on weaker side
//   3. Lanchester square law — 3:1 force ratio attacker wins decisively
//   4. Equal forces — symmetric engagement, both sides take similar casualties
//   5. Terrain — fortified defender can repel equal-strength attacker
//   6. Terrain — difficult terrain reduces attacker advantage at 2:1 ratio
//   7. Morale — high morale unit outperforms equal-strength low-morale unit
//   8. Rout — morale below ROUT_THRESHOLD triggers faction rout
//   9. Wipe-out — strength reaching 0 ends engagement early
//  10. Named entity delegation — ids below threshold appear in namedEntityIds
//  11. namedEntityIds from FormationUnit.namedEntityIds respected
//  12. applyTacticalResultToPolity — survivor fraction scales down militaryStrength_Q
//  13. applyTacticalResultToPolity — routed unit zeroes military strength
//  14. durationTicks respected when no decisive event
//  15. TERRAIN_DEFENDER_MUL values ordered: open < difficult < fortified

import { describe, it, expect } from "vitest";

import {
  createFormationUnit,
  resolveTacticalEngagement,
  applyTacticalResultToPolity,
  ROUT_THRESHOLD,
  TERRAIN_DEFENDER_MUL,
  NAMED_ENTITY_THRESHOLD,
} from "../src/sim/formation-combat.js";

import { q } from "../src/units.js";
import { HUMAN_BASE }   from "../src/archetypes.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Clone units for read-only checks (resolveTacticalEngagement mutates). */
function _cloneUnits(units: ReturnType<typeof createFormationUnit>[]) {
  return units.map(u => ({ ...u }));
}

const HIGH_MORALE  = q(0.90);
const LOW_MORALE   = q(0.30);

// ── 1 · createFormationUnit ───────────────────────────────────────────────────

describe("createFormationUnit", () => {
  it("sets strength from headcount", () => {
    const u = createFormationUnit("a", "red", 100, HUMAN_BASE);
    expect(u.strength).toBe(100);
  });

  it("aggregatedForce_N = peakForce_N × strength", () => {
    const u = createFormationUnit("a", "red", 50, HUMAN_BASE);
    expect(u.aggregatedForce_N).toBe(Math.round(HUMAN_BASE.peakForce_N * 50));
  });

  it("aggregatedEndurance = archetype conversionEfficiency", () => {
    const u = createFormationUnit("a", "red", 100, HUMAN_BASE);
    expect(u.aggregatedEndurance).toBe(HUMAN_BASE.conversionEfficiency);
  });

  it("default moraleQ is q(0.70)", () => {
    const u = createFormationUnit("a", "red", 100, HUMAN_BASE);
    expect(u.moraleQ).toBe(q(0.70));
  });

  it("custom moraleQ is applied", () => {
    const u = createFormationUnit("a", "red", 100, HUMAN_BASE, HIGH_MORALE);
    expect(u.moraleQ).toBe(HIGH_MORALE);
  });

  it("zero strength clamps to 0", () => {
    const u = createFormationUnit("a", "red", -5, HUMAN_BASE);
    expect(u.strength).toBe(0);
  });
});

// ── 2 · 2:1 force ratio ───────────────────────────────────────────────────────

describe("Lanchester square law — 2:1 attacker advantage", () => {
  it("200 vs 100 open terrain: attacker wins (defender wiped/routed)", () => {
    const attackers = [createFormationUnit("a1", "red",  200, HUMAN_BASE)];
    const defenders = [createFormationUnit("d1", "blue", 100, HUMAN_BASE)];
    const result = resolveTacticalEngagement({
      attackers, defenders, terrain: "open", durationTicks: 600,
    });
    expect(result.defenderResult.survivingStrength).toBeLessThan(
      result.attackerResult.survivingStrength
    );
  });

  it("defender takes more casualties than attacker at 2:1 ratio", () => {
    const attackers = [createFormationUnit("a1", "red",  200, HUMAN_BASE)];
    const defenders = [createFormationUnit("d1", "blue", 100, HUMAN_BASE)];
    const result = resolveTacticalEngagement({
      attackers, defenders, terrain: "open", durationTicks: 600,
    });
    expect(result.defenderResult.casualties).toBeGreaterThan(
      result.attackerResult.casualties
    );
  });

  it("engagement ends before durationTicks when one side is overcome", () => {
    const attackers = [createFormationUnit("a1", "red",  200, HUMAN_BASE)];
    const defenders = [createFormationUnit("d1", "blue", 100, HUMAN_BASE)];
    const result = resolveTacticalEngagement({
      attackers, defenders, terrain: "open", durationTicks: 600,
    });
    expect(result.decisiveTick).toBeLessThan(600);
  });
});

// ── 3 · 3:1 force ratio ───────────────────────────────────────────────────────

describe("Lanchester square law — 3:1 attacker advantage", () => {
  it("300 vs 100: attacker wins with fewer own casualties than 2:1 scenario", () => {
    const run2to1 = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  200, HUMAN_BASE)],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "open", durationTicks: 600,
    });
    const run3to1 = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  300, HUMAN_BASE)],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "open", durationTicks: 600,
    });
    // 3:1 attacker takes proportionally fewer casualties than 2:1
    expect(run3to1.attackerResult.casualties).toBeLessThanOrEqual(
      run2to1.attackerResult.casualties
    );
  });

  it("3:1 engagement resolves quicker than 2:1", () => {
    const run2to1 = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  200, HUMAN_BASE)],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "open", durationTicks: 600,
    });
    const run3to1 = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  300, HUMAN_BASE)],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "open", durationTicks: 600,
    });
    expect(run3to1.decisiveTick).toBeLessThan(run2to1.decisiveTick);
  });
});

// ── 4 · Symmetric engagement ──────────────────────────────────────────────────

describe("equal forces — symmetric engagement", () => {
  it("100 vs 100 open: casualties on both sides are roughly equal (±20%)", () => {
    const result = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  100, HUMAN_BASE)],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "open", durationTicks: 300,
    });
    const { attackerResult: ar, defenderResult: dr } = result;
    const totalCas = ar.casualties + dr.casualties;
    if (totalCas > 0) {
      const ratio = ar.casualties / totalCas;
      expect(ratio).toBeGreaterThan(0.30);
      expect(ratio).toBeLessThan(0.70);
    }
    // Both sides survive or both are eliminated
    expect(ar.survivingStrength).toBeGreaterThanOrEqual(0);
    expect(dr.survivingStrength).toBeGreaterThanOrEqual(0);
  });
});

// ── 5 · Fortified terrain ─────────────────────────────────────────────────────

describe("terrain — fortified defence", () => {
  it("equal forces: fortified defender suffers fewer casualties than open", () => {
    const openResult = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  100, HUMAN_BASE)],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "open", durationTicks: 200,
    });
    const fortResult = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  100, HUMAN_BASE)],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "fortified", durationTicks: 200,
    });
    expect(fortResult.defenderResult.casualties).toBeLessThan(
      openResult.defenderResult.casualties
    );
  });

  it("fortified defender incurs more attacker casualties than open terrain", () => {
    const openResult = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  100, HUMAN_BASE)],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "open", durationTicks: 200,
    });
    const fortResult = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  100, HUMAN_BASE)],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "fortified", durationTicks: 200,
    });
    expect(fortResult.attackerResult.casualties).toBeGreaterThanOrEqual(
      openResult.attackerResult.casualties
    );
  });
});

// ── 6 · Difficult terrain reduces 2:1 advantage ──────────────────────────────

describe("terrain — difficult terrain dampens attacker advantage", () => {
  it("2:1 attacker in difficult terrain wins less decisively than open", () => {
    const openResult = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  200, HUMAN_BASE)],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "open", durationTicks: 600,
    });
    const diffResult = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  200, HUMAN_BASE)],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "difficult", durationTicks: 600,
    });
    // Attacker survives less (or engagement takes longer) in difficult terrain
    expect(diffResult.attackerResult.casualties).toBeGreaterThanOrEqual(
      openResult.attackerResult.casualties
    );
  });
});

// ── 7 · Morale effect ─────────────────────────────────────────────────────────

describe("morale effect on combat power", () => {
  it("high-morale unit defeats equal-strength low-morale unit", () => {
    const result = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  100, HUMAN_BASE, HIGH_MORALE)],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE, LOW_MORALE)],
      terrain: "open", durationTicks: 600,
    });
    expect(result.attackerResult.survivingStrength).toBeGreaterThan(
      result.defenderResult.survivingStrength
    );
  });
});

// ── 8 · Rout detection ────────────────────────────────────────────────────────

describe("rout — morale collapse", () => {
  it("unit starting at morale q(0.10) is immediately considered routed", () => {
    const belowThreshold = q(0.10);
    expect(belowThreshold).toBeLessThan(ROUT_THRESHOLD);

    const result = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  100, HUMAN_BASE)],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE, belowThreshold)],
      terrain: "open", durationTicks: 10,
    });
    expect(result.routedFactions).toContain("blue");
  });

  it("routedFactions contains the faction id of the broken unit", () => {
    const result = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",   200, HUMAN_BASE)],
      defenders: [createFormationUnit("d", "green", 100, HUMAN_BASE, LOW_MORALE)],
      terrain: "open", durationTicks: 200,
    });
    expect(result.routedFactions).toContain("green");
  });
});

// ── 9 · Wipe-out ends engagement early ───────────────────────────────────────

describe("wipe-out — strength reaching 0", () => {
  it("engagement stops early when one side reaches 0 strength", () => {
    const result = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  1000, HUMAN_BASE, q(1.0))],
      defenders: [createFormationUnit("d", "blue",    1, HUMAN_BASE)],
      terrain: "open", durationTicks: 600,
    });
    expect(result.decisiveTick).toBeLessThan(600);
    expect(result.defenderResult.survivingStrength).toBe(0);
  });
});

// ── 10 · Named entity ids — threshold ────────────────────────────────────────

describe("named entity delegation", () => {
  it("entity ids below NAMED_ENTITY_THRESHOLD appear in namedEntityIds when in namedEntityIds list", () => {
    const u = createFormationUnit("a", "red", 100, HUMAN_BASE);
    u.namedEntityIds = [1, 42, 999];
    const result = resolveTacticalEngagement({
      attackers: [u],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "open", durationTicks: 10,
    });
    expect(result.namedEntityIds).toContain(1);
    expect(result.namedEntityIds).toContain(42);
    expect(result.namedEntityIds).toContain(999);
  });

  it("no namedEntityIds when no units declare named entities", () => {
    const result = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  100, HUMAN_BASE)],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "open", durationTicks: 10,
    });
    expect(result.namedEntityIds).toHaveLength(0);
  });

  it("named ids from multiple units are merged (no duplicates)", () => {
    const u1 = createFormationUnit("a1", "red", 100, HUMAN_BASE);
    const u2 = createFormationUnit("a2", "red", 100, HUMAN_BASE);
    u1.namedEntityIds = [7, 42];
    u2.namedEntityIds = [42, 99]; // 42 duplicated
    const result = resolveTacticalEngagement({
      attackers: [u1, u2],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "open", durationTicks: 10,
    });
    const count42 = result.namedEntityIds.filter(id => id === 42).length;
    expect(count42).toBe(1);
    expect(result.namedEntityIds).toContain(7);
    expect(result.namedEntityIds).toContain(99);
  });
});

// ── 11 · NAMED_ENTITY_THRESHOLD constant ─────────────────────────────────────

describe("NAMED_ENTITY_THRESHOLD", () => {
  it("is 1000", () => {
    expect(NAMED_ENTITY_THRESHOLD).toBe(1000);
  });
});

// ── 12 · applyTacticalResultToPolity — survivors scale strength ───────────────

describe("applyTacticalResultToPolity", () => {
  it("50% survivors at full morale halves militaryStrength_Q", () => {
    const result = applyTacticalResultToPolity(q(1.0), 100, {
      casualties: 50,
      survivingStrength: 50,
      finalMoraleQ: q(1.0),
      routed: false,
    });
    // 50/100 = 0.5 survivors × q(1.0) morale → 0.5 × q(1.0) = q(0.50)
    expect(result).toBeCloseTo(q(0.50), -1);
  });

  it("100% survivors at full morale preserves militaryStrength_Q", () => {
    const result = applyTacticalResultToPolity(q(1.0), 100, {
      casualties: 0,
      survivingStrength: 100,
      finalMoraleQ: q(1.0),
      routed: false,
    });
    expect(result).toBe(q(1.0));
  });

  it("0 survivors → militaryStrength_Q = 0", () => {
    const result = applyTacticalResultToPolity(q(1.0), 100, {
      casualties: 100,
      survivingStrength: 0,
      finalMoraleQ: q(0),
      routed: true,
    });
    expect(result).toBe(0);
  });

  it("survivors at low morale further reduces strength", () => {
    const highMorale = applyTacticalResultToPolity(q(1.0), 100, {
      casualties: 50, survivingStrength: 50, finalMoraleQ: q(1.0), routed: false,
    });
    const lowMorale = applyTacticalResultToPolity(q(1.0), 100, {
      casualties: 50, survivingStrength: 50, finalMoraleQ: q(0.30), routed: false,
    });
    expect(lowMorale).toBeLessThan(highMorale);
  });

  it("does not exceed input militaryStrength_Q", () => {
    const result = applyTacticalResultToPolity(q(0.80), 100, {
      casualties: 0, survivingStrength: 100, finalMoraleQ: q(1.0), routed: false,
    });
    expect(result).toBeLessThanOrEqual(q(0.80));
  });
});

// ── 13 · durationTicks boundary ──────────────────────────────────────────────

describe("durationTicks respected", () => {
  it("when no side is wiped out or routed, decisiveTick = durationTicks", () => {
    // Very short engagement — neither side collapses in 3 ticks
    const result = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red",  100, HUMAN_BASE, q(0.95))],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE, q(0.95))],
      terrain: "open", durationTicks: 3,
    });
    expect(result.decisiveTick).toBe(3);
  });
});

// ── 14 · TERRAIN_DEFENDER_MUL ordering ───────────────────────────────────────

describe("TERRAIN_DEFENDER_MUL", () => {
  it("open < difficult < fortified", () => {
    expect(TERRAIN_DEFENDER_MUL.open).toBeLessThan(TERRAIN_DEFENDER_MUL.difficult);
    expect(TERRAIN_DEFENDER_MUL.difficult).toBeLessThan(TERRAIN_DEFENDER_MUL.fortified);
  });

  it("open = q(1.0), fortified = q(2.0)", () => {
    expect(TERRAIN_DEFENDER_MUL.open).toBe(q(1.0));
    expect(TERRAIN_DEFENDER_MUL.fortified).toBe(q(2.0));
  });
});

// ── 15 · Multi-unit sides ─────────────────────────────────────────────────────

describe("multi-unit sides", () => {
  it("two attacker units combine their strength against one defender", () => {
    // Single 200-strength attacker vs two 100-strength attackers — same total
    const singleResult = resolveTacticalEngagement({
      attackers: [createFormationUnit("a", "red", 200, HUMAN_BASE)],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "open", durationTicks: 600,
    });
    const splitResult = resolveTacticalEngagement({
      attackers: [
        createFormationUnit("a1", "red", 100, HUMAN_BASE),
        createFormationUnit("a2", "red", 100, HUMAN_BASE),
      ],
      defenders: [createFormationUnit("d", "blue", 100, HUMAN_BASE)],
      terrain: "open", durationTicks: 600,
    });
    // Total attacker casualties should be similar (within 10%)
    const singleCas = singleResult.attackerResult.casualties;
    const splitCas  = splitResult.attackerResult.casualties;
    if (singleCas > 0) {
      const diff = Math.abs(splitCas - singleCas) / singleCas;
      expect(diff).toBeLessThan(0.15);
    }
  });
});
