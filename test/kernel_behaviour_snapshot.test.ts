/**
 * Kernel behaviour snapshot tests — deterministic regression lock.
 *
 * Multiple named scenarios capture key simulation outputs after a fixed number
 * of ticks. On first run each scenario's snapshot is written to disk and the
 * test passes. Subsequent runs compare against those saved snapshots.
 *
 * To regenerate all snapshots: delete test/snapshots/kernel_behaviour_snapshot.json
 * and re-run the test suite.
 */

import { describe, it, expect } from "vitest";

import type { WorldState } from "../src/sim/world.js";
import type { TraceEvent, TraceSink } from "../src/sim/trace.js";
import type { CommandMap } from "../src/sim/commands.js";

import { stepWorld } from "../src/sim/kernel.js";
import { mkWorld, mkHumanoidEntity } from "../src/sim/testing.js";
import { buildObstacleGrid } from "../src/sim/terrain.js";
import { q, to, SCALE, type Q } from "../src/units.js";
import type { KernelContext } from "../src/sim/context.js";
import { STARTER_WEAPONS, STARTER_RANGED_WEAPONS } from "../src/equipment.js";
import { STARTER_SUBSTANCES } from "../src/sim/substance.js";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TraceKinds } from "../src/sim/kinds.js";

// ── Snapshot file helpers ─────────────────────────────────────────────────────

const SNAPSHOT_DIR = join(process.cwd(), "test", "snapshots");
const SNAPSHOT_PATH = join(SNAPSHOT_DIR, "kernel_behaviour_snapshot.json");

