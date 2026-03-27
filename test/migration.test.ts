// test/migration.test.ts — Phase 81: Migration & Displacement

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";
import {
  MIGRATION_PUSH_STABILITY_THRESHOLD,
  MIGRATION_PUSH_FEUDAL_THRESHOLD,
  MIGRATION_WAR_PUSH_Q,
  MIGRATION_DAILY_RATE_Q,
  MIGRATION_PUSH_MIN_Q,
  computePushPressure,
  computePullFactor,
  computeMigrationFlow,
  resolveMigration,
  applyMigrationFlows,
  estimateNetMigrationRate,
} from "../src/migration.js";
import { createPolity, createPolityRegistry } from "../src/polity.js";

// ── helpers ────────────────────────────────────────────────────────────────────

function makePolity(
  id:         string,
  population: number,
  stabilityQ: number,
  moraleQ:    number,
) {
  const p = createPolity(id, id, "f1", [], population, 10_000, "Medieval",
    stabilityQ as Q, moraleQ as Q);
  return p;
}

// ── computePushPressure ────────────────────────────────────────────────────────

describe("computePushPressure", () => {
  it("returns 0 for a stable, high-morale polity not at war", () => {
    const p = makePolity("A", 1000, q(0.70), q(0.65));
    expect(computePushPressure(p)).toBe(0);
  });

  it("returns positive pressure below stability threshold", () => {
    const p = makePolity("A", 1000, q(0.20), q(0.65));
    // stabilityDeficit = q(0.40) - q(0.20) = q(0.20)
    expect(computePushPressure(p)).toBeGreaterThan(0);
  });

  it("stability and morale deficits are additive", () => {
    const pLow  = makePolity("A", 1000, q(0.20), q(0.20));
    const pHigh = makePolity("B", 1000, q(0.20), q(0.65));
    expect(computePushPressure(pLow)).toBeGreaterThan(computePushPressure(pHigh));
  });

  it("adds war bonus when isAtWar = true", () => {
    const p = makePolity("A", 1000, q(0.70), q(0.65));
    const noWar = computePushPressure(p, false);
    const atWar = computePushPressure(p, true);
    expect(atWar).toBe(noWar + MIGRATION_WAR_PUSH_Q);
  });

  it("adds feudal deficit for weak bond strength", () => {
    const p = makePolity("A", 1000, q(0.70), q(0.65));
    const strong = computePushPressure(p, false, q(0.80));
    const weak   = computePushPressure(p, false, q(0.10));
    expect(weak).toBeGreaterThan(strong);
  });

  it("feudal deficit = 0 at or above feudal threshold", () => {
    const p = makePolity("A", 1000, q(0.70), q(0.65));
    const atThreshold = computePushPressure(p, false, MIGRATION_PUSH_FEUDAL_THRESHOLD);
    const above       = computePushPressure(p, false, q(0.50));
    expect(atThreshold).toBe(above); // no extra deficit
  });

  it("is clamped to [0, SCALE.Q]", () => {
    const p = makePolity("A", 1000, 0 as Q, 0 as Q);
    const push = computePushPressure(p, true, 0 as Q);
    expect(push).toBeGreaterThanOrEqual(0);
    expect(push).toBeLessThanOrEqual(SCALE.Q);
  });

  it("exact values: stability q(0.20), morale q(0.30), not at war", () => {
    const p = makePolity("A", 1000, q(0.20), q(0.30));
    // stabilityDeficit = 4000 - 2000 = 2000
    // moraleDeficit    = 4000 - 3000 = 1000
    expect(computePushPressure(p)).toBe(q(0.20) + q(0.10));
  });
});

// ── computePullFactor ──────────────────────────────────────────────────────────

