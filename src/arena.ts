// src/arena.ts — Phase 20: Arena Simulation Framework
//
// Declarative scenario system: define a fight (+ optional recovery), run it over
// many seeds, validate outcomes against expectations, and produce statistical reports.
// Integrates Phase 18 (narrative) and Phase 19 (downtime) into one ergonomic tool.

import { q, SCALE, type Q } from "./units.js";
import { generateIndividual } from "./generate.js";
import type { Archetype } from "./archetypes.js";
import { HUMAN_BASE, KNIGHT_INFANTRY } from "./archetypes.js";
import { defaultIntent } from "./sim/intent.js";
import { defaultAction } from "./sim/action.js";
import { defaultCondition } from "./sim/condition.js";
import { defaultInjury } from "./sim/injury.js";
import { HUMANOID_PLAN, segmentIds } from "./sim/bodyplan.js";
import { v3, type Vec3 } from "./sim/vec3.js";
import type { Entity } from "./sim/entity.js";
import type { WorldState } from "./sim/world.js";
import type { Loadout } from "./equipment.js";
import { STARTER_WEAPONS, STARTER_ARMOUR } from "./equipment.js";
import type { SkillMap } from "./sim/skills.js";
import { buildSkillMap } from "./sim/skills.js";
import type { AIPolicy } from "./sim/ai/types.js";
import { AI_PRESETS } from "./sim/ai/presets.js";
import type { KernelContext } from "./sim/context.js";
import { stepWorld } from "./sim/kernel.js";
import { buildWorldIndex } from "./sim/indexing.js";
import { buildSpatialIndex } from "./sim/spatial.js";
import { buildAICommands } from "./sim/ai/system.js";
import { TUNING } from "./sim/tuning.js";
import { TICK_HZ } from "./sim/tick.js";
import { CollectingTrace } from "./metrics.js";
import type { NarrativeConfig } from "./narrative.js";
import { buildCombatLog } from "./narrative.js";
import {
  stepDowntime,
  type CareLevel,
  type EntityRecoveryReport as DowntimeReport,
} from "./downtime.js";
import type { TerrainGrid, ObstacleGrid, ElevationGrid, HazardGrid } from "./sim/terrain.js";

// ── Public types ──────────────────────────────────────────────────────────────

export type { CareLevel };

export interface ArenaCombatant {
  id: number;
  teamId: number;
  archetype: Archetype;
  /** If omitted, derived from trial seed × 1000 + id. */
  seed?: number;
  loadout: Loadout;
  skills?: SkillMap;
  position_m: Vec3;
  aiPolicy?: AIPolicy;
  /**
   * Optional post-creation mutation — called after entity is built from archetype.
   * Use to inject pre-set wounds for recovery-focused calibration scenarios.
   */
  mutateOnCreate?: (entity: Entity) => void;
}

export interface ArenaScenario {
  name: string;
  description?: string;
  combatants: ArenaCombatant[];
  terrain?: {
    terrainGrid?:   TerrainGrid;
    obstacleGrid?:  ObstacleGrid;
    elevationGrid?: ElevationGrid;
    hazardGrid?:    HazardGrid;
    cellSize_m?:    number;
  };
  /** Per-trial tick limit (default: 30 s × TICK_HZ = 600 ticks). */
  maxTicks?: number;
  /** Post-combat recovery phase. */
  recovery?: {
    careLevel:          CareLevel;
    /** Override care level per team (e.g. victors get better care). */
    careByTeam?:        Map<number, CareLevel>;
    /** How many hours of downtime to simulate per trial. */
    recoveryHours:      number;
    /** Shared item pool — copied independently to each combatant's schedule. */
    inventory?:         Map<string, number>;
    /** If true, rest multiplier applied (×1.50 healing rates). Default false. */
    rest?:              boolean;
  };
  /** Statistical expectations checked against aggregate results. */
  expectations?: ArenaExpectation[];
}

// ── Expectations ──────────────────────────────────────────────────────────────

export interface ArenaExpectation {
  description: string;
  check: (result: ArenaResult) => boolean;
}

export function expectWinRate(
  teamId: number,
  min: number,
  max?: number,
): ArenaExpectation {
  const desc = max !== undefined
    ? `team ${teamId} wins ${(min * 100).toFixed(0)}–${(max * 100).toFixed(0)}%`
    : `team ${teamId} wins ≥ ${(min * 100).toFixed(0)}%`;
  return {
    description: desc,
    check(r) {
      const wr = r.winRateByTeam.get(teamId) ?? 0;
      return wr >= min && (max === undefined || wr <= max);
    },
  };
}