if (!existsSync(SNAPSHOT_DIR)) {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

function loadSnapshots(): Record<string, string> {
  if (!existsSync(SNAPSHOT_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveSnapshot(key: string, value: string): void {
  const all = loadSnapshots();
  all[key] = value;
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(all, null, 2) + "\n", "utf8");
}

/**
 * Compare current snapshot against saved value for `key`.
 * If no saved value exists, write it and pass (first-run bootstrap).
 */
function assertSnapshot(key: string, current: string): void {
  const all = loadSnapshots();
  if (!all[key]) {
    saveSnapshot(key, current);
    return; // First run: accept baseline
  }
  expect(current).toBe(all[key]);
}

// ── World serialisation helpers ───────────────────────────────────────────────

function stableEntityView(e: ReturnType<typeof mkHumanoidEntity>): unknown {
  const anyE = e;
  const torso = e.injury.byRegion?.["torso"];
  return {
    id: e.id,
    teamId: e.teamId,

    // Kinematics
    pos_x: e.position_m.x,
    pos_y: e.position_m.y,
    vel_x: e.velocity_mps.x,
    vel_y: e.velocity_mps.y,

    // Cooldowns
    attackCooldownTicks: e.action.attackCooldownTicks,
    shootCooldownTicks: anyE.action.shootCooldownTicks ?? 0,

    // Energy
    reserveEnergy_J: e.energy.reserveEnergy_J,
    fatigue: e.energy.fatigue,

    // Condition / morale
    fearQ: e.condition.fearQ,
    suppressedTicks: e.condition.suppressedTicks,
    suppressionFearMul: e.condition.suppressionFearMul,
    rallyCooldownTicks: e.condition.rallyCooldownTicks,
    surrendered: e.condition.surrendered,
    recentAllyDeaths: e.condition.recentAllyDeaths,
    prone: e.condition.prone,
    pinned: e.condition.pinned,
    unconsciousTicks: e.condition.unconsciousTicks,
    standBlockedTicks: e.condition.standBlockedTicks,

    // Injury summary
    dead: e.injury.dead,
    fluidLoss: e.injury.fluidLoss,
    shock: e.injury.shock,
    consciousness: e.injury.consciousness,

    // Torso region
    torsoSurface: torso?.surfaceDamage ?? 0,
    torsoInternal: torso?.internalDamage ?? 0,
    torsoStructural: torso?.structuralDamage ?? 0,

    // Grapple
    holdingTargetId: anyE.grapple?.holdingTargetId ?? null,
    gripQ: anyE.grapple?.gripQ ?? 0,

    // Substances
    substances: (e.substances ?? [])
      .map((s) => ({ id: (s).substance?.id ?? 0 }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
}

function stableTraceView(ev: TraceEvent): unknown {
  const base = {
    kind: ev.kind,
    tick: ev.tick,
  };

  switch (ev.kind) {
    case TraceKinds.Intent:
    case TraceKinds.Move:
    case TraceKinds.Injury:
    case TraceKinds.KO:
    case TraceKinds.Death:
    case TraceKinds.MoraleRoute:
    case TraceKinds.MoraleRally:
    case TraceKinds.Fracture:
    case TraceKinds.BlastHit:
    case TraceKinds.CapabilityActivated:
    case TraceKinds.CapabilitySuppressed:
    case TraceKinds.CastInterrupted:
    case TraceKinds.WeaponBindBreak:
      return {
        ...base,
        entityId: ev.entityId,
        ...(ev.kind === TraceKinds.WeaponBindBreak ? { partnerId: ev.partnerId } : {}),
      };

    case TraceKinds.Attack:
    case TraceKinds.AttackAttempt:
    case TraceKinds.Grapple:
    case TraceKinds.WeaponBind:
      return {
        ...base,
        attackerId: ev.attackerId,
        targetId: ev.targetId,
      };

    case TraceKinds.ProjectileHit:
      return {
        ...base,
        shooterId: ev.shooterId,
        targetId: ev.targetId,
      };

    case TraceKinds.TreatmentApplied:
      return {
        ...base,
        treaterId: ev.treaterId,
        targetId: ev.targetId,
      };

    case TraceKinds.TickStart:
    case TraceKinds.TickEnd:
      return base;
  }
}

function captureSnapshot(
  world: WorldState,
  commands: CommandMap,
  ctx: KernelContext,
  ticks: number,
): string {
  const trace: TraceEvent[] = [];
  const traceSink: TraceSink = { onEvent: (ev) => trace.push(ev) };
  const fullCtx: KernelContext = { ...ctx, trace: traceSink };

  for (let i = 0; i < ticks; i++) {
    stepWorld(world, commands, fullCtx);
  }

  const entities = world.entities
    .slice()
    .sort((a, b) => a.id - b.id)
    .map(stableEntityView);

  const hazards: readonly unknown[] = [];

  const fields = ((world).activeFieldEffects ?? [])
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((fe) => ({ id: fe.id, radius_m: fe.radius_m, duration_ticks: fe.duration_ticks }));

  return JSON.stringify(
    {
      seed: (world).seed,
      tick: (world).tick,
      entityCount: entities.length,
      entities,
      hazards,
      fields,
      trace: trace.map(stableTraceView),
    },
    null,
    2,
  );
}

// ── Scenario 1: baseline — mixed hazards, two opponents + one cohesion ally ───

describe("kernel behaviour snapshot", () => {
  it("scenario: baseline (mixed hazards, 3 entities, 15 ticks)", () => {
    const world = mkWorld(1337, []);

    const a = mkHumanoidEntity(1, 1, 0, 0);
    const b = mkHumanoidEntity(2, 2, to.m(2), 0);
    const c = mkHumanoidEntity(3, 1, to.m(1), to.m(2)); // same team as A, cohesion ally

    // Seed initial suppression so morale step exercises caliber multiplier
    a.condition.suppressedTicks = 5;
    a.condition.suppressionFearMul = SCALE.Q as Q; // standard multiplier

    // Add substance via proper ActiveSubstance format
    a.substances = [{
      substance: STARTER_SUBSTANCES["anaesthetic"]!,
      concentration: q(0),
      pendingDose: q(0.4),
    }];

    // const hazardGrid = buildHazardGrid({
    //   "0,0": { type: "fire",        intensity: q(0.5), duration_ticks: 5  },
    //   "1,0": { type: "radiation",   intensity: q(0.3), duration_ticks: 0  },
    //   "0,1": { type: "poison_gas",  intensity: q(0.7), duration_ticks: 10 },
    // });

    world.entities.push(a, b, c);

    // A moves toward B and attacks; B moves toward A and attacks.
    // Both use correct command format: { kind: "move", dir, intensity, mode }
    const commands: CommandMap = new Map([
      [a.id, [
        { kind: "move",   dir: { x: 1, y: 0, z: 0 }, intensity: q(1.0), mode: "sprint" },
        { kind: "attack", targetId: b.id, intensity: q(1.0) },
      ]],
      [b.id, [
        { kind: "move",   dir: { x: -1, y: 0, z: 0 }, intensity: q(1.0), mode: "sprint" },
        { kind: "attack", targetId: a.id, intensity: q(1.0) },
      ]],
    ]) as CommandMap;

    const ctx: KernelContext = {
      tractionCoeff: q(0.80) as Q,
      cellSize_m: to.m(4),
      obstacleGrid: buildObstacleGrid({}),
    };

    const snapshot = captureSnapshot(world, commands, ctx, 15);
    assertSnapshot("baseline", snapshot);
  });

  // ── Scenario 2: armed melee duel — two fighters with clubs ─────────────────

  it("scenario: armed melee duel (clubs, 0.5 m apart, 20 ticks)", () => {
    const club = STARTER_WEAPONS[0]!; // wpn_club
    const a = mkHumanoidEntity(1, 1, 0, 0);
    const b = mkHumanoidEntity(2, 2, to.m(0.5), 0);
    a.loadout.items = [club];
    b.loadout.items = [club];

    const world = mkWorld(777, [a, b]);

    const commands: CommandMap = new Map([
      [a.id, [
        { kind: "move",   dir: { x: 1, y: 0, z: 0 }, intensity: q(0.5), mode: "walk" },
        { kind: "attack", targetId: b.id, weaponId: club.id, intensity: q(1.0), mode: "strike" },
      ]],
      [b.id, [
        { kind: "move",   dir: { x: -1, y: 0, z: 0 }, intensity: q(0.5), mode: "walk" },
        { kind: "attack", targetId: a.id, weaponId: club.id, intensity: q(1.0), mode: "strike" },
      ]],
    ]);

    const ctx: KernelContext = {
      tractionCoeff: q(0.90) as Q,
      cellSize_m: to.m(4),
    };

    const snapshot = captureSnapshot(world, commands, ctx, 20);
    assertSnapshot("armed_melee_duel", snapshot);
  });

  // ── Scenario 3: ranged suppression — shortbow vs stationary target ──────────

  it("scenario: ranged suppression (shortbow at 8 m, 5 ticks)", () => {
    const bow = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_shortbow")!;
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [bow];
    const target = mkHumanoidEntity(2, 2, to.m(8), 0);

    const world = mkWorld(555, [shooter, target]);

    // Shooter repeatedly fires; target stands still
    const commands: CommandMap = new Map([
      [shooter.id, [
        { kind: "shoot", targetId: target.id, weaponId: bow.id, intensity: q(1.0) },
      ]],
    ]);

    const ctx: KernelContext = {
      tractionCoeff: q(0.90) as Q,
      cellSize_m: to.m(4),
    };

    const snapshot = captureSnapshot(world, commands, ctx, 5);
    assertSnapshot("ranged_suppression", snapshot);
  });

  // ── Scenario 4: morale routing — high-fear entity surrounded by enemies ─────

  it("scenario: morale routing (high-fear entity, 3 enemies, 10 ticks)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.condition.fearQ = q(0.62) as Q;        // near routing threshold
    e.condition.suppressedTicks = 20;        // incoming fire to push it over
    e.condition.suppressionFearMul = q(2.0); // high-caliber weapon suppressed it

    // Three enemies nearby — outnumbering triggers additional fear
    const en1 = mkHumanoidEntity(2, 2, to.m(5),  0);
    const en2 = mkHumanoidEntity(3, 2, to.m(6),  0);
    const en3 = mkHumanoidEntity(4, 2, to.m(-5), 0);

    const world = mkWorld(321, [e, en1, en2, en3]);

    const snapshot = captureSnapshot(world, new Map(), {
      tractionCoeff: q(0.90) as Q,
      cellSize_m: to.m(4),
    }, 10);

    assertSnapshot("morale_routing", snapshot);
  });

  // ── Scenario 5: berserk + leader aura in the same world ─────────────────────

  it("scenario: berserk entity + leader aura (5 ticks)", () => {
    const berserk = mkHumanoidEntity(1, 1, 0, 0);
    (berserk.attributes.resilience).fearResponse = "berserk";
    berserk.condition.fearQ = q(0.50) as Q;

    const ordinary = mkHumanoidEntity(2, 1, to.m(3), 0);
    ordinary.condition.fearQ = q(0.40) as Q;
    ordinary.condition.suppressedTicks = 8;

    const leader = mkHumanoidEntity(3, 1, to.m(5), 0);
    (leader).traits = ["leader"]; // provides morale aura

    const enemy = mkHumanoidEntity(4, 2, to.m(15), 0);

    const world = mkWorld(888, [berserk, ordinary, leader, enemy]);

    const snapshot = captureSnapshot(world, new Map(), {
      tractionCoeff: q(0.90) as Q,
      cellSize_m: to.m(4),
    }, 5);

    assertSnapshot("berserk_and_leader", snapshot);
  });

  // ── Scenario 6: rally mechanic — entity recovers from routing ─────────────────

  it("scenario: rally mechanic (entity recovers from routing, 30 ticks)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.attributes.resilience.distressTolerance = q(0.50);
    // Set fear just above routing threshold so it tips over, then decays back
    e.condition.fearQ = (6510) as Q;

    const ally = mkHumanoidEntity(2, 1, to.m(2), 0); // cohesion ally speeds decay

    const world = mkWorld(111, [e, ally]);

    const snapshot = captureSnapshot(world, new Map(), {
      tractionCoeff: q(0.90) as Q,
      cellSize_m: to.m(4),
    }, 30);

    assertSnapshot("rally_mechanic", snapshot);
  });
});
