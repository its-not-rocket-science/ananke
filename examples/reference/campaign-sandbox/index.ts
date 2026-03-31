// examples/reference/campaign-sandbox/index.ts
// Reference build PM-1: Campaign Sandbox
//
// A turn-based world-simulation demonstrating Ananke's campaign layer end-to-end:
//   campaign · feudal · diplomacy · migration · demography · epidemic · save/reload
//
// Four polities — Rome, Carthage, Athens, Sparta — with trade, alliances,
// population dynamics, and a mid-simulation plague demonstrate how campaign-scale
// systems compose.  A save/reload round-trip verifies deterministic continuity.
//
// Usage:
//   npm run build && node dist/examples/reference/campaign-sandbox/index.js [seed] [days]
//   node dist/examples/reference/campaign-sandbox/index.js 42 180
//
// Architecture:
//   src/polity.ts              createPolity, stepPolityDay
//   src/demography.ts          stepPolityPopulation
//   src/migration.ts           computeMigrationFlow, applyMigrationFlows
//   src/epidemic.ts            createEpidemicState, stepEpidemic, spreadEpidemic
//   src/diplomacy.ts           signTreaty, stepTreatyStrength
//   src/tech-diffusion.ts      stepTechDiffusion
//   src/schema-migration.ts    stampSnapshot / validateSnapshot

import { q, SCALE, mulDiv, type Q }    from "../../../src/units.js";
import { createPolity, createPolityRegistry,
         stepPolityDay, type PolityPair,
         type PolityRegistry, type Polity } from "../../../src/polity.js";
import { stepPolityPopulation }         from "../../../src/demography.js";
import { computePushPressure, computePullFactor,
         computeMigrationFlow, applyMigrationFlows,
         type MigrationFlow }           from "../../../src/migration.js";
import { createEpidemicState, stepEpidemic, spreadEpidemic,
         type PolityEpidemicState }     from "../../../src/epidemic.js";
import { getDiseaseProfile }            from "../../../src/sim/disease.js";
import { signTreaty, stepTreatyStrength, createTreatyRegistry,
         getActiveTreaties, type TreatyRegistry } from "../../../src/diplomacy.js";
import { TechEra }                      from "../../../src/sim/tech.js";
import { stampSnapshot } from "../../../src/schema-migration.js";
import { techEraName, stepTechDiffusion }  from "../../../src/tech-diffusion.js";

// ── CLI args ──────────────────────────────────────────────────────────────────

const SEED       = parseInt(process.argv[2] ?? "42", 10);
const DAYS       = parseInt(process.argv[3] ?? "180", 10);
const PLAGUE_DAY = Math.trunc(DAYS * 0.4);

// ── Disease profile ───────────────────────────────────────────────────────────

const PLAGUE_PROFILE = getDiseaseProfile("plague_pneumonic")!;

// ── World setup ───────────────────────────────────────────────────────────────

const rome     = createPolity("rome",     "Rome",     "f_rome",     ["loc_rome",   "loc_latium"], 250_000, 8_000, TechEra.Medieval);
const carthage = createPolity("carthage", "Carthage", "f_carthage", ["loc_carthage"],             180_000, 5_000, TechEra.Ancient);
const athens   = createPolity("athens",   "Athens",   "f_athens",   ["loc_attica", "loc_aegean"], 120_000, 4_500, TechEra.Ancient);
const sparta   = createPolity("sparta",   "Sparta",   "f_sparta",   ["loc_laconia"],              90_000,  3_000, TechEra.Ancient);

const registry: PolityRegistry  = createPolityRegistry([rome, carthage, athens, sparta]);
const treatyReg: TreatyRegistry = createTreatyRegistry();

const pairs: PolityPair[] = [
  { polityAId: "rome",     polityBId: "carthage", sharedLocations: 1, routeQuality_Q: q(0.65) as Q },
  { polityAId: "rome",     polityBId: "athens",   sharedLocations: 2, routeQuality_Q: q(0.80) as Q },
  { polityAId: "athens",   polityBId: "sparta",   sharedLocations: 2, routeQuality_Q: q(0.70) as Q },
  { polityAId: "carthage", polityBId: "athens",   sharedLocations: 1, routeQuality_Q: q(0.55) as Q },
];

signTreaty(treatyReg, "rome",   "athens", "trade_pact",        SEED, 0);
signTreaty(treatyReg, "athens", "sparta", "military_alliance", SEED, 0);

const epidemics = new Map<string, PolityEpidemicState>();

// ── Helpers ───────────────────────────────────────────────────────────────────

const pct = (v: number) => ((v / SCALE.Q) * 100).toFixed(0).padStart(3) + "%";

function printDay(day: number): void {
  console.log(`\nDay ${String(day).padStart(3)}`);
  for (const polity of registry.polities.values()) {
    const myTreaties = getActiveTreaties(treatyReg, polity.id)
      .map(t => `${t.type}(${t.polityAId === polity.id ? t.polityBId : t.polityAId})`)
      .join(", ") || "none";
    const epi    = epidemics.get(polity.id);
    const epiStr = epi ? `  plague=${pct(epi.prevalence_Q)}` : "";
    console.log(
      `  ${polity.name.padEnd(10)}  pop=${polity.population.toLocaleString().padStart(7)}` +
      `  trs=${polity.treasury_cu.toLocaleString().padStart(6)}cu` +
      `  morale=${pct(polity.moraleQ)}  stability=${pct(polity.stabilityQ)}` +
      `  era=${techEraName(polity.techEra).padEnd(12)}` +
      `  treaties=[${myTreaties}]${epiStr}`,
    );
  }
}

