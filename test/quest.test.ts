// test/quest.test.ts — Phase 41: Quest & Mission System tests

import { describe, it, expect } from "vitest";
import { q } from "../src/units.js";
import type { ImpactEvent } from "../src/sim/events.js";
import type { Quest, QuestObjective, QuestContext, QuestTemplate } from "../src/quest.js";
import {
  createQuestRegistry,
  getQuestLog,
  registerQuestTemplate,
  offerQuest,
  abandonQuest,
  getActiveQuests,
  getQuestProgress,
  checkObjectiveComplete,
  checkQuestComplete,
  checkQuestFailed,
  unlockObjectives,
  handleLocationReached,
  handleEntityDefeated,
  handleCompetenceUsed,
  handleItemCollected,
  handleDialogueChoice,
  processTimeBasedObjectives,
  serializeQuestRegistry,
  deserializeQuestRegistry,
} from "../src/quest.js";
import {
  QUEST_TEMPLATES,
  selectTemplate,
  generateQuest,
  generateQuests,
  addBonusObjective,
  buildQuestContext,
} from "../src/quest-generators.js";

// ── Test Helpers ───────────────────────────────────────────────────────────────

function mkSampleQuest(id: string = "test_quest", overrides: Partial<Quest> = {}): Quest {
  return {
    questId: id,
    title: "Test Quest",
    description: "A quest for testing",
    objectives: [],
    state: "inactive",
    priority: 10,
    ...overrides,
  };
}

function mkSampleObjective(id: string, type: QuestObjective["type"], overrides: Partial<QuestObjective> = {}): QuestObjective {
  return {
    objectiveId: id,
    description: "Test objective",
    type,
    progress: 0,
    state: "available",
    hidden: false,
    ...overrides,
  };
}

function mkImpactEvent(attackerId: number, targetId: number): ImpactEvent {
  return {
    kind: "impact",
    attackerId,
    targetId,
    region: "torso",
    energy_J: 100,
    protectedByArmour: false,
    blocked: false,
    parried: false,
    weaponId: "sword",
    wpn: {} as any,
    hitQuality: q(0.5),
    shieldBlocked: false,
  };
}

// ── Registry Tests ─────────────────────────────────────────────────────────────

describe("Quest Registry", () => {
  it("creates empty registry", () => {
    const registry = createQuestRegistry();

    expect(registry.templates.size).toBe(0);
    expect(registry.logs.size).toBe(0);
    expect(registry.history).toEqual([]);
  });

  it("registers quest templates", () => {
    const registry = createQuestRegistry();
    const quest = mkSampleQuest("template_1");

    registerQuestTemplate(registry, quest);

    expect(registry.templates.has("template_1")).toBe(true);
    expect(registry.templates.get("template_1")?.title).toBe("Test Quest");
  });

  it("creates quest logs on demand", () => {
    const registry = createQuestRegistry();
    const log = getQuestLog(registry, 42);

    expect(log.entityId).toBe(42);
    expect(log.active.size).toBe(0);
    expect(log.completed.size).toBe(0);
    expect(log.failed.size).toBe(0);
  });

  it("reuses existing quest logs", () => {
    const registry = createQuestRegistry();
    const log1 = getQuestLog(registry, 1);
    const log2 = getQuestLog(registry, 1);

    expect(log1).toBe(log2);
  });
});

// ── Quest Lifecycle Tests ──────────────────────────────────────────────────────

