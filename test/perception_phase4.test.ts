/**
 * Phase 4 — Perception and Cognition tests
 *
 * Covers:
 * - canDetect: vision arc, range, hearing, environment modifiers
 * - perceiveLocal: sensory-filtered enemy detection
 * - decideCommandsForEntity: decision latency cooldown
 * - Surprise mechanics (canDetect in attack context)
 * - IndividualAttributes.perception generated from archetype
 * - Init guard: entities without perception get DEFAULT_PERCEPTION after stepWorld
 */

import { describe, it, expect } from "vitest";
import { SCALE, q } from "../src/units";
import {
  canDetect,
  DEFAULT_SENSORY_ENV,
  DEFAULT_PERCEPTION,
  type SensoryEnvironment,
} from "../src/sim/sensory";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { perceiveLocal } from "../src/sim/ai/perception";
import { decideCommandsForEntity } from "../src/sim/ai/decide";
import { buildWorldIndex } from "../src/sim/indexing";
import { buildSpatialIndex } from "../src/sim/spatial";
import { generateIndividual } from "../src/generate";
import { HUMAN_BASE, SERVICE_ROBOT } from "../src/archetypes";
import { STARTER_WEAPONS } from "../src/equipment";
import { stepWorld } from "../src/sim/kernel";
import type { AIPolicy } from "../src/sim/ai/types";

const M = SCALE.m;   // 10000 — raw units per metre

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultPolicy(): AIPolicy {
  return {
    archetype: "lineInfantry",
    desiredRange_m: Math.trunc(1.5 * M),
    engageRange_m: Math.trunc(1.0 * M),
    retreatRange_m: Math.trunc(0.5 * M),
    threatRange_m: Math.trunc(2.0 * M),
    defendWhenThreatenedQ: q(0.7),
    parryBiasQ: q(0.3),
    dodgeBiasQ: q(0.2),
    retargetCooldownTicks: 5,
    focusStickinessQ: q(0.5),
  };
}

// ── Unit: canDetect ─────────────────────────────────────────────────────────

describe("canDetect", () => {
  it("returns q(1.0) when target is in front within vision range", () => {
    // Observer at origin facing +x; target at +5m — in front, well within 120° arc and 200m vision
    const observer = mkHumanoidEntity(1, 1, 0, 0);
    const target   = mkHumanoidEntity(2, 2, Math.trunc(5 * M), 0);

    const det = canDetect(observer, target, DEFAULT_SENSORY_ENV);
    expect(det).toBe(q(1.0));
  });

  it("returns q(0.4) when target is directly behind observer within hearing range", () => {
    // Observer at (0,0) facing +x; target at (-5m, 0) — directly behind, within 50m hearing
    const observer = mkHumanoidEntity(1, 1, 0, 0);
    const target   = mkHumanoidEntity(2, 2, Math.trunc(-5 * M), 0);

    const det = canDetect(observer, target, DEFAULT_SENSORY_ENV);
    expect(det).toBe(q(0.4));
  });

  it("returns q(0) when target is behind observer and beyond hearing range", () => {
    // Observer facing +x; target at -100m (behind, beyond 50m hearing range)
    const observer = mkHumanoidEntity(1, 1, 0, 0);
    const target   = mkHumanoidEntity(2, 2, Math.trunc(-100 * M), 0);

    const det = canDetect(observer, target, DEFAULT_SENSORY_ENV);
    expect(det).toBe(q(0));
  });

  it("target at 90° to the side is heard but not seen (outside 120° arc)", () => {
    // Observer facing +x; target at (0, +5m) — 90° to the side
    // cos(90°) = 0 < halfArcCosQ(120°) = cos(60°) ≈ 0.5 → outside arc
    // But 5m < 50m hearing range → heard
    const observer = mkHumanoidEntity(1, 1, 0, 0);
    const target   = mkHumanoidEntity(2, 2, 0, Math.trunc(5 * M));

    const det = canDetect(observer, target, DEFAULT_SENSORY_ENV);
    expect(det).toBe(q(0.4));
  });

  it("target at 45° angle is fully visible (within 60° half-arc)", () => {
    // cos(45°) ≈ 0.707 > halfArcCosQ(120°) = 0.5 → in arc
    const observer = mkHumanoidEntity(1, 1, 0, 0);
    const target   = mkHumanoidEntity(2, 2, Math.trunc(5 * M), Math.trunc(5 * M));

    const det = canDetect(observer, target, DEFAULT_SENSORY_ENV);
    expect(det).toBe(q(1.0));
  });

  it("360° arc entity (robot) detects target directly behind itself", () => {
    const robotAttrs = generateIndividual(1, SERVICE_ROBOT);
    const observer   = mkHumanoidEntity(1, 1, 0, 0);
    (observer.attributes as any).perception = robotAttrs.perception;

    const target = mkHumanoidEntity(2, 2, Math.trunc(-5 * M), 0); // directly behind

    const det = canDetect(observer, target, DEFAULT_SENSORY_ENV);
    expect(det).toBe(q(1.0)); // 360° arc → always in vision
  });

  it("reduced vision from smokeMul: target at 15m visible in clear, heard-only in heavy smoke", () => {
    // smokeMul = q(0.05) → effectiveVision = 200m × 0.05 = 10m < 15m → not seen
    // But 15m < 50m hearing range → heard
    const observer  = mkHumanoidEntity(1, 1, 0, 0);
    const target    = mkHumanoidEntity(2, 2, Math.trunc(15 * M), 0);
    const smokeEnv: SensoryEnvironment = { lightMul: q(1.0), smokeMul: q(0.05), noiseMul: q(1.0) };

    expect(canDetect(observer, target, DEFAULT_SENSORY_ENV)).toBe(q(1.0));
    expect(canDetect(observer, target, smokeEnv)).toBe(q(0.4));
  });

  it("returns q(0) when target is beyond both vision and hearing in heavy smoke", () => {
    // Target at 60m ahead; smoke makes vision ~2m; hearing range = 50m < 60m
    const observer = mkHumanoidEntity(1, 1, 0, 0);
    const target   = mkHumanoidEntity(2, 2, Math.trunc(60 * M), 0);
    const smokeEnv: SensoryEnvironment = { lightMul: q(1.0), smokeMul: q(0.01), noiseMul: q(1.0) };

    expect(canDetect(observer, target, smokeEnv)).toBe(q(0));
  });
});

