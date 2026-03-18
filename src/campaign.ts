// src/campaign.ts — Phase 22: Campaign & World State
//
// Persistence layer for campaigns that span multiple encounters.
// Tracks world time, entity state, location, and campaign inventory
// between sessions.  Delegates wound recovery to Phase 19 stepDowntime.
//
// No kernel import — this is a pure data-management and bookkeeping module.

import type { Q } from "./units.js";
import type { Polity } from "./polity.js";
import type { Entity } from "./sim/entity.js";
import type { InjuryState } from "./sim/injury.js";
import type {
  DowntimeConfig,
  EntityRecoveryReport,
  TreatmentSchedule,
} from "./downtime.js";
import { stepDowntime } from "./downtime.js";
import type { WorldState } from "./sim/world.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A named region in the campaign world.
 *
 * `travelCost` maps destination locationId → travel time in seconds.
 * Only direct routes need to be specified; multi-hop routing is the host's responsibility.
 */
export interface Location {
  id:            string;
  name:          string;
  /** Phase 29 integration: ambient temperature for thermoregulation during travel/rest. */
  ambientTemp_Q?: Q;
  /** Altitude above sea level in real metres (not fixed-point). Used for environmental reference. */
  elevation_m:   number;
  travelCost:    Map<string, number>;  // locationId → seconds
}

/**
 * Full persistent state of an ongoing campaign.
 *
 * Designed to be serialised and deserialised between play sessions.
 * Maps survive round-trip via `serialiseCampaign` / `deserialiseCampaign`.
 */
export interface CampaignState {
  id:               string;
  epoch:            string;    // ISO timestamp of campaign start (display only)
  worldTime_s:      number;    // absolute simulated seconds since epoch
  entities:         Map<number, Entity>;
  locations:        Map<string, Location>;
  /** Current location of each entity, keyed by entityId. */
  entityLocations:  Map<number, string>;
  /**
   * Campaign-level item stockpiles per entity (arrows, rations, bandages, etc.).
   * Separate from combat loadout (`entity.loadout`), which represents equipped gear.
   * Map<entityId, Map<itemId, count>>
   */
  entityInventories: Map<number, Map<string, number>>;
  log:              Array<{ worldTime_s: number; text: string }>;
  /**
   * Polities active in this campaign (Phase 61).
   * Absent until the first call to `addPolity`.
   */
  polities?:        Map<string, Polity>;
}

// ── Map-aware serialisation helpers ──────────────────────────────────────────
// (Same pattern as src/replay.ts; duplicated to avoid a cross-module dependency.)

const MAP_MARKER = "__ananke_map__";

function mapReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return { [MAP_MARKER]: true, entries: [...value.entries()] };
  }
  return value;
}

function mapReviver(_key: string, value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    (value as Record<string, unknown>)[MAP_MARKER] === true
  ) {
    return new Map((value as { entries: Array<[unknown, unknown]> }).entries);
  }
  return value;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a new campaign with a set of starting entities.
 *
 * Entities are deep-cloned into the registry; the originals are not retained.
 * worldTime_s starts at 0.
 *
 * @param epoch  ISO timestamp string (defaults to current system time if omitted).
 */
export function createCampaign(
  id:       string,
  entities: Entity[],
  epoch?:   string,
): CampaignState {
  const entityMap = new Map<number, Entity>();
  for (const e of entities) entityMap.set(e.id, structuredClone(e));

  return {
    id,
    epoch:             epoch ?? new Date().toISOString(),
    worldTime_s:       0,
    entities:          entityMap,
    locations:         new Map(),
    entityLocations:   new Map(),
    entityInventories: new Map(),
    log:               [],
  };
}

// ── Location management ───────────────────────────────────────────────────────

/** Register or update a location in the campaign registry. */
export function addLocation(campaign: CampaignState, location: Location): void {
  campaign.locations.set(location.id, location);
}

/** Get the current locationId for an entity, or undefined if not placed. */
export function getEntityLocation(
  campaign: CampaignState,
  entityId: number,
): string | undefined {
  return campaign.entityLocations.get(entityId);
}

// ── Entity registry ───────────────────────────────────────────────────────────

/**
 * Merge updated entity states from a completed encounter back into the registry.
 *
 * All entities in `worldEntities` are deep-cloned into the campaign registry.
 * Entities not present in the world are left unchanged.
 */
export function mergeEntityState(
  campaign:      CampaignState,
  worldEntities: Entity[],
): void {
  for (const e of worldEntities) {
    campaign.entities.set(e.id, structuredClone(e));
  }
}

// ── Time advancement ──────────────────────────────────────────────────────────

/**
 * Advance the campaign clock by `delta_s` seconds and apply wound recovery.
 *
 * Delegates to `stepDowntime` for all registered entities.  If
 * `opts.downtimeConfig` is supplied, it is used directly.  Otherwise a
 * default config is built: rest=true, careLevel="none" for every entity
 * (natural clotting only — no treatment resources consumed).
 *
 * After the simulation, each entity's `injury` in the registry is replaced
 * with the final simulated injury state (`report.finalInjury`), so the
 * campaign registry always reflects the current physical condition.
 *
 * @returns Recovery reports for all entities that were processed.
 */
