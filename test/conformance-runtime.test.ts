import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

import { q, SCALE, type Q } from "../src/units.js";
import { mkWorld, mkHumanoidEntity } from "../src/sim/testing.js";
import { stepWorld } from "../src/sim/kernel.js";
import { STARTER_ARMOUR, STARTER_WEAPONS } from "../src/equipment.js";
import { hashWorldState } from "../src/netcode.js";
import { noMove } from "../src/sim/commands.js";
import { WORLD_STEP_PHASE_ORDER } from "../src/sim/step/world-phases.js";
import { buildWorldIndex } from "../src/sim/indexing.js";
import { buildSpatialIndex } from "../src/sim/spatial.js";
import { buildAICommands } from "../src/sim/ai/system.js";
import { AI_PRESETS } from "../src/sim/ai/presets.js";
import type { KernelContext } from "../src/sim/context.js";
import type { WorldState } from "../src/sim/world.js";
import type { Entity } from "../src/sim/entity.js";
import type { CommandMap } from "../src/sim/commands.js";

const CTX: KernelContext = { tractionCoeff: q(0.90) as Q };
const FIXTURE_DIR = "conformance";
const M = SCALE.m;

function hexHash(h: bigint): string {
  return "0x" + h.toString(16).padStart(16, "0");
}

function makeEntity(id: number, teamId: number, x_frac: number): Entity {
  const sword = STARTER_WEAPONS.find((w) => w.id === "wpn_longsword")!;
  const mail = STARTER_ARMOUR.find((a) => a.id === "arm_chainmail");
  const entity = mkHumanoidEntity(id, teamId, Math.trunc(x_frac * M), 0);
  entity.loadout = { items: [sword, ...(mail ? [mail] : [])] };
  return entity;
}

function mkConformanceWorld(): WorldState {
  return mkWorld(42, [makeEntity(1, 1, -0.5), makeEntity(2, 2, 0.5)]);
}

function commandsForStateHashFixture(world: WorldState, commandSource: string): CommandMap {
  if (commandSource === "lineInfantry") {
    const idx = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * M));
    return buildAICommands(world, idx, spatial,
      (eId) => world.entities.find((e) => e.id === eId && !e.injury.dead)
        ? AI_PRESETS.lineInfantry : undefined);
  }

  return new Map([[1, [noMove()]], [2, [noMove()]]]);
}

describe("runtime conformance regression harness", () => {
  const fixtures = readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(`${FIXTURE_DIR}/${file}`, "utf8")) as Record<string, unknown>);

  it("keeps the phase-order contract stable", () => {
    const phaseFixture = fixtures.find((f) => f["kind"] === "phase-order");
    expect(phaseFixture).toBeTruthy();
    expect(WORLD_STEP_PHASE_ORDER).toEqual(phaseFixture!["phases"]);
  });

  for (const fix of fixtures.filter((f) => f["kind"] === "state-hash")) {
    const fixtureId = fix["id"] as string;
    const commandSource = (fix["commandSource"] as string | undefined) ?? "idle";
    const cases = fix["cases"] as Array<{ tick: number; hashHex: string }>;

    it(`reproduces ${fixtureId} hash checkpoints deterministically`, () => {
      const worldA = mkConformanceWorld();
      const worldB = mkConformanceWorld();

      for (const c of cases) {
        while (worldA.tick < c.tick) stepWorld(worldA, commandsForStateHashFixture(worldA, commandSource), CTX);
        while (worldB.tick < c.tick) stepWorld(worldB, commandsForStateHashFixture(worldB, commandSource), CTX);

        expect(hexHash(hashWorldState(worldA))).toBe(c.hashHex);
        expect(hexHash(hashWorldState(worldB))).toBe(c.hashHex);
        expect(hashWorldState(worldA)).toBe(hashWorldState(worldB));
      }
    });
  }
});
