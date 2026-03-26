// src/narrative-prose.ts — Phase 74: Simulation Trace → Narrative Prose
//
// Cultural-tone rendering layer over Phase 45 ChronicleEntry events.
// Extends `narrative-render.ts` with tone-varied templates driven by
// `CultureProfile` (Phase 71) and `MythArchetype` (Phase 66).
//
// Design:
//   - 6 prose tones: neutral | heroic | tragic | martial | spiritual | mercantile
//   - Tone-varied sentence variants for all 19 ChronicleEventTypes
//   - `deriveNarrativeTone(culture)` maps dominant cultural values → tone
//   - `{name}` / `{target}` / `{variable}` substitution from entry.variables
//     + entity name map (replaces numeric actor IDs with names)
//   - `mythArchetypeFrame(archetype)` appends a myth-aware closing phrase
//   - Fully deterministic — no Math.random()

import type { ChronicleEntry, ChronicleEventType } from "./chronicle.js";
import type { Chronicle }                          from "./chronicle.js";
import type { CultureProfile }                     from "./culture.js";
import type { MythArchetype, Myth }               from "./mythology.js";
import { getDominantValues }                       from "./culture.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Voice tone used when rendering chronicle entries.
 * Derived from the dominant cultural values of the originating polity.
 */
export type ProseTone =
  | "neutral"      // plain past-tense history
  | "heroic"       // deeds and glory
  | "tragic"       // loss and inevitability
  | "martial"      // strength, discipline, combat
  | "spiritual"    // fate, gods, prophecy
  | "mercantile";  // accounts, exchange, practical consequence

/**
 * Context bundle for a tone-aware rendering pass.
 * Created by `createNarrativeContext` and passed to render functions.
 */
export interface NarrativeContext {
  /** Map of entity id → display name. Missing ids fall back to "entity {id}". */
  entityNames: Map<number, string>;
  /** Prose tone for this rendering pass. */
  tone: ProseTone;
  /**
   * Optional myth-archetype closing phrase appended to each rendered sentence.
   * Produced by `mythArchetypeFrame(archetype)`.
   */
  mythFrame?: string;
}

// ── Tone → ValueId mapping ────────────────────────────────────────────────────

/** Maps cultural value ids to the prose tone they imply. */
const VALUE_TONE_MAP: Record<string, ProseTone> = {
  martial_virtue:     "martial",
  spiritual_devotion: "spiritual",
  commerce:           "mercantile",
  honour:             "heroic",
  fatalism:           "tragic",
  // honour + kin_loyalty lean heroic; others default to neutral
};

// ── Tone-varied templates ─────────────────────────────────────────────────────
// Each event type has a neutral template plus any number of tone overrides.
// Template syntax: {name} = first actor, {target} = second actor,
//                  {varName} = entry.variables["varName"].

type ToneTemplates = Partial<Record<ProseTone, string>>;

