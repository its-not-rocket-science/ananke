/**
 * AI targeting branch tests — src/sim/ai/targeting.ts
 *
 * Branch coverage was 16.66% (lowest in the project).  These tests
 * deterministically drive every branch in pickTarget and updateFocus.
 */

import { describe, expect, test } from "vitest";
import { q, SCALE } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { buildWorldIndex } from "../src/sim/indexing";
import { buildSpatialIndex } from "../src/sim/spatial";
import { pickTarget, updateFocus } from "../src/sim/ai/targeting";
import type { AIPolicy } from "../src/sim/ai/types";

const CELL_SIZE = Math.trunc(4 * SCALE.m);
const CLOSE = Math.trunc(1.0 * SCALE.m);
const FAR   = Math.trunc(10.0 * SCALE.m);

/** Policy that never sticks to a focus target (always retargets) */
const LOOSE_POLICY: AIPolicy = {
  archetype: "skirmisher",
  desiredRange_m: CLOSE,
  engageRange_m: CLOSE,
  retreatRange_m: 0,
  threatRange_m: CLOSE,
  defendWhenThreatenedQ: q(0.3),
  parryBiasQ: q(0.2),
  dodgeBiasQ: q(0.5),
  retargetCooldownTicks: 10,
  focusStickinessQ: q(0.0),   // never sticky — always retargets
};

/** Policy with very high stickiness so the focus is almost always retained */
const STICKY_POLICY: AIPolicy = {
  ...LOOSE_POLICY,
  focusStickinessQ: q(0.9999),  // extremely sticky
};

function makeSetup(selfX = 0, enemyX = CLOSE) {
  const self  = mkHumanoidEntity(1, 1, selfX, 0);
  const enemy = mkHumanoidEntity(2, 2, enemyX, 0);
  const world = mkWorld(42, [self, enemy]);
  const index = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, CELL_SIZE);
  return { self, enemy, world, index, spatial };
}

// ─── pickTarget ───────────────────────────────────────────────────────────────

describe("pickTarget", () => {
  test("returns undefined when no enemies are visible", () => {
    const self  = mkHumanoidEntity(1, 1, 0, 0);
    const ally  = mkHumanoidEntity(2, 1, CLOSE, 0);  // same team
    const world = mkWorld(1, [self, ally]);
    const index = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, CELL_SIZE);

    const target = pickTarget(world.seed, world.tick, self, index, spatial, LOOSE_POLICY);
    expect(target).toBeUndefined();
  });

  test("returns nearest enemy when no focus exists", () => {
    const { self, enemy, world, index, spatial } = makeSetup();
    const target = pickTarget(world.seed, world.tick, self, index, spatial, LOOSE_POLICY);
    expect(target?.id).toBe(enemy.id);
  });

  test("focus is retained when cooldown is still active", () => {
    const { self, enemy, world, index, spatial } = makeSetup();

    // Establish focus with an active cooldown
    self.ai = { focusTargetId: enemy.id, retargetCooldownTicks: 5, decisionCooldownTicks: 0 };

    const target = pickTarget(world.seed, world.tick, self, index, spatial, LOOSE_POLICY);
    expect(target?.id).toBe(enemy.id);
  });

  test("retargets when cooldown expires (retargetCooldownTicks === 0)", () => {
    // Use a second enemy closer to self than the focused enemy
    const self   = mkHumanoidEntity(1, 1, 0, 0);
    const enemy1 = mkHumanoidEntity(2, 2, FAR, 0);    // focused but far
    const enemy2 = mkHumanoidEntity(3, 2, CLOSE, 0);  // closer, should win

    const world  = mkWorld(7, [self, enemy1, enemy2]);
    const index  = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, CELL_SIZE);

    // Focus on enemy1 but cooldown is zero → should retarget to nearest
    self.ai = { focusTargetId: enemy1.id, retargetCooldownTicks: 0, decisionCooldownTicks: 0 };

    const target = pickTarget(world.seed, world.tick, self, index, spatial, LOOSE_POLICY);
    expect(target?.id).toBe(enemy2.id);
  });

  test("dead focused target triggers retarget", () => {
    const { self, enemy, world, index } = makeSetup();
    const enemy2 = mkHumanoidEntity(3, 2, Math.trunc(0.8 * SCALE.m), 0);
    world.entities.push(enemy2);
    index.byId.set(enemy2.id, enemy2);

    // Focus is on dead enemy
    enemy.injury.dead = true;
    self.ai = { focusTargetId: enemy.id, retargetCooldownTicks: 10, decisionCooldownTicks: 0 };

    const target = pickTarget(world.seed, world.tick, self, index, buildSpatialIndex(world, CELL_SIZE), LOOSE_POLICY);
    expect(target?.id).toBe(enemy2.id);
  });

  test("stickiness: highly sticky policy keeps focus even after cooldown expires", () => {
    const { self, enemy, world, index } = makeSetup();
    const enemy2 = mkHumanoidEntity(3, 2, Math.trunc(0.5 * SCALE.m), 0); // closer
    world.entities.push(enemy2);
    index.byId.set(enemy2.id, enemy2);

    // Cooldown is zero but stickiness is q(0.9999) — sweep seeds to verify
    // stickiness retains focus at least some of the time (deterministic)
    self.ai = { focusTargetId: enemy.id, retargetCooldownTicks: 0, decisionCooldownTicks: 0 };

    let retained = 0;
    for (let tick = 0; tick < 30; tick++) {
      const sp = buildSpatialIndex(world, CELL_SIZE);
      const t  = pickTarget(world.seed, tick, self, index, sp, STICKY_POLICY);
      if (t?.id === enemy.id) retained++;
    }
    // With stickiness of 0.9999 at least 25 of 30 ticks should retain focus
    expect(retained).toBeGreaterThanOrEqual(25);
  });

  test("non-sticky policy switches to nearest after cooldown", () => {
    const self   = mkHumanoidEntity(1, 1, 0, 0);
    const enemy1 = mkHumanoidEntity(2, 2, FAR, 0);
    const enemy2 = mkHumanoidEntity(3, 2, CLOSE, 0);
    const world  = mkWorld(99, [self, enemy1, enemy2]);
    const index  = buildWorldIndex(world);

    self.ai = { focusTargetId: enemy1.id, retargetCooldownTicks: 0, decisionCooldownTicks: 0 };

    let switched = 0;
    for (let tick = 0; tick < 30; tick++) {
      const sp = buildSpatialIndex(world, CELL_SIZE);
      const t  = pickTarget(world.seed, tick, self, index, sp, LOOSE_POLICY);
      if (t?.id === enemy2.id) switched++;
    }
    // With stickiness = 0 it should always switch to the nearer enemy
    expect(switched).toBe(30);
  });
});

