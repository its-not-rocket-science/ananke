// test/progression.test.ts — Phase 21: Character Progression

import { describe, it, expect } from "vitest";
import { q, SCALE, to } from "../src/units.js";
import {
  BASE_XP,
  GROWTH_FACTOR,
  DEFAULT_MILESTONE_DELTA,
  createProgressionState,
  milestoneThreshold,
  awardXP,
  advanceSkill,
  applyTrainingSession,
  stepAgeing,
  applyAgeingDelta,
  deriveSequelae,
  serialiseProgression,
  deserialiseProgression,
  type ProgressionState,
  type TrainingPlan,
  type TrainingSession,
  type AgeingDelta,
} from "../src/progression.js";
import { buildSkillMap, defaultSkillLevel } from "../src/sim/skills.js";
import { HUMANOID_PLAN } from "../src/sim/bodyplan.js";
import { defaultRegionInjury } from "../src/sim/injury.js";
import { generateIndividual } from "../src/generate.js";
import { HUMAN_BASE } from "../src/archetypes.js";
import type { RegionInjury } from "../src/sim/injury.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function freshState(): ProgressionState {
  return createProgressionState();
}

/** Human attributes at typical baseline values. */
function humanAttrs() {
  return generateIndividual(1, HUMAN_BASE);
}

/** Build a fractured region with high permanent damage. */
function fracturedRegion(): RegionInjury {
  const r = defaultRegionInjury();
  r.fractured        = true;
  r.permanentDamage  = q(0.25);
  r.structuralDamage = q(0.80);
  return r;
}

/** Build a region with high internal damage (nerve territory). */
function nerveDamagedRegion(): RegionInjury {
  const r = defaultRegionInjury();
  r.internalDamage = q(0.75);
  return r;
}

/** Build a region with only scar tissue (permanent surface damage, no fracture). */
function scarredRegion(): RegionInjury {
  const r = defaultRegionInjury();
  r.permanentDamage = q(0.10);
  r.surfaceDamage   = q(0.30);
  return r;
}

// ── Group: XP and milestones ──────────────────────────────────────────────────

describe("milestoneThreshold", () => {
  it("n=0 equals BASE_XP", () => {
    expect(milestoneThreshold(0)).toBe(BASE_XP);
  });

  it("n=1 equals round(BASE_XP × GROWTH_FACTOR)", () => {
    expect(milestoneThreshold(1)).toBe(Math.round(BASE_XP * GROWTH_FACTOR));
  });

  it("thresholds form a strictly increasing geometric sequence", () => {
    const t = [0, 1, 2, 3, 4].map(milestoneThreshold);
    for (let i = 1; i < t.length; i++) {
      expect(t[i]).toBeGreaterThan(t[i - 1]!);
    }
  });
});

