// src/quest.ts — Phase 41: Quest & Mission System
//
// Structured quest system with objectives, state tracking, and simulation event hooks.
// Integrates with Phase 40 (Competence), Phase 24 (Factions), Phase 23 (Dialogue).

import type { Q } from "./units.js";
import type { CompetenceDomain } from "./competence/catalogue.js";
import type { ImpactEvent } from "./sim/events.js";

// ── Core Types ────────────────────────────────────────────────────────────────

/** State of a quest in its lifecycle. */
export type QuestState = "inactive" | "active" | "completed" | "failed";

/** State of an individual objective. */
export type ObjectiveState = "locked" | "available" | "in_progress" | "completed" | "failed";

/** Types of quest objectives supported. */
export type QuestObjectiveType =
  | "reach_location"
  | "defeat_entity"
  | "collect_item"
  | "use_competence"
  | "deliver_item"
  | "escort_entity"
  | "dialogue_choice"
  | "wait_duration";

/** Location target for objectives. */
export interface LocationTarget {
  x: number;
  y: number;
  radius_m: number;
}

/** Target specification for objectives. */
export interface QuestTarget {
  entityId?: number;
  location?: LocationTarget;
  itemId?: string;
  competence?: {
    domain: CompetenceDomain;
    minQuality_Q: Q;
    taskId?: string;
  };
  dialogueChoice?: string;
}

/** A single objective within a quest. */
export interface QuestObjective {
  objectiveId: string;
  description: string;
  type: QuestObjectiveType;
  target?: QuestTarget;
  count?: number;
  progress: number;
  state: ObjectiveState;
  hidden: boolean;
  /** Prerequisites: which objectives must be completed before this unlocks. */
  requires?: string[];
  /** Time limit in seconds (undefined = no limit). */
  timeLimit_s?: number;
  /** Tick when objective became available (for time limits). */
  activatedAtTick?: number;
}

/** A quest with multiple objectives forming a directed graph. */
export interface Quest {
  questId: string;
  title: string;
  description: string;
  giverId?: number;
  objectives: QuestObjective[];
  state: QuestState;
  priority: number;
  /** Faction reputation requirements to receive this quest. */
  factionRequirements?: Record<string, number>;
  /** Rewards granted on completion. */
  rewards?: QuestRewards;
  /** Tick when quest was accepted. */
  acceptedAtTick?: number;
  /** Overall time limit in seconds. */
  timeLimit_s?: number;
}

/** Rewards for quest completion. */
export interface QuestRewards {
  /** Reputation change per faction. */
  reputation?: Record<string, number>;
  /** Items granted. */
  items?: { itemId: string; quantity: number }[];
  /** Experience points (Phase 21). */
  xp?: number;
  /** Currency/economy units (Phase 25). */
  currency?: number;
}

/** Event fired when a quest or objective state changes. */
export interface QuestUpdateEvent {
  questId: string;
  objectiveId?: string;
  oldState: QuestState | ObjectiveState;
  newState: QuestState | ObjectiveState;
  trigger: QuestTrigger;
  tick: number;
}

/** What triggered the quest update. */
export type QuestTrigger =
  | { type: "accepted"; entityId: number }
  | { type: "location_reached"; position: { x: number; y: number } }
  | { type: "entity_defeated"; entityId: number; defeatedBy: number }
  | { type: "item_collected"; itemId: string; quantity: number }
  | { type: "competence_used"; domain: CompetenceDomain; quality_Q: Q; taskId?: string }
  | { type: "item_delivered"; itemId: string; toEntityId: number }
  | { type: "escort_survived"; entityId: number; destinationReached: boolean }
  | { type: "dialogue_chosen"; choiceId: string }
  | { type: "time_elapsed"; seconds: number }
  | { type: "timeout" }
  | { type: "manual"; reason: string };

// ── Quest Registry ────────────────────────────────────────────────────────────

/** Per-entity quest log. */
export interface QuestLog {
  entityId: number;
  active: Map<string, Quest>;
  completed: Map<string, Quest>;
  failed: Map<string, Quest>;
}

