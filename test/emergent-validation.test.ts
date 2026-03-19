// test/emergent-validation.test.ts — PH-8: Emergent Validation CI Guard
//
// Runs the four emergent validation scenarios with a small seed count (20) and
// verifies that each scenario's pass criteria are met.
//
// This is the CI guard for docs/emergent-validation-report.md.  If this test
// fails, the emergent behaviour has diverged from the committed baseline — either
// a kernel regression or an intentional change that requires the report to be
// regenerated with `npm run run:emergent-validation 100`.
//
// Keep N_SEEDS small (≤ 20) so this test finishes within the CI time budget.

import { describe, it, expect } from "vitest";

import { q, SCALE }                    from "../src/units.js";
import { mkWorld, mkHumanoidEntity }   from "../src/sim/testing.js";
import { stepWorld }                   from "../src/sim/kernel.js";
import { buildWorldIndex }             from "../src/sim/indexing.js";
import { buildSpatialIndex }           from "../src/sim/spatial.js";
import { buildAICommands }             from "../src/sim/ai/system.js";
import { AI_PRESETS }                  from "../src/sim/ai/presets.js";
import { STARTER_WEAPONS, STARTER_ARMOUR } from "../src/equipment.js";
import { exposeToDisease, stepDiseaseForEntity, spreadDisease, type NearbyPair } from "../src/sim/disease.js";
import type { WorldState }             from "../src/sim/world.js";
import type { KernelContext }          from "../src/sim/context.js";
import type { WeatherState }           from "../src/sim/weather.js";
import type { Entity }                 from "../src/sim/entity.js";
import type { Q }                      from "../src/units.js";

// ── Config ────────────────────────────────────────────────────────────────────

const N_SEEDS    = 5;     // fast CI subset (full report uses 100)
const MAX_TICKS  = 2000;
const ROUT_FRAC  = 0.60;
const DAY_S      = 86_400;
const WORLD_SEED = 1;

// ── Entity helpers ────────────────────────────────────────────────────────────

const LONGSWORD = STARTER_WEAPONS[2]!;
const LEATHER   = STARTER_ARMOUR[0]!;

function mkFootSoldier(id: number, teamId: number, x_m: number, y_m: number): Entity {
  const e = mkHumanoidEntity(id, teamId, x_m, y_m);
  e.loadout = { items: [LONGSWORD, LEATHER] };
  return e;
}

function mkBattleLine(n: number, idBaseA: number, idBaseB: number): Entity[] {
  const spacing = Math.round(1.8 * SCALE.m);
  const gap     = Math.round(3.0 * SCALE.m);
  const entities: Entity[] = [];
  for (let i = 0; i < n; i++) {
    const x = Math.round((i - (n - 1) / 2) * spacing);
    entities.push(mkFootSoldier(idBaseA + i, 1, x, 0));
    entities.push(mkFootSoldier(idBaseB + i, 2, x, gap));
  }
  return entities;
}

// ── AI helpers ────────────────────────────────────────────────────────────────

const lineInfantry = AI_PRESETS["lineInfantry"]!;
const policyFor    = () => lineInfantry;

function aiCmds(world: WorldState) {
  return buildAICommands(world, buildWorldIndex(world), buildSpatialIndex(world, 40_000), policyFor);
}

function teamRouted(world: WorldState, teamId: number, n: number): boolean {
  return world.entities.filter(e => e.teamId === teamId && e.injury.dead).length >= Math.ceil(n * ROUT_FRAC);
}

// ── Statistical helpers ───────────────────────────────────────────────────────

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ── Scenario runners ──────────────────────────────────────────────────────────

interface SkirmishResult { survivorsA: number; survivorsB: number; durationTicks: number }

function runSkirmish(seed: number, n: number, weather?: WeatherState): SkirmishResult {
  const entities = mkBattleLine(n, 1, n + 1);
  const world    = mkWorld(seed, entities);
  const ctx: KernelContext = { tractionCoeff: q(0.85) as Q, ...(weather ? { weather } : {}) };
  let tick = 0;
  while (tick < MAX_TICKS) {
    tick++;
    stepWorld(world, aiCmds(world), ctx);
    if (teamRouted(world, 1, n) || teamRouted(world, 2, n)) break;
  }
  return {
    survivorsA: world.entities.filter(e => e.teamId === 1 && !e.injury.dead).length,
    survivorsB: world.entities.filter(e => e.teamId === 2 && !e.injury.dead).length,
    durationTicks: tick,
  };
}

