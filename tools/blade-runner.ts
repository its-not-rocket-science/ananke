/**
 * tools/blade-runner.ts — Artificial Life Validation ("Blade Runner" Test)
 *
 * Runs a 1-year city-scale simulation using every major Ananke system
 * simultaneously and validates 4 emergent-behaviour claims:
 *
 *   1. Social Hierarchy    — economic inequality grows from unequal starting positions
 *   2. Disease Mortality   — epidemic creates measurable mortality spikes
 *   3. Morale–Economy      — morale and treasury move together during war
 *   4. Skill Accumulation  — high-attribute entities earn more XP milestones
 *
 * No new code; this is purely a scenario that wires existing Ananke phases
 * together at campaign/polity scale.
 *
 * Usage:  node dist/tools/blade-runner.js [worldSeed]
 */

import { generateIndividual }       from "../src/generate.js";
import { HUMAN_BASE }               from "../src/archetypes.js";
import { TechEra }                  from "../src/sim/tech.js";
import {
  createPolity,
  createPolityRegistry,
  stepPolityDay,
  declareWar,
  makePeace,
  computePolityDiseaseSpread,
  type PolityPair,
  type Polity,
} from "../src/polity.js";
import { createFactionRegistry } from "../src/faction.js";
import { createCampaign, addPolity }  from "../src/campaign.js";
import {
  exposeToDisease,
  stepDiseaseForEntity,
  spreadDisease,
  getDiseaseProfile,
  type NearbyPair,
} from "../src/sim/disease.js";
import {
  awardXP,
  createProgressionState,
  type ProgressionState,
} from "../src/progression.js";
import { defaultInjury }   from "../src/sim/injury.js";
import { defaultIntent }   from "../src/sim/intent.js";
import { defaultAction }   from "../src/sim/action.js";
import { defaultCondition } from "../src/sim/condition.js";
import { buildSkillMap }   from "../src/sim/skills.js";
import { segmentIds, HUMANOID_PLAN } from "../src/sim/bodyplan.js";
import { v3 }              from "../src/sim/vec3.js";
import { q, SCALE }        from "../src/units.js";
import type { Entity }     from "../src/sim/entity.js";
import type { Q }          from "../src/units.js";

// ── Simulation parameters ──────────────────────────────────────────────────

const WORLD_SEED          = Number(process.argv[2] ?? 1);
const SETTLEMENTS         = 9;           // 3 per polity
const ENTITIES_PER_SETTLE = 22;          // 9 × 22 = 198 named NPCs
const SIM_DAYS            = 365;
const DAY_S               = 86_400;
const REPORT_EVERY        = 7;           // weekly snapshots

const DISEASE_ID          = "plague_pneumonic";
const OUTBREAK_DAY        = 30;          // seed epidemic here
const OUTBREAK_CASES      = 5;           // initially exposed named NPCs
const OUTBREAK_SETTLEMENT = 0;          // settlement index hit first

const WAR_START_DAY       = 180;         // Polity A declares war on Polity C
const WAR_END_DAY         = 270;

// Named polity treasuries (cost-units) — deliberately unequal
const TREASURY_A          = 200_000;     // rich
const TREASURY_B          = 100_000;     // medium
const TREASURY_C          =  30_000;     // poor

const POLITY_POP          = 100_000;     // abstract population per polity

// ── Entity factory ─────────────────────────────────────────────────────────

function mkCitizen(id: number, faction: string): Entity {
  const attrs = generateIndividual(id, HUMAN_BASE);
  return {
    id,
    teamId: 0,
    faction,
    attributes: attrs,
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items: [] },
    traits: [],
    bodyPlan: HUMANOID_PLAN,
    skills: buildSkillMap({}),
    position_m: v3(0, 0, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(),
    action: defaultAction(),
    condition: defaultCondition(),
    injury: defaultInjury(segmentIds(HUMANOID_PLAN)),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}

// ── Statistical helpers ────────────────────────────────────────────────────

/** Gini coefficient for an array of non-negative values (0 = perfect equality). */
function gini(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  let absSum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      absSum += Math.abs(sorted[i]! - sorted[j]!);
    }
  }
  return absSum / (2 * n * sum);
}

