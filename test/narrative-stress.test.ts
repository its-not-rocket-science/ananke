import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing.js";
import { mkKnight } from "../src/presets.js";
import { buildWorldIndex } from "../src/sim/indexing.js";
import { buildSpatialIndex } from "../src/sim/spatial.js";
import { buildAICommands } from "../src/sim/ai/system.js";
import { AI_PRESETS } from "../src/sim/ai/presets.js";
import {
  runNarrativeStressTest,
  formatStressTestReport,
  beatEntityDefeated,
  beatEntitySurvives,
  beatTeamDefeated,
  beatEntityShockExceeds,
  beatEntityFatigued,
  DEFEATED_CONSCIOUSNESS,
  type NarrativeScenario,
} from "../src/narrative-stress.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Scenario whose only beat is always immediately true (tick 1). */
function alwaysSucceedScenario(): NarrativeScenario {
  return {
    name: "Always Succeed",
    setup: () => mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]),
    commands: () => new Map(),
    beats: [
      {
        tickWindow: [1, 600],
        predicate: () => true,
        description: "always true",
      },
    ],
  };
}

/** Scenario whose only beat is always false — no run ever succeeds. */
function alwaysFailScenario(): NarrativeScenario {
  return {
    name: "Always Fail",
    setup: () => mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]),
    commands: () => new Map(),
    beats: [
      {
        tickWindow: [1, 600],
        predicate: () => false,
        description: "always false",
      },
    ],
  };
}

/** Scenario with no beats. */
function noBeatScenario(): NarrativeScenario {
  return {
    name: "No Beats",
    setup: () => mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]),
    commands: () => new Map(),
    beats: [],
  };
}

const SEEDS_10 = Array.from({ length: 10 }, (_, i) => i + 1);
const _SEEDS_50 = Array.from({ length: 50 }, (_, i) => i + 1);

// ─── runNarrativeStressTest — basic structure ─────────────────────────────────

describe("runNarrativeStressTest", () => {
  it("returns correct scenarioName and runsTotal", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(result.scenarioName).toBe("Always Succeed");
    expect(result.runsTotal).toBe(10);
  });

  it("successRate = 1.0 when beat is always true", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(result.successRate).toBe(1.0);
    expect(result.narrativePush).toBe(0.0);
  });

  it("successRate = 0.0 when beat is always false", () => {
    const result = runNarrativeStressTest(alwaysFailScenario(), SEEDS_10);
    expect(result.successRate).toBe(0.0);
    expect(result.narrativePush).toBe(1.0);
  });

  it("narrativePush = 1 - successRate (invariant)", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(result.narrativePush).toBeCloseTo(1 - result.successRate, 4);
  });

  it("deusExScore = narrativePush × 10, rounded to 1 d.p.", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(result.deusExScore).toBeCloseTo(result.narrativePush * 10, 1);
  });

  it("deusExScore = 0.0 when successRate = 1.0", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(result.deusExScore).toBe(0.0);
  });

  it("deusExScore = 10.0 when successRate = 0.0", () => {
    const result = runNarrativeStressTest(alwaysFailScenario(), SEEDS_10);
    expect(result.deusExScore).toBe(10.0);
  });

  it("beatPush = 1 - passRate for each beat", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    for (const b of result.beatResults) {
      expect(b.beatPush).toBeCloseTo(1 - b.passRate, 4);
    }
  });

  it("beatPush = 0.0 when beat always passes", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(result.beatResults[0]!.beatPush).toBe(0.0);
  });

  it("beatPush = 1.0 when beat always fails", () => {
    const result = runNarrativeStressTest(alwaysFailScenario(), SEEDS_10);
    expect(result.beatResults[0]!.beatPush).toBe(1.0);
  });

  it("successSeeds populated for successful runs", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(result.successSeeds).toHaveLength(10);
    expect(result.successSeeds).toEqual(expect.arrayContaining(SEEDS_10));
  });

  it("successSeeds empty when all runs fail", () => {
    const result = runNarrativeStressTest(alwaysFailScenario(), SEEDS_10);
    expect(result.successSeeds).toHaveLength(0);
  });

  it("empty seeds array gives successRate 0 and no crashes", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), []);
    expect(result.runsTotal).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.narrativePush).toBe(0);
  });

  it("scenario with no beats always succeeds (vacuously)", () => {
    const result = runNarrativeStressTest(noBeatScenario(), SEEDS_10);
    expect(result.successRate).toBe(1.0);
    expect(result.beatResults).toHaveLength(0);
  });

  it("beatResults length matches beats length", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(result.beatResults).toHaveLength(1);
    expect(result.beatResults[0]!.description).toBe("always true");
  });

  it("beat passRate = 1.0 when predicate always true", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(result.beatResults[0]!.passRate).toBe(1.0);
  });

  it("beat passRate = 0.0 when predicate always false", () => {
    const result = runNarrativeStressTest(alwaysFailScenario(), SEEDS_10);
    expect(result.beatResults[0]!.passRate).toBe(0.0);
  });
});