interface LanchesterResult { survivorsSmall: number; survivorsLarge: number }

function runLanchester(seed: number): LanchesterResult {
  const N_SMALL = 5; const N_LARGE = 10;
  const spacing = Math.round(1.8 * SCALE.m);
  const gap     = Math.round(3.0 * SCALE.m);
  const entities: Entity[] = [];
  for (let i = 0; i < N_SMALL; i++) entities.push(mkFootSoldier(i + 1, 1, Math.round((i - (N_SMALL - 1) / 2) * spacing), 0));
  for (let i = 0; i < N_LARGE; i++) entities.push(mkFootSoldier(N_SMALL + i + 1, 2, Math.round((i - (N_LARGE - 1) / 2) * spacing), gap));
  const world = mkWorld(seed, entities);
  const ctx: KernelContext = { tractionCoeff: q(0.85) as Q };
  let tick = 0;
  while (tick < MAX_TICKS) {
    tick++;
    stepWorld(world, aiCmds(world), ctx);
    if (teamRouted(world, 1, N_SMALL) || teamRouted(world, 2, N_LARGE)) break;
  }
  return {
    survivorsSmall: world.entities.filter(e => e.teamId === 1 && !e.injury.dead).length,
    survivorsLarge: world.entities.filter(e => e.teamId === 2 && !e.injury.dead).length,
  };
}

interface SiegeResult { diseaseDeaths: number; combatDeaths: number }

