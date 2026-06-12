// test/model3d.test.ts — Phase 14: 3D Model Integration

import { describe, it, expect } from "vitest";
import { q, to, SCALE } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { HUMANOID_PLAN } from "../src/sim/bodyplan";
import { DefenceModes, MoveModes } from "../src/sim/kinds";
import {
  deriveMassDistribution,
  deriveInertiaTensor,
  deriveAnimationHints,
  derivePoseModifiers,
  deriveGrappleConstraint,
  extractRigSnapshots,
} from "../src/model3d";

// ── deriveMassDistribution ────────────────────────────────────────────────────

describe("deriveMassDistribution", () => {
  it("no bodyPlan: single 'body' segment with full mass", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const dist = deriveMassDistribution(e);
    expect(dist.segments).toHaveLength(1);
    expect(dist.segments[0]!.segmentId).toBe("body");
    expect(dist.segments[0]!.fractionQ).toBe(SCALE.Q);
    expect(dist.totalMass_kg).toBe(e.attributes.morphology.mass_kg);
  });

  it("no bodyPlan: CoG at geometric midpoint (stature/2)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const stature_m = e.attributes.morphology.stature_m / SCALE.m;
    const dist = deriveMassDistribution(e);
    expect(dist.cogOffset_m.x).toBeCloseTo(0, 5);
    expect(dist.cogOffset_m.y).toBeCloseTo(stature_m / 2, 3);
  });

  it("with bodyPlan: one segment entry per body plan segment", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.bodyPlan = HUMANOID_PLAN;
    const dist = deriveMassDistribution(e);
    expect(dist.segments).toHaveLength(HUMANOID_PLAN.segments.length);
  });

  it("with bodyPlan: totalMass_kg sums all segment masses", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.bodyPlan = HUMANOID_PLAN;
    const expected = HUMANOID_PLAN.segments.reduce((s, seg) => s + seg.mass_kg, 0);
    expect(deriveMassDistribution(e).totalMass_kg).toBe(expected);
  });

  it("with bodyPlan: fraction of each segment sums to approx SCALE.Q", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.bodyPlan = HUMANOID_PLAN;
    const total = deriveMassDistribution(e).segments.reduce((s, seg) => s + seg.fractionQ, 0);
    // Rounding may cause off-by-one; allow ±1 per segment
    expect(total).toBeGreaterThanOrEqual(SCALE.Q - HUMANOID_PLAN.segments.length);
    expect(total).toBeLessThanOrEqual(SCALE.Q + HUMANOID_PLAN.segments.length);
  });

  it("with bodyPlan: head segment yields higher CoG than legs-only", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    // Plan with only a head segment
    e.bodyPlan = {
      id: "test_head",
      segments: [{ id: "head", parent: null, mass_kg: 5000, exposureWeight: {} }],
      locomotion: { type: "biped" },
      cnsLayout: { type: "centralized" },
    };
    const headDist = deriveMassDistribution(e);

    // Plan with only a foot segment
    e.bodyPlan = {
      id: "test_foot",
      segments: [{ id: "leftFoot", parent: null, mass_kg: 5000, exposureWeight: {} }],
      locomotion: { type: "biped" },
      cnsLayout: { type: "centralized" },
    };
    const footDist = deriveMassDistribution(e);

    expect(headDist.cogOffset_m.y).toBeGreaterThan(footDist.cogOffset_m.y);
  });

  it("explicit metadata overrides naming heuristics", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.bodyPlan = {
      id: "override_heuristics",
      segments: [{
        id: "leftFoot",
        parent: null,
        mass_kg: 5000,
        exposureWeight: {},
        renderSpatial: {
          canonicalAnchor: "head",
          lateralSide: "center",
          verticalPosition: "crown",
          rigRole: "head",
          centerOfMassHint: { yFrac: 0.92 },
        },
      }],
      locomotion: { type: "biped" },
      cnsLayout: { type: "centralized" },
    };
    const stature_m = e.attributes.morphology.stature_m / SCALE.m;
    expect(deriveMassDistribution(e).cogOffset_m.y).toBeCloseTo(stature_m * 0.92, 3);
  });

  it("unusual body plans stay stable via explicit metadata", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.bodyPlan = {
      id: "floating_ring",
      segments: [
        {
          id: "orbitA",
          parent: null,
          mass_kg: 2000,
          exposureWeight: {},
          renderSpatial: {
            canonicalAnchor: "custom",
            lateralSide: "left",
            verticalPosition: "upper",
            rigRole: "appendage",
            centerOfMassHint: { xFrac: -0.45, yFrac: 0.66 },
          },
        },
        {
          id: "orbitB",
          parent: null,
          mass_kg: 2000,
          exposureWeight: {},
          renderSpatial: {
            canonicalAnchor: "custom",
            lateralSide: "right",
            verticalPosition: "upper",
            rigRole: "appendage",
            centerOfMassHint: { xFrac: 0.45, yFrac: 0.66 },
          },
        },
      ],
      locomotion: { type: "distributed" },
      cnsLayout: { type: "distributed" },
    };
    const dist = deriveMassDistribution(e);
    expect(dist.cogOffset_m.x).toBeCloseTo(0, 5);
    expect(dist.cogOffset_m.y).toBeGreaterThan(0);
  });
});

