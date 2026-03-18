// tools/what-if.ts — Phase 64: "What If?" / Alternate History Engine
//
// Runs polity-scale alternate-history simulations across multiple seeds.
// Each scenario defines a baseline world and a divergence point.  The engine
// runs both (baseline = no divergence, diverged = with divergence) across N
// seeds and reports the probability-weighted outcome distribution.
//
// Run:  npm run build && node dist/tools/what-if.js
// RUNS=<n>  node dist/tools/what-if.js   (default: 100 seeds per scenario)
//
// Three built-in scenarios:
//   1. "Plague Strikes the Capital"  — airborne disease hits most-populous polity
//   2. "Charismatic Leader Emerges"  — sudden morale surge in a single polity
//   3. "Sudden War"                  — two balanced polities unexpectedly go to war

import {
  createPolity,
  createPolityRegistry,
  stepPolityDay,
  declareWar,
  computePolityDiseaseSpread,
  deriveMilitaryStrength,
  type Polity,
  type PolityRegistry,
  type PolityPair,
} from "../src/polity.js";
import { q, SCALE, clampQ, type Q } from "../src/units.js";
import { DISEASE_PROFILES } from "../src/sim/disease.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WhatIfScenario {
  name: string;
  description: string;
  divergenceDescription: string;
  /** How many simulated days to run forward. */
  durationDays: number;
  /** Factory: returns a fresh baseline registry + trading pairs. */
  setup(): { registry: PolityRegistry; pairs: PolityPair[] };
  /**
   * Apply the hypothetical change to a cloned registry.
   * Called once per diverged run, right before day-stepping begins.
   * The seed is available so stochastic divergences are reproducible.
   */
  applyDivergence(registry: PolityRegistry, seed: number): void;
  /** Metrics extracted from the final-day registry state. */
  metrics: Array<{
    name: string;
    description: string;
    extract(registry: PolityRegistry): number;
  }>;
}

interface RunResult {
  seed: number;
  metricValues: Record<string, number>;
}

interface MetricStats {
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  /** Absolute change from baseline (diverged mean − baseline). */
  delta: number;
  /** Percentage change from baseline. */
  deltaPct: number;
}

interface WhatIfReport {
  scenarioName: string;
  description: string;
  divergenceDescription: string;
  durationDays: number;
  runsTotal: number;
  baselineMetrics: Record<string, number>;
  divergedStats: Record<string, MetricStats>;
  runs: RunResult[];
}

// ── Registry deep-clone ───────────────────────────────────────────────────────

function cloneRegistry(reg: PolityRegistry): PolityRegistry {
  const polities = new Map<string, Polity>();
  for (const [id, p] of reg.polities) {
    polities.set(id, { ...p, locationIds: [...p.locationIds] });
  }
  return {
    polities,
    activeWars:  new Set(reg.activeWars),
    alliances:   new Map([...reg.alliances].map(([k, v]) => [k, new Set(v)])),
  };
}

// ── Simulation runner ─────────────────────────────────────────────────────────

const PLAGUE = DISEASE_PROFILES.find(d => d.id === "plague_pneumonic")!;

/**
 * Step a registry forward for `days` simulated days, applying disease spread
 * on every tick.  Uses `worldSeed` for deterministic disease and war rolls.
 */
function runDays(
  registry: PolityRegistry,
  pairs: PolityPair[],
  worldSeed: number,
  days: number,
  activeDiseasePolityIds: string[] = [],
): void {
  for (let tick = 0; tick < days; tick++) {
    stepPolityDay(registry, pairs, worldSeed, tick);
    // Disease spread for affected polities
    for (const pid of activeDiseasePolityIds) {
      const polity = registry.polities.get(pid);
      if (polity) computePolityDiseaseSpread(polity, PLAGUE, worldSeed, tick);
    }
  }
}

