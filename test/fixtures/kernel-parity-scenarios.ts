import { STARTER_RANGED_WEAPONS, STARTER_WEAPONS } from "../../src/equipment.js";
import type { CommandMap } from "../../src/sim/commands.js";
import type { KernelContext } from "../../src/sim/context.js";
import type { CapabilityEffect, CapabilitySource } from "../../src/sim/capability.js";
import { buildHazardGrid, buildObstacleGrid } from "../../src/sim/terrain.js";
import { mkHumanoidEntity, mkWorld } from "../../src/sim/testing.js";
import type { WorldState } from "../../src/sim/world.js";
import { v3 } from "../../src/sim/vec3.js";
import { q, to } from "../../src/units.js";

const BASE_CTX: KernelContext = { tractionCoeff: q(0.8) };

export interface KernelParityScenario {
  name: string;
  ticks: number;
  createWorld(): WorldState;
  createContext(): KernelContext;
  commandsAtTick(tick: number, world: WorldState): CommandMap;
}

function meleeDuel(): KernelParityScenario {
  const sword = STARTER_WEAPONS.find((w) => w.id === "wpn_longsword")!;
  return {
    name: "melee duel",
    ticks: 20,
    createWorld: () => {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, to.m(1.2), 0);
      a.loadout.items = [sword];
      b.loadout.items = [sword];
      return mkWorld(101, [a, b]);
    },
    createContext: () => ({ ...BASE_CTX }),
    commandsAtTick: () => new Map([
      [1, [{ kind: "attack", targetId: 2, weaponId: "wpn_longsword", intensity: q(1) }]],
      [2, [{ kind: "attack", targetId: 1, weaponId: "wpn_longsword", intensity: q(1) }]],
    ]),
  };
}

function rangedDuel(): KernelParityScenario {
  const shortbow = STARTER_RANGED_WEAPONS.find((w) => w.id === "rng_shortbow")!;
  return {
    name: "ranged duel",
    ticks: 30,
    createWorld: () => {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, to.m(8), 0);
      a.loadout.items = [shortbow];
      b.loadout.items = [shortbow];
      return mkWorld(202, [a, b]);
    },
    createContext: () => ({ ...BASE_CTX }),
    commandsAtTick: () => new Map([
      [1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1) }]],
      [2, [{ kind: "shoot", targetId: 1, weaponId: "rng_shortbow", intensity: q(1) }]],
    ]),
  };
}

function grapplingHeavy(): KernelParityScenario {
  return {
    name: "grappling heavy",
    ticks: 25,
    createWorld: () => {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, to.m(0.6), 0);
      return mkWorld(303, [a, b]);
    },
    createContext: () => ({ ...BASE_CTX }),
    commandsAtTick: (tick) => {
      if (tick < 8) {
        return new Map([[1, [{ kind: "grapple", targetId: 2, mode: "jointLock", intensity: q(1) }]]]);
      }
      return new Map([[1, [{ kind: "grapple", targetId: 2, mode: "choke", intensity: q(1) }]]]);
    },
  };
}

function hazardAndTerrain(): KernelParityScenario {
  return {
    name: "hazard + terrain",
    ticks: 25,
    createWorld: () => {
      const runner = mkHumanoidEntity(1, 1, 0, 0);
      const enemy = mkHumanoidEntity(2, 2, to.m(5), 0);
      runner.loadout.items = [STARTER_WEAPONS.find((w) => w.id === "wpn_club")!];
      enemy.loadout.items = [STARTER_WEAPONS.find((w) => w.id === "wpn_club")!];
      return mkWorld(404, [runner, enemy]);
    },
    createContext: () => ({
      ...BASE_CTX,
      obstacleGrid: buildObstacleGrid({ "1,0": q(0.8), "2,0": q(0.3) }),
      hazardGrid: buildHazardGrid({ "1,0": { type: "fire", intensity: q(0.6), duration_ticks: 50 } }),
    }),
    commandsAtTick: () => new Map([
      [1, [{ kind: "move", dir: v3(1, 0, 0), intensity: q(1), mode: "sprint" }]],
      [2, [{ kind: "move", dir: v3(-1, 0, 0), intensity: q(0.8), mode: "advance" }]],
    ]),
  };
}

function capabilityHeavy(): KernelParityScenario {
  function source(): CapabilitySource {
    const effect: CapabilityEffect = {
      id: "dash",
      cost_J: 300,
      castTime_ticks: 0,
      payload: { kind: "velocity", delta_mps: v3(to.mps(1.5), 0, 0) },
    };
    return {
      id: "arcane",
      label: "Arcane core",
      tags: ["magic"],
      reserve_J: 10_000,
      maxReserve_J: 10_000,
      regenModel: { type: "constant", regenRate_W: 120 },
      effects: [effect],
    };
  }

  return {
    name: "capability heavy",
    ticks: 20,
    createWorld: () => {
      const caster = mkHumanoidEntity(1, 1, 0, 0);
      const enemy = mkHumanoidEntity(2, 2, to.m(2), 0);
      caster.capabilitySources = [source()];
      return mkWorld(505, [caster, enemy]);
    },
    createContext: () => ({ ...BASE_CTX }),
    commandsAtTick: () => new Map([
      [1, [{ kind: "activate", sourceId: "arcane", effectId: "dash" }]],
      [2, [{ kind: "move", dir: v3(-1, 0, 0), intensity: q(0.7), mode: "advance" }]],
    ]),
  };
}

function moraleRouting(): KernelParityScenario {
  return {
    name: "morale routing",
    ticks: 20,
    createWorld: () => {
      const brittle = mkHumanoidEntity(1, 1, 0, 0);
      const aggressor = mkHumanoidEntity(2, 2, to.m(1), 0);
      brittle.condition.fearQ = q(0.9);
      brittle.condition.suppressedTicks = 30;
      aggressor.loadout.items = [STARTER_WEAPONS.find((w) => w.id === "wpn_club")!];
      return mkWorld(606, [brittle, aggressor]);
    },
    createContext: () => ({ ...BASE_CTX }),
    commandsAtTick: () => new Map([
      [2, [{ kind: "attack", targetId: 1, weaponId: "wpn_club", intensity: q(1) }]],
    ]),
  };
}

function recoveryMedical(): KernelParityScenario {
  return {
    name: "recovery medical",
    ticks: 15,
    createWorld: () => {
      const medic = mkHumanoidEntity(1, 1, 0, 0);
      const patient = mkHumanoidEntity(2, 1, to.m(0.5), 0);
      patient.injury.byRegion.torso!.bleedingRate = q(0.5);
      patient.injury.fluidLoss = q(0.3);
      return mkWorld(707, [medic, patient]);
    },
    createContext: () => ({ ...BASE_CTX }),
    commandsAtTick: () => new Map([
      [1, [{ kind: "treat", targetId: 2, action: "bandage", regionId: "torso", tier: "bandage" }]],
    ]),
  };
}

export const KERNEL_PARITY_SCENARIOS: readonly KernelParityScenario[] = [
  meleeDuel(),
  rangedDuel(),
  grapplingHeavy(),
  hazardAndTerrain(),
  capabilityHeavy(),
  moraleRouting(),
  recoveryMedical(),
];
