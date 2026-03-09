// src/quest-generators.ts — Phase 41: Procedural Quest Generation
//
// Generates quests from world state, faction standing, and entity capabilities.

import type { Q } from "./units.js";
import { q } from "./units.js";
import type {
  Quest,
  QuestObjective,
  QuestRewards,
  QuestTarget,
} from "./quest.js";
import type { CompetenceDomain } from "./competence/catalogue.js";

// ── Quest Templates ───────────────────────────────────────────────────────────

/** Template for generating similar quests. */
export interface QuestTemplate {
  templateId: string;
  titlePattern: string;
  descriptionPattern: string;
  minTier: number;               // Settlement/faction tier requirement
  maxTier: number;
  baseReward: QuestRewards;
  objectiveGenerators: ObjectiveGenerator[];
  /** Weight for random selection. */
  weight: number;
  /** Required faction standing range [min, max]. */
  factionRange?: [number, number];
}

/** Function that generates an objective from context. */
export type ObjectiveGenerator = (ctx: QuestContext) => QuestObjective | null;

/** Context for quest generation. */
export interface QuestContext {
  giverId?: number;
  targetEntityId?: number;
  targetLocation?: { x: number; y: number };
  settlementTier: number;
  factionStanding: number;
  availableCompetences: CompetenceDomain[];
  seed: number;
}

// ── Template Library ──────────────────────────────────────────────────────────

const BOUNTY_TEMPLATE: QuestTemplate = {
  templateId: "bounty",
  titlePattern: "Bounty: {targetName}",
  descriptionPattern: "Eliminate {targetName}, who has been causing trouble in the region.",
  minTier: 1,
  maxTier: 4,
  baseReward: {
    reputation: { faction: 5 },
    xp: 50,
    currency: 100,
  },
  objectiveGenerators: [
    (ctx) => ({
      objectiveId: "defeat_target",
      description: `Defeat the target entity`,
      type: "defeat_entity",
      ...(ctx.targetEntityId && { target: { entityId: ctx.targetEntityId } }),
      progress: 0,
      state: "available",
      hidden: false,
    }),
  ],
  weight: 10,
  factionRange: [-50, 100],      // Most factions offer bounties
};

const DELIVERY_TEMPLATE: QuestTemplate = {
  templateId: "delivery",
  titlePattern: "Special Delivery",
  descriptionPattern: "Deliver {itemName} to {destination}.",
  minTier: 1,
  maxTier: 4,
  baseReward: {
    reputation: { faction: 3 },
    xp: 25,
    currency: 50,
  },
  objectiveGenerators: [
    (ctx) => ({
      objectiveId: "collect_package",
      description: "Collect the package from the quest giver",
      type: "collect_item",
      target: { itemId: "quest_package" },
      count: 1,
      progress: 0,
      state: "available",
      hidden: false,
    }),
    (ctx) => ({
      objectiveId: "deliver_package",
      description: "Deliver the package to the destination",
      type: "deliver_item",
      target: {
        itemId: "quest_package",
        location: ctx.targetLocation
          ? { ...ctx.targetLocation, radius_m: 10 }
          : { x: 0, y: 0, radius_m: 10 },
      },
      progress: 0,
      state: "locked",
      hidden: false,
      requires: ["collect_package"],
    }),
  ],
  weight: 15,
  factionRange: [0, 100],        // Need neutral or better standing
};

const CRAFTING_TEMPLATE: QuestTemplate = {
  templateId: "crafting",
  titlePattern: "Commission: {itemName}",
  descriptionPattern: "Craft a {quality} {itemName} using your skills.",
  minTier: 2,
  maxTier: 4,
  baseReward: {
    reputation: { faction: 8 },
    xp: 75,
    currency: 200,
  },
  objectiveGenerators: [
    (ctx) => {
      const domain = ctx.availableCompetences.includes("bodilyKinesthetic")
        ? "bodilyKinesthetic"
        : ctx.availableCompetences[0] ?? "bodilyKinesthetic";

      return {
        objectiveId: "craft_item",
        description: "Craft the requested item to specification",
        type: "use_competence",
        target: {
          competence: {
            domain,
            minQuality_Q: q(0.70),
          },
        },
        progress: 0,
        state: "available",
        hidden: false,
      };
    },
  ],
  weight: 8,
  factionRange: [10, 100],       // Need some trust for crafting quests
};

