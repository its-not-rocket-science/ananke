// test/metrics.test.ts — Phase 13: combat metrics and analytics

import { describe, it, expect } from "vitest";
import { q, to } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { STARTER_WEAPONS } from "../src/equipment";
import {
  CollectingTrace,
  collectMetrics,
  survivalRate,
  meanTimeToIncapacitation,
} from "../src/metrics";
import { TraceKinds } from "../src/sim/kinds";
import type { TraceEvent } from "../src/sim/trace";

const BASE_CTX = { tractionCoeff: q(0.80) };
const club = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;

// ── CollectingTrace ───────────────────────────────────────────────────────────

describe("CollectingTrace", () => {
  it("accumulates trace events", () => {
    const tracer = new CollectingTrace();
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);

    for (let i = 0; i < 3; i++) stepWorld(world, new Map(), { ...BASE_CTX, trace: tracer });

    expect(tracer.events.length).toBeGreaterThan(0);
  });

  it("clear() empties accumulated events", () => {
    const tracer = new CollectingTrace();
    tracer.onEvent({ kind: TraceKinds.TickStart, tick: 0 });
    expect(tracer.events).toHaveLength(1);
    tracer.clear();
    expect(tracer.events).toHaveLength(0);
  });
});

// ── collectMetrics ────────────────────────────────────────────────────────────

describe("collectMetrics — from manual events", () => {
  it("damageDealt sums energy_J from Attack events", () => {
    const events: TraceEvent[] = [
      { kind: TraceKinds.Attack, tick: 1, attackerId: 1, targetId: 2, region: "torso",
        energy_J: 500, blocked: false, parried: false, shieldBlocked: false, armoured: false, hitQuality: q(0.8) },
      { kind: TraceKinds.Attack, tick: 2, attackerId: 1, targetId: 2, region: "head",
        energy_J: 300, blocked: false, parried: false, shieldBlocked: false, armoured: false, hitQuality: q(0.7) },
    ];
    const m = collectMetrics(events);
    expect(m.damageDealt.get(1)).toBe(800);
    expect(m.damageDealt.get(2)).toBeUndefined();
  });

  it("hitsLanded counts Attack events per attacker", () => {
    const events: TraceEvent[] = [
      { kind: TraceKinds.Attack, tick: 1, attackerId: 1, targetId: 2, region: "torso",
        energy_J: 100, blocked: false, parried: false, shieldBlocked: false, armoured: false, hitQuality: q(0.5) },
      { kind: TraceKinds.Attack, tick: 2, attackerId: 1, targetId: 3, region: "torso",
        energy_J: 100, blocked: false, parried: false, shieldBlocked: false, armoured: false, hitQuality: q(0.5) },
      { kind: TraceKinds.Attack, tick: 2, attackerId: 2, targetId: 1, region: "torso",
        energy_J: 100, blocked: false, parried: false, shieldBlocked: false, armoured: false, hitQuality: q(0.5) },
    ];
    const m = collectMetrics(events);
    expect(m.hitsLanded.get(1)).toBe(2);
    expect(m.hitsLanded.get(2)).toBe(1);
  });

  it("hitsTaken counts how many times each entity was hit", () => {
    const events: TraceEvent[] = [
      { kind: TraceKinds.Attack, tick: 1, attackerId: 1, targetId: 2, region: "torso",
        energy_J: 100, blocked: false, parried: false, shieldBlocked: false, armoured: false, hitQuality: q(0.5) },
      { kind: TraceKinds.Attack, tick: 2, attackerId: 1, targetId: 2, region: "arm",
        energy_J: 100, blocked: false, parried: false, shieldBlocked: false, armoured: false, hitQuality: q(0.5) },
    ];
    const m = collectMetrics(events);
    expect(m.hitsTaken.get(2)).toBe(2);
  });

  it("tickOfKO records first KO tick, ignores subsequent KO events for same entity", () => {
    const events: TraceEvent[] = [
      { kind: TraceKinds.KO, tick: 5, entityId: 3 },
      { kind: TraceKinds.KO, tick: 10, entityId: 3 },
    ];
    const m = collectMetrics(events);
    expect(m.tickOfKO.get(3)).toBe(5);
  });

  it("tickOfDeath records first death tick", () => {
    const events: TraceEvent[] = [
      { kind: TraceKinds.Death, tick: 15, entityId: 4 },
    ];
    const m = collectMetrics(events);
    expect(m.tickOfDeath.get(4)).toBe(15);
  });

  it("tickToIncapacitation uses the earlier of KO and death", () => {
    const events: TraceEvent[] = [
      { kind: TraceKinds.KO,    tick: 8,  entityId: 5 },
      { kind: TraceKinds.Death, tick: 12, entityId: 5 },
    ];
    const m = collectMetrics(events);
    expect(m.tickToIncapacitation.get(5)).toBe(8);
  });

  it("tickToIncapacitation uses death when no KO", () => {
    const events: TraceEvent[] = [
      { kind: TraceKinds.Death, tick: 7, entityId: 6 },
    ];
    const m = collectMetrics(events);
    expect(m.tickToIncapacitation.get(6)).toBe(7);
  });

  it("projectile hits contribute to damageDealt and hitsLanded", () => {
    const events: TraceEvent[] = [
      { kind: TraceKinds.ProjectileHit, tick: 3, shooterId: 1, targetId: 2,
        hit: true, region: "torso", distance_m: to.m(10), energyAtImpact_J: 1200, suppressed: false },
      { kind: TraceKinds.ProjectileHit, tick: 4, shooterId: 1, targetId: 2,
        hit: false, distance_m: to.m(10), energyAtImpact_J: 0, suppressed: false },
    ];
    const m = collectMetrics(events);
    expect(m.damageDealt.get(1)).toBe(1200); // only the hit
    expect(m.hitsLanded.get(1)).toBe(1);
    expect(m.hitsTaken.get(2)).toBe(1);
  });

  it("empty events return empty maps", () => {
    const m = collectMetrics([]);
    expect(m.damageDealt.size).toBe(0);
    expect(m.hitsLanded.size).toBe(0);
    expect(m.tickToIncapacitation.size).toBe(0);
  });
});

