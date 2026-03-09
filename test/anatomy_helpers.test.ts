import { describe, test, expect } from "vitest";

import {
  createAnatomyHelpers,
  functionHealth,
  segmentHealth,
  sampleProfile,
  summarizeFunctionalHealth,
} from "../src/anatomy/anatomy-helpers";
import { compileAnatomyDefinition } from "../src/anatomy";

const PLAN = {
  id: "humanoid",
  locomotion: { type: "biped" },
  cnsLayout: { type: "centralized" },
  symmetry: "bilateral",
  segments: [
    { id: "torso", parent: null, mass_kg: 10, exposureWeight: {} },
    { id: "head", parent: "torso", mass_kg: 5, exposureWeight: {}, cnsRole: "central" },
    { id: "leftArm", parent: "torso", mass_kg: 4, exposureWeight: {}, manipulationRole: "primary" },
    { id: "rightArm", parent: "torso", mass_kg: 4, exposureWeight: {}, manipulationRole: "primary" },
    { id: "leftLeg", parent: "torso", mass_kg: 6, exposureWeight: {}, locomotionRole: "primary" },
    { id: "rightLeg", parent: "torso", mass_kg: 6, exposureWeight: {}, locomotionRole: "primary" },
  ],
  segmentData: {
    torso: {
      tags: ["core"],
      functions: [{ id: "circulation", role: "primary" }],
      organs: [{ id: "heart", kind: "pump", vital: true }],
    },
    head: {
      tags: ["headTag"],
      functions: [
        { id: "vision", role: "primary" },
        { id: "x:coordination", role: "support" },
      ],
    },
    leftArm: {
      tags: ["shield-small-cover", "left"],
      functions: [{ id: "x:leftManipulation", role: "primary", weight: 1 }],
    },
    rightArm: {
      tags: ["shield-small-cover", "right"],
      functions: [{ id: "x:rightManipulation", role: "primary", weight: 1 }],
    },
    leftLeg: {
      functions: [{ id: "x:stancePosture", role: "support", weight: 0.35 }],
    },
  },
  targetProfiles: [
    {
      id: "default_melee",
      selectors: [
        { ids: ["head"], weight: 1 },
        { tags: ["core"], weight: 3 },
      ],
    },
    {
      id: "empty_profile",
      selectors: [
        { tags: ["does-not-exist"], weight: 1 },
      ],
    },
  ],
  coverageProfiles: [
    {
      id: "shield_small_default",
      selectors: [{ tags: ["shield-small-cover"] }],
    },
  ],
  contracts: {
    humanoidTargeting: {
      head: ["head"],
      torso: ["torso"],
      leftArm: ["leftArm"],
      rightArm: ["rightArm"],
      leftLeg: ["leftLeg"],
      rightLeg: ["rightLeg"],
    },
  },
} as const;

function makeModel() {
  const compiled = compileAnatomyDefinition(PLAN);
  expect(compiled.ok).toBe(true);
  return compiled.model!;
}

