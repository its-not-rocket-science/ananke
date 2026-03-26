// src/renown.ts — Phase 75: Entity Renown & Legend Registry
//
// Tracks per-entity reputation derived from Chronicle events (Phase 45).
// Provides renown/infamy scores, faction standing adjustments, and prose
// legend rendering via the Phase 74 tone system.
//
// Design:
//   - Additive, history-scoped: renown grows only from *new* chronicle entries.
//   - Pure computation — no kernel changes, no new Entity fields.
//   - Two orthogonal axes: renown (positive deeds) and infamy (negative deeds).
//   - Faction standing adjustment: `deriveFactionStandingAdjustment` applies a
//     signed bias so heroic factions reward renown and outlaw factions reward infamy.

import type { ChronicleEntry, Chronicle, ChronicleEventType } from "./chronicle.js";
import type { NarrativeContext } from "./narrative-prose.js";
import { renderEntryWithTone } from "./narrative-prose.js";
import { q, SCALE, clampQ } from "./units.js";
import type { Q } from "./units.js";

// ── Event classification ───────────────────────────────────────────────────────

/** Event types that add to `renown_Q` when the entity is the primary actor. */
const RENOWN_EVENT_TYPES = new Set<ChronicleEventType>([
  "legendary_deed",
  "quest_completed",
  "combat_victory",
  "masterwork_crafted",
  "rank_promotion",
  "settlement_founded",
  "first_contact",
]);

/** Event types that add to `infamy_Q` when the entity is the primary actor. */
const INFAMY_EVENT_TYPES = new Set<ChronicleEventType>([
  "relationship_betrayal",
  "settlement_raided",
  "settlement_destroyed",
  "quest_failed",
]);

// ── Core types ─────────────────────────────────────────────────────────────────

/** Lightweight reference to a significant chronicle event in an entity's legend. */
export interface LegendEntry {
  /** Unique chronicle entry id (reference to original ChronicleEntry). */
  entryId:      string;
  tick:         number;
  eventType:    ChronicleEventType;
  /** Original significance score 0–100 from ChronicleEntry. */
  significance: number;
}

/** Accumulated reputation record for a single entity. */
export interface RenownRecord {
  entityId:  number;
  /** Fame from positive deeds, [0, SCALE.Q]. */
  renown_Q:  Q;
  /** Infamy from negative deeds, [0, SCALE.Q]. */
  infamy_Q:  Q;
  /** All legend entries attributed to this entity, in insertion order. */
  entries:   LegendEntry[];
}

/** Flat registry of RenownRecords, one per entity. */
export interface RenownRegistry {
  records: Map<number, RenownRecord>;
}

// ── Label types ────────────────────────────────────────────────────────────────

/** Human-readable fame tier, derived from `renown_Q`. */
export type RenownLabel =
  | "unknown"    // < q(0.10)
  | "noted"      // q(0.10)–q(0.30)
  | "known"      // q(0.30)–q(0.50)
  | "renowned"   // q(0.50)–q(0.70)
  | "legendary"  // q(0.70)–q(0.90)
  | "mythic";    // ≥ q(0.90)

/** Human-readable infamy tier, derived from `infamy_Q`. */
export type InfamyLabel =
  | "innocent"   // < q(0.10)
  | "suspect"    // q(0.10)–q(0.30)
  | "notorious"  // q(0.30)–q(0.50)
  | "infamous"   // q(0.50)–q(0.70)
  | "reviled"    // q(0.70)–q(0.90)
  | "condemned"; // ≥ q(0.90)

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Per-event renown/infamy contribution rate.
 * A maximum-significance (100) event contributes `RENOWN_SCALE_Q` to the score.
 * Scales linearly with `entry.significance`: `delta = round(sig * RENOWN_SCALE_Q / 100)`.
 */
export const RENOWN_SCALE_Q: Q = q(0.10);

// ── Factory ───────────────────────────────────────────────────────────────────

export function createRenownRegistry(): RenownRegistry {
  return { records: new Map() };
}

// ── Record access ─────────────────────────────────────────────────────────────

/**
 * Return the RenownRecord for `entityId`, creating a zero-initialised record
 * if one does not yet exist.
 */
export function getRenownRecord(
  registry: RenownRegistry,
  entityId:  number,
): RenownRecord {
  let record = registry.records.get(entityId);
  if (!record) {
    record = { entityId, renown_Q: 0 as Q, infamy_Q: 0 as Q, entries: [] };
    registry.records.set(entityId, record);
  }
  return record;
}

// ── Chronicle integration ─────────────────────────────────────────────────────

/**
 * Scan `chronicle` for entries involving `entityId` and update the entity's
 * RenownRecord accordingly.
 *
 * Idempotent: already-seen entryIds (tracked by `record.entries`) are skipped,
 * so this can be called on every game tick without double-counting.
 *
 * @param minSignificance  Only entries at or above this score are considered (default 50).
 */
