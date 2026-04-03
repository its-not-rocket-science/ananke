import { q, SCALE } from "../../src/units.js";
import { mkWorld, mkHumanoidEntity } from "../../src/sim/testing.js";
import { stepWorld } from "../../src/sim/kernel.js";
import { buildWorldIndex } from "../../src/sim/indexing.js";
import { buildSpatialIndex } from "../../src/sim/spatial.js";
import { buildAICommands } from "../../src/sim/ai/system.js";
import { AI_PRESETS } from "../../src/sim/ai/presets.js";
import { STARTER_ARMOUR, STARTER_RANGED_WEAPONS, STARTER_WEAPONS } from "../../src/equipment.js";
import type { KernelContext } from "../../src/sim/context.js";
import type { CommandMap } from "../../src/sim/commands.js";
import type { Entity } from "../../src/sim/entity.js";
import type { WorldState } from "../../src/sim/world.js";
import type { Q } from "../../src/units.js";

export interface ScenarioDefinition {
  id: string;
  label: string;
  ticks: number;
  warmupTicks?: number;
  setup: () => WorldState;
  beforeTick?: (world: WorldState, tick: number) => void;
  collectMemory?: boolean;
}

const LONGSWORD = STARTER_WEAPONS.find((weapon) => weapon.id === "wpn_longsword") ?? STARTER_WEAPONS[0]!;
const LEATHER = STARTER_ARMOUR.find((armour) => armour.id === "arm_leather") ?? STARTER_ARMOUR[0]!;
const SHORTBOW = STARTER_RANGED_WEAPONS.find((weapon) => weapon.id === "rng_shortbow") ?? STARTER_RANGED_WEAPONS[0]!;
const AI_POLICY = AI_PRESETS.lineInfantry!;
const CTX: KernelContext = { tractionCoeff: q(0.75) as Q };

function mkFighter(id: number, teamId: number, xSm: number, ySm: number, ranged: boolean): Entity {
  const entity = mkHumanoidEntity(id, teamId, xSm, ySm);
  entity.loadout = { items: ranged ? [SHORTBOW, LEATHER] : [LONGSWORD, LEATHER] };
  return entity;
}

export function makeLineBattleWorld(
  teamA: number,
  teamB: number,
  { rangedRatio = 0 }: { rangedRatio?: number } = {},
): WorldState {
  const spacing = Math.round(1.8 * SCALE.m);
  const gap = Math.round(10 * SCALE.m);
  const entities: Entity[] = [];
  let nextId = 1;

  for (let i = 0; i < teamA; i++) {
    const x = Math.round((i - (teamA - 1) / 2) * spacing);
    const ranged = i < Math.floor(teamA * rangedRatio);
    entities.push(mkFighter(nextId++, 1, x, 0, ranged));
  }

  for (let i = 0; i < teamB; i++) {
    const x = Math.round((i - (teamB - 1) / 2) * spacing);
    const ranged = i < Math.floor(teamB * rangedRatio);
    entities.push(mkFighter(nextId++, 2, x, gap, ranged));
  }

  return mkWorld(1, entities);
}

export function spawnEntities(world: WorldState, count: number): void {
  const existingMaxId = world.entities.reduce((max, entity) => Math.max(max, entity.id), 0);
  const base = existingMaxId + 1;
  const spacing = Math.round(1.2 * SCALE.m);
  const lane = world.tick % 2 === 0 ? 1 : 2;

  for (let i = 0; i < count; i++) {
    const x = Math.round((i - (count - 1) / 2) * spacing);
    const y = lane === 1 ? 0 : Math.round(10 * SCALE.m);
    world.entities.push(mkFighter(base + i, lane, x, y, i % 4 === 0));
  }
}

export function runAnankeTick(world: WorldState): void {
  const idx = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, 40_000);
  const commands = buildAICommands(world, idx, spatial, () => AI_POLICY) as CommandMap;
  stepWorld(world, commands, CTX);
}
