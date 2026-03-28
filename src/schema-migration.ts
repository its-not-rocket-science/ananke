// src/schema-migration.ts — PA-3: Stable Schema, Save & Wire Contract
//
// Provides schema versioning, structural validation, and migration utilities
// for WorldState snapshots, Campaign saves, and Replay files.
//
// Usage pattern:
//   const raw = JSON.parse(saveFile);
//   const migrated = migrateWorld(raw);
//   const errors = validateSnapshot(migrated);
//   if (errors.length === 0) stepWorld(migrated as WorldState, commands);

// ── Version ───────────────────────────────────────────────────────────────────

/**
 * Current schema major.minor version.
 *
 * Patch releases (0.1.x → 0.1.y) never change the schema.
 * Minor releases (0.1.x → 0.2.0) may add optional fields (non-breaking).
 * Major releases (0.x → 1.0.0) may alter required fields (breaking; migration required).
 */
export const SCHEMA_VERSION = "0.1";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Schema discrimination tag added by `stampSnapshot`. */
export type SchemaKind = "world" | "replay" | "campaign";

/**
 * Metadata fields stamped onto a persisted snapshot.
 * Present on any object returned by `stampSnapshot`.
 */
export interface VersionedSnapshot {
  /** Schema version at save time, e.g. `"0.1"`. */
  _ananke_version: string;
  /** Which schema this snapshot conforms to. */
  _schema: SchemaKind;
}

/**
 * A single actionable validation failure.
 *
 * `path` uses JSONPath dot-notation, e.g. `"$.entities[2].id"`.
 */
export interface ValidationError {
  path:    string;
  message: string;
}

// ── Stamp ─────────────────────────────────────────────────────────────────────

/**
 * Add `_ananke_version` and `_schema` metadata to a snapshot before persisting.
 *
 * Does not mutate the original object.
 *
 * @example
 * const save = JSON.stringify(stampSnapshot(world, "world"));
 */
export function stampSnapshot<T extends Record<string, unknown>>(
  snapshot: T,
  schema: SchemaKind,
): T & VersionedSnapshot {
  return {
    ...snapshot,
    _ananke_version: SCHEMA_VERSION,
    _schema:         schema,
  };
}

// ── Validate ──────────────────────────────────────────────────────────────────

/**
 * Check structural conformance of a deserialized world snapshot.
 *
 * Validates only the `@core` fields that `stepWorld` requires.  Subsystem
 * fields are not validated — unknown extra fields are silently permitted
 * (hosts may attach extension data).
 *
 * @returns An array of `ValidationError`.  An empty array means valid.
 */
export function validateSnapshot(snapshot: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    errors.push({ path: "$", message: "must be a plain object" });
    return errors;
  }

  const s = snapshot as Record<string, unknown>;

  // tick
  if (typeof s["tick"] !== "number" || !Number.isInteger(s["tick"]) || s["tick"] < 0) {
    errors.push({ path: "$.tick", message: "must be a non-negative integer" });
  }

  // seed
  if (typeof s["seed"] !== "number" || !Number.isInteger(s["seed"])) {
    errors.push({ path: "$.seed", message: "must be an integer" });
  }

  // entities
  if (!Array.isArray(s["entities"])) {
    errors.push({ path: "$.entities", message: "must be an array" });
  } else {
    for (let i = 0; i < s["entities"].length; i++) {
      const e: unknown = s["entities"][i];
      if (typeof e !== "object" || e === null || Array.isArray(e)) {
        errors.push({ path: `$.entities[${i}]`, message: "must be a plain object" });
        continue;
      }
      const ent = e as Record<string, unknown>;

      if (typeof ent["id"] !== "number" || !Number.isInteger(ent["id"]) || ent["id"] < 0) {
        errors.push({ path: `$.entities[${i}].id`, message: "must be a non-negative integer" });
      }
      if (typeof ent["teamId"] !== "number" || !Number.isInteger(ent["teamId"])) {
        errors.push({ path: `$.entities[${i}].teamId`, message: "must be an integer" });
      }
      if (typeof ent["attributes"] !== "object" || ent["attributes"] === null) {
        errors.push({ path: `$.entities[${i}].attributes`, message: "must be an object" });
      }
      if (typeof ent["energy"] !== "object" || ent["energy"] === null) {
        errors.push({ path: `$.entities[${i}].energy`, message: "must be an object" });
      }
      if (typeof ent["loadout"] !== "object" || ent["loadout"] === null) {
        errors.push({ path: `$.entities[${i}].loadout`, message: "must be an object" });
      }
      if (!Array.isArray(ent["traits"])) {
        errors.push({ path: `$.entities[${i}].traits`, message: "must be an array" });
      }
    }
  }

  return errors;
}

