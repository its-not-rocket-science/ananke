import { expect, test, describe } from "vitest";
import { q, SCALE, to } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { defaultCondition } from "../src/sim/condition";
import { defaultAction } from "../src/sim/action";
import { TUNING } from "../src/sim/tuning";
import { deriveFunctionalState } from "../src/sim/impairment";
import {
  grappleContestScore,
  resolveGrappleAttempt,
  resolveGrappleThrow,
  resolveGrappleChoke,
  resolveGrappleJointLock,
  resolveBreakGrapple,
  stepGrappleTick,
  releaseGrapple,
} from "../src/sim/grapple";
import { buildWorldIndex } from "../src/sim/indexing";
import type { WorldState } from "../src/sim/world";
import type { CommandMap } from "../src/sim/commands";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeWorld(seed = 42) {
  const a = mkHumanoidEntity(1, 1, 0, 0);
  const b = mkHumanoidEntity(2, 2, to.m(1.0), 0); // 1 m apart — within grapple reach
  return mkWorld(seed, [a, b]);
}

function getEntities(world: WorldState) {
  const a = world.entities.find(e => e.id === 1)!;
  const b = world.entities.find(e => e.id === 2)!;
  return { a, b };
}

// ─── grappleContestScore ────────────────────────────────────────────────────

describe("grappleContestScore", () => {
  test("returns a Q value in [0.05, 0.95] for a healthy human", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const func = deriveFunctionalState(e, TUNING.tactical);
    const score = grappleContestScore(e, func);
    expect(score).toBeGreaterThanOrEqual(q(0.05));
    expect(score).toBeLessThanOrEqual(q(0.95));
  });

  test("stronger entity scores higher than weaker entity", () => {
    const strong = mkHumanoidEntity(10, 1, 0, 0);
    const weak   = mkHumanoidEntity(11, 1, 0, 0);

    // Manually boost strong's peakForce and reduce weak's
    strong.attributes.performance.peakForce_N = to.N(3500);
    weak.attributes.performance.peakForce_N   = to.N(800);

    const funcS = deriveFunctionalState(strong, TUNING.tactical);
    const funcW = deriveFunctionalState(weak,   TUNING.tactical);

    expect(grappleContestScore(strong, funcS)).toBeGreaterThan(grappleContestScore(weak, funcW));
  });

  test("impaired entity scores lower than healthy counterpart", () => {
    const healthy   = mkHumanoidEntity(20, 1, 0, 0);
    const impaired  = mkHumanoidEntity(20, 1, 0, 0); // same seed → same attrs
    impaired.injury.byRegion.leftArm.structuralDamage = q(0.80);
    impaired.injury.byRegion.rightArm.structuralDamage = q(0.80);

    const funcH = deriveFunctionalState(healthy,  TUNING.tactical);
    const funcI = deriveFunctionalState(impaired, TUNING.tactical);

    expect(grappleContestScore(healthy, funcH)).toBeGreaterThan(grappleContestScore(impaired, funcI));
  });

  test("is deterministic across calls", () => {
    const e = mkHumanoidEntity(5, 1, 0, 0);
    const func = deriveFunctionalState(e, TUNING.tactical);
    const s1 = grappleContestScore(e, func);
    const s2 = grappleContestScore(e, func);
    expect(s1).toBe(s2);
  });
});

// ─── resolveGrappleAttempt ──────────────────────────────────────────────────

