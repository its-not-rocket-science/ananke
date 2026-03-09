// src/competence/catalogue.ts — Phase 40: Competence Catalogue
//
// Predefined competence tasks with difficulty, time requirements, and domain.
// Parallel to weapons and food catalogues.

import type { Q } from "../units.js";
import { q } from "../units.js";

/** Domain of competence — maps to cognitive intelligence types. */
export type CompetenceDomain =
  | "linguistic"
  | "logicalMathematical"
  | "spatial"
  | "bodilyKinesthetic"
  | "musical"
  | "interpersonal"
  | "intrapersonal"
  | "naturalist"
  | "interSpecies";

/** A single competence task definition. */
export interface CompetenceTask {
  /** Unique task identifier. */
  taskId: string;
  /** Primary competence domain. */
  domain: CompetenceDomain;
  /** Secondary domain (optional, for compound tasks). */
  secondaryDomain?: CompetenceDomain;
  /** Difficulty rating (0–1). */
  difficulty_Q: Q;
  /** Base time required in seconds. */
  timeBase_s: number;
  /** Required tool/equipment (optional). */
  requiredTool?: string;
  /** Human-readable description. */
  description: string;
}

// ── Catalogue Entries ─────────────────────────────────────────────────────────

const entries: CompetenceTask[] = [
  // ── Bodily-Kinesthetic (crafting, physical skill) ────────────────────────────
  {
    taskId: "craft_sword_basic",
    domain: "bodilyKinesthetic",
    difficulty_Q: q(0.40),
    timeBase_s: 14400, // 4 hours
    requiredTool: "forge",
    description: "Forge a basic serviceable sword",
  },
  {
    taskId: "craft_sword_master",
    domain: "bodilyKinesthetic",
    difficulty_Q: q(0.85),
    timeBase_s: 28800, // 8 hours
    requiredTool: "forge",
    description: "Forge a masterwork sword",
  },
  {
    taskId: "treat_wound_field",
    domain: "bodilyKinesthetic",
    difficulty_Q: q(0.50),
    timeBase_s: 300, // 5 minutes
    requiredTool: "medical_kit",
    description: "Field treatment of bleeding wound",
  },
  {
    taskId: "perform_surgery",
    domain: "bodilyKinesthetic",
    difficulty_Q: q(0.75),
    timeBase_s: 3600, // 1 hour
    requiredTool: "surgical_kit",
    description: "Surgical repair of internal injuries",
  },

  // ── Spatial (navigation, wayfinding) ────────────────────────────────────────
  {
    taskId: "navigate_wilderness",
    domain: "spatial",
    difficulty_Q: q(0.50),
    timeBase_s: 3600, // per hour of travel
    description: "Navigate through untracked wilderness",
  },
  {
    taskId: "navigate_urban",
    domain: "spatial",
    difficulty_Q: q(0.30),
    timeBase_s: 600, // 10 minutes
    description: "Find route through complex urban environment",
  },
  {
    taskId: "read_map",
    domain: "spatial",
    difficulty_Q: q(0.25),
    timeBase_s: 60, // 1 minute
    requiredTool: "map",
    description: "Interpret map and locate position",
  },

  // ── Naturalist (tracking, foraging, animal handling) ─────────────────────────
  {
    taskId: "track_quarry_fresh",
    domain: "naturalist",
    difficulty_Q: q(0.30),
    timeBase_s: 1800, // 30 minutes
    description: "Track quarry with fresh trail (< 1 hour)",
  },
  {
    taskId: "track_quarry_aged",
    domain: "naturalist",
    difficulty_Q: q(0.60),
    timeBase_s: 3600, // 1 hour
    description: "Track quarry with aged trail (> 1 day)",
  },
  {
    taskId: "forage_herbs",
    domain: "naturalist",
    difficulty_Q: q(0.35),
    timeBase_s: 3600, // 1 hour
    description: "Search for medicinal herbs",
  },
  {
    taskId: "identify_herb",
    domain: "naturalist",
    difficulty_Q: q(0.25),
    timeBase_s: 60, // 1 minute
    description: "Identify unknown plant and properties",
  },
  {
    taskId: "tame_horse",
    domain: "naturalist",
    secondaryDomain: "interSpecies",
    difficulty_Q: q(0.40),
    timeBase_s: 7200, // 2 hours per session
    description: "Build trust with untrained horse",
  },

  // ── Inter-Species (communication across species boundaries) ───────────────────
  {
    taskId: "signal_alien_species",
    domain: "interSpecies",
    difficulty_Q: q(0.60),
    timeBase_s: 300, // 5 minutes
    description: "Attempt first-contact communication with unknown species",
  },
  {
    taskId: "calm_agitated_beast",
    domain: "interSpecies",
    difficulty_Q: q(0.55),
    timeBase_s: 600, // 10 minutes
    description: "Calm frightened or aggressive animal",
  },

  // ── Linguistic (language, communication) ─────────────────────────────────────
  {
    taskId: "negotiate_treaty",
    domain: "linguistic",
    secondaryDomain: "interpersonal",
    difficulty_Q: q(0.70),
    timeBase_s: 1800, // 30 minutes
    description: "Negotiate terms between conflicting parties",
  },
  {
    taskId: "translate_foreign",
    domain: "linguistic",
    difficulty_Q: q(0.50),
    timeBase_s: 3600, // 1 hour per page
    requiredTool: "reference_texts",
    description: "Translate unfamiliar language",
  },
  {
    taskId: "command_formation",
    domain: "linguistic",
    difficulty_Q: q(0.40),
    timeBase_s: 60, // 1 minute
    description: "Issue clear commands to military formation",
  },

  // ── Interpersonal (teaching, leadership, empathy) ────────────────────────────
  {
    taskId: "teach_skill",
    domain: "interpersonal",
    difficulty_Q: q(0.45),
    timeBase_s: 3600, // 1 hour lesson
    description: "Teach specific skill to student",
  },
  {
    taskId: "rally_troops",
    domain: "interpersonal",
    difficulty_Q: q(0.55),
    timeBase_s: 300, // 5 minutes
    description: "Rally frightened troops back to combat readiness",
  },
  {
    taskId: "detect_deception",
    domain: "interpersonal",
    difficulty_Q: q(0.50),
    timeBase_s: 60, // 1 minute during conversation
    description: "Detect lies and falsehoods in conversation",
  },

  // ── Logical-Mathematical (engineering, planning, analysis) ────────────────────
  {
    taskId: "design_fortification",
    domain: "logicalMathematical",
    difficulty_Q: q(0.60),
    timeBase_s: 86400, // 1 day
    requiredTool: "drafting_tools",
    description: "Engineer defensive fortification plans",
  },
  {
    taskId: "design_siege_engine",
    domain: "logicalMathematical",
    difficulty_Q: q(0.75),
    timeBase_s: 172800, // 2 days
    requiredTool: "drafting_tools",
    description: "Design complex siege machinery",
  },
  {
    taskId: "solve_tactical_puzzle",
    domain: "logicalMathematical",
    difficulty_Q: q(0.55),
    timeBase_s: 1800, // 30 minutes
    description: "Analyze tactical situation and propose solution",
  },

  // ── Musical (performance, signaling) ─────────────────────────────────────────
  {
    taskId: "compose_march",
    domain: "musical",
    difficulty_Q: q(0.35),
    timeBase_s: 1800, // 30 minutes
    description: "Compose military marching cadence",
  },
  {
    taskId: "perform_morale",
    domain: "musical",
    difficulty_Q: q(0.45),
    timeBase_s: 1800, // 30 minutes performance
    description: "Musical performance to boost morale",
  },
  {
    taskId: "signal_formation",
    domain: "musical",
    difficulty_Q: q(0.30),
    timeBase_s: 10, // 10 seconds
    requiredTool: "signal_horn_or_drum",
    description: "Signal formation maneuver via horn/drum",
  },

  // ── Intrapersonal (meditation, willpower) ────────────────────────────────────
  {
    taskId: "meditate_focus",
    domain: "intrapersonal",
    difficulty_Q: q(0.25),
    timeBase_s: 1800, // 30 minutes
    description: "Meditation to restore willpower",
  },
  {
    taskId: "resist_temptation",
    domain: "intrapersonal",
    difficulty_Q: q(0.50),
    timeBase_s: 60, // 1 minute decision point
    description: "Resist immediate temptation for long-term gain",
  },
];

// ── Exported Catalogue ───────────────────────────────────────────────────────

/** Read-only catalogue of all competence tasks. */
export const COMPETENCE_CATALOGUE: readonly CompetenceTask[] = Object.freeze(entries);

/** Lookup map for taskId → task. */
export const COMPETENCE_TASK_BY_ID: ReadonlyMap<string, CompetenceTask> = new Map(
  entries.map((e) => [e.taskId, e]),
);

/** Get a task by ID. Returns undefined if not found. */
export function getTaskById(taskId: string): CompetenceTask | undefined {
  return COMPETENCE_TASK_BY_ID.get(taskId);
}

/** Check if a task exists in the catalogue. */
export function hasTask(taskId: string): boolean {
  return COMPETENCE_TASK_BY_ID.has(taskId);
}

/** Get all tasks for a specific domain. */
export function getTasksByDomain(domain: CompetenceDomain): CompetenceTask[] {
  return entries.filter((t) => t.domain === domain || t.secondaryDomain === domain);
}
