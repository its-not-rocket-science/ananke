// src/narrative-render.ts — Phase 45: Emergent Story Generation — Narrative Rendering
//
// Template-based prose generation for chronicle entries and story arcs.

import type { ChronicleEntry, ChronicleEventType, StoryArc } from "./chronicle.js";

// ── Template Registry ─────────────────────────────────────────────────────────

/** A template function that generates prose from entry variables. */
type TemplateFn = (vars: Record<string, string | number>) => string;

/** Static templates for each event type. */
const EVENT_TEMPLATES: Record<ChronicleEventType, TemplateFn> = {
  entity_death: (v) => `${v.actorName} died${v.cause ? ` from ${v.cause}` : ""}${v.location ? ` in ${v.location}` : ""}.`,
  entity_birth: (v) => `${v.entityName} was born${v.parents ? ` to ${v.parents}` : ""}${v.settlement ? ` in ${v.settlement}` : ""}.`,
  relationship_formed: (v) => `${v.actorA} and ${v.actorB} formed a ${v.bondType || "relationship"}${v.context ? ` after ${v.context}` : ""}.`,
  relationship_broken: (v) => `${v.actorA} and ${v.actorB}'s ${v.bondType || "relationship"} ended${v.reason ? ` due to ${v.reason}` : ""}.`,
  relationship_betrayal: (v) => `${v.betrayer} betrayed ${v.victim}${v.context ? ` during ${v.context}` : ""}, destroying their trust forever.`,
  quest_completed: (v) => `${v.actorName} completed the quest "${v.questName}"${v.reward ? ` and received ${v.reward}` : ""}.`,
  quest_failed: (v) => `${v.actorName} failed the quest "${v.questName}"${v.reason ? `: ${v.reason}` : ""}.`,
  quest_accepted: (v) => `${v.actorName} accepted the quest "${v.questName}"${v.giver ? ` from ${v.giver}` : ""}.`,
  settlement_founded: (v) => `The settlement of ${v.settlementName} was founded${v.founder ? ` by ${v.founder}` : ""}.`,
  settlement_upgraded: (v) => `${v.settlementName} grew from ${v.oldTier} to ${v.newTier}.`,
  settlement_raided: (v) => `${v.settlementName} was raided by ${v.raiders}${v.damage ? `, suffering ${v.damage}` : ""}.`,
  settlement_destroyed: (v) => `${v.settlementName} fell to ${v.destroyer}, ending its ${v.age} history.`,
  facility_completed: (v) => `A new ${v.facilityType} was completed in ${v.settlementName}.`,
  masterwork_crafted: (v) => `${v.crafterName} forged ${v.itemName}, a masterwork of exceptional quality.`,
  first_contact: (v) => `${v.factionA} made first contact with ${v.factionB}${v.location ? ` at ${v.location}` : ""}.`,
  combat_victory: (v) => `${v.victor} defeated ${v.defeated}${v.method ? ` by ${v.method}` : ""}.`,
  combat_defeat: (v) => `${v.defeated} was overcome by ${v.victor}${v.location ? ` in ${v.location}` : ""}.`,
  rank_promotion: (v) => `${v.actorName} rose to the rank of ${v.newRank}${v.faction ? ` in ${v.faction}` : ""}.`,
  legendary_deed: (v) => `${v.hero} performed a legendary deed: ${v.deedDescription}`,
  tragic_event: (v) => `Tragedy struck when ${v.description}`,
};

// ── Arc Summary Templates ─────────────────────────────────────────────────────

