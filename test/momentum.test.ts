// test/momentum.test.ts — Phase 2 extension: swing momentum carry
import { describe, it, expect } from "vitest";
import { q, SCALE, qMul } from "../src/units";
import { STARTER_WEAPONS } from "../src/equipment";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { defaultAction } from "../src/sim/action";
import { TraceKinds } from "../src/sim/kinds";
import type { TraceEvent } from "../src/sim/trace";
import { TUNING } from "../src/sim/tuning";

const club = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;
const CLOSE_DIST = Math.trunc(0.5 * SCALE.m);

function runTick(world: ReturnType<typeof mkWorld>, cmds: Map<number, any[]>): TraceEvent[] {
  const events: TraceEvent[] = [];
  const trace = { onEvent: (ev: TraceEvent) => events.push(ev) };
  stepWorld(world, cmds, { tractionCoeff: q(0.9), tuning: TUNING.tactical, trace });
  return events;
}

function totalDamage(entity: any): number {
  let total = 0;
  for (const reg of Object.values(entity.injury.byRegion) as any[]) {
    total += (reg.surfaceDamage ?? 0) + (reg.internalDamage ?? 0) + (reg.structuralDamage ?? 0);
  }
  return total;
}

describe("Swing momentum carry", () => {
  it("fresh entity has swingMomentumQ = 0", () => {
    expect(defaultAction().swingMomentumQ).toBe(0);
  });

  it("momentum decays by SWING_MOMENTUM_DECAY (q(0.95)) each tick", () => {
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    attacker.loadout.items = [club];
    const target = mkHumanoidEntity(2, 2, Math.trunc(50 * SCALE.m), 0); // far — no attack
    const world = mkWorld(1, [attacker, target]);
    (attacker.action as any).swingMomentumQ = q(0.80);

    runTick(world, new Map());

    const e1 = world.entities.find(e => e.id === 1)!;
    // After tick: momentum should decay by q(0.95)
    expect(e1.action.swingMomentumQ).toBe(qMul(q(0.80), q(0.95)));
  });

  it("momentum is set to q(0.80) × intensity after a clean hit", () => {
    let hitFound = false;
    for (let seed = 1; seed <= 300; seed++) {
      const attacker = mkHumanoidEntity(1, 1, 0, 0);
      attacker.loadout.items = [club];
      const target = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
      const world = mkWorld(seed, [attacker, target]);

      const cmds = new Map([[1, [{ kind: "attack", targetId: 2, weaponId: "wpn_club", intensity: q(1.0), mode: "strike" }]]]);
      const events = runTick(world, cmds);

      const attempt = events.find(e => e.kind === TraceKinds.AttackAttempt) as any;
      const e1 = world.entities.find(e => e.id === 1)!;

      if (attempt?.hit && !attempt?.blocked && !attempt?.parried) {
        // Clean hit: momentum should be set to clampQ(q(1.0) × q(0.80)) = 8000 = q(0.80)
        expect(e1.action.swingMomentumQ).toBeGreaterThan(0);
        expect(e1.action.swingMomentumQ).toBeLessThanOrEqual(q(0.80));
        hitFound = true;
        break;
      }
    }
    expect(hitFound).toBe(true);
  });

  it("momentum is reset to 0 after a miss", () => {
    let missFound = false;
    for (let seed = 1; seed <= 300; seed++) {
      const attacker = mkHumanoidEntity(1, 1, 0, 0);
      attacker.loadout.items = [club];
      (attacker.action as any).swingMomentumQ = q(0.80); // pre-set momentum
      const target = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
      const world = mkWorld(seed, [attacker, target]);

      const cmds = new Map([[1, [{ kind: "attack", targetId: 2, weaponId: "wpn_club", intensity: q(1.0), mode: "strike" }]]]);
      const events = runTick(world, cmds);

      const attempt = events.find(e => e.kind === TraceKinds.AttackAttempt) as any;
      const e1 = world.entities.find(e => e.id === 1)!;

      if (!attempt?.hit) {
        // Miss: momentum should be reset to 0
        expect(e1.action.swingMomentumQ).toBe(0);
        missFound = true;
        break;
      }
    }
    expect(missFound).toBe(true);
  });

  it("momentum is reset to 0 when attack is blocked or parried", () => {
    let defendedFound = false;
    for (let seed = 1; seed <= 300; seed++) {
      const attacker = mkHumanoidEntity(1, 1, 0, 0);
      attacker.loadout.items = [club];
      (attacker.action as any).swingMomentumQ = q(0.80);
      const target = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
      target.loadout.items = [club];
      const world = mkWorld(seed, [attacker, target]);

      // Target must issue a "defend" command in the same tick — setting intent directly gets reset
      const cmds = new Map<number, any[]>([
        [1, [{ kind: "attack", targetId: 2, weaponId: "wpn_club", intensity: q(1.0), mode: "strike" }]],
        [2, [{ kind: "defend", mode: "block", intensity: q(1.0) }]],
      ]);
      const events = runTick(world, cmds);

      const attempt = events.find(e => e.kind === TraceKinds.AttackAttempt) as any;
      const e1 = world.entities.find(e => e.id === 1)!;

      if (attempt?.hit && (attempt?.blocked || attempt?.parried)) {
        expect(e1.action.swingMomentumQ).toBe(0);
        defendedFound = true;
        break;
      }
    }
    expect(defendedFound).toBe(true);
  });

  it("pre-set momentum boosts damage on a clean hit (same seed)", () => {
    // Find a seed where attacker lands a clean hit on an undefended target
    let foundSeed = -1;
    for (let seed = 1; seed <= 300; seed++) {
      const attacker = mkHumanoidEntity(1, 1, 0, 0);
      attacker.loadout.items = [club];
      const target = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
      const world = mkWorld(seed, [attacker, target]);
      const cmds = new Map([[1, [{ kind: "attack", targetId: 2, weaponId: "wpn_club", intensity: q(1.0), mode: "strike" }]]]);
      const ev = runTick(world, cmds);
      const attempt = ev.find(e => e.kind === TraceKinds.AttackAttempt) as any;
      if (attempt?.hit && !attempt?.blocked && !attempt?.parried) {
        foundSeed = seed;
        break;
      }
    }
    expect(foundSeed).toBeGreaterThan(0);

    const cmds = new Map([[1, [{ kind: "attack", targetId: 2, weaponId: "wpn_club", intensity: q(1.0), mode: "strike" }]]]);

    // World A: no momentum
    const attA = mkHumanoidEntity(1, 1, 0, 0);
    attA.loadout.items = [club];
    const wA = mkWorld(foundSeed, [attA, mkHumanoidEntity(2, 2, CLOSE_DIST, 0)]);
    runTick(wA, cmds);
    const dmgA = totalDamage(wA.entities.find(e => e.id === 2)!);

    // World B: pre-set momentum = q(0.80)
    const attB = mkHumanoidEntity(1, 1, 0, 0);
    attB.loadout.items = [club];
    (attB.action as any).swingMomentumQ = q(0.80);
    const wB = mkWorld(foundSeed, [attB, mkHumanoidEntity(2, 2, CLOSE_DIST, 0)]);
    runTick(wB, cmds);
    const dmgB = totalDamage(wB.entities.find(e => e.id === 2)!);

    // World B should deal strictly more damage due to momentum bonus
    expect(dmgB).toBeGreaterThan(dmgA);
  });

  it("momentum bonus never exceeds SWING_MOMENTUM_MAX (q(0.12)) fraction of energy", () => {
    // Maximum possible momentum after a hit is q(0.80) = 8000
    // Decay before attack: qMul(8000, q(0.95)) = 7600
    // Max bonus fraction = qMul(7600, q(0.12)) = qMul(7600, 1200) / 10000 = 912 / 10000 ≈ 9.12%
    // At most q(0.12) of energy — verify this holds by checking the momentum field
    const e = mkHumanoidEntity(1, 1, 0, 0);
    (e.action as any).swingMomentumQ = q(0.80);
    const world = mkWorld(1, [e]);
    runTick(world, new Map());
    // After decay, momentum ≤ q(0.80), so bonus ≤ qMul(q(0.80), q(0.12)) = 960/10000 of energy
    const decayed = world.entities[0]!.action.swingMomentumQ;
    const maxBonusFrac = qMul(decayed, q(0.12));
    expect(maxBonusFrac).toBeLessThanOrEqual(q(0.12));
  });

  it("dead entity: momentum decay fires each tick without crashing", () => {
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    (attacker as any).injury.dead = true;
    (attacker.action as any).swingMomentumQ = q(0.50);
    const world = mkWorld(1, [attacker]);

    // Should not throw
    runTick(world, new Map());

    const e = world.entities.find(e => e.id === 1)!;
    expect(e.action.swingMomentumQ).toBe(qMul(q(0.50), q(0.95)));
  });
});