describe("Quest Lifecycle", () => {
  it("offers quest to entity", () => {
    const registry = createQuestRegistry();
    const template = mkSampleQuest("offer_test", {
      objectives: [mkSampleObjective("obj1", "reach_location")],
    });
    registerQuestTemplate(registry, template);

    const result = offerQuest(registry, 1, "offer_test", 100);

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.quest.state).toBe("active");
      expect(result.quest.acceptedAtTick).toBe(100);
    }
  });

  it("rejects duplicate quest offers", () => {
    const registry = createQuestRegistry();
    const template = mkSampleQuest("duplicate_test");
    registerQuestTemplate(registry, template);

    offerQuest(registry, 1, "duplicate_test", 100);
    const result = offerQuest(registry, 1, "duplicate_test", 200);

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toContain("already");
    }
  });

  it("rejects unknown quest templates", () => {
    const registry = createQuestRegistry();

    const result = offerQuest(registry, 1, "nonexistent", 100);

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toContain("Unknown");
    }
  });

  it("abandons active quest", () => {
    const registry = createQuestRegistry();
    const template = mkSampleQuest("abandon_test", {
      objectives: [mkSampleObjective("obj1", "reach_location")],
    });
    registerQuestTemplate(registry, template);
    offerQuest(registry, 1, "abandon_test", 100);

    const success = abandonQuest(registry, 1, "abandon_test", 200);

    expect(success).toBe(true);
    const log = getQuestLog(registry, 1);
    expect(log.active.has("abandon_test")).toBe(false);
    expect(log.failed.has("abandon_test")).toBe(true);
  });

  it("returns false when abandoning non-existent quest", () => {
    const registry = createQuestRegistry();

    const success = abandonQuest(registry, 1, "nonexistent", 100);

    expect(success).toBe(false);
  });

  it("initializes objectives without prerequisites as available", () => {
    const registry = createQuestRegistry();
    const template = mkSampleQuest("prereq_test", {
      objectives: [
        mkSampleObjective("first", "reach_location"),
        mkSampleObjective("second", "collect_item", { requires: ["first"], state: "locked" }),
      ],
    });
    registerQuestTemplate(registry, template);

    const result = offerQuest(registry, 1, "prereq_test", 100);

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      const first = result.quest.objectives.find((o) => o.objectiveId === "first");
      const second = result.quest.objectives.find((o) => o.objectiveId === "second");
      expect(first?.state).toBe("available");
      expect(second?.state).toBe("locked");
    }
  });
});

// ── Objective Completion Tests ─────────────────────────────────────────────────

describe("Objective Completion Logic", () => {
  it("checks boolean completion for reach_location", () => {
    const obj = mkSampleObjective("loc", "reach_location", { state: "completed" });
    expect(checkObjectiveComplete(obj)).toBe(true);
  });

  it("checks count-based completion for defeat_entity", () => {
    const obj = mkSampleObjective("defeat", "defeat_entity", {
      count: 3,
      progress: 3,
      state: "in_progress",
    });
    expect(checkObjectiveComplete(obj)).toBe(true);
  });

  it("returns false for incomplete count objectives", () => {
    const obj = mkSampleObjective("defeat", "defeat_entity", {
      count: 5,
      progress: 2,
      state: "in_progress",
    });
    expect(checkObjectiveComplete(obj)).toBe(false);
  });

  it("returns true for already-completed objectives", () => {
    const obj = mkSampleObjective("done", "collect_item", { state: "completed" });
    expect(checkObjectiveComplete(obj)).toBe(true);
  });
});

// ── Quest Completion Tests ─────────────────────────────────────────────────────

describe("Quest Completion", () => {
  it("detects quest completion when all objectives done", () => {
    const quest = mkSampleQuest("complete_test", {
      objectives: [
        mkSampleObjective("obj1", "reach_location", { state: "completed" }),
        mkSampleObjective("obj2", "collect_item", { state: "completed" }),
      ],
    });

    expect(checkQuestComplete(quest)).toBe(true);
  });

  it("returns false when some objectives incomplete", () => {
    const quest = mkSampleQuest("incomplete_test", {
      objectives: [
        mkSampleObjective("obj1", "reach_location", { state: "completed" }),
        mkSampleObjective("obj2", "collect_item", { state: "in_progress" }),
      ],
    });

    expect(checkQuestComplete(quest)).toBe(false);
  });

  it("ignores hidden objectives for completion check", () => {
    const quest = mkSampleQuest("hidden_test", {
      objectives: [
        mkSampleObjective("main", "reach_location", { state: "completed" }),
        mkSampleObjective("bonus", "wait_duration", { state: "available", hidden: true }),
      ],
    });

    expect(checkQuestComplete(quest)).toBe(true);
  });

  it("detects quest failure when any required objective fails", () => {
    const quest = mkSampleQuest("fail_test", {
      objectives: [
        mkSampleObjective("main", "reach_location", { state: "completed" }),
        mkSampleObjective("critical", "escort_entity", { state: "failed", hidden: false }),
      ],
    });

    expect(checkQuestFailed(quest)).toBe(true);
  });
});

// ── Objective Unlocking Tests ──────────────────────────────────────────────────