// ── deriveInertiaTensor ───────────────────────────────────────────────────────

describe("deriveInertiaTensor", () => {
  it("no bodyPlan: returns positive sphere approximation", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const I = deriveInertiaTensor(e);
    expect(I.yaw_kgm2).toBeGreaterThan(0);
    expect(I.pitch_kgm2).toBeGreaterThan(0);
    expect(I.roll_kgm2).toBeGreaterThan(0);
    // Sphere: all axes equal
    expect(I.yaw_kgm2).toBeCloseTo(I.pitch_kgm2, 10);
  });

  it("with bodyPlan: lateral mass increases yaw inertia", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    // Arms spread laterally — high yaw inertia; arms removed — lower yaw
    e.bodyPlan = {
      id: "arms_only",
      segments: [
        { id: "leftArm",  parent: null, mass_kg: 5000, exposureWeight: {} },
        { id: "rightArm", parent: null, mass_kg: 5000, exposureWeight: {} },
      ],
      locomotion: { type: "biped" },
      cnsLayout:  { type: "centralized" },
    };
    const armsI = deriveInertiaTensor(e);

    e.bodyPlan = {
      id: "torso_only",
      segments: [
        { id: "torso", parent: null, mass_kg: 10000, exposureWeight: {} },
      ],
      locomotion: { type: "biped" },
      cnsLayout:  { type: "centralized" },
    };
    const torsoI = deriveInertiaTensor(e);

    // Arms (laterally offset) should have higher yaw inertia than same mass in torso (midline)
    expect(armsI.yaw_kgm2).toBeGreaterThan(torsoI.yaw_kgm2);
  });

  it("with bodyPlan: stacked vertical mass increases pitch inertia", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.bodyPlan = {
      id: "head_foot",
      segments: [
        { id: "head",     parent: null, mass_kg: 5000, exposureWeight: {} },
        { id: "leftFoot", parent: null, mass_kg: 5000, exposureWeight: {} },
      ],
      locomotion: { type: "biped" },
      cnsLayout:  { type: "centralized" },
    };
    const I = deriveInertiaTensor(e);
    // Head is high (y≈0.94), foot is low (y≈0.03) — significant pitch inertia
    expect(I.pitch_kgm2).toBeGreaterThan(0);
  });

  it("with bodyPlan: roll = yaw + pitch (I_z = I_x + I_y for planar mass)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.bodyPlan = HUMANOID_PLAN;
    const I = deriveInertiaTensor(e);
    // For planar case (z=0): I_roll = Σm(x²+y²) = I_yaw + I_pitch
    expect(I.roll_kgm2).toBeCloseTo(I.yaw_kgm2 + I.pitch_kgm2, 5);
  });

  it("legacy plan naming heuristics remain backward compatible", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.bodyPlan = {
      id: "legacy_wings",
      segments: [
        { id: "leftWing", parent: null, mass_kg: 2000, exposureWeight: {} },
        { id: "rightWing", parent: null, mass_kg: 2000, exposureWeight: {} },
      ],
      locomotion: { type: "flight" },
      cnsLayout: { type: "centralized" },
    };
    expect(deriveInertiaTensor(e).yaw_kgm2).toBeGreaterThan(0);
  });
});

// ── deriveAnimationHints ──────────────────────────────────────────────────────