describe("computePullFactor", () => {
  it("high stability and morale → high pull", () => {
    const p = makePolity("A", 1000, q(0.90), q(0.90));
    expect(computePullFactor(p)).toBeGreaterThan(q(0.70));
  });

  it("low stability or morale → low pull", () => {
    const pLow  = makePolity("A", 1000, q(0.20), q(0.20));
    const pHigh = makePolity("B", 1000, q(0.80), q(0.80));
    expect(computePullFactor(pLow)).toBeLessThan(computePullFactor(pHigh));
  });

  it("zero morale → zero pull", () => {
    const p = makePolity("A", 1000, q(0.80), 0 as Q);
    expect(computePullFactor(p)).toBe(0);
  });

  it("zero stability → zero pull", () => {
    const p = makePolity("A", 1000, 0 as Q, q(0.80));
    expect(computePullFactor(p)).toBe(0);
  });

  it("is clamped to [0, SCALE.Q]", () => {
    const p = makePolity("A", 1000, SCALE.Q as Q, SCALE.Q as Q);
    expect(computePullFactor(p)).toBeLessThanOrEqual(SCALE.Q);
    expect(computePullFactor(p)).toBeGreaterThanOrEqual(0);
  });
});

// ── computeMigrationFlow ───────────────────────────────────────────────────────

describe("computeMigrationFlow", () => {
  const from = makePolity("A", 100_000, q(0.20), q(0.30));
  const to   = makePolity("B", 50_000,  q(0.80), q(0.75));

  it("returns positive flow for high-push, high-pull pair", () => {
    const push = computePushPressure(from);
    const pull = computePullFactor(to);
    expect(computeMigrationFlow(from, to, push, pull)).toBeGreaterThan(0);
  });

  it("returns 0 when push < MIGRATION_PUSH_MIN_Q", () => {
    const pull = computePullFactor(to);
    expect(computeMigrationFlow(from, to, 0 as Q, pull)).toBe(0);
    expect(computeMigrationFlow(from, to, (MIGRATION_PUSH_MIN_Q - 1) as Q, pull)).toBe(0);
  });

  it("returns 0 when pull = 0", () => {
    const push = computePushPressure(from);
    expect(computeMigrationFlow(from, to, push, 0 as Q)).toBe(0);
  });

  it("returns 0 when from.population = 0", () => {
    const empty = makePolity("X", 0, q(0.10), q(0.10));
    const push  = computePushPressure(from);
    const pull  = computePullFactor(to);
    expect(computeMigrationFlow(empty, to, push, pull)).toBe(0);
  });

  it("returns 0 for same polity", () => {
    const push = computePushPressure(from);
    const pull = computePullFactor(from);
    expect(computeMigrationFlow(from, from, push, pull)).toBe(0);
  });

  it("higher push → more migrants", () => {
    const lowPush  = q(0.10);
    const highPush = q(0.50);
    const pull     = computePullFactor(to);
    expect(computeMigrationFlow(from, to, highPush, pull))
      .toBeGreaterThan(computeMigrationFlow(from, to, lowPush, pull));
  });

  it("larger population → more migrants", () => {
    const big   = makePolity("Big",   1_000_000, q(0.20), q(0.30));
    const small = makePolity("Small",    10_000, q(0.20), q(0.30));
    const push  = computePushPressure(from);
    const pull  = computePullFactor(to);
    expect(computeMigrationFlow(big, to, push, pull))
      .toBeGreaterThan(computeMigrationFlow(small, to, push, pull));
  });

  it("result is a non-negative integer", () => {
    const push = computePushPressure(from);
    const pull = computePullFactor(to);
    const n    = computeMigrationFlow(from, to, push, pull);
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
  });
});

// ── resolveMigration ───────────────────────────────────────────────────────────