describe("Objective Unlocking", () => {
  it("unlocks objectives when prerequisites complete", () => {
    const quest = mkSampleQuest("unlock_test", {
      objectives: [
        mkSampleObjective("first", "reach_location", { state: "completed" }),
        mkSampleObjective("second", "collect_item", { requires: ["first"], state: "locked" }),
      ],
    });

    const unlocked = unlockObjectives(quest, 100);

    expect(unlocked.length).toBe(1);
    expect(unlocked[0].objectiveId).toBe("second");
    expect(unlocked[0].state).toBe("available");
    expect(unlocked[0].activatedAtTick).toBe(100);
  });

  it("does not unlock when prerequisites incomplete", () => {
    const quest = mkSampleQuest("locked_test", {
      objectives: [
        mkSampleObjective("first", "reach_location", { state: "in_progress" }),
        mkSampleObjective("second", "collect_item", { requires: ["first"], state: "locked" }),
      ],
    });

    const unlocked = unlockObjectives(quest, 100);

    expect(unlocked.length).toBe(0);
  });

  it("handles multiple prerequisites", () => {
    const quest = mkSampleQuest("multi_prereq", {
      objectives: [
        mkSampleObjective("a", "reach_location", { state: "completed" }),
        mkSampleObjective("b", "collect_item", { state: "completed" }),
        mkSampleObjective("c", "defeat_entity", { requires: ["a", "b"], state: "locked" }),
      ],
    });

    const unlocked = unlockObjectives(quest, 100);

    expect(unlocked.length).toBe(1);
    expect(unlocked[0].objectiveId).toBe("c");
  });
});

// ── Location Event Handler Tests ───────────────────────────────────────────────

describe("Location Event Handler", () => {
  it("complies reach_location objective when in range", () => {
    const quest = mkSampleQuest("loc_quest", {
      objectives: [
        mkSampleObjective("goto", "reach_location", {
          target: { location: { x: 100, y: 100, radius_m: 10 } },
        }),
      ],
    });

    const result = handleLocationReached(quest, 1, { x: 105, y: 102 }, 100);

    expect(result.updated).toBe(true);
    expect(result.questComplete).toBe(true);
  });

  it("does not comply when out of range", () => {
    const quest = mkSampleQuest("loc_far", {
      objectives: [
        mkSampleObjective("goto", "reach_location", {
          target: { location: { x: 1000, y: 1000, radius_m: 5 } },
        }),
      ],
    });

    const result = handleLocationReached(quest, 1, { x: 0, y: 0 }, 100);

    expect(result.updated).toBe(false);
  });

  it("ignores non-location objectives", () => {
    const quest = mkSampleQuest("other_obj", {
      objectives: [mkSampleObjective("kill", "defeat_entity")],
    });

    const result = handleLocationReached(quest, 1, { x: 0, y: 0 }, 100);

    expect(result.updated).toBe(false);
  });
});

// ── Combat Event Handler Tests ─────────────────────────────────────────────────

describe("Combat Event Handler", () => {
  it("tracks defeat_entity progress", () => {
    const quest = mkSampleQuest("defeat_quest", {
      objectives: [
        mkSampleObjective("kill", "defeat_entity", {
          target: { entityId: 99 },
          count: 1,
        }),
      ],
    });

    const impact = mkImpactEvent(1, 99);
    const result = handleEntityDefeated(quest, impact, 100);

    expect(result.updated).toBe(true);
    expect(result.newState).toBe("completed");
    expect(result.questComplete).toBe(true);
  });

  it("ignores defeats of wrong entity", () => {
    const quest = mkSampleQuest("wrong_target", {
      objectives: [
        mkSampleObjective("kill", "defeat_entity", {
          target: { entityId: 99 },
          count: 1,
        }),
      ],
    });

    const impact = mkImpactEvent(1, 88); // Different target
    const result = handleEntityDefeated(quest, impact, 100);

    expect(result.updated).toBe(false);
  });

  it("accumulates progress for multi-defeat objectives", () => {
    const quest = mkSampleQuest("multi_defeat", {
      objectives: [
        mkSampleObjective("kill_5", "defeat_entity", {
          target: { entityId: 50 },
          count: 5,
          progress: 0,
        }),
      ],
    });

    const impact = mkImpactEvent(1, 50);
    const result1 = handleEntityDefeated(quest, impact, 100);

    expect(result1.updated).toBe(true);
    expect(result1.newState).toBe("in_progress");
    expect(result1.questComplete).toBeUndefined();
  });
});

// ── Competence Event Handler Tests ──────────────────────────────────────────────

