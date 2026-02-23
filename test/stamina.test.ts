/**
 * Phase 2B: Stamina and energy model tests.
 *
 * Covers:
 *   - Strike deducts energy from attacker (always, hit or miss)
 *   - Block/parry deducts energy from defender
 *   - Energy regeneration when demand is below continuous power
 *   - Regen is capped at baseline reserve
 *   - Exhaustion functional penalties below 15 % reserve threshold
 *   - Exhaustion collapse: prone + no-defence when reserve = 0 at tick start
 *   - Arcade mode: no collapse on depletion
 *   - staminaMul reduction under exhaustion
 */

import { describe, it, expect } from "vitest";
import { stepWorld } from "../src/sim/kernel";
import { deriveFunctionalState } from "../src/sim/impairment";
import { stepEnergyAndFatigue } from "../src/derive";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { q, to, SCALE } from "../src/units";
import { TUNING } from "../src/sim/tuning";
import { HUMAN_BASE } from "../src/archetypes";
import { generateIndividual } from "../src/generate";
import type { Loadout } from "../src/equipment";

/** DT per tick (same as kernel's DT_S). */
const DT_S = to.s(1 / 20); // 500 in fixed-point

// ---------- helpers ----------

function makeBasicLoadout(): Loadout {
  return {
    items: [
      {
        id: "sword",
        name: "Short Sword",
        kind: "weapon",
        mass_kg: 1000,                       // 1 kg
        bulk: q(0.30),
        reach_m: Math.trunc(1.0 * SCALE.m),  // explicit 1.0 m reach
        damage: {
          surfaceFrac:    q(0.30),
          internalFrac:   q(0.35),
          structuralFrac: q(0.35),
          bleedFactor:    q(0.40),
          penetrationBias: q(0),
        },
      },
    ],
  };
}

/** Entity B placed at 0.5 m — inside the 1 m reach above. */
const B_X = Math.trunc(0.5 * SCALE.m);

// ---------- tests ----------

describe("Phase 2B: strike stamina cost", () => {
  it("attacker energy decreases after issuing an attack command (hit or miss)", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    a.loadout = makeBasicLoadout();
    const b = mkHumanoidEntity(2, 2, B_X, 0);
    const world = mkWorld(42, [a, b]);

    const startEnergy = world.entities[0].energy.reserveEnergy_J;

    const cmds = new Map([[1, [{ kind: "attack", targetId: 2, weaponId: "sword", intensity: q(1.0) }]]]);
    stepWorld(world, cmds, { tractionCoeff: q(1.0), tuning: TUNING.tactical });

    expect(world.entities[0].energy.reserveEnergy_J).toBeLessThan(startEnergy);
  });

  it("strike cost scales with intensity: higher intensity drains more", () => {
    const drainAt = (intensity: number): number => {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      a.loadout = makeBasicLoadout();
      const b = mkHumanoidEntity(2, 2, B_X, 0);
      const world = mkWorld(42, [a, b]);
      const start = world.entities[0].energy.reserveEnergy_J;
      const cmds = new Map([[1, [{ kind: "attack", targetId: 2, weaponId: "sword", intensity }]]]);
      stepWorld(world, cmds, { tractionCoeff: q(1.0), tuning: TUNING.tactical });
      return start - world.entities[0].energy.reserveEnergy_J;
    };

    expect(drainAt(q(1.0))).toBeGreaterThan(drainAt(q(0.2)));
  });

  it("strike cost applies in arcade mode too", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    a.loadout = makeBasicLoadout();
    const b = mkHumanoidEntity(2, 2, B_X, 0);
    const world = mkWorld(42, [a, b]);
    const startEnergy = world.entities[0].energy.reserveEnergy_J;

    const cmds = new Map([[1, [{ kind: "attack", targetId: 2, weaponId: "sword", intensity: q(1.0) }]]]);
    stepWorld(world, cmds, { tractionCoeff: q(1.0), tuning: TUNING.arcade });

    expect(world.entities[0].energy.reserveEnergy_J).toBeLessThan(startEnergy);
  });
});