describe("awardXP", () => {
  it("below threshold → no milestones triggered", () => {
    const state = freshState();
    const triggered = awardXP(state, "meleeCombat", BASE_XP - 1, 1);
    expect(triggered).toHaveLength(0);
    expect(state.milestones).toHaveLength(0);
  });

  it("crossing threshold exactly → one milestone triggered (milestone 0)", () => {
    const state = freshState();
    const triggered = awardXP(state, "meleeCombat", BASE_XP, 1);
    expect(triggered).toHaveLength(1);
    expect(triggered[0]!.milestone).toBe(0);
    expect(triggered[0]!.domain).toBe("meleeCombat");
  });

  it("large single award crosses multiple thresholds → multiple milestones", () => {
    const state = freshState();
    // Threshold 0 = 20, threshold 1 = 36, threshold 2 ≈ 65 — award 100 XP
    const triggered = awardXP(state, "meleeCombat", 100, 1);
    // Should hit milestone 0 (20), 1 (36), 2 (65) — not 3 (117 > 100)
    expect(triggered.length).toBeGreaterThanOrEqual(3);
    expect(triggered[0]!.milestone).toBe(0);
    expect(triggered[1]!.milestone).toBe(1);
    expect(triggered[2]!.milestone).toBe(2);
  });

  it("XP is cumulative across multiple calls", () => {
    const state = freshState();
    awardXP(state, "meleeCombat", 15, 1);
    const t2 = awardXP(state, "meleeCombat", 10, 2);  // total = 25 → crosses 20
    expect(t2).toHaveLength(1);
    expect(state.xp.entries.get("meleeCombat")).toBe(25);
  });

  it("XP tracked independently per domain", () => {
    const state = freshState();
    awardXP(state, "meleeCombat", BASE_XP + 5, 1);
    // rangedCombat should still be at 0
    expect(state.xp.entries.get("rangedCombat") ?? 0).toBe(0);
    const triggered = awardXP(state, "rangedCombat", 1, 2);
    expect(triggered).toHaveLength(0);
  });

  it("milestones recorded with correct tick", () => {
    const state = freshState();
    awardXP(state, "tactics", BASE_XP, 42);
    expect(state.milestones[0]!.tick).toBe(42);
  });

  it("default delta matches DEFAULT_MILESTONE_DELTA for domain", () => {
    const state = freshState();
    const triggered = awardXP(state, "medical", BASE_XP, 1);
    expect(triggered[0]!.delta).toEqual(DEFAULT_MILESTONE_DELTA["medical"]);
  });

  it("XP ledger serialises and deserialises cleanly (Map round-trip)", () => {
    const state = freshState();
    awardXP(state, "meleeCombat", 15, 1);
    awardXP(state, "rangedCombat", 22, 2);
    const json = serialiseProgression(state);
    const state2 = deserialiseProgression(json);
    expect(state2.xp.entries.get("meleeCombat")).toBe(15);
    expect(state2.xp.entries.get("rangedCombat")).toBe(22);
  });
});

// ── Group: advanceSkill ───────────────────────────────────────────────────────

describe("advanceSkill", () => {
  it("applies hitTimingOffset_s additively", () => {
    const base = buildSkillMap({ meleeCombat: { hitTimingOffset_s: 0 } });
    const out  = advanceSkill(base, "meleeCombat", { hitTimingOffset_s: -270 });
    expect(out.get("meleeCombat")!.hitTimingOffset_s).toBe(-270);
  });

  it("applies energyTransferMul additively starting from neutral", () => {
    const base = buildSkillMap({});
    const out  = advanceSkill(base, "meleeDefence", { energyTransferMul: 400 });
    const expected = defaultSkillLevel().energyTransferMul + 400;
    expect(out.get("meleeDefence")!.energyTransferMul).toBe(expected);
  });

  it("dispersionMul does not go below 100 (minimum floor)", () => {
    const base = buildSkillMap({ rangedCombat: { dispersionMul: q(1.0) } });
    // Apply a huge negative delta
    const out  = advanceSkill(base, "rangedCombat", { dispersionMul: -99999 });
    expect(out.get("rangedCombat")!.dispersionMul).toBe(100);
  });

  it("energyTransferMul can exceed q(1.0) — elite performance", () => {
    const base = buildSkillMap({});
    // Apply 10 milestones of +400
    let skills = base;
    for (let i = 0; i < 10; i++) {
      skills = advanceSkill(skills, "meleeDefence", { energyTransferMul: 400 });
    }
    expect(skills.get("meleeDefence")!.energyTransferMul).toBeGreaterThan(SCALE.Q);
  });

  it("original SkillMap is not mutated", () => {
    const base = buildSkillMap({ meleeCombat: { hitTimingOffset_s: 0 } });
    advanceSkill(base, "meleeCombat", { hitTimingOffset_s: -270 });
    expect(base.get("meleeCombat")!.hitTimingOffset_s).toBe(0);
  });

  it("100 combats integration: hitTimingOffset_s reduced by ~80 ms", () => {
    const state = freshState();
    // Award 1 XP per combat; 100 combats
    for (let i = 0; i < 100; i++) {
      awardXP(state, "meleeCombat", 1, i);
    }
    // milestones at 20, 36, 65 → 3 milestones triggered
    const meleeMilestones = state.milestones.filter(m => m.domain === "meleeCombat");
    expect(meleeMilestones.length).toBeGreaterThanOrEqual(3);

    // Apply all milestone deltas to a SkillMap
    let skills = buildSkillMap({});
    for (const m of meleeMilestones) {
      skills = advanceSkill(skills, "meleeCombat", m.delta);
    }
    // Reduction ≈ 3 × 270 = 810 SCALE.s ≈ 81ms. Expect at least 700 SCALE.s reduction.
    expect(skills.get("meleeCombat")!.hitTimingOffset_s).toBeLessThanOrEqual(-700);
  });
});

