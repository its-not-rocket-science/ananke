import { describe, expect, it } from "vitest";
import { describeAction } from "../src/narrative/combat-logger.js";
import { analyzePlausibility, scorePlausibility } from "../src/narrative/plausibility.js";
import { explainOutcome } from "../src/navigation/causal-chain.js";
import { TraceKinds } from "../src/sim/kinds.js";

describe("narrative consistency layer", () => {
  it("renders cinematic combat lines", () => {
    const line = describeAction(
      { kind: "melee", hit: false, shieldBlocked: true },
      {
        attackerName: "Sir Marcus",
        targetName: "the orc",
        weaponName: "longsword",
        terrain: "muddy",
      },
      { verbosity: "cinematic" },
    );

    expect(line).toContain("near miss");
    expect(line).toContain("muddy terrain");
  });

  it("scores plausibility and emits seed suggestions", () => {
    const report = analyzePlausibility(
      {
        winnerTeamId: 2,
        casualtiesByEntityId: { 10: true },
        rareEventRolls: [{ label: "goblin crit chain", chance: 0.01, happened: true }],
      },
      {
        expectedWinnerTeamId: 1,
        heroIds: [10],
        desiredBeat: "heroic_near_win",
      },
    );

    expect(report.score).toBeLessThan(70);
    expect(report.violations.length).toBeGreaterThan(0);
    expect(report.suggestedSeeds.length).toBe(3);
    expect(scorePlausibility({ winnerTeamId: 1 }, { expectedWinnerTeamId: 1 })).toBe(100);
  });

  it("explains misses with causal factors and mermaid output", () => {
    const exp = explainOutcome(
      7,
      { start: 100, end: 110 },
      {
        fatigueByEntityId: { 7: 0.6 },
        windPenaltyByTick: { 101: 0.4, 103: 0.7, 105: 0.5 },
        trace: [
          {
            kind: TraceKinds.ProjectileHit,
            tick: 101,
            shooterId: 7,
            targetId: 9,
            hit: false,
            distance_m: 30000,
            energyAtImpact_J: 100,
            suppressed: false,
          },
          {
            kind: TraceKinds.ProjectileHit,
            tick: 103,
            shooterId: 7,
            targetId: 9,
            hit: false,
            distance_m: 35000,
            energyAtImpact_J: 90,
            suppressed: false,
          },
          {
            kind: TraceKinds.ProjectileHit,
            tick: 105,
            shooterId: 7,
            targetId: 9,
            hit: false,
            distance_m: 33000,
            energyAtImpact_J: 80,
            suppressed: false,
          },
        ],
      },
    );

    expect(exp.summary).toContain("missed repeatedly");
    expect(exp.factors.length).toBeGreaterThanOrEqual(2);
    expect(exp.mermaid).toContain("flowchart TD");
  });
});
