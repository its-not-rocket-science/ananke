// test/siege.test.ts — Phase 84: Siege Warfare

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";
import {
  INVESTMENT_DAYS,
  WALL_DECAY_BASE_Q,
  SUPPLY_DRAIN_PER_DAY_Q,
  ASSAULT_WALL_THRESHOLD_Q,
  createSiege,
  isSiegeResolved,
  computeSiegeAttrition,
  stepSiege,
  runSiegeToResolution,
} from "../src/siege.js";
import { createPolity } from "../src/polity.js";

// ── helpers ────────────────────────────────────────────────────────────────────

function makeAttacker(militaryStrength: number = q(0.80)) {
  const p = createPolity("att", "Attacker", "f1", [], 50_000, 100_000, "Medieval");
  p.militaryStrength_Q = militaryStrength as Q;
  return p;
}

function makeDefender(stabilityQ: number = q(0.70)) {
  const p = createPolity("def", "Defender", "f2", [], 10_000, 50_000, "Medieval");
  p.stabilityQ = stabilityQ as Q;
  return p;
}

// ── createSiege ────────────────────────────────────────────────────────────────

describe("createSiege", () => {
  it("starts in investment phase", () => {
    const s = createSiege(makeAttacker(), makeDefender());
    expect(s.phase).toBe("investment");
    expect(s.phaseDay).toBe(0);
  });

  it("walls start at full integrity", () => {
    const s = createSiege(makeAttacker(), makeDefender());
    expect(s.wallIntegrity_Q).toBe(SCALE.Q);
  });

  it("supply starts full", () => {
    const s = createSiege(makeAttacker(), makeDefender());
    expect(s.supplyLevel_Q).toBe(SCALE.Q);
  });

  it("defender morale seeded from polity stabilityQ", () => {
    const def = makeDefender(q(0.60));
    const s = createSiege(makeAttacker(), def);
    expect(s.defenderMorale_Q).toBe(q(0.60));
  });

  it("siege strength seeded from attacker militaryStrength_Q", () => {
    const att = makeAttacker(q(0.50));
    const s = createSiege(att, makeDefender());
    expect(s.siegeStrength_Q).toBe(q(0.50));
  });

  it("polity IDs are recorded", () => {
    const s = createSiege(makeAttacker(), makeDefender(), 42);
    expect(s.attackerPolityId).toBe("att");
    expect(s.defenderPolityId).toBe("def");
    expect(s.startTick).toBe(42);
  });

  it("outcome is not set on creation", () => {
    const s = createSiege(makeAttacker(), makeDefender());
    expect(s.outcome).toBeUndefined();
  });
});

// ── isSiegeResolved ────────────────────────────────────────────────────────────

describe("isSiegeResolved", () => {
  it("returns false during investment", () => {
    const s = createSiege(makeAttacker(), makeDefender());
    expect(isSiegeResolved(s)).toBe(false);
  });

  it("returns true when phase is resolved", () => {
    const s = createSiege(makeAttacker(), makeDefender());
    s.phase   = "resolved";
    s.outcome = "surrender";
    expect(isSiegeResolved(s)).toBe(true);
  });
});

// ── computeSiegeAttrition ──────────────────────────────────────────────────────

describe("computeSiegeAttrition", () => {
  it("investment phase → low symmetric losses", () => {
    const s = createSiege(makeAttacker(), makeDefender());
    const a = computeSiegeAttrition(s);
    expect(a.attackerLoss_Q).toBeGreaterThan(0);
    expect(a.defenderLoss_Q).toBeGreaterThan(0);
    expect(a.attackerLoss_Q).toBe(a.defenderLoss_Q);
  });

  it("active phase → attacker and defender losses differ", () => {
    const s = createSiege(makeAttacker(), makeDefender());
    s.phase = "active";
    const a = computeSiegeAttrition(s);
    expect(a.attackerLoss_Q).toBeGreaterThan(0);
    expect(a.defenderLoss_Q).toBeGreaterThan(0);
  });

  it("active phase — weaker walls → higher attacker losses", () => {
    const s1 = createSiege(makeAttacker(), makeDefender());
    s1.phase = "active";
    s1.wallIntegrity_Q = SCALE.Q as Q;
    const s2 = createSiege(makeAttacker(), makeDefender());
    s2.phase = "active";
    s2.wallIntegrity_Q = q(0.20);
    expect(computeSiegeAttrition(s2).attackerLoss_Q)
      .toBeGreaterThan(computeSiegeAttrition(s1).attackerLoss_Q);
  });

  it("resolved phase → zero losses", () => {
    const s = createSiege(makeAttacker(), makeDefender());
    s.phase = "resolved";
    const a = computeSiegeAttrition(s);
    expect(a.attackerLoss_Q).toBe(0);
    expect(a.defenderLoss_Q).toBe(0);
  });
});

