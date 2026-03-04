// test/ranged.test.ts — Phase 3: ranged combat tests
import { describe, it, expect } from "vitest";
import { q, to } from "../src/units";
import {
  energyAtRange_J,
  adjustedDispersionQ,
  groupingRadius_m,
  thrownLaunchEnergy_J,
  recycleTicks,
  shootCost_J,
} from "../src/sim/ranged";
import { STARTER_RANGED_WEAPONS, STARTER_ARMOUR, findRangedWeapon } from "../src/equipment";
import { deriveFunctionalState } from "../src/sim/impairment";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { TraceKinds } from "../src/sim/kinds";
import type { TraceEvent } from "../src/sim/trace";
import { CommandMap } from "../src";

// ---- helpers ----
const shortbow = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_shortbow")!;
const longbow   = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_longbow")!;
const crossbow  = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_crossbow")!;
const pistol    = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_pistol")!;
const sling     = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_sling")!;

// ========================
// UNIT TESTS — pure funcs
// ========================

describe("energyAtRange_J", () => {
  it("returns full energy at zero range", () => {
    expect(energyAtRange_J(60, q(0.007), 0)).toBe(60);
  });

  it("decays linearly with range", () => {
    const at10m  = energyAtRange_J(60, q(0.007), to.m(10));
    const at20m  = energyAtRange_J(60, q(0.007), to.m(20));
    expect(at20m).toBeLessThan(at10m);
  });

  it("returns zero once drag exceeds launch energy (extreme range)", () => {
    // shortbow: drag = 0.7%/m → zeroed at ~143m (launchEnergy 60J)
    expect(energyAtRange_J(60, q(0.007), to.m(200))).toBe(0);
  });

  it("firearm retains more energy at 100m than shortbow", () => {
    const bowAt100  = energyAtRange_J(60,  q(0.007),  to.m(100));
    const gunAt100  = energyAtRange_J(400, q(0.002),  to.m(100));
    expect(gunAt100).toBeGreaterThan(bowAt100);
  });

  it("returns zero for zero launch energy", () => {
    expect(energyAtRange_J(0, q(0.012), to.m(30))).toBe(0);
  });
});

describe("adjustedDispersionQ", () => {
  it("baseline: base dispersion unchanged with perfect skill, no fatigue, full intensity", () => {
    const base = q(0.010);
    const adj = adjustedDispersionQ(base, q(1.0), q(1.0), q(0), q(1.0));
    // controlMod = clamp(2.0 - 1.0, 1.0, 1.5) = 1.0, fatigueMod = 1.0, intensityMod = 1.0
    expect(adj).toBe(base);
  });

  it("increases with fatigue", () => {
    const base = q(0.010);
    const fresh    = adjustedDispersionQ(base, q(0.75), q(0.70), q(0.0), q(1.0));
    const fatigued = adjustedDispersionQ(base, q(0.75), q(0.70), q(1.0), q(1.0));
    expect(fatigued).toBeGreaterThan(fresh);
  });

  it("increases with low intensity (snap shot)", () => {
    const base = q(0.010);
    const aimed = adjustedDispersionQ(base, q(0.75), q(0.70), q(0.0), q(1.0));
    const snap  = adjustedDispersionQ(base, q(0.75), q(0.70), q(0.0), q(0.3));
    expect(snap).toBeGreaterThan(aimed);
  });

  it("poor control increases dispersion", () => {
    const base  = q(0.010);
    const expert = adjustedDispersionQ(base, q(0.95), q(0.90), q(0.0), q(1.0));
    const novice = adjustedDispersionQ(base, q(0.30), q(0.25), q(0.0), q(1.0));
    expect(novice).toBeGreaterThan(expert);
  });
});

describe("groupingRadius_m", () => {
  it("scales linearly with range", () => {
    const disp = q(0.010);
    const r10 = groupingRadius_m(disp, to.m(10));
    const r20 = groupingRadius_m(disp, to.m(20));
    expect(r20).toBe(r10 * 2);
  });

  it("is zero at zero range", () => {
    expect(groupingRadius_m(q(0.010), 0)).toBe(0);
  });
});

describe("thrownLaunchEnergy_J", () => {
  it("is ~120J for average human (1200W)", () => {
    expect(thrownLaunchEnergy_J(1200)).toBe(120);
  });

  it("has minimum floor of 10J", () => {
    expect(thrownLaunchEnergy_J(0)).toBe(10);
    expect(thrownLaunchEnergy_J(50)).toBe(10);   // 50/10 = 5 < floor
  });

  it("strong entity produces more launch energy than weak", () => {
    expect(thrownLaunchEnergy_J(2000)).toBeGreaterThan(thrownLaunchEnergy_J(800));
  });
});

describe("recycleTicks", () => {
  it("shortbow: 1.5s × 20hz = 30 ticks", () => {
    expect(recycleTicks(shortbow, 20)).toBe(30);
  });

  it("crossbow: 5.0s × 20hz = 100 ticks", () => {
    expect(recycleTicks(crossbow, 20)).toBe(100);
  });

  it("minimum is 1", () => {
    const zeroRecycle = { ...shortbow, recycleTime_s: 0 };
    expect(recycleTicks(zeroRecycle, 20)).toBe(1);
  });
});