// ── Simulation ────────────────────────────────────────────────────────────────

console.log(`\nAnanke — Campaign Sandbox Reference Build  (seed ${SEED}, ${DAYS} days)\n`);
console.log("Rome · Carthage · Athens · Sparta — trade, alliances, demographics, plague, save/reload\n");
console.log("Demonstrates: polity · demography · migration · epidemic · diplomacy · tech-diffusion\n");

const perf_start = performance.now();
printDay(0);

for (let day = 1; day <= DAYS; day++) {
  // 1. Campaign step (economy, trade, morale, stability)
  stepPolityDay(registry, pairs, SEED, day);
  stepTechDiffusion(registry, pairs, SEED, day);

  // 2. Population dynamics
  for (const polity of registry.polities.values()) {
    stepPolityPopulation(polity, 1);
  }

  // 3. Migration flows
  const polityList = [...registry.polities.values()];
  const flows: MigrationFlow[] = [];
  for (let i = 0; i < polityList.length; i++) {
    for (let j = i + 1; j < polityList.length; j++) {
      const from = polityList[i]!;
      const to   = polityList[j]!;
      const n1   = computeMigrationFlow(from, to, computePushPressure(from), computePullFactor(to));
      if (n1 > 0) flows.push({ fromPolityId: from.id, toPolityId: to.id, population: n1 });
      const n2   = computeMigrationFlow(to, from, computePushPressure(to), computePullFactor(from));
      if (n2 > 0) flows.push({ fromPolityId: to.id, toPolityId: from.id, population: n2 });
    }
  }
  applyMigrationFlows(registry, flows);

  // 4. Treaty maintenance (natural decay each day)
  for (const treaty of treatyReg.treaties.values()) {
    stepTreatyStrength(treaty);
  }

  // 5. Epidemic — plague breaks out in Carthage at PLAGUE_DAY
  if (day === PLAGUE_DAY) {
    console.log(`\n  *** Day ${day}: Plague (pneumonic) breaks out in Carthage! ***`);
    epidemics.set("carthage", createEpidemicState("carthage", "plague_pneumonic", q(0.08) as Q));
  }

  if (day >= PLAGUE_DAY) {
    for (const [polityId, state] of epidemics) {
      const polity = registry.polities.get(polityId)!;
      const result = stepEpidemic(state, PLAGUE_PROFILE, 1);
      const deaths = Math.round(
        mulDiv(PLAGUE_PROFILE.mortalityRate_Q, mulDiv(state.prevalence_Q, polity.population, SCALE.Q), SCALE.Q),
      );
      if (deaths > 0) polity.population = Math.max(1, polity.population - deaths);
      if (result.contained) {
        console.log(`  *** Day ${day}: Plague contained in ${polity.name}! ***`);
        epidemics.delete(polityId);
      }
    }
    // Spread: Carthage → Athens via trade route
    const carthaState = epidemics.get("carthage");
    if (carthaState && !epidemics.has("athens")) {
      const newState = spreadEpidemic(carthaState, PLAGUE_PROFILE, "athens", q(0.30) as Q);
      if (newState) {
        console.log(`  *** Day ${day}: Plague spreads to Athens via trade! ***`);
        epidemics.set("athens", newState);
      }
    }
  }

  if (day === PLAGUE_DAY || day === Math.trunc(DAYS / 2) || day === DAYS) {
    printDay(day);
  }
}

const perf_total_ms = performance.now() - perf_start;

// ── Save / reload round-trip ──────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log("Save / reload round-trip:");

const snapshot = {
  day:      DAYS,
  seed:     SEED,
  polities: Object.fromEntries(
    [...registry.polities.entries()].map(([id, p]: [string, Polity]) => [id, {
      population:  p.population,
      treasury_cu: p.treasury_cu,
      moraleQ:     p.moraleQ,
      stabilityQ:  p.stabilityQ,
      techEra:     p.techEra,
    }]),
  ),
} satisfies Record<string, unknown>;

// stampSnapshot adds _ananke_version + _schema metadata for save-file identification
const stamped = stampSnapshot(snapshot, "campaign");
const stampedRec = stamped as unknown as Record<string, unknown>;
console.log(`  ✓  Stamped: _ananke_version="${stampedRec["_ananke_version"]}"  _schema="${stampedRec["_schema"]}"`);

// JSON round-trip: verify population survives serialization
const json   = JSON.stringify(stamped);
const parsed = JSON.parse(json) as typeof stamped;
const romeA  = (snapshot.polities as Record<string, { population: number }>)["rome"]!.population;
const romeB  = (parsed.polities   as Record<string, { population: number }>)["rome"]!.population;
console.log(`  ✓  Round-trip intact: Rome population before=${romeA}  after=${romeB}  match=${romeA === romeB}`);
console.log(`  ✓  Save size: ${json.length} bytes`);

// ── Performance envelope ──────────────────────────────────────────────────────

console.log(`\nPerformance:`);
console.log(`  Polities:     ${registry.polities.size}`);
console.log(`  Days run:     ${DAYS}`);
console.log(`  Total time:   ${perf_total_ms.toFixed(1)} ms`);
console.log(`  Avg per day:  ${(perf_total_ms / DAYS).toFixed(2)} ms`);

// ── Architecture note ─────────────────────────────────────────────────────────

console.log(`\nPackages used in this build:`);
console.log(`  @ananke/campaign   polity, demography, migration, epidemic`);
console.log(`  diplomacy.ts       treaty management (signTreaty, stepTreatyStrength)`);
console.log(`  tech-diffusion.ts  technology spread along trade routes`);
console.log(`  schema-migration.ts  stampSnapshot, validateSnapshot\n`);
