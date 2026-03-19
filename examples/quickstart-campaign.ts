// examples/quickstart-campaign.ts — Path B: Campaign / world simulation
//
// Two polities — Rome (Medieval era) and Carthage (Ancient era) — are connected
// by a trade route.  Technology diffuses from Rome to Carthage as trade enriches
// both polities over 90 simulated days.
//
// Run:  npm run build && node dist/examples/quickstart-campaign.js

import { q, SCALE, type Q }           from "../src/units.js";
import { createPolity, createPolityRegistry, stepPolityDay,
         type PolityPair }             from "../src/polity.js";
import { stepTechDiffusion, techEraName } from "../src/tech-diffusion.js";
import { TechEra }                     from "../src/sim/tech.js";

// ── World setup ───────────────────────────────────────────────────────────────

const rome     = createPolity("rome",     "Rome",     "f_rome",     ["loc_rome"],     200_000,  5_000, TechEra.Medieval);
const carthage = createPolity("carthage", "Carthage", "f_carthage", ["loc_carthage"], 120_000,  2_000, TechEra.Ancient);
const registry = createPolityRegistry([rome, carthage]);

// A trade route: 2 shared locations, high-quality route
const pair: PolityPair = {
  polityAId: "rome", polityBId: "carthage",
  sharedLocations: 2,
  routeQuality_Q: q(0.70) as Q,
};
const pairs = [pair];

// ── Simulation ────────────────────────────────────────────────────────────────

const WORLD_SEED = 42;
const DAYS       = 90;

function printState(day: number): void {
  const r = registry.polities.get("rome")!;
  const c = registry.polities.get("carthage")!;
  const pct = (v: number) => ((v / SCALE.Q) * 100).toFixed(0).padStart(3) + "%";
  console.log(`Day ${String(day).padStart(2)}  ` +
    `Rome     pop=${r.population.toLocaleString().padStart(7)}  treasury=${r.treasury_cu.toLocaleString().padStart(6)}cu  ` +
    `morale=${pct(r.moraleQ)}  stability=${pct(r.stabilityQ)}  era=${techEraName(r.techEra)}`);
  console.log(`        ` +
    `Carthage pop=${c.population.toLocaleString().padStart(7)}  treasury=${c.treasury_cu.toLocaleString().padStart(6)}cu  ` +
    `morale=${pct(c.moraleQ)}  stability=${pct(c.stabilityQ)}  era=${techEraName(c.techEra)}`);
}

console.log(`\nAnanke — Campaign quickstart (seed ${WORLD_SEED})\n`);
console.log(`Rome starts at ${techEraName(TechEra.Medieval)} era; Carthage at ${techEraName(TechEra.Ancient)} era.`);
console.log(`Trade route connects them (routeQuality=${(0.70 * 100).toFixed(0)}%, 2 shared locations).\n`);

printState(0);
console.log();

for (let day = 1; day <= DAYS; day++) {
  stepPolityDay(registry, pairs, WORLD_SEED, day);
  stepTechDiffusion(registry, pairs, WORLD_SEED, day);
  if (day === 45 || day === DAYS) { printState(day); console.log(); }
}

const rome90     = registry.polities.get("rome")!;
const carthage90 = registry.polities.get("carthage")!;
console.log(`Summary: Rome treasury +${(rome90.treasury_cu - 5_000).toLocaleString()}cu in ${DAYS} days`);
console.log(`         Carthage era: ${techEraName(carthage90.techEra)} ` +
  `(${carthage90.techEra > TechEra.Ancient ? "advanced via diffusion" : "no advance yet — try more seeds or days"})`);