/** Global quest registry for the world. */
export interface QuestRegistry {
  /** Template quests available to be assigned. */
  templates: Map<string, Quest>;
  /** Per-entity quest logs. */
  logs: Map<number, QuestLog>;
  /** History of all quest updates (for chronicle/chronology). */
  history: QuestUpdateEvent[];
}

/** Create a new empty quest registry. */
export function createQuestRegistry(): QuestRegistry {
  return {
    templates: new Map(),
    logs: new Map(),
    history: [],
  };
}

/** Get or create a quest log for an entity. */
export function getQuestLog(registry: QuestRegistry, entityId: number): QuestLog {
  let log = registry.logs.get(entityId);
  if (!log) {
    log = {
      entityId,
      active: new Map(),
      completed: new Map(),
      failed: new Map(),
    };
    registry.logs.set(entityId, log);
  }
  return log;
}

// ── Quest Lifecycle ───────────────────────────────────────────────────────────

/** Register a quest template in the registry. */
export function registerQuestTemplate(registry: QuestRegistry, quest: Quest): void {
  registry.templates.set(quest.questId, quest);
}

/**
 * Offer a quest to an entity.
 * Returns false if entity already has this quest (in any state).
 */
export function offerQuest(
  registry: QuestRegistry,
  entityId: number,
  questTemplateId: string,
  tick: number,
): { accepted: false; reason: string } | { accepted: true; quest: Quest } {
  const template = registry.templates.get(questTemplateId);
  if (!template) {
    return { accepted: false, reason: `Unknown quest template: ${questTemplateId}` };
  }

  const log = getQuestLog(registry, entityId);

  // Check if already has this quest
  if (
    log.active.has(questTemplateId) ||
    log.completed.has(questTemplateId) ||
    log.failed.has(questTemplateId)
  ) {
    return { accepted: false, reason: "Quest already in log" };
  }

  // Deep clone the quest
  const quest: Quest = {
    ...template,
    objectives: template.objectives.map((o) => ({ ...o })),
    state: "active",
    acceptedAtTick: tick,
  };

  // Initialize objective states
  for (const obj of quest.objectives) {
    if (!obj.requires || obj.requires.length === 0) {
      obj.state = "available";
      obj.activatedAtTick = tick;
    } else {
      obj.state = "locked";
    }
  }

  log.active.set(quest.questId, quest);

  registry.history.push({
    questId: quest.questId,
    oldState: "inactive",
    newState: "active",
    trigger: { type: "accepted", entityId },
    tick,
  });

  return { accepted: true, quest };
}

/** Abandon an active quest (moves to failed). */
export function abandonQuest(
  registry: QuestRegistry,
  entityId: number,
  questId: string,
  tick: number,
): boolean {
  const log = getQuestLog(registry, entityId);
  const quest = log.active.get(questId);
  if (!quest) return false;

  const oldState = quest.state;
  quest.state = "failed";
  log.active.delete(questId);
  log.failed.set(questId, quest);

  registry.history.push({
    questId,
    oldState,
    newState: "failed",
    trigger: { type: "manual", reason: "abandoned" },
    tick,
  });

  return true;
}

// ── Objective Progression ─────────────────────────────────────────────────────

/**
 * Check if an objective is complete based on its type and progress.
 */
export function checkObjectiveComplete(objective: QuestObjective): boolean {
  if (objective.state === "completed" || objective.state === "failed") {
    return true;
  }

  switch (objective.type) {
    case "reach_location":
    case "dialogue_choice":
    case "escort_entity":
    case "use_competence":
    case "deliver_item":
    case "wait_duration":
      // Boolean completion - state must be "completed"
      return false; // Not yet completed

    case "defeat_entity":
    case "collect_item":
      // Count-based completion
      if (objective.count !== undefined) {
        return objective.progress >= objective.count;
      }
      return false;

    default:
      return false;
  }
}

/**
 * Unlock objectives whose prerequisites are met.
 */
