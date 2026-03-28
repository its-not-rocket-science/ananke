// src/content-pack.ts — PA-4: Scenario & Content Pack System
//
// Runtime loader for `.ananke-pack` JSON manifests.  A content pack can
// add weapons, armour, archetypes, and scenarios to the active catalogues
// without touching source code.
//
// Integration pattern:
//   const manifest = JSON.parse(fs.readFileSync("weapons-medieval.json", "utf8"));
//   const result   = loadPack(manifest);
//   if (result.errors.length > 0) throw new Error(result.errors[0]!.message);
//   // catalog now contains the new weapons

import { registerWeapon, registerArmour, registerArchetype } from "./catalog.js";
import { validateScenario, loadScenario }                     from "./scenario.js";
import { hashMod }                                            from "./modding.js";
import { registerWorldArchetype, registerWorldItem }          from "./world-factory.js";
import type { WorldState }                                    from "./sim/world.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single actionable validation failure from `validatePack`. */
export interface PackValidationError {
  /** JSONPath-style location, e.g. `"$.weapons[2].mass_kg"`. */
  path:    string;
  /** Human-readable explanation of what is wrong. */
  message: string;
}

/**
 * The `.ananke-pack` manifest schema.
 *
 * All numeric fields in `weapons`, `armour`, and `archetypes` use real-world
 * SI units (kg, m, J, s) and Q ratios in [0, 1].  See `docs/wire-protocol.md`
 * for the full serialisation contract.
 */
export interface AnankePackManifest {
  /** Optional link to `schema/pack.schema.json` for editor tooling. */
  $schema?:     string;
  /** Unique pack name (kebab-case recommended), e.g. `"weapons-medieval"`. */
  name:         string;
  /** Semantic version string, e.g. `"1.0.0"`. */
  version:      string;
  /** Human-readable summary. */
  description?: string;
  /**
   * Minimum Ananke version required, as a semver range string.
   * Used for documentation only — not enforced at runtime in v0.1.
   */
  anankeVersion?: string;
  /** Weapon definitions — each passed to `registerWeapon`. */
  weapons?:     unknown[];
  /** Armour definitions — each passed to `registerArmour`. */
  armour?:      unknown[];
  /** Archetype definitions — each passed to `registerArchetype`. */
  archetypes?:  unknown[];
  /**
   * Scenario definitions — stored in the pack registry and retrievable via
   * `getPackScenario`.  NOT loaded into the catalog (scenarios have no global
   * registry); instantiate on demand with `instantiatePackScenario`.
   */
  scenarios?:   unknown[];
}

/** Result of a `loadPack` call. */
export interface LoadPackResult {
  /**
   * Canonical pack identifier: `"${name}@${version}"`.
   * Use this as the first argument to `getPackScenario`.
   */
  packId:        string;
  /**
   * IDs of all catalog entries registered, prefixed by kind.
   * e.g. `["weapon:medieval_longsword", "armour:medieval_gambeson"]`.
   */
  registeredIds: string[];
  /** IDs of all scenarios stored in the pack registry. */
  scenarioIds:   string[];
  /** 8-character hex fingerprint of the manifest (FNV-1a over canonical JSON). */
  fingerprint:   string;
  /** Validation and registration errors.  Empty on full success. */
  errors:        PackValidationError[];
}

// ── Internal registry ─────────────────────────────────────────────────────────

interface PackEntry {
  manifest:      AnankePackManifest;
  registeredIds: string[];
  scenarioIds:   string[];
  fingerprint:   string;
  /** Scenario JSON by scenario id. */
  scenarios:     Map<string, unknown>;
}

const _packs = new Map<string, PackEntry>();

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a pack manifest for structural conformance without loading it.
 *
 * Checks required top-level fields, array element shapes, and runs
 * `validateScenario` on each scenario entry.
 *
 * @returns Array of `PackValidationError`.  Empty means valid.
 */
