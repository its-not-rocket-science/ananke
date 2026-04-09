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
import { createHash }                                         from "node:crypto";

// ── Runtime version constant ─────────────────────────────────────────────────────

export { ANANKE_ENGINE_VERSION } from "./version.js";
import { ANANKE_ENGINE_VERSION } from "./version.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single actionable validation failure from `validatePack`. */
export interface PackValidationError {
  /** JSONPath-style location, e.g. `"$.weapons[2].mass_kg"`. */
  path:    string;
  /** Human-readable explanation of what is wrong. */
  message: string;
}

/** Stability tier for a content pack — controls how it is listed in a registry. */
export type PackStabilityTier = "stable" | "experimental" | "internal";

/** Dataset or paper reference for empirically grounded pack content. */
export interface PackProvenanceRef {
  /** Short description of the source. */
  title:   string;
  /** URL of the source, if available. */
  url?:    string;
  /** DOI of the source, if applicable. */
  doi?:    string;
  /** Free-text notes about what this source grounds. */
  notes?:  string;
}

/**
 * Registry metadata block — optional top-level section of a pack manifest.
 *
 * Including a `registry` block enables:
 * - Runtime compatibility checking via `compatRange`
 * - Deterministic integrity verification via `checksum` (SHA-256)
 * - Licensing and provenance attestation for empirical content
 *
 * Generate the checksum with:
 *   `npx ananke pack bundle <dir>`  (embeds it automatically)
 *
 * or manually with `computePackChecksum(manifest)` from `@ananke/content-pack`.
 */