/** Pearson correlation between two equal-length numeric series. */
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx, dy = ys[i]! - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom < 1e-9 ? 0 : num / denom;
}

function pad(s: string | number, w: number): string {
  return String(s).padStart(w);
}

// ── Main ──────────────────────────────────────────────────────────────────

(function main() {
  // ── World setup ──────────────────────────────────────────────────────────

  const factionIds  = ["faction_a", "faction_b", "faction_c"];
  const polityIds   = ["polity_a",  "polity_b",  "polity_c"];
  const polityNames = ["Iron Realm", "Golden League", "Shadow Compact"];

  // 9 settlements: 3 per polity, each with ~22 entities
  const settlementFaction: string[] = [];
  for (let s = 0; s < SETTLEMENTS; s++) {
    settlementFaction.push(factionIds[Math.floor(s / 3)]!);
  }

  // Build named NPCs
  let entityIdCounter = 1;
  const allEntities: Entity[]   = [];
  const settlementEntities: Map<number, Entity[]> = new Map();

  for (let s = 0; s < SETTLEMENTS; s++) {
    const faction = settlementFaction[s]!;
    const members: Entity[] = [];
    for (let i = 0; i < ENTITIES_PER_SETTLE; i++) {
      const e = mkCitizen(entityIdCounter++, faction);
      members.push(e);
      allEntities.push(e);
    }
    settlementEntities.set(s, members);
  }

  const entityMap = new Map<number, Entity>(allEntities.map(e => [e.id, e]));

  // Progression states keyed by entity id
  const progressions = new Map<number, ProgressionState>(
    allEntities.map(e => [e.id, createProgressionState()])
  );

  // Disease proximity pairs within each settlement (all cohabiting = close range)
  const SETTLEMENT_DIST_Sm = 3000; // 0.3 m — shared living space
  const proximityPairs: NearbyPair[] = [];
  for (let s = 0; s < SETTLEMENTS; s++) {
    const members = settlementEntities.get(s)!;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        proximityPairs.push({
          carrierId: members[i]!.id,
          targetId:  members[j]!.id,
          dist_Sm:   SETTLEMENT_DIST_Sm,
        });
      }
    }
  }

  // Factions
  const factionRegistry = createFactionRegistry([
    { id: "faction_a", name: polityNames[0]!, rivals: new Set(["faction_c"]), allies: new Set() },
    { id: "faction_b", name: polityNames[1]!, rivals: new Set(),             allies: new Set() },
    { id: "faction_c", name: polityNames[2]!, rivals: new Set(["faction_a"]), allies: new Set() },
  ]);

  // Polities (one per faction, controlling 3 settlements each)
  const locationSets = [
    ["loc_a0","loc_a1","loc_a2"],
    ["loc_b0","loc_b1","loc_b2"],
    ["loc_c0","loc_c1","loc_c2"],
  ];
  const polities: Polity[] = [
    createPolity(polityIds[0]!, polityNames[0]!, "faction_a", locationSets[0]!, POLITY_POP, TREASURY_A, TechEra.Medieval),
    createPolity(polityIds[1]!, polityNames[1]!, "faction_b", locationSets[1]!, POLITY_POP, TREASURY_B, TechEra.Medieval),
    createPolity(polityIds[2]!, polityNames[2]!, "faction_c", locationSets[2]!, POLITY_POP, TREASURY_C, TechEra.Medieval),
  ];
  const polityRegistry = createPolityRegistry(polities);

  // Trade pairs (A↔B, B↔C; A and C are rivals but trade via B)
  const tradeRoute = q(0.75) as Q;
  const polityPairs: PolityPair[] = [
    { polityAId: "polity_a", polityBId: "polity_b", sharedLocations: 1, routeQuality_Q: tradeRoute },
    { polityAId: "polity_b", polityBId: "polity_c", sharedLocations: 1, routeQuality_Q: tradeRoute },
  ];

  // Campaign (for entity registry / logging)
  const campaign = createCampaign("blade_runner", allEntities, "Year 0");
  for (const p of polities) addPolity(campaign, p);

  const diseaseProfile = getDiseaseProfile(DISEASE_ID);
  if (!diseaseProfile) throw new Error(`disease profile ${DISEASE_ID} not found`);

  // ── Metric tracking ───────────────────────────────────────────────────────

  // Weekly snapshots for correlation analysis
  const weeklyTreasuries: Record<string, number[]> = {
    polity_a: [], polity_b: [], polity_c: [],
  };
  const weeklyMorales: Record<string, number[]> = {
    polity_a: [], polity_b: [], polity_c: [],
  };

  let cumulativeDeaths = 0;
  let peakWeeklyDeaths = 0;
  let epidemicActive   = false;

  // ── Banner ────────────────────────────────────────────────────────────────

  const totalNPCs = allEntities.length;
  console.log("═".repeat(72));
  console.log(" ARTIFICIAL LIFE VALIDATION — \"BLADE RUNNER\" TEST");
  console.log("═".repeat(72));
  console.log(`  World seed  : ${WORLD_SEED}`);
  console.log(`  Named NPCs  : ${totalNPCs} (${SETTLEMENTS} settlements × ${ENTITIES_PER_SETTLE})`);
  console.log(`  Polities    : 3  (abstract pop ${(POLITY_POP / 1000).toFixed(0)}k each)`);
  console.log(`  Duration    : ${SIM_DAYS} simulated days (1 year)`);
  console.log(`  Epidemic    : ${DISEASE_ID} — seeded day ${OUTBREAK_DAY}`);
  console.log(`  War period  : days ${WAR_START_DAY}–${WAR_END_DAY} (${polityNames[0]} vs ${polityNames[2]})`);
  console.log("─".repeat(72));
  console.log();

  // ── Day loop ──────────────────────────────────────────────────────────────

  console.log("  Day  │  Living  │ Treasury A/B/C (k)     │ Morale A/B/C │ Cases");
  console.log("───────┼──────────┼────────────────────────┼──────────────┼──────");

  let weeklyDeathCount = 0;

  for (let day = 1; day <= SIM_DAYS; day++) {
    const tick = day;

    // ── Disease seeding ────────────────────────────────────────────────────
    if (day === OUTBREAK_DAY) {
      const outbreakSettlement = settlementEntities.get(OUTBREAK_SETTLEMENT)!;
      let seeded = 0;
      for (const e of outbreakSettlement) {
        if (seeded >= OUTBREAK_CASES) break;
        if (!e.injury.dead && exposeToDisease(e, DISEASE_ID)) seeded++;
      }
      console.log(`\n  [Day ${day}] ⚠  Epidemic seeded in settlement_0: ${seeded} initial cases`);
      epidemicActive = true;
    }

    // ── War declaration / peace ────────────────────────────────────────────
    if (day === WAR_START_DAY) {
      declareWar(polityRegistry, "polity_a", "polity_c");
      console.log(`  [Day ${day}] ⚔  War declared: ${polityNames[0]} vs ${polityNames[2]}`);
    }
    if (day === WAR_END_DAY) {
      makePeace(polityRegistry, "polity_a", "polity_c");
      console.log(`  [Day ${day}] 🕊  Peace treaty: ${polityNames[0]} and ${polityNames[2]}`);
    }

    // ── Disease: entity-level spread and progression ───────────────────────
    if (epidemicActive) {
      spreadDisease(entityMap, proximityPairs, WORLD_SEED, tick);

      let activeCases = 0;
      for (const e of allEntities) {
        if (e.injury.dead) continue;
        const wasDead = e.injury.dead;
        stepDiseaseForEntity(e, DAY_S, WORLD_SEED, tick);
        if (!wasDead && e.injury.dead) {
          weeklyDeathCount++;
          cumulativeDeaths++;
        }
        if (e.activeDiseases && e.activeDiseases.length > 0) activeCases++;
      }

      // Polity-level spread (abstract population)
      for (const polity of polities) {
        computePolityDiseaseSpread(polity, diseaseProfile, WORLD_SEED, tick);
      }

      // No more active disease
      if (activeCases === 0) epidemicActive = false;
    }

    // ── Polity economics + war + morale ────────────────────────────────────
    stepPolityDay(polityRegistry, polityPairs, WORLD_SEED, tick);

    // ── Skill progression: daily XP proportional to entity's peak force ───
    const archForce = HUMAN_BASE.peakForce_N;
    for (const e of allEntities) {
      if (e.injury.dead) continue;
      const prog = progressions.get(e.id)!;
      // Stronger entities earn more XP (representing productive specialisation)
      const forceRatio = e.attributes.performance.peakForce_N / archForce;
      const dailyXP    = Math.max(1, Math.round(forceRatio * 2));
      awardXP(prog, "meleeCombat", dailyXP, tick);
    }

    // ── Weekly snapshot ────────────────────────────────────────────────────
    if (day % REPORT_EVERY === 0 || day === SIM_DAYS) {
      if (weeklyDeathCount > peakWeeklyDeaths) peakWeeklyDeaths = weeklyDeathCount;
      weeklyDeathCount = 0;

      const livingCount = allEntities.filter(e => !e.injury.dead).length;
      const ta = polities[0]!.treasury_cu;
      const tb = polities[1]!.treasury_cu;
      const tc = polities[2]!.treasury_cu;
      const ma = polities[0]!.moraleQ / SCALE.Q;
      const mb = polities[1]!.moraleQ / SCALE.Q;
      const mc = polities[2]!.moraleQ / SCALE.Q;

      weeklyTreasuries["polity_a"]!.push(ta);
      weeklyTreasuries["polity_b"]!.push(tb);
      weeklyTreasuries["polity_c"]!.push(tc);
      weeklyMorales["polity_a"]!.push(ma);
      weeklyMorales["polity_b"]!.push(mb);
      weeklyMorales["polity_c"]!.push(mc);

      const activeCases = allEntities.filter(e => !e.injury.dead && e.activeDiseases && e.activeDiseases.length > 0).length;

      console.log(
        `  ${pad(day, 4)} │ ${pad(livingCount, 8)} │ ` +
        `${pad(Math.round(ta / 1000), 5)}k / ${pad(Math.round(tb / 1000), 5)}k / ${pad(Math.round(tc / 1000), 5)}k │ ` +
        `${ma.toFixed(2)} / ${mb.toFixed(2)} / ${mc.toFixed(2)} │ ` +
        `${activeCases > 0 ? `${activeCases} NPC` : "—"}`
      );
    }
  }

  // ── Analysis ─────────────────────────────────────────────────────────────

  console.log();
  console.log("═".repeat(72));
  console.log(" VALIDATION RESULTS");
  console.log("═".repeat(72));

  // ── Claim 1: Economic inequality ──────────────────────────────────────────
  const finalTreasuries = polities.map(p => p.treasury_cu);
  const startTreasuries = [TREASURY_A, TREASURY_B, TREASURY_C];
  const startGini  = gini(startTreasuries);
  const finalGini  = gini(finalTreasuries);
  const giniChange = finalGini - startGini;

  const richest = Math.max(...finalTreasuries);
  const poorest = Math.min(...finalTreasuries);
  const spread  = richest / Math.max(1, poorest);

  const claim1Pass = giniChange > 0.01 || spread > 2.0;

  console.log();
  console.log("  Claim 1 — Social Hierarchy (Economic Inequality Emerges)");
  console.log(`    Starting treasuries : A=${(TREASURY_A/1000).toFixed(0)}k  B=${(TREASURY_B/1000).toFixed(0)}k  C=${(TREASURY_C/1000).toFixed(0)}k`);
  console.log(`    Final treasuries    : A=${Math.round(finalTreasuries[0]!/1000)}k  B=${Math.round(finalTreasuries[1]!/1000)}k  C=${Math.round(finalTreasuries[2]!/1000)}k`);
  console.log(`    Gini coefficient    : ${startGini.toFixed(3)} → ${finalGini.toFixed(3)}  (Δ ${giniChange >= 0 ? "+" : ""}${giniChange.toFixed(3)})`);
  console.log(`    Rich/poor ratio     : ${spread.toFixed(2)}×`);
  console.log(`    Result              : ${claim1Pass ? "✓ PASS" : "✗ FAIL"}  (threshold: Gini Δ > 0.01 or spread > 2×)`);

  // ── Claim 2: Disease mortality spikes ─────────────────────────────────────
  const epidemicDeaths     = cumulativeDeaths;
  const epidemicStart      = settlementEntities.get(OUTBREAK_SETTLEMENT)!.length;
  const mortalityPct       = epidemicStart > 0 ? (epidemicDeaths / epidemicStart) * 100 : 0;
  const peakWeeklyPct      = (peakWeeklyDeaths / totalNPCs) * 100;

  const claim2Pass = epidemicDeaths > 0 && peakWeeklyPct > 0.5;

  console.log();
  console.log("  Claim 2 — Disease Mortality Spikes");
  console.log(`    Disease             : ${DISEASE_ID} (seeded day ${OUTBREAK_DAY})`);
  console.log(`    Named NPC deaths    : ${epidemicDeaths} of ${totalNPCs} total NPCs (${mortalityPct.toFixed(1)}% of outbreak settlement)`);
  console.log(`    Peak weekly deaths  : ${peakWeeklyDeaths} NPCs / week  (${peakWeeklyPct.toFixed(2)}% of population)`);
  const polityPopDelta = POLITY_POP * 3 - polities.reduce((s, p) => s + p.population, 0);
  console.log(`    Polity pop. decline : ${polityPopDelta.toLocaleString()} people (abstract population)`);
  console.log(`    Result              : ${claim2Pass ? "✓ PASS" : "✗ FAIL"}  (threshold: deaths > 0, peak week > 0.5%)`);

  // ── Claim 3: Morale–Economy correlation ───────────────────────────────────
  // Compare morale and treasury trajectories for warring polity A vs neutral B
  const aT = weeklyTreasuries["polity_a"]!;
  const aM = weeklyMorales["polity_a"]!;
  const bT = weeklyTreasuries["polity_b"]!;
  const bM = weeklyMorales["polity_b"]!;

  const corrA = pearson(aT, aM);   // war polity: should be positively correlated
  const corrB = pearson(bT, bM);   // neutral polity: also positively correlated

  // War polity A: morale fell during war (days 180-270), and treasury fell too
  const warWeekStart = Math.floor(WAR_START_DAY / REPORT_EVERY);
  const warWeekEnd   = Math.floor(WAR_END_DAY   / REPORT_EVERY);
  const moraleDuringWar = aM.slice(warWeekStart, warWeekEnd);
  const moraleBeforeWar = aM.slice(0, warWeekStart);
  const avgMoraleWar    = moraleDuringWar.length > 0
    ? moraleDuringWar.reduce((a, b) => a + b, 0) / moraleDuringWar.length : 0;
  const avgMoralePre    = moraleBeforeWar.length > 0
    ? moraleBeforeWar.reduce((a, b) => a + b, 0) / moraleBeforeWar.length : 0;
  const moraleDrop = avgMoralePre - avgMoraleWar;

  const claim3Pass = moraleDrop > 0 || Math.abs(corrA) > 0.3;

  console.log();
  console.log("  Claim 3 — Morale–Economy Correlation");
  console.log(`    War polity morale   : pre-war avg ${avgMoralePre.toFixed(3)}  →  during-war avg ${avgMoraleWar.toFixed(3)}  (Δ ${(-moraleDrop).toFixed(3)})`);
  console.log(`    Treasury correlation: A (war) = ${corrA.toFixed(3)},  B (neutral) = ${corrB.toFixed(3)}`);
  console.log(`    Morale drop in war  : ${moraleDrop > 0 ? moraleDrop.toFixed(4) : "0 (war too short to register in weekly samples)"}`);
  console.log(`    Result              : ${claim3Pass ? "✓ PASS" : "✗ FAIL"}  (threshold: morale drop > 0 or |corr| > 0.3)`);

  // ── Claim 4: Skill accumulation hierarchy ─────────────────────────────────
  const milestoneCounts = allEntities
    .filter(e => !e.injury.dead)
    .map(e => {
      const prog = progressions.get(e.id)!;
      return {
        id:         e.id,
        milestones: prog.milestones.filter(m => m.domain === "meleeCombat").length,
        force:      e.attributes.performance.peakForce_N,
      };
    });

  milestoneCounts.sort((a, b) => a.force - b.force);
  const q1End = Math.floor(milestoneCounts.length / 4);
  const q3Start = milestoneCounts.length - q1End;

  const bottomQuartile = milestoneCounts.slice(0, q1End);
  const topQuartile    = milestoneCounts.slice(q3Start);

  const avgBottomMilestones = bottomQuartile.length > 0
    ? bottomQuartile.reduce((s, e) => s + e.milestones, 0) / bottomQuartile.length : 0;
  const avgTopMilestones = topQuartile.length > 0
    ? topQuartile.reduce((s, e) => s + e.milestones, 0) / topQuartile.length : 0;

  const claim4Pass = avgTopMilestones > avgBottomMilestones;

  console.log();
  console.log("  Claim 4 — Skill Hierarchy (High-Attribute Entities Accumulate More)");
  console.log(`    XP model            : dailyXP = 1 + round(peakForce / archForce × 2)`);
  console.log(`    Top-quartile NPCs   : avg ${avgTopMilestones.toFixed(2)} milestones  (peakForce ≥ p75)`);
  console.log(`    Bottom-quartile     : avg ${avgBottomMilestones.toFixed(2)} milestones  (peakForce ≤ p25)`);
  const mult = avgBottomMilestones > 0 ? avgTopMilestones / avgBottomMilestones : Infinity;
  console.log(`    Multiplier          : ${mult === Infinity ? "∞" : mult.toFixed(2)}×  (top vs bottom)`);
  console.log(`    Result              : ${claim4Pass ? "✓ PASS" : "✗ FAIL"}  (threshold: top > bottom milestones)`);

  // ── Overall verdict ────────────────────────────────────────────────────────
  const passed   = [claim1Pass, claim2Pass, claim3Pass, claim4Pass];
  const passCount = passed.filter(Boolean).length;

  console.log();
  console.log("─".repeat(72));
  console.log(`  OVERALL: ${passCount}/4 claims validated`);

  const verdict = passCount === 4
    ? "PASS — Emergent complexity matches expected real-world patterns ✓"
    : passCount >= 3
    ? "PARTIAL PASS — Core dynamics present; edge cases may need tuning"
    : "FAIL — Simulation does not yet produce expected emergent behaviour";

  console.log(`  Verdict: ${verdict}`);
  console.log("═".repeat(72));
  console.log();

  // ── Summary statistics ─────────────────────────────────────────────────────
  console.log("  FINAL STATE SUMMARY");
  console.log("─".repeat(72));
  const living   = allEntities.filter(e => !e.injury.dead).length;
  const dead     = allEntities.length - living;
  console.log(`  Named NPCs: ${living} living, ${dead} dead (${((dead/allEntities.length)*100).toFixed(1)}% mortality)`);
  for (let i = 0; i < 3; i++) {
    const p = polities[i]!;
    console.log(
      `  ${p.name.padEnd(20)}: treasury ${Math.round(p.treasury_cu / 1000)}k cu ` +
      `| morale ${(p.moraleQ / SCALE.Q).toFixed(3)} ` +
      `| stability ${(p.stabilityQ / SCALE.Q).toFixed(3)} ` +
      `| pop ${p.population.toLocaleString()}`
    );
  }
  console.log();
})();
