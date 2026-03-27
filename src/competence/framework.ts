// src/competence/framework.ts — Phase 40: Non-Combat Competence Framework
//
// Unified competence resolution system that:
//   1. Routes to correct domain-specific resolver
//   2. Integrates with Phase 21 progression (XP gain)
//   3. Provides canonical CompetenceAction/CompetenceOutcome types
//
// No kernel import — pure resolution module.

import type { Q } from "../units.js";
import { SCALE, q, clampQ, mulDiv } from "../units.js";
import type { Entity } from "../sim/entity.js";
import type { WorldState } from "../sim/world.js";
import { makeRng } from "../rng.js";

import type { CompetenceDomain, CompetenceTask } from "./catalogue.js";
import { getTaskById } from "./catalogue.js";

// Import domain-specific resolvers
import { resolveCrafting, type CraftingSpec } from "./crafting.js";
import { resolveNavigation, type NavigationSpec } from "./navigation.js";
import {
  resolveTracking,
  resolveForaging,
  resolveTaming,
  type TrackingSpec,
  type ForagingSpec,
  type TamingSpec,
} from "./naturalist.js";
import { resolveSignal, type SignalSpec } from "./interspecies.js";
import { resolveTeaching, type TeachingSpec } from "./teaching.js";
import { resolveEngineering, type EngineeringSpec } from "./engineering.js";
import { resolveFormationSignal, type FormationSignal } from "./acoustic.js";
import { resolvePerformance, type PerformanceSpec } from "./performance.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A competence action to be resolved. */
export interface CompetenceAction {
  /** Primary competence domain. */
  domain: CompetenceDomain;
  /** Task identifier (references CompetenceCatalogue). */
  taskId: string;
  /** Target entity ID (for interpersonal / inter-species tasks). */
  targetEntityId?: number;
  /** Tool/equipment item used. */
  toolId?: string;
  /** Time available for the task in seconds. */
  timeAvailable_s: number;
  /** Deterministic seed for RNG. */
  seed: number;
  /** Terrain/biome context for environmental tasks. */
  terrain?: string;
  /** Whether to include narrative description in outcome. */
  narrative?: boolean;
}

