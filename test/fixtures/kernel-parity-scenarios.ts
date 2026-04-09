import { STARTER_RANGED_WEAPONS, STARTER_WEAPONS } from "../../src/equipment.js";
import type { CommandMap } from "../../src/sim/commands.js";
import type { KernelContext } from "../../src/sim/context.js";
import type { CapabilityEffect, CapabilitySource } from "../../src/sim/capability.js";
import { cToQ } from "../../src/sim/thermoregulation.js";
import { buildHazardGrid, buildObstacleGrid } from "../../src/sim/terrain.js";
import { mkHumanoidEntity, mkWorld } from "../../src/sim/testing.js";
import type { WorldState } from "../../src/sim/world.js";
import { v3 } from "../../src/sim/vec3.js";
import { q, SCALE, to } from "../../src/units.js";

const BASE_CTX: KernelContext = {
  tractionCoeff: q(0.85),
  cellSize_m: to.m(4),
};

export interface KernelParityScenario {
  /** Stable scenario identifier for parity reports and future resolver extraction harnesses. */
  id: string;
  name: string;
  ticks: number;
  /** Compare ordered trace output for this scenario. */
  compareTraceOrder: boolean;
  createWorld(): WorldState;
  createContext(): KernelContext;
  commandsAtTick(tick: number, world: WorldState): CommandMap;
}

function meleeScenario(): KernelParityScenario {
  const sword = STARTER_WEAPONS.find((w) => w.id === "wpn_longsword")!;
  return {
    id: "melee",
    name: "melee exchange",
    ticks: 24,
    compareTraceOrder: true,
    createWorld: () => {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, to.m(1.1), 0);
      a.loadout.items = [sword];
      b.loadout.items = [sword];
      return mkWorld(1401, [a, b]);
    },
    createContext: () => ({ ...BASE_CTX }),
    commandsAtTick: () => new Map([
      [1, [{ kind: "attack", targetId: 2, weaponId: sword.id, intensity: q(1), mode: "swing" }]],
      [2, [{ kind: "attack", targetId: 1, weaponId: sword.id, intensity: q(1), mode: "swing" }]],
    ]),
  };
}

function rangedScenario(): KernelParityScenario {
  const bow = STARTER_RANGED_WEAPONS.find((w) => w.id === "rng_shortbow")!;
  return {
    id: "ranged",
    name: "ranged pressure",
    ticks: 30,
    compareTraceOrder: true,
    createWorld: () => {
      const shooter = mkHumanoidEntity(1, 1, 0, 0);
      const target = mkHumanoidEntity(2, 2, to.m(8), 0);
      shooter.loadout.items = [bow];
      return mkWorld(1402, [shooter, target]);
    },
    createContext: () => ({ ...BASE_CTX }),
    commandsAtTick: () => new Map([
      [1, [{ kind: "shoot", targetId: 2, weaponId: bow.id, intensity: q(1) }]],
      [2, [{ kind: "move", dir: v3(-1, 0, 0), intensity: q(0.4), mode: "run" }]],
    ]),
  };
}

function grappleScenario(): KernelParityScenario {
  return {
    id: "grapple",
    name: "grapple control",
    ticks: 26,
    compareTraceOrder: true,
    createWorld: () => {
      const grappler = mkHumanoidEntity(1, 1, 0, 0);
      const defender = mkHumanoidEntity(2, 2, to.m(0.5), 0);
      return mkWorld(1403, [grappler, defender]);
    },
    createContext: () => ({ ...BASE_CTX }),
    commandsAtTick: (tick) => {
      const mode = tick >= 10 ? "choke" : "jointLock";
      return new Map([
        [1, [{ kind: "grapple", targetId: 2, mode, intensity: q(1) }]],
      ]);
    },
  };
}

function hazardsScenario(): KernelParityScenario {
  return {
    id: "hazards",
    name: "hazards and terrain friction",
    ticks: 22,
    compareTraceOrder: true,
    createWorld: () => {
      const runner = mkHumanoidEntity(1, 1, 0, 0);
      const blocker = mkHumanoidEntity(2, 2, to.m(5), 0);
      blocker.loadout.items = [STARTER_WEAPONS.find((w) => w.id === "wpn_club")!];
      return mkWorld(1404, [runner, blocker]);
    },
    createContext: () => ({
      ...BASE_CTX,
      obstacleGrid: buildObstacleGrid({ "1,0": q(0.75), "2,0": q(0.5), "3,0": q(0.15) }),
      hazardGrid: buildHazardGrid({
        "1,0": { type: "fire", intensity: q(0.45), duration_ticks: 50 },
        "2,0": { type: "poison_gas", intensity: q(0.35), duration_ticks: 50 },
      }),
    }),
    commandsAtTick: () => new Map([
      [1, [{ kind: "move", dir: v3(1, 0, 0), intensity: q(1), mode: "sprint" }]],
      [2, [{ kind: "move", dir: v3(-1, 0, 0), intensity: q(0.5), mode: "run" }]],
    ]),
  };
}