const TEMPLATES: Record<ChronicleEventType, ToneTemplates> = {
  entity_death: {
    neutral:     "{name} died{cause_str}{location_str}.",
    heroic:      "{name} fell in glorious battle, their deeds forever etched in memory.",
    tragic:      "The world grew darker as {name} breathed their last{cause_str}.",
    martial:     "{name} was cut down{cause_str} — a warrior's end.",
    spiritual:   "The gods finally claimed {name}{cause_str}, as had long been ordained.",
    mercantile:  "{name}'s final accounts were settled; the ledgers closed for the last time.",
  },
  entity_birth: {
    neutral:     "{entityName} was born{parents_str}{settlement_str}.",
    heroic:      "Into the world came {entityName}, destined for greatness{settlement_str}.",
    tragic:      "{entityName} entered a world that would not be kind to them{settlement_str}.",
    spiritual:   "The heavens marked the arrival of {entityName}{settlement_str}.",
    mercantile:  "A new soul joined the household{settlement_str}: {entityName}.",
    martial:     "{entityName} was born{settlement_str} — another sword arm for the generations.",
  },
  relationship_formed: {
    neutral:     "{actorA} and {actorB} formed a {bondType}{context_str}.",
    heroic:      "{actorA} and {actorB} swore a bond of {bondType} — an alliance the ages would remember.",
    tragic:      "{actorA} and {actorB} formed a {bondType}{context_str}, not knowing what lay ahead.",
    martial:     "{actorA} and {actorB} forged a pact of {bondType}{context_str}.",
    spiritual:   "Fate bound {actorA} and {actorB} together in {bondType}{context_str}.",
    mercantile:  "{actorA} and {actorB} entered a {bondType} arrangement{context_str}.",
  },
  relationship_broken: {
    neutral:     "{actorA} and {actorB}'s {bondType} ended{reason_str}.",
    heroic:      "The bond of {bondType} between {actorA} and {actorB} shattered{reason_str}.",
    tragic:      "What once bound {actorA} and {actorB} crumbled to dust{reason_str}.",
    martial:     "{actorA} and {actorB} severed their {bondType}{reason_str}.",
    spiritual:   "The ties between {actorA} and {actorB} were cut by forces beyond them{reason_str}.",
    mercantile:  "The {bondType} between {actorA} and {actorB} was dissolved{reason_str}.",
  },
  relationship_betrayal: {
    neutral:     "{betrayer} betrayed {victim}{context_str}, destroying their trust forever.",
    heroic:      "{betrayer} shamed themselves by betraying {victim}{context_str} — a dishonour never forgotten.",
    tragic:      "{betrayer} betrayed {victim}{context_str}, and so the tragedy unfolded as it had to.",
    martial:     "{betrayer} struck {victim} in the back{context_str}. Such treachery is not forgotten on the field.",
    spiritual:   "{betrayer}'s betrayal of {victim}{context_str} brought down divine displeasure upon them.",
    mercantile:  "{betrayer} broke faith with {victim}{context_str}, voiding every contract between them.",
  },
  quest_completed: {
    neutral:     "{actorName} completed the quest \"{questName}\"{reward_str}.",
    heroic:      "{actorName} returned triumphant from \"{questName}\"{reward_str}, glory well earned.",
    tragic:      "{actorName} completed \"{questName}\"{reward_str}, though the cost had been great.",
    martial:     "{actorName} accomplished \"{questName}\" through force and discipline{reward_str}.",
    spiritual:   "Providence guided {actorName} to complete \"{questName}\"{reward_str}.",
    mercantile:  "{actorName} fulfilled the terms of \"{questName}\"{reward_str}.",
  },
  quest_failed: {
    neutral:     "{actorName} failed the quest \"{questName}\"{reason_str}.",
    heroic:      "{actorName} fell short of completing \"{questName}\"{reason_str}, but the attempt was not without honour.",
    tragic:      "\"{questName}\" defeated {actorName}{reason_str} — some burdens are too great to bear.",
    martial:     "{actorName} was bested in \"{questName}\"{reason_str}.",
    spiritual:   "The gods turned their face from {actorName} in \"{questName}\"{reason_str}.",
    mercantile:  "{actorName} failed to deliver on \"{questName}\"{reason_str}.",
  },
  quest_accepted: {
    neutral:     "{actorName} accepted the quest \"{questName}\"{giver_str}.",
    heroic:      "{actorName} took up the challenge of \"{questName}\"{giver_str}, determined to prevail.",
    tragic:      "{actorName} accepted \"{questName}\"{giver_str}, setting foot on a road with no easy return.",
    martial:     "{actorName} took the mission \"{questName}\"{giver_str}.",
    spiritual:   "{actorName} heeded the call of \"{questName}\"{giver_str}.",
    mercantile:  "{actorName} contracted for \"{questName}\"{giver_str}.",
  },
  settlement_founded: {
    neutral:     "The settlement of {settlementName} was founded{founder_str}.",
    heroic:      "{founder} raised the banner over {settlementName} — a new stronghold in a dangerous land.",
    tragic:      "The settlement of {settlementName} was founded{founder_str}, its future unknown.",
    martial:     "{founder_str_cap} planted the flag at {settlementName} and began to fortify.",
    spiritual:   "The gods blessed the founding of {settlementName}{founder_str}.",
    mercantile:  "{settlementName} was established{founder_str} as a hub of exchange.",
  },
  settlement_upgraded: {
    neutral:     "{settlementName} grew from {oldTier} to {newTier}.",
    heroic:      "{settlementName} rose to become a mighty {newTier}, a symbol of what courage can build.",
    tragic:      "{settlementName} expanded to {newTier} — growth that would bring its own dangers.",
    martial:     "{settlementName} was fortified to {newTier} against all threats.",
    spiritual:   "The gods smiled on {settlementName} as it advanced to {newTier}.",
    mercantile:  "{settlementName} prospered, growing from {oldTier} to {newTier}.",
  },
  settlement_raided: {
    neutral:     "{settlementName} was raided by {raiders}{damage_str}.",
    heroic:      "{settlementName} withstood a raid by {raiders}, the defenders holding firm despite {damage_str}.",
    tragic:      "{raiders} descended on {settlementName}, leaving only ruin{damage_str}.",
    martial:     "{raiders} struck {settlementName}{damage_str} — a bold, brutal assault.",
    spiritual:   "Dark forces in the guise of {raiders} visited ruin upon {settlementName}{damage_str}.",
    mercantile:  "{raiders} raided {settlementName}, disrupting trade and costing heavily{damage_str}.",
  },
  settlement_destroyed: {
    neutral:     "{settlementName} fell to {destroyer}, ending its {age} history.",
    heroic:      "{settlementName} fell to {destroyer} after {age} — but its people's deeds will not be forgotten.",
    tragic:      "And so {settlementName} fell, its {age} of history extinguished by {destroyer}.",
    martial:     "{destroyer} razed {settlementName} after {age} — the victors' right of conquest.",
    spiritual:   "The gods withdrew their protection; {settlementName} fell to {destroyer} after {age}.",
    mercantile:  "{settlementName} ceased to exist after {age}, its markets silenced by {destroyer}.",
  },
  facility_completed: {
    neutral:     "A new {facilityType} was completed in {settlementName}.",
    heroic:      "The {facilityType} of {settlementName} stood complete — testament to collective will.",
    martial:     "The {facilityType} of {settlementName} was finished, strengthening the garrison.",
    spiritual:   "The sacred {facilityType} in {settlementName} was consecrated at last.",
    mercantile:  "The {facilityType} in {settlementName} opened for business.",
    tragic:      "The {facilityType} of {settlementName} was finally completed, though at great cost.",
  },
  masterwork_crafted: {
    neutral:     "{crafterName} forged {itemName}, a masterwork of exceptional quality.",
    heroic:      "{crafterName}'s {itemName} was a masterwork worthy of legend.",
    tragic:      "{crafterName} poured a lifetime's sorrow into {itemName} — the finest work they would ever do.",
    martial:     "{crafterName} hammered {itemName} into existence — a weapon that would turn battles.",
    spiritual:   "The gods guided {crafterName}'s hands as they crafted {itemName}.",
    mercantile:  "{crafterName}'s {itemName} commanded the highest price ever seen in the markets.",
  },
  first_contact: {
    neutral:     "{factionA} made first contact with {factionB}{location_str}.",
    heroic:      "{factionA} met {factionB} for the first time{location_str} — a meeting that would shape history.",
    tragic:      "{factionA} encountered {factionB}{location_str}; neither would be unchanged.",
    martial:     "{factionA} and {factionB} faced each other across the boundary{location_str}.",
    spiritual:   "Fate decreed that {factionA} and {factionB} would meet{location_str}.",
    mercantile:  "{factionA} opened relations with {factionB}{location_str}, eyeing mutual profit.",
  },
  combat_victory: {
    neutral:     "{victor} defeated {defeated}{method_str}.",
    heroic:      "{victor} stood triumphant over {defeated}{method_str} — glory well earned.",
    tragic:      "{victor} defeated {defeated}{method_str}, though victory came at a price.",
    martial:     "{victor} crushed {defeated}{method_str} through strength and discipline.",
    spiritual:   "Providence guided {victor}'s hand against {defeated}{method_str}.",
    mercantile:  "{victor} secured a decisive advantage over {defeated}{method_str}.",
  },
  combat_defeat: {
    neutral:     "{defeated} was overcome by {victor}{location_str}.",
    heroic:      "{defeated} fell before {victor}{location_str}, but fought with honour to the last.",
    tragic:      "{defeated} was overwhelmed by {victor}{location_str} — the outcome never in doubt.",
    martial:     "{victor} broke {defeated}{location_str} — outmatched from the first blow.",
    spiritual:   "The gods turned from {defeated} in {location_str}; {victor} prevailed.",
    mercantile:  "{defeated} lost ground to {victor}{location_str}, the balance of power shifting.",
  },
  rank_promotion: {
    neutral:     "{actorName} rose to the rank of {newRank}{faction_str}.",
    heroic:      "{actorName} was honoured with the rank of {newRank}{faction_str}, their deeds recognised at last.",
    tragic:      "{actorName} was elevated to {newRank}{faction_str} — responsibility they had never sought.",
    martial:     "{actorName} earned the rank of {newRank}{faction_str} through proven valour.",
    spiritual:   "The order elevated {actorName} to {newRank}{faction_str}, guided by higher purpose.",
    mercantile:  "{actorName} was promoted to {newRank}{faction_str}, gaining both status and obligation.",
  },
  legendary_deed: {
    neutral:     "{hero} performed a legendary deed: {deedDescription}",
    heroic:      "{hero} carved their name into history: {deedDescription}",
    tragic:      "{hero} achieved the impossible through {deedDescription} — at what cost, only time would tell.",
    martial:     "{hero} proved their supremacy: {deedDescription}",
    spiritual:   "The heavens bore witness as {hero} accomplished {deedDescription}",
    mercantile:  "{hero}'s deed — {deedDescription} — would be spoken of in every market for years.",
  },
  tragic_event: {
    neutral:     "Tragedy struck when {description}",
    heroic:      "Even heroes could not prevent the tragedy: {description}",
    tragic:      "As it was always destined to be: {description}",
    martial:     "The hard truth of war bore down: {description}",
    spiritual:   "The gods decreed it so: {description}",
    mercantile:  "No ledger could account for such loss: {description}",
  },
};