/** Outcome of a competence action resolution. */
export interface CompetenceOutcome {
  /** Domain that was resolved. */
  domain: CompetenceDomain;
  /** Quality of the outcome (0–1). */
  quality_Q: Q;
  /** Time actually taken in seconds. */
  timeTaken_s: number;
  /** Whether the task succeeded. */
  success: boolean;
  /** Outcome descriptor. */
  descriptor: "exceptional" | "good" | "adequate" | "poor" | "failure";
  /** XP gained from this attempt (fed into Phase 21). */
  xpGained: number;
  /** Optional narrative description of outcome. */
  narrativeLine?: string | undefined;
  /** Domain-specific result data. */
  details?: unknown;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Base XP for successful task completion. */
const BASE_XP_SUCCESS = 10;

/** XP multiplier for outcome quality. */
const QUALITY_XP_MULTIPLIERS: Record<CompetenceOutcome["descriptor"], number> = {
  exceptional: 2.0,
  good: 1.5,
  adequate: 1.0,
  poor: 0.5,
  failure: 0,
};

/** Difficulty XP bonus: harder tasks grant more XP. */
const MAX_DIFFICULTY_BONUS = 15;


// ── Helper Functions ──────────────────────────────────────────────────────────

/**
 * Map domain-specific descriptors to canonical descriptors.
 */
function canonicalizeDescriptor(
  descriptor: string,
): CompetenceOutcome["descriptor"] {
  switch (descriptor) {
    case "exceptional":
    case "masterwork":
      return "exceptional";
    case "good":
    case "fine":
      return "good";
    case "adequate":
      return "adequate";
    case "poor":
      return "poor";
    case "failure":
    case "ruined":
      return "failure";
    default:
      return "adequate";
  }
}

/**
 * Calculate XP gain based on outcome.
 */
function calculateXP(
  descriptor: CompetenceOutcome["descriptor"],
  difficulty_Q: Q,
): number {
  const qualityMul = QUALITY_XP_MULTIPLIERS[descriptor];
  // No XP for failure, no difficulty bonus on failure
  if (descriptor === "failure") {
    return 0;
  }
  const difficultyBonus = Math.round(
    (difficulty_Q / SCALE.Q) * MAX_DIFFICULTY_BONUS,
  );
  return Math.round(BASE_XP_SUCCESS * qualityMul) + difficultyBonus;
}

/**
 * Generate narrative line for outcome.
 */
function generateNarrative(
  task: CompetenceTask,
  outcome: CompetenceOutcome,
  actor: Entity,
): string {
  const actorName = `Entity ${actor.id}`;
  const taskName = task.description.toLowerCase();

  switch (outcome.descriptor) {
    case "exceptional":
      return `${actorName} achieved an exceptional result ${taskName}, surpassing all expectations.`;
    case "good":
      return `${actorName} successfully completed ${taskName} with good quality.`;
    case "adequate":
      return `${actorName} managed ${taskName} adequately, meeting basic requirements.`;
    case "poor":
      return `${actorName} struggled with ${taskName}, producing a poor result.`;
    case "failure":
      return `${actorName} failed to complete ${taskName}.`;
    default:
      return `${actorName} attempted ${taskName}.`;
  }
}

/**
 * Get the relevant cognitive attribute for a domain.
 */
function getDomainIntelligence(entity: Entity, domain: CompetenceDomain): Q {
  const cognition = entity.attributes.cognition;
  if (!cognition) return q(0.50) as Q;

  switch (domain) {
    case "linguistic":
      return (cognition.linguistic ?? q(0.50)) as Q;
    case "logicalMathematical":
      return (cognition.logicalMathematical ?? q(0.50)) as Q;
    case "spatial":
      return (cognition.spatial ?? q(0.50)) as Q;
    case "bodilyKinesthetic":
      return (cognition.bodilyKinesthetic ?? q(0.50)) as Q;
    case "musical":
      return (cognition.musical ?? q(0.50)) as Q;
    case "interpersonal":
      return (cognition.interpersonal ?? q(0.50)) as Q;
    case "intrapersonal":
      return (cognition.intrapersonal ?? q(0.50)) as Q;
    case "naturalist":
      return (cognition.naturalist ?? q(0.50)) as Q;
    case "interSpecies":
      return (cognition.interSpecies ?? q(0.35)) as Q;
    default:
      return q(0.50) as Q;
  }
}

// ── Domain Routers ────────────────────────────────────────────────────────────

/**
 * Resolve bodily-kinesthetic tasks (crafting, physical skill).
 */
function resolveBodilyKinesthetic(
  actor: Entity,
  task: CompetenceTask,
  action: CompetenceAction,
): Omit<CompetenceOutcome, "domain" | "xpGained" | "narrativeLine"> & {
  details: { qualityMul: Q; latentFlaw: boolean };
} {
  const seed = action.seed;

  // Map task to crafting spec
  const toolCategory: CraftingSpec["toolCategory"] | undefined = task.taskId.includes("sword")
    ? "forge"
    : task.taskId.includes("surgery")
      ? "precision"
      : undefined;

  const spec: CraftingSpec = {
    outputId: task.taskId,
    materialQ: q(0.50),
    baseTime_s: task.timeBase_s,
    minBKQ: q(0.20),
    ...(toolCategory !== undefined && { toolCategory }),
  };

  const result = resolveCrafting(actor, spec, seed);

  return {
    quality_Q: result.quality_Q,
    timeTaken_s: result.timeTaken_s,
    success: result.descriptor !== "ruined",
    descriptor: canonicalizeDescriptor(result.descriptor),
    details: {
      qualityMul: result.quality_Q,
      latentFlaw: result.descriptor === "poor",
    },
  };
}

/**
 * Resolve spatial tasks (navigation, wayfinding).
 */
function resolveSpatial(
  actor: Entity,
  task: CompetenceTask,
  action: CompetenceAction,
): Omit<CompetenceOutcome, "domain" | "xpGained" | "narrativeLine"> & {
  details: { efficiency_Q: Q };
} {
  const terrain = action.terrain ?? "forest";
  const hasMap = action.toolId === "map";

  const spec: NavigationSpec = {
    terrain: terrain as NavigationSpec["terrain"],
    visibility: "clear",
    distance_m: 1000,
    hasMap,
  };

  const result = resolveNavigation(actor, spec, action.seed);

  // Determine descriptor based on efficiency
  let descriptor: CompetenceOutcome["descriptor"];
  if (result.routeEfficiency >= q(0.90)) descriptor = "exceptional";
  else if (result.routeEfficiency >= q(0.75)) descriptor = "good";
  else if (result.routeEfficiency >= q(0.50)) descriptor = "adequate";
  else if (result.routeEfficiency >= q(0.30)) descriptor = "poor";
  else descriptor = "failure";

  return {
    quality_Q: result.routeEfficiency,
    timeTaken_s: task.timeBase_s + result.timeLost_s,
    success: result.routeEfficiency >= q(0.30),
    descriptor,
    details: { efficiency_Q: result.routeEfficiency },
  };
}

/**
 * Resolve naturalist tasks (tracking, foraging, taming).
 */
function resolveNaturalist(
  actor: Entity,
  task: CompetenceTask,
  action: CompetenceAction,
): Omit<CompetenceOutcome, "domain" | "xpGained" | "narrativeLine"> & {
  details: unknown;
} {
  const seed = action.seed;

  if (task.taskId.includes("track")) {
    const spec: TrackingSpec = {
      trackAge_s: task.taskId.includes("fresh") ? 1800 : 86400,
      terrain: "forest",
      quarrySpecies: "human",
    };
    const result = resolveTracking(actor, spec, seed);

    let descriptor: CompetenceOutcome["descriptor"];
    if (result.confidence_Q >= q(0.80)) descriptor = "exceptional";
    else if (result.confidence_Q >= q(0.60)) descriptor = "good";
    else if (result.confidence_Q >= q(0.40)) descriptor = "adequate";
    else if (result.confidence_Q >= q(0.20)) descriptor = "poor";
    else descriptor = "failure";

    return {
      quality_Q: result.confidence_Q,
      timeTaken_s: task.timeBase_s,
      success: result.confidence_Q >= q(0.40),
      descriptor,
      details: { confidence_Q: result.confidence_Q, trackRange_m: result.trackRange_m },
    };
  }

  if (task.taskId.includes("forage") || task.taskId.includes("identify")) {
    const spec: ForagingSpec = {
      searchHours: task.timeBase_s / 3600,
      biome: "forest",
      season: "summer",
    };
    const result = resolveForaging(actor, spec, seed);

    let descriptor: CompetenceOutcome["descriptor"];
    if (result.misidentified) descriptor = "failure";
    else if (result.herbQuality_Q >= q(0.80)) descriptor = "exceptional";
    else if (result.herbQuality_Q >= q(0.60)) descriptor = "good";
    else if (result.itemsFound >= 2) descriptor = "adequate";
    else descriptor = "poor";

    return {
      quality_Q: result.herbQuality_Q,
      timeTaken_s: task.timeBase_s,
      success: !result.misidentified && result.itemsFound > 0,
      descriptor,
      details: { itemsFound: result.itemsFound, herbQuality_Q: result.herbQuality_Q },
    };
  }

  if (task.taskId.includes("tame")) {
    const spec: TamingSpec = {
      animalSpecies: "horse",
      animalFearQ: q(0.40),
      effortFactor: q(1.0),
      priorSuccesses: 0,
    };
    const result = resolveTaming(actor, spec, seed);

    let descriptor: CompetenceOutcome["descriptor"];
    if (result.attacked) descriptor = "failure";
    else if (result.trust_Q >= q(0.90)) descriptor = "exceptional";
    else if (result.trust_Q >= q(0.60)) descriptor = "good";
    else if (result.trust_Q >= q(0.30)) descriptor = "adequate";
    else descriptor = "poor";

    return {
      quality_Q: result.trust_Q,
      timeTaken_s: task.timeBase_s,
      success: !result.attacked && result.trust_Q >= q(0.30),
      descriptor,
      details: { trust_Q: result.trust_Q, attacked: result.attacked },
    };
  }

  // Default fallback
  return {
    quality_Q: q(0.50),
    timeTaken_s: task.timeBase_s,
    success: true,
    descriptor: "adequate",
    details: {},
  };
}

/**
 * Resolve inter-species tasks.
 */
function resolveInterSpecies(
  actor: Entity,
  task: CompetenceTask,
  action: CompetenceAction,
): Omit<CompetenceOutcome, "domain" | "xpGained" | "narrativeLine"> & {
  details: unknown;
} {
  const seed = action.seed;

  const spec: SignalSpec = {
    targetSpecies: "unknown",
    intent: task.taskId.includes("calm") ? "calm" : "ally",
    targetFearQ: q(0.50),
  };

  const result = resolveSignal(actor, spec, seed);

  let descriptor: CompetenceOutcome["descriptor"];
  if (result.aggravated) descriptor = "failure";
  else if (result.comprehension_Q >= q(0.80)) descriptor = "exceptional";
  else if (result.comprehension_Q >= q(0.60)) descriptor = "good";
  else if (result.comprehension_Q >= q(0.40)) descriptor = "adequate";
  else descriptor = "poor";

  return {
    quality_Q: result.comprehension_Q,
    timeTaken_s: task.timeBase_s,
    success: result.comprehension_Q >= q(0.40) && !result.aggravated,
    descriptor,
    details: { comprehension_Q: result.comprehension_Q, aggravated: result.aggravated },
  };
}

/**
 * Resolve linguistic tasks.
 */
function resolveLinguistic(
  actor: Entity,
  task: CompetenceTask,
  action: CompetenceAction,
  world: WorldState,
): Omit<CompetenceOutcome, "domain" | "xpGained" | "narrativeLine"> & {
  details: unknown;
} {
  if (task.taskId.includes("command")) {
    // Use formation signal for command tasks
    const formationSignal = task.taskId.includes("formation")
      ? "advance"
      : "hold";

    // Need a listener - use self as placeholder or find in world
    const listener = action.targetEntityId
      ? world.entities.find((e) => e.id === action.targetEntityId) ?? actor
      : actor;

    const result = resolveFormationSignal(actor, formationSignal as FormationSignal, listener, 10);

    let descriptor: CompetenceOutcome["descriptor"];
    if (result.received && result.clarity_Q >= q(0.80)) descriptor = "exceptional";
    else if (result.received && result.clarity_Q >= q(0.60)) descriptor = "good";
    else if (result.received) descriptor = "adequate";
    else if (result.clarity_Q >= q(0.30)) descriptor = "poor";
    else descriptor = "failure";

    return {
      quality_Q: result.clarity_Q,
      timeTaken_s: result.latency_ms,
      success: result.received,
      descriptor,
      details: { clarity_Q: result.clarity_Q, latency_ms: result.latency_ms },
    };
  }

  if (task.taskId.includes("negotiate")) {
    // Negotiation uses interpersonal + linguistic
    const intPersonal = getDomainIntelligence(actor, "interpersonal");
    const intLinguistic = getDomainIntelligence(actor, "linguistic");
    const combined = mulDiv(intPersonal, intLinguistic, SCALE.Q) as Q;

    // Apply difficulty
    const difficultyPenalty = mulDiv(task.difficulty_Q, q(0.30), SCALE.Q);
    const effectiveSkill = clampQ(
      (combined - difficultyPenalty) as Q,
      q(0),
      SCALE.Q as Q,
    );

    const rng = makeRng(action.seed, SCALE.Q);
    const roll = rng.q01();
    const success = roll < effectiveSkill;

    let descriptor: CompetenceOutcome["descriptor"];
    if (effectiveSkill >= q(0.85) && success) descriptor = "exceptional";
    else if (effectiveSkill >= q(0.65) && success) descriptor = "good";
    else if (success) descriptor = "adequate";
    else if (effectiveSkill >= q(0.40)) descriptor = "poor";
    else descriptor = "failure";

    return {
      quality_Q: effectiveSkill,
      timeTaken_s: task.timeBase_s,
      success,
      descriptor,
      details: { effectiveSkill_Q: effectiveSkill },
    };
  }

  // Default translation/command task - simplified
  const linguistic = getDomainIntelligence(actor, "linguistic");

  let descriptor: CompetenceOutcome["descriptor"];
  if (linguistic >= q(0.80)) descriptor = "exceptional";
  else if (linguistic >= q(0.65)) descriptor = "good";
  else if (linguistic >= q(0.50)) descriptor = "adequate";
  else if (linguistic >= q(0.30)) descriptor = "poor";
  else descriptor = "failure";

  return {
    quality_Q: linguistic,
    timeTaken_s: task.timeBase_s,
    success: linguistic >= q(0.50),
    descriptor,
    details: { linguistic_Q: linguistic },
  };
}

/**
 * Resolve interpersonal tasks.
 */
function resolveInterpersonal(
  actor: Entity,
  task: CompetenceTask,
  action: CompetenceAction,
  world: WorldState,
): Omit<CompetenceOutcome, "domain" | "xpGained" | "narrativeLine"> & {
  details: unknown;
} {
  if (task.taskId.includes("teach")) {
    // Find learner
    const learner = action.targetEntityId
      ? world.entities.find((e) => e.id === action.targetEntityId)
      : undefined;

    if (!learner) {
      return {
        quality_Q: q(0),
        timeTaken_s: task.timeBase_s,
        success: false,
        descriptor: "failure",
        details: { error: "No learner found" },
      };
    }

    const spec: TeachingSpec = {
      domain: "meleeCombat",
      hours: task.timeBase_s / 3600,
    };

    const result = resolveTeaching(actor, learner, spec);

    let descriptor: CompetenceOutcome["descriptor"];
    if (result.xpGained >= 30) descriptor = "exceptional";
    else if (result.xpGained >= 20) descriptor = "good";
    else if (result.xpGained >= 10) descriptor = "adequate";
    else if (result.xpGained > 0) descriptor = "poor";
    else descriptor = "failure";

    return {
      quality_Q: result.teachingQuality_Q,
      timeTaken_s: task.timeBase_s,
      success: result.xpGained > 0,
      descriptor,
      details: { xpGained: result.xpGained, teacherFatigueJ: result.teacherFatigueJ },
    };
  }

  if (task.taskId.includes("rally")) {
    // Rally uses interpersonal + willpower check
    const interpersonal = getDomainIntelligence(actor, "interpersonal");
    const rng = makeRng(action.seed, SCALE.Q);
    const roll = rng.q01();
    const success = roll < interpersonal;

    let descriptor: CompetenceOutcome["descriptor"];
    if (interpersonal >= q(0.80) && success) descriptor = "exceptional";
    else if (interpersonal >= q(0.60) && success) descriptor = "good";
    else if (success) descriptor = "adequate";
    else if (interpersonal >= q(0.40)) descriptor = "poor";
    else descriptor = "failure";

    return {
      quality_Q: interpersonal,
      timeTaken_s: task.timeBase_s,
      success,
      descriptor,
      details: { fearReduction_Q: mulDiv(interpersonal, q(0.30), SCALE.Q) },
    };
  }

  // Detect deception - simplified
  const interpersonal = getDomainIntelligence(actor, "interpersonal");

  return {
    quality_Q: interpersonal,
    timeTaken_s: task.timeBase_s,
    success: interpersonal >= q(0.50),
    descriptor: interpersonal >= q(0.70) ? "good" : interpersonal >= q(0.40) ? "adequate" : "poor",
    details: { interpersonal_Q: interpersonal },
  };
}

/**
 * Resolve logical-mathematical tasks.
 */
function resolveLogicalMathematical(
  actor: Entity,
  task: CompetenceTask,
  action: CompetenceAction,
): Omit<CompetenceOutcome, "domain" | "xpGained" | "narrativeLine"> & {
  details: unknown;
} {
  const category = task.taskId.includes("fortification")
    ? "fortification"
    : task.taskId.includes("siege")
      ? "mechanism"
      : "weapon";

  const spec: EngineeringSpec = {
    category: category as EngineeringSpec["category"],
    complexity_Q: task.difficulty_Q,
    timeBudget_h: task.timeBase_s / 3600,
  };

  const result = resolveEngineering(actor, spec, action.seed);

  return {
    quality_Q: result.qualityMul,
    timeTaken_s: result.timeTaken_h * 3600,
    success: result.descriptor !== "failure",
    descriptor: result.descriptor,
    details: { qualityMul: result.qualityMul, latentFlaw: result.latentFlaw },
  };
}

/**
 * Resolve musical tasks.
 */
function resolveMusical(
  actor: Entity,
  task: CompetenceTask,
  action: CompetenceAction,
): Omit<CompetenceOutcome, "domain" | "xpGained" | "narrativeLine"> & {
  details: unknown;
} {
  if (task.taskId.includes("compose")) {
    // Composition is simpler - just check musical skill vs difficulty
    const musical = getDomainIntelligence(actor, "musical");
    const rng = makeRng(action.seed, SCALE.Q);
    const roll = rng.q01();

    const difficultyPenalty = mulDiv(task.difficulty_Q, q(0.30), SCALE.Q);
    const effectiveSkill = clampQ(
      (musical - difficultyPenalty) as Q,
      q(0),
      SCALE.Q as Q,
    );

    const success = roll < effectiveSkill;

    let descriptor: CompetenceOutcome["descriptor"];
    if (effectiveSkill >= q(0.85) && success) descriptor = "exceptional";
    else if (effectiveSkill >= q(0.65) && success) descriptor = "good";
    else if (success) descriptor = "adequate";
    else if (effectiveSkill >= q(0.40)) descriptor = "poor";
    else descriptor = "failure";

    return {
      quality_Q: effectiveSkill,
      timeTaken_s: task.timeBase_s,
      success,
      descriptor,
      details: { compositionQuality_Q: effectiveSkill },
    };
  }

  if (task.taskId.includes("signal")) {
    // Formation signaling - simplified without needing a listener
    const musical = getDomainIntelligence(actor, "musical");

    let descriptor: CompetenceOutcome["descriptor"];
    if (musical >= q(0.80)) descriptor = "exceptional";
    else if (musical >= q(0.60)) descriptor = "good";
    else if (musical >= q(0.40)) descriptor = "adequate";
    else if (musical >= q(0.25)) descriptor = "poor";
    else descriptor = "failure";

    return {
      quality_Q: musical,
      timeTaken_s: task.timeBase_s,
      success: musical >= q(0.40),
      descriptor,
      details: { signalClarity_Q: musical },
    };
  }

  // Performance
  const spec: PerformanceSpec = {
    performanceType: "rally",
    duration_s: task.timeBase_s,
    audienceCount: 5,
    range_m: 50,
  };

  const result = resolvePerformance(actor, spec);

  return {
    quality_Q: mulDiv(result.fearDecayBonus_Q, SCALE.Q, q(0.020)) as Q,
    timeTaken_s: task.timeBase_s,
    success: result.descriptor !== "poor",
    descriptor: result.descriptor,
    details: { fearDecayBonus_Q: result.fearDecayBonus_Q, willpowerDrained: result.willpowerDrained_J },
  };
}

/**
 * Resolve intrapersonal tasks.
 */
function resolveIntrapersonal(
  actor: Entity,
  task: CompetenceTask,
  action: CompetenceAction,
): Omit<CompetenceOutcome, "domain" | "xpGained" | "narrativeLine"> & {
  details: unknown;
} {
  const intrapersonal = getDomainIntelligence(actor, "intrapersonal");

  if (task.taskId.includes("meditate")) {
    // Meditation restores willpower
    const willpowerRestored = Math.round(
      (intrapersonal / SCALE.Q) * 5000 * (task.timeBase_s / 1800),
    );

    let descriptor: CompetenceOutcome["descriptor"];
    if (intrapersonal >= q(0.80)) descriptor = "exceptional";
    else if (intrapersonal >= q(0.60)) descriptor = "good";
    else if (intrapersonal >= q(0.40)) descriptor = "adequate";
    else descriptor = "poor";

    return {
      quality_Q: intrapersonal,
      timeTaken_s: task.timeBase_s,
      success: true,
      descriptor,
      details: { willpowerRestored },
    };
  }

  // Resist temptation
  const rng = makeRng(action.seed, SCALE.Q);
  const roll = rng.q01();
  const difficultyPenalty = mulDiv(task.difficulty_Q, q(0.30), SCALE.Q);
  const effectiveWillpower = clampQ(
    (intrapersonal - difficultyPenalty) as Q,
    q(0),
    SCALE.Q as Q,
  );
  const success = roll < effectiveWillpower;

  let descriptor: CompetenceOutcome["descriptor"];
  if (success && effectiveWillpower >= q(0.70)) descriptor = "exceptional";
  else if (success) descriptor = "good";
  else if (effectiveWillpower >= q(0.40)) descriptor = "adequate";
  else descriptor = "failure";

  return {
    quality_Q: effectiveWillpower,
    timeTaken_s: task.timeBase_s,
    success,
    descriptor,
    details: { resistanceStrength_Q: effectiveWillpower },
  };
}

// ── Main Router ───────────────────────────────────────────────────────────────

/**
 * Resolve a competence action.
 *
 * This is the main entry point for the Phase 40 competence framework.
 * It routes to the appropriate domain-specific resolver and computes
 * XP gain for Phase 21 integration.
 *
 * @param actor - The entity performing the action.
 * @param action - The competence action specification.
 * @param world - The world state (for finding targets, etc.).
 * @returns Competence outcome with quality, XP, and narrative.
 */
export function resolveCompetence(
  actor: Entity,
  action: CompetenceAction,
  world: WorldState,
): CompetenceOutcome {
  // Look up task
  const task = getTaskById(action.taskId);
  if (!task) {
    return {
      domain: action.domain,
      quality_Q: q(0),
      timeTaken_s: 0,
      success: false,
      descriptor: "failure",
      xpGained: 0,
      narrativeLine: `Unknown task: ${action.taskId}`,
    };
  }

  // Route to domain-specific resolver
  let result: Omit<CompetenceOutcome, "domain" | "xpGained" | "narrativeLine"> & {
    details: unknown;
  };

  switch (task.domain) {
    case "bodilyKinesthetic":
      result = resolveBodilyKinesthetic(actor, task, action);
      break;
    case "spatial":
      result = resolveSpatial(actor, task, action);
      break;
    case "naturalist":
      result = resolveNaturalist(actor, task, action);
      break;
    case "interSpecies":
      result = resolveInterSpecies(actor, task, action);
      break;
    case "linguistic":
      result = resolveLinguistic(actor, task, action, world);
      break;
    case "interpersonal":
      result = resolveInterpersonal(actor, task, action, world);
      break;
    case "logicalMathematical":
      result = resolveLogicalMathematical(actor, task, action);
      break;
    case "musical":
      result = resolveMusical(actor, task, action);
      break;
    case "intrapersonal":
      result = resolveIntrapersonal(actor, task, action);
      break;
    default:
      result = {
        quality_Q: q(0.50),
        timeTaken_s: task.timeBase_s,
        success: true,
        descriptor: "adequate",
        details: {},
      };
  }

  // Calculate XP
  const xpGained = calculateXP(result.descriptor, task.difficulty_Q);

  // Generate narrative if requested
  const narrativeLine = action.narrative
    ? generateNarrative(task, { ...result, domain: action.domain, xpGained } as CompetenceOutcome, actor)
    : undefined;

  return {
    domain: action.domain,
    quality_Q: result.quality_Q,
    timeTaken_s: result.timeTaken_s,
    success: result.success,
    descriptor: result.descriptor,
    xpGained,
    narrativeLine,
    details: result.details,
  };
}

// ── Utility Exports ───────────────────────────────────────────────────────────

export { getDomainIntelligence, canonicalizeDescriptor, calculateXP };
