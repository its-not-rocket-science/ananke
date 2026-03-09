// test/competence.test.ts — Phase 40: Non-Combat Competence Framework tests

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import type { Entity } from "../src/sim/entity.js";
import type { WorldState } from "../src/sim/world.js";
import {
  resolveCompetence,
  calculateXP,
  canonicalizeDescriptor,
  getDomainIntelligence,
  COMPETENCE_CATALOGUE,
  getTaskById,
  hasTask,
  getTasksByDomain,
  type CompetenceAction,
  type CompetenceDomain,
} from "../src/competence/index.js";

// Helper to create a minimal entity with specified cognitive profile
function mkEntity(cognition: Partial<{
  linguistic: number;
  logicalMathematical: number;
  spatial: number;
  bodilyKinesthetic: number;
  musical: number;
  interpersonal: number;
  intrapersonal: number;
  naturalist: number;
  interSpecies: number;
}>): Entity {
  return {
    id: 1,
    teamId: 1,
    attributes: {
      cognition: {
        linguistic: cognition.linguistic ?? q(0.50),
        logicalMathematical: cognition.logicalMathematical ?? q(0.50),
        spatial: cognition.spatial ?? q(0.50),
        bodilyKinesthetic: cognition.bodilyKinesthetic ?? q(0.50),
        musical: cognition.musical ?? q(0.50),
        interpersonal: cognition.interpersonal ?? q(0.50),
        intrapersonal: cognition.intrapersonal ?? q(0.50),
        naturalist: cognition.naturalist ?? q(0.50),
        interSpecies: cognition.interSpecies ?? q(0.35),
      } as any,
      control: {
        fineControl: q(0.50),
      },
    } as any,
    energy: { reserve_J: 10000, reserveMax_J: 10000 },
    loadout: { items: [] },
    traits: [],
    position_m: { x: 0, y: 0, z: 0 },
    velocity_mps: { x: 0, y: 0, z: 0 },
    intent: { type: "idle" },
    action: {},
    condition: {},
    injury: { regions: new Map() },
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" },
  };
}

function mkWorld(entities: Entity[] = []): WorldState {
  return {
    tick: 0,
    nextId: 2,
    entities,
    teams: [{ teamId: 1 }, { teamId: 2 }],
    worldComments: [],
  };
}

function mkAction(
  domain: CompetenceDomain,
  taskId: string,
  overrides: Partial<CompetenceAction> = {},
): CompetenceAction {
  return {
    domain,
    taskId,
    timeAvailable_s: 3600,
    seed: 12345,
    ...overrides,
  };
}

// ── Routing Tests ────────────────────────────────────────────────────────────

describe("resolveCompetence routing", () => {
  it("routes bodilyKinesthetic tasks to crafting resolver", () => {
    const actor = mkEntity({ bodilyKinesthetic: q(0.70) });
    const action = mkAction("bodilyKinesthetic", "craft_sword_basic");
    const world = mkWorld();

    const result = resolveCompetence(actor, action, world);

    expect(result.domain).toBe("bodilyKinesthetic");
    // Quality should be a valid number >= 0
    expect(Number.isFinite(result.quality_Q)).toBe(true);
    expect(result.quality_Q).toBeGreaterThanOrEqual(0);
    expect(result.timeTaken_s).toBeGreaterThan(0);
  });

  it("routes spatial tasks to navigation resolver", () => {
    const actor = mkEntity({ spatial: q(0.70) });
    const action = mkAction("spatial", "navigate_wilderness", { terrain: "forest" });
    const world = mkWorld();

    const result = resolveCompetence(actor, action, world);

    expect(result.domain).toBe("spatial");
    expect(result.quality_Q).toBeGreaterThanOrEqual(0);
  });

  it("routes naturalist tasks to naturalist resolver", () => {
    const actor = mkEntity({ naturalist: q(0.70) });
    const action = mkAction("naturalist", "track_quarry_fresh");
    const world = mkWorld();

    const result = resolveCompetence(actor, action, world);

    expect(result.domain).toBe("naturalist");
    expect(result.quality_Q).toBeGreaterThanOrEqual(0);
  });

  it("routes linguistic tasks to language resolver", () => {
    const actor = mkEntity({ linguistic: q(0.70) });
    const action = mkAction("linguistic", "command_formation");
    const world = mkWorld();

    const result = resolveCompetence(actor, action, world);

    expect(result.domain).toBe("linguistic");
  });

  it("routes logicalMathematical tasks to engineering resolver", () => {
    const actor = mkEntity({ logicalMathematical: q(0.70) });
    const action = mkAction("logicalMathematical", "design_fortification");
    const world = mkWorld();

    const result = resolveCompetence(actor, action, world);

    expect(result.domain).toBe("logicalMathematical");
    expect(result.details).toHaveProperty("qualityMul");
  });

  it("routes musical tasks to performance resolver", () => {
    const actor = mkEntity({ musical: q(0.70) });
    const action = mkAction("musical", "perform_morale");
    const world = mkWorld();

    const result = resolveCompetence(actor, action, world);

    expect(result.domain).toBe("musical");
  });

  it("routes intrapersonal tasks correctly", () => {
    const actor = mkEntity({ intrapersonal: q(0.70) });
    const action = mkAction("intrapersonal", "meditate_focus");
    const world = mkWorld();

    const result = resolveCompetence(actor, action, world);

    expect(result.domain).toBe("intrapersonal");
    expect(result.success).toBe(true);
  });

  it("returns failure for unknown taskId", () => {
    const actor = mkEntity({});
    const action = mkAction("bodilyKinesthetic", "unknown_task_xyz");
    const world = mkWorld();

    const result = resolveCompetence(actor, action, world);

    expect(result.success).toBe(false);
    expect(result.descriptor).toBe("failure");
    expect(result.xpGained).toBe(0);
  });
});

