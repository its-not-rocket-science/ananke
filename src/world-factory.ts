/**
 * CE-2: createWorld convenience factory.
 *
 * Builds a deterministic WorldState from a simple declarative entity spec.
 * No Math.random() — all randomness flows through generateIndividual(spec.seed, archetype).
 * All position coordinates are fixed-point (SCALE.m multiplier + Math.round).
 */

import { q, SCALE } from "./units.js";
import { generateIndividual } from "./generate.js";
import {
  HUMAN_BASE,
  AMATEUR_BOXER,
  PRO_BOXER,
  GRECO_WRESTLER,
  KNIGHT_INFANTRY,
  LARGE_PACIFIC_OCTOPUS,
  SERVICE_ROBOT,
} from "./archetypes.js";
import type { Archetype } from "./archetypes.js";
import {
  ELF_SPECIES,
  DWARF_SPECIES,
  HALFLING_SPECIES,
  ORC_SPECIES,
  OGRE_SPECIES,
  GOBLIN_SPECIES,
  TROLL_SPECIES,
  VULCAN_SPECIES,
  KLINGON_SPECIES,
  ROMULAN_SPECIES,
  DRAGON_SPECIES,
  CENTAUR_SPECIES,
  SATYR_SPECIES,
  HEECHEE_SPECIES,
} from "./species.js";
import { ALL_HISTORICAL_MELEE, ALL_HISTORICAL_RANGED } from "./weapons.js";
import { STARTER_WEAPONS, STARTER_ARMOUR, STARTER_ARMOUR_11C } from "./equipment.js";
import type { Item } from "./equipment.js";
import { v3 } from "./sim/vec3.js";
import { defaultIntent } from "./sim/intent.js";
import { defaultAction } from "./sim/action.js";
import { defaultCondition } from "./sim/condition.js";
import { defaultInjury } from "./sim/injury.js";
import { normalizeWorldInPlace } from "./sim/normalization.js";
import type { Entity } from "./sim/entity.js";
import type { WorldState } from "./sim/world.js";

// ── Static archetype map ──────────────────────────────────────────────────────

/** Map of string keys to Archetype objects for use with createWorld(). */
export const ARCHETYPE_MAP: ReadonlyMap<string, Archetype> = new Map<string, Archetype>([
  // Direct archetypes from archetypes.ts
  ["HUMAN_BASE",            HUMAN_BASE],
  ["AMATEUR_BOXER",         AMATEUR_BOXER],
  ["PRO_BOXER",             PRO_BOXER],
  ["GRECO_WRESTLER",        GRECO_WRESTLER],
  ["KNIGHT_INFANTRY",       KNIGHT_INFANTRY],
  ["LARGE_PACIFIC_OCTOPUS", LARGE_PACIFIC_OCTOPUS],
  ["SERVICE_ROBOT",         SERVICE_ROBOT],
  // Species archetypes from species.ts
  ["ELF",      ELF_SPECIES.archetype],
  ["DWARF",    DWARF_SPECIES.archetype],
  ["HALFLING", HALFLING_SPECIES.archetype],
  ["ORC",      ORC_SPECIES.archetype],
  ["OGRE",     OGRE_SPECIES.archetype],
  ["GOBLIN",   GOBLIN_SPECIES.archetype],
  ["TROLL",    TROLL_SPECIES.archetype],
  ["VULCAN",   VULCAN_SPECIES.archetype],
  ["KLINGON",  KLINGON_SPECIES.archetype],
  ["ROMULAN",  ROMULAN_SPECIES.archetype],
  ["DRAGON",   DRAGON_SPECIES.archetype],
  ["CENTAUR",  CENTAUR_SPECIES.archetype],
  ["SATYR",    SATYR_SPECIES.archetype],
  ["HEECHEE",  HEECHEE_SPECIES.archetype],
]);

// ── Static item map ───────────────────────────────────────────────────────────

function buildItemMap(): Map<string, Item> {
  const map = new Map<string, Item>();
  const allItems: Item[] = [
    ...ALL_HISTORICAL_MELEE,
    ...ALL_HISTORICAL_RANGED,
    ...STARTER_WEAPONS,
    ...STARTER_ARMOUR,
    ...STARTER_ARMOUR_11C,
  ];
  for (const item of allItems) {
    map.set(item.id, item);
  }
  return map;
}

/** Map of item id → Item for weapons and armour usable with createWorld(). */
export const ITEM_MAP: ReadonlyMap<string, Item> = buildItemMap();

// ── Content-pack extension registries ────────────────────────────────────────
// Dynamic additions from loadPack(); checked after the static maps.

const _archetypeExtensions = new Map<string, Archetype>();
const _itemExtensions       = new Map<string, Item>();

