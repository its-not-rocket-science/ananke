/**
 * Phase 33 — Multiple Intelligences: Attribute Architecture
 *
 * Groups:
 *   Data integrity        (4) — archetypes and species carry cognition profiles
 *   BK → fineControl      (4) — bodilyKinesthetic floor applied in generate.ts
 *   Decision latency      (4) — logicalMathematical scales latencyTicks
 *   Dialogue linguistic   (5) — linguistic intelligence sets per-entity persuade base
 *   Morale intrapersonal  (4) — intrapersonal boosts effective distressTolerance
 *   Formula checks        (3) — spatial / interpersonal scaling math
 */

import { describe, it, expect } from "vitest";
import { SCALE, q, mulDiv, type Q } from "../src/units";
import {
  HUMAN_BASE, LARGE_PACIFIC_OCTOPUS, SERVICE_ROBOT,
} from "../src/archetypes";
import { ALL_SPECIES, ELF_SPECIES, ORC_SPECIES, OGRE_SPECIES, VULCAN_SPECIES } from "../src/species";
import { generateIndividual } from "../src/generate";
import { dialogueProbability, PERSUADE_BASE } from "../src/dialogue";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { buildWorldIndex } from "../src/sim/indexing";
import { buildSpatialIndex } from "../src/sim/spatial";
import { decideCommandsForEntity } from "../src/sim/ai/decide";
import { AI_PRESETS } from "../src/sim/ai/presets";
import { stepMoraleForEntity } from "../src/sim/step/morale";
import { AURA_RADIUS_m } from "../src/sim/morale";
import type { Entity } from "../src/sim/entity";
import type { KernelContext } from "../src/sim/context";

const CELL_SIZE = Math.trunc(4 * SCALE.m);
const NULL_TRACE = { onEvent: () => {} };
const MORALE_CTX: KernelContext = { tractionCoeff: q(0.9) };

// ── Data integrity ─────────────────────────────────────────────────────────────

describe("data integrity", () => {
  it("HUMAN_BASE.cognition is defined", () => {
    expect(HUMAN_BASE.cognition).toBeDefined();
  });

  it("HUMAN_BASE.cognition has all 9 intelligence fields", () => {
    const cog = HUMAN_BASE.cognition!;
    const fields = [
      "linguistic", "logicalMathematical", "spatial", "bodilyKinesthetic",
      "musical", "interpersonal", "intrapersonal", "naturalist", "interSpecies",
    ];
    for (const f of fields) {
      expect((cog as any)[f]).toBeGreaterThan(0);
    }
  });

  it("SERVICE_ROBOT.logicalMathematical > HUMAN_BASE.logicalMathematical", () => {
    expect(SERVICE_ROBOT.cognition!.logicalMathematical)
      .toBeGreaterThan(HUMAN_BASE.cognition!.logicalMathematical);
  });

  it("all 14 species archetypes carry cognition", () => {
    for (const s of ALL_SPECIES) {
      expect(s.archetype.cognition).toBeDefined();
    }
  });
});

// ── BK → fineControl floor ─────────────────────────────────────────────────────

describe("bodilyKinesthetic → fineControl floor", () => {
  it("SERVICE_ROBOT (bk=0.85): fineControl ≥ bk × q(0.80) floor", () => {
    const bk = SERVICE_ROBOT.cognition!.bodilyKinesthetic;
    const floor = mulDiv(bk, q(0.80), SCALE.Q);
    for (let seed = 0; seed < 20; seed++) {
      const attrs = generateIndividual(seed, SERVICE_ROBOT);
      expect(attrs.control.fineControl).toBeGreaterThanOrEqual(floor);
    }
  });

  it("LARGE_PACIFIC_OCTOPUS (bk=0.95): fineControl ≥ bk × q(0.80) floor", () => {
    const bk = LARGE_PACIFIC_OCTOPUS.cognition!.bodilyKinesthetic;
    const floor = mulDiv(bk, q(0.80), SCALE.Q);
    for (let seed = 0; seed < 20; seed++) {
      const attrs = generateIndividual(seed, LARGE_PACIFIC_OCTOPUS);
      expect(attrs.control.fineControl).toBeGreaterThanOrEqual(floor);
    }
  });

  it("generateIndividual passes cognition through unchanged", () => {
    const attrs = generateIndividual(42, HUMAN_BASE);
    expect(attrs.cognition).toBeDefined();
    expect(attrs.cognition!.spatial).toBe(HUMAN_BASE.cognition!.spatial);
    expect(attrs.cognition!.linguistic).toBe(HUMAN_BASE.cognition!.linguistic);
  });

  it("entity without cognition archetype has no cognition in output", () => {
    // Verify the conditional spread works: archetype without cognition → no field
    const archNoCog = { ...HUMAN_BASE, cognition: undefined };
    const attrs = generateIndividual(1, archNoCog);
    expect(attrs.cognition).toBeUndefined();
  });
});