const INVESTIGATION_TEMPLATE: QuestTemplate = {
  templateId: "investigation",
  titlePattern: "Investigate {locationName}",
  descriptionPattern: "Travel to {locationName} and report what you find.",
  minTier: 2,
  maxTier: 4,
  baseReward: {
    reputation: { faction: 10 },
    xp: 60,
    currency: 75,
  },
  objectiveGenerators: [
    (ctx) => ({
      objectiveId: "reach_site",
      description: "Reach the investigation site",
      type: "reach_location",
      target: {
        location: ctx.targetLocation
          ? { ...ctx.targetLocation, radius_m: 20 }
          : { x: 100, y: 100, radius_m: 20 },
      },
      progress: 0,
      state: "available",
      hidden: false,
    }),
    (ctx) => ({
      objectiveId: "report_findings",
      description: "Return and report your findings",
      type: "dialogue_choice",
      target: { dialogueChoice: "report_investigation" },
      progress: 0,
      state: "locked",
      hidden: false,
      requires: ["reach_site"],
    }),
  ],
  weight: 12,
  factionRange: [5, 100],
};

const ESCORT_TEMPLATE: QuestTemplate = {
  templateId: "escort",
  titlePattern: "Escort {npcName}",
  descriptionPattern: "Safely escort {npcName} to {destination}.",
  minTier: 2,
  maxTier: 4,
  baseReward: {
    reputation: { faction: 15 },
    xp: 100,
    currency: 150,
  },
  objectiveGenerators: [
    (ctx) => ({
      objectiveId: "reach_destination",
      description: "Escort the NPC to the destination safely",
      type: "escort_entity",
      target: {
        ...(ctx.targetEntityId && { entityId: ctx.targetEntityId }),
        location: ctx.targetLocation
          ? { ...ctx.targetLocation, radius_m: 15 }
          : { x: 200, y: 200, radius_m: 15 },
      },
      progress: 0,
      state: "available",
      hidden: false,
    }),
  ],
  weight: 6,
  factionRange: [20, 100],       // Need good standing for escort quests
};

const COLLECTION_TEMPLATE: QuestTemplate = {
  templateId: "collection",
  titlePattern: "Gather {itemName}",
  descriptionPattern: "Collect {count} {itemName}(s) for research/crafting.",
  minTier: 1,
  maxTier: 3,
  baseReward: {
    reputation: { faction: 3 },
    xp: 40,
    currency: 60,
  },
  objectiveGenerators: [
    (ctx) => ({
      objectiveId: "collect_items",
      description: "Collect the requested items",
      type: "collect_item",
      target: { itemId: "herb_rare" },
      count: 5,
      progress: 0,
      state: "available",
      hidden: false,
    }),
  ],
  weight: 14,
  factionRange: [0, 100],
};

const WAIT_TEMPLATE: QuestTemplate = {
  templateId: "wait",
  titlePattern: "Stand Watch",
  descriptionPattern: "Stand watch at {locationName} for {duration}.",
  minTier: 1,
  maxTier: 3,
  baseReward: {
    reputation: { faction: 2 },
    xp: 20,
    currency: 30,
  },
  objectiveGenerators: [
    (ctx) => ({
      objectiveId: "reach_post",
      description: "Go to your assigned post",
      type: "reach_location",
      target: {
        location: ctx.targetLocation
          ? { ...ctx.targetLocation, radius_m: 10 }
          : { x: 0, y: 0, radius_m: 10 },
      },
      progress: 0,
      state: "available",
      hidden: false,
    }),
    (ctx) => ({
      objectiveId: "stand_watch",
      description: "Stand watch for the required duration",
      type: "wait_duration",
      count: 300,                  // 5 minutes
      progress: 0,
      state: "locked",
      hidden: false,
      requires: ["reach_post"],
    }),
  ],
  weight: 10,
  factionRange: [0, 100],
};

const MULTISTAGE_TEMPLATE: QuestTemplate = {
  templateId: "multistage",
  titlePattern: "The {adjective} Contract",
  descriptionPattern: "A complex mission with multiple stages.",
  minTier: 3,
  maxTier: 4,
  baseReward: {
    reputation: { faction: 25 },
    xp: 200,
    currency: 500,
    items: [{ itemId: "rare_material", quantity: 1 }],
  },
  objectiveGenerators: [
    (ctx) => ({
      objectiveId: "stage1_recon",
      description: "Scout the target location",
      type: "reach_location",
      target: {
        location: ctx.targetLocation
          ? { ...ctx.targetLocation, radius_m: 30 }
          : { x: 150, y: 150, radius_m: 30 },
      },
      progress: 0,
      state: "available",
      hidden: false,
    }),
    (ctx) => ({
      objectiveId: "stage2_prepare",
      description: "Craft necessary equipment",
      type: "use_competence",
      target: {
        competence: {
          domain: ctx.availableCompetences[0] ?? "bodilyKinesthetic",
          minQuality_Q: q(0.60),
        },
      },
      progress: 0,
      state: "locked",
      hidden: false,
      requires: ["stage1_recon"],
    }),
    (ctx) => ({
      objectiveId: "stage3_execute",
      description: "Complete the primary objective",
      type: "defeat_entity",
      ...(ctx.targetEntityId && { target: { entityId: ctx.targetEntityId } }),
      count: 1,
      progress: 0,
      state: "locked",
      hidden: false,
      requires: ["stage2_prepare"],
    }),
  ],
  weight: 5,
  factionRange: [30, 100],       // High trust required for complex quests
};