function runScenario(scenario: WhatIfScenario, seeds: number[]): WhatIfReport {
  const { setup, applyDivergence, metrics, durationDays } = scenario;

  // ── Baseline: single run, no divergence, seed 0 ──────────────────────────
  {
    const { registry: baseReg, pairs: basePairs } = setup();
    runDays(baseReg, basePairs, 0, durationDays);
    const baselineMetrics: Record<string, number> = {};
    for (const m of metrics) baselineMetrics[m.name] = m.extract(baseReg);

    // ── Diverged runs ─────────────────────────────────────────────────────
    const runs: RunResult[] = [];
    for (const seed of seeds) {
      const { registry, pairs } = setup();
      applyDivergence(registry, seed);
      runDays(registry, pairs, seed, durationDays,
        (scenario as unknown as { _diseasePolities?: string[] })._diseasePolities ?? []);
      const metricValues: Record<string, number> = {};
      for (const m of metrics) metricValues[m.name] = m.extract(registry);
      runs.push({ seed, metricValues });
    }

    // ── Statistics ────────────────────────────────────────────────────────
    const divergedStats: Record<string, MetricStats> = {};
    for (const m of metrics) {
      const vals = runs.map(r => r.metricValues[m.name] ?? 0).sort((a, b) => a - b);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const p10  = vals[Math.floor(vals.length * 0.10)] ?? 0;
      const p50  = vals[Math.floor(vals.length * 0.50)] ?? 0;
      const p90  = vals[Math.floor(vals.length * 0.90)] ?? 0;
      const base = baselineMetrics[m.name]!;
      divergedStats[m.name] = {
        mean, p10, p50, p90,
        delta:    mean - base,
        deltaPct: base !== 0 ? Math.round((mean - base) / base * 1000) / 10 : 0,
      };
    }

    return {
      scenarioName:          scenario.name,
      description:           scenario.description,
      divergenceDescription: scenario.divergenceDescription,
      durationDays,
      runsTotal:             seeds.length,
      baselineMetrics,
      divergedStats,
      runs,
    };
  }
}

// ── Built-in scenarios ────────────────────────────────────────────────────────

/**
 * Three balanced polities linked by trade.  On day 30 of the diverged run,
 * the largest polity is struck by plague_pneumonic.
 */
const scenarioPlague: WhatIfScenario & { _diseasePolities?: string[] } = {
  name: "Plague Strikes the Capital",
  description:
    "Three polities at peace (populations 200k / 120k / 80k) trading via shared borders. " +
    "Baseline: no disease. Divergence: plague_pneumonic seeded in 'empire' on day 30.",
  divergenceDescription: "plague_pneumonic seeded in 'empire' on day 30",
  durationDays: 365,
  _diseasePolities: ["empire"],

  setup() {
    const empire  = createPolity("empire",  "The Empire",  "faction_a", ["loc_1","loc_2","loc_3"], 200_000, 50_000, 2);
    const duchy   = createPolity("duchy",   "The Duchy",   "faction_b", ["loc_4","loc_5"],         120_000, 30_000, 1);
    const barony  = createPolity("barony",  "The Barony",  "faction_c", ["loc_6"],                  80_000, 15_000, 1);
    const registry = createPolityRegistry([empire, duchy, barony]);
    const pairs: PolityPair[] = [
      { polityAId: "empire", polityBId: "duchy",  sharedLocations: 2, routeQuality_Q: q(0.65) as Q },
      { polityAId: "empire", polityBId: "barony", sharedLocations: 1, routeQuality_Q: q(0.55) as Q },
      { polityAId: "duchy",  polityBId: "barony", sharedLocations: 1, routeQuality_Q: q(0.50) as Q },
    ];
    return { registry, pairs };
  },

  applyDivergence(registry, _seed) {
    // Disease spread is handled in runDays via _diseasePolities; nothing
    // extra needed here — the plague is triggered automatically at each tick.
    // We tag the empire as "infected" by reducing morale slightly at start.
    const empire = registry.polities.get("empire");
    if (empire) {
      empire.moraleQ = clampQ(empire.moraleQ - q(0.05), 0, SCALE.Q) as Q;
      deriveMilitaryStrength(empire);
    }
  },

  metrics: [
    {
      name: "empire_population",
      description: "Empire population after 365 days",
      extract: reg => reg.polities.get("empire")?.population ?? 0,
    },
    {
      name: "empire_morale",
      description: "Empire morale_Q / SCALE.Q after 365 days",
      extract: reg => (reg.polities.get("empire")?.moraleQ ?? 0) / SCALE.Q,
    },
    {
      name: "empire_military",
      description: "Empire militaryStrength_Q / SCALE.Q after 365 days",
      extract: reg => (reg.polities.get("empire")?.militaryStrength_Q ?? 0) / SCALE.Q,
    },
    {
      name: "total_treasury",
      description: "Sum of all polity treasuries after 365 days",
      extract: reg => [...reg.polities.values()].reduce((s, p) => s + p.treasury_cu, 0),
    },
  ],
};