describe("resolveMigration", () => {
  it("produces flows from unstable → stable polity", () => {
    const unstable = makePolity("U", 100_000, q(0.15), q(0.20));
    const stable   = makePolity("S",  50_000, q(0.80), q(0.75));
    const flows = resolveMigration([unstable, stable]);
    expect(flows.some(f => f.fromPolityId === "U" && f.toPolityId === "S")).toBe(true);
  });

  it("does not produce flows from stable polity", () => {
    const stable   = makePolity("S",  50_000, q(0.80), q(0.75));
    const unstable = makePolity("U", 100_000, q(0.15), q(0.20));
    const flows = resolveMigration([stable, unstable]);
    expect(flows.every(f => f.fromPolityId !== "S")).toBe(true);
  });

  it("returns empty array when all polities are stable", () => {
    const a = makePolity("A", 100_000, q(0.80), q(0.75));
    const b = makePolity("B",  50_000, q(0.75), q(0.70));
    expect(resolveMigration([a, b])).toHaveLength(0);
  });

  it("war context increases flows", () => {
    const p = makePolity("W", 100_000, q(0.50), q(0.50));
    const s = makePolity("S",  50_000, q(0.80), q(0.75));
    const noWar  = resolveMigration([p, s]);
    const atWar  = resolveMigration([p, s], new Map([["W", { polityId: "W", isAtWar: true }]]));
    const noFlow = noWar.find(f => f.fromPolityId === "W")?.population ?? 0;
    const waFlow = atWar.find(f => f.fromPolityId === "W")?.population ?? 0;
    expect(waFlow).toBeGreaterThanOrEqual(noFlow);
  });

  it("feudal context with weak bond increases flows", () => {
    const p = makePolity("V", 100_000, q(0.55), q(0.55));
    const s = makePolity("S",  50_000, q(0.80), q(0.75));
    const noFeudal = resolveMigration([p, s]);
    const withWeak = resolveMigration([p, s], new Map([
      ["V", { polityId: "V", lowestBondStr_Q: q(0.10) }],
    ]));
    const noFlow = noFeudal.find(f => f.fromPolityId === "V")?.population ?? 0;
    const feFlow = withWeak.find(f => f.fromPolityId === "V")?.population ?? 0;
    expect(feFlow).toBeGreaterThanOrEqual(noFlow);
  });

  it("all flows have population > 0", () => {
    const u = makePolity("U", 500_000, q(0.10), q(0.10));
    const s = makePolity("S",  50_000, q(0.90), q(0.90));
    const flows = resolveMigration([u, s]);
    expect(flows.every(f => f.population > 0)).toBe(true);
  });
});

// ── applyMigrationFlows ────────────────────────────────────────────────────────

describe("applyMigrationFlows", () => {
  it("reduces sender population and increases receiver", () => {
    const a = makePolity("A", 100_000, q(0.20), q(0.20));
    const b = makePolity("B",  50_000, q(0.80), q(0.75));
    const registry = createPolityRegistry([a, b]);
    applyMigrationFlows(registry, [{ fromPolityId: "A", toPolityId: "B", population: 500 }]);
    expect(registry.polities.get("A")!.population).toBe(99_500);
    expect(registry.polities.get("B")!.population).toBe(50_500);
  });

  it("clamps to sender population (no negative populations)", () => {
    const a = makePolity("A", 100, q(0.20), q(0.20));
    const b = makePolity("B", 500, q(0.80), q(0.75));
    const registry = createPolityRegistry([a, b]);
    applyMigrationFlows(registry, [{ fromPolityId: "A", toPolityId: "B", population: 999 }]);
    expect(registry.polities.get("A")!.population).toBe(0);
    expect(registry.polities.get("B")!.population).toBe(600);
  });

  it("skips unknown polity IDs", () => {
    const a = makePolity("A", 1000, q(0.20), q(0.20));
    const registry = createPolityRegistry([a]);
    expect(() => applyMigrationFlows(registry, [
      { fromPolityId: "A", toPolityId: "UNKNOWN", population: 100 },
    ])).not.toThrow();
    expect(registry.polities.get("A")!.population).toBe(1000);
  });

  it("applies multiple flows sequentially", () => {
    const a = makePolity("A", 100_000, q(0.20), q(0.20));
    const b = makePolity("B",  50_000, q(0.80), q(0.75));
    const c = makePolity("C",  30_000, q(0.80), q(0.75));
    const registry = createPolityRegistry([a, b, c]);
    applyMigrationFlows(registry, [
      { fromPolityId: "A", toPolityId: "B", population: 200 },
      { fromPolityId: "A", toPolityId: "C", population: 100 },
    ]);
    expect(registry.polities.get("A")!.population).toBe(99_700);
    expect(registry.polities.get("B")!.population).toBe(50_200);
    expect(registry.polities.get("C")!.population).toBe(30_100);
  });

  it("no-op for zero-population flow", () => {
    const a = makePolity("A", 1000, q(0.20), q(0.20));
    const b = makePolity("B", 5000, q(0.80), q(0.75));
    const registry = createPolityRegistry([a, b]);
    applyMigrationFlows(registry, [{ fromPolityId: "A", toPolityId: "B", population: 0 }]);
    expect(registry.polities.get("A")!.population).toBe(1000);
    expect(registry.polities.get("B")!.population).toBe(5000);
  });
});

