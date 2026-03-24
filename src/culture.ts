/**
 * Phase 71 — Cultural Generation & Evolution Framework
 *
 * Derives culture bottom-up from five environmental forces (Environment, Power,
 * Exchange, Legacy, Belief) using the Reverse WOAC method.  Given a Polity and
 * its world context, `generateCulture` produces a `CultureProfile` of values,
 * internal contradictions, and recurring practices (CYCLES).  `stepCultureYear`
 * evolves the profile over simulated time.  `describeCulture` renders it as
 * human-readable prose for writers and game designers.
 *
 * No kernel import — pure data-management module, fixed-point arithmetic only.
 */

import type { Q }              from "./units.js";
import { SCALE, q, clampQ, mulDiv } from "./units.js";
import type { Polity, PolityRegistry } from "./polity.js";
import type { Myth }           from "./mythology.js";
import type { BiomeContext }   from "./sim/biome.js";
import type { VassalNode }     from "./polity-vassals.js";
import { eventSeed, hashString } from "./sim/seeds.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** The five environmental forces that drive culture generation. */
export type CultureForce =
  | "environment"   // physical and geographic pressures
  | "power"         // how authority is legitimised and contested
  | "exchange"      // dominant economic mode
  | "legacy"        // accumulated myths and historical events
  | "belief";       // supernatural model

/**
 * CYCLES audit: the six recurring cultural practice categories.
 * (Celebration, Yes-or-no rules, Conflict resolution, Lifecycle rites,
 *  Exchange norms, Status markers)
 */
export type CycleType =
  | "celebration"
  | "taboo"
  | "conflict_resolution"
  | "lifecycle"
  | "exchange_norm"
  | "status_marker";

/** Named cultural values a society may hold. */
export type ValueId =
  | "honour"              // reputation, keeping oaths, saving face
  | "martial_virtue"      // courage, strength, prowess in battle
  | "commerce"            // trade, wealth, market exchange
  | "fatalism"            // acceptance of fate, stoic endurance
  | "hospitality"         // generosity, welcoming strangers
  | "hierarchy"           // respect for rank and authority
  | "spiritual_devotion"  // reverence for supernatural forces
  | "innovation"          // embrace of change and new ideas
  | "kin_loyalty"         // family above external obligations
  | "craft_mastery";      // pride in skilled, careful work

/** Type of cultural schism that can emerge from unresolved contradictions. */
export type SchismType = "reform_movement" | "heresy" | "civil_unrest";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface CulturalValue {
  id:         ValueId;
  /** Strength of this value in the culture [0, SCALE.Q]. */
  strength_Q: Q;
}

export interface CulturalContradiction {
  valueA:    ValueId;
  valueB:    ValueId;
  /**
   * Tension level [0, SCALE.Q].
   * High tension → more likely to produce internal conflict events.
   */
  tension_Q: Q;
}

export interface CulturalCycle {
  type:        CycleType;
  name:        string;
  description: string;
}

export interface CultureProfile {
  /** Unique id, typically `"culture_${polityId}"`. */
  id:              string;
  polityId:        string;
  /** Strength of each driving force [0, SCALE.Q]. */
  forces:          Record<CultureForce, Q>;
  /** Derived value list, sorted descending by strength. */
  values:          CulturalValue[];
  /** Value pairs in tension; only pairs with tension > CONTRADICTION_THRESHOLD included. */
  contradictions:  CulturalContradiction[];
  /** Recurring cultural practices that resolve the dominant tensions. */
  cycles:          CulturalCycle[];
  /**
   * Openness to cultural change [0, SCALE.Q].
   * Low = conservative; high = receptive to drift.
   */
  driftTendency_Q: Q;
}

export interface CultureDescription {
  /** One-paragraph cultural summary. */
  summary:        string;
  /** Plain-English description of each significant value. */
  values:         string[];
  /** What conflicts each contradiction tends to generate. */
  contradictions: string[];
  /** Narrative descriptions of key recurring practices. */
  cycles:         string[];
}

