// src/narrative-stress.ts — Phase 63: Narrative Stress Test
//
// Runs a scenario across many deterministic seeds and measures how probable
// a sequence of expected story beats is.  The inverse of that probability is
// the "narrative push" — the authorial effort required to make the story happen.
//
// Uses only existing infrastructure: stepWorld, makeRng/eventSeed, no new
// simulation primitives required.

import type { WorldState } from "./sim/world.js";
import type { CommandMap } from "./sim/commands.js";
import type { KernelContext } from "./sim/context.js";
import { stepWorld } from "./sim/kernel.js";
import { q, SCALE, type Q } from "./units.js";
import { TUNING } from "./sim/tuning.js";
import { TICK_HZ } from "./sim/tick.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A function that returns the commands to issue on each tick.
 * Receives the current WorldState so AI or scripted logic can react to it.
 */
export type CommandProvider = (world: WorldState) => CommandMap;

/**
 * A single expected story outcome that must become true within a tick window.
 * A beat "passes" in a given run the first time its predicate returns true
 * at any tick in [tickWindow[0], tickWindow[1]] (inclusive, post-step).
 */
export interface NarrativeBeat {
  /** [firstTick, lastTick] inclusive range checked after each stepWorld call. */
  tickWindow: [number, number];
  /** Returns true when this beat's condition is satisfied. */
  predicate: (world: WorldState) => boolean;
  /** Human-readable label shown in reports. */
  description: string;
}

/**
 * A complete narrative scenario: world factory, command provider, and beats.
 *
 * Each trial overrides `world.seed` so the same setup runs deterministically
 * across a range of seeds — no two trials share state.
 */
export interface NarrativeScenario {
  name: string;
  description?: string;
  /** Returns a fresh WorldState.  `world.seed` is overridden per trial. */
  setup: () => WorldState;
  /** Supplies commands each tick (AI, scripted, or mixed). */
  commands: CommandProvider;
  /** All beats must pass for a run to count as a success. */
  beats: NarrativeBeat[];
  /** Maximum ticks per trial.  Default: 600 (30 s at 20 Hz). */
  maxTicks?: number;
}

/** Per-beat aggregate across all trials. */
export interface BeatResult {
  description: string;
  /** Fraction of runs where this beat was satisfied within its window. */
  passRate: number;
  /**
   * Per-beat narrative push: `1 − passRate`.
   * Identifies the bottleneck beat — the one that most resists the story.
   */
  beatPush: number;
}

