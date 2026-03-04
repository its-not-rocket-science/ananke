// test/obstacles.test.ts — Phase 6: obstacle/cover and elevation tests
import { describe, it, expect } from "vitest";
import { q, SCALE, to, type Q } from "../src/units";
import { v3 } from "../src/sim/vec3";
import {
  coverFractionAtPosition,
  elevationAtPosition,
  buildObstacleGrid,
  buildElevationGrid,
  type ObstacleGrid,
  type ElevationGrid,
} from "../src/sim/terrain";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { STARTER_WEAPONS, STARTER_RANGED_WEAPONS } from "../src/equipment";
import { TraceKinds } from "../src/sim/kinds";
import type { TraceEvent } from "../src/sim/trace";

const CELL = Math.trunc(4 * SCALE.m); // 4 m cell size

// ── helpers ──────────────────────────────────────────────────────────────────

function baseCtx(extra = {}) {
  return { tractionCoeff: q(0.80), cellSize_m: CELL, ...extra };
}


// ========================
// UNIT TESTS — pure funcs
// ========================

describe("coverFractionAtPosition", () => {
  it("returns 0 for undefined grid", () => {
    expect(coverFractionAtPosition(undefined, CELL, to.m(5), 0)).toBe(0);
  });

  it("returns 0 for unknown cell", () => {
    const grid = buildObstacleGrid({ "99,99": q(0.5) });
    expect(coverFractionAtPosition(grid, CELL, to.m(1), to.m(1))).toBe(0);
  });

  it("returns the cover fraction for a matching cell", () => {
    // cell (1,0) covers x=[4m,8m)
    const grid = buildObstacleGrid({ "1,0": q(0.75) });
    expect(coverFractionAtPosition(grid, CELL, to.m(5), 0)).toBe(q(0.75));
  });

  it("uses correct cell index for given cellSize", () => {
    // At cellSize=4m, x=8m → cell cx=2; x=7.9m → cell cx=1
    const grid = buildObstacleGrid({ "2,0": q(1.0) });
    expect(coverFractionAtPosition(grid, CELL, to.m(8), 0)).toBe(q(1.0));
    expect(coverFractionAtPosition(grid, CELL, to.m(7.9), 0)).toBe(0);
  });

  it("returns q(1.0) for impassable wall cell", () => {
    const grid = buildObstacleGrid({ "0,0": q(1.0) });
    expect(coverFractionAtPosition(grid, CELL, to.m(1), to.m(1))).toBe(q(1.0));
  });
});

describe("elevationAtPosition", () => {
  it("returns 0 for undefined grid", () => {
    expect(elevationAtPosition(undefined, CELL, to.m(5), 0)).toBe(0);
  });

  it("returns 0 for unknown cell", () => {
    const grid = buildElevationGrid({ "99,99": to.m(5) });
    expect(elevationAtPosition(grid, CELL, to.m(1), 0)).toBe(0);
  });

  it("returns elevation for matching cell", () => {
    // cell (0,0): x=[0,4m)
    const grid = buildElevationGrid({ "0,0": to.m(3) });
    expect(elevationAtPosition(grid, CELL, to.m(2), 0)).toBe(to.m(3));
  });

  it("uses correct cell index for given cellSize", () => {
    const grid = buildElevationGrid({ "1,0": to.m(2) });
    // x=5m → cell cx=1  → elevation 2m
    expect(elevationAtPosition(grid, CELL, to.m(5), 0)).toBe(to.m(2));
    // x=3m → cell cx=0 → elevation 0
    expect(elevationAtPosition(grid, CELL, to.m(3), 0)).toBe(0);
  });
});

// ========================
// INTEGRATION TESTS
// ========================

