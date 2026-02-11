import { describe, expect, test } from "vitest";

import { noMove, type CommandMap } from "../src/sim/commands";
import type { WorldState } from "../src/sim/world";
import * as WorldModule from "../src/sim/world";
import { aggregateSquad } from "../src/lod";
import { generateIndividual } from "../src/generate";
import { HUMAN_BASE } from "../src/archetypes";
import { q } from "../src/units";

describe("smoke: commands/world/lod", () => {
  test("WorldModule exists", () => {
    expect(WorldModule).toBeTruthy();
  });

  test("noMove returns a valid deterministic move command", () => {
    const m = noMove();
    expect(m.kind).toBe("move");
    expect(m.mode).toBe("walk");
    expect(m.intensity).toBe(q(0));
    expect(m.dir).toEqual({ x: 0, y: 0, z: 0 });
  });

  test("WorldState shape can be constructed and used with CommandMap", () => {
    const cmds: CommandMap = new Map();
    cmds.set(1, [noMove()]);

    const world: WorldState = {
      tick: 0,
      seed: 123,
      entities: [],
    };

    expect(world.tick).toBe(0);
    expect(world.seed).toBe(123);
    expect(world.entities.length).toBe(0);

    expect(cmds.get(1)?.[0]?.kind).toBe("move");
  });

  test("aggregateSquad averages attributes deterministically", () => {
    const a = generateIndividual(101, HUMAN_BASE);
    const b = generateIndividual(202, HUMAN_BASE);

    const agg = aggregateSquad([a, b]);

    expect(agg.count).toBe(2);

    // Mean should sit between the two inputs for a couple of fields (simple sanity).
    expect(agg.mean.morphology.mass_kg).toBeGreaterThanOrEqual(
      Math.min(a.morphology.mass_kg, b.morphology.mass_kg),
    );
    expect(agg.mean.morphology.mass_kg).toBeLessThanOrEqual(
      Math.max(a.morphology.mass_kg, b.morphology.mass_kg),
    );

    expect(agg.cohesion).toBe(q(0.75));
    expect(agg.training).toBe(q(0.65));
  });

  test("aggregateSquad handles empty list (returns count 1 and a valid mean)", () => {
    const agg = aggregateSquad([]);
    expect(agg.count).toBe(1);

    // Basic sanity that mean fields exist and are numbers.
    expect(typeof agg.mean.morphology.mass_kg).toBe("number");
    expect(typeof agg.mean.performance.reserveEnergy_J).toBe("number");
  });
});