/** Generate a summary for a story arc. */
export function renderArcSummary(arc: StoryArc): string {
  const typeSummaries: Record<string, (arc: StoryArc) => string> = {
    rise_of_hero: (a) => `The hero's journey of ${actorNames(a)} spans ${entryCount(a)} pivotal moments.`,
    tragic_fall: (a) => `${actorNames(a)}'s descent from grace, marked by betrayal and loss.`,
    rivalry: (a) => `An enduring rivalry between ${actorNames(a)} unfolding across ${entryCount(a)} confrontations.`,
    great_migration: (_a) => `A mass migration that reshaped the region.`,
    settlement_growth: (_a) => `The rise of a settlement from humble beginnings to prosperity.`,
    fallen_settlement: (_a) => `The tragic fall of a once-great settlement.`,
    legendary_craftsman: (a) => `${actorNames(a)}'s masterworks will be remembered for generations.`,
    notorious_villain: (a) => `The terrifying rise of ${actorNames(a)}.`,
    unlikely_friendship: (a) => `An unexpected bond formed between ${actorNames(a)} against all odds.`,
    betrayal_and_redemption: (a) => `A tale of treachery, guilt, and ultimately, redemption for ${actorNames(a)}.`,
  };

  const renderer = typeSummaries[arc.arcType];
  return renderer ? renderer(arc) : arc.description;
}

function actorNames(arc: StoryArc): string {
  return arc.primaryActors.join(" and ");
}

function entryCount(arc: StoryArc): number {
  return arc.entryIds.length;
}

// ── Entry Rendering ───────────────────────────────────────────────────────────

/** Render a chronicle entry to prose. */
export function renderEntry(entry: ChronicleEntry): string {
  // Return cached render if available
  if (entry.rendered) return entry.rendered;

  const templateFn = EVENT_TEMPLATES[entry.eventType];
  if (!templateFn) {
    return `Event: ${entry.eventType} (tick ${entry.tick})`;
  }

  return templateFn(entry.variables);
}

/** Render an entry with full context. */
export function renderEntryVerbose(entry: ChronicleEntry): string {
  const base = renderEntry(entry);
  const significance = ` [Significance: ${entry.significance}/100]`;
  const actors = entry.actors.length > 0 ? ` (Actors: ${entry.actors.join(", ")})` : "";
  const settlement = entry.settlementId ? ` @${entry.settlementId}` : "";

  return `${base}${significance}${actors}${settlement}`;
}

// ── Chronicle Rendering ───────────────────────────────────────────────────────

export interface RenderOptions {
  /** Include significance scores. */
  showSignificance?: boolean;
  /** Include actor IDs. */
  showActors?: boolean;
  /** Include settlement IDs. */
  showSettlements?: boolean;
  /** Minimum significance to include. */
  minSignificance?: number;
  /** Format: prose | chronological | compact */
  format?: "prose" | "chronological" | "compact";
}

/** Render multiple entries to a narrative. */
export function renderChronicle(
  entries: ChronicleEntry[],
  options: RenderOptions = {},
): string {
  const {
    showSignificance = false,
    showActors = false,
    showSettlements = false,
    minSignificance = 0,
    format = "prose",
  } = options;

  const filtered = entries.filter(e => e.significance >= minSignificance);

  if (filtered.length === 0) {
    return "No events recorded.";
  }

  switch (format) {
    case "compact":
      return filtered.map(e => `[Tick ${e.tick}] ${renderEntry(e)}`).join("\n");

    case "chronological":
      return filtered
        .map(e => {
          let line = `Turn ${e.tick}: ${renderEntry(e)}`;
          if (showSignificance) line += ` [${e.significance}]`;
          if (showActors && e.actors.length) line += ` {${e.actors.join(",")}}`;
          if (showSettlements && e.settlementId) line += ` @${e.settlementId}`;
          return line;
        })
        .join("\n");

    case "prose":
    default: {
      const paragraphs: string[] = [];
      let currentParagraph = "";

      for (const entry of filtered) {
        const sentence = renderEntry(entry);

        // Start new paragraph on significant events
        if (entry.significance >= 70 && currentParagraph) {
          paragraphs.push(currentParagraph.trim());
          currentParagraph = sentence + " ";
        } else {
          currentParagraph += sentence + " ";
        }
      }

      if (currentParagraph) {
        paragraphs.push(currentParagraph.trim());
      }

      return paragraphs.join("\n\n");
    }
  }
}

