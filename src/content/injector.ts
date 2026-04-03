import { registerArchetype, registerArmour, registerWeapon } from "../catalog.js";
import { ANANKE_ENGINE_VERSION, semverSatisfies } from "../content-pack.js";
import { registerWorldArchetype, registerWorldItem } from "../world-factory.js";
import type { WorldState } from "../sim/world.js";
import type { ContentPack, ContentTerrain } from "./types.js";

export interface ContentRegistryState {
  packs: Map<string, ContentPack>;
  archetypes: Map<string, unknown>;
  weapons: Map<string, unknown>;
  armour: Map<string, unknown>;
  terrain: Map<string, ContentTerrain>;
}

function ensureRegistry(world: WorldState): ContentRegistryState {
  const runtime = (world.runtimeState ?? {}) as Record<string, unknown>;
  const existing = runtime.contentRegistry as ContentRegistryState | undefined;
  if (existing) return existing;

  const created: ContentRegistryState = {
    packs: new Map(),
    archetypes: new Map(),
    weapons: new Map(),
    armour: new Map(),
    terrain: new Map(),
  };

  runtime.contentRegistry = created;
  world.runtimeState = runtime;
  return created;
}

/**
 * Apply a content pack into a live world.
 *
 * Example:
 * ```ts
 * const pack = await loadContentPack("./my-hero.json");
 * world = applyContentPack(world, pack);
 * ```
 */
export function applyContentPack(world: WorldState, pack: ContentPack): WorldState {
  const compatRange = pack.registry?.compatRange;
  if (typeof compatRange === "string" && !semverSatisfies(ANANKE_ENGINE_VERSION, compatRange)) {
    throw new Error(`Pack ${pack.name}@${pack.version} is incompatible with engine ${ANANKE_ENGINE_VERSION}; expected ${compatRange}`);
  }

  const nextWorld: WorldState = {
    ...world,
    runtimeState: { ...(world.runtimeState ?? {}) },
  };

  const registry = ensureRegistry(nextWorld);
  const packId = `${pack.name}@${pack.version}`;

  // hot-reload: if pack id already exists, overwrite registry entries.
  registry.packs.set(packId, pack);

  for (const archetype of pack.archetypes ?? []) {
    const parsed = registerArchetype(archetype);
    registerWorldArchetype(archetype.id, parsed);
    registry.archetypes.set(archetype.id, archetype);
  }

  for (const weapon of pack.weapons ?? []) {
    const parsed = registerWeapon(weapon);
    registerWorldItem(weapon.id, parsed);
    registry.weapons.set(weapon.id, weapon);
  }

  for (const armour of pack.armour ?? []) {
    const parsed = registerArmour(armour);
    registerWorldItem(armour.id, parsed);
    registry.armour.set(armour.id, armour);
  }

  for (const terrain of pack.terrain ?? []) {
    registry.terrain.set(terrain.id, terrain);
  }

  return nextWorld;
}