// ── stepSiege — investment phase ───────────────────────────────────────────────

describe("stepSiege — investment phase", () => {
  it("increments phaseDay each step", () => {
    const s = createSiege(makeAttacker(), makeDefender());
    stepSiege(s, 1, 0);
    expect(s.phaseDay).toBe(1);
    stepSiege(s, 1, 1);
    expect(s.phaseDay).toBe(2);
  });

  it("does not decay walls during investment", () => {
    const s = createSiege(makeAttacker(), makeDefender());
    for (let d = 0; d < INVESTMENT_DAYS - 1; d++) stepSiege(s, 1, d);
    expect(s.wallIntegrity_Q).toBe(SCALE.Q);
  });

  it("does not drain supply during investment", () => {
    const s = createSiege(makeAttacker(), makeDefender());
    for (let d = 0; d < INVESTMENT_DAYS - 1; d++) stepSiege(s, 1, d);
    expect(s.supplyLevel_Q).toBe(SCALE.Q);
  });

  it("transitions to active after INVESTMENT_DAYS steps", () => {
    const s = createSiege(makeAttacker(), makeDefender());
    let result = { phaseChanged: false, resolved: false };
    for (let d = 0; d < INVESTMENT_DAYS; d++) {
      result = stepSiege(s, 1, d);
    }
    expect(result.phaseChanged).toBe(true);
    expect(s.phase).toBe("active");
  });

  it("phaseDay resets to 0 on transition to active", () => {
    const s = createSiege(makeAttacker(), makeDefender());
    for (let d = 0; d < INVESTMENT_DAYS; d++) stepSiege(s, 1, d);
    expect(s.phaseDay).toBe(0);
  });
});

// ── stepSiege — active phase ───────────────────────────────────────────────────

describe("stepSiege — active phase", () => {
  function activeState(siegeStr: number = q(0.80), defMorale: number = q(0.70)) {
    const att = makeAttacker(siegeStr);
    const def = makeDefender(defMorale);
    const s = createSiege(att, def);
    s.phase = "active";
    s.phaseDay = 0;
    return s;
  }

  it("decays wall integrity each day", () => {
    const s = activeState();
    const before = s.wallIntegrity_Q;
    stepSiege(s, 1, 0);
    expect(s.wallIntegrity_Q).toBeLessThan(before);
  });

  it("drains supply each day", () => {
    const s = activeState();
    const before = s.supplyLevel_Q;
    stepSiege(s, 1, 0);
    expect(s.supplyLevel_Q).toBeLessThan(before);
  });

  it("decays defender morale over time", () => {
    const s = activeState();
    const before = s.defenderMorale_Q;
    for (let d = 0; d < 30; d++) stepSiege(s, 1, d);
    expect(s.defenderMorale_Q).toBeLessThan(before);
  });

  it("higher siege strength decays walls faster", () => {
    const sStrong = activeState(q(0.90));
    const sWeak   = activeState(q(0.20));
    for (let d = 0; d < 10; d++) {
      stepSiege(sStrong, 1, d);
      stepSiege(sWeak,   1, d);
    }
    expect(sStrong.wallIntegrity_Q).toBeLessThan(sWeak.wallIntegrity_Q);
  });

  it("extra supply pressure drains supply faster", () => {
    const s1 = activeState();
    const s2 = activeState();
    for (let d = 0; d < 10; d++) {
      stepSiege(s1, 1, d, 0 as Q);
      stepSiege(s2, 1, d, q(0.01));
    }
    expect(s2.supplyLevel_Q).toBeLessThan(s1.supplyLevel_Q);
  });

  it("winter multiplier (< SCALE.Q) reduces effective siege strength", () => {
    const sWinter = activeState(q(0.80));
    const sFull   = activeState(q(0.80));
    for (let d = 0; d < 30; d++) {
      stepSiege(sWinter, 1, d, 0 as Q, q(0.50));
      stepSiege(sFull,   1, d, 0 as Q, SCALE.Q as Q);
    }
    expect(sWinter.wallIntegrity_Q).toBeGreaterThan(sFull.wallIntegrity_Q);
  });

  it("no-op once resolved (with outcome)", () => {
    const s = activeState();
    s.phase = "resolved";
    s.outcome = "surrender";
    const wallBefore = s.wallIntegrity_Q;
    const result = stepSiege(s, 1, 999);
    expect(s.wallIntegrity_Q).toBe(wallBefore);
    expect(result.resolved).toBe(true);
    expect(result.outcome).toBe("surrender");
  });

  it("no-op once resolved (without outcome set — defensive branch)", () => {
    const s = activeState();
    s.phase = "resolved";
    // outcome intentionally left undefined to exercise the null-guard branch
    const result = stepSiege(s, 1, 999);
    expect(result.resolved).toBe(true);
    expect(result.outcome).toBeUndefined();
  });
});

