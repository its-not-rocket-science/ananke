// test/bridge/interpolation.test.ts — Deterministic interpolation utilities

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../../src/units";
import { v3 } from "../../src/sim/vec3";
import {
  lerpQ,
  lerpQClamped,
  lerpVec3,
  slerpFacing,
  interpolatePoseModifiers,
  interpolateAnimationHints,
  interpolateCondition,
} from "../../src/bridge/interpolation";

// ─── lerpQ ─────────────────────────────────────────────────────────────────────

describe("lerpQ", () => {
  it("interpolates between zero and SCALE.Q", () => {
    expect(lerpQ(0, SCALE.Q, 0)).toBe(0);
    expect(lerpQ(0, SCALE.Q, SCALE.Q)).toBe(SCALE.Q);
    expect(lerpQ(0, SCALE.Q, SCALE.Q / 2)).toBe(SCALE.Q / 2);
    expect(lerpQ(0, SCALE.Q, SCALE.Q / 4)).toBe(SCALE.Q / 4);
  });

  it("handles negative values", () => {
    expect(lerpQ(-SCALE.Q, SCALE.Q, 0)).toBe(-SCALE.Q);
    expect(lerpQ(-SCALE.Q, SCALE.Q, SCALE.Q)).toBe(SCALE.Q);
    expect(lerpQ(-SCALE.Q, SCALE.Q, SCALE.Q / 2)).toBe(0);
  });

  it("deterministic (no floating point)", () => {
    // Use mulDiv internally, should be integer arithmetic
    const result = lerpQ(12345, 67890, 3000);
    expect(result).toBe(Math.trunc((12345 * (SCALE.Q - 3000) + 67890 * 3000) / SCALE.Q));
  });
});

describe("lerpQClamped", () => {
  it("clamps within [prev, curr] when prev <= curr", () => {
    expect(lerpQClamped(100, 200, -1000)).toBe(100);
    expect(lerpQClamped(100, 200, SCALE.Q + 1000)).toBe(200);
    expect(lerpQClamped(100, 200, SCALE.Q / 2)).toBe(150);
  });

  it("clamps within [curr, prev] when prev > curr", () => {
    expect(lerpQClamped(200, 100, -1000)).toBe(200);
    expect(lerpQClamped(200, 100, SCALE.Q + 1000)).toBe(100);
    expect(lerpQClamped(200, 100, SCALE.Q / 2)).toBe(150);
  });
});

// ─── lerpVec3 ──────────────────────────────────────────────────────────────────

describe("lerpVec3", () => {
  it("interpolates component‑wise", () => {
    const prev = v3(100, 200, 300);
    const curr = v3(200, 400, 600);
    const t = SCALE.Q / 2;
    const r = lerpVec3(prev, curr, t);
    expect(r.x).toBe(150);
    expect(r.y).toBe(300);
    expect(r.z).toBe(450);
  });

  it("t = 0 returns prev", () => {
    const prev = v3(123, 456, 789);
    const curr = v3(999, 999, 999);
    expect(lerpVec3(prev, curr, 0)).toEqual(prev);
  });

  it("t = SCALE.Q returns curr", () => {
    const prev = v3(0, 0, 0);
    const curr = v3(123, 456, 789);
    expect(lerpVec3(prev, curr, SCALE.Q)).toEqual(curr);
  });
});

// ─── slerpFacing ───────────────────────────────────────────────────────────────

describe("slerpFacing", () => {
  it("normalises result", () => {
    const prev = v3(SCALE.Q, 0, 0);
    const curr = v3(0, SCALE.Q, 0);
    const r = slerpFacing(prev, curr, SCALE.Q / 2);
    // normaliseDirCheapQ ensures max component = SCALE.Q
    const max = Math.max(Math.abs(r.x), Math.abs(r.y), Math.abs(r.z));
    expect(max).toBe(SCALE.Q);
  });

  it("preserves direction for equal vectors", () => {
    const v = v3(SCALE.Q, SCALE.Q / 2, 0);
    const r = slerpFacing(v, v, q(1/3));
    expect(r).toEqual(v);
  });
});

// ─── interpolatePoseModifiers ──────────────────────────────────────────────────