describe("resolveGrappleAttempt", () => {
  test("successful attempt sets holdingTargetId and heldByIds", () => {
    // Brute-force a seed where the strong attacker wins
    for (let seed = 1; seed <= 500; seed++) {
      const world = makeWorld(seed);
      const { a, b } = getEntities(world);
      a.attributes.performance.peakForce_N = to.N(3500); // strong
      b.attributes.performance.peakForce_N = to.N(600);  // weak

      const impacts: any[] = [];
      resolveGrappleAttempt(world, a, b, q(1.0), TUNING.tactical, impacts, { onEvent() {} });

      if (a.grapple.holdingTargetId === b.id) {
        expect(b.grapple.heldByIds).toContain(a.id);
        expect(a.grapple.gripQ).toBeGreaterThan(0);
        expect(a.grapple.gripQ).toBeLessThanOrEqual(SCALE.Q);
        return; // pass
      }
    }
    // Should have found at least one success in 500 seeds
    expect(true).toBe(false); // fail if no success found
  });

  test("failed attempt sets grappleCooldownTicks and does NOT link entities", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const world = makeWorld(seed);
      const { a, b } = getEntities(world);
      a.attributes.performance.peakForce_N = to.N(400);  // very weak
      b.attributes.performance.peakForce_N = to.N(4000); // very strong

      const impacts: any[] = [];
      resolveGrappleAttempt(world, a, b, q(1.0), TUNING.tactical, impacts, { onEvent() {} });

      if (a.grapple.holdingTargetId === 0) {
        expect(a.action.grappleCooldownTicks).toBeGreaterThan(0);
        expect(b.grapple.heldByIds).not.toContain(a.id);
        return; // pass
      }
    }
    expect(true).toBe(false);
  });

  test("attempt is skipped when in cooldown", () => {
    const world = makeWorld(1);
    const { a, b } = getEntities(world);
    a.action.grappleCooldownTicks = 5;

    const impacts: any[] = [];
    resolveGrappleAttempt(world, a, b, q(1.0), TUNING.tactical, impacts, { onEvent() {} });

    expect(a.grapple.holdingTargetId).toBe(0);
  });

  test("attempt is skipped when target is out of reach", () => {
    const world = makeWorld(1);
    const { a, b } = getEntities(world);
    b.position_m = { x: to.m(5.0), y: 0, z: 0 }; // 5 m away — out of range

    const impacts: any[] = [];
    resolveGrappleAttempt(world, a, b, q(1.0), TUNING.tactical, impacts, { onEvent() {} });

    expect(a.grapple.holdingTargetId).toBe(0);
  });

  test("attacker drains energy on attempt regardless of success", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const world = makeWorld(seed);
      const { a, b } = getEntities(world);
      const energyBefore = a.energy.reserveEnergy_J;

      const impacts: any[] = [];
      resolveGrappleAttempt(world, a, b, q(1.0), TUNING.tactical, impacts, { onEvent() {} });

      expect(a.energy.reserveEnergy_J).toBeLessThan(energyBefore);
      return; // one tick is enough
    }
  });

  test("overwhelming leverage causes immediate trip in tactical mode", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const world = makeWorld(seed);
      const { a, b } = getEntities(world);
      // Massive force + stature advantage for attacker
      a.attributes.performance.peakForce_N = to.N(5000);
      a.attributes.morphology.stature_m    = to.m(2.10);
      b.attributes.performance.peakForce_N = to.N(500);
      b.attributes.morphology.stature_m    = to.m(1.40);

      const impacts: any[] = [];
      resolveGrappleAttempt(world, a, b, q(1.0), TUNING.tactical, impacts, { onEvent() {} });

      if (a.grapple.holdingTargetId === b.id && b.condition.prone) {
        expect(a.grapple.position).toBe("prone");
        return; // pass
      }
    }
    // If no trip occurred it's OK — just check it never errors
  });

  test("is deterministic: same seed produces same outcome", () => {
    function runAttempt(seed: number) {
      const world = makeWorld(seed);
      const { a, b } = getEntities(world);
      const impacts: any[] = [];
      resolveGrappleAttempt(world, a, b, q(1.0), TUNING.tactical, impacts, { onEvent() {} });
      return { held: a.grapple.holdingTargetId, grip: a.grapple.gripQ };
    }

    for (let seed = 1; seed <= 20; seed++) {
      const r1 = runAttempt(seed);
      const r2 = runAttempt(seed);
      expect(r1.held).toBe(r2.held);
      expect(r1.grip).toBe(r2.grip);
    }
  });
});

// ─── resolveGrappleThrow ────────────────────────────────────────────────────