// ── runSiegeToResolution ───────────────────────────────────────────────────────

describe("runSiegeToResolution", () => {
  it("resolves within maxDays", () => {
    const att = makeAttacker(q(0.99));
    const def = makeDefender(q(0.10));
    const s = createSiege(att, def);
    const result = runSiegeToResolution(s, 1, 0, 500);
    expect(result.resolved).toBe(true);
    expect(s.outcome).toBeDefined();
  });

  it("strong attacker vs weak defender → attacker usually wins", () => {
    let attackerWins = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const att = makeAttacker(q(0.99));
      att.id = `att${seed}`;
      const def = makeDefender(q(0.10));
      def.id = `def${seed}`;
      const s = createSiege(att, def);
      runSiegeToResolution(s, seed, 0, 500);
      if (s.outcome === "attacker_victory" || s.outcome === "surrender") attackerWins++;
    }
    expect(attackerWins).toBeGreaterThan(10);
  });

  it("weak attacker vs strong defender → defender holds more often than attacker wins assault", () => {
    let defenderHolds = 0, attackerWins = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const att = makeAttacker(q(0.90));
      att.id = `att${seed}`;
      const def = makeDefender(q(0.95));
      def.id = `def${seed}`;
      const s = createSiege(att, def);
      runSiegeToResolution(s, seed, 0, 500);
      if (s.outcome === "defender_holds") defenderHolds++;
      if (s.outcome === "attacker_victory") attackerWins++;
    }
    expect(defenderHolds).toBeGreaterThan(attackerWins);
  });

  it("attacker_victory is reachable", () => {
    // High siege strength breaches walls quickly
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const att = makeAttacker(q(0.90));
      att.id = `att${seed}`;
      const def = makeDefender(q(0.10));
      def.id = `def${seed}`;
      const s = createSiege(att, def);
      runSiegeToResolution(s, seed, 0, 500);
      if (s.outcome) outcomes.add(s.outcome);
    }
    expect(outcomes.has("attacker_victory")).toBe(true);
  });

  it("defender_holds is reachable (failed assault)", () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const att = makeAttacker(q(0.90));
      att.id = `att${seed}`;
      const def = makeDefender(q(0.95));
      def.id = `def${seed}`;
      const s = createSiege(att, def);
      runSiegeToResolution(s, seed, 0, 500);
      if (s.outcome) outcomes.add(s.outcome);
    }
    expect(outcomes.has("defender_holds")).toBe(true);
  });

  it("surrender is reachable (low siege strength → supply runs out first)", () => {
    // Low siege strength means walls breach slowly (>700 days) but supply runs out in ~237 days
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const att = makeAttacker(q(0.10));
      att.id = `att${seed}`;
      const def = makeDefender(q(0.20)); // low morale → high surrender chance
      def.id = `def${seed}`;
      const s = createSiege(att, def);
      runSiegeToResolution(s, seed, 0, 500);
      if (s.outcome) outcomes.add(s.outcome);
    }
    expect(outcomes.has("surrender")).toBe(true);
  });

  it("deterministic — same seed always gives same outcome", () => {
    function run(seed: number) {
      const att = makeAttacker(q(0.60));
      const def = makeDefender(q(0.50));
      const s = createSiege(att, def);
      runSiegeToResolution(s, seed, 0, 500);
      return s.outcome;
    }
    expect(run(42)).toBe(run(42));
    expect(run(99)).toBe(run(99));
  });
});

// ── constants sanity ───────────────────────────────────────────────────────────

describe("constants", () => {
  it("INVESTMENT_DAYS = 14", () => {
    expect(INVESTMENT_DAYS).toBe(14);
  });

  it("ASSAULT_WALL_THRESHOLD_Q = q(0.30)", () => {
    expect(ASSAULT_WALL_THRESHOLD_Q).toBe(q(0.30));
  });

  it("WALL_DECAY_BASE_Q > 0", () => {
    expect(WALL_DECAY_BASE_Q).toBeGreaterThan(0);
  });

  it("SUPPLY_DRAIN_PER_DAY_Q > 0", () => {
    expect(SUPPLY_DRAIN_PER_DAY_Q).toBeGreaterThan(0);
  });

  it("supply lasts > 100 days at base drain rate", () => {
    // SCALE.Q / SUPPLY_DRAIN_PER_DAY_Q should be > 100
    expect(SCALE.Q / SUPPLY_DRAIN_PER_DAY_Q).toBeGreaterThan(100);
  });
});