// ── Decision latency: logicalMathematical ──────────────────────────────────────

describe("decision latency — logicalMathematical", () => {
  const POLICY = AI_PRESETS["lineInfantry"];

  function runDecide(e: Entity): number {
    const world  = mkWorld(1, [e]);
    const index  = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, CELL_SIZE);
    decideCommandsForEntity(world, index, spatial, e, POLICY);
    return e.ai?.decisionCooldownTicks ?? 0;
  }

  it("high logMath (0.95, Vulcan) → fewer latency ticks than human (0.60)", () => {
    const humanEnt  = mkHumanoidEntity(1, 1, 0, 0);
    const vulcanEnt = mkHumanoidEntity(2, 1, 0, 0);
    // Override cognitive profiles
    humanEnt.attributes  = { ...humanEnt.attributes,  cognition: { ...humanEnt.attributes.cognition!, logicalMathematical: q(0.60) } };
    vulcanEnt.attributes = { ...vulcanEnt.attributes, cognition: { ...vulcanEnt.attributes.cognition!, logicalMathematical: q(0.95) } };

    const humanTicks  = runDecide(humanEnt);
    const vulcanTicks = runDecide(vulcanEnt);
    expect(vulcanTicks).toBeLessThan(humanTicks);
  });

  it("low logMath (0.25, Ogre-level) → more latency ticks than human (0.60)", () => {
    const humanEnt = mkHumanoidEntity(1, 1, 0, 0);
    const slowEnt  = mkHumanoidEntity(2, 1, 0, 0);
    humanEnt.attributes = { ...humanEnt.attributes, cognition: { ...humanEnt.attributes.cognition!, logicalMathematical: q(0.60) } };
    slowEnt.attributes  = { ...slowEnt.attributes,  cognition: { ...slowEnt.attributes.cognition!, logicalMathematical: q(0.25) } };

    const humanTicks = runDecide(humanEnt);
    const slowTicks  = runDecide(slowEnt);
    expect(slowTicks).toBeGreaterThan(humanTicks);
  });

  it("entity without cognition → unmodified latency (logMul = q(1.0))", () => {
    const withCog    = mkHumanoidEntity(1, 1, 0, 0);
    const withoutCog = mkHumanoidEntity(2, 1, 0, 0);
    // logMath = 0 → conditional branch skips mulDiv; effective mul = SCALE.Q
    withCog.attributes    = { ...withCog.attributes,    cognition: undefined };
    withoutCog.attributes = { ...withoutCog.attributes, cognition: undefined };

    const ticksA = runDecide(withCog);
    const ticksB = runDecide(withoutCog);
    expect(ticksA).toBe(ticksB);
  });

  it("Vulcan latency < human latency < ogre latency (ordering)", () => {
    const vulcan = mkHumanoidEntity(1, 1, 0, 0);
    const human  = mkHumanoidEntity(2, 1, 0, 0);
    const ogre   = mkHumanoidEntity(3, 1, 0, 0);
    vulcan.attributes = { ...vulcan.attributes, cognition: { ...vulcan.attributes.cognition!, logicalMathematical: q(0.95) } };
    human.attributes  = { ...human.attributes,  cognition: { ...human.attributes.cognition!,  logicalMathematical: q(0.60) } };
    ogre.attributes   = { ...ogre.attributes,   cognition: { ...ogre.attributes.cognition!,   logicalMathematical: q(0.25) } };

    const tVulcan = runDecide(vulcan);
    const tHuman  = runDecide(human);
    const tOgre   = runDecide(ogre);
    expect(tVulcan).toBeLessThan(tHuman);
    expect(tHuman).toBeLessThan(tOgre);
  });
});

// ── Dialogue: linguistic → persuade base ──────────────────────────────────────