describe("Phase 2B: defence stamina cost", () => {
  it("defender energy decreases when a block or parry fires", () => {
    let found = false;

    for (let s = 1; s <= 500; s++) {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      a.loadout = makeBasicLoadout();
      const b = mkHumanoidEntity(2, 2, B_X, 0);
      const world = mkWorld(s, [a, b]);
      const startDefE = world.entities[1].energy.reserveEnergy_J;

      const cmds = new Map<number, any[]>([
        [1, [{ kind: "attack", targetId: 2, weaponId: "sword", intensity: q(1.0) }]],
        [2, [{ kind: "defend", mode: "block", intensity: q(1.0) }]],
      ]);
      stepWorld(world, cmds, { tractionCoeff: q(1.0), tuning: TUNING.tactical });

      const endDefE = world.entities[1].energy.reserveEnergy_J;
      // Defence cost ≥ 5 J; regen ≤ 3 J/tick → net drain > 2 if defence fired.
      if (startDefE - endDefE > 2) { found = true; break; }
    }

    expect(found).toBe(true);
  });

  it("active blocker drains more energy than passive defender over matching seeds", () => {
    let found = false;

    for (let s = 1; s <= 500; s++) {
      const buildWorld = (defend: boolean) => {
        const a = mkHumanoidEntity(1, 1, 0, 0);
        a.loadout = makeBasicLoadout();
        const b = mkHumanoidEntity(2, 2, B_X, 0);
        const world = mkWorld(s, [a, b]);
        const cmds = new Map<number, any[]>([
          [1, [{ kind: "attack", targetId: 2, weaponId: "sword", intensity: q(1.0) }]],
          ...(defend ? [[2, [{ kind: "defend", mode: "block", intensity: q(1.0) }]]] as any : []),
        ]);
        const start = world.entities[1].energy.reserveEnergy_J;
        stepWorld(world, cmds, { tractionCoeff: q(1.0), tuning: TUNING.tactical });
        return start - world.entities[1].energy.reserveEnergy_J;
      };

      const drainBlock   = buildWorld(true);
      const drainPassive = buildWorld(false);

      if (drainBlock > drainPassive) { found = true; break; }
    }

    expect(found).toBe(true);
  });
});

