// test/bodyplan.test.ts — Phase 8: Universal Body and Species System

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import { DamageChannel } from "../src/channels.js";
import {
  HUMANOID_PLAN,
  QUADRUPED_PLAN,
  THEROPOD_PLAN,
  SAUROPOD_PLAN,
  AVIAN_PLAN,
  VERMIFORM_PLAN,
  CENTAUR_PLAN,
  OCTOPOID_PLAN,
  getExposureWeight,
  resolveHitSegment,
  segmentIds,
  type BodyPlan,
} from "../src/sim/bodyplan.js";
import { defaultInjury } from "../src/sim/injury.js";
import { deriveFunctionalState } from "../src/sim/impairment.js";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing.js";
import { stepWorld } from "../src/sim/kernel.js";
import { TUNING } from "../src/sim/tuning.js";
import { defaultCondition } from "../src/sim/condition.js";
import { defaultAction } from "../src/sim/action.js";
import { defaultIntent } from "../src/sim/intent.js";
import { generateIndividual } from "../src/generate.js";
import { HUMAN_BASE } from "../src/archetypes.js";
import { v3 } from "../src/sim/vec3.js";
import { STARTER_WEAPONS } from "../src/equipment.js";

// ─── catalogue checks ─────────────────────────────────────────────────────────

const ALL_PLANS: BodyPlan[] = [
  HUMANOID_PLAN, QUADRUPED_PLAN, THEROPOD_PLAN, SAUROPOD_PLAN,
  AVIAN_PLAN, VERMIFORM_PLAN, CENTAUR_PLAN, OCTOPOID_PLAN,
];