/** Aggregate result of a full stress test run. */
export interface StressTestResult {
  scenarioName: string;
  runsTotal: number;
  /**
   * Fraction of runs where ALL beats were satisfied.
   * 1.0 = story happens every time; 0.0 = story never happens.
   */
  successRate: number;
  /**
   * Narrative push required to make the story happen: `1 − successRate`.
   * 0.00 = no push needed (plausible);
   * 1.00 = miracle required (extreme plot armour).
   */
  narrativePush: number;
  /**
   * Deus Ex score: `narrativePush × 10`, rounded to one decimal place.
   * A 0–10 scale for quick human communication:
   *   0.0–1.0 = plausible (no authorial help needed)
   *   1.0–4.0 = light touch
   *   4.0–7.0 = moderate intervention
   *   7.0–9.0 = heavy plot armour
   *   9.0–10.0 = miracle required
   */
  deusExScore: number;
  /** Per-beat breakdown — identify which beat is the bottleneck. */
  beatResults: BeatResult[];
  /**
   * Seeds that produced successful runs.
   * Use these to replay and visually inspect a "canonical" version of the scene.
   */
  successSeeds: number[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_TICKS = 30 * TICK_HZ; // 30 s × 20 Hz = 600 ticks

/** Consciousness threshold below which an entity is considered defeated. */
export const DEFEATED_CONSCIOUSNESS: Q = q(0.10);

// ─── Beat predicate helpers ───────────────────────────────────────────────────

/**
 * Beat passes when entity `entityId` is dead or unconscious
 * (consciousness ≤ DEFEATED_CONSCIOUSNESS).
 */
export function beatEntityDefeated(
  entityId: number,
): (world: WorldState) => boolean {
  return (world) => {
    const entity = world.entities.find(e => e.id === entityId);
    if (!entity) return false;
    return entity.injury.dead || entity.injury.consciousness <= DEFEATED_CONSCIOUSNESS;
  };
}

/**
 * Beat passes when entity `entityId` is alive and conscious
 * (not dead, consciousness > DEFEATED_CONSCIOUSNESS).
 */
export function beatEntitySurvives(
  entityId: number,
): (world: WorldState) => boolean {
  return (world) => {
    const entity = world.entities.find(e => e.id === entityId);
    if (!entity) return false;
    return !entity.injury.dead && entity.injury.consciousness > DEFEATED_CONSCIOUSNESS;
  };
}

/**
 * Beat passes when ALL entities on `teamId` are defeated.
 */
export function beatTeamDefeated(
  teamId: number,
): (world: WorldState) => boolean {
  return (world) => {
    const team = world.entities.filter(e => e.teamId === teamId);
    if (team.length === 0) return false;
    return team.every(
      e => e.injury.dead || e.injury.consciousness <= DEFEATED_CONSCIOUSNESS,
    );
  };
}

/**
 * Beat passes when entity `entityId` shock exceeds `thresholdQ`.
 * Useful for "hero takes a serious hit but survives" beats.
 */
export function beatEntityShockExceeds(
  entityId: number,
  thresholdQ: Q,
): (world: WorldState) => boolean {
  return (world) => {
    const entity = world.entities.find(e => e.id === entityId);
    if (!entity) return false;
    return entity.injury.shock > thresholdQ;
  };
}

/**
 * Beat passes when entity `entityId` fatigue exceeds `thresholdQ`.
 */
export function beatEntityFatigued(
  entityId: number,
  thresholdQ: Q,
): (world: WorldState) => boolean {
  return (world) => {
    const entity = world.entities.find(e => e.id === entityId);
    if (!entity) return false;
    return entity.energy.fatigue > thresholdQ;
  };
}

// ─── Core runner ──────────────────────────────────────────────────────────────

/**
 * Run `scenario` once per seed in `seeds`, checking each beat's predicate
 * after every tick within its declared window.
 *
 * A run "succeeds" only when every beat passes at least once within its window.
 * `successRate` is the fraction of successful runs; `narrativePush = 1 − successRate`.
 */
export function runNarrativeStressTest(
  scenario: NarrativeScenario,
  seeds: readonly number[],
  options?: { ctx?: KernelContext },
): StressTestResult {
  const maxTicks = scenario.maxTicks ?? DEFAULT_MAX_TICKS;
  const ctx: KernelContext = {
    tractionCoeff: q(1.0),
    tuning: TUNING.tactical,
    ...options?.ctx,
  };

  const nBeats        = scenario.beats.length;
  const beatPassCounts = new Array<number>(nBeats).fill(0);
  let   successCount   = 0;
  const successSeeds: number[] = [];

  for (const seed of seeds) {
    const world = scenario.setup();
    world.seed  = seed;

    const beatPassed = new Array<boolean>(nBeats).fill(false);
    let   allPassed  = false;

    for (let t = 0; t < maxTicks; t++) {
      const commands = scenario.commands(world);
      stepWorld(world, commands, ctx);

      const tick = world.tick;

      for (let b = 0; b < nBeats; b++) {
        if (beatPassed[b]) continue;
        const beat = scenario.beats[b]!;
        if (tick >= beat.tickWindow[0] && tick <= beat.tickWindow[1]) {
          if (beat.predicate(world)) {
            beatPassed[b] = true;
          }
        }
      }

      // Early exit: all beats have passed
      allPassed = beatPassed.every(Boolean);
      if (allPassed) break;
    }

    for (let b = 0; b < nBeats; b++) {
      if (beatPassed[b]) beatPassCounts[b]! ++;
    }

    if (allPassed) {
      successCount++;
      successSeeds.push(seed);
    }
  }

  const runsTotal    = seeds.length;
  const successRate  = runsTotal > 0 ? successCount / runsTotal : 0;
  const narrativePush = runsTotal > 0
    ? Math.round((1 - successRate) * 10000) / 10000
    : 0;
  const deusExScore  = Math.round(narrativePush * 100) / 10;  // 0–10, 1 d.p.

  return {
    scenarioName: scenario.name,
    runsTotal,
    successRate,
    narrativePush,
    deusExScore,
    beatResults: scenario.beats.map((beat, b) => {
      const passRate = runsTotal > 0 ? beatPassCounts[b]! / runsTotal : 0;
      return {
        description: beat.description,
        passRate,
        beatPush: Math.round((1 - passRate) * 10000) / 10000,
      };
    }),
    successSeeds,
  };
}

// ─── Report formatter ─────────────────────────────────────────────────────────

/**
 * Format a stress test result as a human-readable text report.
 */
export function formatStressTestReport(result: StressTestResult): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  const pushLabel =
    result.narrativePush < 0.10 ? "none — plausible" :
    result.narrativePush < 0.40 ? "light" :
    result.narrativePush < 0.70 ? "moderate" :
    result.narrativePush < 0.90 ? "heavy" : "extreme — plot armour";

  const lines: string[] = [
    `Narrative Stress Test: ${result.scenarioName}`,
    "─".repeat(52),
    `Runs:            ${result.runsTotal}`,
    `Success rate:    ${pct(result.successRate)}`,
    `Narrative push:  ${result.narrativePush.toFixed(4)}  (${pushLabel})`,
    `Deus Ex score:   ${result.deusExScore.toFixed(1)} / 10`,
    "",
    "Beat breakdown:",
  ];

  for (const b of result.beatResults) {
    const icon = b.passRate >= 0.90 ? "✓" : b.passRate >= 0.50 ? "~" : "✗";
    const pushStr = `[push ${b.beatPush.toFixed(2)}]`;
    lines.push(`  ${icon} ${pct(b.passRate).padStart(6)}  ${pushStr}  ${b.description}`);
  }

  const shown = result.successSeeds.slice(0, 10);
  if (shown.length > 0) {
    const suffix = result.successSeeds.length > 10
      ? ` … (${result.successSeeds.length} total)` : "";
    lines.push("", `Success seeds: ${shown.join(", ")}${suffix}`);
  }

  return lines.join("\n");
}