describe("Competence Event Handler", () => {
  it("complies use_competence objective when domain matches", () => {
    const quest = mkSampleQuest("craft_quest", {
      objectives: [
        mkSampleObjective("craft", "use_competence", {
          target: {
            competence: { domain: "bodilyKinesthetic", minQuality_Q: q(0.5) },
          },
        }),
      ],
    });

    const result = handleCompetenceUsed(quest, "bodilyKinesthetic", q(0.7), undefined, 100);

    expect(result.updated).toBe(true);
    expect(result.newState).toBe("completed");
  });

  it("requires minimum quality for competence objectives", () => {
    const quest = mkSampleQuest("quality_quest", {
      objectives: [
        mkSampleObjective("craft", "use_competence", {
          target: {
            competence: { domain: "bodilyKinesthetic", minQuality_Q: q(0.8) },
          },
        }),
      ],
    });

    const result = handleCompetenceUsed(quest, "bodilyKinesthetic", q(0.5), undefined, 100);

    expect(result.updated).toBe(false);
  });

  it("matches specific task ID when required", () => {
    const quest = mkSampleQuest("specific_task", {
      objectives: [
        mkSampleObjective("craft_sword", "use_competence", {
          target: {
            competence: { domain: "bodilyKinesthetic", minQuality_Q: q(0.5), taskId: "craft_sword" },
          },
        }),
      ],
    });

    const result = handleCompetenceUsed(quest, "bodilyKinesthetic", q(0.7), "craft_sword", 100);

    expect(result.updated).toBe(true);
  });

  it("rejects wrong task ID", () => {
    const quest = mkSampleQuest("wrong_task", {
      objectives: [
        mkSampleObjective("craft_sword", "use_competence", {
          target: {
            competence: { domain: "bodilyKinesthetic", minQuality_Q: q(0.5), taskId: "craft_sword" },
          },
        }),
      ],
    });

    const result = handleCompetenceUsed(quest, "bodilyKinesthetic", q(0.7), "craft_armor", 100);

    expect(result.updated).toBe(false);
  });
});

// ── Item Collection Handler Tests ──────────────────────────────────────────────

describe("Item Collection Handler", () => {
  it("tracks item collection progress", () => {
    const quest = mkSampleQuest("collect_quest", {
      objectives: [
        mkSampleObjective("gather", "collect_item", {
          target: { itemId: "herb" },
          count: 5,
          progress: 0,
        }),
      ],
    });

    const result = handleItemCollected(quest, "herb", 3, 100);

    expect(result.updated).toBe(true);
    expect(result.newState).toBe("in_progress");
  });

  it("complies objective when count reached", () => {
    const quest = mkSampleQuest("collect_complete", {
      objectives: [
        mkSampleObjective("gather", "collect_item", {
          target: { itemId: "herb" },
          count: 3,
          progress: 2,
        }),
      ],
    });

    const result = handleItemCollected(quest, "herb", 1, 100);

    expect(result.updated).toBe(true);
    expect(result.newState).toBe("completed");
    expect(result.questComplete).toBe(true);
  });

  it("ignores wrong item type", () => {
    const quest = mkSampleQuest("wrong_item", {
      objectives: [
        mkSampleObjective("gather", "collect_item", {
          target: { itemId: "herb" },
          count: 5,
        }),
      ],
    });

    const result = handleItemCollected(quest, "ore", 5, 100);

    expect(result.updated).toBe(false);
  });
});

// ── Dialogue Choice Handler Tests ──────────────────────────────────────────────

describe("Dialogue Choice Handler", () => {
  it("complies dialogue_choice objective", () => {
    const quest = mkSampleQuest("dialogue_quest", {
      objectives: [
        mkSampleObjective("choose", "dialogue_choice", {
          target: { dialogueChoice: "accept_deal" },
        }),
      ],
    });

    const result = handleDialogueChoice(quest, "accept_deal", 100);

    expect(result.updated).toBe(true);
    expect(result.newState).toBe("completed");
  });

  it("requires exact choice match", () => {
    const quest = mkSampleQuest("wrong_choice", {
      objectives: [
        mkSampleObjective("choose", "dialogue_choice", {
          target: { dialogueChoice: "accept_deal" },
        }),
      ],
    });

    const result = handleDialogueChoice(quest, "reject_deal", 100);

    expect(result.updated).toBe(false);
  });
});

// ── Time-based Objective Tests ─────────────────────────────────────────────────