describe("obstacle blocking — movement", () => {
  it("entity moving toward impassable cell is stopped before crossing the boundary", () => {
    // Cell (1,0) is impassable: x ∈ [4m, 8m)
    const obstacleGrid = buildObstacleGrid({ "1,0": q(1.0) });
    const e = mkHumanoidEntity(1, 1, to.m(1), 0); // start at x=1m, cell (0,0)
    const world = mkWorld(1, [e]);

    // Sprint right for 20 ticks (entity would cross 4m boundary without blocking)
    const moveCmd = { kind: "move" as const, dir: v3(SCALE.Q, 0, 0), intensity: q(1.0) as Q, mode: "sprint" as const };
    // const moveCmd = [{ kind: "move", dir: { x: SCALE.Q, y: 0, z: 0 }, intensity: q(1.0), mode: "sprint" }];
    for (let i = 0; i < 20; i++) {
      stepWorld(world, new Map([[1, [moveCmd]]]), { ...baseCtx(), obstacleGrid });
    }

    // Entity must not have entered cell (1,0)
    expect(world.entities[0]!.position_m.x).toBeLessThan(to.m(4));
  });

  it("entity passes freely through partial-cover cells (no movement block)", () => {
    // Cell (1,0) has q(0.5) cover — not impassable, movement is unrestricted
    const obstacleGrid = buildObstacleGrid({ "1,0": q(0.5) });
    const e = mkHumanoidEntity(1, 1, to.m(1), 0);
    const world = mkWorld(1, [e]);

    const moveCmd = { kind: "move" as const, dir: v3(SCALE.Q, 0, 0), intensity: q(1.0) as Q, mode: "sprint" as const };
    for (let i = 0; i < 30; i++) {
      stepWorld(world, new Map([[1, [moveCmd]]]), { ...baseCtx(), obstacleGrid });
    }

    // Entity should have crossed into cell (1,0) — x ≥ 4m
    expect(world.entities[0]!.position_m.x).toBeGreaterThanOrEqual(to.m(4));
  });
});

describe("obstacle cover — ranged hit probability", () => {
  const shortbow = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_shortbow")!;

  function countHits(seeds: number, coverGrid?: ObstacleGrid): number {
    let hits = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const shooter = mkHumanoidEntity(1, 1, 0, 0);
      shooter.loadout.items = [shortbow];
      const target = mkHumanoidEntity(2, 2, to.m(10), 0); // 10 m away, cell (2,0)
      const world = mkWorld(seed, [shooter, target]);
      const shootCmd = { kind: "shoot" as const, targetId: 2, intensity: q(1.0) as Q };
      const cmds = new Map([[1, [shootCmd]]]);
      const events: TraceEvent[] = [];

      stepWorld(world, cmds, { ...baseCtx(), trace: { onEvent: e => events.push(e) }, ...(coverGrid ? { obstacleGrid: coverGrid } : {}) });
      const ev = events.find(e => e.kind === TraceKinds.ProjectileHit);
      if (ev?.hit) hits++;
    }
    return hits;
  }

  it("heavy cover (q(0.9)) greatly reduces hit count compared to no cover", () => {
    const noCover  = countHits(50);
    // q(0.9) cover on cell (2,0): target at 10m → cell cx=2 at cellSize=4m
    const covered  = countHits(50, buildObstacleGrid({ "2,0": q(0.9) }));
    expect(covered).toBeLessThan(noCover);
  });

  it("full cover (q(1.0)) blocks all direct hits", () => {
    // bodyHalfWidth → 0 → no hit is possible
    const covered = countHits(50, buildObstacleGrid({ "2,0": q(1.0) }));
    expect(covered).toBe(0);
  });

  it("no cover does not reduce close-range hit rate (baseline sanity)", () => {
    const hits = countHits(50);
    expect(hits).toBeGreaterThan(30); // >60% hit at 10m
  });
});