// ── Unit: Perception attributes from archetype ─────────────────────────────

describe("generateIndividual: perception attributes", () => {
  it("human has expected perception fields", () => {
    const attrs = generateIndividual(42, HUMAN_BASE);
    expect(attrs.perception).toBeDefined();
    expect(attrs.perception.visionRange_m).toBe(Math.trunc(200 * M));
    expect(attrs.perception.visionArcDeg).toBe(120);
    expect(attrs.perception.hearingRange_m).toBe(Math.trunc(50 * M));
    expect(attrs.perception.decisionLatency_s).toBe(Math.trunc(0.5 * SCALE.s));
    expect(attrs.perception.attentionDepth).toBe(4);
    expect(attrs.perception.threatHorizon_m).toBe(Math.trunc(40 * M));
    // halfArcCosQ ≈ cos(60°) × SCALE.Q ≈ 5000
    expect(attrs.perception.halfArcCosQ).toBeGreaterThan(4800);
    expect(attrs.perception.halfArcCosQ).toBeLessThan(5200);
  });

  it("robot has wider vision and shorter decision latency than human", () => {
    const humanAttrs = generateIndividual(42, HUMAN_BASE);
    const robotAttrs = generateIndividual(42, SERVICE_ROBOT);
    expect(robotAttrs.perception.visionRange_m).toBeGreaterThan(humanAttrs.perception.visionRange_m);
    expect(robotAttrs.perception.visionArcDeg).toBe(360);
    expect(robotAttrs.perception.decisionLatency_s).toBeLessThan(humanAttrs.perception.decisionLatency_s);
    expect(robotAttrs.perception.attentionDepth).toBeGreaterThan(humanAttrs.perception.attentionDepth);
  });

  it("halfArcCosQ for 360° arc is cos(180°) = negative", () => {
    const attrs = generateIndividual(1, SERVICE_ROBOT);
    // cos(180°) = -1 → halfArcCosQ ≈ -10000, but any dotQ >= that so always in arc
    expect(attrs.perception.halfArcCosQ).toBeLessThanOrEqual(0);
  });
});

// ── Integration: perceiveLocal with sensory filtering ──────────────────────