export interface SchismEvent {
  polityId:                string;
  triggeringContradiction: CulturalContradiction;
  type:                    SchismType;
  /** How disruptive the schism is [0, SCALE.Q]. */
  severity_Q:              Q;
}

export interface CultureYearResult {
  profile:  CultureProfile;
  /** Populated if a contradiction triggered a schism this year. */
  schism?:  SchismEvent;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum value strength to be included in the profile. */
export const VALUE_THRESHOLD_Q          = q(0.10) as Q;
/** Minimum tension to qualify as a significant contradiction. */
export const CONTRADICTION_THRESHOLD_Q  = q(0.30) as Q;
/** Maximum number of values retained in a profile. */
export const MAX_VALUES                 = 6;
/** Maximum number of contradictions tracked. */
export const MAX_CONTRADICTIONS         = 4;
/** Maximum number of CYCLES retained. */
export const MAX_CYCLES                 = 3;
/** Annual drift step magnitude for force evolution. */
export const DRIFT_STEP_Q               = q(0.02) as Q;
/** Annual tech pressure on the exchange force per tech-era gap. */
export const TECH_DIFFUSION_PULL_Q      = q(0.03) as Q;
/** eventSeed salt for schism rolls. */
export const SCHISM_SALT                = 0xC17E as number;

// ── Internal lookup tables ────────────────────────────────────────────────────

/** Baseline power force (authority centralisation) by tech era. */
const TECH_POWER: Record<string, Q> = {
  prehistoric:  q(0.20) as Q,
  ancient:      q(0.40) as Q,
  medieval:     q(0.70) as Q,
  early_modern: q(0.55) as Q,
  industrial:   q(0.45) as Q,
  contemporary: q(0.35) as Q,
};

/**
 * Known-tension pairs: [valueA, valueB, base tension when both are at SCALE.Q].
 * Actual tension is scaled by min(strengthA, strengthB).
 */
const TENSION_PAIRS: [ValueId, ValueId, Q][] = [
  ["honour",             "commerce",           q(0.80) as Q], // reputation vs bargaining
  ["hierarchy",          "innovation",         q(0.70) as Q], // authority vs change
  ["fatalism",           "commerce",           q(0.60) as Q], // why strive vs strive
  ["spiritual_devotion", "innovation",         q(0.65) as Q], // sacred vs secular
  ["martial_virtue",     "hospitality",        q(0.55) as Q], // warrior vs peace-weaver
  ["kin_loyalty",        "hierarchy",          q(0.50) as Q], // family vs state
];

/**
 * Cycle assigned to each contradiction to resolve the tension.
 * Ordered to match TENSION_PAIRS.
 */
const RESOLUTION_CYCLES: CulturalCycle[] = [
  { type: "exchange_norm",       name: "Gift Exchange Ceremony",   description: "Formal gift rituals preserve social honour while enabling commerce — trade dressed as generosity." },
  { type: "conflict_resolution", name: "Trial by Tradition",       description: "New ideas must survive an ordeal judged by elders; innovation that earns approval gains legitimacy." },
  { type: "celebration",         name: "Harvest Gratitude Feast",  description: "Communities celebrate what was achieved and accept loss without shame, reconciling effort with fate." },
  { type: "taboo",               name: "Sacred Knowledge Seal",    description: "Certain fields of inquiry are quarantined as 'holy mystery', allowing other innovation to proceed freely." },
  { type: "lifecycle",           name: "Warrior's Hospitality",    description: "Feasting enemies before and after battle transforms potential atrocity into ritual; violence is bounded by courtesy." },
  { type: "status_marker",       name: "Adoption Ceremony",        description: "Political allies are formally adopted into the family, converting external obligation into kin loyalty." },
];

/** Cycles for dominant single values (no contradiction needed). */
const VALUE_CYCLES: [ValueId, CulturalCycle][] = [
  ["martial_virtue",     { type: "lifecycle",   name: "Warrior's Rite",      description: "Coming-of-age trials test martial ability; those who pass gain full social standing." }],
  ["spiritual_devotion", { type: "celebration", name: "Propitiation Festival",description: "Seasonal ceremonies appease the supernatural and reinforce communal bonds." }],
  ["kin_loyalty",        { type: "celebration", name: "Ancestor Feast",       description: "Regular remembrance of forebears reaffirms family lineage as the core social unit." }],
  ["commerce",           { type: "exchange_norm",name: "Market Day",          description: "Scheduled communal markets with enforced rules create safe space for strangers to trade." }],
  ["hierarchy",          { type: "status_marker",name: "Tribute Ceremony",    description: "Regular displays of wealth offered upward reinforce the legitimacy of the ruling rank." }],
  ["craft_mastery",      { type: "lifecycle",   name: "Masterwork Presentation",description: "Artisans publicly present their finest work to earn the title of master and social respect." }],
];

// ── Force derivation ──────────────────────────────────────────────────────────

function deriveEnvironmentForce(biome?: BiomeContext): Q {
  if (!biome) return q(0.50) as Q;
  // Vacuum/no-sound environment: most extreme
  if (biome.soundPropagation === 0) return q(0.85) as Q;
  // High-drag (underwater): physically demanding
  if (biome.dragMul !== undefined && biome.dragMul < q(0.50)) return q(0.75) as Q;
  // Some non-default biome is set: treat as unusual environment
  return q(0.60) as Q;
}

function derivePowerForce(polity: Polity, vassals: readonly VassalNode[]): Q {
  const base = TECH_POWER[polity.techEra] ?? (q(0.50) as Q);
  // Many vassals reinforce feudal hierarchy → raise power force slightly
  const vassalBonus = Math.min(vassals.length * q(0.01), q(0.15));
  return clampQ(base + vassalBonus, 0, SCALE.Q);
}

function deriveExchangeForce(polity: Polity): Q {
  if (polity.population <= 0) return q(0.30) as Q;
  const wealthPerCapita = polity.treasury_cu / polity.population;
  // 0 cu/person → q(0.20); 5 cu/person → q(0.70); normalised linearly
  const NORM = 5;
  return clampQ(
    q(0.20) + Math.round(Math.min(wealthPerCapita, NORM) * q(0.50) / NORM),
    0, SCALE.Q,
  );
}

function deriveLegacyForce(myths: readonly Myth[]): { legacy_Q: Q; positivity_Q: Q } {
  if (myths.length === 0) return { legacy_Q: q(0.10) as Q, positivity_Q: q(0.50) as Q };
  const sumBelief = myths.reduce((s, m) => s + m.belief_Q, 0);
  const avgBelief = Math.round(sumBelief / myths.length) as Q;
  const posCount  = myths.filter(m => m.archetype === "hero" || m.archetype === "golden_age").length;
  const positivity = Math.round(posCount * SCALE.Q / myths.length) as Q;
  return {
    legacy_Q:    clampQ(avgBelief, 0, SCALE.Q),
    positivity_Q: clampQ(positivity, 0, SCALE.Q),
  };
}

function deriveBeliefForce(myths: readonly Myth[]): Q {
  if (myths.length === 0) return q(0.30) as Q;
  const supernaturalCount = myths.filter(m =>
    m.archetype === "great_plague" ||
    m.archetype === "divine_wrath"
  ).length;
  // Each supernatural myth adds belief pressure
  return clampQ(
    q(0.30) + Math.round(supernaturalCount * q(0.15)),
    0, SCALE.Q,
  );
}

// ── Value derivation ──────────────────────────────────────────────────────────

function deriveValues(
  forces:       Record<CultureForce, Q>,
  positivity_Q: Q,
): CulturalValue[] {
  const { environment, power, exchange, legacy, belief } = forces;
  const antiEnv      = (SCALE.Q - environment)  as Q;
  const antiPower    = (SCALE.Q - power)         as Q;
  const antiExchange = (SCALE.Q - exchange)      as Q;
  const antiPositive = (SCALE.Q - positivity_Q)  as Q;

  const raw: [ValueId, number][] = [
    ["honour",             mulDiv(power,       q(0.50), SCALE.Q) + mulDiv(legacy, q(0.30), SCALE.Q)],
    ["martial_virtue",     mulDiv(environment, q(0.40), SCALE.Q) + mulDiv(power,  q(0.30), SCALE.Q)],
    ["commerce",           mulDiv(exchange,    q(0.60), SCALE.Q) + mulDiv(antiEnv, q(0.15), SCALE.Q)],
    ["fatalism",           mulDiv(environment, q(0.30), SCALE.Q) + mulDiv(antiPositive, q(0.40), SCALE.Q)],
    ["hospitality",        mulDiv(exchange,    q(0.30), SCALE.Q) + mulDiv(antiPower, q(0.25), SCALE.Q)],
    ["hierarchy",          mulDiv(power,       q(0.65), SCALE.Q)],
    ["spiritual_devotion", mulDiv(belief,      q(0.60), SCALE.Q) + mulDiv(environment, q(0.20), SCALE.Q)],
    ["innovation",         mulDiv(exchange,    q(0.25), SCALE.Q) + mulDiv(antiPower, q(0.20), SCALE.Q)],
    ["kin_loyalty",        mulDiv(antiExchange,q(0.30), SCALE.Q) + mulDiv(environment, q(0.20), SCALE.Q)],
    ["craft_mastery",      mulDiv(exchange,    q(0.20), SCALE.Q) + mulDiv(power, q(0.15), SCALE.Q)],
  ];

  return raw
    .map(([id, strength]) => ({ id, strength_Q: clampQ(strength, 0, SCALE.Q) }))
    .filter(v => v.strength_Q >= VALUE_THRESHOLD_Q)
    .sort((a, b) => b.strength_Q - a.strength_Q)
    .slice(0, MAX_VALUES);
}

// ── Contradiction detection ───────────────────────────────────────────────────

function deriveContradictions(values: CulturalValue[]): CulturalContradiction[] {
  const strengthMap = new Map<ValueId, Q>(values.map(v => [v.id, v.strength_Q]));
  const result: CulturalContradiction[] = [];

  for (const [a, b, baseTension] of TENSION_PAIRS) {
    const sa = strengthMap.get(a) ?? (q(0.0) as Q);
    const sb = strengthMap.get(b) ?? (q(0.0) as Q);
    if (sa < VALUE_THRESHOLD_Q || sb < VALUE_THRESHOLD_Q) continue;
    // Tension scales with the weaker of the two values and the base tension rate.
    const minStrength = Math.min(sa, sb) as Q;
    const tension = clampQ(mulDiv(minStrength, baseTension, SCALE.Q), 0, SCALE.Q);
    if (tension >= CONTRADICTION_THRESHOLD_Q) {
      result.push({ valueA: a, valueB: b, tension_Q: tension });
    }
  }

  return result
    .sort((a, b) => b.tension_Q - a.tension_Q)
    .slice(0, MAX_CONTRADICTIONS);
}

// ── CYCLES derivation ─────────────────────────────────────────────────────────

function deriveCycles(
  values:        CulturalValue[],
  contradictions: CulturalContradiction[],
): CulturalCycle[] {
  const cycles: CulturalCycle[] = [];
  const seen = new Set<string>();

  // First: one cycle per contradiction (tension-resolving practice)
  for (const c of contradictions) {
    const idx = TENSION_PAIRS.findIndex(([a, b]) => a === c.valueA && b === c.valueB);
    if (idx >= 0 && idx < RESOLUTION_CYCLES.length) {
      const cycle = RESOLUTION_CYCLES[idx] as CulturalCycle;
      if (!seen.has(cycle.name)) {
        cycles.push(cycle);
        seen.add(cycle.name);
      }
    }
  }

  // Then: dominant-value cycles to fill remaining slots
  const dominantIds = new Set(values.slice(0, 3).map(v => v.id));
  for (const [vid, cycle] of VALUE_CYCLES) {
    if (cycles.length >= MAX_CYCLES) break;
    if (dominantIds.has(vid) && !seen.has(cycle.name)) {
      cycles.push(cycle);
      seen.add(cycle.name);
    }
  }

  return cycles.slice(0, MAX_CYCLES);
}

// ── Drift tendency ────────────────────────────────────────────────────────────

function deriveDriftTendency(forces: Record<CultureForce, Q>): Q {
  // High exchange + high innovation → open; high power + high belief → conservative.
  const openness     = mulDiv(forces.exchange, q(0.40), SCALE.Q)
                     + mulDiv(SCALE.Q - forces.power,  q(0.30), SCALE.Q)
                     + mulDiv(SCALE.Q - forces.belief, q(0.20), SCALE.Q);
  return clampQ(openness, q(0.10), q(0.90));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a `CultureProfile` for a polity from its current simulation state.
 *
 * All five forces are derived automatically:
 * - `environment` from `biome` physics overrides
 * - `power` from `polity.techEra` + vassal count
 * - `exchange` from treasury per capita
 * - `legacy` + `belief` from myth registry
 *
 * @param polity    The polity to generate culture for.
 * @param _registry PolityRegistry (reserved for future neighbour-context use).
 * @param myths     Active myths that the polity's factions believe.
 * @param vassals   Current vassal roster (Phase 70; pass `[]` if not available).
 * @param biome     Optional BiomeContext affecting the environment force.
 */
export function generateCulture(
  polity:   Polity,
  _registry: PolityRegistry,
  myths:    readonly Myth[],
  vassals:  readonly VassalNode[] = [],
  biome?:   BiomeContext,
): CultureProfile {
  const envForce  = deriveEnvironmentForce(biome);
  const powForce  = derivePowerForce(polity, vassals);
  const exchForce = deriveExchangeForce(polity);
  const { legacy_Q, positivity_Q } = deriveLegacyForce(myths);
  const beliefForce = deriveBeliefForce(myths);

  const forces: Record<CultureForce, Q> = {
    environment: envForce,
    power:       powForce,
    exchange:    exchForce,
    legacy:      legacy_Q,
    belief:      beliefForce,
  };

  const values        = deriveValues(forces, positivity_Q);
  const contradictions = deriveContradictions(values);
  const cycles        = deriveCycles(values, contradictions);
  const driftTendency = deriveDriftTendency(forces);

  return {
    id:              `culture_${polity.id}`,
    polityId:        polity.id,
    forces,
    values,
    contradictions,
    cycles,
    driftTendency_Q: driftTendency,
  };
}

/**
 * Evolve a culture profile by one simulated year.
 *
 * Three pressures are applied:
 * 1. **Tech diffusion** (`techPressure_Q`): pulls exchange force upward when
 *    neighbouring polities have a higher tech era (Phase 67).  Pass q(0) if
 *    the polity is technologically isolated.
 * 2. **Military outcome** (`militaryOutcome_Q`): q(0) = crushing defeat,
 *    q(0.50) = neutral, q(1.0) = great victory.  Shifts martial_virtue in the
 *    dominant values and the power force.
 * 3. **New myths** (`myths`): re-derives the legacy and belief forces from the
 *    current myth state.
 *
 * If any contradiction exceeds the schism threshold, a `SchismEvent` is
 * returned alongside the updated profile.  The schism reduces the tension of
 * the triggering contradiction by damping both values slightly.
 *
 * @param profile           Current culture profile.
 * @param techPressure_Q    Exchange-force pull from tech-advanced neighbours.
 * @param militaryOutcome_Q Season military result [0, SCALE.Q].
 * @param myths             Current myth registry entries.
 * @param worldSeed
 * @param tick              Current campaign tick (used for schism roll).
 */
export function stepCultureYear(
  profile:           CultureProfile,
  techPressure_Q:    Q,
  militaryOutcome_Q: Q,
  myths:             readonly Myth[],
  worldSeed:         number,
  tick:              number,
): CultureYearResult {
  const polityHash  = hashString(profile.polityId);

  // ── 1. Drift forces ────────────────────────────────────────────────────────
  const { legacy_Q, positivity_Q } = deriveLegacyForce(myths);
  const beliefForce  = deriveBeliefForce(myths);

  // Exchange: tech-diffusion pulls upward; drift tendency amplifies openness
  const exchDrift    = mulDiv(techPressure_Q, profile.driftTendency_Q, SCALE.Q);
  const newExchange  = clampQ(profile.forces.exchange + Math.max(0, exchDrift), 0, SCALE.Q);

  // Power: military victory reinforces authority; defeat weakens it
  const militaryDelta = mulDiv(militaryOutcome_Q - q(0.50), DRIFT_STEP_Q * 2, SCALE.Q);
  const newPower      = clampQ(profile.forces.power + militaryDelta, 0, SCALE.Q);

  const newForces: Record<CultureForce, Q> = {
    environment: profile.forces.environment,          // geography doesn't change year-to-year
    power:       newPower,
    exchange:    newExchange,
    legacy:      legacy_Q,
    belief:      beliefForce,
  };

  // ── 2. Re-derive values and contradictions ─────────────────────────────────
  let newValues       = deriveValues(newForces, positivity_Q);
  let newContradictions = deriveContradictions(newValues);
  const newCycles     = deriveCycles(newValues, newContradictions);
  const newDrift      = deriveDriftTendency(newForces);

  // ── 3. Check for schism ────────────────────────────────────────────────────
  let schism: SchismEvent | undefined;

  const topContradiction = newContradictions[0];
  if (topContradiction !== undefined) {
    const tensionHash = hashString(topContradiction.valueA + topContradiction.valueB);
    const seed = eventSeed(worldSeed, tick, polityHash, tensionHash, SCHISM_SALT);
    const roll = seed % (SCALE.Q + 1);

    // Schism probability = tension × (1 - driftTendency) [conservative cultures crack harder]
    const probability = mulDiv(
      topContradiction.tension_Q,
      SCALE.Q - profile.driftTendency_Q,
      SCALE.Q,
    );

    if (roll < probability) {
      const severity = clampQ(mulDiv(topContradiction.tension_Q, SCALE.Q - profile.driftTendency_Q, SCALE.Q), 0, SCALE.Q);
      const schismType: SchismType =
        topContradiction.tension_Q >= q(0.75) ? "civil_unrest" :
        topContradiction.tension_Q >= q(0.55) ? "heresy" :
        "reform_movement";

      schism = {
        polityId:                profile.polityId,
        triggeringContradiction: topContradiction,
        type:                    schismType,
        severity_Q:              severity,
      };

      // Schism partially resolves the tension: damp both values slightly
      const dampFactor = q(0.90) as Q;
      newValues = newValues.map(v =>
        v.id === topContradiction.valueA || v.id === topContradiction.valueB
          ? { ...v, strength_Q: mulDiv(v.strength_Q, dampFactor, SCALE.Q) as Q }
          : v,
      );
      newContradictions = deriveContradictions(newValues);
    }
  }

  const updatedProfile: CultureProfile = {
    ...profile,
    forces:          newForces,
    values:          newValues,
    contradictions:  newContradictions,
    cycles:          newCycles,
    driftTendency_Q: newDrift,
  };

  return { profile: updatedProfile, ...(schism ? { schism } : {}) };
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Return the strength of a named value in the culture, or q(0) if absent.
 */
export function getCulturalValue(profile: CultureProfile, id: ValueId): Q {
  return profile.values.find(v => v.id === id)?.strength_Q ?? (q(0.0) as Q);
}

/**
 * Return the top N values by strength (default 3).
 */
export function getDominantValues(profile: CultureProfile, n = 3): CulturalValue[] {
  return profile.values.slice(0, n);
}

/**
 * Return only contradictions above CONTRADICTION_THRESHOLD_Q,
 * sorted by tension descending.
 */
export function getSignificantContradictions(profile: CultureProfile): CulturalContradiction[] {
  return profile.contradictions.filter(c => c.tension_Q >= CONTRADICTION_THRESHOLD_Q);
}

// ── Human-readable description ────────────────────────────────────────────────

const VALUE_PROSE: Record<ValueId, string> = {
  honour:             "Social reputation and oath-keeping are central; broken promises carry severe consequences.",
  martial_virtue:     "Courage and prowess in battle are prized above most other qualities.",
  commerce:           "Trade and wealth accumulation are respected pursuits; markets thrive.",
  fatalism:           "Hardship is accepted with stoicism; fate is not resisted but endured.",
  hospitality:        "Generosity to strangers is a moral obligation and source of social prestige.",
  hierarchy:          "Rank and authority are respected; social order is seen as natural and necessary.",
  spiritual_devotion: "Supernatural forces are central to daily life; ritual and propitiation are constant.",
  innovation:         "New ideas and methods are embraced; tradition is weighed against pragmatism.",
  kin_loyalty:        "Family obligations supersede external duties; lineage is the core identity.",
  craft_mastery:      "Skilled artisans are highly respected; excellence in craft carries social status.",
};

const CONTRADICTION_PROSE: Record<string, string> = {
  "honour+commerce":           "Tension between maintaining dignity and striking profitable deals; bargaining can feel like a loss of face.",
  "hierarchy+innovation":      "Authority structures resist change; new ideas must be framed as tradition to gain acceptance.",
  "fatalism+commerce":         "The belief that outcomes are preordained clashes with the drive to accumulate and improve; some see striving as futile.",
  "spiritual_devotion+innovation": "New discoveries threaten sacred explanations; the boundary between sacred knowledge and secular inquiry is contested.",
  "martial_virtue+hospitality":"Warrior culture and the duty to welcome strangers create awkward social choreography around guests who may become enemies.",
  "kin_loyalty+hierarchy":     "Obligation to family can conflict with loyalty to lord or state; both claim the same person's ultimate allegiance.",
};

/**
 * Render a `CultureProfile` as human-readable prose and bullet lists.
 *
 * Suitable for game designers, writers, and procedural quest/dialogue generation.
 */
export function describeCulture(profile: CultureProfile): CultureDescription {
  const dominant = getDominantValues(profile, 3);
  const topTwo   = dominant.slice(0, 2).map(v => v.id.replace(/_/g, " "));

  // Build one-paragraph summary
  const opening = topTwo.length >= 2
    ? `This culture places strong emphasis on ${topTwo[0]} and ${topTwo[1]}.`
    : topTwo.length === 1
    ? `This culture places strong emphasis on ${topTwo[0]}.`
    : "This culture has no dominant values yet established.";

  const envNote   = profile.forces.environment >= q(0.70)
    ? " Shaped by harsh conditions, survival demands constant collective effort."
    : "";
  const exchNote  = profile.forces.exchange >= q(0.65)
    ? " Trade and exchange are woven into everyday social life."
    : profile.forces.exchange <= q(0.30)
    ? " Material exchange is subordinate to gift-giving and reciprocal obligation."
    : "";
  const beliefNote = profile.forces.belief >= q(0.60)
    ? " The supernatural is not distant — it is present in every significant decision."
    : "";
  const topContra    = profile.contradictions[0];
  const contradNote  = topContra !== undefined
    ? ` The culture harbours a live internal tension between ${topContra.valueA.replace(/_/g, " ")} and ${topContra.valueB.replace(/_/g, " ")}.`
    : "";

  const summary = opening + envNote + exchNote + beliefNote + contradNote;

  // Value bullet list
  const values = dominant.map(v => `${v.id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}: ${VALUE_PROSE[v.id]}`);

  // Contradiction descriptions
  const contradictions = getSignificantContradictions(profile).map(c => {
    const key   = `${c.valueA}+${c.valueB}`;
    const prose = CONTRADICTION_PROSE[key] ?? `Tension between ${c.valueA.replace(/_/g, " ")} and ${c.valueB.replace(/_/g, " ")}.`;
    return prose;
  });

  // Cycle descriptions
  const cycles = profile.cycles.map(c => `${c.name} (${c.type.replace(/_/g, " ")}): ${c.description}`);

  return { summary, values, contradictions, cycles };
}