// ── Group: applyTrainingSession ────────────────────────────────────────────────

describe("applyTrainingSession", () => {
  const baseline = to.N(1840);    // peakForce_N baseline (184000 fp)
  const ceiling  = to.N(3680);    // 2× baseline ceiling (368000 fp)

  const plan: TrainingPlan = {
    sessions:    [],
    frequency_d: 3 / 7,   // 3×/week
    ceiling,
  };

  const moderateSession: TrainingSession = {
    attribute:   "peakForce_N",
    intensity_Q: q(0.50),
    duration_s:  3600,
  };

  it("returns value strictly greater than current when entity is deconditioned", () => {
    const out = applyTrainingSession(baseline, plan, moderateSession, 3);
    expect(out).toBeGreaterThan(baseline);
  });

  it("gain decreases as entity approaches ceiling", () => {
    const nearCeiling = Math.round(ceiling * 0.95);
    const deltaFar  = applyTrainingSession(baseline,    plan, moderateSession, 3) - baseline;
    const deltaNear = applyTrainingSession(nearCeiling, plan, moderateSession, 3) - nearCeiling;
    expect(deltaFar).toBeGreaterThan(deltaNear);
  });

  it("ceiling strictly enforced — value never exceeds ceiling", () => {
    const almostThere = ceiling - 1;
    const out = applyTrainingSession(almostThere, plan, moderateSession, 3);
    expect(out).toBeLessThanOrEqual(ceiling);
  });

  it("zero intensity → zero gain", () => {
    const zeroSession: TrainingSession = { ...moderateSession, intensity_Q: q(0) };
    const out = applyTrainingSession(baseline, plan, zeroSession, 3);
    expect(out).toBe(baseline);
  });

  it("already at ceiling → no change", () => {
    const out = applyTrainingSession(ceiling, plan, moderateSession, 3);
    expect(out).toBe(ceiling);
  });

  it("overtraining penalty applies above 5 sessions/week", () => {
    const normal     = applyTrainingSession(baseline, plan, moderateSession, 5);
    const overtrained = applyTrainingSession(baseline, plan, moderateSession, 8);
    expect(normal).toBeGreaterThan(overtrained);
  });

  it("moderate-intensity calibration: gain per session ≈ 3–8 N at 50% proximity", () => {
    const halfWay = Math.round((baseline + ceiling) / 2);  // 50% proximity
    const out = applyTrainingSession(halfWay, plan, moderateSession, 3);
    const delta_N = (out - halfWay) / SCALE.N;
    expect(delta_N).toBeGreaterThanOrEqual(3);
    expect(delta_N).toBeLessThanOrEqual(8);
  });

  it("is deterministic — same inputs always produce same output", () => {
    const out1 = applyTrainingSession(baseline, plan, moderateSession, 3);
    const out2 = applyTrainingSession(baseline, plan, moderateSession, 3);
    expect(out1).toBe(out2);
  });

  it("12-week programme (36 moderate sessions) raises peakForce_N by 150–300 N", () => {
    let value = baseline;
    for (let i = 0; i < 36; i++) {
      value = applyTrainingSession(value, plan, moderateSession, 3);
    }
    const gain_N = (value - baseline) / SCALE.N;
    expect(gain_N).toBeGreaterThanOrEqual(150);
    expect(gain_N).toBeLessThanOrEqual(300);
  });
});

// ── Group: stepAgeing ─────────────────────────────────────────────────────────