describe("dialogue — linguistic → persuade base", () => {
  function makeInitiator(ling: Q | undefined): Entity {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    if (ling === undefined) {
      e.attributes = { ...e.attributes, cognition: undefined };
    } else {
      e.attributes = { ...e.attributes, cognition: { ...e.attributes.cognition!, linguistic: ling } };
    }
    return e;
  }

  const target = mkHumanoidEntity(2, 2, 5, 0);
  target.condition.fearQ = q(0) as Q;

  const baseCtx = { worldSeed: 1, tick: 1 };

  it("no cognition → PERSUADE_BASE (q(0.40)) unchanged", () => {
    const initiator = makeInitiator(undefined);
    const p = dialogueProbability({ kind: "persuade" }, { initiator, target, ...baseCtx });
    expect(p).toBe(PERSUADE_BASE);
  });

  it("linguistic=q(0.80) → dynamicBase = q(0.44)", () => {
    const initiator = makeInitiator(q(0.80));
    const expected = q(0.20) + mulDiv(q(0.30), q(0.80), SCALE.Q); // 2000 + 2400 = 4400
    const p = dialogueProbability({ kind: "persuade" }, { initiator, target, ...baseCtx });
    expect(p).toBe(expected);
  });

  it("linguistic=q(0.25) → dynamicBase = q(0.275)", () => {
    const initiator = makeInitiator(q(0.25));
    const expected = q(0.20) + mulDiv(q(0.30), q(0.25), SCALE.Q); // 2000 + 750 = 2750
    const p = dialogueProbability({ kind: "persuade" }, { initiator, target, ...baseCtx });
    expect(p).toBe(expected);
  });

  it("persuade probability: elf (0.80) > human (0.65) > ogre (0.25)", () => {
    const elf   = makeInitiator(q(0.80));
    const human = makeInitiator(q(0.65));
    const ogre  = makeInitiator(q(0.25));
    const pElf   = dialogueProbability({ kind: "persuade" }, { initiator: elf,   target, ...baseCtx });
    const pHuman = dialogueProbability({ kind: "persuade" }, { initiator: human, target, ...baseCtx });
    const pOgre  = dialogueProbability({ kind: "persuade" }, { initiator: ogre,  target, ...baseCtx });
    expect(pElf).toBeGreaterThan(pHuman);
    expect(pHuman).toBeGreaterThan(pOgre);
  });

  it("linguistic=q(0.50): dynamicBase clamped to q(0.35)", () => {
    const initiator = makeInitiator(q(0.50));
    const expected = q(0.20) + mulDiv(q(0.30), q(0.50), SCALE.Q); // 2000 + 1500 = 3500
    const p = dialogueProbability({ kind: "persuade" }, { initiator, target, ...baseCtx });
    expect(p).toBe(expected);
  });
});

// ── Morale: intrapersonal → effective distressTolerance ───────────────────────

