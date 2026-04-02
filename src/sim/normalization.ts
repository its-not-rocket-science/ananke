import { q, SCALE } from "../units.js";
import { defaultAction } from "./action.js";
import { defaultIntent } from "./intent.js";
import { buildLimbStates } from "./limb.js";
import { DEFAULT_PERCEPTION } from "./sensory.js";
import type { Armour } from "../equipment.js";
import type { Entity } from "./entity.js";
import type { WorldState } from "./world.js";

/**
 * Normalize one entity into the current kernel-ready shape.
 * Mutates the entity in-place for performance and deterministic map identity.
 */
export function normalizeEntityInPlace(e: Entity): void {
  if (!(e).intent) (e).intent = defaultIntent();
  if (!(e).action) (e).action = defaultAction();

  if (!(e).grapple) {
    (e).grapple = { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" };
  } else if ((e).grapple.position === undefined) {
    (e).grapple.position = "standing";
  }

  if ((e).action.grappleCooldownTicks === undefined) (e).action.grappleCooldownTicks = 0;
  if ((e).condition?.pinned === undefined) (e).condition.pinned = false;
  if ((e).action.weaponBindPartnerId === undefined) (e).action.weaponBindPartnerId = 0;
  if ((e).action.weaponBindTicks === undefined) (e).action.weaponBindTicks = 0;
  if ((e).action.shootCooldownTicks === undefined) (e).action.shootCooldownTicks = 0;
  if ((e).condition.suppressedTicks === undefined) (e).condition.suppressedTicks = 0;
  if ((e).action.swingMomentumQ === undefined) (e).action.swingMomentumQ = 0;
  if ((e).action.aimTicks === undefined) (e).action.aimTicks = 0;
  if ((e).action.aimTargetId === undefined) (e).action.aimTargetId = 0;
  if (!(e.attributes).perception) (e.attributes).perception = DEFAULT_PERCEPTION;

  if (!e.ai) e.ai = { focusTargetId: 0, retargetCooldownTicks: 0, decisionCooldownTicks: 0 };
  else if ((e.ai).decisionCooldownTicks === undefined) (e.ai).decisionCooldownTicks = 0;

  if ((e.condition).fearQ === undefined) (e.condition).fearQ = q(0);
  if ((e.condition).suppressionFearMul === undefined) (e.condition).suppressionFearMul = SCALE.Q;
  if ((e.condition).recentAllyDeaths === undefined) (e.condition).recentAllyDeaths = 0;
  if ((e.condition).lastAllyDeathTick === undefined) (e.condition).lastAllyDeathTick = -1;
  if ((e.condition).surrendered === undefined) (e.condition).surrendered = false;
  if ((e.condition).rallyCooldownTicks === undefined) (e.condition).rallyCooldownTicks = 0;
  if ((e.condition).blindTicks === undefined) (e.condition).blindTicks = 0;
  if ((e.injury).hemolymphLoss === undefined) (e.injury).hemolymphLoss = q(0);

  for (const reg of Object.values(e.injury.byRegion)) {
    if ((reg).fractured === undefined) (reg).fractured = false;
    if ((reg).infectedTick === undefined) (reg).infectedTick = -1;
    if ((reg).bleedDuration_ticks === undefined) (reg).bleedDuration_ticks = 0;
    if ((reg).permanentDamage === undefined) (reg).permanentDamage = q(0);
  }

  if (!e.armourState) {
    const ablativeItems = e.loadout.items.filter((it): it is Armour => it.kind === "armour" && !!(it as Armour).ablative);
    if (ablativeItems.length > 0) {
      e.armourState = new Map(ablativeItems.map(it => [it.id, { resistRemaining_J: it.resist_J as number }]));
    }
  }

  if (!e.limbStates && e.bodyPlan) {
    const limbs = buildLimbStates(e.bodyPlan);
    if (limbs.length > 0) e.limbStates = limbs;
  }
}

/**
 * Normalize world and all entities to current kernel-ready shape.
 * Mutates and returns the same world object.
 */
export function normalizeWorldInPlace(world: WorldState): WorldState {
  world.entities.sort((a, b) => a.id - b.id);
  for (const e of world.entities) normalizeEntityInPlace(e);
  return world;
}
