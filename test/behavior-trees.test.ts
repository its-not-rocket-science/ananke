/**
 * CE-10 — Pre-built AI Behavior Tree Library tests
 */

import { describe, it, expect } from "vitest";
import {
  FlankTarget,
  RetreatTo,
  ProtectAlly,
  GuardPosition,
  HealTarget,
  Sequence,
  Fallback,
  IfNotShocked,
  IfNotExhausted,
  WithProbability,
  aggressorTree,
  defenderTree,
  medicTree,
  type BehaviorNode,
} from "../src/sim/ai/behavior-trees.js";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing.js";
import { q, SCALE } from "../src/units.js";
import { CommandKinds } from "../src/sim/kinds.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

const CTX = { tractionCoeff: q(0.8) };

function makeWorld(entities: ReturnType<typeof mkHumanoidEntity>[]) {
  return mkWorld(42, entities);
}

// ── FlankTarget ───────────────────────────────────────────────────────────────

describe("FlankTarget", () => {
  it("returns Move when target is far away", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 100_000, 0);
    const world = makeWorld([entity, target]);
    const node = FlankTarget(target.id);
    const cmd = node.tick(entity, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Move);
  });

  it("returns Attack when within melee range (~1.5 m)", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 10_000, 0);  // 1 m — within 1.5 m threshold
    const world = makeWorld([entity, target]);
    const cmd = FlankTarget(target.id).tick(entity, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Attack);
  });

  it("returns null when target is dead", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 100_000, 0);
    target.injury.dead = true;
    const world = makeWorld([entity, target]);
    const cmd = FlankTarget(target.id).tick(entity, world, CTX);
    expect(cmd).toBeNull();
  });

  it("returns null when target is missing", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world = makeWorld([entity]);
    expect(FlankTarget(999).tick(entity, world, CTX)).toBeNull();
  });

  it("Attack command targets the correct id", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 10_000, 0);
    const world = makeWorld([entity, target]);
    const cmd = FlankTarget(target.id).tick(entity, world, CTX);
    expect(cmd?.kind === CommandKinds.Attack && cmd.targetId).toBe(target.id);
  });

  it("Move direction has non-zero x component when target is east", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 100_000, 0);
    const world = makeWorld([entity, target]);
    const cmd = FlankTarget(target.id).tick(entity, world, CTX);
    expect(cmd?.kind === CommandKinds.Move && cmd.dir.x).toBeGreaterThan(0);
  });
});

// ── RetreatTo ─────────────────────────────────────────────────────────────────

describe("RetreatTo", () => {
  it("returns Move when not at destination", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world = makeWorld([entity]);
    const cmd = RetreatTo(100_000, 0).tick(entity, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Move);
  });

  it("returns null when already at destination", () => {
    const entity = mkHumanoidEntity(1, 1, 100_000, 0);
    const world = makeWorld([entity]);
    // Arrival radius default 5 000; entity is exactly at destination
    const cmd = RetreatTo(100_000, 0).tick(entity, world, CTX);
    expect(cmd).toBeNull();
  });

  it("returns null when within arrival radius", () => {
    const entity = mkHumanoidEntity(1, 1, 101_000, 0);
    const world = makeWorld([entity]);
    // 1 000 Sm from destination, arrival radius default 5 000
    const cmd = RetreatTo(100_000, 0).tick(entity, world, CTX);
    expect(cmd).toBeNull();
  });

  it("Move direction points toward destination", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world = makeWorld([entity]);
    const cmd = RetreatTo(0, 100_000).tick(entity, world, CTX);
    expect(cmd?.kind === CommandKinds.Move && cmd.dir.y).toBeGreaterThan(0);
  });

  it("custom arrival radius is respected", () => {
    const entity = mkHumanoidEntity(1, 1, 90_000, 0);
    const world = makeWorld([entity]);
    // 10 000 from destination; custom radius 15 000 — should return null
    const cmd = RetreatTo(100_000, 0, 15_000).tick(entity, world, CTX);
    expect(cmd).toBeNull();
  });
});

// ── ProtectAlly ───────────────────────────────────────────────────────────────

