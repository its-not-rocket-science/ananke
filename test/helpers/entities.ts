import { generateIndividual } from "../../src/generate";
import { HUMAN_BASE } from "../../src/archetypes";
import { defaultIntent } from "../../src/sim/intent";
import { defaultAction } from "../../src/sim/action";
import { defaultCondition } from "../../src/sim/condition";
import { defaultInjury } from "../../src/sim/injury";
import { STARTER_WEAPONS, type Loadout } from "../../src/equipment";
import { v3 } from "../../src/sim/vec3";
import { q, SCALE } from "../../src/units";

import type { WorldState } from "../../src/sim/world";
/**
 * Minimal humanoid entity for tests (deterministic attributes via generateIndividual()).
 * Positions are fixed-point metres (SCALE.m).
 */
export function mkHumanoidEntity(id: number, teamId: number, x_m: number, y_m: number, z_m = 0): any {
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
  };
}

export function mkWorld(seed: number, entities: any[]): WorldState;
export function mkWorld(seed: number, loadoutA: Loadout): WorldState;

// implementation
export function mkWorld(seed: number, arg: any): WorldState {
  // General form: mkWorld(seed, entities[])
  if (Array.isArray(arg)) {
    const entities = [...arg].sort((a, b) => a.id - b.id);
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
      },
    ],
  } as any;
}