describe("body plan catalogue", () => {
  it("all 8 plans have unique ids", () => {
    const ids = ALL_PLANS.map(p => p.id);
    expect(new Set(ids).size).toBe(8);
  });

  it("every plan has at least one segment", () => {
    for (const plan of ALL_PLANS) {
      expect(plan.segments.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("every segment id is unique within its plan", () => {
    for (const plan of ALL_PLANS) {
      const ids = plan.segments.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("kinetic exposure weights sum to exactly SCALE.Q per plan", () => {
    for (const plan of ALL_PLANS) {
      let sum = 0;
      for (const seg of plan.segments) {
        sum += seg.exposureWeight[DamageChannel.Kinetic] ?? 0;
      }
      expect(sum).toBe(SCALE.Q);
    }
  });

  it("every plan has exactly one CNS central segment", () => {
    for (const plan of ALL_PLANS) {
      const centralCount = plan.segments.filter(s => s.cnsRole === "central").length;
      expect(centralCount).toBe(1);
    }
  });

  it("humanoid plan has 6 segments matching existing BodyRegion names", () => {
    const ids = new Set(HUMANOID_PLAN.segments.map(s => s.id));
    expect(ids.has("head")).toBe(true);
    expect(ids.has("torso")).toBe(true);
    expect(ids.has("leftArm")).toBe(true);
    expect(ids.has("rightArm")).toBe(true);
    expect(ids.has("leftLeg")).toBe(true);
    expect(ids.has("rightLeg")).toBe(true);
  });
});

// ─── getExposureWeight ────────────────────────────────────────────────────────

describe("getExposureWeight", () => {
  const torsoSeg = HUMANOID_PLAN.segments.find(s => s.id === "torso")!;

  it("returns the explicitly specified channel weight", () => {
    const w = getExposureWeight(torsoSeg, DamageChannel.Kinetic);
    expect(w).toBe(q(0.50));
  });

  it("falls back to kinetic weight for unspecified channels", () => {
    // QUADRUPED_PLAN torso only specifies Kinetic
    const seg = QUADRUPED_PLAN.segments.find(s => s.id === "torso")!;
    const kinetic = getExposureWeight(seg, DamageChannel.Kinetic);
    const thermal  = getExposureWeight(seg, DamageChannel.Thermal);
    expect(kinetic).toBe(q(0.43));
    expect(thermal).toBe(q(0.43)); // fallback to kinetic
  });

  it("returns q(0) for segment with no exposureWeight at all", () => {
    const seg = { id: "test", parent: null, mass_kg: 1000, exposureWeight: {} };
    expect(getExposureWeight(seg as any, DamageChannel.Kinetic)).toBe(q(0));
  });
});

// ─── resolveHitSegment ────────────────────────────────────────────────────────

describe("resolveHitSegment", () => {
  it("returns a valid segment id from the plan", () => {
    const id = resolveHitSegment(HUMANOID_PLAN, q(0.5) as any);
    expect(HUMANOID_PLAN.segments.map(s => s.id)).toContain(id);
  });

  it("hits torso most often for humanoid plan (q(0.12)..q(0.62))", () => {
    // torso covers r01 in [1200, 6200) out of 10000
    let torsoCount = 0;
    const N = 100;
    for (let i = 0; i < N; i++) {
      // spread r01 over 0..9999
      const r01 = Math.trunc(i * SCALE.Q / N) as any;
      if (resolveHitSegment(HUMANOID_PLAN, r01) === "torso") torsoCount++;
    }
    // ~50 out of 100 should be torso (between 40 and 60 with uniform sampling)
    expect(torsoCount).toBeGreaterThanOrEqual(38);
    expect(torsoCount).toBeLessThanOrEqual(62);
  });

  it("r01=0 hits the first segment", () => {
    expect(resolveHitSegment(HUMANOID_PLAN, q(0) as any)).toBe("head");
  });

  it("r01=SCALE.Q-1 hits the last segment", () => {
    const last = HUMANOID_PLAN.segments[HUMANOID_PLAN.segments.length - 1]!.id;
    expect(resolveHitSegment(HUMANOID_PLAN, (SCALE.Q - 1) as any)).toBe(last);
  });

  it("octopoid arms are hit proportionally (8 arms = 72% of hits)", () => {
    let armCount = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const r01 = Math.trunc(i * SCALE.Q / N) as any;
      const id = resolveHitSegment(OCTOPOID_PLAN, r01);
      if (id.startsWith("arm")) armCount++;
    }
    // 72% arms, so 720±40 expected
    expect(armCount).toBeGreaterThanOrEqual(680);
    expect(armCount).toBeLessThanOrEqual(760);
  });
});

// ─── segmentIds ───────────────────────────────────────────────────────────────

describe("segmentIds", () => {
  it("returns all segment ids", () => {
    const ids = segmentIds(HUMANOID_PLAN);
    expect(ids).toHaveLength(6);
    expect(ids).toContain("head");
    expect(ids).toContain("torso");
  });
});

// ─── defaultInjury with body plan ─────────────────────────────────────────────

describe("defaultInjury", () => {
  it("without args: creates humanoid 6-region injury", () => {
    const inj = defaultInjury();
    expect(Object.keys(inj.byRegion)).toHaveLength(6);
    expect(inj.byRegion["head"]).toBeDefined();
    expect(inj.byRegion["torso"]).toBeDefined();
  });

  it("with segment ids: creates correct region set", () => {
    const ids = segmentIds(QUADRUPED_PLAN);
    const inj = defaultInjury(ids);
    expect(Object.keys(inj.byRegion)).toHaveLength(QUADRUPED_PLAN.segments.length);
    expect(inj.byRegion["torso"]).toBeDefined();
    expect(inj.byRegion["frontLeftLeg"]).toBeDefined();
    expect(inj.byRegion["leftArm"]).toBeUndefined(); // not in quadruped
  });

  it("all regions start at zero damage", () => {
    const inj = defaultInjury(segmentIds(OCTOPOID_PLAN));
    for (const seg of Object.values(inj.byRegion)) {
      expect(seg.surfaceDamage).toBe(q(0));
      expect(seg.internalDamage).toBe(q(0));
      expect(seg.structuralDamage).toBe(q(0));
    }
  });
});

// ─── deriveFunctionalState with body plan ─────────────────────────────────────

describe("deriveFunctionalState (data-driven)", () => {
  function makeEntityWithPlan(plan: BodyPlan) {
    const attrs = generateIndividual(1, HUMAN_BASE);
    return {
      id: 1, teamId: 1,
      attributes: attrs,
      energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
      loadout: { items: [] },
      traits: [],
      position_m: v3(0, 0, 0),
      velocity_mps: v3(0, 0, 0),
      intent: defaultIntent(),
      action: defaultAction(),
      condition: defaultCondition(),
      injury: defaultInjury(segmentIds(plan)),
      grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
      bodyPlan: plan,
    };
  }

  it("undamaged entity: full functional state", () => {
    const e = makeEntityWithPlan(HUMANOID_PLAN);
    const fs = deriveFunctionalState(e as any, TUNING.tactical);
    expect(fs.mobilityMul).toBe(q(1.0));
    expect(fs.manipulationMul).toBe(q(1.0));
    expect(fs.canAct).toBe(true);
    expect(fs.canStand).toBe(true);
  });

  it("quadruped: locomotion impairment from frontLeftLeg damage", () => {
    const e = makeEntityWithPlan(QUADRUPED_PLAN);
    e.injury.byRegion["frontLeftLeg"]!.structuralDamage = q(0.80);
    const fs = deriveFunctionalState(e as any, TUNING.tactical);
    // frontLeftLeg is primary loco → legStr > 0 → mobilityMul < 1.0
    expect(fs.mobilityMul).toBeLessThan(q(1.0));
  });

  it("octopoid: manipulation impairment from arm1 damage", () => {
    const e = makeEntityWithPlan(OCTOPOID_PLAN);
    e.injury.byRegion["arm1"]!.structuralDamage = q(1.0);
    const fs = deriveFunctionalState(e as any, TUNING.tactical);
    // arm1 is primary manipulation → armStr > 0 → manipulationMul < 1.0
    expect(fs.manipulationMul).toBeLessThan(q(1.0));
  });

  it("vermiform: no manipulation segments → manipulationMul unaffected by midBody damage", () => {
    const e = makeEntityWithPlan(VERMIFORM_PLAN);
    e.injury.byRegion["midBody"]!.structuralDamage = q(0.80);
    // midBody is primary loco → mobility impaired; no manipulation segs
    const fsVerm = deriveFunctionalState(e as any, TUNING.tactical);
    const eClean = makeEntityWithPlan(VERMIFORM_PLAN);
    const fsClean = deriveFunctionalState(eClean as any, TUNING.tactical);
    expect(fsVerm.mobilityMul).toBeLessThan(fsClean.mobilityMul);
    expect(fsVerm.manipulationMul).toBe(fsClean.manipulationMul); // unchanged
  });

  it("centaur: leftArm (first primary manip) disable maps to leftArmDisabled", () => {
    const e = makeEntityWithPlan(CENTAUR_PLAN);
    // Set leftArm structural damage above arm disable threshold
    e.injury.byRegion["leftArm"]!.structuralDamage = q(0.85);
    const fs = deriveFunctionalState(e as any, TUNING.tactical);
    expect(fs.leftArmDisabled).toBe(true);
    expect(fs.rightArmDisabled).toBe(false);
  });

  it("humanoid plan matches backward compat path (no bodyPlan)", () => {
    const withPlan = makeEntityWithPlan(HUMANOID_PLAN);
    withPlan.injury.byRegion["rightLeg"]!.structuralDamage = q(0.50);

    const withoutPlan = makeEntityWithPlan(HUMANOID_PLAN);
    delete (withoutPlan as any).bodyPlan;
    withoutPlan.injury.byRegion["rightLeg"]!.structuralDamage = q(0.50);

    const fsWithPlan    = deriveFunctionalState(withPlan as any, TUNING.tactical);
    const fsWithoutPlan = deriveFunctionalState(withoutPlan as any, TUNING.tactical);

    // Both paths should produce the same mobilityMul for humanoid
    expect(fsWithPlan.mobilityMul).toBe(fsWithoutPlan.mobilityMul);
  });
});

// ─── kernel integration: non-humanoid entity survives a tick ─────────────────

describe("kernel integration — non-humanoid body plan", () => {
  it("quadruped entity completes 20 ticks without crash", () => {
    const attrs = generateIndividual(1, HUMAN_BASE);
    const quadruped: any = {
      id: 1, teamId: 1,
      attributes: attrs,
      energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
      loadout: { items: [] },
      traits: [],
      position_m: v3(0, 0, 0),
      velocity_mps: v3(0, 0, 0),
      intent: defaultIntent(),
      action: defaultAction(),
      condition: defaultCondition(),
      injury: defaultInjury(segmentIds(QUADRUPED_PLAN)),
      grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
      bodyPlan: QUADRUPED_PLAN,
    };
    // Humanoid opponent without body plan (backward compat)
    const human = mkHumanoidEntity(2, 2, Math.trunc(20 * SCALE.m), 0);

    const world = mkWorld(42, [quadruped, human]);

    for (let tick = 0; tick < 20; tick++) {
      expect(() => {
        stepWorld(world, new Map(), {
          tractionCoeff: q(0.80),
          tuning: TUNING.tactical,
        });
      }).not.toThrow();
    }
  });

  it("quadruped accumulates damage in body plan segments when attacked", () => {
    const CLOSE = Math.trunc(0.5 * SCALE.m);
    const attrs = generateIndividual(1, HUMAN_BASE);
    const quadruped: any = {
      id: 1, teamId: 1,
      attributes: attrs,
      energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
      loadout: { items: [] },
      traits: [],
      position_m: v3(0, 0, 0),
      velocity_mps: v3(0, 0, 0),
      intent: defaultIntent(),
      action: defaultAction(),
      condition: defaultCondition(),
      injury: defaultInjury(segmentIds(QUADRUPED_PLAN)),
      grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
      bodyPlan: QUADRUPED_PLAN,
    };
    const sword = STARTER_WEAPONS[0]!;
    const human = mkHumanoidEntity(2, 2, CLOSE, 0);
    human.loadout = { items: [sword] };

    const world = mkWorld(99, [quadruped, human]);

    // Issue explicit attack commands from human toward quadruped each tick
    for (let tick = 0; tick < 100; tick++) {
      const cmds: Map<number, any[]> = new Map();
      if (!quadruped.injury.dead && !human.injury.dead) {
        cmds.set(human.id, [{ kind: "attack", targetId: quadruped.id, weaponId: sword.id, intensity: q(1.0) }]);
      }
      stepWorld(world, cmds, {
        tractionCoeff: q(0.80),
        tuning: TUNING.tactical,
      });
      if (quadruped.injury.dead) break;
    }

    // Quadruped should have accumulated some injury (hits spread over body plan segments)
    const totalDamage = Object.values(quadruped.injury.byRegion)
      .reduce((s: number, r: any) => s + r.surfaceDamage + r.internalDamage + r.structuralDamage, 0);
    expect(totalDamage).toBeGreaterThan(0);

    // Verify only body plan segment keys exist (no humanoid-specific keys like leftArm/rightArm)
    expect(quadruped.injury.byRegion["leftArm"]).toBeUndefined();
    expect(quadruped.injury.byRegion["rightArm"]).toBeUndefined();
    expect(quadruped.injury.byRegion["frontLeftLeg"]).toBeDefined();
    expect(quadruped.injury.byRegion["torso"]).toBeDefined();
  });
});