// ── Myth archetype frames ─────────────────────────────────────────────────────

/** Returns a closing phrase appropriate to the myth archetype. */
export function mythArchetypeFrame(archetype: MythArchetype): string {
  switch (archetype) {
    case "hero":        return "as heroes are destined to do";
    case "monster":     return "fulfilling the dark prophecy";
    case "trickster":   return "through cunning that none could have predicted";
    case "great_plague":return "as the ancient sickness had foretold";
    case "divine_wrath":return "by the judgment of wrathful gods";
    case "golden_age":  return "in an age that songs shall long remember";
  }
}

// ── Tone derivation ───────────────────────────────────────────────────────────

/**
 * Derive the best matching `ProseTone` from a `CultureProfile`.
 *
 * Uses the top-ranked cultural value; falls back to `"neutral"` for values
 * without a direct tone mapping (hospitality, hierarchy, innovation, etc.).
 */
export function deriveNarrativeTone(culture: CultureProfile): ProseTone {
  const dominant = getDominantValues(culture, 1);
  const topValue = dominant[0]?.id;
  if (!topValue) return "neutral";
  return VALUE_TONE_MAP[topValue] ?? "neutral";
}

// ── Context builder ───────────────────────────────────────────────────────────

/**
 * Create a `NarrativeContext` for a rendering pass.
 *
 * @param entityNames  Map of entity id → display name (numeric ids are looked up here).
 * @param culture      Optional culture profile — used to derive tone automatically.
 * @param myth         Optional myth — used to append archetype-framing suffix.
 */
