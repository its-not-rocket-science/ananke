import type { Entity } from "./entity.js";
import type { WorldState } from "./world.js";
import { effectiveStanding, STANDING_HOSTILE_THRESHOLD, STANDING_FRIENDLY_THRESHOLD } from "../faction.js";
import { areEntitiesHostileByParty, areEntitiesFriendlyByParty } from "../party.js";

export function isEnemy(a: Entity, b: Entity): boolean {
  return a.teamId !== b.teamId;
}

/**
 * Phase 48: Determine if two entities are hostile, considering team, party, and faction relationships.
 * Returns true if they should treat each other as enemies.
 * Self-defence override: injured entities (shock > 0 or fluidLoss > 0) ignore friendly faction/party thresholds.
 */
export function areEntitiesHostile(a: Entity, b: Entity, world: WorldState): boolean {
  // same team → never hostile
  if (a.teamId === b.teamId) return false;

  const isInjured = a.injury.shock > 0 || a.injury.fluidLoss > 0;

  // party check
  const partyRegistry = world.__partyRegistry;
  if (partyRegistry) {
    // if parties are friendly, not hostile (unless injured)
    if (!isInjured && areEntitiesFriendlyByParty(partyRegistry, a, b)) return false;
    // if parties are hostile, hostile
    if (areEntitiesHostileByParty(partyRegistry, a, b)) return true;
  }

  // faction check
  const factionRegistry = world.__factionRegistry;
  if (factionRegistry && a.faction && b.faction) {
    const standing = effectiveStanding(factionRegistry, a, b);
    if (!isInjured && standing >= STANDING_FRIENDLY_THRESHOLD) return false;
    if (standing < STANDING_HOSTILE_THRESHOLD) return true;
  }

  // default: different team → hostile
  return true;
}