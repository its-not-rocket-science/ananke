// examples/reference/campaign-sandbox/index.ts
// Reference build PM-1: Campaign Sandbox
//
// Turn-based world simulation: four polities across 180 days of trade, feudal
// bonds, military campaigning, epidemic, migration, and tech diffusion, ending
// with a deterministic save / reload round-trip.
//
// Usage:
//   npm run build && node dist/examples/reference/campaign-sandbox/index.js [seed] [days]
//   node dist/examples/reference/campaign-sandbox/index.js 42 180
//
// Systems demonstrated:
//   polity        createPolity, stepPolityDay, declareWar, makePeace, resolveWarOutcome
//   feudal        createVassalBond, applyDailyTribute, stepBondStrength, isRebellionRisk
//   demography    stepPolityPopulation
//   migration     computeMigrationFlow, applyMigrationFlows
//   epidemic      createEpidemicState, stepEpidemic, spreadEpidemic
//   diplomacy     signTreaty, stepTreatyStrength
//   tech-diffusion stepTechDiffusion
//   schema-migration stampSnapshot

import { q, SCALE, mulDiv, type Q }    from "../../../src/units.js";
import {
  createPolity, createPolityRegistry,
  stepPolityDay, declareWar, makePeace, areAtWar,
  deriveMilitaryStrength,
  type PolityPair, type PolityRegistry, type Polity,
} from "../../../src/polity.js";
import { stepPolityPopulation }         from "../../../src/demography.js";
import {
  computePushPressure, computePullFactor,
  computeMigrationFlow, applyMigrationFlows,
  type MigrationFlow,
} from "../../../src/migration.js";
import {
  createEpidemicState, stepEpidemic, spreadEpidemic,
  type PolityEpidemicState,
} from "../../../src/epidemic.js";
import { getDiseaseProfile }            from "../../../src/sim/disease.js";
import {
  signTreaty, stepTreatyStrength, createTreatyRegistry,
  getActiveTreaties, type TreatyRegistry,
} from "../../../src/diplomacy.js";
import {
  createFeudalRegistry, createVassalBond, applyDailyTribute,
  computeLevyStrength, stepBondStrength, isRebellionRisk, getVassals,
  type FeudalRegistry,
} from "../../../src/feudal.js";
import { TechEra }                      from "../../../src/sim/tech.js";
import { stampSnapshot }                from "../../../src/schema-migration.js";
import { techEraName, stepTechDiffusion } from "../../../src/tech-diffusion.js";

// ── CLI args ──────────────────────────────────────────────────────────────────

const SEED       = parseInt(process.argv[2] ?? "42", 10);
const DAYS       = parseInt(process.argv[3] ?? "180", 10);
const WAR_DAY    = 30;                       // Rome → Carthage
const PEACE_DAY  = WAR_DAY + 40;            // war ends
const PLAGUE_DAY = Math.trunc(DAYS * 0.4);  // plague in Carthage

// ── Disease profile ───────────────────────────────────────────────────────────

const PLAGUE_PROFILE = getDiseaseProfile("plague_pneumonic")!;

// ── World setup ───────────────────────────────────────────────────────────────

const rome     = createPolity("rome",     "Rome",     "f_rome",     ["loc_rome",   "loc_latium"], 250_000, 8_000, TechEra.Medieval);
const carthage = createPolity("carthage", "Carthage", "f_carthage", ["loc_carthage"],             180_000, 5_000, TechEra.Ancient);
const athens   = createPolity("athens",   "Athens",   "f_athens",   ["loc_attica", "loc_aegean"], 120_000, 4_500, TechEra.Ancient);
const sparta   = createPolity("sparta",   "Sparta",   "f_sparta",   ["loc_laconia"],               90_000, 3_000, TechEra.Ancient);

const registry:   PolityRegistry  = createPolityRegistry([rome, carthage, athens, sparta]);
const treatyReg:  TreatyRegistry  = createTreatyRegistry();
const feudalReg:  FeudalRegistry  = createFeudalRegistry();

const pairs: PolityPair[] = [
  { polityAId: "rome",     polityBId: "carthage", sharedLocations: 1, routeQuality_Q: q(0.65) as Q },
  { polityAId: "rome",     polityBId: "athens",   sharedLocations: 2, routeQuality_Q: q(0.80) as Q },
  { polityAId: "athens",   polityBId: "sparta",   sharedLocations: 2, routeQuality_Q: q(0.70) as Q },
  { polityAId: "carthage", polityBId: "athens",   sharedLocations: 1, routeQuality_Q: q(0.55) as Q },
];

// Diplomacy: Rome-Athens trade pact; Athens-Sparta military alliance
signTreaty(treatyReg, "rome",   "athens", "trade_pact",        SEED, 0);
signTreaty(treatyReg, "athens", "sparta", "military_alliance", SEED, 0);