/**
 * A single isolated polity.  Baseline: no change.
 * Divergence: a charismatic leader emerges on day 1, boosting morale by q(0.20).
 */
const scenarioLeader: WhatIfScenario = {
  name: "Charismatic Leader Emerges",
  description:
    "Single polity (population 150k, medieval tech). " +
    "Baseline: normal recovery from moderate morale (0.55). " +
    "Divergence: morale +0.20 on day 1 (leader rally) — " +
    "measures compounding military and stability effect over 90 days " +
    "before the two trajectories converge to equilibrium.",
  divergenceDescription: "morale +q(0.20) applied to 'kingdom' on day 1",
  durationDays: 90,

  setup() {
    const kingdom = createPolity("kingdom", "The Kingdom", "faction_k",
      ["loc_k1","loc_k2"], 150_000, 20_000, 1,
      q(0.60) as Q, q(0.55) as Q);
    const registry = createPolityRegistry([kingdom]);
    return { registry, pairs: [] };
  },

  applyDivergence(registry, _seed) {
    const kingdom = registry.polities.get("kingdom");
    if (kingdom) {
      kingdom.moraleQ = clampQ(kingdom.moraleQ + q(0.20), 0, SCALE.Q) as Q;
      deriveMilitaryStrength(kingdom);
    }
  },

  metrics: [
    {
      name: "military_strength",
      description: "militaryStrength_Q / SCALE.Q at day 730",
      extract: reg => (reg.polities.get("kingdom")?.militaryStrength_Q ?? 0) / SCALE.Q,
    },
    {
      name: "stability",
      description: "stabilityQ / SCALE.Q at day 730",
      extract: reg => (reg.polities.get("kingdom")?.stabilityQ ?? 0) / SCALE.Q,
    },
    {
      name: "morale",
      description: "moraleQ / SCALE.Q at day 730",
      extract: reg => (reg.polities.get("kingdom")?.moraleQ ?? 0) / SCALE.Q,
    },
    {
      name: "treasury",
      description: "treasury_cu at day 730",
      extract: reg => reg.polities.get("kingdom")?.treasury_cu ?? 0,
    },
  ],
};

/**
 * Two evenly matched polities with active trade.
 * Baseline: peace.  Divergence: war declared on day 1.
 */
const scenarioWar: WhatIfScenario = {
  name: "Sudden War",
  description:
    "Two equal polities (80k population each, matching tech) sharing three border locations. " +
    "Baseline: peace and prosperous trade for 180 days. " +
    "Divergence: war declared on day 1 — measures stability collapse and treasury drain.",
  divergenceDescription: "war declared between 'northland' and 'southland' on day 1",
  durationDays: 180,

  setup() {
    const northland = createPolity("northland", "Northland", "faction_n",
      ["loc_n1","loc_n2","loc_b1"], 80_000, 25_000, 1);
    const southland = createPolity("southland", "Southland", "faction_s",
      ["loc_s1","loc_s2","loc_b2"], 80_000, 24_000, 1);
    const registry = createPolityRegistry([northland, southland]);
    const pairs: PolityPair[] = [
      { polityAId: "northland", polityBId: "southland",
        sharedLocations: 3, routeQuality_Q: q(0.60) as Q },
    ];
    return { registry, pairs };
  },

  applyDivergence(registry, _seed) {
    declareWar(registry, "northland", "southland");
  },

  metrics: [
    {
      name: "northland_stability",
      description: "Northland stabilityQ / SCALE.Q at day 180",
      extract: reg => (reg.polities.get("northland")?.stabilityQ ?? 0) / SCALE.Q,
    },
    {
      name: "southland_stability",
      description: "Southland stabilityQ / SCALE.Q at day 180",
      extract: reg => (reg.polities.get("southland")?.stabilityQ ?? 0) / SCALE.Q,
    },
    {
      name: "northland_treasury",
      description: "Northland treasury_cu at day 180",
      extract: reg => reg.polities.get("northland")?.treasury_cu ?? 0,
    },
    {
      name: "southland_treasury",
      description: "Southland treasury_cu at day 180",
      extract: reg => reg.polities.get("southland")?.treasury_cu ?? 0,
    },
    {
      name: "war_ongoing",
      description: "1 if still at war on day 180, 0 if peace concluded",
      extract: reg => reg.activeWars.size > 0 ? 1 : 0,
    },
  ],
};