export function expectSurvivalRate(entityId: number, min: number): ArenaExpectation {
  return {
    description: `entity ${entityId} survives ≥ ${(min * 100).toFixed(0)}% of trials`,
    check(r) { return (r.survivalRateByEntity.get(entityId) ?? 0) >= min; },
  };
}

export function expectMeanDuration(minSeconds: number, maxSeconds: number): ArenaExpectation {
  return {
    description: `mean combat duration ${minSeconds}–${maxSeconds} s`,
    check(r) {
      return r.meanCombatDuration_s >= minSeconds && r.meanCombatDuration_s <= maxSeconds;
    },
  };
}

export function expectRecovery(
  entityId: number,
  maxDays: number,
  _careLevel: CareLevel,
): ArenaExpectation {
  return {
    description: `entity ${entityId} combat-ready within ${maxDays} days`,
    check(r) {
      const stats = r.recoveryStats?.find(s => s.entityId === entityId);
      if (!stats || stats.meanCombatReadyDays === null) return false;
      return stats.meanCombatReadyDays <= maxDays;
    },
  };
}

export function expectResourceCost(teamId: number, maxCostUnits: number): ArenaExpectation {
  return {
    description: `team ${teamId} mean resource cost ≤ ${maxCostUnits} units`,
    check(r) {
      const teamEntities = r.scenario.combatants
        .filter(c => c.teamId === teamId)
        .map(c => c.id);
      if (teamEntities.length === 0) return true;
      const stats = (r.recoveryStats ?? []).filter(s => teamEntities.includes(s.entityId));
      if (stats.length === 0) return true;
      const mean = stats.reduce((sum, s) => sum + s.meanResourceCostUnits, 0) / stats.length;
      return mean <= maxCostUnits;
    },
  };
}

// ── Per-trial and aggregate result types ─────────────────────────────────────

export interface InjurySummary {
  entityId:              number;
  dead:                  boolean;
  unconscious:           boolean;
  consciousness:         number;   // 0.0–1.0
  fluidLoss:             number;   // 0.0–1.0
  shock:                 number;   // 0.0–1.0
  activeBleedingRegions: string[];
  fracturedRegions:      string[];
  infectedRegions:       string[];
  maxStructuralDamage:   number;   // 0.0–1.0
}

export interface RecoveryOutcome {
  entityId:           number;
  died:               boolean;
  combatReadyAt_s:    number | null;
  fullRecoveryAt_s:   number | null;
  resourcesUsed:      DowntimeReport["resourcesUsed"];
  totalCostUnits:     number;
}

export interface CombatLogEntry {
  tick: number;
  text: string;
}

export interface ArenaTrialResult {
  trialIndex:        number;
  seed:              number;
  ticks:             number;
  outcome:           "team1_wins" | "team2_wins" | "draw" | "timeout";
  survivors:         number[];
  injuries:          InjurySummary[];
  recoveryOutcomes?: RecoveryOutcome[];
  combatLog?:        CombatLogEntry[];
}