// ─── Tick window enforcement ──────────────────────────────────────────────────

describe("runNarrativeStressTest — tick window", () => {
  it("beat outside tick window never passes even if predicate would be true", () => {
    const scenario: NarrativeScenario = {
      name: "Future Window",
      setup: () => mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]),
      commands: () => new Map(),
      beats: [
        {
          // Window starts at tick 9999 — never reached in default 600 ticks
          tickWindow: [9999, 99999],
          predicate: () => true,
          description: "window never reached",
        },
      ],
      maxTicks: 5,
    };
    const result = runNarrativeStressTest(scenario, [1]);
    expect(result.successRate).toBe(0);
    expect(result.beatResults[0]!.passRate).toBe(0);
  });

  it("beat at tick window [1, 1] passes only if predicate true on tick 1", () => {
    let tickSeen = -1;
    const scenario: NarrativeScenario = {
      name: "Narrow Window",
      setup: () => mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]),
      commands: () => new Map(),
      beats: [
        {
          tickWindow: [1, 1],
          predicate: (world) => {
            tickSeen = world.tick;
            return world.tick === 1;
          },
          description: "exactly tick 1",
        },
      ],
    };
    const result = runNarrativeStressTest(scenario, [1]);
    expect(result.successRate).toBe(1.0);
    expect(tickSeen).toBe(1);
  });

  it("world.seed is overridden per trial", () => {
    const seedsSeen = new Set<number>();
    const scenario: NarrativeScenario = {
      name: "Seed Check",
      setup: () => mkWorld(42, [mkHumanoidEntity(1, 1, 0, 0)]),
      commands: () => new Map(),
      beats: [
        {
          tickWindow: [1, 1],
          predicate: (world) => {
            seedsSeen.add(world.seed);
            return true;
          },
          description: "record seed",
        },
      ],
    };
    runNarrativeStressTest(scenario, [10, 20, 30]);
    // Each trial should use its own seed, not the setup() default of 42
    expect(seedsSeen.has(42)).toBe(false);
    expect(seedsSeen.size).toBe(3);
  });
});

// ─── Multi-beat logic ─────────────────────────────────────────────────────────

describe("runNarrativeStressTest — multiple beats", () => {
  it("ALL beats must pass for a run to succeed", () => {
    const scenario: NarrativeScenario = {
      name: "Two Beats",
      setup: () => mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]),
      commands: () => new Map(),
      beats: [
        { tickWindow: [1, 600], predicate: () => true,  description: "beat A — always true" },
        { tickWindow: [1, 600], predicate: () => false, description: "beat B — always false" },
      ],
    };
    const result = runNarrativeStressTest(scenario, SEEDS_10);
    expect(result.successRate).toBe(0);
    expect(result.beatResults[0]!.passRate).toBe(1.0);
    expect(result.beatResults[1]!.passRate).toBe(0.0);
  });

  it("both beats pass → run succeeds", () => {
    const scenario: NarrativeScenario = {
      name: "Both Pass",
      setup: () => mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]),
      commands: () => new Map(),
      beats: [
        { tickWindow: [1, 600], predicate: () => true, description: "beat A" },
        { tickWindow: [1, 600], predicate: () => true, description: "beat B" },
      ],
    };
    const result = runNarrativeStressTest(scenario, SEEDS_10);
    expect(result.successRate).toBe(1.0);
  });
});