describe("deriveAnimationHints", () => {
  it("idle entity: idle=SCALE.Q, all other locomotion zero", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    // defaultIntent: intensity=0
    const h = deriveAnimationHints(e);
    expect(h.idle).toBe(SCALE.Q);
    expect(h.walk).toBe(0);
    expect(h.run).toBe(0);
    expect(h.sprint).toBe(0);
    expect(h.crawl).toBe(0);
    expect(h.dead).toBe(false);
    expect(h.unconscious).toBe(false);
  });

  it("walking entity: walk=SCALE.Q", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.intent.move = { dir: { x: 1, y: 0, z: 0 }, intensity: q(0.5), mode: MoveModes.Walk };
    const h = deriveAnimationHints(e);
    expect(h.walk).toBe(SCALE.Q);
    expect(h.idle).toBe(0);
  });

  it("running entity: run=SCALE.Q", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.intent.move = { dir: { x: 1, y: 0, z: 0 }, intensity: q(1.0), mode: MoveModes.Run };
    const h = deriveAnimationHints(e);
    expect(h.run).toBe(SCALE.Q);
    expect(h.idle).toBe(0);
  });

  it("sprinting entity: sprint=SCALE.Q", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.intent.move = { dir: { x: 1, y: 0, z: 0 }, intensity: q(1.0), mode: MoveModes.Sprint };
    expect(deriveAnimationHints(e).sprint).toBe(SCALE.Q);
  });

  it("crawling entity: crawl=SCALE.Q", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.intent.move = { dir: { x: 1, y: 0, z: 0 }, intensity: q(1.0), mode: MoveModes.Crawl };
    expect(deriveAnimationHints(e).crawl).toBe(SCALE.Q);
  });

  it("dead entity: all locomotion zero, dead=true", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.dead = true;
    e.intent.move = { dir: { x: 1, y: 0, z: 0 }, intensity: q(1.0), mode: MoveModes.Run };
    const h = deriveAnimationHints(e);
    expect(h.dead).toBe(true);
    expect(h.idle + h.walk + h.run + h.sprint + h.crawl).toBe(0);
    expect(h.attackingQ).toBe(0);
    expect(h.guardingQ).toBe(0);
  });

  it("unconscious entity: locomotion zero, unconscious=true, dead=false", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.consciousness = q(0.05); // below ANIM_UNCONSCIOUS_THRESHOLD
    const h = deriveAnimationHints(e);
    expect(h.unconscious).toBe(true);
    expect(h.dead).toBe(false);
    expect(h.idle + h.walk + h.run + h.sprint + h.crawl).toBe(0);
  });

  it("guarding entity: guardingQ matches defence intensity", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.intent.defence = { mode: DefenceModes.Block, intensity: q(0.7) };
    const h = deriveAnimationHints(e);
    expect(h.guardingQ).toBe(q(0.7));
  });

  it("no defence (mode=none): guardingQ=0", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.intent.defence = { mode: DefenceModes.None, intensity: q(1.0) };
    expect(deriveAnimationHints(e).guardingQ).toBe(0);
  });

  it("active attack cooldown: attackingQ=SCALE.Q", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.action.attackCooldownTicks = 5;
    expect(deriveAnimationHints(e).attackingQ).toBe(SCALE.Q);
  });

  it("no attack cooldown: attackingQ=0", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.action.attackCooldownTicks = 0;
    expect(deriveAnimationHints(e).attackingQ).toBe(0);
  });

  it("shock and fear passed through directly", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.shock      = q(0.35);
    e.condition.fearQ   = q(0.60);
    const h = deriveAnimationHints(e);
    expect(h.shockQ).toBe(q(0.35));
    expect(h.fearQ).toBe(q(0.60));
  });

  it("prone from intent.prone", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.intent.prone = true;
    expect(deriveAnimationHints(e).prone).toBe(true);
  });

  it("prone from grapple position pinned", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.grapple.position = "pinned";
    expect(deriveAnimationHints(e).prone).toBe(true);
  });
});

// ── derivePoseModifiers ───────────────────────────────────────────────────────

describe("derivePoseModifiers", () => {
  it("returns one entry per injury region", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const mods = derivePoseModifiers(e);
    const regions = Object.keys(e.injury.byRegion);
    expect(mods).toHaveLength(regions.length);
    expect(mods.map(m => m.segmentId).sort()).toEqual(regions.sort());
  });

  it("undamaged entity: all modifiers zero", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const mods = derivePoseModifiers(e);
    for (const m of mods) {
      expect(m.structuralQ).toBe(0);
      expect(m.surfaceQ).toBe(0);
      expect(m.impairmentQ).toBe(0);
    }
  });

  it("structural damage reflected in structuralQ and impairmentQ", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.byRegion["torso"]!.structuralDamage = q(0.40);
    const torsoMod = derivePoseModifiers(e).find(m => m.segmentId === "torso")!;
    expect(torsoMod.structuralQ).toBe(q(0.40));
    expect(torsoMod.impairmentQ).toBe(q(0.40));
  });

  it("surface damage reflected in surfaceQ; impairmentQ = max(structural, surface)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.byRegion["torso"]!.surfaceDamage    = q(0.60);
    e.injury.byRegion["torso"]!.structuralDamage = q(0.30);
    const torsoMod = derivePoseModifiers(e).find(m => m.segmentId === "torso")!;
    expect(torsoMod.surfaceQ).toBe(q(0.60));
    expect(torsoMod.impairmentQ).toBe(q(0.60));
  });
});

// ── deriveGrappleConstraint ───────────────────────────────────────────────────