// ── Arc Rendering ─────────────────────────────────────────────────────────────

/** Render a complete story arc with its entries. */
export function renderArcNarrative(
  arc: StoryArc,
  entryMap: Map<string, ChronicleEntry>,
): string {
  const lines: string[] = [];

  // Header
  lines.push(`═══ ${arc.arcType.toUpperCase().replace(/_/g, " ")} ═══`);
  lines.push(`Significance: ${arc.significance}/100 | Duration: Tick ${arc.startTick} to ${arc.endTick ?? "ongoing"}`);
  lines.push("");

  // Arc summary
  lines.push(renderArcSummary(arc));
  lines.push("");

  // Entries in arc
  lines.push("Key Events:");
  for (const entryId of arc.entryIds) {
    const entry = entryMap.get(entryId);
    if (entry) {
      lines.push(`  [${entry.tick}] ${renderEntry(entry)}`);
    }
  }

  return lines.join("\n");
}

/** Render all arcs in a chronicle. */
export function renderAllArcs(
  arcs: StoryArc[],
  entryMap: Map<string, ChronicleEntry>,
): string {
  if (arcs.length === 0) {
    return "No story arcs detected.";
  }

  return arcs
    .sort((a, b) => b.significance - a.significance)
    .map(arc => renderArcNarrative(arc, entryMap))
    .join("\n\n");
}

// ── Custom Templates ──────────────────────────────────────────────────────────

/** Register a custom template for an event type. */
export function registerTemplate(
  eventType: ChronicleEventType,
  templateFn: TemplateFn,
): void {
  (EVENT_TEMPLATES as Record<ChronicleEventType, TemplateFn>)[eventType] = templateFn;
}

/** Register multiple templates at once. */
export function registerTemplates(
  templates: Partial<Record<ChronicleEventType, TemplateFn>>,
): void {
  for (const [eventType, fn] of Object.entries(templates)) {
    if (fn) {
      registerTemplate(eventType as ChronicleEventType, fn);
    }
  }
}

// ── Narrative Generation ──────────────────────────────────────────────────────

export interface GeneratedNarrative {
  title: string;
  summary: string;
  fullText: string;
  keyFigures: number[];
  keyEvents: string[];
  estimatedDrama: number;
}

/** Generate a complete narrative from a set of arcs and entries. */
export function generateNarrative(
  arcs: StoryArc[],
  entries: ChronicleEntry[],
): GeneratedNarrative {
  const sortedArcs = arcs.sort((a, b) => b.significance - a.significance);
  const topArc = sortedArcs[0];

  // Collect key figures from all arcs
  const keyFigures = [...new Set(arcs.flatMap(a => a.primaryActors))];

  // Title based on top arc
  const title = topArc
    ? `The ${topArc.arcType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}`
    : "Chronicle of Events";

  // Summary paragraph
  const summaryParts: string[] = [];
  if (topArc) {
    summaryParts.push(renderArcSummary(topArc));
  }
  if (sortedArcs.length > 1) {
    summaryParts.push(`${sortedArcs.length - 1} other story arcs intertwine with this narrative.`);
  }
  const summary = summaryParts.join(" ") || "A series of unconnected events.";

  // Build full text
  const entryMap = new Map(entries.map(e => [e.entryId, e]));
  const fullText = renderAllArcs(sortedArcs, entryMap);

  // Drama estimate based on arc significance and variety
  const significanceSum = arcs.reduce((sum, a) => sum + a.significance, 0);
  const varietyBonus = Math.min(20, arcs.length * 5);
  const estimatedDrama = Math.min(100, significanceSum / Math.max(1, arcs.length) + varietyBonus);

  return {
    title,
    summary,
    fullText,
    keyFigures,
    keyEvents: topArc?.entryIds ?? [],
    estimatedDrama,
  };
}