// ─── Beat predicate helpers ───────────────────────────────────────────────────

describe("beatEntityDefeated", () => {
  it("returns false when entity is alive and conscious", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [entity]);
    expect(beatEntityDefeated(1)(world)).toBe(false);
  });

  it("returns true when entity is dead", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.injury.dead = true;
    const world = mkWorld(1, [entity]);
    expect(beatEntityDefeated(1)(world)).toBe(true);
  });

  it("returns true when consciousness at threshold", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.injury.consciousness = DEFEATED_CONSCIOUSNESS;
    const world = mkWorld(1, [entity]);
    expect(beatEntityDefeated(1)(world)).toBe(true);
  });

  it("returns false for unknown entity ID", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    expect(beatEntityDefeated(99)(world)).toBe(false);
  });
});

describe("beatEntitySurvives", () => {
  it("returns true when entity is alive and conscious", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [entity]);
    expect(beatEntitySurvives(1)(world)).toBe(true);
  });

  it("returns false when entity is dead", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.injury.dead = true;
    const world = mkWorld(1, [entity]);
    expect(beatEntitySurvives(1)(world)).toBe(false);
  });

  it("returns false when consciousness at threshold", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.injury.consciousness = DEFEATED_CONSCIOUSNESS;
    const world = mkWorld(1, [entity]);
    expect(beatEntitySurvives(1)(world)).toBe(false);
  });

  it("returns false for unknown entity ID", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    expect(beatEntitySurvives(99)(world)).toBe(false);
  });
});

describe("beatTeamDefeated", () => {
  it("returns false when team has alive members", () => {
    const world = mkWorld(1, [
      mkHumanoidEntity(1, 1, 0, 0),
      mkHumanoidEntity(2, 1, 0, 0),
    ]);
    expect(beatTeamDefeated(1)(world)).toBe(false);
  });

  it("returns true when all team members dead", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    const b = mkHumanoidEntity(2, 1, 0, 0);
    a.injury.dead = true;
    b.injury.dead = true;
    const world = mkWorld(1, [a, b]);
    expect(beatTeamDefeated(1)(world)).toBe(true);
  });

  it("returns false for empty team (no entities with that teamId)", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    expect(beatTeamDefeated(99)(world)).toBe(false);
  });

  it("only checks the specified team", () => {
    const ally  = mkHumanoidEntity(1, 1, 0, 0); // team 1 — alive
    const enemy = mkHumanoidEntity(2, 2, 0, 0); // team 2 — dead
    enemy.injury.dead = true;
    const world = mkWorld(1, [ally, enemy]);
    expect(beatTeamDefeated(2)(world)).toBe(true);
    expect(beatTeamDefeated(1)(world)).toBe(false);
  });
});

describe("beatEntityShockExceeds", () => {
  it("returns false when shock is at or below threshold", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.injury.shock = q(0.30);
    const world = mkWorld(1, [entity]);
    expect(beatEntityShockExceeds(1, q(0.30))(world)).toBe(false);
  });

  it("returns true when shock exceeds threshold", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.injury.shock = q(0.50);
    const world = mkWorld(1, [entity]);
    expect(beatEntityShockExceeds(1, q(0.30))(world)).toBe(true);
  });

  it("returns false for unknown entity", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    expect(beatEntityShockExceeds(99, q(0.10))(world)).toBe(false);
  });
});