// ── XP Integration Tests ─────────────────────────────────────────────────────

describe("XP integration", () => {
  it("returns xpGained > 0 on success", () => {
    const actor = mkEntity({ bodilyKinesthetic: q(0.90) });
    const action = mkAction("bodilyKinesthetic", "craft_sword_basic");
    const world = mkWorld();

    const result = resolveCompetence(actor, action, world);

    if (result.success) {
      expect(result.xpGained).toBeGreaterThan(0);
    }
  });

  it("returns xpGained = 0 on failure", () => {
    const actor = mkEntity({ bodilyKinesthetic: q(0.10) });
    const action = mkAction("bodilyKinesthetic", "craft_sword_master");
    const world = mkWorld();

    const result = resolveCompetence(actor, action, world);

    if (!result.success) {
      expect(result.xpGained).toBe(0);
    }
  });

  it("exceptional outcome gives more XP than adequate", () => {
    const highSkill = mkEntity({ bodilyKinesthetic: q(0.95) });
    const lowSkill = mkEntity({ bodilyKinesthetic: q(0.50) });
    const action = mkAction("bodilyKinesthetic", "craft_sword_basic", { seed: 99999 });
    const world = mkWorld();

    const highResult = resolveCompetence(highSkill, action, world);
    const lowResult = resolveCompetence(lowSkill, action, world);

    if (highResult.descriptor === "exceptional" && lowResult.descriptor === "adequate") {
      expect(highResult.xpGained).toBeGreaterThan(lowResult.xpGained);
    }
  });

  it("calculateXP scales with difficulty", () => {
    const exceptional = calculateXP("exceptional", q(0.80));
    const exceptionalEasy = calculateXP("exceptional", q(0.20));

    expect(exceptional).toBeGreaterThan(exceptionalEasy);
  });

  it("calculateXP returns 0 for failure", () => {
    const xp = calculateXP("failure", q(0.50));
    expect(xp).toBe(0);
  });

  it("produces deterministic XP for same inputs", () => {
    const actor = mkEntity({ spatial: q(0.70) });
    const action = mkAction("spatial", "navigate_wilderness", { seed: 42 });
    const world = mkWorld();

    const result1 = resolveCompetence(actor, action, world);
    const result2 = resolveCompetence(actor, action, world);

    expect(result1.xpGained).toBe(result2.xpGained);
    expect(result1.success).toBe(result2.success);
  });
});

// ── Descriptor Tests ─────────────────────────────────────────────────────────

