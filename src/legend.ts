// src/legend.ts — Phase 50: Mythology & Legend
//
// Chronicle entries of sufficient significance crystallise into Legends —
// persistent reputation objects that NPCs query when deciding how to treat
// an entity.  Legends affect dialogue (persuasion / intimidation probability),
// NPC fear, and ally morale.
//
// Data flow:
//   Chronicle (Phase 45) → createLegendFromChronicle → Legend
//   Legend + NPC → npcKnowsLegend (fame roll) → LegendEffect modifiers
//   LegendEffect → applyLegendToDialogueContext → bonus Q values for dialogue.ts

import type { Q } from "./units.js";
import { SCALE, q, clampQ, mulDiv } from "./units.js";
import { eventSeed } from "./sim/seeds.js";
import type { Chronicle, ChronicleEntry, StoryArcType } from "./chronicle.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** How an entity is perceived in living memory. */
export type LegendReputation =
  | "legendary"   // supremely famous — both feared and revered
  | "heroic"      // celebrated for positive deeds
  | "notorious"   // feared or reviled for dark deeds
  | "forgotten";  // fame has faded below meaningful threshold

/** A legend crystallised from chronicle entries. */
export interface Legend {
  legendId: string;
  /** Entity the legend is about. */
  subjectId: number;
  /** Display name frozen at legend creation. */
  subjectName: string;
  reputation: LegendReputation;
  /**
   * How widely known this legend is (0..1).
   * q(1.0) = universally known; q(0.10) = forgotten by most.
   * Decays over time via stepLegendFame.
   */
  fame_Q: Q;
  /**
   * Thematic tags derived from source events/arcs.
   * Examples: "warrior", "craftsman", "hero", "villain", "legendary_deed".
   */
  tags: string[];
  /** Chronicle entry IDs that built this legend. */
  sourceEntryIds: string[];
  /** Story arc types present in source chronicle. */
  sourceArcTypes: StoryArcType[];
  /** Tick when this legend was created. */
  createdAtTick: number;
  /** Optional lore text for display. */
  lore?: string | undefined;
}

/** Modifiers that a legend applies to NPC interactions. */
export interface LegendEffect {
  /** Bonus to persuasion probability (heroic / legendary). */
  persuasionBonus_Q: Q;
  /** Bonus to intimidation probability (notorious / legendary). */
  intimidationBonus_Q: Q;
  /** Fear delta applied to NPCs who know a notorious / legendary figure. */
  fearBonus_Q: Q;
  /** Ally morale bonus from fighting alongside / for a legend (heroic / legendary). */
  moraleBonus_Q: Q;
}