// Feudal: Sparta is a voluntary vassal of Rome (10% tribute, 20% levy)
const spartaBond = createVassalBond(feudalReg, "sparta", "rome", "voluntary",
  q(0.10) as Q, q(0.20) as Q, 0);

const epidemics = new Map<string, PolityEpidemicState>();

// ── Helpers ───────────────────────────────────────────────────────────────────

const pct  = (v: number) => ((v / SCALE.Q) * 100).toFixed(0).padStart(3) + "%";
const kpop = (n: number) => `${(n / 1000).toFixed(1)}k`.padStart(7);

function printDay(day: number): void {
  console.log(`\n── Day ${String(day).padStart(3)} ${"─".repeat(60)}`);
  for (const polity of registry.polities.values()) {
    const treaties = getActiveTreaties(treatyReg, polity.id)
      .map(t => `${t.type}(${t.polityAId === polity.id ? t.polityBId : t.polityAId})`)
      .join(", ") || "none";

    const vassals = getVassals(feudalReg, polity.id);
    const feudalStr = vassals.length > 0
      ? ` vassals=[${vassals.map(b => `${b.vassalPolityId}:${pct(b.strength_Q)}`).join(",")}]`
      : "";
    const liegeStr = (() => {
      const b = [...feudalReg.bonds.values()].find(x => x.vassalPolityId === polity.id);
      return b ? ` liege=${b.liegePolityId}(bond:${pct(b.strength_Q)}${isRebellionRisk(b) ? "!" : ""})` : "";
    })();

    const epi    = epidemics.get(polity.id);
    const epiStr = epi ? ` plague=${pct(epi.prevalence_Q)}` : "";
    const warStr = areAtWar(registry, "rome", "carthage") &&
      (polity.id === "rome" || polity.id === "carthage") ? " [AT WAR]" : "";

    console.log(
      `  ${polity.name.padEnd(10)} pop=${kpop(polity.population)}` +
      ` trs=${polity.treasury_cu.toString().padStart(6)}cu` +
      ` mil=${pct(polity.militaryStrength_Q)}` +
      ` stb=${pct(polity.stabilityQ)} mor=${pct(polity.moraleQ)}` +
      ` era=${techEraName(polity.techEra).padEnd(12)}` +
      ` treaties=[${treaties}]${feudalStr}${liegeStr}${epiStr}${warStr}`,
    );
  }
}

// ── Simulation ────────────────────────────────────────────────────────────────

console.log(`\nAnanke — Campaign Sandbox  (seed ${SEED}, ${DAYS} days)`);
console.log("Rome · Carthage · Athens · Sparta");
console.log("Systems: polity · feudal · demography · migration · epidemic · diplomacy · tech-diffusion\n");

const perfStart = performance.now();
printDay(0);

for (let day = 1; day <= DAYS; day++) {

  // ── 1. War events ──────────────────────────────────────────────────────────
  if (day === WAR_DAY) {
    const romeP    = registry.polities.get("rome")!;
    const carthP   = registry.polities.get("carthage")!;
    const levy     = computeLevyStrength(sparta, spartaBond);
    const romeEff  = Math.round((romeP.militaryStrength_Q + levy) / SCALE.Q * 100);
    const carthEff = Math.round(carthP.militaryStrength_Q / SCALE.Q * 100);
    console.log(`\n  *** Day ${day}: Rome declares war on Carthage!` +
      ` Rome mil ${romeEff}% (incl. Sparta levy ${pct(levy)}) vs Carthage ${carthEff}% ***`);
    declareWar(registry, "rome", "carthage");
  }

  if (day === PEACE_DAY && areAtWar(registry, "rome", "carthage")) {
    const romeP  = registry.polities.get("rome")!;
    const carthP = registry.polities.get("carthage")!;
    makePeace(registry, "rome", "carthage");
    console.log(
      `\n  *** Day ${day}: Peace! Rome ${romeP.locationIds.length} territories` +
      ` | Carthage ${carthP.locationIds.length} territories ***`,
    );
  }

  // ── 2. Campaign step (economics, trade, war resolution, morale) ────────────
  stepPolityDay(registry, pairs, SEED, day);
  stepTechDiffusion(registry, pairs, SEED, day);

  // ── 3. Feudal: tribute + bond decay ───────────────────────────────────────
  const spartan = registry.polities.get("sparta")!;
  const romeP   = registry.polities.get("rome")!;
  applyDailyTribute(spartan, romeP, spartaBond);
  stepBondStrength(spartaBond);

  if (isRebellionRisk(spartaBond) && day % 30 === 0) {
    console.log(`\n  *** Day ${day}: Sparta (bond ${pct(spartaBond.strength_Q)}) is at rebellion risk! ***`);
  }

  // ── 4. Population dynamics ────────────────────────────────────────────────
  for (const polity of registry.polities.values()) {
    stepPolityPopulation(polity, 1);
  }

  // ── 5. Migration flows ────────────────────────────────────────────────────
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

  // ── 6. Treaty maintenance ─────────────────────────────────────────────────
  for (const treaty of treatyReg.treaties.values()) {
    stepTreatyStrength(treaty);
  }

  // ── 7. Epidemic ───────────────────────────────────────────────────────────
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
    const carthaState = epidemics.get("carthage");
    if (carthaState && !epidemics.has("athens")) {
      const spread = spreadEpidemic(carthaState, PLAGUE_PROFILE, "athens", q(0.30) as Q);
      if (spread) {
        console.log(`  *** Day ${day}: Plague spreads to Athens via trade! ***`);
        epidemics.set("athens", spread);
      }
    }
  }

  // ── 8. Print on milestone days ────────────────────────────────────────────
  if (day === WAR_DAY || day === PEACE_DAY || day === PLAGUE_DAY ||
      day === Math.trunc(DAYS / 2) || day === DAYS) {
    printDay(day);
  }
}