describe("deriveGrappleConstraint", () => {
  it("not grappling: isHolder=false, isHeld=false, position=standing", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const g = deriveGrappleConstraint(e);
    expect(g.isHolder).toBe(false);
    expect(g.isHeld).toBe(false);
    expect(g.holdingEntityId).toBeUndefined();
    expect(g.heldByIds).toHaveLength(0);
    expect(g.position).toBe("standing");
  });

  it("holding a target: isHolder=true, holdingEntityId set", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.grapple.holdingTargetId = 7;
    const g = deriveGrappleConstraint(e);
    expect(g.isHolder).toBe(true);
    expect(g.holdingEntityId).toBe(7);
  });

  it("held by others: isHeld=true, heldByIds populated", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.grapple.heldByIds = [3, 5];
    const g = deriveGrappleConstraint(e);
    expect(g.isHeld).toBe(true);
    expect(g.heldByIds).toEqual([3, 5]);
  });

  it("gripQ and position are passed through", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.grapple.gripQ    = q(0.75);
    e.grapple.position = "prone";
    const g = deriveGrappleConstraint(e);
    expect(g.gripQ).toBe(q(0.75));
    expect(g.position).toBe("prone");
  });

  it("heldByIds is a copy, not a reference", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.grapple.heldByIds = [2];
    const g = deriveGrappleConstraint(e);
    g.heldByIds.push(99);
    expect(e.grapple.heldByIds).toHaveLength(1); // original unaffected
  });
});

// ── extractRigSnapshots ───────────────────────────────────────────────────────

describe("extractRigSnapshots", () => {
  it("returns one snapshot per entity", () => {
    const world = mkWorld(1, [
      mkHumanoidEntity(1, 1, 0, 0),
      mkHumanoidEntity(2, 2, to.m(3), 0),
    ]);
    expect(extractRigSnapshots(world)).toHaveLength(2);
  });

  it("empty world returns empty array", () => {
    expect(extractRigSnapshots(mkWorld(1, []))).toHaveLength(0);
  });

  it("entityId and teamId are correct", () => {
    const world = mkWorld(1, [mkHumanoidEntity(5, 3, 0, 0)]);
    const [snap] = extractRigSnapshots(world);
    expect(snap!.entityId).toBe(5);
    expect(snap!.teamId).toBe(3);
  });

  it("tick matches world.tick", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    stepWorld(world, new Map(), { tractionCoeff: q(0.80) });
    const [snap] = extractRigSnapshots(world);
    expect(snap!.tick).toBe(world.tick);
  });

  it("snapshot contains all required sub-structures", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const [snap] = extractRigSnapshots(world);
    expect(snap).toHaveProperty("mass");
    expect(snap).toHaveProperty("inertia");
    expect(snap).toHaveProperty("animation");
    expect(snap).toHaveProperty("pose");
    expect(snap).toHaveProperty("grapple");
  });
});

// ── Additional coverage ───────────────────────────────────────────────────────

describe("getCanonicalOffset coverage", () => {
  it("tail segment: CoG placed below midpoint", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.bodyPlan = {
      id: "tailed",
      segments: [{ id: "tail", parent: null, mass_kg: 3000, exposureWeight: {} }],
      locomotion: { type: "undulation" },
      cnsLayout:  { type: "distributed" },
    };
    const stature_m = e.attributes.morphology.stature_m / SCALE.m;
    expect(deriveMassDistribution(e).cogOffset_m.y).toBeLessThan(stature_m / 2);
  });

  it("wing segment: lateral offset gives nonzero yaw inertia", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.bodyPlan = {
      id: "winged",
      segments: [
        { id: "leftWing",  parent: null, mass_kg: 2000, exposureWeight: {} },
        { id: "rightWing", parent: null, mass_kg: 2000, exposureWeight: {} },
      ],
      locomotion: { type: "flight" },
      cnsLayout:  { type: "centralized" },
    };
    expect(deriveInertiaTensor(e).yaw_kgm2).toBeGreaterThan(0);
  });

  it("unknown segment ID: CoG falls back to midpoint (yFrac=0.50)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.bodyPlan = {
      id: "unknown_seg",
      segments: [{ id: "xyzorgan", parent: null, mass_kg: 5000, exposureWeight: {} }],
      locomotion: { type: "biped" },
      cnsLayout:  { type: "centralized" },
    };
    const stature_m = e.attributes.morphology.stature_m / SCALE.m;
    expect(deriveMassDistribution(e).cogOffset_m.y).toBeCloseTo(stature_m * 0.50, 3);
  });

  it("unrecognised move mode with nonzero intensity: falls back to idle", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    (e.intent.move).mode      = "hover";
    (e.intent.move).intensity = q(1.0);
    const h = deriveAnimationHints(e);
    expect(h.idle).toBe(SCALE.Q);
  });
});