describe("shootCost_J", () => {
  const peakPower = 1200;

  it("bow costs more than firearm at same intensity", () => {
    expect(shootCost_J(shortbow, q(1.0), peakPower)).toBeGreaterThan(
      shootCost_J(pistol, q(1.0), peakPower)
    );
  });

  it("thrown costs more than bow at same intensity", () => {
    expect(shootCost_J(sling, q(1.0), peakPower)).toBeGreaterThan(
      shootCost_J(shortbow, q(1.0), peakPower)
    );
  });

  it("higher intensity costs more", () => {
    expect(shootCost_J(shortbow, q(1.0), peakPower)).toBeGreaterThan(
      shootCost_J(shortbow, q(0.3), peakPower)
    );
  });

  it("minimum is 2J", () => {
    expect(shootCost_J(pistol, q(0.1), 10)).toBeGreaterThanOrEqual(2);
  });
});

// ========================
// INTEGRATION TESTS
// ========================

function collectTrace(world: ReturnType<typeof mkWorld>, cmds: CommandMap, ticks: number) {
  const events: TraceEvent[] = [];
  const sink = { onEvent: (ev: TraceEvent) => events.push(ev) };
  for (let i = 0; i < ticks; i++) stepWorld(world, cmds, { tractionCoeff: q(0.9), trace: sink });
  return events;
}