/**
 * Register an archetype so it is resolvable by `createWorld` and `loadScenario`.
 * Called automatically by `loadPack` in `content-pack.ts`.
 */
export function registerWorldArchetype(id: string, archetype: Archetype): void {
  _archetypeExtensions.set(id, archetype);
}

/**
 * Register a weapon or armour so it is resolvable by `createWorld` and `loadScenario`.
 * Called automatically by `loadPack` in `content-pack.ts`.
 */
export function registerWorldItem(id: string, item: Item): void {
  _itemExtensions.set(id, item);
}

/**
 * Remove all content-pack extensions from the world-factory lookup tables.
 * Does NOT affect the static `ARCHETYPE_MAP` or `ITEM_MAP`.
 * Call in test `afterEach` alongside `clearCatalog()` and `clearPackRegistry()`.
 */
export function clearWorldExtensions(): void {
  _archetypeExtensions.clear();
  _itemExtensions.clear();
}

// ── EntitySpec ────────────────────────────────────────────────────────────────

export interface EntitySpec {
  id:         number;
  teamId:     number;
  seed:       number;
  archetype:  string;  // key into ARCHETYPE_MAP
  weaponId:   string;  // key into ITEM_MAP
  armourId?:  string;  // key into ITEM_MAP (optional)
  x_m?:       number;  // metres float; default 0 for team 1, 0.6 for team 2
  y_m?:       number;  // metres float; default 0
}

// ── createWorld ───────────────────────────────────────────────────────────────

/**
 * Build a deterministic WorldState from a declarative entity spec list.
 *
 * - Uses spec.seed for generateIndividual() — no Math.random().
 * - Position coordinates are fixed-point: Math.round(metres * SCALE.m).
 * - Throws on unknown archetype, weaponId, or armourId.
 * - Throws on duplicate entity ids.
 */
export function createWorld(seed: number, entities: EntitySpec[]): WorldState {
  const built: Entity[] = [];

  for (const spec of entities) {
    // ── Archetype lookup (static map + content-pack extensions) ──────────────
    const archetype = ARCHETYPE_MAP.get(spec.archetype) ?? _archetypeExtensions.get(spec.archetype);
    if (archetype === undefined) {
      throw new Error(
        `createWorld: unknown archetype "${spec.archetype}". ` +
        `Valid keys: ${[...ARCHETYPE_MAP.keys()].join(", ")}`,
      );
    }

    // ── Weapon lookup (static map + content-pack extensions) ─────────────────
    const weapon = ITEM_MAP.get(spec.weaponId) ?? _itemExtensions.get(spec.weaponId);
    if (weapon === undefined) {
      throw new Error(`createWorld: unknown weaponId "${spec.weaponId}"`);
    }

    // ── Optional armour lookup ────────────────────────────────────────────────
    let armour: Item | undefined;
    if (spec.armourId !== undefined) {
      armour = ITEM_MAP.get(spec.armourId) ?? _itemExtensions.get(spec.armourId);
      if (armour === undefined) {
        throw new Error(`createWorld: unknown armourId "${spec.armourId}"`);
      }
    }

    // ── Generate individual attributes ────────────────────────────────────────
    const attrs = generateIndividual(spec.seed, archetype);

    // ── Default position ──────────────────────────────────────────────────────
    // Team 1 defaults to x=0; all others default to x=0.6m.
    const defaultX = spec.teamId === 1 ? 0 : 0.6;
    const x_fixed = Math.round((spec.x_m ?? defaultX) * SCALE.m);
    const y_fixed = Math.round((spec.y_m ?? 0) * SCALE.m);

    // ── Build loadout ─────────────────────────────────────────────────────────
    const items: Item[] = [weapon];
    if (armour !== undefined) items.push(armour);

    // ── Assemble entity ───────────────────────────────────────────────────────
    const entity: Entity = {
      id:         spec.id,
      teamId:     spec.teamId,
      attributes: attrs,
      energy:     { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
      loadout:    { items },
      traits:     [],
      position_m: v3(x_fixed, y_fixed, 0),
      velocity_mps: v3(0, 0, 0),
      intent:     defaultIntent(),
      action:     defaultAction(),
      condition:  defaultCondition(),
      injury:     defaultInjury(),
      grapple:    { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
    };

    built.push(entity);
  }

  // ── Sort by id ────────────────────────────────────────────────────────────
  built.sort((a, b) => a.id - b.id);

  // ── Duplicate id check ────────────────────────────────────────────────────
  const ids = built.map(e => e.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    throw new Error(
      `createWorld: duplicate entity IDs detected: ${[...new Set(dupes)].join(", ")}`,
    );
  }

  return normalizeWorldInPlace({ tick: 0, seed, entities: built });
}
