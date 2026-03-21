// test/invariants.test.ts
//
// CE-13 · Property-Based Testing (fast-check)
//
// Verifies that core simulation invariants hold across arbitrary seeds and tick counts.
// Properties checked:
//   1. Fatigue stays in [0, SCALE.Q] after any number of ticks
//   2. Reserve energy never goes negative
//   3. Shock stays in [0, SCALE.Q] during combat
//   4. Consciousness stays in [0, SCALE.Q] during combat
//   5. Fluid loss stays in [0, SCALE.Q] during combat
//   6. All region damage values (surface/internal/structural/bleeding) stay in [0, SCALE.Q]
//   7. permanentDamage ≤ structuralDamage (permanentDamage is a floor set from structuralDamage)
//   8. Dead entities stay dead: once dead=true, no subsequent tick sets dead=false
//   9. Determinism: stepWorld on two structuredClones with identical commands → identical state

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { q, SCALE }                         from "../src/units.js";
import { stepWorld }                         from "../src/sim/kernel.js";
import { mkHumanoidEntity, mkWorld }         from "../src/sim/testing.js";
import { CommandKinds, EngageModes }         from "../src/sim/kinds.js";
import type { KernelContext }                from "../src/sim/context.js";
import type { CommandMap }                   from "../src/sim/commands.js";
import type { Entity }                       from "../src/sim/entity.js";
import type { WorldState }                   from "../src/sim/world.js";

// ─── shared setup ─────────────────────────────────────────────────────────────

const ctx: KernelContext = { tractionCoeff: q(1.0) };

/** Both entities swing at each other every tick. */
const combatCmds = (): CommandMap => new Map([
  [1, [{ kind: CommandKinds.AttackNearest, mode: EngageModes.Strike }]],
  [2, [{ kind: CommandKinds.AttackNearest, mode: EngageModes.Strike }]],
]);

/** Run stepWorld for n ticks with combat commands. */
function runCombat(world: WorldState, ticks: number): void {
  const cmds = combatCmds();
  for (let i = 0; i < ticks; i++) stepWorld(world, cmds, ctx);
}

/** Run stepWorld for n ticks with no commands (idle). */
function runIdle(world: WorldState, ticks: number): void {
  const cmds: CommandMap = new Map();
  for (let i = 0; i < ticks; i++) stepWorld(world, cmds, ctx);
}

// ─── arbitraries ──────────────────────────────────────────────────────────────

/** Positive 31-bit seed — avoids sign confusion in bitwise ops inside the kernel. */
const seedArb  = fc.integer({ min: 1, max: 0x7fff_ffff });

/** Short tick count — keeps the suite fast while still exercising multi-tick state. */
const ticksArb = fc.integer({ min: 1, max: 30 });

// ─── per-entity checkers ──────────────────────────────────────────────────────

function inRange(v: number, lo: number, hi: number): boolean {
  return Number.isFinite(v) && v >= lo && v <= hi;
}

function checkEnergyBounds(e: Entity): string | null {
  if (!inRange(e.energy.fatigue, 0, SCALE.Q))
    return `entity ${e.id}: fatigue ${e.energy.fatigue} outside [0, ${SCALE.Q}]`;
  if (e.energy.reserveEnergy_J < 0)
    return `entity ${e.id}: reserveEnergy_J ${e.energy.reserveEnergy_J} < 0`;
  return null;
}