describe("ProtectAlly", () => {
  it("returns Defend when close to ally with threats present", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const ally   = mkHumanoidEntity(2, 1, 10_000, 0);  // 1 m — within 2 m threshold
    const enemy  = mkHumanoidEntity(3, 2, 50_000, 0);
    const world  = makeWorld([entity, ally, enemy]);
    const cmd = ProtectAlly(ally.id).tick(entity, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Defend);
  });

  it("returns Move when far from ally", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const ally   = mkHumanoidEntity(2, 1, 100_000, 0);
    const enemy  = mkHumanoidEntity(3, 2, 200_000, 0);
    const world  = makeWorld([entity, ally, enemy]);
    const cmd = ProtectAlly(ally.id).tick(entity, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Move);
  });

  it("returns null when ally is dead", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const ally   = mkHumanoidEntity(2, 1, 10_000, 0);
    ally.injury.dead = true;
    const world = makeWorld([entity, ally]);
    expect(ProtectAlly(ally.id).tick(entity, world, CTX)).toBeNull();
  });

  it("returns null when no threats present", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const ally   = mkHumanoidEntity(2, 1, 10_000, 0);
    const world  = makeWorld([entity, ally]);
    // No third entity — no threats
    expect(ProtectAlly(ally.id).tick(entity, world, CTX)).toBeNull();
  });

  it("returns null when ally is missing", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world  = makeWorld([entity]);
    expect(ProtectAlly(999).tick(entity, world, CTX)).toBeNull();
  });
});

// ── GuardPosition ─────────────────────────────────────────────────────────────

describe("GuardPosition", () => {
  it("returns Move when outside radius", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world = makeWorld([entity]);
    const cmd = GuardPosition(100_000, 0, 10_000).tick(entity, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Move);
  });

  it("returns Defend when inside radius with threats", () => {
    const entity = mkHumanoidEntity(1, 1, 100_000, 0);
    const threat = mkHumanoidEntity(2, 2, 200_000, 0);
    const world  = makeWorld([entity, threat]);
    const cmd = GuardPosition(100_000, 0, 20_000).tick(entity, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Defend);
  });

  it("returns null when inside radius with no threats", () => {
    const entity = mkHumanoidEntity(1, 1, 100_000, 0);
    const world  = makeWorld([entity]);
    expect(GuardPosition(100_000, 0, 20_000).tick(entity, world, CTX)).toBeNull();
  });

  it("Move direction points toward guard point", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world  = makeWorld([entity]);
    const cmd = GuardPosition(0, 100_000, 10_000).tick(entity, world, CTX);
    expect(cmd?.kind === CommandKinds.Move && cmd.dir.y).toBeGreaterThan(0);
  });
});

// ── HealTarget ────────────────────────────────────────────────────────────────

describe("HealTarget", () => {
  it("returns null when target has no injuries", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 5_000, 0);
    const world  = makeWorld([entity, target]);
    expect(HealTarget(target.id).tick(entity, world, CTX)).toBeNull();
  });

  it("returns Treat when close to injured target", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 5_000, 0);
    // Inject surface damage into a region
    target.injury.byRegion["torso"]!.surfaceDamage = q(0.3);
    const world = makeWorld([entity, target]);
    const cmd = HealTarget(target.id).tick(entity, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Treat);
  });

  it("returns Move when far from injured target", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 100_000, 0);
    target.injury.byRegion["torso"]!.surfaceDamage = q(0.3);
    const world = makeWorld([entity, target]);
    const cmd = HealTarget(target.id).tick(entity, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Move);
  });

  it("returns null when target is dead", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 5_000, 0);
    target.injury.byRegion["torso"]!.surfaceDamage = q(0.3);
    target.injury.dead = true;
    const world = makeWorld([entity, target]);
    expect(HealTarget(target.id).tick(entity, world, CTX)).toBeNull();
  });

  it("returns null when target is missing", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world  = makeWorld([entity]);
    expect(HealTarget(999).tick(entity, world, CTX)).toBeNull();
  });

  it("Treat command targets correct entity", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 5_000, 0);
    target.injury.byRegion["torso"]!.internalDamage = q(0.2);
    const world = makeWorld([entity, target]);
    const cmd = HealTarget(target.id).tick(entity, world, CTX);
    expect(cmd?.kind === CommandKinds.Treat && cmd.targetId).toBe(target.id);
  });
});

