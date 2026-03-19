/**
 * CE-3: JSON scenario loader.
 *
 * Provides typed AnankeScenario interface, structural validation, and
 * a loadScenario() function that converts validated JSON into a WorldState.
 */

import type { WorldState } from "./sim/world.js";
import { createWorld } from "./world-factory.js";
import type { EntitySpec } from "./world-factory.js";

// ── Schema types ──────────────────────────────────────────────────────────────

export interface AnankeScenarioEntity {
  id:        number;
  teamId:    number;
  archetype: string;
  weapon:    string;
  armour?:   string;
  x_m?:      number;
  y_m?:      number;
}

export interface AnankeScenario {
  $schema?:       string;
  id:             string;
  seed:           number;
  maxTicks:       number;
  tractionCoeff?: number;   // float 0–1; defaults to 0.85
  entities:       AnankeScenarioEntity[];
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate structural correctness of a JSON scenario object.
 * Returns an array of error strings — empty array means valid.
 * Does NOT perform simulation-level lookups (e.g. archetype/weapon existence).
 */
export function validateScenario(json: unknown): string[] {
  const errors: string[] = [];

  // Must be a plain object
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    errors.push("scenario must be a plain object");
    return errors;  // can't continue checking fields
  }

  const obj = json as Record<string, unknown>;

  // id — non-empty string
  if (typeof obj["id"] !== "string" || (obj["id"] as string).length === 0) {
    errors.push("scenario.id must be a non-empty string");
  }

  // seed — positive integer
  if (
    typeof obj["seed"] !== "number" ||
    !Number.isInteger(obj["seed"]) ||
    (obj["seed"] as number) <= 0
  ) {
    errors.push("scenario.seed must be a positive integer");
  }

  // maxTicks — positive integer
  if (
    typeof obj["maxTicks"] !== "number" ||
    !Number.isInteger(obj["maxTicks"]) ||
    (obj["maxTicks"] as number) <= 0
  ) {
    errors.push("scenario.maxTicks must be a positive integer");
  }

  // entities — non-empty array
  if (!Array.isArray(obj["entities"])) {
    errors.push("scenario.entities must be an array");
    return errors;  // can't check entity elements
  }
  const rawEntities = obj["entities"] as unknown[];
  if (rawEntities.length === 0) {
    errors.push("scenario.entities must not be empty");
    return errors;
  }

  // Validate each entity element
  const seenIds = new Set<number>();
  for (let i = 0; i < rawEntities.length; i++) {
    const ent = rawEntities[i];
    if (ent === null || typeof ent !== "object" || Array.isArray(ent)) {
      errors.push(`scenario.entities[${i}] must be a plain object`);
      continue;
    }
    const e = ent as Record<string, unknown>;

    if (typeof e["id"] !== "number") {
      errors.push(`scenario.entities[${i}].id must be a number`);
    } else {
      const eid = e["id"] as number;
      if (seenIds.has(eid)) {
        errors.push(`scenario.entities[${i}].id ${eid} is a duplicate`);
      }
      seenIds.add(eid);
    }

    if (typeof e["teamId"] !== "number") {
      errors.push(`scenario.entities[${i}].teamId must be a number`);
    }

    if (typeof e["archetype"] !== "string") {
      errors.push(`scenario.entities[${i}].archetype must be a string`);
    }

    if (typeof e["weapon"] !== "string") {
      errors.push(`scenario.entities[${i}].weapon must be a string`);
    }
  }

  return errors;
}

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * Parse and load a scenario from JSON, returning a WorldState ready for stepWorld().
 *
 * Calls validateScenario first — throws an Error with all validation messages if invalid.
 * Maps AnankeScenarioEntity.id as the entity seed.
 */
export function loadScenario(json: unknown): WorldState {
  const errors = validateScenario(json);
  if (errors.length > 0) {
    throw new Error(`loadScenario: invalid scenario:\n  ${errors.join("\n  ")}`);
  }

  const scenario = json as AnankeScenario;

  const specs: EntitySpec[] = scenario.entities.map(ent => {
    const spec: EntitySpec = {
      id:        ent.id,
      teamId:    ent.teamId,
      seed:      ent.id,          // use entity id as deterministic seed
      archetype: ent.archetype,
      weaponId:  ent.weapon,
    };
    if (ent.armour !== undefined) spec.armourId = ent.armour;
    if (ent.x_m   !== undefined) spec.x_m      = ent.x_m;
    if (ent.y_m   !== undefined) spec.y_m      = ent.y_m;
    return spec;
  });

  return createWorld(scenario.seed, specs);
}