export function stepCampaignTime(
  campaign: CampaignState,
  delta_s:  number,
  opts?:    { downtimeConfig?: DowntimeConfig },
): EntityRecoveryReport[] {
  campaign.worldTime_s += delta_s;

  // Build a minimal WorldState from campaign entities
  const world: WorldState = {
    tick:     0,
    seed:     1,
    entities: [...campaign.entities.values()],
  };

  let config: DowntimeConfig;
  if (opts?.downtimeConfig) {
    config = opts.downtimeConfig;
  } else {
    // Default: rest with no active treatment for all entities
    const treatments = new Map<number, TreatmentSchedule>();
    for (const id of campaign.entities.keys()) {
      treatments.set(id, { careLevel: "none" });
    }
    config = { treatments, rest: true };
  }

  const reports = stepDowntime(world, delta_s, config);

  // Apply healed injury states back to the campaign registry
  for (const report of reports) {
    const entity = campaign.entities.get(report.entityId);
    if (!entity) continue;

    if (report.finalInjury) {
      entity.injury = report.finalInjury as InjuryState;
    }

    if (report.died) {
      campaign.log.push({
        worldTime_s: campaign.worldTime_s,
        text:        `Entity ${report.entityId} died during recovery.`,
      });
    }
  }

  return reports;
}

// ── Travel ────────────────────────────────────────────────────────────────────

/**
 * Move an entity to a new location.
 *
 * Looks up the travel time between the entity's current location and
 * `toLocationId` from the destination location's `travelCost` map (or from
 * the source location's map if no current location is set, assumes 0 travel
 * time for first placement).
 *
 * Advances `campaign.worldTime_s` by the travel time.
 *
 * @returns Travel time in seconds, or -1 if the destination is unknown or
 *          no travel route exists between current and destination.
 */
export function travel(
  campaign:     CampaignState,
  entityId:     number,
  toLocationId: string,
): number {
  const dest = campaign.locations.get(toLocationId);
  if (!dest) return -1;

  const currentLoc = campaign.entityLocations.get(entityId);
  let travelTime = 0;

  if (currentLoc !== undefined && currentLoc !== toLocationId) {
    const src = campaign.locations.get(currentLoc);
    // Look up travel time from source first, then from destination (bidirectional)
    const cost = src?.travelCost.get(toLocationId) ?? dest.travelCost.get(currentLoc);
    if (cost === undefined) return -1;  // no route
    travelTime = cost;
  }

  campaign.entityLocations.set(entityId, toLocationId);
  campaign.worldTime_s += travelTime;
  campaign.log.push({
    worldTime_s: campaign.worldTime_s,
    text:        `Entity ${entityId} travelled to ${dest.name} (${travelTime}s).`,
  });

  return travelTime;
}

// ── Inventory ─────────────────────────────────────────────────────────────────

/**
 * Debit `count` units of `itemId` from the entity's campaign inventory.
 *
 * Returns `true` if the debit succeeded (sufficient stock available).
 * Returns `false` if the entity does not have enough of the item.
 * Stock is never reduced below 0.
 */
export function debitInventory(
  campaign: CampaignState,
  entityId: number,
  itemId:   string,
  count:    number,
): boolean {
  const inv = campaign.entityInventories.get(entityId);
  const current = inv?.get(itemId) ?? 0;
  if (current < count) return false;

  const updatedInv = inv ?? new Map<string, number>();
  updatedInv.set(itemId, current - count);
  campaign.entityInventories.set(entityId, updatedInv);

  campaign.log.push({
    worldTime_s: campaign.worldTime_s,
    text:        `Entity ${entityId} used ${count}× ${itemId} (${current - count} remaining).`,
  });

  return true;
}

/**
 * Credit `count` units of `itemId` to the entity's campaign inventory.
 * Creates the inventory entry if it does not yet exist.
 */
export function creditInventory(
  campaign: CampaignState,
  entityId: number,
  itemId:   string,
  count:    number,
): void {
  let inv = campaign.entityInventories.get(entityId);
  if (!inv) {
    inv = new Map<string, number>();
    campaign.entityInventories.set(entityId, inv);
  }
  inv.set(itemId, (inv.get(itemId) ?? 0) + count);
}

/**
 * Get the current count of `itemId` in the entity's campaign inventory.
 * Returns 0 if the entity has no inventory or no entry for the item.
 */
export function getInventoryCount(
  campaign: CampaignState,
  entityId: number,
  itemId:   string,
): number {
  return campaign.entityInventories.get(entityId)?.get(itemId) ?? 0;
}

// ── Polity integration (Phase 61) ────────────────────────────────────────────

/**
 * Register a Polity in the campaign.
 *
 * The polity is stored by reference (not cloned); the caller owns the object.
 * Initialises `campaign.polities` on first use.
 */
export function addPolity(campaign: CampaignState, polity: Polity): void {
  if (!campaign.polities) campaign.polities = new Map();
  campaign.polities.set(polity.id, polity);
}

/**
 * Retrieve a Polity by id, or undefined if not registered.
 */
export function getPolity(campaign: CampaignState, polityId: string): Polity | undefined {
  return campaign.polities?.get(polityId);
}

// ── Serialisation ─────────────────────────────────────────────────────────────

/**
 * Serialise a CampaignState to a JSON string.
 *
 * Handles all nested Map fields (entities, locations, entityLocations,
 * entityInventories, entity.armourState, entity.skills, location.travelCost)
 * using the `__ananke_map__` marker pattern (same as src/replay.ts).
 */
export function serialiseCampaign(campaign: CampaignState): string {
  return JSON.stringify(campaign, mapReplacer);
}

/**
 * Deserialise a CampaignState from a JSON string produced by `serialiseCampaign`.
 */
export function deserialiseCampaign(json: string): CampaignState {
  return JSON.parse(json, mapReviver) as CampaignState;
}
