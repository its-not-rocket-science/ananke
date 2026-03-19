// test/arena.test.ts — Phase 20: Arena Simulation Framework tests

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  runArena,
  summariseArena,
  formatArenaReport,
  expectWinRate,
  expectSurvivalRate,
  expectMeanDuration,
  expectRecovery,
  expectResourceCost,
  narrateRepresentativeTrial,
  CALIBRATION_ARMED_VS_UNARMED,
  CALIBRATION_UNTREATED_KNIFE_WOUND,
  CALIBRATION_FIRST_AID_SAVES_LIVES,
  CALIBRATION_FRACTURE_RECOVERY,
  CALIBRATION_INFECTION_UNTREATED,
  CALIBRATION_PLATE_ARMOUR,
  type ArenaScenario,
} from "../src/arena.js";
import { HUMAN_BASE } from "../src/archetypes.js";
import { STARTER_WEAPONS } from "../src/equipment.js";
import { v3 } from "../src/sim/vec3.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function duelScenario(aWeaponId?: string, bWeaponId?: string): ArenaScenario {
  const wpnA = aWeaponId ? STARTER_WEAPONS.find(w => w.id === aWeaponId) : undefined;
  const wpnB = bWeaponId ? STARTER_WEAPONS.find(w => w.id === bWeaponId) : undefined;
  return {
    name: "test-duel",
    combatants: [
      {
        id: 1, teamId: 1,
        archetype:  HUMAN_BASE,
        loadout:    { items: wpnA ? [wpnA] : [] },
        position_m: v3(0, 0, 0),
      },
      {
        id: 2, teamId: 2,
        archetype:  HUMAN_BASE,
        loadout:    { items: wpnB ? [wpnB] : [] },
        position_m: v3(Math.trunc(0.85 * SCALE.m), 0, 0),
      },
    ],
    maxTicks: 600,
  };
}

// ── Scenario API ──────────────────────────────────────────────────────────────