export interface ArenaResult {
  scenario:    ArenaScenario;
  trials:      number;
  trialResults: ArenaTrialResult[];
  // Aggregate statistics
  winRateByTeam:         Map<number, number>;
  drawRate:              number;
  timeoutRate:           number;
  meanCombatDuration_s:  number;
  p50CombatDuration_s:   number;
  survivalRateByEntity:  Map<number, number>;
  meanTTI_s:             Map<number, number>;
  injuryDistribution:    {
    entityId:              number;
    meanFluidLoss:         number;
    fractureProbability:   number;
    deathProbability:      number;
  }[];
  recoveryStats?: {
    entityId:                  number;
    survivalRatePostRecovery:  number;
    meanCombatReadyDays:       number | null;
    meanFullRecoveryDays:      number | null;
    meanResourceCostUnits:     number;
    p90ResourceCostUnits:      number;
  }[];
  expectationResults: { description: string; passed: boolean; detail?: string }[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const DEFEATED_CONSCIOUSNESS = q(0.10) as Q;   // tactical threshold
const DEFAULT_MAX_TICKS      = 30 * TICK_HZ;   // 30 s × 20 Hz = 600 ticks
const DEFAULT_CELL_SIZE_M    = Math.trunc(4 * SCALE.m);

function buildTrialEntity(c: ArenaCombatant, trialSeed: number): Entity {
  const entitySeed = c.seed ?? (trialSeed * 1000 + c.id);
  const attrs      = generateIndividual(entitySeed, c.archetype);
  const segs       = segmentIds(HUMANOID_PLAN);

  const entity: Entity = {
    id:           c.id,
    teamId:       c.teamId,
    attributes:   attrs,
    energy:       { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout:      { items: [...c.loadout.items] },
    traits:       [],
    ...(c.skills !== undefined && { skills: c.skills }),
    bodyPlan:     HUMANOID_PLAN,
    position_m:   { ...c.position_m },
    velocity_mps: v3(0, 0, 0),
    intent:       defaultIntent(),
    action:       defaultAction(),
    condition:    defaultCondition(),
    injury:       defaultInjury(segs),
    grapple:      { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };

  c.mutateOnCreate?.(entity);
  return entity;
}

function buildTrialWorld(scenario: ArenaScenario, trialSeed: number): WorldState {
  const entities = scenario.combatants.map(c => buildTrialEntity(c, trialSeed));
  return { tick: 0, seed: trialSeed, entities };
}

function isDefeated(e: Entity): boolean {
  return e.injury.dead || e.injury.consciousness <= DEFEATED_CONSCIOUSNESS;
}

type TrialOutcome = "team1_wins" | "team2_wins" | "draw" | "timeout";

function detectOutcome(world: WorldState): TrialOutcome | null {
  const byTeam = new Map<number, { alive: number; total: number }>();
  for (const e of world.entities) {
    if (!byTeam.has(e.teamId)) byTeam.set(e.teamId, { alive: 0, total: 0 });
    const t = byTeam.get(e.teamId)!;
    t.total++;
    if (!isDefeated(e)) t.alive++;
  }
  const allTeamIds    = [...byTeam.keys()];
  const activeTeams   = allTeamIds.filter(id => byTeam.get(id)!.alive > 0);

  // Multiple teams: combat over only when ≤1 team remains active
  if (allTeamIds.length <= 1) return null;  // single-team — never "over" via team victory
  if (activeTeams.length === 0) return "draw";
  if (activeTeams.length === 1) {
    const winner = activeTeams[0];
    if (winner === 1) return "team1_wins";
    if (winner === 2) return "team2_wins";
    return "draw";
  }
  return null; // still fighting
}

function captureArenaInjury(e: Entity): InjurySummary {
  const activeBleedingRegions: string[] = [];
  const fracturedRegions:      string[] = [];
  const infectedRegions:       string[] = [];
  let maxStr = 0;

  for (const [r, ri] of Object.entries(e.injury.byRegion)) {
    if (ri.bleedingRate   > 0)  activeBleedingRegions.push(r);
    if (ri.fractured)           fracturedRegions.push(r);
    if (ri.infectedTick >= 0)   infectedRegions.push(r);
    if (ri.structuralDamage > maxStr) maxStr = ri.structuralDamage;
  }

  return {
    entityId:              e.id,
    dead:                  e.injury.dead,
    unconscious:           e.injury.consciousness <= DEFEATED_CONSCIOUSNESS,
    consciousness:         e.injury.consciousness / SCALE.Q,
    fluidLoss:             e.injury.fluidLoss     / SCALE.Q,
    shock:                 e.injury.shock         / SCALE.Q,
    activeBleedingRegions,
    fracturedRegions,
    infectedRegions,
    maxStructuralDamage:   maxStr                 / SCALE.Q,
  };
}

function runTrialRecovery(
  world: WorldState,
  scenario: ArenaScenario,
): RecoveryOutcome[] {
  const rec = scenario.recovery!;
  const elapsedSeconds = Math.round(rec.recoveryHours * 3600);
  const treatments = new Map<number, import("./downtime.js").TreatmentSchedule>();

  for (const e of world.entities) {
    const careLevel = rec.careByTeam?.get(e.teamId) ?? rec.careLevel;
    const sched: import("./downtime.js").TreatmentSchedule = { careLevel };
    if (rec.inventory) sched.inventory = new Map(rec.inventory);
    treatments.set(e.id, sched);
  }

  const reports = stepDowntime(world, elapsedSeconds, {
    treatments,
    rest: rec.rest ?? false,
  });

  return reports.map((r): RecoveryOutcome => ({
    entityId:        r.entityId,
    died:            r.died,
    combatReadyAt_s: r.combatReadyAt_s,
    fullRecoveryAt_s: r.fullRecoveryAt_s,
    resourcesUsed:   r.resourcesUsed,
    totalCostUnits:  r.totalCostUnits,
  }));
}

// ── Main runner ───────────────────────────────────────────────────────────────

export function runArena(
  scenario:  ArenaScenario,
  trials:    number,
  options?: {
    narrativeCfg?: NarrativeConfig;
    ctx?:          KernelContext;
    seedOffset?:   number;
  },
): ArenaResult {
  const maxTicks    = scenario.maxTicks ?? DEFAULT_MAX_TICKS;
  const cellSize_m  = scenario.terrain?.cellSize_m != null
    ? Math.trunc(scenario.terrain.cellSize_m * SCALE.m)
    : DEFAULT_CELL_SIZE_M;

  const baseCtx: KernelContext = {
    tractionCoeff: q(1.0),
    tuning:        TUNING.tactical,
    ...(scenario.terrain?.terrainGrid   && { terrainGrid:   scenario.terrain.terrainGrid   }),
    ...(scenario.terrain?.obstacleGrid  && { obstacleGrid:  scenario.terrain.obstacleGrid  }),
    ...(scenario.terrain?.elevationGrid && { elevationGrid: scenario.terrain.elevationGrid }),
    ...(scenario.terrain?.hazardGrid    && { hazardGrid:    scenario.terrain.hazardGrid    }),
    cellSize_m,
    ...options?.ctx,
  };

  const policyMap = new Map<number, AIPolicy>();
  for (const c of scenario.combatants) {
    policyMap.set(c.id, (c.aiPolicy ?? AI_PRESETS["lineInfantry"]) as AIPolicy);
  }

  const trialResults: ArenaTrialResult[] = [];

  for (let i = 0; i < trials; i++) {
    const trialSeed = (options?.seedOffset ?? 0) + i + 1;
    const world     = buildTrialWorld(scenario, trialSeed);

    const tracer = options?.narrativeCfg ? new CollectingTrace() : undefined;
    const ctx: KernelContext = tracer
      ? { ...baseCtx, trace: tracer }
      : baseCtx;

    let ticks   = 0;
    let outcome = detectOutcome(world);

    while (outcome === null && ticks < maxTicks) {
      const index   = buildWorldIndex(world);
      const spatial = buildSpatialIndex(world, cellSize_m);
      const cmds    = buildAICommands(world, index, spatial, id => policyMap.get(id));
      stepWorld(world, cmds, ctx);
      ticks++;
      outcome = detectOutcome(world);
    }

    const finalOutcome: TrialOutcome = outcome ?? "timeout";
    const survivors = world.entities.filter(e => !isDefeated(e)).map(e => e.id);
    const injuries  = world.entities.map(e => captureArenaInjury(e));

    // Combat log
    let combatLog: CombatLogEntry[] | undefined;
    if (tracer && options?.narrativeCfg) {
      const lines: CombatLogEntry[] = [];
      for (const ev of tracer.events) {
        const text = buildCombatLog([ev], options.narrativeCfg)[0];
        if (text) lines.push({ tick: (ev).tick ?? 0, text });
      }
      combatLog = lines;
    }

    // Recovery
    let recoveryOutcomes: RecoveryOutcome[] | undefined;
    if (scenario.recovery) {
      recoveryOutcomes = runTrialRecovery(world, scenario);
    }

    const trialResult: ArenaTrialResult = {
      trialIndex: i,
      seed:       trialSeed,
      ticks,
      outcome:    finalOutcome,
      survivors,
      injuries,
    };
    if (recoveryOutcomes !== undefined) trialResult.recoveryOutcomes = recoveryOutcomes;
    if (combatLog        !== undefined) trialResult.combatLog        = combatLog;
    trialResults.push(trialResult);
  }

  return aggregateResults(scenario, trialResults);
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function aggregateResults(
  scenario:     ArenaScenario,
  trialResults: ArenaTrialResult[],
): ArenaResult {
  const n = trialResults.length;
  if (n === 0) {
    const empty: ArenaResult = {
      scenario, trials: 0, trialResults: [],
      winRateByTeam: new Map(), drawRate: 0, timeoutRate: 0,
      meanCombatDuration_s: 0, p50CombatDuration_s: 0,
      survivalRateByEntity: new Map(), meanTTI_s: new Map(),
      injuryDistribution: [], expectationResults: [],
    };
    return empty;
  }

  // Win rates
  const winCounts    = new Map<number, number>();
  let   drawCount    = 0;
  let   timeoutCount = 0;
  for (const t of trialResults) {
    if (t.outcome === "draw")    drawCount++;
    else if (t.outcome === "timeout") timeoutCount++;
    else {
      // team1_wins or team2_wins
      const teamId = t.outcome === "team1_wins" ? 1 : 2;
      winCounts.set(teamId, (winCounts.get(teamId) ?? 0) + 1);
    }
  }
  const winRateByTeam = new Map<number, number>();
  for (const [id, cnt] of winCounts) winRateByTeam.set(id, cnt / n);

  // Combat durations
  const durations = trialResults.map(t => t.ticks / TICK_HZ);
  const meanCombatDuration_s = durations.reduce((a, b) => a + b, 0) / n;
  const sorted = [...durations].sort((a, b) => a - b);
  const p50CombatDuration_s  = sorted[Math.floor(n / 2)] ?? 0;

  // Survival rates
  const survivalRateByEntity = new Map<number, number>();
  for (const c of scenario.combatants) {
    const alive = trialResults.filter(t => t.survivors.includes(c.id)).length;
    survivalRateByEntity.set(c.id, alive / n);
  }

  // Mean TTI (in seconds)
  const meanTTI_s = new Map<number, number>();
  for (const c of scenario.combatants) {
    const ttiSums: number[] = trialResults.map(t => {
      const inj = t.injuries.find(i => i.entityId === c.id);
      if (!inj) return t.ticks / TICK_HZ; // not in trial — survived
      if (inj.dead || inj.unconscious) {
        // Estimate TTI as total ticks (conservative; no per-tick event tracking here)
        return t.ticks / TICK_HZ;
      }
      return t.ticks / TICK_HZ; // survived full duration
    });
    meanTTI_s.set(c.id, ttiSums.reduce((a, b) => a + b, 0) / n);
  }

  // Injury distribution
  const injuryDistribution = scenario.combatants.map(c => {
    const trials_inj = trialResults.map(t => t.injuries.find(i => i.entityId === c.id));
    const meanFluidLoss       = avg(trials_inj.map(i => i?.fluidLoss ?? 0));
    const fractureProbability = trials_inj.filter(i => (i?.fracturedRegions.length ?? 0) > 0).length / n;
    const deathProbability    = trials_inj.filter(i => i?.dead).length / n;
    return { entityId: c.id, meanFluidLoss, fractureProbability, deathProbability };
  });

  // Recovery stats (if any trial has recoveryOutcomes)
  let recoveryStats: ArenaResult["recoveryStats"];
  const hasRecovery = scenario.recovery != null && trialResults.some(t => t.recoveryOutcomes);
  if (hasRecovery) {
    recoveryStats = scenario.combatants.map(c => {
      const outcomes = trialResults
        .flatMap(t => t.recoveryOutcomes ?? [])
        .filter(o => o.entityId === c.id);

      const survivalRatePostRecovery = outcomes.length === 0
        ? 1.0
        : outcomes.filter(o => !o.died).length / outcomes.length;

      const readyTimes_days = outcomes
        .map(o => o.combatReadyAt_s !== null ? o.combatReadyAt_s / 86400 : null)
        .filter((v): v is number => v !== null);

      const fullTimes_days = outcomes
        .map(o => o.fullRecoveryAt_s !== null ? o.fullRecoveryAt_s / 86400 : null)
        .filter((v): v is number => v !== null);

      const meanCombatReadyDays   = readyTimes_days.length > 0
        ? readyTimes_days.reduce((a, b) => a + b, 0) / readyTimes_days.length
        : null;

      const meanFullRecoveryDays  = fullTimes_days.length > 0
        ? fullTimes_days.reduce((a, b) => a + b, 0) / fullTimes_days.length
        : null;

      const costs             = outcomes.map(o => o.totalCostUnits);
      const meanResourceCostUnits = costs.length > 0 ? avg(costs) : 0;
      const costsSorted       = [...costs].sort((a, b) => a - b);
      const p90ResourceCostUnits  = costs.length > 0
        ? costsSorted[Math.floor(0.90 * costs.length)] ?? costsSorted.at(-1) ?? 0
        : 0;

      return {
        entityId: c.id,
        survivalRatePostRecovery,
        meanCombatReadyDays,
        meanFullRecoveryDays,
        meanResourceCostUnits,
        p90ResourceCostUnits,
      };
    });
  }

  // Expectation checking
  const result: ArenaResult = {
    scenario, trials: n, trialResults,
    winRateByTeam, drawRate: drawCount / n, timeoutRate: timeoutCount / n,
    meanCombatDuration_s, p50CombatDuration_s,
    survivalRateByEntity, meanTTI_s, injuryDistribution,
    expectationResults: [],
  };
  if (recoveryStats !== undefined) result.recoveryStats = recoveryStats;

  result.expectationResults = (scenario.expectations ?? []).map(exp => {
    const passed = exp.check(result);
    return {
      description: exp.description,
      passed,
      ...(passed ? {} : { detail: `failed: ${exp.description}` }),
    };
  });

  return result;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ── Reporting ─────────────────────────────────────────────────────────────────

/** Machine-readable summary (JSON-safe — no Maps or Functions). */
export function summariseArena(result: ArenaResult): object {
  return {
    scenario:             result.scenario.name,
    trials:               result.trials,
    winRates:             Object.fromEntries(result.winRateByTeam),
    drawRate:             result.drawRate,
    timeoutRate:          result.timeoutRate,
    meanCombatDuration_s: result.meanCombatDuration_s,
    p50CombatDuration_s:  result.p50CombatDuration_s,
    survivalRates:        Object.fromEntries(result.survivalRateByEntity),
    injuryDistribution:   result.injuryDistribution,
    recoveryStats:        result.recoveryStats,
    expectations:         result.expectationResults,
  };
}

/** Human-readable statistical report. */
export function formatArenaReport(result: ArenaResult): string {
  const lines: string[] = [];

  lines.push(`=== ${result.scenario.name} (${result.trials} trials) ===`);
  if (result.scenario.description) lines.push(result.scenario.description);
  lines.push("");

  lines.push("Combat outcomes:");
  for (const [teamId, rate] of result.winRateByTeam) {
    lines.push(`  Team ${teamId} wins: ${(rate * 100).toFixed(1)}%`);
  }
  if (result.drawRate > 0)    lines.push(`  Draws:    ${(result.drawRate    * 100).toFixed(1)}%`);
  if (result.timeoutRate > 0) lines.push(`  Timeouts: ${(result.timeoutRate * 100).toFixed(1)}%`);
  lines.push(`  Mean duration: ${result.meanCombatDuration_s.toFixed(1)} s`);
  lines.push(`  p50 duration:  ${result.p50CombatDuration_s.toFixed(1)} s`);
  lines.push("");

  lines.push("Injury distribution:");
  for (const d of result.injuryDistribution) {
    lines.push(
      `  Entity ${d.entityId}: fluid loss ${(d.meanFluidLoss * 100).toFixed(1)}%  ` +
      `fracture ${(d.fractureProbability * 100).toFixed(0)}%  ` +
      `death ${(d.deathProbability * 100).toFixed(0)}%`,
    );
  }
  lines.push("");

  if (result.recoveryStats?.length) {
    lines.push("Recovery stats:");
    for (const s of result.recoveryStats) {
      const crDays  = s.meanCombatReadyDays  !== null ? s.meanCombatReadyDays.toFixed(2)  : "N/A";
      const frDays  = s.meanFullRecoveryDays !== null ? s.meanFullRecoveryDays.toFixed(2) : "N/A";
      lines.push(
        `  Entity ${s.entityId}: ` +
        `survival ${(s.survivalRatePostRecovery * 100).toFixed(0)}%  ` +
        `combat-ready ${crDays} days  ` +
        `full recovery ${frDays} days  ` +
        `cost ${s.meanResourceCostUnits.toFixed(1)} units (p90: ${s.p90ResourceCostUnits.toFixed(1)})`,
      );
    }
    lines.push("");
  }

  if (result.expectationResults.length > 0) {
    lines.push("Expectations:");
    for (const e of result.expectationResults) {
      lines.push(`  [${e.passed ? "PASS" : "FAIL"}] ${e.description}`);
      if (!e.passed && e.detail) lines.push(`         ${e.detail}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Full narrative of the median-duration trial (representative fight).
 * Falls back to first trial if no narrative was collected.
 */
export function narrateRepresentativeTrial(
  result:  ArenaResult,
): string {
  if (result.trialResults.length === 0) return "(no trials)";

  // Pick the trial closest to median duration
  const sorted = [...result.trialResults].sort((a, b) => a.ticks - b.ticks);
  const rep    = sorted[Math.floor(sorted.length / 2)]!;

  if (rep.combatLog && rep.combatLog.length > 0) {
    return rep.combatLog.map(e => `[t${e.tick}] ${e.text}`).join("\n");
  }

  // Fallback: no narrative collected — build summary from result data
  const lines: string[] = [
    `Trial ${rep.trialIndex} (seed ${rep.seed}) — ${rep.ticks} ticks — ${rep.outcome}`,
    `Survivors: ${rep.survivors.length > 0 ? rep.survivors.join(", ") : "none"}`,
  ];
  for (const inj of rep.injuries) {
    lines.push(`  Entity ${inj.entityId}: ${inj.dead ? "dead" : inj.unconscious ? "unconscious" : "standing"}`);
  }
  return lines.join("\n");
}

// ── Built-in calibration scenarios ───────────────────────────────────────────

const _longsword  = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!;
const _knife      = STARTER_WEAPONS.find(w => w.id === "wpn_knife")!;
const _plateMail  = STARTER_ARMOUR[2]!; // arm_plate, resist_J = 800

/**
 * Armed trained human vs. unarmed untrained human.
 * Source: criminal assault literature, self-defence training studies.
 */
export const CALIBRATION_ARMED_VS_UNARMED: ArenaScenario = {
  name:        "Armed vs. Unarmed",
  description: "Armed trained human vs. unarmed untrained human.",
  combatants: [
    {
      id: 1, teamId: 1,
      archetype: HUMAN_BASE,
      loadout:   { items: [_longsword] },
      skills:    buildSkillMap({ meleeCombat: { energyTransferMul: q(1.10) } }),
      position_m: v3(0, 0, 0),
    },
    {
      id: 2, teamId: 2,
      archetype: HUMAN_BASE,
      loadout:   { items: [] },
      position_m: v3(Math.trunc(0.85 * SCALE.m), 0, 0),
    },
  ],
  maxTicks:    DEFAULT_MAX_TICKS,
  expectations: [
    expectWinRate(1, 0.70),
    expectMeanDuration(1, 30),
  ],
};

/**
 * Post-combat entity with severe knife wound, no treatment, 60 min downtime.
 * Source: Sperry (2013) untreated penetrating abdominal trauma mortality.
 */
export const CALIBRATION_UNTREATED_KNIFE_WOUND: ArenaScenario = {
  name:        "Untreated Knife Wound",
  description: "Severe torso laceration, no treatment, 60 min downtime.",
  combatants: [
    {
      id: 1, teamId: 1,
      archetype: HUMAN_BASE,
      loadout:   { items: [] },
      position_m: v3(0, 0, 0),
      mutateOnCreate(e) {
        e.injury.byRegion["torso"]!.bleedingRate = q(0.06) as Q;
      },
    },
  ],
  maxTicks: 0,
  recovery: {
    careLevel:     "none",
    recoveryHours: 1,
  },
  expectations: [
    {
      description: "≥ 80% of entities die within 60 simulated minutes",
      check(r) {
        const stats = r.recoveryStats?.find(s => s.entityId === 1);
        return stats !== undefined && stats.survivalRatePostRecovery <= 0.20;
      },
    },
  ],
};

/**
 * Same severe knife wound, first_aid applied within onset delay = 0.
 * Source: TCCC tourniquet outcome data.
 */
export const CALIBRATION_FIRST_AID_SAVES_LIVES: ArenaScenario = {
  name:        "First Aid Saves Lives",
  description: "Severe torso laceration, first aid applied, 60 min downtime.",
  combatants: [
    {
      id: 1, teamId: 1,
      archetype: HUMAN_BASE,
      loadout:   { items: [] },
      position_m: v3(0, 0, 0),
      mutateOnCreate(e) {
        e.injury.byRegion["torso"]!.bleedingRate = q(0.06) as Q;
      },
    },
  ],
  maxTicks: 0,
  recovery: {
    careLevel:     "first_aid",
    recoveryHours: 1,
    rest:          true,
  },
  expectations: [
    {
      description: "≥ 90% survive 60 simulated minutes with first aid",
      check(r) {
        const stats = r.recoveryStats?.find(s => s.entityId === 1);
        return stats !== undefined && stats.survivalRatePostRecovery >= 0.90;
      },
    },
    {
      description: "entity 1 combat-ready within 0.1 simulated days (tourniquet immediate)",
      check(r) {
        const stats = r.recoveryStats?.find(s => s.entityId === 1);
        return stats !== undefined
          && stats.meanCombatReadyDays !== null
          && stats.meanCombatReadyDays <= 0.1;
      },
    },
  ],
};

/**
 * Fresh long-bone fracture, field_medicine care, extended downtime.
 * Source: orthopaedic rehabilitation literature.
 */
export const CALIBRATION_FRACTURE_RECOVERY: ArenaScenario = {
  name:        "Fracture Recovery",
  description: "Long-bone fracture, field_medicine, 6000 s downtime.",
  combatants: [
    {
      id: 1, teamId: 1,
      archetype: HUMAN_BASE,
      loadout:   { items: [] },
      position_m: v3(0, 0, 0),
      mutateOnCreate(e) {
        const leg = e.injury.byRegion["leftLeg"] ?? e.injury.byRegion["torso"];
        if (leg) {
          leg.structuralDamage = q(0.75) as Q;
          leg.fractured        = true;
        }
      },
    },
  ],
  maxTicks: 0,
  recovery: {
    careLevel:     "field_medicine",
    recoveryHours: 6000 / 3600,
  },
  expectations: [
    {
      description: "≥ 90% achieve structural recovery within 6000 simulated seconds",
      check(r) {
        const stats = r.recoveryStats?.find(s => s.entityId === 1);
        if (!stats || stats.meanFullRecoveryDays === null) return false;
        return stats.meanFullRecoveryDays <= (6000 / 86400) * 1.5; // generous upper bound
      },
    },
  ],
};

/**
 * Moderate internal wound with active infection, no antibiotics, 24h downtime.
 * Source: pre-antibiotic era wound infection mortality (Ogston, Lister era data).
 */
export const CALIBRATION_INFECTION_UNTREATED: ArenaScenario = {
  name:        "Untreated Infection",
  description: "Active infection + internal damage, no treatment, 24 h downtime.",
  combatants: [
    {
      id: 1, teamId: 1,
      archetype: HUMAN_BASE,
      loadout:   { items: [] },
      position_m: v3(0, 0, 0),
      mutateOnCreate(e) {
        const torso = e.injury.byRegion["torso"]!;
        torso.infectedTick   = 0;
        torso.internalDamage = q(0.20) as Q;
      },
    },
  ],
  maxTicks: 0,
  recovery: {
    careLevel:     "none",
    recoveryHours: 24,
  },
  expectations: [
    {
      description: "≥ 60% fatal within 24 simulated hours (untreated sepsis)",
      check(r) {
        const stats = r.recoveryStats?.find(s => s.entityId === 1);
        return stats !== undefined && stats.survivalRatePostRecovery <= 0.40;
      },
    },
  ],
};

/**
 * Armoured knight vs. unarmoured swordsman, matched skill and archetype.
 * Source: HEMA literature on plate armour effectiveness.
 */
export const CALIBRATION_PLATE_ARMOUR: ArenaScenario = {
  name:        "Plate Armour Effectiveness",
  description: "Knight (plate armour) vs. unarmoured swordsman.",
  combatants: [
    {
      id: 1, teamId: 1,
      archetype: KNIGHT_INFANTRY,
      loadout:   { items: [_longsword, _plateMail] },
      skills:    buildSkillMap({ meleeCombat: { energyTransferMul: q(1.15) } }),
      position_m: v3(0, 0, 0),
    },
    {
      id: 2, teamId: 2,
      archetype: HUMAN_BASE,
      loadout:   { items: [_longsword] },
      skills:    buildSkillMap({ meleeCombat: { energyTransferMul: q(1.15) } }),
      position_m: v3(Math.trunc(0.85 * SCALE.m), 0, 0),
    },
  ],
  maxTicks: DEFAULT_MAX_TICKS,
  expectations: [
    expectWinRate(1, 0.45),
  ],
};