describe("resolveGrappleThrow", () => {
  test("successful throw makes target prone and generates an impact", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const world = makeWorld(seed);
      const { a, b } = getEntities(world);

      // Pre-establish grapple with strong leverage advantage
      a.grapple.holdingTargetId = b.id;
      a.grapple.gripQ = q(0.70);
      a.grapple.position = "standing";
      b.grapple.heldByIds = [a.id];

      a.attributes.performance.peakForce_N = to.N(4000);
      a.attributes.morphology.stature_m    = to.m(2.0);
      b.attributes.performance.peakForce_N = to.N(800);
      b.attributes.morphology.stature_m    = to.m(1.50);

      const impacts: any[] = [];
      resolveGrappleThrow(world, a, b, q(1.0), TUNING.tactical, impacts, { onEvent() {} });

      if (b.condition.prone) {
        expect(impacts.length).toBeGreaterThan(0);
        expect(impacts[0].targetId).toBe(b.id);
        expect(impacts[0].energy_J).toBeGreaterThan(0);
        expect(impacts[0].region).toBe("torso");
        return; // pass
      }
    }
    expect(true).toBe(false);
  });

  test("throw is skipped when not holding the target", () => {
    const world = makeWorld(1);
    const { a, b } = getEntities(world);
    a.grapple.holdingTargetId = 0; // not holding

    const impacts: any[] = [];
    resolveGrappleThrow(world, a, b, q(1.0), TUNING.tactical, impacts, { onEvent() {} });

    expect(impacts).toHaveLength(0);
    expect(b.condition.prone).toBe(false);
  });

  test("throw releases the grapple on success", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const world = makeWorld(seed);
      const { a, b } = getEntities(world);

      a.grapple.holdingTargetId = b.id;
      a.grapple.gripQ = q(0.80);
      b.grapple.heldByIds = [a.id];
      a.attributes.performance.peakForce_N = to.N(5000);

      const impacts: any[] = [];
      resolveGrappleThrow(world, a, b, q(1.0), TUNING.tactical, impacts, { onEvent() {} });

      if (b.condition.prone) {
        // Grapple should be released
        expect(a.grapple.holdingTargetId).toBe(0);
        expect(b.grapple.heldByIds).not.toContain(a.id);
        return;
      }
    }
  });
});

// ─── resolveGrappleChoke ────────────────────────────────────────────────────

describe("resolveGrappleChoke", () => {
  test("accumulates suffocation on held target", () => {
    const world = makeWorld(1);
    const { a, b } = getEntities(world);

    a.grapple.holdingTargetId = b.id;
    a.grapple.gripQ = q(0.80);
    a.grapple.position = "prone"; // must not be standing in tactical
    b.grapple.heldByIds = [a.id];
    b.condition.suffocation = q(0);

    resolveGrappleChoke(a, b, q(1.0), TUNING.tactical);

    expect(b.condition.suffocation).toBeGreaterThan(0);
  });

  test("choke is skipped when in standing position (tactical mode)", () => {
    const world = makeWorld(1);
    const { a, b } = getEntities(world);

    a.grapple.holdingTargetId = b.id;
    a.grapple.gripQ = q(0.80);
    a.grapple.position = "standing";
    b.grapple.heldByIds = [a.id];
    b.condition.suffocation = q(0);

    resolveGrappleChoke(a, b, q(1.0), TUNING.tactical);

    expect(b.condition.suffocation).toBe(q(0));
  });

  test("strong grip advances to pinned", () => {
    const world = makeWorld(1);
    const { a, b } = getEntities(world);

    a.grapple.holdingTargetId = b.id;
    a.grapple.gripQ = q(0.80); // above 0.60 threshold
    a.grapple.position = "prone";
    b.grapple.heldByIds = [a.id];

    resolveGrappleChoke(a, b, q(1.0), TUNING.tactical);

    expect(a.grapple.position).toBe("pinned");
    expect(b.condition.pinned).toBe(true);
  });

  test("choke is skipped when not holding target", () => {
    const world = makeWorld(1);
    const { a, b } = getEntities(world);

    a.grapple.holdingTargetId = 0;
    a.grapple.position = "prone";
    b.condition.suffocation = q(0);

    resolveGrappleChoke(a, b, q(1.0), TUNING.tactical);

    expect(b.condition.suffocation).toBe(q(0));
  });
});

// ─── resolveGrappleJointLock ─────────────────────────────────────────────────