describe("Phase 2B: energy regeneration", () => {
  it("surplus continuous power replenishes reserve over 20 ticks", () => {
    // Test stepEnergyAndFatigue directly with controlled, known values.
    const attrs = generateIndividual(1, HUMAN_BASE);
    // Ensure baseline is the reference: use HUMAN_BASE directly
    const baseAttrs = {
      ...attrs,
      performance: {
        ...attrs.performance,
        continuousPower_W: 200,  // guaranteed > idle demand of 80
        reserveEnergy_J: 20000,
      },
      resilience: { ...attrs.resilience, recoveryRate: q(1.0) },
    };

    const state = {
      reserveEnergy_J: Math.trunc(baseAttrs.performance.reserveEnergy_J * 0.5), // 10000 J
      fatigue: q(0),
    };
    const start = state.reserveEnergy_J;

    // Idle demand (80 W) < continuous (200 W) → surplus exists → regen fires.
    for (let i = 0; i < 20; i++) {
      stepEnergyAndFatigue(baseAttrs, state, { items: [] }, 80, DT_S, { tractionCoeff: q(1.0) });
    }

    expect(state.reserveEnergy_J).toBeGreaterThan(start);
  });

  it("regen does not exceed the baseline reserve cap", () => {
    const attrs = generateIndividual(1, HUMAN_BASE);
    const baseAttrs = {
      ...attrs,
      performance: { ...attrs.performance, continuousPower_W: 200, reserveEnergy_J: 20000 },
      resilience: { ...attrs.resilience, recoveryRate: q(2.0) }, // high recovery
    };

    // Start at full
    const state = { reserveEnergy_J: 20000, fatigue: q(0) };

    for (let i = 0; i < 100; i++) {
      stepEnergyAndFatigue(baseAttrs, state, { items: [] }, 80, DT_S, { tractionCoeff: q(1.0) });
    }

    expect(state.reserveEnergy_J).toBeLessThanOrEqual(20000);
  });

  it("higher recoveryRate attribute produces faster regen", () => {
    const attrs = generateIndividual(1, HUMAN_BASE);
    const basePerf = { ...attrs.performance, continuousPower_W: 200, reserveEnergy_J: 20000 };
    const initialReserve = Math.trunc(20000 * 0.5);

    const run = (recoveryRate: number) => {
      const state = { reserveEnergy_J: initialReserve, fatigue: q(0) };
      const a = { ...attrs, performance: basePerf, resilience: { ...attrs.resilience, recoveryRate } };
      for (let i = 0; i < 20; i++) {
        stepEnergyAndFatigue(a, state, { items: [] }, 80, DT_S, { tractionCoeff: q(1.0) });
      }
      return state.reserveEnergy_J;
    };

    expect(run(q(1.5))).toBeGreaterThan(run(q(0.5)));
  });

  it("no regen when demand equals or exceeds continuous power", () => {
    const attrs = generateIndividual(1, HUMAN_BASE);
    const baseAttrs = {
      ...attrs,
      performance: { ...attrs.performance, continuousPower_W: 200, reserveEnergy_J: 20000 },
    };

    const state = { reserveEnergy_J: 10000, fatigue: q(0) };
    const start = state.reserveEnergy_J;

    // Demand = 2 × continuous → large excess drain, no surplus → no regen
    const highDemand = 400;
    for (let i = 0; i < 20; i++) {
      stepEnergyAndFatigue(baseAttrs, state, { items: [] }, highDemand, DT_S, { tractionCoeff: q(1.0) });
    }

    expect(state.reserveEnergy_J).toBeLessThanOrEqual(start);
  });
});

describe("Phase 2B: exhaustion functional penalties", () => {
  it("mobilityMul is lower when reserve is below 15 % of baseline", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    const baseline = a.attributes.performance.reserveEnergy_J;

    a.energy.reserveEnergy_J = baseline;
    const funcFull = deriveFunctionalState(a, TUNING.tactical);

    a.energy.reserveEnergy_J = Math.trunc(baseline * 0.05); // 5 % — well below threshold
    const funcLow = deriveFunctionalState(a, TUNING.tactical);

    expect(funcLow.mobilityMul).toBeLessThan(funcFull.mobilityMul);
  });

  it("manipulationMul is lower when reserve is critically low", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    const baseline = a.attributes.performance.reserveEnergy_J;

    a.energy.reserveEnergy_J = baseline;
    const funcFull = deriveFunctionalState(a, TUNING.tactical);

    a.energy.reserveEnergy_J = 0;
    const funcEmpty = deriveFunctionalState(a, TUNING.tactical);

    expect(funcEmpty.manipulationMul).toBeLessThan(funcFull.manipulationMul);
  });

  it("coordinationMul is lower when depleted", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    const baseline = a.attributes.performance.reserveEnergy_J;

    a.energy.reserveEnergy_J = baseline;
    const funcFull = deriveFunctionalState(a, TUNING.tactical);

    a.energy.reserveEnergy_J = 0;
    const funcEmpty = deriveFunctionalState(a, TUNING.tactical);

    expect(funcEmpty.coordinationMul).toBeLessThan(funcFull.coordinationMul);
  });

  it("staminaMul is lower when exhausted", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    const baseline = a.attributes.performance.reserveEnergy_J;

    a.energy.reserveEnergy_J = baseline;
    const funcFull = deriveFunctionalState(a, TUNING.tactical);

    a.energy.reserveEnergy_J = 0;
    const funcEmpty = deriveFunctionalState(a, TUNING.tactical);

    expect(funcEmpty.staminaMul).toBeLessThan(funcFull.staminaMul);
  });

  it("no exhaustion penalty when reserve is well above 15 % threshold (e.g. 20 %)", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    const baseline = a.attributes.performance.reserveEnergy_J;

    // Full energy
    a.energy.reserveEnergy_J = baseline;
    const funcFull = deriveFunctionalState(a, TUNING.tactical);

    // At 20 % — safely above 15 % threshold, should yield identical multipliers
    a.energy.reserveEnergy_J = Math.trunc(baseline * 0.20);
    const func20 = deriveFunctionalState(a, TUNING.tactical);

    expect(func20.mobilityMul).toBe(funcFull.mobilityMul);
    expect(func20.manipulationMul).toBe(funcFull.manipulationMul);
  });

  it("exhaustion penalty is proportional: 5 % reserve worse than 10 % reserve", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    const baseline = a.attributes.performance.reserveEnergy_J;

    a.energy.reserveEnergy_J = Math.trunc(baseline * 0.10);
    const func10 = deriveFunctionalState(a, TUNING.tactical);

    a.energy.reserveEnergy_J = Math.trunc(baseline * 0.05);
    const func5 = deriveFunctionalState(a, TUNING.tactical);

    expect(func5.mobilityMul).toBeLessThan(func10.mobilityMul);
  });
});