export function validatePack(manifest: unknown): PackValidationError[] {
  const errors: PackValidationError[] = [];

  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    errors.push({ path: "$", message: "pack manifest must be a plain object" });
    return errors;
  }

  const m = manifest as Record<string, unknown>;

  // Required: name
  if (typeof m["name"] !== "string" || (m["name"] as string).trim() === "") {
    errors.push({ path: "$.name", message: "must be a non-empty string" });
  }

  // Required: version (semver-ish)
  if (
    typeof m["version"] !== "string" ||
    !/^\d+\.\d+(\.\d+)?$/.test(m["version"] as string)
  ) {
    errors.push({ path: "$.version", message: 'must be a semver string like "1.0.0" or "1.0"' });
  }

  // Optional arrays — must be arrays if present
  for (const key of ["weapons", "armour", "archetypes", "scenarios"]) {
    if (m[key] !== undefined && !Array.isArray(m[key])) {
      errors.push({ path: `$.${key}`, message: "must be an array if present" });
    }
  }

  // Validate weapon entries
  if (Array.isArray(m["weapons"])) {
    for (let i = 0; i < (m["weapons"] as unknown[]).length; i++) {
      const w = (m["weapons"] as unknown[])[i];
      errors.push(...validateWeaponEntry(w, i));
    }
  }

  // Validate armour entries
  if (Array.isArray(m["armour"])) {
    for (let i = 0; i < (m["armour"] as unknown[]).length; i++) {
      const a = (m["armour"] as unknown[])[i];
      errors.push(...validateArmourEntry(a, i));
    }
  }

  // Validate archetype entries (minimal — full validation is in registerArchetype)
  if (Array.isArray(m["archetypes"])) {
    for (let i = 0; i < (m["archetypes"] as unknown[]).length; i++) {
      const arch = (m["archetypes"] as unknown[])[i];
      if (typeof arch !== "object" || arch === null) {
        errors.push({ path: `$.archetypes[${i}]`, message: "must be an object" });
        continue;
      }
      const o = arch as Record<string, unknown>;
      if (typeof o["id"] !== "string" || (o["id"] as string).trim() === "") {
        errors.push({ path: `$.archetypes[${i}].id`, message: "must be a non-empty string" });
      }
    }
  }

  // Validate scenario entries via existing validateScenario
  if (Array.isArray(m["scenarios"])) {
    for (let i = 0; i < (m["scenarios"] as unknown[]).length; i++) {
      const scenErrors = validateScenario((m["scenarios"] as unknown[])[i]);
      for (const msg of scenErrors) {
        errors.push({ path: `$.scenarios[${i}]`, message: msg });
      }
    }
  }

  return errors;
}

function validateWeaponEntry(w: unknown, i: number): PackValidationError[] {
  const errors: PackValidationError[] = [];
  if (typeof w !== "object" || w === null) {
    errors.push({ path: `$.weapons[${i}]`, message: "must be an object" });
    return errors;
  }
  const o = w as Record<string, unknown>;
  if (typeof o["id"] !== "string" || (o["id"] as string).trim() === "") {
    errors.push({ path: `$.weapons[${i}].id`, message: "must be a non-empty string" });
  }
  if (typeof o["name"] !== "string") {
    errors.push({ path: `$.weapons[${i}].name`, message: "must be a string" });
  }
  if (typeof o["mass_kg"] !== "number" || (o["mass_kg"] as number) <= 0) {
    errors.push({ path: `$.weapons[${i}].mass_kg`, message: "must be a positive number (real-world kg)" });
  }
  if (typeof o["damage"] !== "object" || o["damage"] === null) {
    errors.push({ path: `$.weapons[${i}].damage`, message: "must be an object" });
  }
  return errors;
}

function validateArmourEntry(a: unknown, i: number): PackValidationError[] {
  const errors: PackValidationError[] = [];
  if (typeof a !== "object" || a === null) {
    errors.push({ path: `$.armour[${i}]`, message: "must be an object" });
    return errors;
  }
  const o = a as Record<string, unknown>;
  if (typeof o["id"] !== "string" || (o["id"] as string).trim() === "") {
    errors.push({ path: `$.armour[${i}].id`, message: "must be a non-empty string" });
  }
  if (typeof o["name"] !== "string") {
    errors.push({ path: `$.armour[${i}].name`, message: "must be a string" });
  }
  if (typeof o["mass_kg"] !== "number" || (o["mass_kg"] as number) <= 0) {
    errors.push({ path: `$.armour[${i}].mass_kg`, message: "must be a positive number (real-world kg)" });
  }
  if (typeof o["resist_J"] !== "number" || (o["resist_J"] as number) <= 0) {
    errors.push({ path: `$.armour[${i}].resist_J`, message: "must be a positive number (real-world Joules)" });
  }
  return errors;
}

// ── Load ──────────────────────────────────────────────────────────────────────

/**
 * Validate and load a pack manifest into the active catalogues.
 *
 * - Weapons, armour, and archetypes are registered into the global catalog.
 * - Scenarios are stored in the pack registry; retrieve with `getPackScenario`.
 * - If `validatePack` reports errors the pack is NOT loaded and `errors` is
 *   populated in the result.
 * - Loading a pack with the same `name@version` id a second time is a no-op
 *   (returns the original result with `errors` empty).
 */