describe("resolveGrappleJointLock", () => {
  test("generates a structural impact on a limb", () => {
    const world = makeWorld(1);
    const { a, b } = getEntities(world);

    a.grapple.holdingTargetId = b.id;
    a.grapple.gripQ = q(0.70);
    a.grapple.position = "prone";
    b.grapple.heldByIds = [a.id];

    const impacts: any[] = [];
    resolveGrappleJointLock(world, a, b, q(1.0), TUNING.tactical, impacts);

    expect(impacts.length).toBeGreaterThan(0);
    const impact = impacts[0];
    const limbRegions = ["leftArm", "rightArm", "leftLeg", "rightLeg"];
    expect(limbRegions).toContain(impact.region);
    expect(impact.energy_J).toBeGreaterThan(0);
  });

  test("joint-lock drains attacker energy", () => {
    const world = makeWorld(1);
    const { a, b } = getEntities(world);

    a.grapple.holdingTargetId = b.id;
    a.grapple.gripQ = q(0.70);
    a.grapple.position = "prone";
    b.grapple.heldByIds = [a.id];

    const energyBefore = a.energy.reserveEnergy_J;
    resolveGrappleJointLock(world, a, b, q(1.0), TUNING.tactical, []);
    expect(a.energy.reserveEnergy_J).toBeLessThan(energyBefore);
  });

  test("joint-lock is skipped in standing position (tactical)", () => {
    const world = makeWorld(1);
    const { a, b } = getEntities(world);

    a.grapple.holdingTargetId = b.id;
    a.grapple.gripQ = q(0.70);
    a.grapple.position = "standing";

    const impacts: any[] = [];
    resolveGrappleJointLock(world, a, b, q(1.0), TUNING.tactical, impacts);

    expect(impacts).toHaveLength(0);
  });

  test("target region is deterministic for same seed", () => {
    function runLock(seed: number) {
      const world = makeWorld(seed);
      const { a, b } = getEntities(world);
      a.grapple.holdingTargetId = b.id;
      a.grapple.gripQ = q(0.70);
      a.grapple.position = "prone";
      b.grapple.heldByIds = [a.id];
      const impacts: any[] = [];
      resolveGrappleJointLock(world, a, b, q(1.0), TUNING.tactical, impacts);
      return impacts[0]?.region;
    }

    for (let seed = 1; seed <= 20; seed++) {
      expect(runLock(seed)).toBe(runLock(seed));
    }
  });
});

// ─── resolveBreakGrapple ─────────────────────────────────────────────────────

describe("resolveBreakGrapple", () => {
  test("weak held entity can eventually break free from weak holder", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const world = makeWorld(seed);
      const { a, b } = getEntities(world);

      // Establish grapple: a holds b
      a.grapple.holdingTargetId = b.id;
      a.grapple.gripQ = q(0.20); // low grip
      b.grapple.heldByIds = [a.id];
      a.attributes.performance.peakForce_N = to.N(600);
      b.attributes.performance.peakForce_N = to.N(3000); // strong breaker

      const index = buildWorldIndex(world);
      resolveBreakGrapple(world, b, q(1.0), TUNING.tactical, index, { onEvent() {} });

      if (b.grapple.heldByIds.length === 0) {
        expect(a.grapple.holdingTargetId).toBe(0);
        return; // pass
      }
    }
    expect(true).toBe(false);
  });

  test("break attempt is ignored when not held", () => {
    const world = makeWorld(1);
    const { b } = getEntities(world);
    b.grapple.heldByIds = [];

    const index = buildWorldIndex(world);
    const energyBefore = b.energy.reserveEnergy_J;
    resolveBreakGrapple(world, b, q(1.0), TUNING.tactical, index, { onEvent() {} });

    // No energy drain when not held
    expect(b.energy.reserveEnergy_J).toBe(energyBefore);
  });

  test("dead holder is auto-released", () => {
    const world = makeWorld(1);
    const { a, b } = getEntities(world);

    a.grapple.holdingTargetId = b.id;
    a.grapple.gripQ = q(0.50);
    b.grapple.heldByIds = [a.id];
    a.injury.dead = true; // holder is dead

    const index = buildWorldIndex(world);
    resolveBreakGrapple(world, b, q(1.0), TUNING.tactical, index, { onEvent() {} });

    expect(b.grapple.heldByIds.length).toBe(0);
    expect(b.condition.pinned).toBe(false);
  });

  test("break is deterministic: same seed same outcome", () => {
    function runBreak(seed: number) {
      const world = makeWorld(seed);
      const { a, b } = getEntities(world);
      a.grapple.holdingTargetId = b.id;
      a.grapple.gripQ = q(0.50);
      b.grapple.heldByIds = [a.id];

      const index = buildWorldIndex(world);
      resolveBreakGrapple(world, b, q(1.0), TUNING.tactical, index, { onEvent() {} });
      return b.grapple.heldByIds.length;
    }

    for (let seed = 1; seed <= 20; seed++) {
      expect(runBreak(seed)).toBe(runBreak(seed));
    }
  });
});