/** All available quest templates. */
export const QUEST_TEMPLATES: QuestTemplate[] = [
  BOUNTY_TEMPLATE,
  DELIVERY_TEMPLATE,
  CRAFTING_TEMPLATE,
  INVESTIGATION_TEMPLATE,
  ESCORT_TEMPLATE,
  COLLECTION_TEMPLATE,
  WAIT_TEMPLATE,
  MULTISTAGE_TEMPLATE,
];

// ── Generation Functions ──────────────────────────────────────────────────────

/**
 * Select a quest template based on context and random seed.
 */
export function selectTemplate(
  ctx: QuestContext,
  templates: QuestTemplate[] = QUEST_TEMPLATES,
): QuestTemplate | null {
  // Filter by tier and faction standing
  const eligible = templates.filter((t) =>
    ctx.settlementTier >= t.minTier &&
    ctx.settlementTier <= t.maxTier &&
    (!t.factionRange ||
      (ctx.factionStanding >= t.factionRange[0] &&
        ctx.factionStanding <= t.factionRange[1]))
  );

  if (eligible.length === 0) return null;

  // Weighted random selection using deterministic seed
  const totalWeight = eligible.reduce((sum, t) => sum + t.weight, 0);
  let roll = (ctx.seed % totalWeight);

  for (const template of eligible) {
    roll -= template.weight;
    if (roll < 0) return template;
  }

  return eligible[eligible.length - 1] ?? null;
}

/**
 * Generate a quest ID from template and context.
 */
function generateQuestId(template: QuestTemplate, ctx: QuestContext, index: number): string {
  return `${template.templateId}_${ctx.giverId ?? "world"}_${index}_${ctx.seed}`;
}

/**
 * Fill template strings with context values.
 */
function fillTemplate(template: string, ctx: QuestContext): string {
  const replacements: Record<string, string> = {
    "{targetName}": ctx.targetEntityId ? `Target-${ctx.targetEntityId}` : "the target",
    "{itemName}": "item",
    "{quality}": "fine",
    "{destination}": ctx.targetLocation
      ? `location (${ctx.targetLocation.x}, ${ctx.targetLocation.y})`
      : "the destination",
    "{locationName}": ctx.targetLocation
      ? `the site at (${ctx.targetLocation.x}, ${ctx.targetLocation.y})`
      : "the designated location",
    "{npcName}": ctx.targetEntityId ? `NPC-${ctx.targetEntityId}` : "the client",
    "{duration}": "5 minutes",
    "{count}": "5",
    "{adjective}": "Complex",
  };

  return template.replace(/\{[^}]+\}/g, (match) => replacements[match] ?? match);
}

/**
 * Scale rewards based on settlement tier and faction standing.
 */
function scaleRewards(base: QuestRewards, tier: number, standing: number): QuestRewards {
  const tierMul = 1 + (tier - 1) * 0.5;       // Tier 1 = 1x, Tier 2 = 1.5x, etc.
  const standingMul = 1 + standing / 200;     // -100 to +100 maps to 0.5x to 1.5x

  const result: QuestRewards = {};

  if (base.reputation) {
    result.reputation = Object.fromEntries(
      Object.entries(base.reputation).map(([k, v]) => [k, Math.round(v * standingMul)]),
    );
  }

  if (base.xp) {
    result.xp = Math.round(base.xp * tierMul);
  }

  if (base.currency) {
    result.currency = Math.round(base.currency * tierMul * standingMul);
  }

  if (base.items) {
    result.items = base.items;
  }

  return result;
}

/**
 * Generate a complete quest from a template and context.
 */
export function generateQuest(
  ctx: QuestContext,
  template: QuestTemplate,
  questIndex: number = 0,
): Quest {
  // Generate objectives
  const objectives: QuestObjective[] = [];
  for (const generator of template.objectiveGenerators) {
    const obj = generator(ctx);
    if (obj) objectives.push(obj);
  }

  // Create quest
  const quest: Quest = {
    questId: generateQuestId(template, ctx, questIndex),
    title: fillTemplate(template.titlePattern, ctx),
    description: fillTemplate(template.descriptionPattern, ctx),
    ...(ctx.giverId && { giverId: ctx.giverId }),
    objectives,
    state: "inactive",
    priority: template.minTier * 10 + Math.floor(Math.random() * 10),
    rewards: scaleRewards(template.baseReward, ctx.settlementTier, ctx.factionStanding),
  };

  return quest;
}

