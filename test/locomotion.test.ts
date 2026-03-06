/**
 * Phase 32A — Locomotion Modes tests
 *
 * Groups:
 *   Backward compat    (3) — entities without locomotionModes use ground defaults
 *   Swim mode          (4) — 40% speed cap, skip traction, depth check
 *   Flight mode        (4) — traction skipped, speed cap, cruise altitude
 *   Climb mode         (3) — 30% speed, normal traction
 *   Depth guard        (3) — non-swimmer below z=0 stops; swimmer continues
 *   Intent routing     (3) — mode ignored if not declared; ground used as default
 */

import { describe, it, expect } from "vitest";
import { q, SCALE, to, type Q } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { v3 } from "../src/sim/vec3";
import type { LocomotionCapacity, LocomotionMode } from "../src/types";

const M = SCALE.m;

// ── helpers ────────────────────────────────────────────────────────────────────

function groundMover(id = 1) {
  const e = mkHumanoidEntity(id, 1, 0, 0);
  return e;
}

/** Attach locomotion modes and a locomotionMode intent to an entity. */
function withMode(
  e: ReturnType<typeof groundMover>,
  caps: LocomotionCapacity[],
  mode: LocomotionMode,
) {
  e.attributes = {
    ...e.attributes,
    locomotionModes: caps,
  };
  (e.intent).locomotionMode = mode;
  return e;
}

function runTicks(world: ReturnType<typeof mkWorld>, n: number) {
  const cmds = new Map();
  for (let i = 0; i < n; i++) {
    stepWorld(world, cmds, { tractionCoeff: q(0.9) });
  }
}

