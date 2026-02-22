import { generateIndividual } from "../generate.js";
import { HUMAN_BASE } from "../archetypes.js";
import { defaultIntent } from "./intent.js";
import { defaultAction } from "./action.js";
import { defaultCondition } from "./condition.js";
import { defaultInjury } from "./injury.js";
import { type Loadout } from "../equipment.js";
import { v3 } from "./vec3.js";
import { q, SCALE } from "../units.js";

import type { Entity } from "./entity.js";
import type { WorldState } from "./world.js";
/**
 * Minimal humanoid entity for tests (deterministic attributes via generateIndividual()).
 * Positions are fixed-point metres (SCALE.m).
 */
export function mkHumanoidEntity(id: number, teamId: number, x_m: number, y_m: number, z_m = 0): Entity {
  const attrs = generateIndividual(id, HUMAN_BASE);

  return {
    id,
    teamId,
    attributes: attrs,
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items: [] },
    traits: [],
    position_m: v3(x_m, y_m, z_m),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(),
    action: defaultAction(),
    condition: defaultCondition(),
    injury: defaultInjury(),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0) },
  };
}

export function mkWorld(seed: number, entities: any[]): WorldState;
/** @deprecated Pass an explicit entity array instead: mkWorld(seed, [a, b]) */
export function mkWorld(seed: number, loadoutA: Loadout): WorldState;

// implementation
export function mkWorld(seed: number, arg: any): WorldState {
  // General form: mkWorld(seed, entities[])
  if (Array.isArray(arg)) {
    const entities = [...arg].sort((a, b) => a.id - b.id);

    // Catch duplicate IDs early; they cause silent wrong results at runtime.
    const ids = entities.map(e => e.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length > 0) {
      throw new Error(`mkWorld: duplicate entity IDs detected: ${[...new Set(dupes)].join(", ")}`);
    }

    return { tick: 0, seed, entities } as any;
  }

  // Back-compat duel form: mkWorld(seed, loadoutA)
  const loadoutA: Loadout = arg;

  const aAttrs = generateIndividual(1, HUMAN_BASE);
  const bAttrs = generateIndividual(2, HUMAN_BASE);

  return {
    tick: 0,
    seed,
    entities: [
      {
        id: 1,
        teamId: 1,
        attributes: aAttrs,
        energy: { reserveEnergy_J: aAttrs.performance.reserveEnergy_J, fatigue: q(0) },
        loadout: loadoutA,
        traits: [],
        position_m: v3(0, 0, 0),
        velocity_mps: v3(0, 0, 0),
        intent: defaultIntent(),
        action: defaultAction(),
        condition: defaultCondition(),
        injury: defaultInjury(),
        grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0) },
      },
      {
        id: 2,
        teamId: 2,
        attributes: bAttrs,
        energy: { reserveEnergy_J: bAttrs.performance.reserveEnergy_J, fatigue: q(0) },
        loadout: { items: [] },
        traits: [],
        position_m: v3(Math.trunc(2.0 * SCALE.m), 0, 0),
        velocity_mps: v3(0, 0, 0),
        intent: defaultIntent(),
        action: defaultAction(),
        condition: defaultCondition(),
        injury: defaultInjury(),
        grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0) },
      },
    ],
  } as any;
}