export function updateRenownFromChronicle(
  registry:         RenownRegistry,
  chronicle:        Chronicle,
  entityId:         number,
  minSignificance:  number = 50,
): void {
  const record = getRenownRecord(registry, entityId);
  const known  = new Set(record.entries.map(e => e.entryId));

  for (const entry of chronicle.entries) {
    if (entry.significance < minSignificance) continue;
    if (!entry.actors.includes(entityId)) continue;
    if (known.has(entry.entryId)) continue;

    // Record the entry
    record.entries.push({
      entryId:     entry.entryId,
      tick:        entry.tick,
      eventType:   entry.eventType,
      significance: entry.significance,
    });
    known.add(entry.entryId);

    // Compute contribution: scale linearly with significance
    const delta = Math.round(entry.significance * RENOWN_SCALE_Q / 100);

    if (RENOWN_EVENT_TYPES.has(entry.eventType)) {
      record.renown_Q = clampQ(record.renown_Q + delta, 0, SCALE.Q);
    } else if (INFAMY_EVENT_TYPES.has(entry.eventType)) {
      record.infamy_Q = clampQ(record.infamy_Q + delta, 0, SCALE.Q);
    }
    // Neutral event types (births, settlements, rank promotions as target) count
    // in `entries` but do not move either axis.
  }
}

// ── Label functions ───────────────────────────────────────────────────────────

/** Map `renown_Q` to a human-readable fame tier. */
export function getRenownLabel(renown_Q: Q): RenownLabel {
  if (renown_Q >= q(0.90)) return "mythic";
  if (renown_Q >= q(0.70)) return "legendary";
  if (renown_Q >= q(0.50)) return "renowned";
  if (renown_Q >= q(0.30)) return "known";
  if (renown_Q >= q(0.10)) return "noted";
  return "unknown";
}

/** Map `infamy_Q` to a human-readable infamy tier. */
export function getInfamyLabel(infamy_Q: Q): InfamyLabel {
  if (infamy_Q >= q(0.90)) return "condemned";
  if (infamy_Q >= q(0.70)) return "reviled";
  if (infamy_Q >= q(0.50)) return "infamous";
  if (infamy_Q >= q(0.30)) return "notorious";
  if (infamy_Q >= q(0.10)) return "suspect";
  return "innocent";
}

// ── Faction standing adjustment ───────────────────────────────────────────────

/**
 * Compute a signed faction standing delta based on entity renown and infamy.
 *
 * `allianceBias` controls how the faction weighs the two axes:
 *   - q(1.0) = fully heroic faction: rewards renown, punishes infamy
 *   - q(0.0) = fully criminal faction: rewards infamy, punishes renown
 *   - q(0.5) = neutral: both axes equally weighted, they cancel
 *
 * Result is clamped to [-SCALE.Q, SCALE.Q].  The caller is responsible for
 * adding this delta to the current standing and re-clamping to [0, SCALE.Q].
 */
export function deriveFactionStandingAdjustment(
  renown_Q:      Q,
  infamy_Q:      Q,
  allianceBias:  Q = q(0.5) as Q,
): Q {
  // Heroic contribution: renown boosts, infamy hurts, scaled by allianceBias
  const heroicBias    = allianceBias;
  const criminalBias  = (SCALE.Q - allianceBias) as Q;

  const renownBoost  = Math.round(renown_Q * heroicBias   / SCALE.Q);
  const infamyBoost  = Math.round(infamy_Q * criminalBias / SCALE.Q);
  const renownPenalty = Math.round(renown_Q * criminalBias / SCALE.Q);
  const infamyPenalty = Math.round(infamy_Q * heroicBias   / SCALE.Q);

  const net = (renownBoost + infamyBoost) - (renownPenalty + infamyPenalty);
  return clampQ(net, -SCALE.Q, SCALE.Q) as Q;
}

// ── Legend entry queries ──────────────────────────────────────────────────────

/**
 * Return up to `n` legend entries sorted by significance (descending).
 * Ties are broken by tick (descending — more recent wins).
 */
export function getTopLegendEntries(record: RenownRecord, n: number): LegendEntry[] {
  return [...record.entries]
    .sort((a, b) => b.significance - a.significance || b.tick - a.tick)
    .slice(0, n);
}

// ── Prose rendering ───────────────────────────────────────────────────────────

/**
 * Render an entity's top legend entries as tone-aware prose strings.
 *
 * Requires `entryMap` — a Map of `entryId → ChronicleEntry` for full entry data.
 * Missing entries fall back to a bracketed placeholder.
 *
 * @param maxEntries  Maximum number of entries to render (default 5).
 */
export function renderLegendWithTone(
  record:       RenownRecord,
  entryMap:     Map<string, ChronicleEntry>,
  ctx:          NarrativeContext,
  maxEntries:   number = 5,
): string[] {
  return getTopLegendEntries(record, maxEntries).map(le => {
    const entry = entryMap.get(le.entryId);
    if (!entry) return `[${le.eventType}] (tick ${le.tick})`;
    return renderEntryWithTone(entry, ctx);
  });
}