function checkInjuryBounds(e: Entity): string | null {
  const inj = e.injury;
  if (!inRange(inj.shock, 0, SCALE.Q))
    return `entity ${e.id}: shock ${inj.shock} outside [0, ${SCALE.Q}]`;
  if (!inRange(inj.consciousness, 0, SCALE.Q))
    return `entity ${e.id}: consciousness ${inj.consciousness} outside [0, ${SCALE.Q}]`;
  if (!inRange(inj.fluidLoss, 0, SCALE.Q))
    return `entity ${e.id}: fluidLoss ${inj.fluidLoss} outside [0, ${SCALE.Q}]`;
  for (const [regionId, reg] of Object.entries(inj.byRegion)) {
    if (!inRange(reg.surfaceDamage,    0, SCALE.Q))
      return `entity ${e.id} region ${regionId}: surfaceDamage ${reg.surfaceDamage} outside [0, ${SCALE.Q}]`;
    if (!inRange(reg.internalDamage,   0, SCALE.Q))
      return `entity ${e.id} region ${regionId}: internalDamage ${reg.internalDamage} outside [0, ${SCALE.Q}]`;
    if (!inRange(reg.structuralDamage, 0, SCALE.Q))
      return `entity ${e.id} region ${regionId}: structuralDamage ${reg.structuralDamage} outside [0, ${SCALE.Q}]`;
    if (!inRange(reg.bleedingRate,     0, SCALE.Q))
      return `entity ${e.id} region ${regionId}: bleedingRate ${reg.bleedingRate} outside [0, ${SCALE.Q}]`;
    if (!inRange(reg.permanentDamage,  0, SCALE.Q))
      return `entity ${e.id} region ${regionId}: permanentDamage ${reg.permanentDamage} outside [0, ${SCALE.Q}]`;
  }
  return null;
}

function checkDamageMonotonicity(e: Entity): string | null {
  for (const [regionId, reg] of Object.entries(e.injury.byRegion)) {
    // permanentDamage is set from structuralDamage when it crosses FRACTURE_THRESHOLD;
    // without treatment it can never exceed the current structuralDamage level.
    if (reg.permanentDamage > reg.structuralDamage)
      return `entity ${e.id} region ${regionId}: permanentDamage (${reg.permanentDamage}) > structuralDamage (${reg.structuralDamage})`;
  }
  return null;
}

function assertAllEntities(world: WorldState, check: (e: Entity) => string | null): void {
  for (const e of world.entities) {
    const err = check(e);
    if (err !== null) expect.fail(err);
  }
}

// ─── determinism helper ───────────────────────────────────────────────────────

/** Extract scalar fields that must be identical between two deterministic runs. */
function entityFingerprint(e: Entity): string {
  const inj = e.injury;
  const regionParts = Object.entries(inj.byRegion)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, r]) =>
      `${id}:s${r.surfaceDamage},i${r.internalDamage},t${r.structuralDamage},b${r.bleedingRate},p${r.permanentDamage}`
    )
    .join("|");
  return [
    `id:${e.id}`,
    `fat:${e.energy.fatigue}`,
    `res:${e.energy.reserveEnergy_J}`,
    `shk:${inj.shock}`,
    `con:${inj.consciousness}`,
    `flu:${inj.fluidLoss}`,
    `dead:${inj.dead}`,
    `px:${e.position_m.x},py:${e.position_m.y}`,
    `vx:${e.velocity_mps.x},vy:${e.velocity_mps.y}`,
    regionParts,
  ].join(";");
}