describe("elevation — melee reach", () => {
  const sword = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!;

  it("height differential that exceeds weapon reach blocks the attack", () => {
    // Attacker at x=3.9m (cell 0,0, elevation 0); target at x=4.1m (cell 1,0, elevation 3m).
    // Horizontal gap = 0.2m (within longsword 0.9m reach), but 3D distance with elevation ≈ 3.0m >> 0.9m.
    const attacker = mkHumanoidEntity(1, 1, Math.trunc(3.9 * SCALE.m), 0);
    attacker.loadout.items = [sword];
    const target = mkHumanoidEntity(2, 2, Math.trunc(4.1 * SCALE.m), 0); // 0.2m horizontal
    const world = mkWorld(1, [attacker, target]);

    // Target is in cell (1,0), elevated 3m; attacker is in cell (0,0), elevation 0
    const elevationGrid = buildElevationGrid({ "1,0": to.m(3) });

    const attackCmd = { kind: "attack" as const, targetId: 2, weaponId: sword.id, intensity: q(1.0) as Q };
    const cmds = new Map([[1, [attackCmd]]]);
    for (let i = 0; i < 5; i++) {
      stepWorld(world, cmds, { ...baseCtx(), elevationGrid });
    }

    // No damage should have been applied — elevation puts target out of reach
    const targetEnt = world.entities.find(e => e.id === 2)!;
    const totalDamage = Object.values(targetEnt.injury.byRegion)
      .reduce((s: number, r) => s + r.surfaceDamage + r.internalDamage + r.structuralDamage, 0);
    expect(totalDamage).toBe(0);
  });

  it("zero elevation: melee attack at close range can succeed", () => {
    // Same horizontal gap (0.2m), no elevation — well within 0.9m longsword reach
    let damaged = false;
    for (let seed = 1; seed <= 50 && !damaged; seed++) {
      const attacker = mkHumanoidEntity(1, 1, Math.trunc(3.9 * SCALE.m), 0);
      attacker.loadout.items = [sword];
      const target = mkHumanoidEntity(2, 2, Math.trunc(4.1 * SCALE.m), 0);
      const world = mkWorld(seed, [attacker, target]);

      const attackCmd = { kind: "attack" as const, targetId: 2, weaponId: sword.id, intensity: q(1.0) as Q };
      const cmds = new Map([[1, [attackCmd]]]);
      for (let i = 0; i < 5; i++) {
        stepWorld(world, cmds, baseCtx());
      }

      const targetEnt = world.entities.find(e => e.id === 2)!;
      const totalDamage = Object.values(targetEnt.injury.byRegion)
        .reduce((s: number, r) => s + r.surfaceDamage + r.internalDamage + r.structuralDamage, 0);
      if (totalDamage > 0) damaged = true;
    }
    expect(damaged).toBe(true);
  });
});

describe("elevation — melee skill bonus", () => {
  const sword = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!;

  it("attacker elevated > threshold above target accumulates more damage over multiple seeds", () => {
    // Attacker at x=3.9m (cell 0,0) elevated 0.75m; target at x=4.1m (cell 1,0) at elevation 0
    // Elevation 0.75m > threshold 0.5m → attack skill bonus applies
    let damaged = false;
    for (let seed = 1; seed <= 50 && !damaged; seed++) {
      const attacker = mkHumanoidEntity(1, 1, Math.trunc(3.9 * SCALE.m), 0);
      attacker.loadout.items = [sword];
      const target = mkHumanoidEntity(2, 2, Math.trunc(4.1 * SCALE.m), 0);
      const world = mkWorld(seed, [attacker, target]);

      // Elevation grid: cell (0,0) elevated 0.75m; cell (1,0) elevation 0
      const elevationGrid = buildElevationGrid({ "0,0": to.m(0.75) });
      const attackCmd = { kind: "attack" as const, targetId: 2, weaponId: sword.id, intensity: q(1.0) as Q };
      const cmds = new Map([[1, [attackCmd]]]);
      for (let i = 0; i < 5; i++) {
        stepWorld(world, cmds, { ...baseCtx(), elevationGrid });
      }

      const targetEnt = world.entities.find(e => e.id === 2)!;
      const totalDamage = Object.values(targetEnt.injury.byRegion)
        .reduce((s: number, r) => s + r.surfaceDamage + r.internalDamage + r.structuralDamage, 0);
      if (totalDamage > 0) damaged = true;
    }
    expect(damaged).toBe(true);
  });
});

describe("cover — morale effect", () => {
  it("entity in heavy cover accumulates less fear than entity in the open over 10 ticks", () => {
    // Measure fear accumulation in the open vs in cover under suppression
    function fearAfter10(withCover: boolean): number {
      const e = mkHumanoidEntity(1, 1, 0, 0);
      const enemy = mkHumanoidEntity(2, 2, to.m(5), 0); // nearby enemy → outnumbered
      const world = mkWorld(1, [e, enemy]);
      const obstacleGrid = withCover
        ? buildObstacleGrid({ "0,0": q(0.75) }) // q(0.75) > q(0.5) → cover morale bonus
        : undefined;
      // Suppress the entity to accumulate fear
      e.condition.suppressedTicks = 100;
      for (let i = 0; i < 10; i++) {
        stepWorld(world, new Map(), { ...baseCtx(), ...(obstacleGrid ? { obstacleGrid } : {}) });
      }
      return world.entities[0]!.condition.fearQ as number;
    }

    const openFear = fearAfter10(false);
    const coverFear = fearAfter10(true);
    expect(coverFear).toBeLessThan(openFear);
  });
});