// ── estimateNetMigrationRate ───────────────────────────────────────────────────

describe("estimateNetMigrationRate", () => {
  it("returns negative rate for net emigration", () => {
    const flows = [
      { fromPolityId: "A", toPolityId: "B", population: 500 },
      { fromPolityId: "A", toPolityId: "C", population: 200 },
    ];
    expect(estimateNetMigrationRate("A", flows, 10_000)).toBeCloseTo(-0.07);
  });

  it("returns positive rate for net immigration", () => {
    const flows = [
      { fromPolityId: "X", toPolityId: "B", population: 300 },
      { fromPolityId: "Y", toPolityId: "B", population: 200 },
    ];
    expect(estimateNetMigrationRate("B", flows, 10_000)).toBeCloseTo(0.05);
  });

  it("returns 0 for polity with no flows", () => {
    const flows = [{ fromPolityId: "X", toPolityId: "Y", population: 100 }];
    expect(estimateNetMigrationRate("Z", flows, 5000)).toBe(0);
  });

  it("returns 0 for zero population", () => {
    const flows = [{ fromPolityId: "A", toPolityId: "B", population: 100 }];
    expect(estimateNetMigrationRate("A", flows, 0)).toBe(0);
  });
});

// ── constants sanity ───────────────────────────────────────────────────────────

describe("constants", () => {
  it("MIGRATION_PUSH_MIN_Q < MIGRATION_PUSH_STABILITY_THRESHOLD", () => {
    expect(MIGRATION_PUSH_MIN_Q).toBeLessThan(MIGRATION_PUSH_STABILITY_THRESHOLD);
  });

  it("MIGRATION_WAR_PUSH_Q > MIGRATION_PUSH_MIN_Q", () => {
    expect(MIGRATION_WAR_PUSH_Q).toBeGreaterThan(MIGRATION_PUSH_MIN_Q);
  });

  it("MIGRATION_DAILY_RATE_Q > 0 and < q(0.01)", () => {
    expect(MIGRATION_DAILY_RATE_Q).toBeGreaterThan(0);
    expect(MIGRATION_DAILY_RATE_Q).toBeLessThan(q(0.01));
  });
});

// ── integration: year of displacement ────────────────────────────────────────

describe("population displacement over time", () => {
  it("unstable polity loses population to stable neighbour over 30 days", () => {
    const u = makePolity("U", 100_000, q(0.10), q(0.10));
    const s = makePolity("S",  50_000, q(0.85), q(0.80));
    const regU = createPolityRegistry([u, s]);

    for (let day = 0; day < 30; day++) {
      const polities = [...regU.polities.values()];
      const flows = resolveMigration(polities);
      applyMigrationFlows(regU, flows);
    }

    expect(regU.polities.get("U")!.population).toBeLessThan(100_000);
    expect(regU.polities.get("S")!.population).toBeGreaterThan(50_000);
  });

  it("stable polity retains population", () => {
    const s1 = makePolity("S1", 100_000, q(0.80), q(0.75));
    const s2 = makePolity("S2",  50_000, q(0.82), q(0.78));
    const reg = createPolityRegistry([s1, s2]);

    const before1 = s1.population;
    const before2 = s2.population;
    for (let day = 0; day < 30; day++) {
      applyMigrationFlows(reg, resolveMigration([...reg.polities.values()]));
    }
    expect(reg.polities.get("S1")!.population).toBe(before1);
    expect(reg.polities.get("S2")!.population).toBe(before2);
  });
});