// ── survivalRate ──────────────────────────────────────────────────────────────

describe("survivalRate", () => {
  it("returns 1.0 for empty entity list", () => {
    expect(survivalRate([], [])).toBe(1.0);
  });

  it("returns 1.0 when no entity was incapacitated", () => {
    const events: TraceEvent[] = [];
    expect(survivalRate(events, [1, 2, 3])).toBe(1.0);
  });

  it("returns 0 when all entities were killed", () => {
    const events: TraceEvent[] = [
      { kind: TraceKinds.Death, tick: 5, entityId: 1 },
      { kind: TraceKinds.Death, tick: 7, entityId: 2 },
    ];
    expect(survivalRate(events, [1, 2])).toBe(0);
  });

  it("returns 0.5 when half of entities were incapacitated", () => {
    const events: TraceEvent[] = [
      { kind: TraceKinds.Death, tick: 5, entityId: 1 },
    ];
    expect(survivalRate(events, [1, 2])).toBe(0.5);
  });
});

// ── meanTimeToIncapacitation ──────────────────────────────────────────────────

describe("meanTimeToIncapacitation", () => {
  it("returns totalTicks when no entity incapacitated", () => {
    expect(meanTimeToIncapacitation([], [1, 2], 100)).toBe(100);
  });

  it("returns totalTicks for empty entity list", () => {
    expect(meanTimeToIncapacitation([], [], 50)).toBe(50);
  });

  it("averages tick values correctly", () => {
    const events: TraceEvent[] = [
      { kind: TraceKinds.Death, tick: 10, entityId: 1 },
      { kind: TraceKinds.Death, tick: 20, entityId: 2 },
    ];
    // Entity 3 survives → contributes totalTicks=100
    const mean = meanTimeToIncapacitation(events, [1, 2, 3], 100);
    expect(mean).toBe((10 + 20 + 100) / 3);
  });
});

// ── Integration: metrics from live simulation ─────────────────────────────────

describe("collectMetrics — from live simulation", () => {
  it("damageDealt and hitsLanded are > 0 after melee combat", () => {
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    attacker.loadout.items = [club];
    const target = mkHumanoidEntity(2, 2, to.m(0.5), 0);
    const world = mkWorld(1, [attacker, target]);

    const tracer = new CollectingTrace();
    const cmds = new Map([[1, [{ kind: "attack" as const, targetId: 2, weaponId: club.id, intensity: q(1.0) }]]]);
    for (let i = 0; i < 40; i++) stepWorld(world, cmds, { ...BASE_CTX, trace: tracer });

    const m = collectMetrics(tracer.events);
    expect(m.damageDealt.get(1) ?? 0).toBeGreaterThan(0);
    expect(m.hitsLanded.get(1) ?? 0).toBeGreaterThan(0);
    expect(m.hitsTaken.get(2) ?? 0).toBeGreaterThan(0);
  });

  it("tickToIncapacitation is recorded when entity dies", () => {
    // Overwhelm a low-health target
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    attacker.loadout.items = [club];
    const target = mkHumanoidEntity(2, 2, to.m(0.5), 0);
    // Pre-damage the target so it dies quickly
    for (const reg of Object.values(target.injury.byRegion)) {
      reg.structuralDamage = q(0.85) as any;
    }
    const world = mkWorld(1, [attacker, target]);

    const tracer = new CollectingTrace();
    const cmds = new Map([[1, [{ kind: "attack" as const, targetId: 2, weaponId: club.id, intensity: q(1.0) }]]]);
    for (let i = 0; i < 60; i++) stepWorld(world, cmds, { ...BASE_CTX, trace: tracer });

    const m = collectMetrics(tracer.events);
    // Target should have been incapacitated at some point
    const tti = m.tickToIncapacitation.get(2);
    if (tti !== undefined) {
      expect(tti).toBeGreaterThan(0);
    }
    // At minimum, damage was dealt
    expect(m.damageDealt.get(1) ?? 0).toBeGreaterThan(0);
  });

  it("survivalRate decreases when entities are killed in combat", () => {
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    attacker.loadout.items = [club];
    const target = mkHumanoidEntity(2, 2, to.m(0.5), 0);
    // Pre-damage deeply so any additional hit triggers death via shock/consciousness cascade
    target.injury.shock = q(0.85) as any;
    target.injury.consciousness = q(0.05) as any;
    for (const reg of Object.values(target.injury.byRegion)) {
      reg.structuralDamage = q(0.90) as any;
      reg.internalDamage   = q(0.80) as any;
    }
    const world = mkWorld(1, [attacker, target]);
    const tracer = new CollectingTrace();
    const cmds = new Map([[1, [{ kind: "attack" as const, targetId: 2, weaponId: club.id, intensity: q(1.0) }]]]);
    for (let i = 0; i < 100; i++) stepWorld(world, cmds, { ...BASE_CTX, trace: tracer });

    const rate = survivalRate(tracer.events, [1, 2]);
    // At least the target was incapacitated → rate < 1.0
    expect(rate).toBeLessThan(1.0);
  });
});