export function loadPack(manifest: AnankePackManifest): LoadPackResult {
  const packId = `${manifest.name}@${manifest.version}`;

  // Already loaded — return stored summary
  const existing = _packs.get(packId);
  if (existing !== undefined) {
    return {
      packId,
      registeredIds: existing.registeredIds,
      scenarioIds:   existing.scenarioIds,
      fingerprint:   existing.fingerprint,
      errors:        [],
    };
  }

  // Validate first
  const errors = validatePack(manifest);
  if (errors.length > 0) {
    return { packId, registeredIds: [], scenarioIds: [], fingerprint: "", errors };
  }

  const registeredIds: string[]  = [];
  const loadErrors: PackValidationError[] = [];

  // Register weapons — into both the catalog and the world-factory lookup table
  for (const w of manifest.weapons ?? []) {
    try {
      const weapon = registerWeapon(w);
      const id = weapon.id;
      registerWorldItem(id, weapon);
      registeredIds.push(`weapon:${id}`);
    } catch (e) {
      loadErrors.push({ path: "$.weapons", message: String(e) });
    }
  }

  // Register armour — into both the catalog and the world-factory lookup table
  for (const a of manifest.armour ?? []) {
    try {
      const armour = registerArmour(a);
      const id = armour.id;
      registerWorldItem(id, armour);
      registeredIds.push(`armour:${id}`);
    } catch (e) {
      loadErrors.push({ path: "$.armour", message: String(e) });
    }
  }

  // Register archetypes — into both the catalog and the world-factory lookup table
  for (const arch of manifest.archetypes ?? []) {
    try {
      const archetype = registerArchetype(arch);
      const id = (arch as Record<string, unknown>)["id"] as string;
      registerWorldArchetype(id, archetype);
      registeredIds.push(`archetype:${id}`);
    } catch (e) {
      loadErrors.push({ path: "$.archetypes", message: String(e) });
    }
  }

  // Store scenarios (not in global catalog — retrieved on demand)
  const scenarioMap  = new Map<string, unknown>();
  const scenarioIds: string[] = [];
  for (const scen of manifest.scenarios ?? []) {
    const id = (scen as Record<string, unknown>)["id"] as string;
    scenarioMap.set(id, scen);
    scenarioIds.push(id);
  }

  const fingerprint = hashMod(manifest as unknown as Record<string, unknown>);

  _packs.set(packId, {
    manifest,
    registeredIds,
    scenarioIds,
    fingerprint,
    scenarios: scenarioMap,
  });

  return { packId, registeredIds, scenarioIds, fingerprint, errors: loadErrors };
}

// ── Query API ─────────────────────────────────────────────────────────────────

/** Returns the pack registry entry for a previously-loaded pack, or `undefined`. */
export function getLoadedPack(packId: string): LoadPackResult | undefined {
  const e = _packs.get(packId);
  if (e === undefined) return undefined;
  return {
    packId,
    registeredIds: e.registeredIds,
    scenarioIds:   e.scenarioIds,
    fingerprint:   e.fingerprint,
    errors:        [],
  };
}

/** Returns the `"name@version"` ids of all currently loaded packs. */
export function listLoadedPacks(): string[] {
  return [..._packs.keys()];
}

/**
 * Returns the raw scenario JSON stored in a pack.
 *
 * @param packId    — `"name@version"` as returned by `loadPack`.
 * @param scenarioId — the scenario's `id` field.
 */
export function getPackScenario(packId: string, scenarioId: string): unknown | undefined {
  return _packs.get(packId)?.scenarios.get(scenarioId);
}

/**
 * Instantiate a packed scenario into a live `WorldState`.
 *
 * Equivalent to `loadScenario(getPackScenario(packId, scenarioId))`.
 * Throws if the pack or scenario does not exist.
 */
export function instantiatePackScenario(packId: string, scenarioId: string): WorldState {
  const scen = getPackScenario(packId, scenarioId);
  if (scen === undefined) {
    throw new Error(`instantiatePackScenario: scenario "${scenarioId}" not found in pack "${packId}"`);
  }
  return loadScenario(scen);
}

/**
 * Remove all entries from the pack registry.
 * Does NOT un-register catalog entries — call `clearCatalog()` separately if needed.
 * Primarily for testing.
 */
export function clearPackRegistry(): void {
  _packs.clear();
}