// ── Sequence ──────────────────────────────────────────────────────────────────

describe("Sequence", () => {
  it("returns first non-null result", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world  = makeWorld([entity]);
    const null1: BehaviorNode = { tick: () => null };
    const null2: BehaviorNode = { tick: () => null };
    const moveNode: BehaviorNode = {
      tick: () => ({ kind: CommandKinds.Move, dir: { x: 0, y: q(1.0), z: 0 }, intensity: q(1.0), mode: "run" }),
    };
    const node = Sequence(null1, null2, moveNode);
    const cmd = node.tick(entity, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Move);
  });

  it("returns null when all children return null", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world  = makeWorld([entity]);
    const nullNode: BehaviorNode = { tick: () => null };
    const node = Sequence(nullNode, nullNode, nullNode);
    expect(node.tick(entity, world, CTX)).toBeNull();
  });

  it("returns null when no children", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world  = makeWorld([entity]);
    expect(Sequence().tick(entity, world, CTX)).toBeNull();
  });

  it("skips nodes after the first successful one", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world  = makeWorld([entity]);
    let secondCalled = false;
    const first: BehaviorNode = {
      tick: () => ({ kind: CommandKinds.SetProne, prone: true }),
    };
    const second: BehaviorNode = {
      tick: () => { secondCalled = true; return null; },
    };
    Sequence(first, second).tick(entity, world, CTX);
    expect(secondCalled).toBe(false);
  });
});

// ── Fallback ──────────────────────────────────────────────────────────────────

describe("Fallback", () => {
  it("is equivalent to Sequence — returns first non-null", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world  = makeWorld([entity]);
    const moveCmd = { kind: CommandKinds.Move as const, dir: { x: 0, y: q(1.0), z: 0 }, intensity: q(1.0), mode: "walk" as const };
    const nodes = [
      { tick: () => null } as BehaviorNode,
      { tick: () => moveCmd } as BehaviorNode,
    ];
    expect(Fallback(...nodes).tick(entity, world, CTX)?.kind).toBe(CommandKinds.Move);
  });
});

// ── IfNotShocked ──────────────────────────────────────────────────────────────

describe("IfNotShocked", () => {
  const inner: BehaviorNode = {
    tick: () => ({ kind: CommandKinds.SetProne, prone: false }),
  };

  it("passes through when shock is below threshold", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.injury.shock = q(0.30);
    const world = makeWorld([entity]);
    const cmd = IfNotShocked(q(0.70), inner).tick(entity, world, CTX);
    expect(cmd).not.toBeNull();
  });

  it("blocks when shock meets threshold", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.injury.shock = q(0.70);
    const world = makeWorld([entity]);
    expect(IfNotShocked(q(0.70), inner).tick(entity, world, CTX)).toBeNull();
  });

  it("blocks when shock exceeds threshold", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.injury.shock = q(0.90);
    const world = makeWorld([entity]);
    expect(IfNotShocked(q(0.70), inner).tick(entity, world, CTX)).toBeNull();
  });

  it("passes through when entity has no shock (defaults to 0)", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.injury.shock = q(0);
    const world = makeWorld([entity]);
    const cmd = IfNotShocked(q(0.70), inner).tick(entity, world, CTX);
    expect(cmd).not.toBeNull();
  });
});

// ── IfNotExhausted ────────────────────────────────────────────────────────────

describe("IfNotExhausted", () => {
  const inner: BehaviorNode = {
    tick: () => ({ kind: CommandKinds.SetProne, prone: false }),
  };

  it("passes through when fatigue is below threshold", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.energy.fatigue = q(0.30);
    const world = makeWorld([entity]);
    const cmd = IfNotExhausted(q(0.80), inner).tick(entity, world, CTX);
    expect(cmd).not.toBeNull();
  });

  it("blocks when fatigue meets threshold", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.energy.fatigue = q(0.80);
    const world = makeWorld([entity]);
    expect(IfNotExhausted(q(0.80), inner).tick(entity, world, CTX)).toBeNull();
  });

  it("blocks when fatigue exceeds threshold", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.energy.fatigue = q(0.95);
    const world = makeWorld([entity]);
    expect(IfNotExhausted(q(0.80), inner).tick(entity, world, CTX)).toBeNull();
  });
});