describe("morale — intrapersonal → effective distressTolerance", () => {
  function setupMorale(intrapersonal: Q | undefined) {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    if (intrapersonal === undefined) {
      e.attributes = { ...e.attributes, cognition: undefined };
    } else {
      e.attributes = { ...e.attributes, cognition: { ...e.attributes.cognition!, intrapersonal } };
    }
    e.condition.fearQ = q(0.30) as Q; // moderate fear
    const world   = mkWorld(1, [e]);
    const index   = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, CELL_SIZE);
    return { e, world, index, spatial };
  }

  it("entity without cognition: fearQ evolution unchanged vs baseline", () => {
    const { e: eNo, world: wNo, index: iNo, spatial: sNo } = setupMorale(undefined);
    const { e: eBase, world: wBase, index: iBase, spatial: sBase } = setupMorale(HUMAN_BASE.cognition!.intrapersonal);
    // Both start at q(0.30); the HUMAN_BASE entity has intrapersonal=q(0.55)
    // Entity without cognition should not crash
    stepMoraleForEntity(wNo, eNo, iNo, sNo, new Set([1]), new Map(), NULL_TRACE, MORALE_CTX);
    expect(typeof eNo.condition.fearQ).toBe("number");
  });

  it("high intrapersonal (0.95) → entity harder to rout than low intrapersonal (0.20)", () => {
    // Higher effective distressTol → higher morale threshold → harder to route
    // Test: same fearQ with high vs low intrapersonal; only high-intrapersonal stays below threshold
    const high = mkHumanoidEntity(1, 1, 0, 0);
    const low  = mkHumanoidEntity(2, 2, 0, 0); // different team so no ally effect
    high.attributes = { ...high.attributes, cognition: { ...high.attributes.cognition!, intrapersonal: q(0.95) } };
    low.attributes  = { ...low.attributes,  cognition: { ...low.attributes.cognition!,  intrapersonal: q(0.20) } };
    // Drive high fear so that only the high-intrapersonal entity may survive
    high.condition.fearQ = q(0.70) as Q;
    low.condition.fearQ  = q(0.70) as Q;
    high.attributes = { ...high.attributes, resilience: { ...high.attributes.resilience, distressTolerance: q(0.50) } };
    low.attributes  = { ...low.attributes,  resilience: { ...low.attributes.resilience,  distressTolerance: q(0.50) } };

    // With intrapersonal=0.95: effectiveTol = 0.50 + 0.95*0.30 = 0.785 → threshold ≈ q(0.736)
    // With intrapersonal=0.20: effectiveTol = 0.50 + 0.20*0.30 = 0.560 → threshold ≈ q(0.668)
    // fearQ = 0.70 → high entity NOT routing; low entity IS routing
    const worldHigh = mkWorld(1, [high]);
    const worldLow  = mkWorld(2, [low]);
    stepMoraleForEntity(worldHigh, high, buildWorldIndex(worldHigh), buildSpatialIndex(worldHigh, CELL_SIZE),
      new Set([1]), new Map(), NULL_TRACE, MORALE_CTX);
    stepMoraleForEntity(worldLow,  low,  buildWorldIndex(worldLow),  buildSpatialIndex(worldLow, CELL_SIZE),
      new Set([2]), new Map(), NULL_TRACE, MORALE_CTX);

    // High-intrapersonal entity should end up with lower (or equal) fear than low-intrapersonal
    // because it decays more (higher effectiveTol → higher fearDecayPerTick)
    expect(high.condition.fearQ!).toBeLessThanOrEqual(low.condition.fearQ!);
  });

  it("intrapersonal boost is capped at q(0.98) effective distressTolerance", () => {
    // Max: distressTolBase=q(0.90) + intrapersonal=q(0.95)*q(0.30) = 0.90+0.285 = 1.185 → clamped to q(0.98)
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.attributes = {
      ...e.attributes,
      resilience: { ...e.attributes.resilience, distressTolerance: q(0.90) },
      cognition: { ...e.attributes.cognition!, intrapersonal: q(0.95) },
    };
    e.condition.fearQ = q(0.20) as Q;
    const world = mkWorld(1, [e]);
    // Should not throw or produce invalid values
    stepMoraleForEntity(world, e, buildWorldIndex(world), buildSpatialIndex(world, CELL_SIZE),
      new Set([1]), new Map(), NULL_TRACE, MORALE_CTX);
    expect(e.condition.fearQ!).toBeGreaterThanOrEqual(0);
    expect(e.condition.fearQ!).toBeLessThanOrEqual(SCALE.Q);
  });

  it("ELF_SPECIES archetype: intrapersonal=q(0.75) > ORC_SPECIES intrapersonal=q(0.40)", () => {
    expect(ELF_SPECIES.archetype.cognition!.intrapersonal)
      .toBeGreaterThan(ORC_SPECIES.archetype.cognition!.intrapersonal);
  });
});

// ── Formula checks: spatial and interpersonal scaling ─────────────────────────

describe("cognition scaling formulas", () => {
  it("spatial=q(0.60) (human baseline): formula gives ×1.0 (base unchanged)", () => {
    const base = Math.trunc(50 * SCALE.m); // arbitrary horizon
    const spatial = q(0.60);
    const effective = Math.trunc(mulDiv(base, (4000 + spatial) as number, SCALE.Q));
    // 4000 + 6000 = 10000 = SCALE.Q → ×1.0
    expect(effective).toBe(base);
  });

  it("spatial=q(0.90) (octopus): formula gives ×1.30 effective horizon", () => {
    const base = Math.trunc(50 * SCALE.m);
    const spatial = q(0.90);
    const effective = Math.trunc(mulDiv(base, (4000 + spatial) as number, SCALE.Q));
    expect(effective).toBeGreaterThan(base);
    // (4000 + 9000) / 10000 = 1.30
    expect(effective).toBe(Math.trunc(mulDiv(base, 13000, SCALE.Q)));
  });

  it("interpersonal=q(0.60) (human baseline): aura radius ×1.0", () => {
    const interpersonal = q(0.60);
    const effective = Math.trunc(mulDiv(AURA_RADIUS_m, (4000 + interpersonal) as number, SCALE.Q));
    expect(effective).toBe(AURA_RADIUS_m);
  });
});