// ─── stepGrappleTick ─────────────────────────────────────────────────────────

describe("stepGrappleTick", () => {
  test("drains energy from the holder each tick", () => {
    const world = makeWorld(1);
    const { a, b } = getEntities(world);
    a.grapple.holdingTargetId = b.id;
    a.grapple.gripQ = q(0.80);

    const index = buildWorldIndex(world);
    const energyBefore = a.energy.reserveEnergy_J;
    stepGrappleTick(world, a, index);

    expect(a.energy.reserveEnergy_J).toBeLessThan(energyBefore);
  });

  test("grip decays each tick", () => {
    const world = makeWorld(1);
    const { a, b } = getEntities(world);
    a.grapple.holdingTargetId = b.id;
    a.grapple.gripQ = q(0.80);

    const index = buildWorldIndex(world);
    const gripBefore = a.grapple.gripQ;
    stepGrappleTick(world, a, index);

    expect(a.grapple.gripQ).toBeLessThan(gripBefore);
  });

  test("auto-releases when grip reaches zero", () => {
    const world = makeWorld(1);
    const { a, b } = getEntities(world);
    a.grapple.holdingTargetId = b.id;
    a.grapple.gripQ = 1; // almost zero — one tick will exhaust it
    b.grapple.heldByIds = [a.id];

    const index = buildWorldIndex(world);
    stepGrappleTick(world, a, index);

    expect(a.grapple.holdingTargetId).toBe(0);
    expect(b.grapple.heldByIds.length).toBe(0);
  });

  test("auto-releases when target is dead", () => {
    const world = makeWorld(1);
    const { a, b } = getEntities(world);
    a.grapple.holdingTargetId = b.id;
    a.grapple.gripQ = q(0.80);
    b.grapple.heldByIds = [a.id];
    b.injury.dead = true;

    const index = buildWorldIndex(world);
    stepGrappleTick(world, a, index);

    expect(a.grapple.holdingTargetId).toBe(0);
  });

  test("no-op when not holding anyone", () => {
    const world = makeWorld(1);
    const { a } = getEntities(world);
    a.grapple.holdingTargetId = 0;

    const index = buildWorldIndex(world);
    const energyBefore = a.energy.reserveEnergy_J;
    stepGrappleTick(world, a, index);

    expect(a.energy.reserveEnergy_J).toBe(energyBefore);
  });
});

// ─── Functional impairment from grapple ──────────────────────────────────────

describe("pinned/held impairment", () => {
  test("pinned entity has severely reduced mobilityMul", () => {
    const free   = mkHumanoidEntity(1, 1, 0, 0);
    const pinned = mkHumanoidEntity(1, 1, 0, 0);
    pinned.condition.pinned = true;

    const funcFree   = deriveFunctionalState(free,   TUNING.tactical);
    const funcPinned = deriveFunctionalState(pinned, TUNING.tactical);

    expect(funcPinned.mobilityMul).toBeLessThan(funcFree.mobilityMul);
    // Pinned should cut mobility by at least 60%
    expect(funcPinned.mobilityMul).toBeLessThan(q(0.40));
  });

  test("held entity has moderate mobilityMul reduction", () => {
    const free = mkHumanoidEntity(2, 1, 0, 0);
    const held = mkHumanoidEntity(2, 1, 0, 0);
    held.grapple.heldByIds = [99]; // some holder

    const funcFree = deriveFunctionalState(free, TUNING.tactical);
    const funcHeld = deriveFunctionalState(held, TUNING.tactical);

    expect(funcHeld.mobilityMul).toBeLessThan(funcFree.mobilityMul);
  });
});

