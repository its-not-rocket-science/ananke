/**
 * CE-12 — Data-Driven Entity Catalog
 *
 * Allows archetypes, weapons, and armour to be defined in JSON (e.g. loaded from a file
 * or authored by non-TypeScript content creators) and registered at runtime.
 *
 * All numeric values in JSON are **real-world SI units**:
 *   mass_kg   → real kilograms (e.g. 110)
 *   stature_m → real metres   (e.g. 1.9)
 *   force_N   → real Newtons  (e.g. 3200)
 *   power_W   → real Watts    (e.g. 1400)
 *   energy_J  → real Joules   (e.g. 25000)
 *   time_s    → real seconds  (e.g. 0.22)
 *   Q-fields  → ratio [0..1]  (e.g. 0.65)
 *
 * The catalog converts these to internal fixed-point SCALE units on registration.
 * getCatalogEntry(id) returns the already-converted typed object.
 */

import { q, to, type Q, type I32 } from "./units.js";
import type { Archetype } from "./archetypes.js";
import {
  HUMAN_BASE,
  AMATEUR_BOXER,
  PRO_BOXER,
  GRECO_WRESTLER,
  KNIGHT_INFANTRY,
  LARGE_PACIFIC_OCTOPUS,
  SERVICE_ROBOT,
} from "./archetypes.js";
import type { Weapon, Armour, WeaponDamageProfile } from "./equipment.js";
import { DamageChannel, channelMask } from "./channels.js";
import type { CognitiveProfile } from "./types.js";

// ── Catalog storage ───────────────────────────────────────────────────────────

export type CatalogKind = "archetype" | "weapon" | "armour";

export type CatalogEntry =
  | { kind: "archetype"; id: string; archetype: Archetype }
  | { kind: "weapon";    id: string; weapon: Weapon }
  | { kind: "armour";    id: string; armour: Armour };

const _store = new Map<string, CatalogEntry>();

// ── Built-in archetype bases ──────────────────────────────────────────────────

const ARCHETYPE_BASES: Record<string, Archetype> = {
  HUMAN_BASE,
  AMATEUR_BOXER,
  PRO_BOXER,
  GRECO_WRESTLER,
  KNIGHT_INFANTRY,
  LARGE_PACIFIC_OCTOPUS,
  SERVICE_ROBOT,
};

// ── JSON parsing helpers ──────────────────────────────────────────────────────

function assertObj(v: unknown, ctx: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    throw new Error(`${ctx}: expected object, got ${Array.isArray(v) ? "array" : typeof v}`);
  return v as Record<string, unknown>;
}

function requireStr(obj: Record<string, unknown>, field: string, ctx: string): string {
  const v = obj[field];
  if (typeof v !== "string") throw new Error(`${ctx}: "${field}" must be a string`);
  return v;
}

function requireNum(obj: Record<string, unknown>, field: string, ctx: string): number {
  const v = obj[field];
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new Error(`${ctx}: "${field}" must be a finite number`);
  return v;
}