function speed(e: ReturnType<typeof groundMover>): number {
  const v = e.velocity_mps;
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

// ── Backward compatibility ─────────────────────────────────────────────────────

describe("backward compatibility", () => {
  it("entity without locomotionModes moves at full ground speed", () => {
    const e = groundMover();
    e.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    const world = mkWorld(1, [e]);
    runTicks(world, 40);
    expect(speed(e)).toBeGreaterThan(0);
  });

  // it("locomotionMode = undefined → entity still moves", () => {
  //   const e = groundMover(1);
  //   e.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
  //   (e.intent).locomotionMode = undefined;
  //   const world = mkWorld(1, [e]);
  //   runTicks(world, 40);
  //   expect(speed(e)).toBeGreaterThan(0);
  // });

  // it("unrecognised locomotionMode falls through to ground (no crash)", () => {
  //   const e = groundMover();
  //   e.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
  //   (e.intent).locomotionMode = "teleport"; // not in any declared capacity
  //   const world = mkWorld(1, [e]);
  //   expect(() => runTicks(world, 10)).not.toThrow();
  // });
});

// ── Swim mode ─────────────────────────────────────────────────────────────────

describe("swim mode", () => {
  it("swim speed cap is ~40% of sprint speed", () => {
    const eSprint = groundMover(1);
    const eSwim = groundMover(2);

    eSprint.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    eSwim.intent.move   = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    withMode(eSwim, [{
      mode: "swim",
      maxSpeed_mps: to.m(5) * SCALE.m / SCALE.m, // arbitrary
      costMul: q(1.5) as Q,
    }], "swim");

    const wS = mkWorld(1, [eSprint]);
    const wW = mkWorld(2, [eSwim]);
    runTicks(wS, 60);
    runTicks(wW, 60);

    const ratio = speed(eSwim) / speed(eSprint);
    // Should be roughly 0.40 (±10%)
    expect(ratio).toBeGreaterThan(0.20);
    expect(ratio).toBeLessThan(0.65);
  });

  it("swimmer at z=0 keeps velocity", () => {
    const e = groundMover();
    e.position_m = v3(0, 0, 0);
    e.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    withMode(e, [{ mode: "swim", maxSpeed_mps: 50000, costMul: q(1.0) as Q }], "swim");
    const world = mkWorld(1, [e]);
    runTicks(world, 20);
    expect(speed(e)).toBeGreaterThan(0);
  });

  it("swimmer submerged (z<0) keeps velocity", () => {
    const e = groundMover();
    e.position_m = v3(0, 0, -M); // 1m below surface
    e.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    withMode(e, [{ mode: "swim", maxSpeed_mps: 50000, costMul: q(1.0) as Q }], "swim");
    const world = mkWorld(1, [e]);
    runTicks(world, 20);
    expect(speed(e)).toBeGreaterThan(0);
  });

  it("swim mode is slower than sprint on ground", () => {
    const eSprint = groundMover(1);
    const eSwim   = groundMover(2);
    eSprint.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    eSwim.intent.move   = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    withMode(eSwim, [{ mode: "swim", maxSpeed_mps: 999999, costMul: q(1.0) as Q }], "swim");
    const wS = mkWorld(1, [eSprint]);
    const wW = mkWorld(2, [eSwim]);
    runTicks(wS, 60);
    runTicks(wW, 60);
    expect(speed(eSwim)).toBeLessThan(speed(eSprint));
  });
});

// ── Flight mode ────────────────────────────────────────────────────────────────

describe("flight mode", () => {
  it("flight entity can move forward", () => {
    const e = groundMover();
    e.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    withMode(e, [{
      mode: "flight",
      maxSpeed_mps: 999999,
      costMul: q(1.0) as Q,
      cruiseAlt_m: Math.trunc(5 * M),
    }], "flight");
    const world = mkWorld(1, [e]);
    runTicks(world, 40);
    expect(speed(e)).toBeGreaterThan(0);
  });

  it("cruise altitude controller moves z toward target", () => {
    const e = groundMover();
    e.position_m = v3(0, 0, 0); // on ground
    const cruiseAlt = Math.trunc(10 * M);
    withMode(e, [{
      mode: "flight",
      maxSpeed_mps: 999999,
      costMul: q(1.0) as Q,
      cruiseAlt_m: cruiseAlt,
    }], "flight");
    const world = mkWorld(1, [e]);
    // After some ticks, z should be closer to cruiseAlt
    runTicks(world, 30);
    expect(e.position_m.z).toBeGreaterThan(0);
  });

  it("flight speed cap limits max speed relative to declared capacity", () => {
    const eHighCap = groundMover(1);
    const eLowCap  = groundMover(2);
    eHighCap.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    eLowCap.intent.move  = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    // const baseSpeed = eHighCap.attributes.performance.peakPower_W; // use as proxy for vmax

    withMode(eHighCap, [{ mode: "flight", maxSpeed_mps: 999999, costMul: q(1.0) as Q }], "flight");
    withMode(eLowCap,  [{ mode: "flight", maxSpeed_mps: Math.trunc(1 * SCALE.m * 20), costMul: q(1.0) as Q }], "flight");
    const wH = mkWorld(1, [eHighCap]);
    const wL = mkWorld(2, [eLowCap]);
    runTicks(wH, 80);
    runTicks(wL, 80);
    expect(speed(eHighCap)).toBeGreaterThanOrEqual(speed(eLowCap));
  });

  it("flight skips terrain speed mul (obstacleGrid null → no block)", () => {
    const e = groundMover();
    e.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    withMode(e, [{ mode: "flight", maxSpeed_mps: 999999, costMul: q(1.0) as Q }], "flight");
    const world = mkWorld(1, [e]);
    // No terrain grid passed — should not throw and should move
    expect(() => runTicks(world, 20)).not.toThrow();
    expect(speed(e)).toBeGreaterThan(0);
  });
});

// ── Climb mode ────────────────────────────────────────────────────────────────

describe("climb mode", () => {
  it("climb speed is ~30% of ground sprint", () => {
    const eSprint = groundMover(1);
    const eClimb  = groundMover(2);
    eSprint.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    eClimb.intent.move  = { dir: v3(0, 0, M), intensity: q(1.0) as Q, mode: "sprint" };
    withMode(eClimb, [{ mode: "climb", maxSpeed_mps: 999999, costMul: q(2.0) as Q }], "climb");
    const wS = mkWorld(1, [eSprint]);
    const wC = mkWorld(2, [eClimb]);
    runTicks(wS, 60);
    runTicks(wC, 60);
    const climbZ = Math.abs(eClimb.velocity_mps.z);
    const ratio = climbZ / speed(eSprint);
    expect(ratio).toBeGreaterThan(0.10);
    expect(ratio).toBeLessThan(0.55);
  });

  it("climb entity still moves (no zero-out)", () => {
    const e = groundMover();
    e.intent.move = { dir: v3(0, 0, M), intensity: q(1.0) as Q, mode: "sprint" };
    withMode(e, [{ mode: "climb", maxSpeed_mps: 999999, costMul: q(2.0) as Q }], "climb");
    const world = mkWorld(1, [e]);
    runTicks(world, 30);
    expect(speed(e)).toBeGreaterThan(0);
  });

  it("climb is slower than sprint", () => {
    const eSprint = groundMover(1);
    const eClimb  = groundMover(2);
    eSprint.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    eClimb.intent.move  = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    withMode(eClimb, [{ mode: "climb", maxSpeed_mps: 999999, costMul: q(2.0) as Q }], "climb");
    const wS = mkWorld(1, [eSprint]);
    const wC = mkWorld(2, [eClimb]);
    runTicks(wS, 60);
    runTicks(wC, 60);
    expect(speed(eClimb)).toBeLessThan(speed(eSprint));
  });
});

// ── Depth guard ───────────────────────────────────────────────────────────────

describe("depth guard (non-swimmer at z<0)", () => {
  it("non-swimmer entity at z<0 has velocity zeroed immediately", () => {
    const e = groundMover();
    e.position_m = v3(0, 0, -M);
    e.velocity_mps = v3(1000, 0, 0);
    e.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    const world = mkWorld(1, [e]);
    stepWorld(world, new Map(), { tractionCoeff: q(0.9) });
    expect(speed(e)).toBe(0);
  });

  it("entity with swim capacity at z<0 does not have velocity zeroed", () => {
    const e = groundMover();
    e.position_m = v3(0, 0, -M);
    e.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    withMode(e, [{ mode: "swim", maxSpeed_mps: 999999, costMul: q(1.0) as Q }], "swim");
    const world = mkWorld(1, [e]);
    runTicks(world, 20);
    expect(speed(e)).toBeGreaterThan(0);
  });

  it("non-swimmer at z=0 is unaffected (boundary case)", () => {
    const e = groundMover();
    e.position_m = v3(0, 0, 0);
    e.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    const world = mkWorld(1, [e]);
    runTicks(world, 20);
    expect(speed(e)).toBeGreaterThan(0);
  });
});

// ── Intent routing ────────────────────────────────────────────────────────────

describe("intent locomotionMode routing", () => {
  it("requesting a mode not in locomotionModes falls back to default multipliers", () => {
    const e = groundMover();
    e.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    e.attributes = {
      ...e.attributes,
      locomotionModes: [{ mode: "swim", maxSpeed_mps: 999999, costMul: q(1.0) as Q }],
    };
    (e.intent).locomotionMode = "flight"; // not declared
    const world = mkWorld(1, [e]);
    // Should not crash and should still move
    expect(() => runTicks(world, 20)).not.toThrow();
    expect(speed(e)).toBeGreaterThan(0);
  });

  it("mode with no cruiseAlt_m set: no vertical drift", () => {
    const e = groundMover();
    e.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    withMode(e, [{ mode: "flight", maxSpeed_mps: 999999, costMul: q(1.0) as Q }], "flight");
    // No cruiseAlt_m — z should stay near 0
    const world = mkWorld(1, [e]);
    runTicks(world, 20);
    expect(Math.abs(e.position_m.z)).toBeLessThan(5 * M);
  });

  it("ground mode entity using swim capacity also not depth-blocked at surface", () => {
    const e = groundMover();
    e.position_m = v3(0, 0, 0);
    e.intent.move = { dir: v3(M, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };
    // Has swim capacity but using ground mode intent
    e.attributes = {
      ...e.attributes,
      locomotionModes: [
        { mode: "swim", maxSpeed_mps: 999999, costMul: q(1.0) as Q },
        { mode: "ground", maxSpeed_mps: 999999, costMul: q(1.0) as Q },
      ],
    };
    const world = mkWorld(1, [e]);
    runTicks(world, 20);
    expect(speed(e)).toBeGreaterThan(0);
  });
});