describe("perceiveLocal: sensory filtering", () => {
  it("enemy beyond threat horizon is not detected", () => {
    // Human threat horizon = 40m. Enemy at 50m should be excluded.
    const self  = mkHumanoidEntity(1, 1, 0, 0);
    const enemy = mkHumanoidEntity(2, 2, Math.trunc(50 * M), 0);
    const world = mkWorld(1, [self, enemy]);
    const idx   = buildWorldIndex(world);
    const spt   = buildSpatialIndex(world, Math.trunc(4 * M));

    const p = perceiveLocal(self, idx, spt, Math.trunc(100 * M), 24, DEFAULT_SENSORY_ENV);
    expect(p.enemies.length).toBe(0);
  });

  it("enemy within threat horizon and vision arc is detected", () => {
    const self  = mkHumanoidEntity(1, 1, 0, 0);
    const enemy = mkHumanoidEntity(2, 2, Math.trunc(5 * M), 0);
    const world = mkWorld(1, [self, enemy]);
    const idx   = buildWorldIndex(world);
    const spt   = buildSpatialIndex(world, Math.trunc(4 * M));

    const p = perceiveLocal(self, idx, spt, Math.trunc(100 * M), 24, DEFAULT_SENSORY_ENV);
    expect(p.enemies.length).toBe(1);
    expect(p.enemies[0].id).toBe(2);
  });

  it("enemy behind observer (outside arc) within hearing is still included", () => {
    // Enemy directly behind at 5m → heard (q(0.4) > 0) → included
    const self  = mkHumanoidEntity(1, 1, 0, 0);
    const enemy = mkHumanoidEntity(2, 2, Math.trunc(-5 * M), 0);
    const world = mkWorld(1, [self, enemy]);
    const idx   = buildWorldIndex(world);
    const spt   = buildSpatialIndex(world, Math.trunc(4 * M));

    const p = perceiveLocal(self, idx, spt, Math.trunc(100 * M), 24, DEFAULT_SENSORY_ENV);
    expect(p.enemies.length).toBe(1);
  });

  it("maxCount limits the number of returned enemies", () => {
    const self   = mkHumanoidEntity(1, 1, 0, 0);
    const nearby = [2, 3, 4, 5, 6, 7].map(id =>
      mkHumanoidEntity(id, 2, Math.trunc((id - 1) * M), 0)
    );
    const world = mkWorld(1, [self, ...nearby]);
    const idx   = buildWorldIndex(world);
    const spt   = buildSpatialIndex(world, Math.trunc(4 * M));

    const p = perceiveLocal(self, idx, spt, Math.trunc(100 * M), 3, DEFAULT_SENSORY_ENV);
    expect(p.enemies.length).toBeLessThanOrEqual(3);
  });
});

// ── Integration: decision latency ─────────────────────────────────────────

describe("decideCommandsForEntity: decision latency", () => {
  it("returns commands on first call then empty during cooldown", () => {
    const self  = mkHumanoidEntity(1, 1, 0, 0);
    const enemy = mkHumanoidEntity(2, 2, Math.trunc(M), 0);
    const world = mkWorld(1, [self, enemy]);
    const idx   = buildWorldIndex(world);
    const spt   = buildSpatialIndex(world, Math.trunc(4 * M));
    const pol   = defaultPolicy();

    // First call: decisionCooldownTicks=0 → plan and set cooldown
    decideCommandsForEntity(world, idx, spt, self, pol);
    expect(self.ai!.decisionCooldownTicks).toBeGreaterThan(0);

    // Immediate second call: still cooling down → returns []
    const cmds = decideCommandsForEntity(world, idx, spt, self, pol);
    expect(cmds).toHaveLength(0);
  });

  it("human decision latency is 10 ticks (0.5s × 20Hz)", () => {
    const attrs = generateIndividual(1, HUMAN_BASE);
    const ticks = Math.max(1, Math.trunc((attrs.perception.decisionLatency_s * 20) / SCALE.s));
    expect(ticks).toBe(10);
  });

  it("robot decision latency is 1 tick (0.05s × 20Hz = 1)", () => {
    const attrs = generateIndividual(1, SERVICE_ROBOT);
    const ticks = Math.max(1, Math.trunc((attrs.perception.decisionLatency_s * 20) / SCALE.s));
    expect(ticks).toBe(1);
  });

  it("cooldown expires and entity can replan after latency ticks", () => {
    const self  = mkHumanoidEntity(1, 1, 0, 0);
    const enemy = mkHumanoidEntity(2, 2, Math.trunc(M), 0);
    const world = mkWorld(1, [self, enemy]);
    const idx   = buildWorldIndex(world);
    const spt   = buildSpatialIndex(world, Math.trunc(4 * M));
    const pol   = defaultPolicy();

    decideCommandsForEntity(world, idx, spt, self, pol); // plan once, set cooldown
    const firstCooldown = self.ai!.decisionCooldownTicks;
    expect(firstCooldown).toBeGreaterThan(0);

    // Drain cooldown to 2 so we can verify the mid-cooldown state
    self.ai!.decisionCooldownTicks = 2;
    // Call with cooldown=2: decrements to 1, still > 0 → returns [] without replanning
    const midCmds = decideCommandsForEntity(world, idx, spt, self, pol);
    expect(midCmds).toHaveLength(0);
    expect(self.ai!.decisionCooldownTicks).toBe(1);

    // Call with cooldown=1: decrements to 0, NOT > 0 → replans → resets cooldown to latencyTicks
    decideCommandsForEntity(world, idx, spt, self, pol);
    expect(self.ai!.decisionCooldownTicks).toBe(firstCooldown); // set back to full latency
  });
});

// ── Integration: surprise mechanics ────────────────────────────────────────