export function createNarrativeContext(
  entityNames: Map<number, string>,
  culture?: CultureProfile,
  myth?: Myth,
): NarrativeContext {
  const tone = culture ? deriveNarrativeTone(culture) : "neutral";
  const ctx: NarrativeContext = { entityNames, tone };
  if (myth) ctx.mythFrame = mythArchetypeFrame(myth.archetype);
  return ctx;
}

// ── Template substitution ─────────────────────────────────────────────────────

/**
 * Replace `{varName}` placeholders in a template string.
 *
 * Resolution order:
 *   1. `{name}`   → display name of `actors[0]` from `ctx.entityNames`
 *   2. `{target}` → display name of `actors[1]` from `ctx.entityNames`
 *   3. All keys in `entry.variables`
 *   4. Computed helpers: `{cause_str}`, `{location_str}`, etc.
 *   5. Any remaining `{varName}` → removed (empty string)
 */
function applyTemplate(
  template:    string,
  entry:       ChronicleEntry,
  ctx:         NarrativeContext,
): string {
  const vars     = entry.variables;
  const actors   = entry.actors;
  const names    = ctx.entityNames;

  const actorName   = (id: number) => names.get(id) ?? `entity ${id}`;
  const primaryName = actors[0] != null ? actorName(actors[0]) : (String(vars["actorName"] ?? "Unknown"));
  const targetName  = actors[1] != null ? actorName(actors[1]) : (String(vars["target"]    ?? "Unknown"));

  // Computed helper strings (empty when the variable is absent)
  const helpers: Record<string, string> = {
    cause_str:        vars["cause"]    ? ` from ${vars["cause"]}`           : "",
    location_str:     vars["location"] ? ` in ${vars["location"]}`          : "",
    parents_str:      vars["parents"]  ? ` to ${vars["parents"]}`           : "",
    settlement_str:   vars["settlement"] ? ` in ${vars["settlement"]}`      : "",
    context_str:      vars["context"]  ? ` after ${vars["context"]}`        : "",
    reason_str:       vars["reason"]   ? ` due to ${vars["reason"]}`        : "",
    reward_str:       vars["reward"]   ? ` and received ${vars["reward"]}`  : "",
    giver_str:        vars["giver"]    ? ` from ${vars["giver"]}`           : "",
    founder_str:      vars["founder"]  ? ` by ${vars["founder"]}`           : "",
    founder_str_cap:  vars["founder"]  ? String(vars["founder"])            : "Settlers",
    damage_str:       vars["damage"]   ? `, suffering ${vars["damage"]}`    : "",
    method_str:       vars["method"]   ? ` by ${vars["method"]}`            : "",
    faction_str:      vars["faction"]  ? ` in the ${vars["faction"]}`       : "",
  };

  let result = template;

  // Named actor substitutions
  result = result.replace(/\{name\}/g,   primaryName);
  result = result.replace(/\{target\}/g, targetName);

  // Computed helpers
  for (const [k, v] of Object.entries(helpers)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  }

  // Raw variables from entry
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }

  // Remove any unresolved placeholders
  result = result.replace(/\{[^}]+\}/g, "");

  return result;
}