// ─── updateFocus ──────────────────────────────────────────────────────────────

describe("updateFocus", () => {
  test("sets focusTargetId and resets cooldown when a target is provided", () => {
    const self  = mkHumanoidEntity(1, 1, 0, 0);
    const enemy = mkHumanoidEntity(2, 2, CLOSE, 0);

    updateFocus(self, enemy, LOOSE_POLICY);

    expect(self.ai?.focusTargetId).toBe(enemy.id);
    expect(self.ai?.retargetCooldownTicks).toBe(LOOSE_POLICY.retargetCooldownTicks);
  });

  test("clears focus and cooldown when target is undefined", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    self.ai = { focusTargetId: 99, retargetCooldownTicks: 5, decisionCooldownTicks: 0 };

    updateFocus(self, undefined, LOOSE_POLICY);

    expect(self.ai.focusTargetId).toBe(0);
    expect(self.ai.retargetCooldownTicks).toBe(0);
  });

  test("initialises ai state if absent", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    const enemy = mkHumanoidEntity(2, 2, CLOSE, 0);
    // ensure ai is undefined
    delete self.ai;

    updateFocus(self, enemy, STICKY_POLICY);

    expect(self.ai).toBeDefined();
    expect(self.ai!.focusTargetId).toBe(enemy.id);
  });

});

// ─── Environmental condition integration coverage ─────────────────────────────

describe("environmental hazard application (kernel stepConditionsToInjury)", () => {
  // These tests cover the large uncovered block around lines 720-814 of kernel.ts
  // by running stepWorld with hazard conditions set.

  test("onFire increases surface damage and shock after one tick", async () => {
    const { mkHumanoidEntity, mkWorld } = await import("../src/sim/testing");
    const { stepWorld } = await import("../src/sim/kernel");
    const { q } = await import("../src/units");

    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.condition.onFire = q(1.0);
    const world = mkWorld(1, [entity]);

    stepWorld(world, new Map(), { tractionCoeff: q(0.9) });

    const e = world.entities[0]!;
    const torsoSurf = e.injury.byRegion.torso!.surfaceDamage;
    expect(torsoSurf).toBeGreaterThan(0);
    expect(e.injury.shock).toBeGreaterThan(0);
  });

  test("corrosiveExposure increases surface and internal damage after one tick", async () => {
    const { mkHumanoidEntity, mkWorld } = await import("../src/sim/testing");
    const { stepWorld } = await import("../src/sim/kernel");
    const { q } = await import("../src/units");

    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.condition.corrosiveExposure = q(1.0);
    const world = mkWorld(1, [entity]);

    stepWorld(world, new Map(), { tractionCoeff: q(0.9) });

    const e = world.entities[0]!;
    expect(e.injury.byRegion.torso!.surfaceDamage).toBeGreaterThan(0);
    expect(e.injury.byRegion.torso!.internalDamage).toBeGreaterThan(0);
  });

  test("electricalOverload increases internal damage and stun after one tick", async () => {
    const { mkHumanoidEntity, mkWorld } = await import("../src/sim/testing");
    const { stepWorld } = await import("../src/sim/kernel");
    const { q } = await import("../src/units");

    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.condition.electricalOverload = q(1.0);
    const world = mkWorld(1, [entity]);

    stepWorld(world, new Map(), { tractionCoeff: q(0.9) });

    const e = world.entities[0]!;
    expect(e.injury.byRegion.torso!.internalDamage).toBeGreaterThan(0);
    expect(e.condition.stunned).toBeGreaterThan(0);
  });

  test("radiation increases internal damage and shock after one tick", async () => {
    const { mkHumanoidEntity, mkWorld } = await import("../src/sim/testing");
    const { stepWorld } = await import("../src/sim/kernel");
    const { q } = await import("../src/units");

    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.condition.radiation = q(1.0);
    const world = mkWorld(1, [entity]);

    stepWorld(world, new Map(), { tractionCoeff: q(0.9) });

    const e = world.entities[0]!;
    expect(e.injury.byRegion.torso!.internalDamage).toBeGreaterThan(0);
    expect(e.injury.shock).toBeGreaterThan(0);
  });

  test("suffocation decreases consciousness over time", async () => {
    const { mkHumanoidEntity, mkWorld } = await import("../src/sim/testing");
    const { stepWorld } = await import("../src/sim/kernel");
    const { q } = await import("../src/units");

    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.condition.suffocation = q(1.0);
    const world = mkWorld(1, [entity]);

    const before = entity.injury.consciousness;
    stepWorld(world, new Map(), { tractionCoeff: q(0.9) });

    const e = world.entities[0]!;
    expect(e.injury.consciousness).toBeLessThan(before);
  });
});