describe("kernel: shoot command integration", () => {
  it("findRangedWeapon returns null for empty loadout", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    expect(findRangedWeapon(e.loadout)).toBeNull();
  });

  it("shoot command emits ProjectileHit trace", () => {
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [shortbow];
    const target  = mkHumanoidEntity(2, 2, to.m(10), 0);

    const world = mkWorld(42, [shooter, target]);
    const cmds: CommandMap = new Map([[1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) }]]]);
    const events = collectTrace(world, cmds, 1);

    expect(events.some(e => e.kind === TraceKinds.ProjectileHit)).toBe(true);
  });

  it("shortbow hits target at 10m most of the time (>70% across 50 seeds)", () => {
    let hitCount = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const shooter = mkHumanoidEntity(1, 1, 0, 0);
      shooter.loadout.items = [shortbow];
      const target = mkHumanoidEntity(2, 2, to.m(10), 0);
      const world = mkWorld(seed, [shooter, target]);
      const cmds: CommandMap = new Map([[1, [{ kind: "shoot", targetId: 2, intensity: q(1.0) }]]]);
      const events = collectTrace(world, cmds, 1);
      const ev = events.find(e => e.kind === TraceKinds.ProjectileHit);
      if (ev?.hit) hitCount++;
    }
    expect(hitCount).toBeGreaterThan(35); // >70%
  });

  it("shortbow misses reliably at 150m (>80% miss rate across 100 seeds)", () => {
    let missCount = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const shooter = mkHumanoidEntity(1, 1, 0, 0);
      shooter.loadout.items = [shortbow];
      const target = mkHumanoidEntity(2, 2, to.m(150), 0);
      const world = mkWorld(seed, [shooter, target]);
      const cmds: CommandMap = new Map([[1, [{ kind: "shoot", targetId: 2, intensity: q(1.0) }]]]);
      const events = collectTrace(world, cmds, 1);
      const ev = events.find(e => e.kind === TraceKinds.ProjectileHit);
      if (!ev?.hit) missCount++;
    }
    expect(missCount).toBeGreaterThan(79); // >80%
  });

  it("hit increases target damage", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const shooter = mkHumanoidEntity(1, 1, 0, 0);
      shooter.loadout.items = [shortbow];
      const target = mkHumanoidEntity(2, 2, to.m(10), 0);
      const world = mkWorld(seed, [shooter, target]);
      const cmds: CommandMap = new Map([[1, [{ kind: "shoot", targetId: 2, intensity: q(1.0) }]]]);
      const events = collectTrace(world, cmds, 1);
      const ev = events.find(e => e.kind === TraceKinds.ProjectileHit);
      if (ev?.hit) {
        const injured = world.entities.find(e => e.id === 2)!;
        const totalDamage = Object.values(injured.injury.byRegion)
          .reduce((s, r) => s + r.surfaceDamage + r.internalDamage + r.structuralDamage, 0);
        expect(totalDamage).toBeGreaterThan(0);
        return;
      }
    }
    throw new Error("No hit found in 200 seeds");
  });

  it("armour reduces damage from projectile", () => {
    let damageUnarmoured = 0;
    let damageArmoured = 0;

    const seed = 1; // use a fixed seed

    {
      const shooter = mkHumanoidEntity(1, 1, 0, 0);
      shooter.loadout.items = [shortbow];
      const target = mkHumanoidEntity(2, 2, to.m(10), 0);
      const world = mkWorld(seed, [shooter, target]);
      const cmds: CommandMap = new Map([[1, [{ kind: "shoot", targetId: 2, intensity: q(1.0) }]]]);
      collectTrace(world, cmds, 1);
      const injured = world.entities.find(e => e.id === 2)!;
      damageUnarmoured = Object.values(injured.injury.byRegion)
        .reduce((s, r) => s + r.surfaceDamage + r.internalDamage + r.structuralDamage, 0);
    }
    {
      const shooter = mkHumanoidEntity(1, 1, 0, 0);
      shooter.loadout.items = [shortbow];
      const target = mkHumanoidEntity(2, 2, to.m(10), 0);
      target.loadout.items = [STARTER_ARMOUR[1]!]; // mail - high resist
      const world = mkWorld(seed, [shooter, target]);
      const cmds: CommandMap = new Map([[1, [{ kind: "shoot", targetId: 2, intensity: q(1.0) }]]]);
      collectTrace(world, cmds, 1);
      const injured = world.entities.find(e => e.id === 2)!;
      damageArmoured = Object.values(injured.injury.byRegion)
        .reduce((s, r) => s + r.surfaceDamage + r.internalDamage + r.structuralDamage, 0);
    }

    // Armour should never increase damage
    expect(damageArmoured).toBeLessThanOrEqual(damageUnarmoured);
  });

  it("near-miss sets suppressedTicks on target", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const shooter = mkHumanoidEntity(1, 1, 0, 0);
      shooter.loadout.items = [shortbow];
      const target = mkHumanoidEntity(2, 2, to.m(60), 0);
      const world = mkWorld(seed, [shooter, target]);
      const cmds: CommandMap = new Map([[1, [{ kind: "shoot", targetId: 2, intensity: q(1.0) }]]]);
      const events = collectTrace(world, cmds, 1);
      const ev = events.find(e => e.kind === TraceKinds.ProjectileHit);
      if (ev?.suppressed) {
        const t = world.entities.find(e => e.id === 2)!;
        expect(t.condition.suppressedTicks).toBeGreaterThan(0);
        return;
      }
    }
    throw new Error("No suppression found in 300 seeds");
  });

  it("suppressedTicks decays each tick", () => {
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    const target  = mkHumanoidEntity(2, 2, to.m(10), 0);
    const world = mkWorld(1, [shooter, target]);

    // Manually set suppression
    world.entities.find(e => e.id === 2)!.condition.suppressedTicks = 4;

    // Run 4 ticks with no commands to let it drain
    for (let i = 0; i < 4; i++) {
      stepWorld(world, new Map(), { tractionCoeff: q(0.9) });
    }
    expect(world.entities.find(e => e.id === 2)!.condition.suppressedTicks).toBe(0);
  });

  it("suppression penalty reduces coordinationMul", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const baseline = deriveFunctionalState(e).coordinationMul;

    e.condition.suppressedTicks = 4;
    const suppressed = deriveFunctionalState(e).coordinationMul;

    expect(suppressed).toBeLessThan(baseline);
  });

  it("shoot cooldown prevents rapid fire", () => {
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [shortbow];
    const target = mkHumanoidEntity(2, 2, to.m(10), 0);
    const world = mkWorld(1, [shooter, target]);
    const cmds: CommandMap = new Map([[1, [{ kind: "shoot", targetId: 2, intensity: q(1.0) }]]]);

    // Tick 1: fires
    const ev1 = collectTrace(world, cmds, 1).filter(e => e.kind === TraceKinds.ProjectileHit);
    expect(ev1.length).toBe(1);

    // Tick 2: cooldown active — no new ProjectileHit
    const ev2 = collectTrace(world, cmds, 1).filter(e => e.kind === TraceKinds.ProjectileHit);
    expect(ev2.length).toBe(0);
  });

  it("thrown weapon launch energy scales with peakPower_W", () => {
    expect(thrownLaunchEnergy_J(2000)).toBeGreaterThan(thrownLaunchEnergy_J(800));
    expect(thrownLaunchEnergy_J(1200)).toBe(120); // calibration check
  });

  it("firearm energy barely decays at 50m vs effectively zero at 500m (pistol)", () => {
    const at50  = energyAtRange_J(pistol.launchEnergy_J, pistol.dragCoeff_perM, to.m(50));
    const at500 = energyAtRange_J(pistol.launchEnergy_J, pistol.dragCoeff_perM, to.m(500));
    // pistol drag = 0.2%/m; at 500m: 100% lost → 0J; at 50m: 10% lost → ~360J
    expect(at50).toBeGreaterThan(at500);
    expect(at50).toBeGreaterThan(300);
    expect(at500).toBe(0);
  });

  it("shoot command dispatched correctly without exceptions", () => {
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [longbow];
    const target = mkHumanoidEntity(2, 2, to.m(15), 0);
    const world = mkWorld(7, [shooter, target]);
    const cmds: CommandMap = new Map([[1, [{ kind: "shoot", targetId: 2, intensity: q(1.0) }]]]);
    const events = collectTrace(world, cmds, 1);
    expect(events.some(e => e.kind === TraceKinds.TickEnd)).toBe(true);
  });
});