// ── Public render API ─────────────────────────────────────────────────────────

/**
 * Render a single `ChronicleEntry` with cultural-tone awareness.
 *
 * Selects the tone variant for `entry.eventType`; falls back to `"neutral"` if
 * the requested tone has no specific variant.  Appends `ctx.mythFrame` if set.
 *
 * Does NOT mutate `entry.rendered` — call `entry.rendered = renderEntryWithTone(...)`
 * manually if caching is desired.
 */
export function renderEntryWithTone(
  entry: ChronicleEntry,
  ctx:   NarrativeContext,
): string {
  const toneVariants = TEMPLATES[entry.eventType];
  const template     = toneVariants?.[ctx.tone] ?? toneVariants?.["neutral"] ?? "";

  if (!template) {
    return `[${entry.eventType}] (tick ${entry.tick})`;
  }

  let prose = applyTemplate(template, entry, ctx);

  if (ctx.mythFrame) {
    // Append myth frame, replacing terminal period if present
    prose = prose.replace(/\.$/, "") + `, ${ctx.mythFrame}.`;
  }

  return prose;
}

/**
 * Render all entries in a `Chronicle` above `minSignificance` (default 50),
 * returned in chronological order.
 *
 * Uses `renderEntryWithTone` for each entry.
 */
export function renderChronicleWithTone(
  chronicle:        Chronicle,
  ctx:              NarrativeContext,
  minSignificance:  number = 50,
): string[] {
  return chronicle.entries
    .filter(e => e.significance >= minSignificance)
    .sort((a, b) => a.tick - b.tick)
    .map(e => renderEntryWithTone(e, ctx));
}