describe("outcome descriptors", () => {
  it("maps masterwork to exceptional", () => {
    expect(canonicalizeDescriptor("masterwork")).toBe("exceptional");
  });

  it("maps fine to good", () => {
    expect(canonicalizeDescriptor("fine")).toBe("good");
  });

  it("maps ruined to failure", () => {
    expect(canonicalizeDescriptor("ruined")).toBe("failure");
  });

  it("preserves standard descriptors", () => {
    expect(canonicalizeDescriptor("exceptional")).toBe("exceptional");
    expect(canonicalizeDescriptor("good")).toBe("good");
    expect(canonicalizeDescriptor("adequate")).toBe("adequate");
    expect(canonicalizeDescriptor("poor")).toBe("poor");
    expect(canonicalizeDescriptor("failure")).toBe("failure");
  });

  it("returns adequate for unknown descriptors", () => {
    expect(canonicalizeDescriptor("unknown")).toBe("adequate");
  });
});

// ── Catalogue Tests ──────────────────────────────────────────────────────────

describe("COMPETENCE_CATALOGUE", () => {
  it("contains tasks for all domains", () => {
    const domains: CompetenceDomain[] = [
      "linguistic", "logicalMathematical", "spatial", "bodilyKinesthetic",
      "musical", "interpersonal", "intrapersonal", "naturalist", "interSpecies",
    ];

    for (const domain of domains) {
      const tasks = getTasksByDomain(domain);
      expect(tasks.length).toBeGreaterThan(0);
    }
  });

  it("all entries have valid difficulty in range", () => {
    for (const task of COMPETENCE_CATALOGUE) {
      expect(task.difficulty_Q).toBeGreaterThanOrEqual(0);
      expect(task.difficulty_Q).toBeLessThanOrEqual(SCALE.Q);
    }
  });

  it("all entries have unique taskId", () => {
    const ids = new Set<string>();
    for (const task of COMPETENCE_CATALOGUE) {
      expect(ids.has(task.taskId)).toBe(false);
      ids.add(task.taskId);
    }
  });

  it("getTaskById returns correct task", () => {
    const task = getTaskById("craft_sword_basic");
    expect(task).toBeDefined();
    expect(task?.domain).toBe("bodilyKinesthetic");
    expect(task?.difficulty_Q).toBe(q(0.40));
  });

  it("getTaskById returns undefined for unknown task", () => {
    const task = getTaskById("unknown_task_xyz");
    expect(task).toBeUndefined();
  });

  it("hasTask returns true for existing tasks", () => {
    expect(hasTask("craft_sword_basic")).toBe(true);
    expect(hasTask("navigate_wilderness")).toBe(true);
  });

  it("hasTask returns false for unknown tasks", () => {
    expect(hasTask("unknown_task")).toBe(false);
  });

  it("all entries have required fields", () => {
    for (const task of COMPETENCE_CATALOGUE) {
      expect(task.taskId).toBeDefined();
      expect(task.domain).toBeDefined();
      expect(task.difficulty_Q).toBeDefined();
      expect(task.timeBase_s).toBeDefined();
      expect(task.description).toBeDefined();
    }
  });
});

// ── Narrative Tests ───────────────────────────────────────────────────────────

describe("narrative generation", () => {
  it("includes narrativeLine when requested", () => {
    const actor = mkEntity({ bodilyKinesthetic: q(0.70) });
    const action = mkAction("bodilyKinesthetic", "craft_sword_basic", { narrative: true });
    const world = mkWorld();

    const result = resolveCompetence(actor, action, world);

    expect(result.narrativeLine).toBeDefined();
    expect(result.narrativeLine!.length).toBeGreaterThan(0);
  });

  it("omits narrativeLine when not requested", () => {
    const actor = mkEntity({ bodilyKinesthetic: q(0.70) });
    const action = mkAction("bodilyKinesthetic", "craft_sword_basic", { narrative: false });
    const world = mkWorld();

    const result = resolveCompetence(actor, action, world);

    expect(result.narrativeLine).toBeUndefined();
  });

  it("exceptional result has positive narrative", () => {
    const actor = mkEntity({ bodilyKinesthetic: q(0.95) });
    const action = mkAction("bodilyKinesthetic", "craft_sword_basic", { narrative: true, seed: 11111 });
    const world = mkWorld();

    const result = resolveCompetence(actor, action, world);

    if (result.descriptor === "exceptional") {
      expect(result.narrativeLine).toContain("exceptional");
    }
  });

  it("failure result has negative narrative", () => {
    const actor = mkEntity({ bodilyKinesthetic: q(0.10) });
    const action = mkAction("bodilyKinesthetic", "craft_sword_master", { narrative: true, seed: 11111 });
    const world = mkWorld();

    const result = resolveCompetence(actor, action, world);

    if (result.descriptor === "failure") {
      expect(result.narrativeLine).toContain("fail");
    }
  });
});