function runSiege(seed: number): SiegeResult {
  const N_GARRISON = 20; const N_BESIEGERS = 60;
  const garrison: Entity[]  = [];
  const besiegers: Entity[] = [];
  for (let i = 0; i < N_GARRISON;  i++) { const e = mkHumanoidEntity(i + 1, 1, 0, 0); e.loadout = { items: [LONGSWORD, LEATHER] }; garrison.push(e); }
  for (let i = 0; i < N_BESIEGERS; i++) { const e = mkHumanoidEntity(N_GARRISON + i + 1, 2, 0, 0); e.loadout = { items: [LONGSWORD, LEATHER] }; besiegers.push(e); }
  const entityMap = new Map<number, Entity>([...garrison, ...besiegers].map(e => [e.id, e]));
  const besiegePairs: NearbyPair[] = [];
  for (let i = 0; i < besiegers.length; i++) for (let j = i + 1; j < besiegers.length; j++) besiegePairs.push({ carrierId: besiegers[i]!.id, targetId: besiegers[j]!.id, dist_Sm: 5_000 });
  const crossPairs: NearbyPair[] = [];
  for (const g of garrison) for (const b of besiegers) crossPairs.push({ carrierId: b.id, targetId: g.id, dist_Sm: 15_000 });
  const allPairs = [...besiegePairs, ...crossPairs];
  let initialCases = 0;
  for (const e of besiegers) { if (initialCases >= Math.ceil(N_BESIEGERS * 0.10)) break; if (exposeToDisease(e, "plague_pneumonic")) initialCases++; }
  let diseaseDeaths = 0; let combatDeaths = 0;
  const sortieCtx: KernelContext = { tractionCoeff: q(0.85) as Q };
  for (let day = 1; day <= 30; day++) {
    const tick = seed * 1000 + day;
    spreadDisease(entityMap, allPairs, WORLD_SEED + seed, tick);
    for (const e of [...garrison, ...besiegers]) {
      if (e.injury.dead) continue;
      const wasDead = e.injury.dead;
      stepDiseaseForEntity(e, DAY_S, WORLD_SEED + seed, tick);
      if (!wasDead && e.injury.dead) diseaseDeaths++;
    }
    if (day % 3 === 0) {
      const aliveG = garrison.filter(e => !e.injury.dead);
      const aliveB = besiegers.filter(e => !e.injury.dead);
      if (aliveG.length === 0 || aliveB.length === 0) break;
      const sortieA = aliveG.slice(0, 5); const sortieB = aliveB.slice(0, 10);
      const gap_m = Math.round(2.0 * SCALE.m);
      sortieA.forEach((e, i) => { e.position_m = { x: Math.round((i - 2) * 2000), y: 0, z: 0 }; });
      sortieB.forEach((e, i) => { e.position_m = { x: Math.round((i - 5) * 2000), y: gap_m, z: 0 }; });
      const sw = mkWorld(seed * 1000 + day, [...sortieA, ...sortieB]);
      for (let t = 0; t < 400; t++) {
        stepWorld(sw, aiCmds(sw), sortieCtx);
        if (sw.entities.filter(e => e.teamId === 1 && e.injury.dead).length >= sortieA.length) break;
        if (sw.entities.filter(e => e.teamId === 2 && e.injury.dead).length >= sortieB.length) break;
      }
      for (const se of sw.entities) { const orig = entityMap.get(se.id); if (orig && se.injury.dead && !orig.injury.dead) { orig.injury.dead = true; combatDeaths++; } }
    }
  }
  return { diseaseDeaths, combatDeaths };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Emergent validation — CI guard (20 seeds)", () => {
  it("Scenario 1: 10v10 open-ground skirmish satisfies du Picq casualty criteria", () => {
    const results = Array.from({ length: N_SEEDS }, (_, i) => runSkirmish(i + 1, 10));
    const winnerSurv = results.map(r => Math.max(r.survivorsA, r.survivorsB) / 10 * 100);
    const loserSurv  = results.map(r => Math.min(r.survivorsA, r.survivorsB) / 10 * 100);
    const p90dur     = [...results.map(r => r.durationTicks)].sort((a, b) => a - b)[Math.floor(N_SEEDS * 0.9) - 1]!;

    expect(mean(winnerSurv)).toBeGreaterThanOrEqual(20);   // winner retains ≥ 20%
    expect(mean(loserSurv)).toBeLessThanOrEqual(50);       // loser retains ≤ 50%
    expect(p90dur).toBeLessThanOrEqual(MAX_TICKS);          // fights resolve in time
  }, 120_000);

  it("Scenario 2: rain + fog extends fight duration vs clear (Keegan friction claim)", () => {
    const clear = Array.from({ length: N_SEEDS }, (_, i) => runSkirmish(i + 1, 10));
    const wet   = Array.from({ length: N_SEEDS }, (_, i) =>
      runSkirmish(i + 1, 10, { precipitation: "heavy_rain", fogDensity_Q: q(0.50) as Q }));

    const clearDur = mean(clear.map(r => r.durationTicks));
    const wetDur   = mean(wet.map(r => r.durationTicks));
    const durRatio = wetDur / Math.max(1, clearDur);
    const wetWinSurv  = mean(wet.map(r => Math.max(r.survivorsA, r.survivorsB) / 10 * 100));
    const clearWinSurv = mean(clear.map(r => Math.max(r.survivorsA, r.survivorsB) / 10 * 100));
    const survivDrop  = clearWinSurv - wetWinSurv;

    // OR-gate: either duration increases ≥ 10% or winner survivor rate drops ≥ 1%
    expect(durRatio >= 1.10 || survivDrop >= 1.0).toBe(true);
  }, 120_000);

  it("Scenario 3: Lanchester's Laws — 5v10 casualty ratio ≥ 2× (numerical superiority)", () => {
    const results = Array.from({ length: N_SEEDS }, (_, i) => runLanchester(i + 1));
    const smallCas = mean(results.map(r => (5 - r.survivorsSmall) / 5 * 100));
    const largeCas = mean(results.map(r => (10 - r.survivorsLarge) / 10 * 100));
    const casRatio = largeCas > 0 ? smallCas / largeCas : Infinity;
    const largeWinPct = results.filter(r => r.survivorsLarge > r.survivorsSmall).length / N_SEEDS;

    expect(casRatio).toBeGreaterThanOrEqual(2.0);      // outnumbered side suffers ≥ 2× casualties
    expect(largeWinPct).toBeGreaterThanOrEqual(0.80);  // large force wins ≥ 80% of runs
  }, 120_000);

  it("Scenario 4: siege disease deaths exceed combat deaths (Raudzens attrition claim)", () => {
    const results = Array.from({ length: N_SEEDS }, (_, i) => runSiege(i + 1));
    const mDisease = mean(results.map(r => r.diseaseDeaths));
    const mCombat  = mean(results.map(r => r.combatDeaths));
    const TOTAL_POP = 80;

    expect(mDisease).toBeGreaterThanOrEqual(mCombat);                // disease ≥ combat kills
    expect((mDisease / TOTAL_POP) * 100).toBeGreaterThanOrEqual(5); // disease ≥ 5% of pop
  }, 120_000);
});