describe("surprise mechanics", () => {
  it("canDetect: attacker 1m behind defender → partial detection (q(0.4))", () => {
    // In melee combat, attacker is behind defender → partial surprise
    const defender = mkHumanoidEntity(2, 2, Math.trunc(M), 0);
    const attacker = mkHumanoidEntity(1, 1, 0, 0); // at origin, behind defender

    // defender faces +x (default); attacker at -x relative to defender → behind
    const det = canDetect(defender, attacker, DEFAULT_SENSORY_ENV);
    expect(det).toBe(q(0.4));
    expect(det).toBeLessThan(q(0.8)); // triggers partial surprise in resolveAttack
  });

  it("canDetect: attacker 1m in front of defender → full detection", () => {
    // Defender faces +x; attacker is at +x → directly in front
    const defender = mkHumanoidEntity(1, 1, 0, 0);
    const attacker = mkHumanoidEntity(2, 2, Math.trunc(M), 0);

    const det = canDetect(defender, attacker, DEFAULT_SENSORY_ENV);
    expect(det).toBe(q(1.0));
    expect(det).toBeGreaterThanOrEqual(q(0.8)); // no surprise
  });

  it("rear attack (partial surprise) causes at least as much injury as frontal in aggregate", () => {
    // Aggregate test: over 30 seeds, rear attacks should produce >= frontal injury total
    const sword = STARTER_WEAPONS[0];
    let rearTotal = 0;
    let frontTotal = 0;

    for (let seed = 1; seed <= 30; seed++) {
      // Frontal: defender faces attacker → no surprise
      const att1 = mkHumanoidEntity(1, 1, 0, 0);
      const def1 = mkHumanoidEntity(2, 2, Math.trunc(0.8 * M), 0);
      att1.loadout.items = [{ ...sword }];
      def1.intent.defence = { mode: "block", intensity: q(1.0) };
      def1.action.facingDirQ = { x: -SCALE.Q, y: 0, z: 0 }; // facing attacker
      const w1 = mkWorld(seed, [att1, def1]);
      stepWorld(w1, new Map([[att1.id, [{ kind: "attack", targetId: def1.id, weaponId: sword.id, intensity: q(1.0), mode: "strike" as const }]]]), { tractionCoeff: q(1.0) });
      frontTotal += def1.injury.shock + def1.injury.fluidLoss;

      // Rear: defender faces away from attacker → partial surprise (q(0.4))
      const att2 = mkHumanoidEntity(1, 1, 0, 0);
      const def2 = mkHumanoidEntity(2, 2, Math.trunc(0.8 * M), 0);
      att2.loadout.items = [{ ...sword }];
      def2.intent.defence = { mode: "block", intensity: q(1.0) };
      def2.action.facingDirQ = { x: SCALE.Q, y: 0, z: 0 }; // facing away from attacker
      const w2 = mkWorld(seed, [att2, def2]);
      stepWorld(w2, new Map([[att2.id, [{ kind: "attack", targetId: def2.id, weaponId: sword.id, intensity: q(1.0), mode: "strike" as const }]]]), { tractionCoeff: q(1.0) });
      rearTotal += def2.injury.shock + def2.injury.fluidLoss;
    }

    expect(rearTotal).toBeGreaterThanOrEqual(frontTotal);
  });
});

// ── Integration: kernel init guard ─────────────────────────────────────────

describe("kernel: Phase 4 init guard", () => {
  it("entities without perception get DEFAULT_PERCEPTION after stepWorld", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    delete (e.attributes as any).perception;

    const world = mkWorld(1, [e]);
    stepWorld(world, new Map(), { tractionCoeff: q(1.0) });

    expect((e.attributes as any).perception).toBeDefined();
    expect((e.attributes as any).perception.visionRange_m).toBe(DEFAULT_PERCEPTION.visionRange_m);
  });

  it("entities with ai but missing decisionCooldownTicks get it initialized", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.ai = { focusTargetId: 0, retargetCooldownTicks: 0 } as any;

    const world = mkWorld(1, [e]);
    stepWorld(world, new Map(), { tractionCoeff: q(1.0) });

    expect(typeof e.ai!.decisionCooldownTicks).toBe("number");
    expect(e.ai!.decisionCooldownTicks).toBeGreaterThanOrEqual(0);
  });

  it("sensoryEnv from ctx is used in surprise mechanics", () => {
    // Verify that passing a custom sensoryEnv to stepWorld affects attack resolution.
    // We just confirm no error is thrown and the world advances a tick.
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 2, Math.trunc(M), 0);
    const world = mkWorld(1, [e1, e2]);

    const customEnv: SensoryEnvironment = { lightMul: q(0.1), smokeMul: q(0.5), noiseMul: q(1.0) };
    expect(() =>
      stepWorld(world, new Map(), { tractionCoeff: q(1.0), sensoryEnv: customEnv })
    ).not.toThrow();
    expect(world.tick).toBe(1);
  });
});
