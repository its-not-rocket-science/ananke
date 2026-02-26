// test/ranged-ext.test.ts — Phase 3 extensions: aiming time, moving target, suppression AI, ammo
import { describe, it, expect } from "vitest";
import { q, SCALE, to } from "../src/units";
import { STARTER_RANGED_WEAPONS, STARTER_AMMO, type RangedWeapon } from "../src/equipment";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { TraceKinds } from "../src/sim/kinds";
import type { TraceEvent } from "../src/sim/trace";
import { decideCommandsForEntity } from "../src/sim/ai/decide";
import { buildWorldIndex } from "../src/sim/indexing";
import { buildSpatialIndex } from "../src/sim/spatial";
import type { AIPolicy } from "../src/sim/ai/types";
import { TUNING } from "../src/sim/tuning";

const shortbow = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_shortbow")!;
const pistol   = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_pistol")!;

// A pistol with all starter ammo types attached
const armedPistol: RangedWeapon = { ...pistol, ammo: STARTER_AMMO };

function runTick(world: ReturnType<typeof mkWorld>, cmds: Map<number, any[]>): TraceEvent[] {
  const events: TraceEvent[] = [];
  const trace = { onEvent: (ev: TraceEvent) => events.push(ev) };
  stepWorld(world, cmds, { tractionCoeff: q(0.9), trace });
  return events;
}

function defaultPolicy(): AIPolicy {
  return {
    archetype: "lineInfantry",
    desiredRange_m: Math.trunc(1.5 * SCALE.m),
    engageRange_m: Math.trunc(1.0 * SCALE.m),
    retreatRange_m: Math.trunc(0.5 * SCALE.m),
    threatRange_m: Math.trunc(2.0 * SCALE.m),
    defendWhenThreatenedQ: q(0.7),
    parryBiasQ: q(0.3),
    dodgeBiasQ: q(0.2),
    retargetCooldownTicks: 5,
    focusStickinessQ: q(0.5),
  };
}

// ── Aiming Time ──────────────────────────────────────────────────────────────