/** Registry of all legends in a world. */
export interface LegendRegistry {
  legends: Map<string, Legend>;
  /** Index: subjectId → Set of legendIds */
  bySubject: Map<number, Set<string>>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum significance score for a chronicle entry to contribute to a legend. */
export const LEGEND_MIN_SIGNIFICANCE = 60;

/** Denominator for fame_Q computation: 7 entries at max significance → q(1.0). */
const FAME_SIGNIFICANCE_DIVISOR = 700;

/** Fame floor for "legendary" reputation — never decays below this. */
const LEGENDARY_FAME_FLOOR: Q = q(0.50) as Q;

/** Fame below this threshold → reputation becomes "forgotten". */
const FORGOTTEN_FAME_THRESHOLD: Q = q(0.10) as Q;

/** Fame decay per 1000 ticks (slow, long-term erosion). */
const FAME_DECAY_PER_1000_TICKS = 5;

// ── Tag derivation ────────────────────────────────────────────────────────────

const EVENT_TAGS: Partial<Record<string, string>> = {
  legendary_deed:       "legendary_deed",
  combat_victory:       "warrior",
  masterwork_crafted:   "craftsman",
  settlement_founded:   "builder",
  settlement_upgraded:  "builder",
  first_contact:        "explorer",
  quest_completed:      "quester",
  entity_death:         "slayer",
  rank_promotion:       "officer",
};

const ARC_TAGS: Partial<Record<StoryArcType, string>> = {
  rise_of_hero:             "hero",
  tragic_fall:              "fallen_hero",
  rivalry:                  "rival",
  legendary_craftsman:      "master_craftsman",
  notorious_villain:        "villain",
  unlikely_friendship:      "friend",
  betrayal_and_redemption:  "redeemed",
};

/** Derive thematic tags from chronicle entries and arc types. */
function deriveTagsFromEntries(
  entries:   ChronicleEntry[],
  arcTypes:  StoryArcType[],
): string[] {
  const seen = new Set<string>();

  for (const e of entries) {
    const tag = EVENT_TAGS[e.eventType];
    if (tag) seen.add(tag);
  }

  for (const arc of arcTypes) {
    const tag = ARC_TAGS[arc];
    if (tag) seen.add(tag);
  }

  return Array.from(seen);
}

// ── Reputation classification ──────────────────────────────────────────────────

/** Classify reputation from entries, arcs, and computed fame. */
function classifyReputation(
  entries:  ChronicleEntry[],
  arcTypes: StoryArcType[],
  fame_Q:   Q,
): LegendReputation {
  if (fame_Q < FORGOTTEN_FAME_THRESHOLD) return "forgotten";

  const positiveArcs: StoryArcType[] = [
    "rise_of_hero", "settlement_growth", "legendary_craftsman", "unlikely_friendship",
    "betrayal_and_redemption",
  ];
  const negativeArcs: StoryArcType[] = ["notorious_villain", "tragic_fall"];

  const hasPositiveArc  = arcTypes.some(a => positiveArcs.includes(a));
  const hasNegativeArc  = arcTypes.some(a => negativeArcs.includes(a));
  const hasLegendaryDeed = entries.some(e => e.eventType === "legendary_deed");

  // Legendary = both positive and negative arcs, or legendary deed + high fame
  if ((hasPositiveArc && hasNegativeArc) || (hasLegendaryDeed && fame_Q >= q(0.60))) {
    return "legendary";
  }
  if (hasNegativeArc) return "notorious";
  return "heroic";
}

// ── Fame computation ──────────────────────────────────────────────────────────

/** Compute fame_Q from total significance of qualifying entries. */
function computeFameQ(entries: ChronicleEntry[], minSignificance: number): Q {
  const total = entries
    .filter(e => e.significance >= minSignificance)
    .reduce((sum, e) => sum + e.significance, 0);

  return clampQ(
    Math.trunc(total * SCALE.Q / FAME_SIGNIFICANCE_DIVISOR) as Q,
    q(0),
    SCALE.Q as Q,
  );
}

// ── Legend creation ───────────────────────────────────────────────────────────

/**
 * Promote chronicle entries above `minSignificance` into a Legend.
 *
 * Returns `undefined` if no qualifying entries exist.
 * Considers only entries where `subjectId` appears in the actors array.
 */
export function createLegendFromChronicle(
  chronicle:      Chronicle,
  subjectId:      number,
  subjectName:    string,
  minSignificance: number = LEGEND_MIN_SIGNIFICANCE,
): Legend | undefined {
  const qualifyingEntries = chronicle.entries.filter(
    e => e.significance >= minSignificance && e.actors.includes(subjectId),
  );

  if (qualifyingEntries.length === 0) return undefined;

  const fame_Q  = computeFameQ(qualifyingEntries, minSignificance);
  const arcTypes: StoryArcType[] = chronicle.detectedArcs.flatMap(
    arc => arc.primaryActors.includes(subjectId) ? [arc.arcType] : [],
  );
  const tags       = deriveTagsFromEntries(qualifyingEntries, arcTypes);
  const reputation = classifyReputation(qualifyingEntries, arcTypes, fame_Q);

  const createdAtTick = qualifyingEntries[qualifyingEntries.length - 1]!.tick;
  const legendId = `legend_${subjectId}_${createdAtTick}`;

  return {
    legendId,
    subjectId,
    subjectName,
    reputation,
    fame_Q,
    tags,
    sourceEntryIds: qualifyingEntries.map(e => e.entryId),
    sourceArcTypes: arcTypes,
    createdAtTick,
  };
}

// ── Registry ──────────────────────────────────────────────────────────────────

/** Create a new empty legend registry. */
export function createLegendRegistry(): LegendRegistry {
  return { legends: new Map(), bySubject: new Map() };
}

/** Register a legend in the registry. Overwrites any existing legend with the same ID. */
export function registerLegend(registry: LegendRegistry, legend: Legend): void {
  registry.legends.set(legend.legendId, legend);

  let ids = registry.bySubject.get(legend.subjectId);
  if (!ids) {
    ids = new Set();
    registry.bySubject.set(legend.subjectId, ids);
  }
  ids.add(legend.legendId);
}

/** Get all legends about a specific entity. */
export function getLegendsBySubject(registry: LegendRegistry, subjectId: number): Legend[] {
  const ids = registry.bySubject.get(subjectId);
  if (!ids) return [];
  return Array.from(ids)
    .map(id => registry.legends.get(id))
    .filter((l): l is Legend => l !== undefined);
}

// ── Effects ───────────────────────────────────────────────────────────────────

/** Derive NPC-behavior modifiers from a legend. */
export function getLegendEffect(legend: Legend): LegendEffect {
  const f = legend.fame_Q;

  switch (legend.reputation) {
    case "heroic":
      return {
        persuasionBonus_Q:    mulDiv(f, q(0.20), SCALE.Q) as Q,
        intimidationBonus_Q:  q(0) as Q,
        fearBonus_Q:          q(0) as Q,
        moraleBonus_Q:        mulDiv(f, q(0.10), SCALE.Q) as Q,
      };
    case "notorious":
      return {
        persuasionBonus_Q:    q(0) as Q,
        intimidationBonus_Q:  mulDiv(f, q(0.25), SCALE.Q) as Q,
        fearBonus_Q:          mulDiv(f, q(0.15), SCALE.Q) as Q,
        moraleBonus_Q:        q(0) as Q,
      };
    case "legendary":
      return {
        persuasionBonus_Q:    mulDiv(f, q(0.25), SCALE.Q) as Q,
        intimidationBonus_Q:  mulDiv(f, q(0.20), SCALE.Q) as Q,
        fearBonus_Q:          mulDiv(f, q(0.10), SCALE.Q) as Q,
        moraleBonus_Q:        mulDiv(f, q(0.15), SCALE.Q) as Q,
      };
    case "forgotten":
    default:
      return {
        persuasionBonus_Q:    q(0) as Q,
        intimidationBonus_Q:  q(0) as Q,
        fearBonus_Q:          q(0) as Q,
        moraleBonus_Q:        q(0) as Q,
      };
  }
}

// ── NPC awareness ─────────────────────────────────────────────────────────────

/**
 * Determine whether an NPC "knows" a legend.
 *
 * Deterministic: same (legend, npcId, worldSeed, tick) → same result.
 * Probability = `legend.fame_Q / SCALE.Q`.
 */
export function npcKnowsLegend(
  legend:    Legend,
  npcId:     number,
  worldSeed: number,
  tick:      number,
): boolean {
  if (legend.fame_Q <= q(0)) return false;
  if (legend.fame_Q >= SCALE.Q) return true;

  // Deterministic salt from legendId characters
  const legendSalt = legend.legendId
    .split("")
    .reduce((acc, c) => (acc + c.charCodeAt(0)) & 0xFFFFFF, 0);

  const seed = eventSeed(worldSeed, tick, npcId, 0, legendSalt);
  return (seed % SCALE.Q) < legend.fame_Q;
}

// ── Dialogue integration ──────────────────────────────────────────────────────

/**
 * Aggregate legend effects for initiatorId, filtered by what targetId (NPC) knows.
 *
 * Called before dialogue resolution to get bonus Q values that shift
 * persuasion/intimidation/fear probabilities.
 */
export function applyLegendToDialogueContext(
  initiatorId: number,
  targetId:    number,
  registry:    LegendRegistry,
  worldSeed:   number,
  tick:        number,
): { persuasionBonus_Q: Q; intimidationBonus_Q: Q; fearBonus_Q: Q } {
  let persuasionBonus    = 0;
  let intimidationBonus  = 0;
  let fearBonus          = 0;

  for (const legend of getLegendsBySubject(registry, initiatorId)) {
    if (!npcKnowsLegend(legend, targetId, worldSeed, tick)) continue;
    const effect = getLegendEffect(legend);
    persuasionBonus   += effect.persuasionBonus_Q;
    intimidationBonus += effect.intimidationBonus_Q;
    fearBonus         += effect.fearBonus_Q;
  }

  return {
    persuasionBonus_Q:   clampQ(persuasionBonus as Q, q(0), q(0.50) as Q),
    intimidationBonus_Q: clampQ(intimidationBonus as Q, q(0), q(0.50) as Q),
    fearBonus_Q:         clampQ(fearBonus as Q, q(0), q(0.50) as Q),
  };
}

// ── Fame decay ────────────────────────────────────────────────────────────────

/**
 * Decay fame on all registered legends over `deltaTicks` time.
 *
 * - "legendary" reputation has a hard floor at q(0.50).
 * - All other reputations decay freely.
 * - Legends whose fame_Q falls below FORGOTTEN_FAME_THRESHOLD are reclassified as "forgotten".
 * - fame_Q never goes below 0.
 */
export function stepLegendFame(registry: LegendRegistry, deltaTicks: number): void {
  if (deltaTicks <= 0) return;

  const decay = Math.trunc(deltaTicks * FAME_DECAY_PER_1000_TICKS / 1000);
  if (decay <= 0) return;

  for (const legend of registry.legends.values()) {
    const floor = legend.reputation === "legendary" ? LEGENDARY_FAME_FLOOR : q(0);
    legend.fame_Q = clampQ(
      (legend.fame_Q - decay) as Q,
      floor,
      SCALE.Q as Q,
    );
    if (legend.fame_Q < FORGOTTEN_FAME_THRESHOLD && legend.reputation !== "legendary") {
      legend.reputation = "forgotten";
    }
  }
}

// ── Serialization ─────────────────────────────────────────────────────────────

/** Serialize legend registry to JSON-friendly object. */
export function serializeLegendRegistry(registry: LegendRegistry): unknown {
  return {
    legends: Array.from(registry.legends.entries()),
  };
}

/** Deserialize legend registry. */
export function deserializeLegendRegistry(data: unknown): LegendRegistry {
  const registry = createLegendRegistry();
  const d = data as Record<string, unknown>;

  if (Array.isArray(d.legends)) {
    for (const [id, legend] of d.legends as [string, Legend][]) {
      registry.legends.set(id, legend);

      let ids = registry.bySubject.get(legend.subjectId);
      if (!ids) {
        ids = new Set();
        registry.bySubject.set(legend.subjectId, ids);
      }
      ids.add(id);
    }
  }

  return registry;
}