// ── Migration ─────────────────────────────────────────────────────────────────

type MigrationFn = (snapshot: Record<string, unknown>) => Record<string, unknown>;

/** Internal registry: `"from->to"` → migration function. */
const MIGRATIONS = new Map<string, MigrationFn>();

/**
 * Register a migration function between two schema versions.
 *
 * Migrations are chained automatically when `migrateWorld` is called.
 * For a simple non-breaking addition, the migration only needs to add
 * default values for the new fields.
 *
 * @example
 * registerMigration("0.1", "0.2", snap => ({
 *   ...snap,
 *   __newField: snap["__newField"] ?? 0,
 * }));
 */
export function registerMigration(
  fromVersion: string,
  toVersion:   string,
  fn:          MigrationFn,
): void {
  MIGRATIONS.set(`${fromVersion}->${toVersion}`, fn);
}

/**
 * Migrate a deserialized world snapshot to `toVersion` (default: current `SCHEMA_VERSION`).
 *
 * - If the snapshot already carries `_ananke_version === toVersion`, it is returned unchanged.
 * - Legacy snapshots without `_ananke_version` are treated as version `"0.0"`.
 * - Throws a descriptive error when no registered migration path exists.
 *
 * The snapshot is not mutated; a new object is returned.
 *
 * @example
 * const raw   = JSON.parse(fs.readFileSync("save.json", "utf8"));
 * const world = migrateWorld(raw) as WorldState;
 */
export function migrateWorld(
  snapshot:  Record<string, unknown>,
  toVersion: string = SCHEMA_VERSION,
): Record<string, unknown> {
  const fromVersion =
    typeof snapshot["_ananke_version"] === "string"
      ? snapshot["_ananke_version"]
      : "0.0";

  if (fromVersion === toVersion) return snapshot;

  const key = `${fromVersion}->${toVersion}`;
  const fn  = MIGRATIONS.get(key);
  if (fn === undefined) {
    const known = [...MIGRATIONS.keys()];
    throw new Error(
      `No migration from schema ${fromVersion} to ${toVersion}.` +
      (known.length > 0 ? ` Registered paths: ${known.join(", ")}` : " No migrations registered."),
    );
  }

  return fn(snapshot);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Read the `_ananke_version` stamp from a deserialized snapshot.
 * Returns `undefined` for legacy snapshots saved before PA-3.
 */
export function detectVersion(snapshot: unknown): string | undefined {
  if (typeof snapshot !== "object" || snapshot === null) return undefined;
  const v = (snapshot as Record<string, unknown>)["_ananke_version"];
  return typeof v === "string" ? v : undefined;
}

/**
 * Returns `true` when the snapshot carries a valid version stamp and passes
 * structural validation (no `ValidationError` entries).
 *
 * Convenience wrapper for `detectVersion` + `validateSnapshot`.
 */
export function isValidSnapshot(snapshot: unknown): boolean {
  if (detectVersion(snapshot) === undefined) return false;
  return validateSnapshot(snapshot).length === 0;
}