export function unlockObjectives(quest: Quest, tick: number): QuestObjective[] {
  const unlocked: QuestObjective[] = [];

  for (const obj of quest.objectives) {
    if (obj.state !== "locked") continue;
    if (!obj.requires || obj.requires.length === 0) continue;

    const allPrereqsComplete = obj.requires.every((reqId) => {
      const prereq = quest.objectives.find((o) => o.objectiveId === reqId);
      return prereq?.state === "completed";
    });

    if (allPrereqsComplete) {
      obj.state = "available";
      obj.activatedAtTick = tick;
      unlocked.push(obj);
    }
  }

  return unlocked;
}

/**
 * Check if quest is complete (all non-hidden objectives completed).
 */
export function checkQuestComplete(quest: Quest): boolean {
  const requiredObjectives = quest.objectives.filter((o) => !o.hidden);
  if (requiredObjectives.length === 0) return false;

  return requiredObjectives.every((o) => o.state === "completed");
}

/**
 * Check if any objective has failed.
 */
/**
 * Check if any objective has failed.
 */
export function checkQuestFailed(quest: Quest): boolean {
  return quest.objectives.some((o) => o.state === "failed");
}

// ── Event Handlers ────────────────────────────────────────────────────────────

/** Result of processing a quest event. */
export interface QuestEventResult {
  updated: boolean;
  questId?: string;
  objectiveId?: string;
  oldState?: ObjectiveState | QuestState;
  newState?: ObjectiveState | QuestState;
  questComplete?: boolean;
  questFailed?: boolean;
}

/**
 * Handle location reached event.
 */
export function handleLocationReached(
  quest: Quest,
  entityId: number,
  position: { x: number; y: number; z?: number },
  tick: number,
): QuestEventResult {
  for (const obj of quest.objectives) {
    if (obj.state !== "available" && obj.state !== "in_progress") continue;
    if (obj.type !== "reach_location") continue;
    if (!obj.target?.location) continue;

    const dx = position.x - obj.target.location.x;
    const dy = position.y - obj.target.location.y;
    const distSq = dx * dx + dy * dy;
    const radius = obj.target.location.radius_m;

    if (distSq <= radius * radius) {
      const oldState = obj.state;
      obj.state = "completed";

      // Check for quest completion
      unlockObjectives(quest, tick);
      const complete = checkQuestComplete(quest);
      if (complete) {
        quest.state = "completed";
      }

      return {
        updated: true,
        questId: quest.questId,
        objectiveId: obj.objectiveId,
        oldState,
        newState: "completed",
        questComplete: complete,
      };
    }
  }

  return { updated: false };
}

/**
 * Handle entity defeated event (from combat).
 */
export function handleEntityDefeated(
  quest: Quest,
  impact: ImpactEvent,
  tick: number,
): QuestEventResult {
  for (const obj of quest.objectives) {
    if (obj.state !== "available" && obj.state !== "in_progress") continue;
    if (obj.type !== "defeat_entity") continue;

    // Check if this is the target entity
    if (obj.target?.entityId !== undefined) {
      if (obj.target.entityId !== impact.targetId) continue;
    }

    obj.progress++;
    if (obj.state === "available") {
      obj.state = "in_progress";
    }

    const complete = checkObjectiveComplete(obj);
    if (complete) {
      const oldState = obj.state;
      obj.state = "completed";

      unlockObjectives(quest, tick);
      const questComplete = checkQuestComplete(quest);
      if (questComplete) {
        quest.state = "completed";
      }

      return {
        updated: true,
        questId: quest.questId,
        objectiveId: obj.objectiveId,
        oldState,
        newState: "completed",
        questComplete,
      };
    }

    return {
      updated: true,
      questId: quest.questId,
      objectiveId: obj.objectiveId,
      oldState: "in_progress",
      newState: "in_progress",
    };
  }

  return { updated: false };
}

/**
 * Handle competence use event (from Phase 40).
 */