describe("interpolatePoseModifiers", () => {
  it("interpolates matching segmentIds", () => {
    const prev = [
      { segmentId: "head", structuralQ: 0, surfaceQ: 0, impairmentQ: 0 },
      { segmentId: "torso", structuralQ: q(0.2), surfaceQ: q(0.1), impairmentQ: q(0.2) },
    ];
    const curr = [
      { segmentId: "head", structuralQ: q(0.5), surfaceQ: q(0.3), impairmentQ: q(0.5) },
      { segmentId: "torso", structuralQ: q(0.8), surfaceQ: q(0.7), impairmentQ: q(0.8) },
    ];
    const t = SCALE.Q / 2;
    const r = interpolatePoseModifiers(prev, curr, t);
    expect(r).toHaveLength(2);
    const head = r.find(p => p.segmentId === "head")!;
    const torso = r.find(p => p.segmentId === "torso")!;
    expect(head.structuralQ).toBe(q(0.25));
    expect(head.surfaceQ).toBe(q(0.15));
    expect(head.impairmentQ).toBe(q(0.25));
    expect(torso.structuralQ).toBe(q(0.5));
    expect(torso.surfaceQ).toBe(q(0.4));
    expect(torso.impairmentQ).toBe(q(0.5));
  });

  it("holds constant when segment only in one snapshot", () => {
    const prev = [{ segmentId: "head", structuralQ: q(0.1), surfaceQ: q(0.1), impairmentQ: q(0.1) }];
    const curr = [{ segmentId: "torso", structuralQ: q(0.9), surfaceQ: q(0.9), impairmentQ: q(0.9) }];
    const r = interpolatePoseModifiers(prev, curr, SCALE.Q / 2);
    expect(r).toHaveLength(2);
    const head = r.find(p => p.segmentId === "head")!;
    const torso = r.find(p => p.segmentId === "torso")!;
    expect(head.structuralQ).toBe(q(0.1)); // unchanged
    expect(torso.structuralQ).toBe(q(0.9));
  });
});

// ─── interpolateAnimationHints ─────────────────────────────────────────────────

describe("interpolateAnimationHints", () => {
  it("interpolates scalar weights", () => {
    const prev = {
      idle: 0, walk: 0, run: 0, sprint: 0, crawl: 0,
      guardingQ: 0,
      attackingQ: 0,
      shockQ: 0,
      fearQ: 0,
      prone: false,
      unconscious: false,
      dead: false,
    };
    const curr = {
      idle: SCALE.Q, walk: 0, run: 0, sprint: 0, crawl: 0,
      guardingQ: SCALE.Q,
      attackingQ: SCALE.Q,
      shockQ: SCALE.Q,
      fearQ: SCALE.Q,
      prone: true,
      unconscious: true,
      dead: true,
    };
    const t = SCALE.Q / 2;
    const r = interpolateAnimationHints(prev, curr, t);
    expect(r.idle).toBe(SCALE.Q / 2);
    expect(r.guardingQ).toBe(SCALE.Q / 2);
    expect(r.shockQ).toBe(SCALE.Q / 2);
    // flags snap at t >= SCALE.Q/2, so should be curr values
    expect(r.prone).toBe(true);
    expect(r.unconscious).toBe(true);
    expect(r.dead).toBe(true);
  });

  it("snaps flags at halfway", () => {
    const prev = { ...basePrev, prone: false, dead: false };
    const curr = { ...basePrev, prone: true, dead: true };
    const t = SCALE.Q / 2 - 1;
    const r = interpolateAnimationHints(prev, curr, t);
    expect(r.prone).toBe(false);
    expect(r.dead).toBe(false);
    const r2 = interpolateAnimationHints(prev, curr, SCALE.Q / 2);
    expect(r2.prone).toBe(true);
    expect(r2.dead).toBe(true);
  });

  const basePrev = {
    idle: 0, walk: 0, run: 0, sprint: 0, crawl: 0,
    guardingQ: 0,
    attackingQ: 0,
    shockQ: 0,
    fearQ: 0,
    prone: false,
    unconscious: false,
    dead: false,
  };
});

// ─── interpolateCondition ──────────────────────────────────────────────────────

describe("interpolateCondition", () => {
  it("interpolates scalars, snaps dead flag", () => {
    const prev = {
      shockQ: 0,
      fearQ: 0,
      consciousness: SCALE.Q,
      fluidLoss: 0,
      dead: false,
    };
    const curr = {
      shockQ: SCALE.Q,
      fearQ: SCALE.Q,
      consciousness: 0,
      fluidLoss: SCALE.Q,
      dead: true,
    };
    const t = SCALE.Q / 2;
    const r = interpolateCondition(prev, curr, t);
    expect(r.shockQ).toBe(SCALE.Q / 2);
    expect(r.fearQ).toBe(SCALE.Q / 2);
    expect(r.consciousness).toBe(SCALE.Q / 2);
    expect(r.fluidLoss).toBe(SCALE.Q / 2);
    expect(r.dead).toBe(true); // snaps at halfway
  });
});