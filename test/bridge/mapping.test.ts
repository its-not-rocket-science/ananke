// test/bridge/mapping.test.ts — Segment‑to‑bone mapping resolution

import { describe, it, expect } from "vitest";
import { q } from "../../src/units";
import {
  resolveBoneName,
  findBodyPlanMapping,
  mapPoseModifiers,
  createIdentityMapping,
  validateMappingCoverage,
} from "../../src/bridge/mapping";

// ─── resolveBoneName ───────────────────────────────────────────────────────────

describe("resolveBoneName", () => {
  const mapping = {
    bodyPlanId: "humanoid",
    segments: [
      { segmentId: "head", boneName: "Head" },
      { segmentId: "torso", boneName: "Spine" },
    ],
  };

  it("returns bone name when segment mapped", () => {
    expect(resolveBoneName("head", mapping, "root")).toBe("Head");
    expect(resolveBoneName("torso", mapping, "root")).toBe("Spine");
  });

  it("falls back to default when segment not mapped", () => {
    expect(resolveBoneName("leftArm", mapping, "root")).toBe("root");
    expect(resolveBoneName("unknown", mapping, "pelvis")).toBe("pelvis");
  });
});

// ─── findBodyPlanMapping ───────────────────────────────────────────────────────

describe("findBodyPlanMapping", () => {
  const config = {
    mappings: [
      { bodyPlanId: "humanoid", segments: [] },
      { bodyPlanId: "quadruped", segments: [] },
    ],
    extrapolationAllowed: false,
  };

  it("finds existing mapping", () => {
    const m = findBodyPlanMapping(config, "humanoid");
    expect(m?.bodyPlanId).toBe("humanoid");
  });

  it("returns undefined for unknown body plan", () => {
    expect(findBodyPlanMapping(config, "avian")).toBeUndefined();
  });
});

// ─── mapPoseModifiers ─────────────────────────────────────────────────────────

describe("mapPoseModifiers", () => {
  const mapping = {
    bodyPlanId: "humanoid",
    segments: [
      { segmentId: "head", boneName: "Head" },
      { segmentId: "torso", boneName: "Spine" },
      // leftArm not mapped → default bone name
    ],
  };

  it("maps segmentId to boneName", () => {
    const pose = [
      { segmentId: "head", structuralQ: q(0.1), surfaceQ: q(0.2), impairmentQ: q(0.2) },
      { segmentId: "torso", structuralQ: q(0.3), surfaceQ: q(0.4), impairmentQ: q(0.4) },
      { segmentId: "leftArm", structuralQ: q(0.5), surfaceQ: q(0.6), impairmentQ: q(0.6) },
    ];
    const mapped = mapPoseModifiers(pose, mapping, "Root");
    expect(mapped).toHaveLength(3);
    expect(mapped[0]).toEqual({
      segmentId: "head",
      boneName: "Head",
      impairmentQ: q(0.2),
      structuralQ: q(0.1),
      surfaceQ: q(0.2),
    });
    expect(mapped[1].boneName).toBe("Spine");
    expect(mapped[2].boneName).toBe("Root");
  });
});

// ─── createIdentityMapping ────────────────────────────────────────────────────

describe("createIdentityMapping", () => {
  it("creates mapping where boneName = segmentId", () => {
    const mapping = createIdentityMapping("test", ["head", "torso", "leftArm"]);
    expect(mapping.bodyPlanId).toBe("test");
    expect(mapping.segments).toEqual([
      { segmentId: "head", boneName: "head" },
      { segmentId: "torso", boneName: "torso" },
      { segmentId: "leftArm", boneName: "leftArm" },
    ]);
  });
});

// ─── validateMappingCoverage ──────────────────────────────────────────────────

describe("validateMappingCoverage", () => {
  const mapping = {
    bodyPlanId: "humanoid",
    segments: [
      { segmentId: "head", boneName: "Head" },
      { segmentId: "torso", boneName: "Spine" },
    ],
  };

  it("returns empty array when all segments covered", () => {
    const missing = validateMappingCoverage(mapping, ["head", "torso"]);
    expect(missing).toEqual([]);
  });

  it("returns missing segment IDs", () => {
    const missing = validateMappingCoverage(mapping, ["head", "torso", "leftArm", "rightArm"]);
    expect(missing).toEqual(["leftArm", "rightArm"]);
  });
});