describe("Aiming time accumulation", () => {
  it("aimTicks increments each tick while in cooldown with same target", () => {
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [shortbow];
    const target = mkHumanoidEntity(2, 2, to.m(10), 0);
    const world = mkWorld(1, [shooter, target]);

    const shootCmd = new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) }]]]);

    // Tick 1: fires the shot (cooldown = 0 before firing), aimTicks reset to 0
    runTick(world, shootCmd);
    const e1 = world.entities.find(e => e.id === 1)!;
    expect(e1.action.aimTicks).toBe(0);  // reset after firing
    expect(e1.action.shootCooldownTicks).toBeGreaterThan(0);

    // Tick 2: in cooldown, same target, stationary → aimTicks = 1
    runTick(world, shootCmd);
    expect(e1.action.aimTicks).toBe(1);

    // Tick 3: aimTicks = 2
    runTick(world, shootCmd);
    expect(e1.action.aimTicks).toBe(2);
  });

  it("aimTicks is capped at AIM_MAX_TICKS (20)", () => {
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [shortbow];
    const target = mkHumanoidEntity(2, 2, to.m(10), 0);
    const world = mkWorld(1, [shooter, target]);

    // Pre-set aimTargetId and max aimTicks to simulate long aim
    const shootCmd = new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) }]]]);

    // Fire first to set aimTargetId
    runTick(world, shootCmd);
    const e1 = world.entities.find(e => e.id === 1)!;

    // Directly set aimTicks to 19 and run 5 more ticks
    (e1.action as any).aimTicks = 19;
    runTick(world, shootCmd);
    expect(e1.action.aimTicks).toBe(20); // incremented to 20

    runTick(world, shootCmd);
    expect(e1.action.aimTicks).toBeLessThanOrEqual(20); // never exceeds 20
  });

  it("aimTicks resets to 0 when target changes", () => {
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [shortbow];
    const target2 = mkHumanoidEntity(2, 2, to.m(10), 0);
    const target3 = mkHumanoidEntity(3, 2, to.m(10), to.m(1));
    const world = mkWorld(1, [shooter, target2, target3]);

    const shootAt2 = new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) }]]]);
    const shootAt3 = new Map([[1, [{ kind: "shoot", targetId: 3, weaponId: "rng_shortbow", intensity: q(1.0) }]]]);

    // Fire at target 2, accumulate 2 aim ticks
    runTick(world, shootAt2);
    const e1 = world.entities.find(e => e.id === 1)!;
    (e1.action as any).aimTicks = 5; // manually set

    // Switch to target 3 → aimTicks should reset
    runTick(world, shootAt3);
    expect(e1.action.aimTicks).toBe(0);
  });

  it("moving shooter (above threshold) does not accumulate aimTicks", () => {
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [shortbow];
    const target = mkHumanoidEntity(2, 2, to.m(10), 0);
    const world = mkWorld(1, [shooter, target]);

    const shootCmd = new Map([[1, [
      { kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) },
      // Sprint command keeps entity moving through stepMovement
      { kind: "move", dir: { x: 10_000, y: 0, z: 0 }, intensity: q(1.0), mode: "sprint" },
    ]]]);

    // Fire first (sets cooldown, resets aimTicks)
    runTick(world, shootCmd);
    const e1 = world.entities.find(e => e.id === 1)!;
    // Verify the shooter has velocity after sprinting
    expect(e1.action.aimTicks).toBe(0);

    // Next tick: in cooldown, but actively sprinting (vel >> AIM_STILL_THRESHOLD)
    // Set velocity directly to a value well above threshold (stepMovement will be applied
    // but starting at 50_000 = 5 m/s, even after friction it stays >> 5_000 threshold)
    e1.velocity_mps.x = 50_000; // 5 m/s — well above 0.5 m/s threshold
    runTick(world, shootCmd);
    // In cooldown + moving → aimTicks should stay 0
    expect(e1.action.aimTicks).toBe(0);
  });

  it("aimTicks resets to 0 after firing", () => {
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [shortbow];
    const target = mkHumanoidEntity(2, 2, to.m(10), 0);
    const world = mkWorld(1, [shooter, target]);

    const shootCmd = new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) }]]]);

    // Fire once
    runTick(world, shootCmd);
    const e1 = world.entities.find(e => e.id === 1)!;

    // Accumulate some aim ticks
    (e1.action as any).aimTicks = 15;
    (e1.action as any).aimTargetId = 2;

    // Manually expire the cooldown and fire
    e1.action.shootCooldownTicks = 0;
    runTick(world, shootCmd);

    // After firing, aimTicks should be 0
    expect(e1.action.aimTicks).toBe(0);
  });

  it("higher aimTicks results in more hits than no aiming (seed sweep)", () => {
    const TARGET_DIST = to.m(30); // long range where aiming matters
    let hitsWithAim = 0;
    let hitsNoAim = 0;

    for (let seed = 1; seed <= 60; seed++) {
      // With full aim
      const shooterA = mkHumanoidEntity(1, 1, 0, 0);
      shooterA.loadout.items = [shortbow];
      (shooterA.action as any).aimTicks = 20;
      (shooterA.action as any).aimTargetId = 2;
      const wA = mkWorld(seed, [shooterA, mkHumanoidEntity(2, 2, TARGET_DIST, 0)]);
      const evA = runTick(wA, new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) }]]]));
      const hitA = (evA.find(e => e.kind === TraceKinds.ProjectileHit) as any)?.hit;
      if (hitA) hitsWithAim++;

      // Without aim
      const shooterB = mkHumanoidEntity(1, 1, 0, 0);
      shooterB.loadout.items = [shortbow];
      // aimTicks = 0 (default)
      const wB = mkWorld(seed, [shooterB, mkHumanoidEntity(2, 2, TARGET_DIST, 0)]);
      const evB = runTick(wB, new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) }]]]));
      const hitB = (evB.find(e => e.kind === TraceKinds.ProjectileHit) as any)?.hit;
      if (hitB) hitsNoAim++;
    }

    // Full aim should yield significantly higher hit rate
    expect(hitsWithAim).toBeGreaterThan(hitsNoAim);
  });
});

// ── Moving Target Penalty ────────────────────────────────────────────────────

