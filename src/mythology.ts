// src/mythology.ts — Phase 66: Generative Mythology
//
// Applies narrative compression to a Legend/Chronicle log, crystallising
// recurring patterns into in-world myths held by factions.
//
// The compression pass scans for five archetypal patterns:
//   hero          — heroic legend(s) of a named individual
//   monster       — notorious legend(s) with high menace
//   great_plague  — cluster of entity_death / tragic events in a short window
//   divine_wrath  — settlement_destroyed coinciding with mass deaths
//   golden_age    — run of masterwork_crafted / settlement_founded with no conflict
//   trickster     — relationship_betrayal + quest_failed pattern
//
// Each myth carries cultural effects (MythEffect) that modifiers faction
// behaviour: fear threshold, diplomacy probability, battle morale, and
// technological ambition.  Effects are applied by the host each polity-day.
//
// Phase hooks:
//   Phase 50 (Legend): Legend, LegendRegistry — source material for hero/monster
//   Phase 56 (Disease): entity_death cluster triggers great_plague myth
//   Phase 60 (Hazard): settlement_destroyed triggers divine_wrath
//   Phase 24 (Faction): believingFactionIds gates who is influenced
//   Phase 47 (Personality): legend tags map to myth personality impact

import { q, clampQ, qMul, SCALE, type Q } from "./units.js";
import type { LegendRegistry }     from "./legend.js";
import type { ChronicleEntry, ChronicleEventType } from "./chronicle.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Six narrative archetypes produced by the compression pass. */
export type MythArchetype =
  | "hero"
  | "monster"
  | "great_plague"
  | "divine_wrath"
  | "golden_age"
  | "trickster";

/**
 * Cultural effects a myth applies to every member of a believing faction.
 * All fields are signed Q deltas; 0 = no effect.
 */
export interface MythEffect {
  /**
   * Additive fear-threshold modifier for faction members in combat.
   * Positive = braver (higher threshold before fleeing).
   * Range advisory: ±q(0.10).
   */
  fearThresholdMod_Q: Q;
  /**
   * Additive modifier to diplomacy success probability vs. outsiders.
   * Positive = more trusted; negative = feared/distrusted.
   */
  diplomacyMod_Q: Q;
  /**
   * Morale bonus when a faction member fights on behalf of the myth.
   * (e.g., "fighting for the legacy of the hero").
   */
  moraleBonus_Q: Q;
  /**
   * Technology research speed modifier for believing factions.
   * Positive = golden-age ambition; negative = fatalistic stagnation.
   */
  techMod_Q: Q;
}

/** An in-world myth held by one or more factions. */
export interface Myth {
  id:         string;
  archetype:  MythArchetype;
  /** Display name, e.g. "The Hero of the Eastern March". */
  name:       string;
  /** One-sentence description of the myth's content. */
  description: string;
  /** Legend IDs and chronicle entry IDs that seeded this myth. */
  sourceIds:  string[];
  /** Faction IDs that currently hold this belief. */
  believingFactionIds: string[];
  /** Simulated days since the myth crystallised. */
  ageInDays:  number;
  /** How widely and deeply the myth is believed [0, SCALE.Q]. */
  belief_Q:   Q;
  /** Cultural modifiers for believing factions. */
  effects:    MythEffect;
}