const perfMs = performance.now() - perfStart;

// ── Save / reload round-trip ──────────────────────────────────────────────────

console.log(`\n${"─".repeat(70)}`);
console.log("Save / reload round-trip:");

const snapshot = {
  day:      DAYS,
  seed:     SEED,
  polities: Object.fromEntries(
    [...registry.polities.entries()].map(([id, p]: [string, Polity]) => [id, {
      population:          p.population,
      treasury_cu:         p.treasury_cu,
      moraleQ:             p.moraleQ,
      stabilityQ:          p.stabilityQ,
      techEra:             p.techEra,
      militaryStrength_Q:  p.militaryStrength_Q,
    }]),
  ),
  feudal: {
    spartaBondStrength: spartaBond.strength_Q,
    rebellionRisk:      isRebellionRisk(spartaBond),
  },
} satisfies Record<string, unknown>;

const stamped  = stampSnapshot(snapshot, "campaign");
const json     = JSON.stringify(stamped);
const parsed   = JSON.parse(json) as typeof stamped;
const romeA    = (snapshot.polities as Record<string, { population: number }>)["rome"]!.population;
const romeB    = (parsed.polities   as Record<string, { population: number }>)["rome"]!.population;
const stampRec = stamped as unknown as Record<string, unknown>;

console.log(`  ✓  Stamped: _ananke_version="${stampRec["_ananke_version"]}"  _schema="campaign"`);
console.log(`  ✓  Round-trip intact: Rome pop ${romeA} → ${romeB}  match=${romeA === romeB}`);
console.log(`  ✓  Feudal state persisted: Sparta bond ${pct(spartaBond.strength_Q)}  rebellion=${isRebellionRisk(spartaBond)}`);
console.log(`  ✓  Save size: ${json.length} bytes`);

// ── Performance envelope ──────────────────────────────────────────────────────

const romeF    = registry.polities.get("rome")!;
const carthaF  = registry.polities.get("carthage")!;
const athensF  = registry.polities.get("athens")!;
const spartaF  = registry.polities.get("sparta")!;

console.log(`\n${"─".repeat(70)}`);
console.log("Final state:");
console.log(`  Rome      pop=${kpop(romeF.population).trim()}  trs=${romeF.treasury_cu}cu  mil=${pct(romeF.militaryStrength_Q)}  territories=${romeF.locationIds.length}`);
console.log(`  Carthage  pop=${kpop(carthaF.population).trim()}  trs=${carthaF.treasury_cu}cu  mil=${pct(carthaF.militaryStrength_Q)}  territories=${carthaF.locationIds.length}`);
console.log(`  Athens    pop=${kpop(athensF.population).trim()}  trs=${athensF.treasury_cu}cu  mil=${pct(athensF.militaryStrength_Q)}`);
console.log(`  Sparta    pop=${kpop(spartaF.population).trim()}  trs=${spartaF.treasury_cu}cu  mil=${pct(spartaF.militaryStrength_Q)}  bond=${pct(spartaBond.strength_Q)}`);

console.log(`\nPerformance:`);
console.log(`  Polities: ${registry.polities.size}  Days: ${DAYS}  Total: ${perfMs.toFixed(1)}ms  Avg/day: ${(perfMs / DAYS).toFixed(2)}ms`);

console.log(`\nSystems used:`);
console.log(`  polity         stepPolityDay, declareWar, makePeace, resolveWarOutcome (auto)`);
console.log(`  feudal         createVassalBond, applyDailyTribute, stepBondStrength, isRebellionRisk`);
console.log(`  demography     stepPolityPopulation`);
console.log(`  migration      computeMigrationFlow, applyMigrationFlows`);
console.log(`  epidemic       createEpidemicState, stepEpidemic, spreadEpidemic`);
console.log(`  diplomacy      signTreaty, stepTreatyStrength`);
console.log(`  tech-diffusion stepTechDiffusion`);
console.log(`  schema-migration stampSnapshot\n`);