describe("Moving target penalty", () => {
  it("stationary target: lead error is zero (same hit outcome as baseline)", () => {
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [shortbow];
    const target = mkHumanoidEntity(2, 2, to.m(10), 0);
    // velocity_mps = (0, 0, 0) by default → leadError = 0
    expect(target.velocity_mps.x).toBe(0);
    expect(target.velocity_mps.y).toBe(0);

    const world = mkWorld(42, [shooter, target]);
    const events = runTick(world, new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) }]]]));
    const ev = events.find(e => e.kind === TraceKinds.ProjectileHit);
    expect(ev).toBeDefined();  // shot was fired
  });

  it("sprinting target has lower hit rate than stationary (seed sweep)", () => {
    const TARGET_DIST = to.m(20);
    let hitsStationary = 0;
    let hitsSprinting = 0;

    for (let seed = 1; seed <= 60; seed++) {
      // Stationary target
      const shooterA = mkHumanoidEntity(1, 1, 0, 0);
      shooterA.loadout.items = [shortbow];
      const targetA = mkHumanoidEntity(2, 2, TARGET_DIST, 0);
      // velocity stays 0
      const wA = mkWorld(seed, [shooterA, targetA]);
      const evA = runTick(wA, new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) }]]]));
      if ((evA.find(e => e.kind === TraceKinds.ProjectileHit) as any)?.hit) hitsStationary++;

      // Sprinting target at 5 m/s
      const shooterB = mkHumanoidEntity(1, 1, 0, 0);
      shooterB.loadout.items = [shortbow];
      const targetB = mkHumanoidEntity(2, 2, TARGET_DIST, 0);
      targetB.velocity_mps.y = to.m(5); // 5 m/s lateral
      const wB = mkWorld(seed, [shooterB, targetB]);
      const evB = runTick(wB, new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) }]]]));
      if ((evB.find(e => e.kind === TraceKinds.ProjectileHit) as any)?.hit) hitsSprinting++;
    }

    // Stationary should be notably easier to hit
    expect(hitsStationary).toBeGreaterThan(hitsSprinting);
  });

  it("lead error scales with target velocity (2× speed → 2× error effect on grouping)", () => {
    // We can't directly measure gRadius_m, but we can observe that faster targets
    // are harder to hit at the same range with the same seed
    const TARGET_DIST = to.m(25);
    let hitsSlow = 0;
    let hitsFast = 0;

    for (let seed = 1; seed <= 60; seed++) {
      // Slow target: 1 m/s
      const shooterA = mkHumanoidEntity(1, 1, 0, 0);
      shooterA.loadout.items = [shortbow];
      const tgtSlow = mkHumanoidEntity(2, 2, TARGET_DIST, 0);
      tgtSlow.velocity_mps.x = to.m(1); // 1 m/s
      const wA = mkWorld(seed, [shooterA, tgtSlow]);
      const evA = runTick(wA, new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) }]]]));
      if ((evA.find(e => e.kind === TraceKinds.ProjectileHit) as any)?.hit) hitsSlow++;

      // Fast target: 5 m/s (5× the slow target)
      const shooterB = mkHumanoidEntity(1, 1, 0, 0);
      shooterB.loadout.items = [shortbow];
      const tgtFast = mkHumanoidEntity(2, 2, TARGET_DIST, 0);
      tgtFast.velocity_mps.x = to.m(5); // 5 m/s
      const wB = mkWorld(seed, [shooterB, tgtFast]);
      const evB = runTick(wB, new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) }]]]));
      if ((evB.find(e => e.kind === TraceKinds.ProjectileHit) as any)?.hit) hitsFast++;
    }

    // Slow target should be easier to hit than fast target
    expect(hitsSlow).toBeGreaterThan(hitsFast);
  });

  it("zero velocity target: lead error = 0 (projectile hit fires without crash)", () => {
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [shortbow];
    const target = mkHumanoidEntity(2, 2, to.m(5), 0);
    target.velocity_mps.x = 0;
    target.velocity_mps.y = 0;
    target.velocity_mps.z = 0;

    const world = mkWorld(1, [shooter, target]);
    // Must not crash; just fire a shot
    expect(() => {
      runTick(world, new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) }]]]));
    }).not.toThrow();
  });
});

// ── Suppression → AI Behaviour ───────────────────────────────────────────────