describe("stepAgeing", () => {
  it("age 34 → empty delta (below decline threshold)", () => {
    const attrs = humanAttrs();
    const delta = stepAgeing(attrs, 34);
    // No decline fields set
    expect(delta.peakForce_N).toBeUndefined();
    expect(delta.decisionLatency_s).toBeUndefined();
  });

  it("age 35 → performance decline delta is negative", () => {
    const attrs = humanAttrs();
    const delta = stepAgeing(attrs, 35);
    expect(delta.peakForce_N).toBeDefined();
    expect(delta.peakForce_N!).toBeLessThan(0);
    expect(delta.peakPower_W!).toBeLessThan(0);
  });

  it("age 44 → no decision latency increase (below cognitive threshold)", () => {
    const attrs = humanAttrs();
    const delta = stepAgeing(attrs, 44);
    expect(delta.decisionLatency_s).toBeUndefined();
  });

  it("age 45 → decision latency increases (+20 SCALE.s per year = +2 ms)", () => {
    const attrs = humanAttrs();
    const delta = stepAgeing(attrs, 45);
    expect(delta.decisionLatency_s).toBe(Math.round(2 * SCALE.s / 1000));
  });

  it("applyAgeingDelta mutates attrs correctly", () => {
    const attrs = humanAttrs();
    const before = attrs.performance.peakForce_N;
    const delta = stepAgeing(attrs, 40);
    applyAgeingDelta(attrs, delta);
    expect(attrs.performance.peakForce_N).toBeLessThan(before);
  });

  it("attributes never go below 0 (floor at zero)", () => {
    const attrs = humanAttrs();
    // Apply massive negative delta directly
    const extremeDelta: AgeingDelta = {
      peakForce_N: -attrs.performance.peakForce_N - 1000,
    };
    applyAgeingDelta(attrs, extremeDelta);
    expect(attrs.performance.peakForce_N).toBe(0);
  });

  it("integrating age 35→45 gives ~8–12% peakPower_W decline", () => {
    const attrs = humanAttrs();
    const before = attrs.performance.peakPower_W;
    for (let age = 35; age < 45; age++) {
      const delta = stepAgeing(attrs, age);
      applyAgeingDelta(attrs, delta);
    }
    const after = attrs.performance.peakPower_W;
    const pctDecline = (before - after) / before;
    expect(pctDecline).toBeGreaterThanOrEqual(0.08);
    expect(pctDecline).toBeLessThanOrEqual(0.12);
  });

  it("integrating from age 20 to 70 keeps all attributes above zero", () => {
    const attrs = humanAttrs();
    for (let age = 20; age < 70; age++) {
      const delta = stepAgeing(attrs, age);
      applyAgeingDelta(attrs, delta);
    }
    expect(attrs.performance.peakForce_N).toBeGreaterThan(0);
    expect(attrs.performance.peakPower_W).toBeGreaterThan(0);
    expect(attrs.performance.reserveEnergy_J).toBeGreaterThan(0);
  });
});

// ── Group: deriveSequelae ──────────────────────────────────────────────────────

describe("deriveSequelae", () => {
  it("healthy region → empty array", () => {
    const r = defaultRegionInjury();
    expect(deriveSequelae(r, HUMANOID_PLAN)).toHaveLength(0);
  });

  it("fractured region with permanentDamage ≥ q(0.20) → fracture_malunion", () => {
    const sequelae = deriveSequelae(fracturedRegion(), HUMANOID_PLAN);
    const types = sequelae.map(s => s.type);
    expect(types).toContain("fracture_malunion");
  });

  it("fracture_malunion penalty is 0.15 (−15% force)", () => {
    const sequelae = deriveSequelae(fracturedRegion(), HUMANOID_PLAN);
    const s = sequelae.find(s => s.type === "fracture_malunion")!;
    expect(s.penalty).toBeCloseTo(0.15);
  });

  it("fractured but low permanentDamage → no fracture_malunion", () => {
    const r = defaultRegionInjury();
    r.fractured       = true;
    r.permanentDamage = q(0.05);  // below q(0.20)
    const sequelae    = deriveSequelae(r, HUMANOID_PLAN);
    expect(sequelae.map(s => s.type)).not.toContain("fracture_malunion");
  });

  it("high internalDamage ≥ q(0.70) → nerve_damage", () => {
    const sequelae = deriveSequelae(nerveDamagedRegion(), HUMANOID_PLAN);
    expect(sequelae.map(s => s.type)).toContain("nerve_damage");
  });

  it("scarred region → scar_tissue sequela", () => {
    const sequelae = deriveSequelae(scarredRegion(), HUMANOID_PLAN);
    expect(sequelae.map(s => s.type)).toContain("scar_tissue");
  });

  it("heavily damaged region can produce multiple sequelae", () => {
    const r = fracturedRegion();
    r.internalDamage = q(0.75);   // also nerve damage
    r.surfaceDamage  = q(0.30);   // also scar
    const sequelae   = deriveSequelae(r, HUMANOID_PLAN);
    expect(sequelae.length).toBeGreaterThanOrEqual(2);
  });

  it("sequelae round-trip through ProgressionState serialisation", () => {
    const state = freshState();
    const seqs  = deriveSequelae(fracturedRegion(), HUMANOID_PLAN);
    for (const s of seqs) {
      state.sequelae.push({ region: "leftLeg", ...s });
    }
    const json   = serialiseProgression(state);
    const state2 = deserialiseProgression(json);
    expect(state2.sequelae).toHaveLength(state.sequelae.length);
    expect(state2.sequelae[0]!.type).toBe(state.sequelae[0]!.type);
  });
});