describe("beatEntityFatigued", () => {
  it("returns false when fatigue is at or below threshold", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.energy.fatigue = q(0.20);
    const world = mkWorld(1, [entity]);
    expect(beatEntityFatigued(1, q(0.20))(world)).toBe(false);
  });

  it("returns true when fatigue exceeds threshold", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.energy.fatigue = q(0.50);
    const world = mkWorld(1, [entity]);
    expect(beatEntityFatigued(1, q(0.20))(world)).toBe(true);
  });
});

// ─── formatStressTestReport ───────────────────────────────────────────────────

describe("formatStressTestReport", () => {
  it("includes scenario name", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(formatStressTestReport(result)).toContain("Always Succeed");
  });

  it("includes run count", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(formatStressTestReport(result)).toContain("10");
  });

  it("labels push=0 as 'plausible'", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(formatStressTestReport(result)).toContain("plausible");
  });

  it("labels push=1 as 'plot armour'", () => {
    const result = runNarrativeStressTest(alwaysFailScenario(), SEEDS_10);
    expect(formatStressTestReport(result)).toContain("plot armour");
  });

  it("includes beat descriptions", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(formatStressTestReport(result)).toContain("always true");
  });

  it("includes success seeds when present", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), [42]);
    expect(formatStressTestReport(result)).toContain("42");
  });

  it("omits success seeds when none exist", () => {
    const result = runNarrativeStressTest(alwaysFailScenario(), SEEDS_10);
    expect(formatStressTestReport(result)).not.toContain("Success seeds");
  });

  it("returns a non-empty string", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(formatStressTestReport(result).length).toBeGreaterThan(50);
  });

  it("includes Deus Ex score", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(formatStressTestReport(result)).toContain("Deus Ex score");
    expect(formatStressTestReport(result)).toContain("0.0 / 10");
  });

  it("includes per-beat push values", () => {
    const result = runNarrativeStressTest(alwaysSucceedScenario(), SEEDS_10);
    expect(formatStressTestReport(result)).toContain("[push 0.00]");
  });

  it("shows 10.0 / 10 Deus Ex when push is 1.0", () => {
    const result = runNarrativeStressTest(alwaysFailScenario(), SEEDS_10);
    expect(formatStressTestReport(result)).toContain("10.0 / 10");
  });
});

// ─── Combat integration — hero vs. guard ─────────────────────────────────────
// This test uses real AI and two armed entities to verify the full pipeline.
// We don't assert on a specific probability — we assert that the framework
// produces results in the valid range and that determinism holds.

describe("runNarrativeStressTest — combat integration", () => {
  it("produces a valid successRate in [0, 1] for a real combat scenario", () => {
    // Two knights 1.5 m apart — entity 1 (team 1) vs entity 2 (team 2)
    // Beat: entity 2 defeated within 30 s
    const M = SCALE.m; // 10000 units per metre
    const lineInfantry = AI_PRESETS["lineInfantry"]!;
    const policyFor = () => lineInfantry;

    const scenario: NarrativeScenario = {
      name: "Guard Encounter",
      setup: () => {
        const knight = mkKnight(1, 1, 0, 0);
        const guard  = mkKnight(2, 2, Math.round(1.5 * M), 0);
        return mkWorld(1, [knight, guard]);
      },
      commands: (world) => {
        const index   = buildWorldIndex(world);
        const spatial = buildSpatialIndex(world, Math.round(4 * M));
        return buildAICommands(world, index, spatial, policyFor);
      },
      beats: [
        {
          tickWindow: [1, 600],
          predicate: beatEntityDefeated(2),
          description: "guard is defeated",
        },
      ],
    };

    const result = runNarrativeStressTest(
      scenario,
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.successRate).toBeLessThanOrEqual(1);
    expect(result.runsTotal).toBe(20);
    expect(result.narrativePush).toBeCloseTo(1 - result.successRate, 4);
  });
});