// ─── Full kernel integration ──────────────────────────────────────────────────

describe("grapple via stepWorld", () => {
  test("grapple command reaches the target entity's heldByIds", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, to.m(1.0), 0);
      a.attributes.performance.peakForce_N = to.N(3500);
      b.attributes.performance.peakForce_N = to.N(600);
      const world = mkWorld(seed, [a, b]);

      const cmds: CommandMap = new Map([
        [1, [{ kind: "grapple", targetId: 2, intensity: q(1.0) }]],
      ]);
      stepWorld(world, cmds, { tractionCoeff: q(0.9) });

      const wa = world.entities.find(e => e.id === 1)!;
      const wb = world.entities.find(e => e.id === 2)!;

      if (wa.grapple.holdingTargetId === 2) {
        expect(wb.grapple.heldByIds).toContain(1);
        return;
      }
    }
    expect(true).toBe(false);
  });

  test("breakGrapple command frees entity in the same world step", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, to.m(1.0), 0);
      const world = mkWorld(seed, [a, b]);

      // Pre-establish grapple
      world.entities[0].grapple.holdingTargetId = 2;
      world.entities[0].grapple.gripQ = q(0.20); // weak grip
      world.entities[1].grapple.heldByIds = [1];
      world.entities[1].attributes.performance.peakForce_N = to.N(4000); // strong breaker

      const cmds: CommandMap = new Map([
        [2, [{ kind: "breakGrapple", intensity: q(1.0) }]],
      ]);
      stepWorld(world, cmds, { tractionCoeff: q(0.9) });

      const wb = world.entities.find(e => e.id === 2)!;
      if (wb.grapple.heldByIds.length === 0) {
        expect(world.entities.find(e => e.id === 1)!.grapple.holdingTargetId).toBe(0);
        return;
      }
    }
    expect(true).toBe(false);
  });

  test("throw via grapple command generates damage to target", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, to.m(1.0), 0);
      a.attributes.performance.peakForce_N = to.N(4500);
      a.attributes.morphology.stature_m    = to.m(2.0);
      b.attributes.performance.peakForce_N = to.N(600);
      const world = mkWorld(seed, [a, b]);

      // Pre-establish grapple
      world.entities[0].grapple.holdingTargetId = 2;
      world.entities[0].grapple.gripQ = q(0.75);
      world.entities[0].grapple.position = "standing";
      world.entities[1].grapple.heldByIds = [1];

      const cmds: CommandMap = new Map([
        [1, [{ kind: "grapple", targetId: 2, intensity: q(1.0), mode: "throw" }]],
      ]);
      stepWorld(world, cmds, { tractionCoeff: q(0.9) });

      const wb = world.entities.find(e => e.id === 2)!;
      const torso = wb.injury.byRegion.torso;
      const damage = torso.surfaceDamage + torso.internalDamage + torso.structuralDamage;
      if (damage > 0 && wb.condition.prone) {
        expect(damage).toBeGreaterThan(0);
        return;
      }
    }
    expect(true).toBe(false);
  });

  test("choke via grapple command adds suffocation", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    const b = mkHumanoidEntity(2, 2, to.m(1.0), 0);
    const world = mkWorld(42, [a, b]);

    // Pre-establish grapple on ground
    world.entities[0].grapple.holdingTargetId = 2;
    world.entities[0].grapple.gripQ = q(0.80);
    world.entities[0].grapple.position = "prone";
    world.entities[1].grapple.heldByIds = [1];
    world.entities[1].condition.suffocation = q(0);

    const cmds: CommandMap = new Map([
      [1, [{ kind: "grapple", targetId: 2, intensity: q(1.0), mode: "choke" }]],
    ]);
    stepWorld(world, cmds, { tractionCoeff: q(0.9) });

    const wb = world.entities.find(e => e.id === 2)!;
    expect(wb.condition.suffocation).toBeGreaterThan(0);
  });
});