function capabilityScenario(): KernelParityScenario {
  function source(): CapabilitySource {
    const effect: CapabilityEffect = {
      id: "dash",
      cost_J: 250,
      castTime_ticks: 0,
      payload: { kind: "velocity", delta_mps: v3(to.mps(1.8), 0, 0) },
    };
    return {
      id: "core",
      label: "Arcane core",
      tags: ["magic"],
      reserve_J: 8_000,
      maxReserve_J: 8_000,
      regenModel: { type: "constant", regenRate_W: 100 },
      effects: [effect],
    };
  }

  return {
    id: "capability-activation",
    name: "capability activation and movement",
    ticks: 16,
    compareTraceOrder: true,
    createWorld: () => {
      const caster = mkHumanoidEntity(1, 1, 0, 0);
      const pursuer = mkHumanoidEntity(2, 2, to.m(3), 0);
      caster.capabilitySources = [source()];
      return mkWorld(1405, [caster, pursuer]);
    },
    createContext: () => ({ ...BASE_CTX }),
    commandsAtTick: (tick) => {
      const casterCmd = tick % 2 === 0
        ? [{ kind: "activate", sourceId: "core", effectId: "dash" }]
        : [{ kind: "move", dir: v3(1, 0, 0), intensity: q(0.7), mode: "run" }];

      return new Map([
        [1, casterCmd],
        [2, [{ kind: "move", dir: v3(-1, 0, 0), intensity: q(0.6), mode: "run" }]],
      ]) as CommandMap;
    },
  };
}

function moraleRoutingScenario(): KernelParityScenario {
  return {
    id: "morale-routing",
    name: "morale routing and rally pressure",
    ticks: 28,
    compareTraceOrder: true,
    createWorld: () => {
      const brittle = mkHumanoidEntity(1, 1, 0, 0);
      const ally = mkHumanoidEntity(2, 1, to.m(2), 0);
      const enemyA = mkHumanoidEntity(3, 2, to.m(1), 0);
      const enemyB = mkHumanoidEntity(4, 2, to.m(2), to.m(1));
      brittle.condition.fearQ = q(0.70);
      brittle.condition.suppressedTicks = 30;
      brittle.condition.suppressionFearMul = q(1.8);
      enemyA.loadout.items = [STARTER_WEAPONS.find((w) => w.id === "wpn_club")!];
      enemyB.loadout.items = [STARTER_WEAPONS.find((w) => w.id === "wpn_club")!];
      return mkWorld(1406, [brittle, ally, enemyA, enemyB]);
    },
    createContext: () => ({ ...BASE_CTX }),
    commandsAtTick: () => new Map([
      [3, [{ kind: "attack", targetId: 1, weaponId: "wpn_club", intensity: q(1) }]],
      [4, [{ kind: "attack", targetId: 1, weaponId: "wpn_club", intensity: q(1) }]],
    ]),
  };
}

function thermoregulationNutritionScenario(): KernelParityScenario {
  return {
    id: "thermoregulation-nutrition",
    name: "thermoregulation and nutrition crossover",
    ticks: 40,
    compareTraceOrder: false,
    createWorld: () => {
      const traveler = mkHumanoidEntity(1, 1, 0, 0);
      const escort = mkHumanoidEntity(2, 1, to.m(1), 0);

      // Start just above hunger/starvation boundaries so the scenario transitions states quickly.
      traveler.condition.caloricBalance_J = -(23 * 3600 * 80);
      escort.condition.caloricBalance_J = -(11 * 3600 * 80);
      traveler.condition.hydrationBalance_J = -25_000;
      escort.condition.hydrationBalance_J = -15_000;
      traveler.condition.coreTemp_Q = Math.min(SCALE.Q, cToQ(38.5));
      escort.condition.coreTemp_Q = Math.min(SCALE.Q, cToQ(36.0));

      return mkWorld(1407, [traveler, escort]);
    },
    createContext: () => ({
      ...BASE_CTX,
      thermalAmbient_Q: cToQ(14),
      ambientTemperature_Q: cToQ(16),
    }),
    commandsAtTick: () => new Map([
      [1, [{ kind: "move", dir: v3(1, 0, 0), intensity: q(0.8), mode: "walk" }]],
      [2, [{ kind: "move", dir: v3(1, 0, 0), intensity: q(0.6), mode: "walk" }]],
    ]),
  };
}

export const KERNEL_PARITY_SCENARIOS: readonly KernelParityScenario[] = [
  meleeScenario(),
  rangedScenario(),
  grappleScenario(),
  hazardsScenario(),
  capabilityScenario(),
  moraleRoutingScenario(),
  thermoregulationNutritionScenario(),
];