// ── Group: serialisation ───────────────────────────────────────────────────────

describe("serialisation", () => {
  it("serialiseProgression output is JSON.stringify-safe (no functions or undefined)", () => {
    const state = freshState();
    awardXP(state, "meleeCombat", 25, 1);
    const json = serialiseProgression(state);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("round-trip preserves milestones array", () => {
    const state = freshState();
    awardXP(state, "grappling", BASE_XP + 10, 5);
    const json   = serialiseProgression(state);
    const state2 = deserialiseProgression(json);
    expect(state2.milestones).toHaveLength(state.milestones.length);
    expect(state2.milestones[0]!.milestone).toBe(state.milestones[0]!.milestone);
  });

  it("round-trip preserves trainingLog", () => {
    const state = freshState();
    state.trainingLog.push({ tick: 10, attribute: "peakForce_N", delta: 600 });
    const state2 = deserialiseProgression(serialiseProgression(state));
    expect(state2.trainingLog[0]!.attribute).toBe("peakForce_N");
  });

  it("empty state round-trips cleanly", () => {
    const state  = freshState();
    const state2 = deserialiseProgression(serialiseProgression(state));
    expect(state2.xp.entries.size).toBe(0);
    expect(state2.milestones).toHaveLength(0);
  });
});

// ── Group: integration ────────────────────────────────────────────────────────

describe("integration", () => {
  it("progression state is valid JSON after full award+train cycle", () => {
    const state = freshState();
    awardXP(state, "meleeCombat", 50, 1);
    state.trainingLog.push({ tick: 1, attribute: "peakForce_N", delta: 600 });
    state.sequelae.push({ region: "torso", type: "scar_tissue", penalty: 0.05 });
    const json = serialiseProgression(state);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("awarding XP then advancing skill produces lower hitTimingOffset_s", () => {
    const state    = freshState();
    const triggers = awardXP(state, "meleeCombat", BASE_XP, 1);
    expect(triggers).toHaveLength(1);

    let skills = buildSkillMap({});
    skills     = advanceSkill(skills, "meleeCombat", triggers[0]!.delta);
    expect(skills.get("meleeCombat")!.hitTimingOffset_s).toBeLessThan(0);
  });

  it("training gain is recorded to trainingLog when caller adds it", () => {
    const state   = freshState();
    const before  = to.N(1840);
    const plan: TrainingPlan = {
      sessions:    [],
      frequency_d: 3 / 7,
      ceiling:     to.N(3680),
    };
    const session: TrainingSession = {
      attribute:   "peakForce_N",
      intensity_Q: q(0.50),
      duration_s:  3600,
    };
    const after = applyTrainingSession(before, plan, session, 3);
    const delta = after - before;
    state.trainingLog.push({ tick: 100, attribute: "peakForce_N", delta });
    expect(state.trainingLog[0]!.delta).toBeGreaterThan(0);
  });
});