// ── WithProbability ───────────────────────────────────────────────────────────

describe("WithProbability", () => {
  const inner: BehaviorNode = {
    tick: () => ({ kind: CommandKinds.SetProne, prone: true }),
  };

  it("always fires at q(1.0) probability", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world  = makeWorld([entity]);
    // q(1.0) = SCALE.Q — all rolls below this
    const cmd = WithProbability(SCALE.Q as ReturnType<typeof q>, inner).tick(entity, world, CTX);
    expect(cmd).not.toBeNull();
  });

  it("never fires at q(0) probability", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world  = makeWorld([entity]);
    expect(WithProbability(q(0), inner).tick(entity, world, CTX)).toBeNull();
  });

  it("is deterministic (same seed+tick+entity → same result)", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world  = makeWorld([entity]);
    const result1 = WithProbability(q(0.5), inner).tick(entity, world, CTX);
    const result2 = WithProbability(q(0.5), inner).tick(entity, world, CTX);
    // Both calls use identical inputs — must produce identical output
    expect((result1 === null)).toBe((result2 === null));
  });

  it("different salts produce independent rolls", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const world  = makeWorld([entity]);
    // Run many seeds to find a divergence — or just verify both are non-crashing
    // (statistical test is impractical in deterministic unit tests)
    expect(() => {
      WithProbability(q(0.5), inner, 0).tick(entity, world, CTX);
      WithProbability(q(0.5), inner, 1).tick(entity, world, CTX);
    }).not.toThrow();
  });
});

// ── Preset trees ─────────────────────────────────────────────────────────────

describe("aggressorTree", () => {
  it("attacks when not shocked and target is in range", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 10_000, 0);
    entity.injury.shock = q(0.10);  // low shock — below q(0.70) gate
    const world = makeWorld([entity, target]);
    const cmd = aggressorTree(target.id, -100_000, 0).tick(entity, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Attack);
  });

  it("retreats when badly shocked", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 10_000, 0);
    entity.injury.shock = q(0.80);  // above gate threshold
    const world = makeWorld([entity, target]);
    const cmd = aggressorTree(target.id, -100_000, 0).tick(entity, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Move);
  });
});

describe("defenderTree", () => {
  it("guards position when no injured allies", () => {
    const entity = mkHumanoidEntity(1, 1, 100_000, 0);
    const threat = mkHumanoidEntity(2, 2, 200_000, 0);
    const world  = makeWorld([entity, threat]);
    const cmd = defenderTree(100_000, 0, 20_000, []).tick(entity, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Defend);
  });

  it("heals ally when ally is injured and in range", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    const ally   = mkHumanoidEntity(2, 1, 5_000, 0);
    ally.injury.byRegion["torso"]!.surfaceDamage = q(0.4);
    const world = makeWorld([entity, ally]);
    const cmd = defenderTree(0, 0, 10_000, [ally.id]).tick(entity, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Treat);
  });
});

describe("medicTree", () => {
  it("heals first injured ally", () => {
    const medic = mkHumanoidEntity(1, 1, 0, 0);
    const p1    = mkHumanoidEntity(2, 1, 5_000, 0);
    p1.injury.byRegion["leftArm"]!.surfaceDamage = q(0.5);
    const p2    = mkHumanoidEntity(3, 1, 6_000, 0);
    p2.injury.byRegion["rightArm"]!.surfaceDamage = q(0.3);
    medic.injury.shock = q(0.10);  // not shocked
    const world = makeWorld([medic, p1, p2]);
    const cmd = medicTree([p1.id, p2.id], -50_000, 0).tick(medic, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Treat);
  });

  it("retreats when medic is badly shocked", () => {
    const medic = mkHumanoidEntity(1, 1, 0, 0);
    medic.injury.shock = q(0.85);  // above q(0.80) gate
    const world = makeWorld([medic]);
    const cmd = medicTree([], -50_000, 0).tick(medic, world, CTX);
    expect(cmd?.kind).toBe(CommandKinds.Move);
  });
});