function worldFingerprint(world: WorldState): string {
  return `tick:${world.tick};` +
    world.entities.map(entityFingerprint).join("||");
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("CE-13 · Simulation invariants (property-based)", () => {

  it("fatigue stays in [0, SCALE.Q] under idle ticks", () => {
    fc.assert(
      fc.property(seedArb, ticksArb, (seed, ticks) => {
        const world = mkWorld(seed, [mkHumanoidEntity(1, 1, 0, 0)]);
        runIdle(world, ticks);
        assertAllEntities(world, checkEnergyBounds);
      }),
      { numRuns: 200 },
    );
  });

  it("fatigue stays in [0, SCALE.Q] during combat", () => {
    fc.assert(
      fc.property(seedArb, ticksArb, (seed, ticks) => {
        const world = mkWorld(seed, [
          mkHumanoidEntity(1, 1, 0, 0),
          mkHumanoidEntity(2, 2, 0, 0),
        ]);
        runCombat(world, ticks);
        assertAllEntities(world, checkEnergyBounds);
      }),
      { numRuns: 200 },
    );
  });

  it("shock stays in [0, SCALE.Q] during combat", () => {
    fc.assert(
      fc.property(seedArb, ticksArb, (seed, ticks) => {
        const world = mkWorld(seed, [
          mkHumanoidEntity(1, 1, 0, 0),
          mkHumanoidEntity(2, 2, 0, 0),
        ]);
        runCombat(world, ticks);
        for (const e of world.entities) {
          const err = (() => {
            if (!inRange(e.injury.shock, 0, SCALE.Q))
              return `entity ${e.id}: shock ${e.injury.shock} outside [0, ${SCALE.Q}]`;
            return null;
          })();
          if (err) expect.fail(err);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("consciousness stays in [0, SCALE.Q] during combat", () => {
    fc.assert(
      fc.property(seedArb, ticksArb, (seed, ticks) => {
        const world = mkWorld(seed, [
          mkHumanoidEntity(1, 1, 0, 0),
          mkHumanoidEntity(2, 2, 0, 0),
        ]);
        runCombat(world, ticks);
        for (const e of world.entities) {
          if (!inRange(e.injury.consciousness, 0, SCALE.Q))
            expect.fail(`entity ${e.id}: consciousness ${e.injury.consciousness} outside [0, ${SCALE.Q}]`);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("all region damage values stay in [0, SCALE.Q] during combat", () => {
    fc.assert(
      fc.property(seedArb, ticksArb, (seed, ticks) => {
        const world = mkWorld(seed, [
          mkHumanoidEntity(1, 1, 0, 0),
          mkHumanoidEntity(2, 2, 0, 0),
        ]);
        runCombat(world, ticks);
        assertAllEntities(world, checkInjuryBounds);
      }),
      { numRuns: 200 },
    );
  });

  it("permanentDamage never exceeds structuralDamage in any region", () => {
    fc.assert(
      fc.property(seedArb, ticksArb, (seed, ticks) => {
        const world = mkWorld(seed, [
          mkHumanoidEntity(1, 1, 0, 0),
          mkHumanoidEntity(2, 2, 0, 0),
        ]);
        runCombat(world, ticks);
        assertAllEntities(world, checkDamageMonotonicity);
      }),
      { numRuns: 200 },
    );
  });

  it("dead entities stay dead across subsequent ticks", () => {
    fc.assert(
      fc.property(seedArb, ticksArb, (seed, ticks) => {
        const a = mkHumanoidEntity(1, 1, 0, 0);
        const b = mkHumanoidEntity(2, 2, 0, 0);
        // Kill entity 2 before the simulation starts
        b.injury.dead = true;
        b.injury.consciousness = q(0);

        const world = mkWorld(seed, [a, b]);
        runCombat(world, ticks);

        const entityB = world.entities.find(e => e.id === 2);
        if (!entityB) expect.fail("entity 2 disappeared from world");
        if (!entityB.injury.dead)
          expect.fail(`entity 2 was resurrected after ${ticks} ticks`);
      }),
      { numRuns: 200 },
    );
  });

  it("stepWorld is deterministic: two clones with identical commands produce identical state", () => {
    fc.assert(
      fc.property(seedArb, ticksArb, (seed, ticks) => {
        const worldA = mkWorld(seed, [
          mkHumanoidEntity(1, 1, 0, 0),
          mkHumanoidEntity(2, 2, 0, 0),
        ]);
        const worldB = structuredClone(worldA);

        // Step both worlds identically
        const cmdsA = combatCmds();
        const cmdsB = combatCmds();
        for (let i = 0; i < ticks; i++) {
          stepWorld(worldA, cmdsA, ctx);
          stepWorld(worldB, cmdsB, ctx);
        }

        const fpA = worldFingerprint(worldA);
        const fpB = worldFingerprint(worldB);
        if (fpA !== fpB)
          expect.fail(`determinism violation at seed=${seed} ticks=${ticks}:\nA: ${fpA}\nB: ${fpB}`);
      }),
      { numRuns: 100 },  // fewer runs — each does 2× the work
    );
  });

  it("single-tick determinism holds for a wide range of seeds", () => {
    // Faster companion to the multi-tick test: 500 seeds, 1 tick each.
    fc.assert(
      fc.property(seedArb, (seed) => {
        const worldA = mkWorld(seed, [
          mkHumanoidEntity(1, 1, 0, 0),
          mkHumanoidEntity(2, 2, 0, 0),
        ]);
        const worldB = structuredClone(worldA);
        const cmds = combatCmds();
        stepWorld(worldA, cmds, ctx);
        stepWorld(worldB, combatCmds(), ctx);
        const fpA = worldFingerprint(worldA);
        const fpB = worldFingerprint(worldB);
        if (fpA !== fpB)
          expect.fail(`single-tick determinism violation at seed=${seed}`);
      }),
      { numRuns: 500 },
    );
  });

});