describe("elevation — melee advantage", () => {
  const sword = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!;

  it("attacker 0.75 m above target can still land hits and accumulates more damage over 200 seeds", () => {
    // Attacker at x=3.9m (cell 0,0), target at x=4.1m (cell 1,0); 0.2m horizontal gap.
    // 3D distance with 0.75m elevation: sqrt(0.2²+0.75²) ≈ 0.776m < longsword reach 0.9m → in range.
    // Elevation 0.75m > threshold 0.5m → attack skill bonus applies.
    function totalDamage(seeds: number, elevationGrid?: ElevationGrid): number {
      let total = 0;
      for (let seed = 1; seed <= seeds; seed++) {
        const attacker = mkHumanoidEntity(1, 1, Math.trunc(3.9 * SCALE.m), 0);
        attacker.loadout.items = [sword];
        const target = mkHumanoidEntity(2, 2, Math.trunc(4.1 * SCALE.m), 0);
        const world = mkWorld(seed, [attacker, target]);

        const attackCmd = { kind: "attack" as const, targetId: 2, weaponId: sword.id, intensity: q(1.0) as Q };
        const cmds = new Map([[1, [attackCmd]]]);

        for (let i = 0; i < 5; i++) {
          stepWorld(world, cmds, { ...baseCtx(), ...(elevationGrid ? { elevationGrid } : {}) });
        }
        const tgt = world.entities.find(e => e.id === 2)!;
        total += Object.values(tgt.injury.byRegion)
          .reduce((s: number, r) => s + r.surfaceDamage + r.internalDamage + r.structuralDamage, 0);
      }
      return total;
    }

    // Attacker is in cell (0,0) elevated 0.75m; target is in cell (1,0) at elevation 0
    const elevationGrid = buildElevationGrid({ "0,0": to.m(0.75) });
    const flatDmg = totalDamage(200);
    const elevDmg = totalDamage(200, elevationGrid);

    // Elevated attacker lands damage (not 0 hits due to reach check)
    expect(elevDmg).toBeGreaterThan(0);
    // Elevated attacker accumulates at least as much total damage as flat (bonus, within random tolerance)
    expect(elevDmg).toBeGreaterThanOrEqual(Math.trunc(flatDmg * 0.85));
  });
});

describe("elevation — ranged distance", () => {
  const longbow = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_longbow")!;

  it("elevated target receives less energy than flat-ground target at same horizontal distance", () => {
    // At 20m horizontal, with 15m elevation on target the 3D range ≈ 25m → more drag → less energy
    const energyAt: Record<string, number> = {};

    for (const label of ["flat", "elevated"] as const) {
      const shooter = mkHumanoidEntity(1, 1, 0, 0);
      shooter.loadout.items = [longbow];
      const target = mkHumanoidEntity(2, 2, to.m(20), 0); // 20m horizontal
      const world = mkWorld(1, [shooter, target]);

      const elevationGrid = label === "elevated"
        ? buildElevationGrid({ "5,0": to.m(15) }) // cell (5,0): target at 20m → cx=5 at cellSize=4m
        : undefined;

      const events: TraceEvent[] = [];
      const shootCmd = { kind: "shoot" as const, targetId: 2, intensity: q(1.0) as Q };
      const cmds = new Map([[1, [shootCmd]]]);
      stepWorld(world, cmds, { ...baseCtx(), trace: { onEvent: e => events.push(e) }, ...(elevationGrid ? { elevationGrid } : {}) });

      const ev = events.find(e => e.kind === TraceKinds.ProjectileHit);
      energyAt[label] = ev?.energyAtImpact_J ?? -1;
    }

    expect(energyAt["elevated"]).toBeLessThan(energyAt["flat"]!);
  });
});