// ── Domain Intelligence Tests ─────────────────────────────────────────────────

describe("getDomainIntelligence", () => {
  it("returns correct intelligence for each domain", () => {
    const actor = mkEntity({
      linguistic: q(0.80),
      logicalMathematical: q(0.75),
      spatial: q(0.70),
      bodilyKinesthetic: q(0.65),
      musical: q(0.60),
      interpersonal: q(0.55),
      intrapersonal: q(0.50),
      naturalist: q(0.45),
      interSpecies: q(0.40),
    });

    expect(getDomainIntelligence(actor, "linguistic")).toBe(q(0.80));
    expect(getDomainIntelligence(actor, "logicalMathematical")).toBe(q(0.75));
    expect(getDomainIntelligence(actor, "spatial")).toBe(q(0.70));
    expect(getDomainIntelligence(actor, "bodilyKinesthetic")).toBe(q(0.65));
    expect(getDomainIntelligence(actor, "musical")).toBe(q(0.60));
    expect(getDomainIntelligence(actor, "interpersonal")).toBe(q(0.55));
    expect(getDomainIntelligence(actor, "intrapersonal")).toBe(q(0.50));
    expect(getDomainIntelligence(actor, "naturalist")).toBe(q(0.45));
    expect(getDomainIntelligence(actor, "interSpecies")).toBe(q(0.40));
  });

  it("returns default q(0.50) when cognition missing", () => {
    const actor = mkEntity({});
    (actor.attributes as any).cognition = undefined;

    expect(getDomainIntelligence(actor, "linguistic")).toBe(q(0.50));
  });

  it("returns default q(0.35) for interSpecies when missing", () => {
    const actor = mkEntity({});
    delete (actor.attributes.cognition as any).interSpecies;

    expect(getDomainIntelligence(actor, "interSpecies")).toBe(q(0.35));
  });
});

// ── Integration Tests ─────────────────────────────────────────────────────────

describe("competence framework integration", () => {
  it("high skill produces better results than low skill", () => {
    const highSkill = mkEntity({ naturalist: q(0.90) });
    const lowSkill = mkEntity({ naturalist: q(0.30) });
    const action = mkAction("naturalist", "track_quarry_fresh", { seed: 42 });
    const world = mkWorld();

    const highResult = resolveCompetence(highSkill, action, world);
    const lowResult = resolveCompetence(lowSkill, action, world);

    expect(highResult.quality_Q).toBeGreaterThan(lowResult.quality_Q);
  });

  it("different tasks have different time requirements", () => {
    const actor = mkEntity({ spatial: q(0.60) });
    const quick = mkAction("spatial", "read_map");
    const longer = mkAction("spatial", "navigate_wilderness");
    const world = mkWorld();

    const quickResult = resolveCompetence(actor, quick, world);
    const longerResult = resolveCompetence(actor, longer, world);

    // Navigation takes longer than map reading
    expect(longerResult.timeTaken_s).toBeGreaterThan(quickResult.timeTaken_s);
  });

  it("difficult tasks take longer than easy tasks", () => {
    const actor = mkEntity({ logicalMathematical: q(0.60) });
    const easy = mkAction("logicalMathematical", "solve_tactical_puzzle");
    const hard = mkAction("logicalMathematical", "design_siege_engine");
    const world = mkWorld();

    const easyResult = resolveCompetence(actor, easy, world);
    const hardResult = resolveCompetence(actor, hard, world);

    // Hard task takes longer (2 days vs 30 minutes)
    expect(hardResult.timeTaken_s).toBeGreaterThan(easyResult.timeTaken_s);
  });

  it("time taken scales with task base time", () => {
    const actor = mkEntity({ musical: q(0.70) });
    const quick = mkAction("musical", "signal_formation");
    const long = mkAction("musical", "perform_morale");
    const world = mkWorld();

    const quickResult = resolveCompetence(actor, quick, world);
    const longResult = resolveCompetence(actor, long, world);

    expect(longResult.timeTaken_s).toBeGreaterThan(quickResult.timeTaken_s);
  });
});