/** Collection of all myths in a world. */
export interface MythRegistry {
  myths: Map<string, Myth>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum number of related entries/legends required to trigger a myth. */
export const MYTH_MIN_ENTRIES = 3;

/** Maximum tick window (days) within which a death cluster counts as a "plague". */
export const PLAGUE_WINDOW_DAYS = 30;

/** Minimum death count in window to trigger great_plague myth. */
export const PLAGUE_MIN_DEATHS = 3;

/** Min run of constructive events to trigger golden_age myth. */
export const GOLDEN_AGE_MIN_EVENTS = 5;

/** Annual belief decay (fraction of belief_Q lost per simulated year). */
export const BELIEF_DECAY_PER_YEAR_Q: Q = q(0.12) as Q;

/** Belief floor — myths never fall below this once formed. */
export const BELIEF_FLOOR_Q: Q = q(0.10) as Q;

// ── Effect profiles per archetype ─────────────────────────────────────────────

const EFFECTS: Record<MythArchetype, MythEffect> = {
  hero: {
    fearThresholdMod_Q: q(0.08)  as Q,  // believers are braver
    diplomacyMod_Q:     q(0.05)  as Q,  // hero's fame aids negotiation
    moraleBonus_Q:      q(0.10)  as Q,  // fighting in the hero's name
    techMod_Q:          q(0)     as Q,
  },
  monster: {
    fearThresholdMod_Q: q(-0.10) as Q,  // monster story makes foes scarier
    diplomacyMod_Q:     q(-0.05) as Q,  // fear of outsiders
    moraleBonus_Q:      q(0.05)  as Q,  // "slaying the monster" narrative
    techMod_Q:          q(0)     as Q,
  },
  great_plague: {
    fearThresholdMod_Q: q(-0.05) as Q,
    diplomacyMod_Q:     q(-0.08) as Q,  // blame outsiders for plague
    moraleBonus_Q:      q(0)     as Q,
    techMod_Q:          q(-0.05) as Q,  // fatalistic stagnation
  },
  divine_wrath: {
    fearThresholdMod_Q: q(-0.08) as Q,
    diplomacyMod_Q:     q(0.03)  as Q,  // appeasing gods through ritual
    moraleBonus_Q:      q(-0.05) as Q,
    techMod_Q:          q(-0.03) as Q,
  },
  golden_age: {
    fearThresholdMod_Q: q(0.04)  as Q,
    diplomacyMod_Q:     q(0.08)  as Q,  // pride of civilisation
    moraleBonus_Q:      q(0.06)  as Q,
    techMod_Q:          q(0.10)  as Q,  // ambition to recapture greatness
  },
  trickster: {
    fearThresholdMod_Q: q(0.03)  as Q,  // wariness, not fear
    diplomacyMod_Q:     q(-0.06) as Q,  // distrust of deals
    moraleBonus_Q:      q(0)     as Q,
    techMod_Q:          q(0.03)  as Q,  // cunning seen as virtue
  },
};

// ── Registry helpers ──────────────────────────────────────────────────────────

export function createMythRegistry(): MythRegistry {
  return { myths: new Map() };
}

export function registerMyth(registry: MythRegistry, myth: Myth): void {
  registry.myths.set(myth.id, myth);
}

export function getMythsByFaction(registry: MythRegistry, factionId: string): Myth[] {
  const result: Myth[] = [];
  for (const myth of registry.myths.values()) {
    if (myth.believingFactionIds.includes(factionId)) result.push(myth);
  }
  return result;
}

// ── Myth construction helpers ─────────────────────────────────────────────────

let _nextId = 1;
function nextMythId(): string { return `myth_${_nextId++}`; }

function mkMyth(
  archetype:           MythArchetype,
  name:                string,
  description:         string,
  sourceIds:           string[],
  believingFactionIds: string[],
  belief_Q:            Q = q(0.80) as Q,
): Myth {
  return {
    id:  nextMythId(),
    archetype,
    name,
    description,
    sourceIds,
    believingFactionIds,
    ageInDays: 0,
    belief_Q,
    effects: EFFECTS[archetype],
  };
}

// ── Pattern detectors ─────────────────────────────────────────────────────────

/**
 * Derive hero myths from `heroic` legends in the LegendRegistry.
 * One hero myth per heroic legend with fame > q(0.30).
 */
function detectHeroMyths(
  legendRegistry:      LegendRegistry,
  believingFactionIds: string[],
): Myth[] {
  const myths: Myth[] = [];
  for (const legend of legendRegistry.legends.values()) {
    if (legend.reputation !== "heroic" && legend.reputation !== "legendary") continue;
    if (legend.fame_Q < q(0.30)) continue;
    myths.push(mkMyth(
      "hero",
      `The ${legend.reputation === "legendary" ? "Legend" : "Hero"} of ${legend.subjectName}`,
      `Tales of ${legend.subjectName}'s deeds pass from mouth to mouth, shaping the values of the people.`,
      [legend.legendId],
      believingFactionIds,
      clampQ(legend.fame_Q, q(0.30), SCALE.Q) as Q,
    ));
  }
  return myths;
}

/**
 * Derive monster myths from `notorious` legends.
 */
function detectMonsterMyths(
  legendRegistry:      LegendRegistry,
  believingFactionIds: string[],
): Myth[] {
  const myths: Myth[] = [];
  for (const legend of legendRegistry.legends.values()) {
    if (legend.reputation !== "notorious") continue;
    if (legend.fame_Q < q(0.20)) continue;
    myths.push(mkMyth(
      "monster",
      `The Shadow of ${legend.subjectName}`,
      `Fear of what ${legend.subjectName} wrought lingers in the communal memory.`,
      [legend.legendId],
      believingFactionIds,
      clampQ(legend.fame_Q, q(0.20), SCALE.Q) as Q,
    ));
  }
  return myths;
}

/**
 * Detect great_plague myth: PLAGUE_MIN_DEATHS entity_death / tragic entries
 * within PLAGUE_WINDOW_DAYS of each other.
 *
 * Tick parameter is "ticks per day" so windows can be compared.
 */
function detectPlagueMyth(
  entries:             ReadonlyArray<ChronicleEntry>,
  believingFactionIds: string[],
  ticksPerDay:         number,
): Myth | null {
  const deathTypes = new Set<ChronicleEventType>(["entity_death", "tragic_event"]);
  const deaths = entries.filter(e => deathTypes.has(e.eventType))
                        .sort((a, b) => a.tick - b.tick);
  if (deaths.length < PLAGUE_MIN_DEATHS) return null;

  const windowTicks = PLAGUE_WINDOW_DAYS * ticksPerDay;
  let maxCluster = 0;
  let clusterEntries: ChronicleEntry[] = [];

  for (let i = 0; i < deaths.length; i++) {
    const window = deaths.filter(
      e => e.tick >= deaths[i]!.tick && e.tick <= deaths[i]!.tick + windowTicks,
    );
    if (window.length > maxCluster) { maxCluster = window.length; clusterEntries = window; }
  }

  if (maxCluster < PLAGUE_MIN_DEATHS) return null;

  return mkMyth(
    "great_plague",
    "The Great Pestilence",
    `A time when death walked among the people, and no healer could stem the tide.`,
    clusterEntries.map(e => e.entryId),
    believingFactionIds,
    clampQ(Math.round(maxCluster * SCALE.Q / 10), q(0.40), SCALE.Q) as Q,
  );
}

/**
 * Detect divine_wrath myth: settlement_destroyed entry + death cluster within
 * the same tick window.
 */
function detectDivineWrathMyth(
  entries:             ReadonlyArray<ChronicleEntry>,
  believingFactionIds: string[],
  ticksPerDay:         number,
): Myth | null {
  const destructions = entries.filter(e => e.eventType === "settlement_destroyed");
  if (destructions.length === 0) return null;

  const windowTicks = 14 * ticksPerDay;  // 14-day window around destruction
  for (const destruction of destructions) {
    const nearby = entries.filter(
      e => e.eventType === "entity_death" &&
           Math.abs(e.tick - destruction.tick) <= windowTicks,
    );
    if (nearby.length >= 2) {
      return mkMyth(
        "divine_wrath",
        "The Wrath That Fell",
        `When the settlement crumbled and the dead lay unburied, the people spoke of divine judgement.`,
        [destruction.entryId, ...nearby.map(e => e.entryId)],
        believingFactionIds,
      );
    }
  }
  return null;
}

/**
 * Detect golden_age myth: GOLDEN_AGE_MIN_EVENTS consecutive constructive events
 * (masterwork_crafted, settlement_founded, settlement_upgraded, facility_completed)
 * without any combat_defeat or settlement_raided in the same window.
 */
function detectGoldenAgeMyth(
  entries:             ReadonlyArray<ChronicleEntry>,
  believingFactionIds: string[],
): Myth | null {
  const positiveTypes = new Set<ChronicleEventType>([
    "masterwork_crafted", "settlement_founded", "settlement_upgraded", "facility_completed",
  ]);
  const negativeTypes = new Set<ChronicleEventType>([
    "combat_defeat", "settlement_raided", "settlement_destroyed",
  ]);

  const sorted = [...entries].sort((a, b) => a.tick - b.tick);
  let streak: ChronicleEntry[] = [];

  for (const entry of sorted) {
    if (negativeTypes.has(entry.eventType)) {
      streak = [];
    } else if (positiveTypes.has(entry.eventType)) {
      streak.push(entry);
      if (streak.length >= GOLDEN_AGE_MIN_EVENTS) {
        return mkMyth(
          "golden_age",
          "The Golden Age of Craft",
          `A remembered era of flourishing — settlements rose, masters plied their arts, and the land prospered.`,
          streak.map(e => e.entryId),
          believingFactionIds,
        );
      }
    }
  }
  return null;
}

/**
 * Detect trickster myth: at least one relationship_betrayal + one quest_failed
 * anywhere in the chronicle.
 */
function detectTricksterMyth(
  entries:             ReadonlyArray<ChronicleEntry>,
  believingFactionIds: string[],
): Myth | null {
  const betrayals = entries.filter(e => e.eventType === "relationship_betrayal");
  const failures  = entries.filter(e => e.eventType === "quest_failed");
  if (betrayals.length === 0 || failures.length === 0) return null;

  const sourceIds = [
    ...betrayals.slice(0, 2).map(e => e.entryId),
    ...failures.slice(0, 2).map(e => e.entryId),
  ];
  return mkMyth(
    "trickster",
    "The Deceiver of Pacts",
    `Stories of broken oaths and failed ventures teach that trust must be earned, never assumed.`,
    sourceIds,
    believingFactionIds,
    q(0.60) as Q,
  );
}

// ── Main compression pass ─────────────────────────────────────────────────────

/**
 * Run the narrative compression pass over a LegendRegistry and chronicle entry
 * list, returning any myths that emerge.
 *
 * @param legendRegistry     Phase 50 legend registry.
 * @param entries            Flat list of chronicle entries (all scopes combined).
 * @param believingFactionIds Faction IDs that will adopt the resulting myths.
 * @param ticksPerDay        How many simulation ticks equal one simulated day
 *                           (used for time-window calculations).  Default: 20.
 */
export function compressMythsFromHistory(
  legendRegistry:      LegendRegistry,
  entries:             ReadonlyArray<ChronicleEntry>,
  believingFactionIds: string[],
  ticksPerDay          = 20,
): Myth[] {
  const myths: Myth[] = [];

  myths.push(...detectHeroMyths(legendRegistry, believingFactionIds));
  myths.push(...detectMonsterMyths(legendRegistry, believingFactionIds));

  const plague = detectPlagueMyth(entries, believingFactionIds, ticksPerDay);
  if (plague) myths.push(plague);

  const wrath = detectDivineWrathMyth(entries, believingFactionIds, ticksPerDay);
  if (wrath) myths.push(wrath);

  const golden = detectGoldenAgeMyth(entries, believingFactionIds);
  if (golden) myths.push(golden);

  const trickster = detectTricksterMyth(entries, believingFactionIds);
  if (trickster) myths.push(trickster);

  return myths;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Age all myths by one simulated year and decay belief.
 * Myths below BELIEF_FLOOR_Q are NOT removed — they linger as faded folklore.
 * Returns the updated registry (mutates in place).
 */
export function stepMythologyYear(registry: MythRegistry): void {
  for (const myth of registry.myths.values()) {
    myth.ageInDays += 365;
    const decayed = qMul(myth.belief_Q, SCALE.Q - BELIEF_DECAY_PER_YEAR_Q as Q);
    myth.belief_Q = clampQ(decayed, BELIEF_FLOOR_Q, SCALE.Q) as Q;
  }
}

/**
 * Scale a MythEffect by the current belief_Q of the myth.
 * A barely-believed myth (belief_Q = q(0.10)) contributes only 10% of its
 * face-value effect.
 */
export function scaledMythEffect(myth: Myth): MythEffect {
  const scale = myth.belief_Q;
  const s = (v: Q) => Math.round(v * scale / SCALE.Q) as Q;
  return {
    fearThresholdMod_Q: s(myth.effects.fearThresholdMod_Q),
    diplomacyMod_Q:     s(myth.effects.diplomacyMod_Q),
    moraleBonus_Q:      s(myth.effects.moraleBonus_Q),
    techMod_Q:          s(myth.effects.techMod_Q),
  };
}

/**
 * Aggregate the net cultural effect on a faction from all its myths.
 * Each myth's effect is scaled by its current belief_Q.
 *
 * The host applies these deltas to polity morale, faction diplomacy weights,
 * and tech-advance probability each polity-day.
 */
export function aggregateFactionMythEffect(
  registry:  MythRegistry,
  factionId: string,
): MythEffect {
  let fearMod  = 0;
  let diploMod = 0;
  let morale   = 0;
  let tech     = 0;

  for (const myth of registry.myths.values()) {
    if (!myth.believingFactionIds.includes(factionId)) continue;
    const eff = scaledMythEffect(myth);
    fearMod  += eff.fearThresholdMod_Q;
    diploMod += eff.diplomacyMod_Q;
    morale   += eff.moraleBonus_Q;
    tech     += eff.techMod_Q;
  }

  return {
    fearThresholdMod_Q: clampQ(fearMod,  -SCALE.Q, SCALE.Q) as Q,
    diplomacyMod_Q:     clampQ(diploMod, -SCALE.Q, SCALE.Q) as Q,
    moraleBonus_Q:      clampQ(morale,   0,         SCALE.Q) as Q,
    techMod_Q:          clampQ(tech,     -SCALE.Q, SCALE.Q) as Q,
  };
}