export function handleCompetenceUsed(
  quest: Quest,
  domain: CompetenceDomain,
  quality_Q: Q,
  taskId: string | undefined,
  tick: number,
): QuestEventResult {
  for (const obj of quest.objectives) {
    if (obj.state !== "available" && obj.state !== "in_progress") continue;
    if (obj.type !== "use_competence") continue;
    if (!obj.target?.competence) continue;

    const req = obj.target.competence;

    // Check domain match
    if (req.domain !== domain) continue;

    // Check task match if specified
    if (req.taskId && req.taskId !== taskId) continue;

    // Check quality threshold
    if (quality_Q < req.minQuality_Q) {
      // Quality too low - doesn't count but doesn't fail
      continue;
    }

    const oldState = obj.state;
    obj.state = "completed";

    unlockObjectives(quest, tick);
    const complete = checkQuestComplete(quest);
    if (complete) {
      quest.state = "completed";
    }

    return {
      updated: true,
      questId: quest.questId,
      objectiveId: obj.objectiveId,
      oldState,
      newState: "completed",
      questComplete: complete,
    };
  }

  return { updated: false };
}

/**
 * Handle item collection.
 */
export function handleItemCollected(
  quest: Quest,
  itemId: string,
  quantity: number,
  tick: number,
): QuestEventResult {
  for (const obj of quest.objectives) {
    if (obj.state !== "available" && obj.state !== "in_progress") continue;
    if (obj.type !== "collect_item") continue;
    if (obj.target?.itemId !== itemId) continue;

    obj.progress += quantity;
    if (obj.state === "available") {
      obj.state = "in_progress";
    }

    const complete = checkObjectiveComplete(obj);
    if (complete) {
      const oldState = obj.state;
      obj.state = "completed";

      unlockObjectives(quest, tick);
      const questComplete = checkQuestComplete(quest);
      if (questComplete) {
        quest.state = "completed";
      }

      return {
        updated: true,
        questId: quest.questId,
        objectiveId: obj.objectiveId,
        oldState,
        newState: "completed",
        questComplete,
      };
    }

    return {
      updated: true,
      questId: quest.questId,
      objectiveId: obj.objectiveId,
      oldState: "in_progress",
      newState: "in_progress",
    };
  }

  return { updated: false };
}

/**
 * Handle dialogue choice selection (Phase 23 integration).
 */
export function handleDialogueChoice(
  quest: Quest,
  choiceId: string,
  tick: number,
): QuestEventResult {
  for (const obj of quest.objectives) {
    if (obj.state !== "available" && obj.state !== "in_progress") continue;
    if (obj.type !== "dialogue_choice") continue;
    if (obj.target?.dialogueChoice !== choiceId) continue;

    const oldState = obj.state;
    obj.state = "completed";

    unlockObjectives(quest, tick);
    const complete = checkQuestComplete(quest);
    if (complete) {
      quest.state = "completed";
    }

    return {
      updated: true,
      questId: quest.questId,
      objectiveId: obj.objectiveId,
      oldState,
      newState: "completed",
      questComplete: complete,
    };
  }

  return { updated: false };
}

// ── Time-based Objectives ─────────────────────────────────────────────────────

/**
 * Check time limits and update wait_duration objectives.
 * Call this periodically (e.g., once per second or per tick).
 */