describe("Phase 2B: exhaustion collapse", () => {
  it("entity with zero reserve becomes prone in tactical mode", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    a.energy.reserveEnergy_J = 0;
    const world = mkWorld(1, [a]);

    stepWorld(world, new Map(), { tractionCoeff: q(1.0), tuning: TUNING.tactical });

    expect(world.entities[0].condition.prone).toBe(true);
  });

  it("entity with zero reserve has defence intent cleared in tactical mode", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    a.energy.reserveEnergy_J = 0;
    const world = mkWorld(1, [a]);

    // Issue defend command — should be overridden by collapse gate
    const cmds = new Map([[1, [{ kind: "defend", mode: "block", intensity: q(1.0) }]]]);
    stepWorld(world, cmds, { tractionCoeff: q(1.0), tuning: TUNING.tactical });

    expect(world.entities[0].intent.defence.mode).toBe("none");
  });

  it("no collapse in arcade mode even with zero reserve", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    a.energy.reserveEnergy_J = 0;
    const world = mkWorld(1, [a]);

    stepWorld(world, new Map(), { tractionCoeff: q(1.0), tuning: TUNING.arcade });

    // Arcade: no forced prone from energy depletion
    expect(world.entities[0].condition.prone).toBe(false);
  });

  it("entity with positive (non-zero) reserve does not collapse", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    a.energy.reserveEnergy_J = 1; // minimal positive value
    const world = mkWorld(1, [a]);

    stepWorld(world, new Map(), { tractionCoeff: q(1.0), tuning: TUNING.tactical });

    expect(world.entities[0].condition.prone).toBe(false);
  });

  it("attack on entity with 0 reserve: entity is forced prone before commands execute", () => {
    // The target starts at 0 energy → collapses at tick start → already prone when attack lands.
    const a = mkHumanoidEntity(1, 1, 0, 0);
    a.loadout = makeBasicLoadout();
    const b = mkHumanoidEntity(2, 2, B_X, 0);
    b.energy.reserveEnergy_J = 0; // b is depleted

    const world = mkWorld(42, [a, b]);
    const cmds = new Map<number, any[]>([
      [1, [{ kind: "attack", targetId: 2, weaponId: "sword", intensity: q(1.0) }]],
      [2, [{ kind: "defend", mode: "block", intensity: q(1.0) }]], // should be cleared by collapse
    ]);
    stepWorld(world, cmds, { tractionCoeff: q(1.0), tuning: TUNING.tactical });

    const bAfter = world.entities.find((e: any) => e.id === 2)!;
    expect(bAfter.condition.prone).toBe(true);
    expect(bAfter.intent.defence.mode).toBe("none");
  });
});