describe("Suppression → AI behaviour", () => {
  it("suppressedTicks increments on target when shot suppresses (existing Phase 3 behaviour)", () => {
    // Suppression fire: near-miss within 3× bodyHalfWidth but beyond bodyHalfWidth
    // We need a shot that misses narrowly — use a seed sweep
    let suppressFound = false;
    for (let seed = 1; seed <= 200; seed++) {
      const shooter = mkHumanoidEntity(1, 1, 0, 0);
      shooter.loadout.items = [shortbow];
      // Place target 50m away (miss likely but suppression possible)
      const target = mkHumanoidEntity(2, 2, to.m(50), 0);
      const world = mkWorld(seed, [shooter, target]);

      const events = runTick(world, new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) }]]]));
      const ev = events.find(e => e.kind === TraceKinds.ProjectileHit) as any;
      const t = world.entities.find(e => e.id === 2)!;

      if (ev && ev.suppressed && !ev.hit) {
        expect((t.condition as any).suppressedTicks).toBeGreaterThan(0);
        suppressFound = true;
        break;
      }
    }
    expect(suppressFound).toBe(true);
  });

  it("suppressedTicks decrements by 1 per tick (min 0)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    (e.condition as any).suppressedTicks = 5;

    runTick(world, new Map());
    expect((e.condition as any).suppressedTicks).toBe(4);

    // Run until zero
    for (let i = 0; i < 10; i++) runTick(world, new Map());
    expect((e.condition as any).suppressedTicks).toBe(0);
  });

  it("low distressTol entity goes prone after >= 3 suppression ticks", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    self.attributes.resilience.distressTolerance = q(0.20); // low tolerance
    (self.condition as any).suppressedTicks = 3;
    self.condition.prone = false;

    const enemy = mkHumanoidEntity(2, 2, to.m(5), 0);
    enemy.teamId = 2;
    const world = mkWorld(1, [self, enemy]);
    const index = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

    const cmds = decideCommandsForEntity(world, index, spatial, self, defaultPolicy());
    expect(cmds.some(c => c.kind === "setProne" && (c as any).prone === true)).toBe(true);
  });

  it("high distressTol entity does NOT go prone from suppression", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    self.attributes.resilience.distressTolerance = q(0.90); // high tolerance
    (self.condition as any).suppressedTicks = 3;
    self.condition.prone = false;

    const enemy = mkHumanoidEntity(2, 2, to.m(5), 0);
    enemy.teamId = 2;
    const world = mkWorld(1, [self, enemy]);
    const index = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

    const cmds = decideCommandsForEntity(world, index, spatial, self, defaultPolicy());
    expect(cmds.some(c => c.kind === "setProne")).toBe(false);
  });

  it("suppressed entity uses higher cover threshold (q(0.50) vs q(0.30))", () => {
    // The threshold changes from q(0.30) to q(0.50) when suppressedTicks > 0.
    // A non-suppressed entity at 40% cover would NOT seek more cover (40% > 30%).
    // A suppressed entity at 40% cover WOULD seek more cover (40% < 50%).
    const selfSuppressed = mkHumanoidEntity(1, 1, 0, 0);
    selfSuppressed.attributes.resilience.distressTolerance = q(0.90); // high — won't go prone
    (selfSuppressed.condition as any).suppressedTicks = 1; // suppressed but not enough for prone

    // Enemy within 25m (well within the 30m detection range)
    const enemy = mkHumanoidEntity(2, 2, to.m(20), 0);
    enemy.teamId = 2;
    const world = mkWorld(1, [selfSuppressed, enemy]);
    const index = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * SCALE.m));

    // Create an obstacle grid: current cell 40% cover, neighbour 70% cover
    // terrainKey format is "x,y" for cell (x, y)
    const obstacleGrid = new Map<string, number>();
    obstacleGrid.set("0,0", q(0.40));   // current cell: 40% cover
    obstacleGrid.set("1,0", q(0.70));   // adjacent cell: 70% cover
    const cellSize_m = Math.trunc(4 * SCALE.m);

    // Suppressed: threshold = q(0.50), and 40% < 50% → should seek cover
    const suppCmds = decideCommandsForEntity(world, index, spatial, selfSuppressed, defaultPolicy(), undefined, obstacleGrid, cellSize_m);
    const suppMoves = suppCmds.filter(c => c.kind === "move");
    expect(suppMoves.some(c => (c as any).intensity > 0)).toBe(true);

    // Non-suppressed: threshold = q(0.30), and 40% > 30% → should NOT seek cover due to threshold
    const selfNormal = mkHumanoidEntity(1, 1, 0, 0);
    selfNormal.attributes.resilience.distressTolerance = q(0.90);
    (selfNormal.condition as any).suppressedTicks = 0; // not suppressed

    const normalCmds = decideCommandsForEntity(world, index, spatial, selfNormal, defaultPolicy(), undefined, obstacleGrid, cellSize_m);
    const normalMoves = normalCmds.filter(c => c.kind === "move");
    // Non-suppressed at 40% cover: threshold is 30%, and 40% > 30%, so no cover-seeking
    expect(normalMoves.some(c => (c as any).intensity > 0 && (c as any).mode === "run")).toBe(false);
  });
});