export function processTimeBasedObjectives(
  quest: Quest,
  currentTick: number,
  tickHz: number,
): QuestEventResult[] {
  const results: QuestEventResult[] = [];
  const elapsed_s = (currentTick - (quest.acceptedAtTick ?? 0)) / tickHz;

  // Check overall quest time limit
  if (quest.timeLimit_s && elapsed_s >= quest.timeLimit_s) {
    if (quest.state === "active") {
      const oldState = quest.state;
      quest.state = "failed";
      quest.objectives.forEach((o) => {
        if (o.state === "available" || o.state === "in_progress") {
          o.state = "failed";
        }
      });

      return [
        {
          updated: true,
          questId: quest.questId,
          oldState,
          newState: "failed" as const,
          questFailed: true,
        },
      ];
    }
  }

  // Check individual objective time limits and wait_duration
  for (const obj of quest.objectives) {
    if (obj.state !== "available" && obj.state !== "in_progress") continue;

    // Check objective time limit
    if (obj.timeLimit_s && obj.activatedAtTick !== undefined) {
      const objElapsed_s = (currentTick - obj.activatedAtTick) / tickHz;
      if (objElapsed_s > obj.timeLimit_s) {
        const oldState = obj.state;
        obj.state = "failed";

        // Fail the quest if a required objective fails
        if (!obj.hidden) {
          quest.state = "failed";
          results.push({
            updated: true,
            questId: quest.questId,
            objectiveId: obj.objectiveId,
            oldState,
            newState: "failed",
            questFailed: true,
          });
          continue;
        }

        results.push({
          updated: true,
          questId: quest.questId,
          objectiveId: obj.objectiveId,
          oldState,
          newState: "failed",
        });
        continue;
      }
    }

    // Handle wait_duration
    if (obj.type === "wait_duration" && obj.activatedAtTick !== undefined) {
      const objElapsed_s = (currentTick - obj.activatedAtTick) / tickHz;
      if (objElapsed_s >= (obj.count ?? 0)) {
        const oldState = obj.state;
        obj.state = "completed";

        unlockObjectives(quest, currentTick);
        const complete = checkQuestComplete(quest);
        if (complete) {
          quest.state = "completed";
        }

        results.push({
          updated: true,
          questId: quest.questId,
          objectiveId: obj.objectiveId,
          oldState,
          newState: "completed",
          questComplete: complete,
        });
      }
    }
  }

  return results;
}

// ── Utility Functions ─────────────────────────────────────────────────────────

/** Get all active quests for an entity. */
export function getActiveQuests(registry: QuestRegistry, entityId: number): Quest[] {
  const log = registry.logs.get(entityId);
  if (!log) return [];
  return Array.from(log.active.values());
}

/** Get quest by ID from any category. */
export function getQuest(
  log: QuestLog,
  questId: string,
): { quest: Quest; category: "active" | "completed" | "failed" } | undefined {
  if (log.active.has(questId)) {
    return { quest: log.active.get(questId)!, category: "active" };
  }
  if (log.completed.has(questId)) {
    return { quest: log.completed.get(questId)!, category: "completed" };
  }
  if (log.failed.has(questId)) {
    return { quest: log.failed.get(questId)!, category: "failed" };
  }
  return undefined;
}

/** Get progress summary for a quest. */
export function getQuestProgress(quest: Quest): {
  total: number;
  completed: number;
  failed: number;
  percentage: number;
} {
  const visible = quest.objectives.filter((o) => !o.hidden);
  const total = visible.length;
  const completed = visible.filter((o) => o.state === "completed").length;
  const failed = visible.filter((o) => o.state === "failed").length;

  return {
    total,
    completed,
    failed,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/** Serialize quest registry to JSON-friendly format. */
export function serializeQuestRegistry(registry: QuestRegistry): unknown {
  return {
    templates: Array.from(registry.templates.entries()),
    logs: Array.from(registry.logs.entries()).map(([entityId, log]) => [
      entityId,
      {
        entityId: log.entityId,
        active: Array.from(log.active.entries()),
        completed: Array.from(log.completed.entries()),
        failed: Array.from(log.failed.entries()),
      },
    ]),
    history: registry.history,
  };
}

/** Deserialize quest registry. */
export function deserializeQuestRegistry(data: unknown): QuestRegistry {
  const registry = createQuestRegistry();

  if (typeof data !== "object" || data === null) {
    return registry;
  }

  const d = data as Record<string, unknown>;

  if (Array.isArray(d.templates)) {
    for (const [id, quest] of d.templates) {
      registry.templates.set(id, quest as Quest);
    }
  }

  if (Array.isArray(d.logs)) {
    for (const [entityId, logData] of d.logs) {
      const log = logData as QuestLog;
      registry.logs.set(entityId, {
        entityId: log.entityId,
        active: new Map(log.active),
        completed: new Map(log.completed),
        failed: new Map(log.failed),
      });
    }
  }

  if (Array.isArray(d.history)) {
    registry.history = d.history as QuestUpdateEvent[];
  }

  return registry;
}