describe("Time-based Objectives", () => {
  it("fails quest on overall timeout", () => {
    const quest = mkSampleQuest("timed_quest", {
      acceptedAtTick: 0,
      timeLimit_s: 100,
      state: "active",
      objectives: [mkSampleObjective("do", "reach_location")],
    });

    const results = processTimeBasedObjectives(quest, 1000, 10); // 100s elapsed at 10Hz

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].questFailed).toBe(true);
    expect(quest.state).toBe("failed");
  });

  it("complies wait_duration objective when time elapsed", () => {
    const quest = mkSampleQuest("wait_quest", {
      objectives: [
        mkSampleObjective("wait", "wait_duration", {
          count: 60, // 60 seconds
          activatedAtTick: 0,
        }),
      ],
    });

    const results = processTimeBasedObjectives(quest, 600, 10); // 60s elapsed at 10Hz

    expect(results.length).toBe(1);
    expect(results[0].newState).toBe("completed");
  });

  it("does not comply wait_duration early", () => {
    const quest = mkSampleQuest("early_wait", {
      objectives: [
        mkSampleObjective("wait", "wait_duration", {
          count: 100,
          activatedAtTick: 0,
        }),
      ],
    });

    const results = processTimeBasedObjectives(quest, 500, 10); // 50s elapsed

    expect(results.length).toBe(0);
  });

  it("fails objective on individual timeout", () => {
    const quest = mkSampleQuest("obj_timeout", {
      acceptedAtTick: 0,
      objectives: [
        mkSampleObjective("timed", "reach_location", {
          timeLimit_s: 50,
          activatedAtTick: 0,
        }),
      ],
    });

    const results = processTimeBasedObjectives(quest, 600, 10); // 60s elapsed

    expect(results.length).toBe(1);
    expect(results[0].newState).toBe("failed");
  });
});

// ── Progress Utility Tests ─────────────────────────────────────────────────────

describe("Progress Utilities", () => {
  it("calculates quest progress percentage", () => {
    const quest = mkSampleQuest("progress_quest", {
      objectives: [
        mkSampleObjective("a", "reach_location", { state: "completed" }),
        mkSampleObjective("b", "collect_item", { state: "completed" }),
        mkSampleObjective("c", "defeat_entity", { state: "in_progress" }),
        mkSampleObjective("d", "dialogue_choice", { state: "available" }),
      ],
    });

    const progress = getQuestProgress(quest);

    expect(progress.total).toBe(4);
    expect(progress.completed).toBe(2);
    expect(progress.percentage).toBe(50);
  });

  it("ignores hidden objectives in progress", () => {
    const quest = mkSampleQuest("hidden_progress", {
      objectives: [
        mkSampleObjective("main", "reach_location", { state: "completed" }),
        mkSampleObjective("bonus", "wait_duration", { state: "available", hidden: true }),
      ],
    });

    const progress = getQuestProgress(quest);

    expect(progress.total).toBe(1);
    expect(progress.percentage).toBe(100);
  });

  it("returns zero for empty quests", () => {
    const quest = mkSampleQuest("empty_quest", { objectives: [] });

    const progress = getQuestProgress(quest);

    expect(progress.total).toBe(0);
    expect(progress.percentage).toBe(0);
  });
});

// ── Serialization Tests ────────────────────────────────────────────────────────

describe("Serialization", () => {
  it("serializes and deserializes registry", () => {
    const registry = createQuestRegistry();
    const template = mkSampleQuest("serial_test", {
      objectives: [mkSampleObjective("obj", "reach_location")],
    });
    registerQuestTemplate(registry, template);
    offerQuest(registry, 1, "serial_test", 100);

    const serialized = serializeQuestRegistry(registry);
    const restored = deserializeQuestRegistry(serialized);

    expect(restored.templates.has("serial_test")).toBe(true);
    expect(restored.logs.has(1)).toBe(true);

    const log = restored.logs.get(1)!;
    expect(log.active.has("serial_test")).toBe(true);
  });

  it("handles empty registry deserialization", () => {
    const restored = deserializeQuestRegistry({});

    expect(restored.templates.size).toBe(0);
    expect(restored.logs.size).toBe(0);
  });

  it("handles null/invalid data in deserialization", () => {
    const restored = deserializeQuestRegistry(null);

    expect(restored.templates.size).toBe(0);
  });
});

// ── Quest Generator Tests ──────────────────────────────────────────────────────