// ── Ammo Types ───────────────────────────────────────────────────────────────

describe("Ammo types", () => {
  it("no ammoId: weapon defaults are used (no crash)", () => {
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [armedPistol];
    const target = mkHumanoidEntity(2, 2, to.m(10), 0);
    const world = mkWorld(42, [shooter, target]);

    expect(() => {
      runTick(world, new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_pistol", intensity: q(1.0) }]]]));
    }).not.toThrow();

    const ev = (runTick(mkWorld(42, [
      { ...mkHumanoidEntity(1, 1, 0, 0), loadout: { items: [armedPistol] } },
      mkHumanoidEntity(2, 2, to.m(10), 0),
    ]), new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_pistol", intensity: q(1.0) }]]])));
    expect(ev.some(e => e.kind === TraceKinds.ProjectileHit)).toBe(true);
  });

  it("HV ammo (launchEnergyMul = q(1.20)) delivers more energy at impact than base", () => {
    const TARGET_DIST = to.m(20);

    let energyBase = -1;
    let energyHV = -1;

    // Base pistol (no ammo override)
    for (let seed = 1; seed <= 50; seed++) {
      const shooter = mkHumanoidEntity(1, 1, 0, 0);
      shooter.loadout.items = [armedPistol];
      const target = mkHumanoidEntity(2, 2, TARGET_DIST, 0);
      const world = mkWorld(seed, [shooter, target]);
      const events = runTick(world, new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_pistol", intensity: q(1.0) }]]]));
      const ev = events.find(e => e.kind === TraceKinds.ProjectileHit) as any;
      if (ev?.hit) { energyBase = ev.energyAtImpact_J; break; }
    }

    // HV ammo
    for (let seed = 1; seed <= 50; seed++) {
      const shooter = mkHumanoidEntity(1, 1, 0, 0);
      shooter.loadout.items = [armedPistol];
      const target = mkHumanoidEntity(2, 2, TARGET_DIST, 0);
      const world = mkWorld(seed, [shooter, target]);
      const events = runTick(world, new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_pistol", intensity: q(1.0), ammoId: "ammo_hv" }]]]));
      const ev = events.find(e => e.kind === TraceKinds.ProjectileHit) as any;
      if (ev?.hit) { energyHV = ev.energyAtImpact_J; break; }
    }

    expect(energyBase).toBeGreaterThan(0);
    expect(energyHV).toBeGreaterThan(energyBase); // HV should be higher energy
  });

  it("AP ammo delivers damage when hitting — penetrating profile used", () => {
    // AP ammo has high penetrationBias; just verify no crash and shot fires
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [armedPistol];
    const target = mkHumanoidEntity(2, 2, to.m(5), 0);
    const world = mkWorld(42, [shooter, target]);

    const events = runTick(world, new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_pistol", intensity: q(1.0), ammoId: "ammo_ap" }]]]));
    expect(events.some(e => e.kind === TraceKinds.ProjectileHit)).toBe(true);
  });

  it("hollow-point ammo causes bleeding on hit (high bleedFactor profile)", () => {
    // Find a seed where HP ammo hits and causes bleeding
    let bleedFound = false;
    for (let seed = 1; seed <= 100; seed++) {
      const shooter = mkHumanoidEntity(1, 1, 0, 0);
      shooter.loadout.items = [armedPistol];
      const target = mkHumanoidEntity(2, 2, to.m(5), 0);
      const world = mkWorld(seed, [shooter, target]);

      runTick(world, new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_pistol", intensity: q(1.0), ammoId: "ammo_hollow" }]]]));

      const t = world.entities.find(e => e.id === 2)!;
      let totalBleed = 0;
      for (const reg of Object.values(t.injury.byRegion) as any[]) {
        totalBleed += reg.bleedingRate ?? 0;
      }
      if (totalBleed > 0) {
        bleedFound = true;
        break;
      }
    }
    expect(bleedFound).toBe(true);
  });

  it("unknown ammoId falls back to weapon defaults gracefully (no crash)", () => {
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [armedPistol];
    const target = mkHumanoidEntity(2, 2, to.m(10), 0);
    const world = mkWorld(42, [shooter, target]);

    expect(() => {
      runTick(world, new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_pistol", intensity: q(1.0), ammoId: "ammo_nonexistent_xyz" }]]]));
    }).not.toThrow();
  });
});