/**
 * Generate multiple quests for a settlement/quest giver.
 */
export function generateQuests(
  ctx: QuestContext,
  count: number,
): Quest[] {
  const quests: Quest[] = [];
  const usedTemplates = new Set<string>();

  for (let i = 0; i < count; i++) {
    // Avoid repeating templates
    const availableTemplates = QUEST_TEMPLATES.filter(
      (t) => !usedTemplates.has(t.templateId) || usedTemplates.size >= QUEST_TEMPLATES.length
    );

    const template = selectTemplate(ctx, availableTemplates);
    if (!template) break;

    usedTemplates.add(template.templateId);

    const questCtx: QuestContext = {
      ...ctx,
      seed: ctx.seed + i,          // Vary seed for each quest
    };

    quests.push(generateQuest(questCtx, template, i));
  }

  return quests;
}

// ── Context Builders ───────────────────────────────────────────────────────────

/**
 * Build quest context from simulation state.
 */
export interface WorldContext {
  giverId?: number;
  settlementTier: number;
  factionId?: string;
  factionStanding: number;
  nearbyEntities: number[];
  pointsOfInterest: { x: number; y: number; type: string }[];
  seed: number;
}

/**
 * Create a QuestContext from world simulation state.
 */
export function buildQuestContext(worldCtx: WorldContext): QuestContext {
  // Select random target from available entities/locations
  const targetEntityId =
    worldCtx.nearbyEntities.length > 0
      ? worldCtx.nearbyEntities[worldCtx.seed % worldCtx.nearbyEntities.length]
      : undefined;

  const targetLocation =
    worldCtx.pointsOfInterest.length > 0
      ? worldCtx.pointsOfInterest[worldCtx.seed % worldCtx.pointsOfInterest.length]
      : undefined;

  const ctx: QuestContext = {
    settlementTier: worldCtx.settlementTier,
    factionStanding: worldCtx.factionStanding,
    availableCompetences: [
      "bodilyKinesthetic",
      "spatial",
      "naturalist",
      "linguistic",
      "logicalMathematical",
    ],
    seed: worldCtx.seed,
  };

  if (worldCtx.giverId !== undefined) ctx.giverId = worldCtx.giverId;
  if (targetEntityId !== undefined) ctx.targetEntityId = targetEntityId;
  if (targetLocation !== undefined) ctx.targetLocation = targetLocation;

  return ctx;
}

// ── Quest Variations ───────────────────────────────────────────────────────────

/**
 * Add optional bonus objectives to a quest.
 */
export function addBonusObjective(
  quest: Quest,
  type: "time_limit" | "stealth" | "no_harm",
  bonusReward: Partial<QuestRewards>,
): void {
  let objective: QuestObjective;

  switch (type) {
    case "time_limit":
      objective = {
        objectiveId: "bonus_speed",
        description: "Complete within time limit for bonus",
        type: "wait_duration",
        count: 3600,               // 1 hour
        progress: 0,
        state: "available",
        hidden: true,
      };
      break;

    case "stealth":
      objective = {
        objectiveId: "bonus_stealth",
        description: "Complete without being detected",
        type: "dialogue_choice",
        target: { dialogueChoice: "stealth_success" },
        progress: 0,
        state: "available",
        hidden: true,
      };
      break;

    case "no_harm":
      objective = {
        objectiveId: "bonus_pacifist",
        description: "Complete without harming non-targets",
        type: "dialogue_choice",
        target: { dialogueChoice: "pacifist_success" },
        progress: 0,
        state: "available",
        hidden: true,
      };
      break;

    default:
      return;
  }

  quest.objectives.push(objective);

  // Merge bonus rewards
  if (bonusReward.xp) {
    quest.rewards ??= {};
    quest.rewards.xp = (quest.rewards.xp ?? 0) + bonusReward.xp;
  }
  if (bonusReward.currency) {
    quest.rewards ??= {};
    quest.rewards.currency = (quest.rewards.currency ?? 0) + bonusReward.currency;
  }
}

/**
 * Create a chain of related quests.
 */
export function generateQuestChain(
  baseCtx: QuestContext,
  stages: { template: QuestTemplate; requiresPrevious: boolean }[],
): Quest[] {
  const chain: Quest[] = [];
  let prevQuestId: string | undefined;

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    if (!stage) continue;
    const { template, requiresPrevious } = stage;

    const ctx: QuestContext = {
      ...baseCtx,
      seed: baseCtx.seed + i * 1000,
    };

    const quest = generateQuest(ctx, template, i);

    // Link to previous quest if required
    if (requiresPrevious && prevQuestId) {
      quest.description += ` (Requires completion of previous mission)`;
      // The quest giver would only offer this if previous is complete
    }

    chain.push(quest);
    prevQuestId = quest.questId;
  }

  return chain;
}