describe("anatomy helpers deeper coverage", () => {
  test("selector resolves tags", () => {
    const helpers = createAnatomyHelpers(makeModel());
    expect(helpers.selectors.selectSegmentIds({ tags: ["core"] })).toEqual(["torso"]);
  });

  test("selector resolves functionIds", () => {
    const helpers = createAnatomyHelpers(makeModel());
    const ids = helpers.selectors.selectSegmentIds({ functionIds: ["mobility"] });
    expect(ids).toContain("leftLeg");
    expect(ids).toContain("rightLeg");
  });

  test("selector resolves anyOf", () => {
    const helpers = createAnatomyHelpers(makeModel());
    const ids = helpers.selectors.selectSegmentIds({
      anyOf: [{ ids: ["head"] }, { ids: ["torso"] }],
    });
    expect(ids).toEqual(expect.arrayContaining(["head", "torso"]));
  });

  test("selector resolves allOf", () => {
    const helpers = createAnatomyHelpers(makeModel());
    const ids = helpers.selectors.selectSegmentIds({
      allOf: [{ tags: ["left"] }, { ids: ["leftArm", "rightArm"] }],
    });
    expect(ids).toEqual(["leftArm"]);
  });

  test("selector resolves exclude", () => {
    const helpers = createAnatomyHelpers(makeModel());
    const ids = helpers.selectors.selectSegmentIds({
      ids: ["leftArm", "rightArm"],
      exclude: { ids: ["rightArm"] },
    });
    expect(ids).toEqual(["leftArm"]);
  });

  test("coverage helper returns covered ids and membership", () => {
    const helpers = createAnatomyHelpers(makeModel());
    expect(helpers.coverage).toBeDefined();
    expect(helpers.coverage!.coveredSegmentIds("shield_small_default")).toEqual(
      expect.arrayContaining(["leftArm", "rightArm"]),
    );
    expect(helpers.coverage!.coversSegmentId("shield_small_default", "leftArm")).toBe(true);
    expect(helpers.coverage!.coversSegmentId("shield_small_default", "head")).toBe(false);
  });

  test("targeting helper samples from weighted profile", () => {
    const model = makeModel();
    const helpers = createAnatomyHelpers(model);
    expect(helpers.targeting).toBeDefined();
    const hit = helpers.targeting!.sampleSegmentId("default_melee", 0.95);
    expect(["head", "torso"]).toContain(hit);
  });

  test("sampleProfile falls back when selectors resolve empty", () => {
    const model = makeModel();
    const profile = model.targetProfiles.get("empty_profile")!;
    expect(sampleProfile(model, profile, 0.5)).toBe("rightLeg");
  });

  test("humanoidAliases resolves configured aliases", () => {
    const helpers = createAnatomyHelpers(makeModel());
    expect(helpers.humanoidAliases).toBeDefined();
    expect(helpers.humanoidAliases!.resolve("head")).toEqual(["head"]);
    expect(helpers.humanoidAliases!.resolve("leftArm")).toEqual(["leftArm"]);
  });

  test("summarizeFunctionalHealth aggregates structural internal and fracture", () => {
    const model = makeModel();
    const summary = summarizeFunctionalHealth(model, {
      byRegion: {
        leftLeg: { structuralDamage: 0.6, internalDamage: 0.2, fractured: true },
        rightLeg: { structuralDamage: 0.2, internalDamage: 0.4, fractured: false },
        leftArm: { structuralDamage: 0.5, internalDamage: 0.1, fractured: true },
        rightArm: { structuralDamage: 0.1, internalDamage: 0.3, fractured: false },
        head: { structuralDamage: 0.4, internalDamage: 0.8, fractured: false },
        torso: { structuralDamage: 0.3, internalDamage: 0.5, fractured: false },
      },
    });

    expect(summary.mobility.structural).toBe(Math.trunc((0.6 + 0.2) / 2));
    expect(summary.mobility.internal).toBe(Math.trunc((0.2 + 0.4) / 2));
    expect(summary.mobility.fracture).toBeGreaterThan(0);
    expect(summary.mobility.fracture).toBeLessThanOrEqual(20000);
    expect(summary.manipulation.fracture).toBeGreaterThan(0);
  });

  test("functionHealth returns 1 for missing function", () => {
    const model = makeModel();
    expect(functionHealth(model, { byRegion: {} }, "does-not-exist")).toBe(1);
  });

  test("segmentHealth penalizes all damage dimensions and fracture", () => {
    const value = segmentHealth({
      structuralDamage: 0.5,
      internalDamage: 0.4,
      surfaceDamage: 0.2,
      permanentDamage: 0.1,
      fractured: true,
    });
    expect(value).toBeLessThan(1);
    expect(value).toBeGreaterThanOrEqual(0);
  });

  test("functionalDamage helper disables function past threshold", () => {
    const helpers = createAnatomyHelpers(makeModel());
    expect(helpers.functionalDamage).toBeDefined();

    const injury = {
      byRegion: {
        leftLeg: { structuralDamage: 1, internalDamage: 1, fractured: true },
        rightLeg: { structuralDamage: 1, internalDamage: 1, fractured: true },
      },
    };

    expect(helpers.functionalDamage!.isFunctionDisabled(injury, "mobility", 0.7)).toBe(true);
  });
});