// ── Report formatting ─────────────────────────────────────────────────────────

function bar(frac: number, width = 20): string {
  const filled = Math.max(0, Math.min(width, Math.round(frac * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function fmt(v: number, decimals = 3): string {
  return v.toFixed(decimals);
}

function formatReport(report: WhatIfReport, metrics: WhatIfScenario["metrics"]): string {
  const lines: string[] = [];
  const HR = "─".repeat(72);

  lines.push(`\n${"═".repeat(72)}`);
  lines.push(`  ${report.scenarioName}`);
  lines.push(`${"═".repeat(72)}`);
  lines.push(`  ${report.description}`);
  lines.push(`  Divergence: ${report.divergenceDescription}`);
  lines.push(`  Duration: ${report.durationDays} simulated days  ·  ${report.runsTotal} seeds`);
  lines.push(HR);
  lines.push("  METRIC                          BASELINE    DIVERGED MEAN  Δ%     p10 – p90");
  lines.push(HR);

  for (const m of metrics) {
    const base  = report.baselineMetrics[m.name] ?? 0;
    const stats = report.divergedStats[m.name];
    if (!stats) continue;

    const label = m.name.padEnd(30);
    const bStr  = fmt(base, 4).padStart(10);
    const mStr  = fmt(stats.mean, 4).padStart(14);
    const dStr  = (stats.deltaPct >= 0 ? "+" : "") + fmt(stats.deltaPct, 1).padStart(6) + "%";
    const rStr  = `${fmt(stats.p10, 3)} – ${fmt(stats.p90, 3)}`;
    lines.push(`  ${label}${bStr}  ${mStr}  ${dStr}  ${rStr}`);
  }

  lines.push(HR);

  // Highlight the most impactful metric
  let biggestPct = 0;
  let biggestName = "";
  for (const m of metrics) {
    const pct = Math.abs(report.divergedStats[m.name]?.deltaPct ?? 0);
    if (pct > biggestPct) { biggestPct = pct; biggestName = m.name; }
  }
  if (biggestName) {
    const stats = report.divergedStats[biggestName]!;
    const direction = stats.delta >= 0 ? "increase" : "decrease";
    lines.push(`  Largest impact: ${biggestName}  (${direction} ${Math.abs(stats.deltaPct).toFixed(1)}%)`);
    // Visualise diverged mean as a fraction bar (capped at some max scale)
    const base = report.baselineMetrics[biggestName] ?? 1;
    const maxVal = Math.max(base, stats.p90, 1);
    lines.push(`  Baseline  [${bar(base / maxVal)}] ${fmt(base, 4)}`);
    lines.push(`  Diverged  [${bar(stats.mean / maxVal)}] ${fmt(stats.mean, 4)} (mean)`);
  }

  lines.push("");
  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

declare const process: { argv?: string[] } | undefined;

const N_RUNS = parseInt(
  (typeof process !== "undefined" ? process.argv?.[2] : undefined) ?? "100",
  10,
);

const seeds = Array.from({ length: N_RUNS }, (_, i) => i + 1);

const scenarios: WhatIfScenario[] = [
  scenarioPlague,
  scenarioLeader,
  scenarioWar,
];

console.log(`\nAnanke — "What If?" Alternate History Engine  (Phase 64)`);
console.log(`Runs per scenario: ${N_RUNS}`);

for (const scenario of scenarios) {
  const report = runScenario(scenario, seeds);
  console.log(formatReport(report, scenario.metrics));
}

console.log("Done.\n");