export interface PackRegistryMeta {
  /**
   * Semver range of Ananke engine versions this pack targets.
   * Examples: `">=0.1.50"`, `">=0.1 <0.2"`, `"^0.1.60"`.
   * `validatePack` rejects packs whose `compatRange` excludes the running version.
   */
  compatRange?:     string;
  /** Stability guarantee — governs how the pack appears in a public registry. */
  stabilityTier?:   PackStabilityTier;
  /**
   * Subpath exports from `@its-not-rocket-science/ananke` that this pack's
   * content references, e.g. `["./combat", "./catalog"]`.
   * Informational only — not enforced at runtime.
   */
  requiredExports?: string[];
  /**
   * SHA-256 hex digest of the pack JSON (with `registry.checksum` set to `""`
   * before hashing, so the field is present but blank).
   * Compute with `npx ananke pack bundle` or `computePackChecksum`.
   */
  checksum?:        string;
  /** SPDX license identifier, e.g. `"MIT"`, `"CC-BY-4.0"`. */
  license?:         string;
  /**
   * Dataset or paper references for empirically grounded pack content.
   * Include when your pack derives parameters from research data.
   */
  provenance?:      PackProvenanceRef[];
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
   * @deprecated since 0.1.65 — use `registry.compatRange` instead. Removes at 0.3.0.
   */
  anankeVersion?: string;
  /**
   * Registry metadata — compatibility, checksum, license, and provenance.
   * `registry.compatRange` is enforced at runtime by `validatePack`.
   */
  registry?:    PackRegistryMeta;
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

// ── Semver utilities ──────────────────────────────────────────────────────────
// Lightweight range evaluator — no external dependencies.
// Supports: >=X.Y.Z  >X.Y.Z  <=X.Y.Z  <X.Y.Z  =X.Y.Z  ^X.Y.Z  ~X.Y.Z
// Short forms X.Y and X treated as X.Y.0 and X.0.0 respectively.
// Compound ranges (space-separated) require all constraints to match.

function parseSemverTuple(v: string): [number, number, number] | null {
  const raw = v.trim().replace(/^v/, "");
  if (!/^\d+(\.\d+){0,2}$/.test(raw)) return null;
  const parts = raw.split(".").map(Number);
  const [major = 0, minor = 0, patch = 0] = parts;
  return [major, minor, patch];
}

function cmpSemver(a: [number, number, number], b: [number, number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

/**
 * Test whether `version` satisfies `range`.
 * Returns `false` if the range string is unparseable.
 */
export function semverSatisfies(version: string, range: string): boolean {
  const ver = parseSemverTuple(version);
  if (!ver) return false;

  const trimmed = range.trim();
  if (trimmed.length === 0) return false;
  const constraints = trimmed.split(/\s+/);
  for (const constraint of constraints) {
    if (constraint.length === 0) return false;
    if (!evalConstraint(ver, constraint.trim())) return false;
  }
  return true;
}

function isSemverRange(range: string): boolean {
  const trimmed = range.trim();
  if (trimmed.length === 0) return false;
  const constraints = trimmed.split(/\s+/);
  for (const constraint of constraints) {
    if (constraint.length === 0) return false;
    if (constraint.startsWith("^") || constraint.startsWith("~")) {
      if (parseSemverTuple(constraint.slice(1)) === null) return false;
      continue;
    }
    if (
      constraint.startsWith(">=") ||
      constraint.startsWith("<=") ||
      constraint.startsWith(">") ||
      constraint.startsWith("<") ||
      constraint.startsWith("=")
    ) {
      const offset = constraint.startsWith(">=") || constraint.startsWith("<=") ? 2 : 1;
      if (parseSemverTuple(constraint.slice(offset)) === null) return false;
      continue;
    }
    if (parseSemverTuple(constraint) === null) return false;
  }
  return true;
}

function evalConstraint(ver: [number, number, number], c: string): boolean {
  // Caret: ^X.Y.Z — compatible within the leftmost non-zero component.
  // ^1.2.3 → >=1.2.3 <2.0.0 (major locked when major > 0)
  // ^0.2.3 → >=0.2.3 <0.3.0 (minor locked when major == 0, minor > 0)
  // ^0.0.3 → >=0.0.3 <0.0.4 (patch locked when both major and minor == 0)
  if (c.startsWith("^")) {
    const lo = parseSemverTuple(c.slice(1));
    if (!lo) return false;
    let hi: [number, number, number];
    if (lo[0] > 0)      hi = [lo[0] + 1, 0, 0];
    else if (lo[1] > 0) hi = [0, lo[1] + 1, 0];
    else                hi = [0, 0, lo[2] + 1];
    return cmpSemver(ver, lo) >= 0 && cmpSemver(ver, hi) < 0;
  }
  // Tilde: ~X.Y.Z → >=X.Y.Z <X.(Y+1).0
  if (c.startsWith("~")) {
    const lo = parseSemverTuple(c.slice(1));
    if (!lo) return false;
    const hi: [number, number, number] = [lo[0], lo[1] + 1, 0];
    return cmpSemver(ver, lo) >= 0 && cmpSemver(ver, hi) < 0;
  }
  // Comparators
  if (c.startsWith(">=")) {
    const t = parseSemverTuple(c.slice(2));
    return t !== null && cmpSemver(ver, t) >= 0;
  }
  if (c.startsWith(">")) {
    const t = parseSemverTuple(c.slice(1));
    return t !== null && cmpSemver(ver, t) > 0;
  }
  if (c.startsWith("<=")) {
    const t = parseSemverTuple(c.slice(2));
    return t !== null && cmpSemver(ver, t) <= 0;
  }
  if (c.startsWith("<")) {
    const t = parseSemverTuple(c.slice(1));
    return t !== null && cmpSemver(ver, t) < 0;
  }
  if (c.startsWith("=")) {
    const t = parseSemverTuple(c.slice(1));
    return t !== null && cmpSemver(ver, t) === 0;
  }
  // Bare version: exact match
  const t = parseSemverTuple(c);
  return t !== null && cmpSemver(ver, t) === 0;
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
    parseSemverTuple(m["version"] as string) === null
  ) {
    errors.push({ path: "$.version", message: 'must be a semver string like "1.0.0" or "1.0"' });
  }

  if (m["anankeVersion"] !== undefined) {
    if (typeof m["anankeVersion"] !== "string") {
      errors.push({ path: "$.anankeVersion", message: "must be a semver range string" });
    } else if (!isSemverRange(m["anankeVersion"] as string)) {
      errors.push({ path: "$.anankeVersion", message: "must be a valid semver range expression" });
    } else if (!semverSatisfies(ANANKE_ENGINE_VERSION, m["anankeVersion"] as string)) {
      errors.push({
        path: "$.anankeVersion",
        message: `engine version ${ANANKE_ENGINE_VERSION} does not satisfy range "${m["anankeVersion"] as string}"`,
      });
    }
  }

  // Optional: registry block
  if (m["registry"] !== undefined) {
    if (typeof m["registry"] !== "object" || m["registry"] === null || Array.isArray(m["registry"])) {
      errors.push({ path: "$.registry", message: "must be a plain object if present" });
    } else {
      const reg = m["registry"] as Record<string, unknown>;

      // compatRange — semver range string; must include the running engine version
      if (reg["compatRange"] !== undefined) {
        if (typeof reg["compatRange"] !== "string") {
          errors.push({ path: "$.registry.compatRange", message: "must be a string" });
        } else if (!isSemverRange(reg["compatRange"] as string)) {
          errors.push({ path: "$.registry.compatRange", message: "must be a valid semver range expression" });
        } else if (!semverSatisfies(ANANKE_ENGINE_VERSION, reg["compatRange"] as string)) {
          errors.push({
            path:    "$.registry.compatRange",
            message: `engine version ${ANANKE_ENGINE_VERSION} does not satisfy range "${reg["compatRange"] as string}"`,
          });
        }
      }

      // stabilityTier — must be one of the known tiers
      const TIERS: PackStabilityTier[] = ["stable", "experimental", "internal"];
      if (reg["stabilityTier"] !== undefined && !TIERS.includes(reg["stabilityTier"] as PackStabilityTier)) {
        errors.push({
          path:    "$.registry.stabilityTier",
          message: `must be one of: ${TIERS.join(", ")}`,
        });
      }

      // requiredExports — must be array of strings
      if (reg["requiredExports"] !== undefined) {
        if (!Array.isArray(reg["requiredExports"])) {
          errors.push({ path: "$.registry.requiredExports", message: "must be an array" });
        } else {
          for (let i = 0; i < (reg["requiredExports"] as unknown[]).length; i++) {
            if (typeof (reg["requiredExports"] as unknown[])[i] !== "string") {
              errors.push({ path: `$.registry.requiredExports[${i}]`, message: "must be a string" });
            }
          }
        }
      }

      // checksum — must be a 64-char hex string (SHA-256) if present
      if (reg["checksum"] !== undefined) {
        if (typeof reg["checksum"] !== "string" || !/^[0-9a-f]{64}$/.test(reg["checksum"] as string)) {
          errors.push({ path: "$.registry.checksum", message: "must be a 64-character lowercase hex string (SHA-256)" });
        }
      }

      // license — must be a non-empty string
      if (reg["license"] !== undefined && (typeof reg["license"] !== "string" || (reg["license"] as string).trim() === "")) {
        errors.push({ path: "$.registry.license", message: "must be a non-empty SPDX identifier string" });
      }

      // provenance — must be array of objects with at least a title
      if (reg["provenance"] !== undefined) {
        if (!Array.isArray(reg["provenance"])) {
          errors.push({ path: "$.registry.provenance", message: "must be an array" });
        } else {
          for (let i = 0; i < (reg["provenance"] as unknown[]).length; i++) {
            const ref = (reg["provenance"] as unknown[])[i];
            if (typeof ref !== "object" || ref === null) {
              errors.push({ path: `$.registry.provenance[${i}]`, message: "must be an object" });
            } else if (typeof (ref as Record<string, unknown>)["title"] !== "string") {
              errors.push({ path: `$.registry.provenance[${i}].title`, message: "must be a string" });
            }
          }
        }
      }
    }
  }

  // Optional arrays — must be arrays if present
  for (const key of ["weapons", "armour", "archetypes", "scenarios"]) {
    if (m[key] !== undefined && !Array.isArray(m[key])) {
      errors.push({ path: `$.${key}`, message: "must be an array if present" });
    }
  }

  // Validate weapon entries
  if (Array.isArray(m["weapons"])) {
    const ids = new Set<string>();
    for (let i = 0; i < (m["weapons"] as unknown[]).length; i++) {
      const w = (m["weapons"] as unknown[])[i];
      errors.push(...validateWeaponEntry(w, i));
      if (typeof w === "object" && w !== null) {
        const id = (w as Record<string, unknown>)["id"];
        if (typeof id === "string") {
          if (ids.has(id)) errors.push({ path: `$.weapons[${i}].id`, message: `duplicate weapon id "${id}"` });
          ids.add(id);
        }
      }
    }
  }

  // Validate armour entries
  if (Array.isArray(m["armour"])) {
    const ids = new Set<string>();
    for (let i = 0; i < (m["armour"] as unknown[]).length; i++) {
      const a = (m["armour"] as unknown[])[i];
      errors.push(...validateArmourEntry(a, i));
      if (typeof a === "object" && a !== null) {
        const id = (a as Record<string, unknown>)["id"];
        if (typeof id === "string") {
          if (ids.has(id)) errors.push({ path: `$.armour[${i}].id`, message: `duplicate armour id "${id}"` });
          ids.add(id);
        }
      }
    }
  }

  // Validate archetype entries (minimal — full validation is in registerArchetype)
  if (Array.isArray(m["archetypes"])) {
    const ids = new Set<string>();
    for (let i = 0; i < (m["archetypes"] as unknown[]).length; i++) {
      const arch = (m["archetypes"] as unknown[])[i];
      if (typeof arch !== "object" || arch === null) {
        errors.push({ path: `$.archetypes[${i}]`, message: "must be an object" });
        continue;
      }
      const o = arch as Record<string, unknown>;
      if (typeof o["id"] !== "string" || (o["id"] as string).trim() === "") {
        errors.push({ path: `$.archetypes[${i}].id`, message: "must be a non-empty string" });
      } else {
        if (ids.has(o["id"] as string)) errors.push({ path: `$.archetypes[${i}].id`, message: `duplicate archetype id "${o["id"] as string}"` });
        ids.add(o["id"] as string);
      }
    }
  }

  // Validate scenario entries via existing validateScenario
  if (Array.isArray(m["scenarios"])) {
    const ids = new Set<string>();
    for (let i = 0; i < (m["scenarios"] as unknown[]).length; i++) {
      const scenario = (m["scenarios"] as unknown[])[i];
      if (typeof scenario === "object" && scenario !== null) {
        const id = (scenario as Record<string, unknown>)["id"];
        if (typeof id === "string") {
          if (ids.has(id)) errors.push({ path: `$.scenarios[${i}].id`, message: `duplicate scenario id "${id}"` });
          ids.add(id);
        }
      }
      const scenErrors = validateScenario(scenario);
      for (const msg of scenErrors) {
        errors.push({ path: `$.scenarios[${i}]`, message: msg });
      }
    }
  }

  const checksum = (m["registry"] as Record<string, unknown> | undefined)?.["checksum"];
  if (typeof checksum === "string" && /^[0-9a-f]{64}$/.test(checksum)) {
    const computed = computePackChecksum(m as AnankePackManifest);
    if (computed !== checksum) {
      errors.push({
        path: "$.registry.checksum",
        message: `checksum mismatch: expected "${checksum}" but computed "${computed}"`,
      });
    }
  }

  return errors;
}

/** Compute SHA-256 for a manifest's canonical JSON with `registry.checksum` blanked. */
export function computePackChecksum(manifest: AnankePackManifest): string {
  const clone = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
  const registry = clone["registry"];
  if (typeof registry === "object" && registry !== null && !Array.isArray(registry)) {
    (registry as Record<string, unknown>)["checksum"] = "";
  }
  return createHash("sha256").update(JSON.stringify(clone)).digest("hex");
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
  const fingerprint = hashMod(manifest as unknown as Record<string, unknown>);

  // Already loaded — return stored summary
  const existing = _packs.get(packId);
  if (existing !== undefined) {
    if (existing.fingerprint !== fingerprint) {
      return {
        packId,
        registeredIds: [],
        scenarioIds: [],
        fingerprint: existing.fingerprint,
        errors: [{
          path: "$",
          message: `pack "${packId}" already loaded with different content fingerprint (${existing.fingerprint} != ${fingerprint})`,
        }],
      };
    }
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

  if (loadErrors.length > 0) {
    return { packId, registeredIds, scenarioIds: [], fingerprint, errors: loadErrors };
  }

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