describe("scenario API", () => {
  it("runArena with 10 trials produces correct trial count", () => {
    const result = runArena(duelScenario("wpn_longsword"), 10);
    expect(result.trials).toBe(10);
    expect(result.trialResults).toHaveLength(10);
  });

  it("seeds differ per trial", () => {
    const result = runArena(duelScenario("wpn_longsword"), 5);
    const seeds = result.trialResults.map(t => t.seed);
    const unique = new Set(seeds);
    expect(unique.size).toBe(5);
  });

  it("winRateByTeam sums to ≤ 1.0", () => {
    const result = runArena(duelScenario("wpn_longsword"), 20);
    const total  = [...result.winRateByTeam.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(1.0 + 1e-9);
  });

  it("survivalRateByEntity values are in [0, 1]", () => {
    const result = runArena(duelScenario("wpn_longsword"), 10);
    for (const [, rate] of result.survivalRateByEntity) {
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
  });

  it("timeout fires at maxTicks", () => {
    const scenario: ArenaScenario = {
      name: "timeout-test",
      combatants: [
        { id: 1, teamId: 1, archetype: HUMAN_BASE, loadout: { items: [] }, position_m: v3(0, 0, 0) },
        { id: 2, teamId: 2, archetype: HUMAN_BASE, loadout: { items: [] }, position_m: v3(Math.trunc(100 * SCALE.m), 0, 0) },
      ],
      maxTicks: 5,  // tiny: entities too far apart to engage
    };
    const result = runArena(scenario, 3);
    // All trials should be timeouts (entities 100m apart with default weapons can't engage in 5 ticks)
    expect(result.timeoutRate).toBe(1.0);
  });

  it("all-same-team scenario results in timeout (no opposing team to beat)", () => {
    const scenario: ArenaScenario = {
      name: "same-team",
      combatants: [
        { id: 1, teamId: 1, archetype: HUMAN_BASE, loadout: { items: [] }, position_m: v3(0, 0, 0) },
        { id: 2, teamId: 1, archetype: HUMAN_BASE, loadout: { items: [] }, position_m: v3(Math.trunc(0.5 * SCALE.m), 0, 0) },
      ],
      maxTicks: 10,
    };
    const result = runArena(scenario, 3);
    expect(result.timeoutRate).toBe(1.0);
  });

  it("recovery stats present when scenario.recovery defined", () => {
    const scenario: ArenaScenario = {
      ...duelScenario("wpn_longsword"),
      recovery: { careLevel: "first_aid", recoveryHours: 0.5 },
    };
    const result = runArena(scenario, 3);
    expect(result.recoveryStats).toBeDefined();
    expect(result.recoveryStats!.length).toBeGreaterThan(0);
  });

  it("narrative log present when narrativeCfg supplied", () => {
    const result = runArena(
      duelScenario("wpn_longsword"),
      3,
      { narrativeCfg: { verbosity: "normal" } },
    );
    const trialWithLog = result.trialResults.find(t => (t.combatLog?.length ?? 0) > 0);
    expect(trialWithLog).toBeDefined();
  });
});

// ── Expectation builders ──────────────────────────────────────────────────────

describe("expectation builders", () => {
  function fakeResult(
    winRates: Record<number, number>,
    meanDur = 10,
    recoveryStats?: ArenaResult["recoveryStats"],
  ): import("../src/arena.js").ArenaResult {
    return {
      scenario:    duelScenario(),
      trials:      10,
      trialResults: [],
      winRateByTeam:        new Map(Object.entries(winRates).map(([k, v]) => [Number(k), v])),
      drawRate:             0,
      timeoutRate:          0,
      meanCombatDuration_s: meanDur,
      p50CombatDuration_s:  meanDur,
      survivalRateByEntity: new Map([[1, 1], [2, 0]]),
      meanTTI_s:            new Map(),
      injuryDistribution:   [],
      recoveryStats: recoveryStats ?? [],
      expectationResults:   [],
    };
  }

  // Needed for the fakeResult helper return type
  type ArenaResult = import("../src/arena.js").ArenaResult;

  it("expectWinRate passes when team1 wins 60% and min=0.50", () => {
    const exp = expectWinRate(1, 0.50);
    expect(exp.check(fakeResult({ 1: 0.60 }))).toBe(true);
  });

  it("expectWinRate fails when team1 wins 40% and min=0.50", () => {
    const exp = expectWinRate(1, 0.50);
    expect(exp.check(fakeResult({ 1: 0.40 }))).toBe(false);
  });

  it("expectMeanDuration passes within bounds, fails outside", () => {
    const exp = expectMeanDuration(5, 20);
    expect(exp.check(fakeResult({ 1: 0.6 }, 10))).toBe(true);
    expect(exp.check(fakeResult({ 1: 0.6 }, 25))).toBe(false);
    expect(exp.check(fakeResult({ 1: 0.6 }, 3))).toBe(false);
  });

  it("expectRecovery passes when meanCombatReadyDays within maxDays", () => {
    const stats = [{ entityId: 1, survivalRatePostRecovery: 1, meanCombatReadyDays: 3, meanFullRecoveryDays: null, meanResourceCostUnits: 5, p90ResourceCostUnits: 8 }];
    const exp   = expectRecovery(1, 7, "first_aid");
    expect(exp.check(fakeResult({ 1: 0.6 }, 10, stats))).toBe(true);
  });

  it("expectResourceCost passes when mean cost within limit", () => {
    const stats = [{ entityId: 1, survivalRatePostRecovery: 1, meanCombatReadyDays: 1, meanFullRecoveryDays: null, meanResourceCostUnits: 5, p90ResourceCostUnits: 8 }];
    const exp   = expectResourceCost(1, 10);
    expect(exp.check(fakeResult({ 1: 0.6 }, 10, stats))).toBe(true);
    const exp2  = expectResourceCost(1, 3);
    expect(exp2.check(fakeResult({ 1: 0.6 }, 10, stats))).toBe(false);
  });

  it("failing expectation includes detail string, passing omits it", () => {
    const scenario: ArenaScenario = {
      ...duelScenario("wpn_longsword"),
      expectations: [
        expectWinRate(1, 0.0),          // trivially passes (≥ 0%)
        expectMeanDuration(0, 0.0001),  // always fails (can't fight in <0.1ms)
      ],
    };
    const result = runArena(scenario, 5);
    const failing = result.expectationResults.find(e => !e.passed);
    expect(failing).toBeDefined();
    expect(failing!.detail).toBeTruthy();

    const passing = result.expectationResults.find(e => e.passed);
    expect(passing).toBeDefined();
    expect(passing!.detail).toBeUndefined();
  });
});

// ── Calibration scenarios ─────────────────────────────────────────────────────

describe("calibration scenarios", () => {
  it("CALIBRATION_ARMED_VS_UNARMED passes all expectations (50 trials)", () => {
    const result = runArena(CALIBRATION_ARMED_VS_UNARMED, 50);
    for (const e of result.expectationResults) {
      expect(e.passed, `expectation failed: ${e.description}`).toBe(true);
    }
  });

  it("CALIBRATION_UNTREATED_KNIFE_WOUND passes all expectations (50 trials)", () => {
    const result = runArena(CALIBRATION_UNTREATED_KNIFE_WOUND, 50);
    for (const e of result.expectationResults) {
      expect(e.passed, `expectation failed: ${e.description}`).toBe(true);
    }
  });

  it("CALIBRATION_FIRST_AID_SAVES_LIVES passes all expectations (50 trials)", () => {
    const result = runArena(CALIBRATION_FIRST_AID_SAVES_LIVES, 50);
    for (const e of result.expectationResults) {
      expect(e.passed, `expectation failed: ${e.description}`).toBe(true);
    }
  });

  it("CALIBRATION_FRACTURE_RECOVERY passes all expectations (50 trials)", () => {
    const result = runArena(CALIBRATION_FRACTURE_RECOVERY, 50);
    for (const e of result.expectationResults) {
      expect(e.passed, `expectation failed: ${e.description}`).toBe(true);
    }
  });

  it("CALIBRATION_INFECTION_UNTREATED passes all expectations (50 trials)", () => {
    const result = runArena(CALIBRATION_INFECTION_UNTREATED, 50);
    for (const e of result.expectationResults) {
      expect(e.passed, `expectation failed: ${e.description}`).toBe(true);
    }
  });

  it("CALIBRATION_PLATE_ARMOUR passes all expectations (50 trials)", () => {
    const result = runArena(CALIBRATION_PLATE_ARMOUR, 50);
    for (const e of result.expectationResults) {
      expect(e.passed, `expectation failed: ${e.description}`).toBe(true);
    }
  });
});

// ── Report formatting ─────────────────────────────────────────────────────────

describe("report formatting", () => {
  it("formatArenaReport contains scenario name", () => {
    const result = runArena(duelScenario("wpn_longsword"), 5);
    const report = formatArenaReport(result);
    expect(report).toContain("test-duel");
  });

  it("formatArenaReport contains win rates as percentages", () => {
    const result = runArena(duelScenario("wpn_longsword"), 10);
    const report = formatArenaReport(result);
    expect(report).toMatch(/\d+\.\d+%/);
  });

  it("formatArenaReport contains mean duration in seconds", () => {
    const result = runArena(duelScenario("wpn_longsword"), 5);
    const report = formatArenaReport(result);
    expect(report).toContain("Mean duration");
    expect(report).toMatch(/\d+\.\d+ s/);
  });

  it("formatArenaReport contains expectation pass/fail table", () => {
    const scenario = { ...duelScenario("wpn_longsword"), expectations: [expectWinRate(1, 0.0)] };
    const result   = runArena(scenario, 5);
    const report   = formatArenaReport(result);
    expect(report).toMatch(/\[PASS\]|\[FAIL\]/);
  });

  it("summariseArena is JSON.stringify-safe", () => {
    const result  = runArena(duelScenario("wpn_longsword"), 3);
    const summary = summariseArena(result);
    expect(() => JSON.stringify(summary)).not.toThrow();
    const parsed  = JSON.parse(JSON.stringify(summary));
    expect(parsed.scenario).toBe("test-duel");
  });
});

// ── Recovery stats ────────────────────────────────────────────────────────────

describe("recovery stats", () => {
  it("more structural damage → longer fullRecoveryAt_s (field_medicine)", () => {
    const mkRecScenario = (damage: number): ArenaScenario => ({
      name: `frac-${damage}`,
      combatants: [{
        id: 1, teamId: 1,
        archetype:  HUMAN_BASE,
        loadout:    { items: [] },
        position_m: v3(0, 0, 0),
        mutateOnCreate(e) {
          const torso = e.injury.byRegion["torso"]!;
          torso.structuralDamage = Math.trunc(damage * SCALE.Q) as ReturnType<typeof q>;
          torso.fractured        = damage >= 0.70;
        },
      }],
      maxTicks: 0,
      recovery: { careLevel: "field_medicine", recoveryHours: 1 },
    });

    const rMinor  = runArena(mkRecScenario(0.20), 3);
    const rSevere = runArena(mkRecScenario(0.60), 3);

    const minorDays  = rMinor.recoveryStats![0]!.meanFullRecoveryDays;
    const severeDays = rSevere.recoveryStats![0]!.meanFullRecoveryDays;

    expect(minorDays).not.toBeNull();
    expect(severeDays).not.toBeNull();
    expect(severeDays!).toBeGreaterThan(minorDays!);
  });

  it("none care: mean resource cost = 0 (no treatment)", () => {
    const scenario: ArenaScenario = {
      name: "no-care",
      combatants: [{
        id: 1, teamId: 1,
        archetype:  HUMAN_BASE,
        loadout:    { items: [] },
        position_m: v3(0, 0, 0),
      }],
      maxTicks: 0,
      recovery: { careLevel: "none", recoveryHours: 0.1 },
    };
    const result = runArena(scenario, 3);
    expect(result.recoveryStats![0]!.meanResourceCostUnits).toBe(0);
  });

  it("inventory exhaustion caps treatment (0 bandages → higher fluid loss)", () => {
    const mkBandageScenario = (bandages: number | undefined): ArenaScenario => ({
      name: `bandages-${bandages}`,
      combatants: [{
        id: 1, teamId: 1,
        archetype:  HUMAN_BASE,
        loadout:    { items: [] },
        position_m: v3(0, 0, 0),
        mutateOnCreate(e) {
          e.injury.byRegion["torso"]!.bleedingRate = q(0.04) as ReturnType<typeof q>;
        },
      }],
      maxTicks: 0,
      recovery: {
        careLevel: "first_aid",
        recoveryHours: 0.1,  // 360 s
        ...(bandages !== undefined && { inventory: new Map([["bandage", bandages]]) }),
      },
    });

    const rFull  = runArena(mkBandageScenario(undefined), 3) // unlimited
    const rEmpty = runArena(mkBandageScenario(0),         3)!; // no bandages

    // Without bandages, entity continues bleeding; with unlimited, bleeding stops immediately
    const fullSurvival  = rFull.recoveryStats![0]!.survivalRatePostRecovery;
    const emptySurvival = rEmpty.recoveryStats![0]!.survivalRatePostRecovery;
    // Full supply should have equal or better survival
    expect(fullSurvival).toBeGreaterThanOrEqual(emptySurvival - 0.01);
  });

  it("careByTeam applies different care levels per team", () => {
    const scenario: ArenaScenario = {
      name: "team-care",
      combatants: [
        {
          id: 1, teamId: 1,
          archetype:  HUMAN_BASE,
          loadout:    { items: [] },
          position_m: v3(0, 0, 0),
          mutateOnCreate(e) {
            e.injury.byRegion["torso"]!.bleedingRate = q(0.04) as ReturnType<typeof q>;
          },
        },
        {
          id: 2, teamId: 2,
          archetype:  HUMAN_BASE,
          loadout:    { items: [] },
          position_m: v3(Math.trunc(0.85 * SCALE.m), 0, 0),
          mutateOnCreate(e) {
            e.injury.byRegion["torso"]!.bleedingRate = q(0.04) as ReturnType<typeof q>;
          },
        },
      ],
      maxTicks: 0,
      recovery: {
        careLevel: "none",
        careByTeam: new Map([[1, "first_aid"]]),
        recoveryHours: 0.5,
      },
    };
    const result = runArena(scenario, 5);
    const team1Stats = result.recoveryStats!.find(s => s.entityId === 1)!;
    const team2Stats = result.recoveryStats!.find(s => s.entityId === 2)!;

    // Team 1 gets first_aid (bandages), team 2 gets none
    // Team 1 should have higher resource cost (used bandages) vs team 2 (zero cost)
    expect(team1Stats.meanResourceCostUnits).toBeGreaterThan(team2Stats.meanResourceCostUnits);
  });

  it("p90 resource cost ≥ mean resource cost", () => {
    const scenario: ArenaScenario = {
      ...CALIBRATION_FIRST_AID_SAVES_LIVES,
      name: "cost-dist",
    };
    const result = runArena(scenario, 20);
    const stats  = result.recoveryStats![0]!;
    expect(stats.p90ResourceCostUnits).toBeGreaterThanOrEqual(stats.meanResourceCostUnits - 1e-9);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("single-combatant scenario runs without crash", () => {
    const scenario: ArenaScenario = {
      name: "solo",
      combatants: [
        { id: 1, teamId: 1, archetype: HUMAN_BASE, loadout: { items: [] }, position_m: v3(0, 0, 0) },
      ],
      maxTicks: 5,
    };
    expect(() => runArena(scenario, 3)).not.toThrow();
  });

  it("all combatants same team → always timeout", () => {
    const scenario: ArenaScenario = {
      name: "same-team",
      combatants: [
        { id: 1, teamId: 1, archetype: HUMAN_BASE, loadout: { items: [] }, position_m: v3(0, 0, 0) },
        { id: 2, teamId: 1, archetype: HUMAN_BASE, loadout: { items: [] }, position_m: v3(Math.trunc(0.5 * SCALE.m), 0, 0) },
      ],
      maxTicks: 10,
    };
    const result = runArena(scenario, 5);
    expect(result.timeoutRate).toBe(1.0);
  });

  it("zero recoveryHours produces trivial report (no deaths from recovery)", () => {
    const scenario: ArenaScenario = {
      name: "zero-recovery",
      combatants: [{
        id: 1, teamId: 1,
        archetype:  HUMAN_BASE,
        loadout:    { items: [] },
        position_m: v3(0, 0, 0),
      }],
      maxTicks: 0,
      recovery: { careLevel: "none", recoveryHours: 0 },
    };
    const result = runArena(scenario, 3);
    expect(result.recoveryStats).toBeDefined();
    // With 0 seconds of downtime, entity should survive (no time to die)
    expect(result.recoveryStats![0]!.survivalRatePostRecovery).toBe(1.0);
  });

  it("scenario without narrativeCfg omits combat log", () => {
    const result = runArena(duelScenario("wpn_longsword"), 3);
    for (const t of result.trialResults) {
      expect(t.combatLog).toBeUndefined();
    }
  });

  it("scenario with no expectations returns empty expectationResults", () => {
    const scenario: ArenaScenario = {
      name: "no-expectations",
      combatants: [
        { id: 1, teamId: 1, archetype: HUMAN_BASE, loadout: { items: [] }, position_m: v3(0, 0, 0) },
        { id: 2, teamId: 2, archetype: HUMAN_BASE, loadout: { items: [] }, position_m: v3(Math.trunc(0.85 * SCALE.m), 0, 0) },
      ],
      maxTicks: 10,
    };
    const result = runArena(scenario, 3);
    expect(result.expectationResults).toHaveLength(0);
  });
});

// ── expectWinRate with max bound ───────────────────────────────────────────────

describe("expectWinRate with max bound", () => {
  // Needed for the fakeResult helper return type
  type ArenaResult = import("../src/arena.js").ArenaResult;

  function fakeResult2(winRates: Record<number, number>): ArenaResult {
    return {
      scenario:    duelScenario(),
      trials:      10,
      trialResults: [],
      winRateByTeam: new Map(Object.entries(winRates).map(([k, v]) => [Number(k), v])),
      drawRate:             0,
      timeoutRate:          0,
      meanCombatDuration_s: 10,
      p50CombatDuration_s:  10,
      survivalRateByEntity: new Map([[1, 1], [2, 0]]),
      meanTTI_s:            new Map(),
      injuryDistribution:   [],
      recoveryStats:        [],
      expectationResults:   [],
    };
  }

  it("passes when win rate is within [min, max] range", () => {
    const exp = expectWinRate(1, 0.50, 0.90);
    expect(exp.check(fakeResult2({ 1: 0.70 }))).toBe(true);
  });

  it("fails when win rate is below min (with max bound)", () => {
    const exp = expectWinRate(1, 0.50, 0.90);
    expect(exp.check(fakeResult2({ 1: 0.40 }))).toBe(false);
  });

  it("fails when win rate exceeds max bound", () => {
    const exp = expectWinRate(1, 0.50, 0.90);
    expect(exp.check(fakeResult2({ 1: 0.95 }))).toBe(false);
  });

  it("description includes both bounds when max is specified", () => {
    const exp = expectWinRate(1, 0.50, 0.90);
    expect(exp.description).toContain("50");
    expect(exp.description).toContain("90");
    expect(exp.description).toContain("–");
  });

  it("description uses ≥ form when max is omitted", () => {
    const exp = expectWinRate(1, 0.50);
    expect(exp.description).toContain("≥");
    expect(exp.description).not.toContain("–");
  });
});

// ── expectSurvivalRate ─────────────────────────────────────────────────────────

describe("expectSurvivalRate", () => {
  type ArenaResult = import("../src/arena.js").ArenaResult;

  function fakeWithSurvival(entityId: number, rate: number): ArenaResult {
    return {
      scenario:    duelScenario(),
      trials:      10,
      trialResults: [],
      winRateByTeam:        new Map([[1, 0.6]]),
      drawRate:             0,
      timeoutRate:          0,
      meanCombatDuration_s: 10,
      p50CombatDuration_s:  10,
      survivalRateByEntity: new Map([[entityId, rate]]),
      meanTTI_s:            new Map(),
      injuryDistribution:   [],
      expectationResults:   [],
    };
  }

  it("passes when entity survival rate meets minimum", () => {
    const exp = expectSurvivalRate(1, 0.70);
    expect(exp.check(fakeWithSurvival(1, 0.80))).toBe(true);
  });

  it("passes at exactly the minimum survival rate", () => {
    const exp = expectSurvivalRate(1, 0.70);
    expect(exp.check(fakeWithSurvival(1, 0.70))).toBe(true);
  });

  it("fails when entity survival rate is below minimum", () => {
    const exp = expectSurvivalRate(1, 0.70);
    expect(exp.check(fakeWithSurvival(1, 0.50))).toBe(false);
  });

  it("description contains entity id and percentage", () => {
    const exp = expectSurvivalRate(42, 0.80);
    expect(exp.description).toContain("42");
    expect(exp.description).toContain("80");
  });

  it("returns 0 survival for unknown entity (missing from map)", () => {
    const exp = expectSurvivalRate(999, 0.10);
    // survival map does not contain 999 → defaults to 0 < 0.10
    expect(exp.check(fakeWithSurvival(1, 1.0))).toBe(false);
  });
});

// ── runArena with 0 trials (aggregateResults n===0 path) ──────────────────────

describe("runArena with 0 trials", () => {
  it("returns empty result with zero trial count", () => {
    const result = runArena(duelScenario("wpn_longsword"), 0);
    expect(result.trials).toBe(0);
    expect(result.trialResults).toHaveLength(0);
  });

  it("winRateByTeam is empty map for 0 trials", () => {
    const result = runArena(duelScenario("wpn_longsword"), 0);
    expect(result.winRateByTeam.size).toBe(0);
  });

  it("drawRate is 0 for 0 trials", () => {
    const result = runArena(duelScenario("wpn_longsword"), 0);
    expect(result.drawRate).toBe(0);
  });

  it("meanCombatDuration_s is 0 for 0 trials", () => {
    const result = runArena(duelScenario("wpn_longsword"), 0);
    expect(result.meanCombatDuration_s).toBe(0);
  });

  it("survivalRateByEntity is empty for 0 trials", () => {
    const result = runArena(duelScenario("wpn_longsword"), 0);
    expect(result.survivalRateByEntity.size).toBe(0);
  });

  it("expectationResults is empty for 0 trials", () => {
    const result = runArena(duelScenario("wpn_longsword"), 0);
    expect(result.expectationResults).toHaveLength(0);
  });
});

// ── narrateRepresentativeTrial ─────────────────────────────────────────────────

describe("narrateRepresentativeTrial", () => {
  it("returns (no trials) string when result has zero trials", () => {
    const result = runArena(duelScenario("wpn_longsword"), 0);
    expect(narrateRepresentativeTrial(result)).toBe("(no trials)");
  });

  it("returns combat log lines when narrativeCfg was supplied", () => {
    const result = runArena(
      duelScenario("wpn_longsword"),
      5,
      { narrativeCfg: { verbosity: "normal" } },
    );
    // At least one trial should have a combat log
    const narrative = narrateRepresentativeTrial(result);
    // With a combatLog present the output uses [tN] prefix format
    expect(narrative).toMatch(/\[t\d+\]/);
  });

  it("falls back to summary text when no narrativeCfg (no combatLog)", () => {
    const result = runArena(duelScenario("wpn_longsword"), 3);
    const narrative = narrateRepresentativeTrial(result);
    // Fallback format: "Trial N (seed S) — T ticks — outcome"
    expect(narrative).toMatch(/Trial \d+/);
    expect(narrative).toMatch(/seed \d+/);
  });

  it("fallback narrative lists survivor info", () => {
    const result = runArena(duelScenario("wpn_longsword"), 3);
    const narrative = narrateRepresentativeTrial(result);
    expect(narrative).toContain("Survivors");
  });

  it("fallback narrative lists entity injury lines", () => {
    const result = runArena(duelScenario("wpn_longsword"), 5);
    const narrative = narrateRepresentativeTrial(result);
    expect(narrative).toContain("Entity");
  });
});

// ── formatArenaReport with recovery stats ─────────────────────────────────────

describe("formatArenaReport with recovery stats", () => {
  it("includes Recovery stats section when recoveryStats are present", () => {
    const result = runArena(CALIBRATION_FIRST_AID_SAVES_LIVES, 10);
    const report = formatArenaReport(result);
    expect(report).toContain("Recovery stats");
  });

  it("includes combat-ready days in recovery section", () => {
    const result = runArena(CALIBRATION_FIRST_AID_SAVES_LIVES, 10);
    const report = formatArenaReport(result);
    expect(report).toContain("combat-ready");
  });

  it("includes full recovery days in recovery section", () => {
    const result = runArena(CALIBRATION_FRACTURE_RECOVERY, 10);
    const report = formatArenaReport(result);
    expect(report).toContain("full recovery");
  });

  it("includes cost field in recovery section", () => {
    const result = runArena(CALIBRATION_FIRST_AID_SAVES_LIVES, 10);
    const report = formatArenaReport(result);
    expect(report).toContain("cost");
  });

  it("does not include Recovery stats section when no recovery scenario", () => {
    const result = runArena(duelScenario("wpn_longsword"), 5);
    const report = formatArenaReport(result);
    expect(report).not.toContain("Recovery stats");
  });
});

// ── Three-team scenario (teamId > 2 winning → draw outcome) ───────────────────

describe("three-team scenario", () => {
  it("team with id > 2 winning produces draw outcome in aggregation", () => {
    const scenario: ArenaScenario = {
      name: "three-team",
      combatants: [
        {
          id: 1, teamId: 3,
          archetype: HUMAN_BASE,
          loadout:   { items: [STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!] },
          position_m: v3(0, 0, 0),
        },
        {
          id: 2, teamId: 4,
          archetype: HUMAN_BASE,
          loadout:   { items: [] },
          position_m: v3(Math.trunc(0.85 * SCALE.m), 0, 0),
        },
      ],
      maxTicks: 600,
    };
    const result = runArena(scenario, 20);
    // Team IDs 3 and 4 are neither 1 nor 2 — any team victory maps to "draw"
    // So winRateByTeam for teams 1 and 2 should be 0, and draw+timeout should cover everything
    const t1Rate = result.winRateByTeam.get(1) ?? 0;
    const t2Rate = result.winRateByTeam.get(2) ?? 0;
    expect(t1Rate).toBe(0);
    expect(t2Rate).toBe(0);
    // All non-timeout outcomes should count as draws
    expect(result.drawRate + result.timeoutRate).toBeCloseTo(1.0, 5);
  });
});