function optNum(obj: Record<string, unknown>, field: string): number | undefined {
  const v = obj[field];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function optStr(obj: Record<string, unknown>, field: string): string | undefined {
  const v = obj[field];
  return typeof v === "string" ? v : undefined;
}

function optBool(obj: Record<string, unknown>, field: string): boolean | undefined {
  const v = obj[field];
  return typeof v === "boolean" ? v : undefined;
}

/** Convert a JSON [0..N] float to internal Q integer. Allows values slightly above 1.0 (e.g. q(1.2) for service-robot integrity). */
function parseQ(v: number, field: string, ctx: string): Q {
  if (v < 0) throw new Error(`${ctx}: Q field "${field}" must be ≥ 0, got ${v}`);
  if (v > 5) throw new Error(`${ctx}: Q field "${field}" must be ≤ 5, got ${v}`);
  return q(v) as Q;
}

function parseQField(obj: Record<string, unknown>, field: string, ctx: string): Q {
  return parseQ(requireNum(obj, field, ctx), field, ctx);
}

function optQField(obj: Record<string, unknown>, field: string, ctx: string): Q | undefined {
  const v = optNum(obj, field);
  return v !== undefined ? parseQ(v, field, ctx) : undefined;
}

// ── Archetype field specification ─────────────────────────────────────────────

/** Which converter to apply to each Archetype field when reading JSON overrides. */
type ArchSpec = "m" | "kg" | "N" | "W" | "J" | "s" | "Q" | "plain";

const ARCHETYPE_FIELD_SPEC: Record<string, ArchSpec> = {
  stature_m:           "m",
  mass_kg:             "kg",
  visionRange_m:       "m",
  visionArcDeg:        "plain",
  hearingRange_m:      "m",
  decisionLatency_s:   "s",
  attentionDepth:      "plain",
  threatHorizon_m:     "m",
  statureVar:          "Q",
  massVar:             "Q",
  reachVar:            "Q",
  actuatorScaleVar:    "Q",
  structureScaleVar:   "Q",
  actuatorMassFrac:    "Q",
  actuatorMassVar:     "Q",
  peakForce_N:         "N",
  peakForceVar:        "Q",
  peakPower_W:         "W",
  peakPowerVar:        "Q",
  continuousPower_W:   "W",
  continuousPowerVar:  "Q",
  reserveEnergy_J:     "J",
  reserveEnergyVar:    "Q",
  conversionEfficiency: "Q",
  efficiencyVar:       "Q",
  reactionTime_s:      "s",
  reactionTimeVar:     "Q",
  controlQuality:      "Q",
  controlVar:          "Q",
  stability:           "Q",
  stabilityVar:        "Q",
  fineControl:         "Q",
  fineControlVar:      "Q",
  surfaceIntegrity:    "Q",
  surfaceVar:          "Q",
  bulkIntegrity:       "Q",
  bulkVar:             "Q",
  structureIntegrity:  "Q",
  structVar:           "Q",
  distressTolerance:   "Q",
  distressVar:         "Q",
  shockTolerance:      "Q",
  shockVar:            "Q",
  concussionTolerance: "Q",
  concVar:             "Q",
  heatTolerance:       "Q",
  heatVar:             "Q",
  coldTolerance:       "Q",
  coldVar:             "Q",
  fatigueRate:         "Q",
  fatigueVar:          "Q",
  recoveryRate:        "Q",
  recoveryVar:         "Q",
};

/** Convert a raw JSON number using the spec for that field. */
function convertArchField(value: number, spec: ArchSpec, field: string, ctx: string): number {
  switch (spec) {
    case "m":     return to.m(value);
    case "kg":    return to.kg(value);
    case "N":     return to.N(value);
    case "W":     return to.W(value);
    case "J":     return to.J(value);
    case "s":     return to.s(value);
    case "Q":     return parseQ(value, field, ctx);
    case "plain": return Math.round(value);
  }
}

/** Parse a JSON CognitiveProfile object (all fields Q). */
function parseCognition(raw: unknown, ctx: string): CognitiveProfile {
  const obj = assertObj(raw, `${ctx}.cognition`);
  const fields = [
    "linguistic", "logicalMathematical", "spatial", "bodilyKinesthetic",
    "musical", "interpersonal", "intrapersonal", "naturalist", "interSpecies",
  ] as const;
  const result: Partial<CognitiveProfile> = {};
  for (const f of fields) {
    result[f] = parseQField(obj, f, `${ctx}.cognition`);
  }
  return result as CognitiveProfile;
}

// ── registerArchetype ─────────────────────────────────────────────────────────

/**
 * Parse a JSON archetype definition and register it in the catalog.
 *
 * @param json - Raw JSON value (e.g. from JSON.parse).  Must have:
 *   - `id` (string): unique catalog identifier
 *   - `base` (string, optional): name of a built-in archetype to inherit from
 *   - `overrides` (object, optional): field values to override in real SI units
 * @returns The converted Archetype object.
 * @throws If required fields are missing, values are out of range, or `id` already registered.
 */
export function registerArchetype(json: unknown): Archetype {
  const ctx = "registerArchetype";
  const obj = assertObj(json, ctx);

  const id = requireStr(obj, "id", ctx);
  if (_store.has(id)) throw new Error(`${ctx}: id "${id}" is already registered`);

  // Start from base archetype (all fields present)
  const baseName = optStr(obj, "base");
  const base: Archetype = baseName
    ? (ARCHETYPE_BASES[baseName] ?? (() => { throw new Error(`${ctx}: unknown base "${baseName}"`); })())
    : HUMAN_BASE;

  const result: Archetype = { ...base };

  // Apply overrides
  const rawOverrides = obj["overrides"];
  if (rawOverrides !== undefined) {
    const overrides = assertObj(rawOverrides, `${ctx}.overrides`);
    for (const [field, rawVal] of Object.entries(overrides)) {
      if (field === "cognition") continue;  // handled separately below
      const spec = ARCHETYPE_FIELD_SPEC[field];
      if (spec === undefined) throw new Error(`${ctx}: unknown archetype field "${field}"`);
      if (typeof rawVal !== "number")
        throw new Error(`${ctx}: override field "${field}" must be a number`);
      (result as unknown as Record<string, unknown>)[field] = convertArchField(rawVal, spec, field, ctx);
    }

    // Cognition override
    if (overrides["cognition"] !== undefined) {
      result.cognition = parseCognition(overrides["cognition"], ctx);
    }
  }

  _store.set(id, { kind: "archetype", id, archetype: result });
  return result;
}

// ── registerWeapon ────────────────────────────────────────────────────────────

/** Valid handedness strings. */
const VALID_HANDEDNESS = new Set(["oneHand", "twoHand", "mounted", "natural"]);

/**
 * Parse a JSON weapon definition and register it in the catalog.
 *
 * @param json - Raw JSON value. Required fields:
 *   - `id`, `name` (string)
 *   - `mass_kg` (real kg), `bulk` (Q 0..1)
 *   - `damage` (object with surfaceFrac, internalFrac, structuralFrac, bleedFactor, penetrationBias)
 * @returns The converted Weapon object.
 * @throws If required fields are missing or `id` already registered.
 */
export function registerWeapon(json: unknown): Weapon {
  const ctx = "registerWeapon";
  const obj = assertObj(json, ctx);

  const id   = requireStr(obj, "id",   ctx);
  const name = requireStr(obj, "name", ctx);
  if (_store.has(id)) throw new Error(`${ctx}: id "${id}" is already registered`);

  const mass_kg  = to.kg(requireNum(obj, "mass_kg", ctx)) as I32;
  const bulk     = parseQField(obj, "bulk", ctx);

  // Optional movement/handling fields
  const reach_m_raw     = optNum(obj, "reach_m");
  const readyTime_s_raw = optNum(obj, "readyTime_s");
  const handlingMul_raw = optNum(obj, "handlingMul");

  // Damage profile
  const dmgRaw = assertObj(obj["damage"], `${ctx}.damage`);
  const damage: WeaponDamageProfile = {
    surfaceFrac:     parseQField(dmgRaw, "surfaceFrac",     `${ctx}.damage`),
    internalFrac:    parseQField(dmgRaw, "internalFrac",    `${ctx}.damage`),
    structuralFrac:  parseQField(dmgRaw, "structuralFrac",  `${ctx}.damage`),
    bleedFactor:     parseQField(dmgRaw, "bleedFactor",     `${ctx}.damage`),
    penetrationBias: parseQField(dmgRaw, "penetrationBias", `${ctx}.damage`),
  };

  const weapon: Weapon = {
    kind: "weapon",
    id,
    name,
    mass_kg,
    bulk,
    damage,
    ...(reach_m_raw     !== undefined ? { reach_m:     to.m(reach_m_raw)      as I32 } : {}),
    ...(readyTime_s_raw !== undefined ? { readyTime_s:  to.s(readyTime_s_raw) as I32 } : {}),
    ...(handlingMul_raw !== undefined ? { handlingMul:  parseQ(handlingMul_raw, "handlingMul", ctx) } : {}),
  };

  // Optional extra fields
  const strikeEffMassFrac = optNum(obj, "strikeEffectiveMassFrac");
  const strikeSpeedMul    = optNum(obj, "strikeSpeedMul");
  const momentArm_m       = optNum(obj, "momentArm_m");
  const handlingLoadMul   = optNum(obj, "handlingLoadMul");
  const shieldBypassQ     = optNum(obj, "shieldBypassQ");
  const handedness        = optStr(obj, "handedness");

  if (strikeEffMassFrac !== undefined) weapon.strikeEffectiveMassFrac = parseQ(strikeEffMassFrac, "strikeEffectiveMassFrac", ctx);
  if (strikeSpeedMul    !== undefined) weapon.strikeSpeedMul          = parseQ(strikeSpeedMul,    "strikeSpeedMul",          ctx);
  if (momentArm_m       !== undefined) weapon.momentArm_m             = momentArm_m;
  if (handlingLoadMul   !== undefined) weapon.handlingLoadMul         = parseQ(handlingLoadMul,   "handlingLoadMul",         ctx);
  if (shieldBypassQ     !== undefined) weapon.shieldBypassQ           = parseQ(shieldBypassQ,     "shieldBypassQ",           ctx);
  if (handedness !== undefined) {
    if (!VALID_HANDEDNESS.has(handedness))
      throw new Error(`${ctx}: "handedness" must be one of ${[...VALID_HANDEDNESS].join("|")}, got "${handedness}"`);
    (weapon as { handedness?: string }).handedness = handedness;
  }

  _store.set(id, { kind: "weapon", id, weapon });
  return weapon;
}

// ── registerArmour ────────────────────────────────────────────────────────────

/** Map from JSON channel name strings to DamageChannel enum. */
const CHANNEL_MAP: Record<string, DamageChannel> = {
  Kinetic:          DamageChannel.Kinetic,
  Thermal:          DamageChannel.Thermal,
  Electrical:       DamageChannel.Electrical,
  Chemical:         DamageChannel.Chemical,
  Radiation:        DamageChannel.Radiation,
  Corrosive:        DamageChannel.Corrosive,
  Suffocation:      DamageChannel.Suffocation,
  ControlDisruption:DamageChannel.ControlDisruption,
  Energy:           DamageChannel.Energy,
};

/**
 * Parse a JSON armour definition and register it in the catalog.
 *
 * @param json - Raw JSON value. Required fields:
 *   - `id`, `name` (string)
 *   - `mass_kg` (real kg), `bulk` (Q 0..1)
 *   - `resist_J` (real Joules), `protectedDamageMul` (Q 0..1)
 *   - `coverageByRegion` (object mapping region name → Q 0..1)
 * @returns The converted Armour object.
 * @throws If required fields are missing or `id` already registered.
 */
export function registerArmour(json: unknown): Armour {
  const ctx = "registerArmour";
  const obj = assertObj(json, ctx);

  const id   = requireStr(obj, "id",   ctx);
  const name = requireStr(obj, "name", ctx);
  if (_store.has(id)) throw new Error(`${ctx}: id "${id}" is already registered`);

  const mass_kg           = to.kg(requireNum(obj, "mass_kg",           ctx)) as I32;
  const bulk              = parseQField(obj, "bulk",              ctx);
  const resist_J          = to.J(requireNum(obj, "resist_J",          ctx)) as I32;
  const protectedDamageMul = parseQField(obj, "protectedDamageMul", ctx);

  // protects: array of channel name strings → ChannelMask
  let protects = 0;
  const protectsRaw = obj["protects"];
  if (Array.isArray(protectsRaw)) {
    for (const ch of protectsRaw) {
      if (typeof ch !== "string") throw new Error(`${ctx}: "protects" array must contain strings`);
      const ch_enum = CHANNEL_MAP[ch];
      if (ch_enum === undefined)
        throw new Error(`${ctx}: unknown damage channel "${ch}" in "protects"`);
      protects = channelMask(ch_enum) | protects;
    }
  } else {
    // Default: Kinetic only
    protects = channelMask(DamageChannel.Kinetic);
  }

  // coverageByRegion: object of region → Q
  const coverageRaw = assertObj(obj["coverageByRegion"], `${ctx}.coverageByRegion`);
  const coverageByRegion: Armour["coverageByRegion"] = {};
  for (const [region, val] of Object.entries(coverageRaw)) {
    if (typeof val !== "number")
      throw new Error(`${ctx}.coverageByRegion: region "${region}" value must be a number`);
    (coverageByRegion as Record<string, Q>)[region] = parseQ(val, region, `${ctx}.coverageByRegion`);
  }

  const armour: Armour = {
    kind: "armour",
    id,
    name,
    mass_kg,
    bulk,
    resist_J,
    protectedDamageMul,
    protects,
    coverageByRegion,
  };

  // Optional fields
  const mobilityMul      = optQField(obj, "mobilityMul",   ctx);
  const fatigueMul       = optQField(obj, "fatigueMul",    ctx);
  const reflectivity     = optQField(obj, "reflectivity",  ctx);
  const ablative         = optBool(obj, "ablative");
  const insulation_m2KW  = optNum(obj, "insulation_m2KW");

  if (mobilityMul     !== undefined) armour.mobilityMul     = mobilityMul;
  if (fatigueMul      !== undefined) armour.fatigueMul      = fatigueMul;
  if (reflectivity    !== undefined) armour.reflectivity    = reflectivity;
  if (ablative        !== undefined) armour.ablative        = ablative;
  if (insulation_m2KW !== undefined) armour.insulation_m2KW = insulation_m2KW;

  _store.set(id, { kind: "armour", id, armour });
  return armour;
}

// ── getCatalogEntry ───────────────────────────────────────────────────────────

/**
 * Look up a registered entry by id.
 * Returns the CatalogEntry or undefined if not found.
 */
export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return _store.get(id);
}

/**
 * Return all registered ids of the given kind, or all ids when kind is omitted.
 */
export function listCatalog(kind?: CatalogKind): string[] {
  if (kind === undefined) return [..._store.keys()];
  return [..._store.entries()].filter(([, e]) => e.kind === kind).map(([id]) => id);
}

/**
 * Remove a registered entry.  Useful in tests.
 * Returns true if the entry existed and was removed.
 */
export function unregisterCatalogEntry(id: string): boolean {
  return _store.delete(id);
}

/**
 * Remove all registered entries.  Useful for resetting state in tests.
 */
export function clearCatalog(): void {
  _store.clear();
}