describe("Quest Template Selection", () => {
  it("selects template based on tier and faction", () => {
    const ctx: QuestContext = {
      settlementTier: 2,
      factionStanding: 50,
      availableCompetences: ["bodilyKinesthetic"],
      seed: 12345,
    };

    const template = selectTemplate(ctx);

    expect(template).not.toBeNull();
    expect(template!.minTier).toBeLessThanOrEqual(ctx.settlementTier);
    expect(template!.maxTier).toBeGreaterThanOrEqual(ctx.settlementTier);
  });

  it("returns null when no eligible templates", () => {
    const ctx: QuestContext = {
      settlementTier: 10, // Above all template max tiers
      factionStanding: 50,
      availableCompetences: [],
      seed: 12345,
    };

    const template = selectTemplate(ctx);

    expect(template).toBeNull();
  });

  it("filters by faction standing", () => {
    const ctx: QuestContext = {
      settlementTier: 3,
      factionStanding: -100, // Too low for most templates
      availableCompetences: [],
      seed: 12345,
    };

    const template = selectTemplate(ctx);

    // Should only get templates accepting negative standing
    if (template) {
      expect(template.factionRange?.[0]).toBeLessThanOrEqual(ctx.factionStanding);
    }
  });
});

describe("Quest Generation", () => {
  it("generates quest from template", () => {
    const template = QUEST_TEMPLATES.find((t) => t.templateId === "bounty")!;
    const ctx: QuestContext = {
      settlementTier: 2,
      factionStanding: 50,
      targetEntityId: 99,
      availableCompetences: ["bodilyKinesthetic"],
      seed: 12345,
    };

    const quest = generateQuest(ctx, template);

    expect(quest.questId).toContain("bounty");
    expect(quest.objectives.length).toBeGreaterThan(0);
    expect(quest.state).toBe("inactive");
  });

  it("fills template strings", () => {
    const template = QUEST_TEMPLATES.find((t) => t.templateId === "delivery")!;
    const ctx: QuestContext = {
      settlementTier: 2,
      factionStanding: 50,
      targetLocation: { x: 500, y: 600 },
      availableCompetences: [],
      seed: 12345,
    };

    const quest = generateQuest(ctx, template);

    expect(quest.title).toBe("Special Delivery");
    expect(quest.description).toContain("500");
    expect(quest.description).toContain("600");
  });

  it("scales rewards by tier and standing", () => {
    const template = QUEST_TEMPLATES.find((t) => t.templateId === "bounty")!;

    const lowCtx: QuestContext = {
      settlementTier: 1,
      factionStanding: 0,
      availableCompetences: [],
      seed: 1,
    };

    const highCtx: QuestContext = {
      settlementTier: 4,
      factionStanding: 100,
      availableCompetences: [],
      seed: 1,
    };

    const lowQuest = generateQuest(lowCtx, template);
    const highQuest = generateQuest(highCtx, template);

    expect(highQuest.rewards!.xp).toBeGreaterThan(lowQuest.rewards!.xp!);
    expect(highQuest.rewards!.currency).toBeGreaterThan(lowQuest.rewards!.currency!);
  });

  it("generates multiple quests without repetition", () => {
    const ctx: QuestContext = {
      settlementTier: 3,
      factionStanding: 50,
      availableCompetences: ["bodilyKinesthetic", "spatial"],
      seed: 12345,
    };

    const quests = generateQuests(ctx, 3);

    expect(quests.length).toBe(3);
    const ids = quests.map((q) => q.questId);
    expect(new Set(ids).size).toBe(3); // All unique
  });
});

describe("Bonus Objectives", () => {
  it("adds time_limit bonus objective", () => {
    const quest = mkSampleQuest("bonus_test", { objectives: [] });

    addBonusObjective(quest, "time_limit", { xp: 25, currency: 50 });

    const bonus = quest.objectives.find((o) => o.objectiveId === "bonus_speed");
    expect(bonus).toBeDefined();
    expect(bonus?.hidden).toBe(true);
    expect(bonus?.type).toBe("wait_duration");
  });

  it("adds stealth bonus objective", () => {
    const quest = mkSampleQuest("stealth_test", { objectives: [] });

    addBonusObjective(quest, "stealth", { xp: 50 });

    const bonus = quest.objectives.find((o) => o.objectiveId === "bonus_stealth");
    expect(bonus).toBeDefined();
    expect(bonus?.type).toBe("dialogue_choice");
  });

  it("adds reward bonus to quest", () => {
    const quest = mkSampleQuest("reward_test", {
      objectives: [],
      rewards: { xp: 100 },
    });

    addBonusObjective(quest, "no_harm", { xp: 50, currency: 100 });

    expect(quest.rewards!.xp).toBe(150);
    expect(quest.rewards!.currency).toBe(100);
  });
});

describe("Context Builder", () => {
  it("builds context from world state", () => {
    const worldCtx = {
      giverId: 5,
      settlementTier: 3,
      factionId: "faction1",
      factionStanding: 75,
      nearbyEntities: [10, 20, 30],
      pointsOfInterest: [{ x: 100, y: 200, type: "ruins" }],
      seed: 42,
    };

    const ctx = buildQuestContext(worldCtx);

    expect(ctx.giverId).toBe(5);
    expect(ctx.settlementTier).toBe(3);
    expect(ctx.factionStanding).toBe(75);
    expect(ctx.targetEntityId).toBeDefined();
    expect(ctx.targetLocation).toBeDefined();
  });

  it("handles empty entity/poi lists", () => {
    const worldCtx = {
      settlementTier: 2,
      factionStanding: 50,
      nearbyEntities: [],
      pointsOfInterest: [],
      seed: 1,
    };

    const ctx = buildQuestContext(worldCtx);

    expect(ctx.targetEntityId).toBeUndefined();
    expect(ctx.targetLocation).toBeUndefined();
  });
});

// ── Integration Tests ───────────────────────────────────────────────────────────

describe("Quest System Integration", () => {
  it("full quest lifecycle: accept, progress, complete", () => {
    const registry = createQuestRegistry();
    const template = mkSampleQuest("integration_quest", {
      objectives: [
        mkSampleObjective("travel", "reach_location", {
          target: { location: { x: 50, y: 50, radius_m: 10 } },
        }),
        mkSampleObjective("craft", "use_competence", {
          target: { competence: { domain: "bodilyKinesthetic", minQuality_Q: q(0.5) } },
          requires: ["travel"],
          state: "locked",
        }),
      ],
    });

    registerQuestTemplate(registry, template);

    // Accept quest
    const offer = offerQuest(registry, 1, "integration_quest", 0);
    expect(offer.accepted).toBe(true);

    let quest = (offer as { accepted: true; quest: Quest }).quest;

    // Complete first objective
    const locResult = handleLocationReached(quest, 1, { x: 55, y: 52 }, 100);
    expect(locResult.updated).toBe(true);
    expect(locResult.questComplete).toBe(false);

    // Second objective should now be available
    const craftObj = quest.objectives.find((o) => o.objectiveId === "craft");
    expect(craftObj?.state).toBe("available");

    // Complete second objective
    const craftResult = handleCompetenceUsed(quest, "bodilyKinesthetic", q(0.7), undefined, 200);
    expect(craftResult.updated).toBe(true);
    expect(craftResult.questComplete).toBe(true);

    // Quest should be marked complete
    expect(quest.state).toBe("completed");
  });

  it("tracks quest in entity log through states", () => {
    const registry = createQuestRegistry();
    const template = mkSampleQuest("state_tracking", {
      objectives: [mkSampleObjective("simple", "reach_location")],
    });

    registerQuestTemplate(registry, template);

    // Offer and accept
    offerQuest(registry, 1, "state_tracking", 100);
    let log = getQuestLog(registry, 1);
    expect(log.active.has("state_tracking")).toBe(true);

    // Abandon
    abandonQuest(registry, 1, "state_tracking", 200);
    log = getQuestLog(registry, 1);
    expect(log.active.has("state_tracking")).toBe(false);
    expect(log.failed.has("state_tracking")).toBe(true);
  });

  it("generates and tracks history events", () => {
    const registry = createQuestRegistry();
    const template = mkSampleQuest("history_test", {
      objectives: [
        mkSampleObjective("loc", "reach_location", {
          target: { location: { x: 0, y: 0, radius_m: 5 } },
        }),
      ],
    });

    registerQuestTemplate(registry, template);
    offerQuest(registry, 1, "history_test", 100);

    const log = getQuestLog(registry, 1);
    const quest = log.active.get("history_test")!;

    // Trigger an event
    handleLocationReached(quest, 1, { x: 3, y: 3 }, 200);

    expect(registry.history.length).toBeGreaterThanOrEqual(1);
    expect(registry.history[0].questId).toBe("history_test");
  });
});
