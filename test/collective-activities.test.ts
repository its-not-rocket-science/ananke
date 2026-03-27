// test/collective-activities.test.ts — Phase 55: Collective Non-Combat Activities

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  createCollectiveProject,
  contributeToCollectiveProject,
  isProjectComplete,
  deriveEngineeringCompetence,
  stepRitual,
  planCaravanRoute,
  DEFAULT_ENGINEERING_COMPETENCE,
  RITUAL_DURATION_s,
  RITUAL_MAX_BONUS,
  RITUAL_FEAR_REDUCTION_FRAC,
  CARAVAN_RATIONS_PER_PERSON_PER_DAY,
  type CaravanWaypoint,
} from "../src/collective-activities.js";
import { mkHumanoidEntity } from "../src/sim/testing.js";
import { v3 } from "../src/sim/vec3.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Entity with known cognitive profile for deterministic test values. */
function mkCognitiveEntity(
  id: number,
  logical: number,
  bodily: number,
  intrapersonal: number,
  musical: number,
  interpersonal: number,
) {
  const e = mkHumanoidEntity(id, 1, 0, 0);
  e.attributes = {
    ...e.attributes,
    cognition: {
      linguistic:          q(0.60),
      logicalMathematical: logical,
      spatial:             q(0.60),
      bodilyKinesthetic:   bodily,
      musical,
      interpersonal,
      intrapersonal,
      naturalist:          q(0.50),
      interSpecies:        q(0.35),
    },
  };
  return e;
}

/** Entity with NO cognition profile (returns DEFAULT_ENGINEERING_COMPETENCE). */
function mkNoCognitionEntity(id: number) {
  const e = mkHumanoidEntity(id, 1, 0, 0);
  e.attributes = { ...e.attributes, cognition: undefined };
  return e;
}

/** Simple two-waypoint caravan route with a known distance of 1 000 m. */
function mkRoute1km(): CaravanWaypoint[] {
  return [
    { positionId: "A", position_m: v3(0, 0, 0),                          restHours: 0 },
    { positionId: "B", position_m: v3(10_000_000, 0, 0), restHours: 0 }, // 10 000 000 SCALE.m = 1 000 m
  ];
}

// ── 1. Siege Engineering ───────────────────────────────────────────────────────

describe("createCollectiveProject", () => {
  it("returns project with zero progress and empty contributors", () => {
    const p = createCollectiveProject("fort1", "field_fortification", "North Barricade", 100);
    expect(p.projectId).toBe("fort1");
    expect(p.kind).toBe("field_fortification");
    expect(p.progress_Q).toBe(q(0));
    expect(p.completionThreshold_Q).toBe(SCALE.Q);
    expect(p.requiredWorkHours).toBe(100);
    expect(p.contributors).toHaveLength(0);
    expect(p.completedAtTick).toBeUndefined();
  });
});

describe("deriveEngineeringCompetence", () => {
  it("averages logicalMathematical and bodilyKinesthetic", () => {
    const e = mkCognitiveEntity(1, q(0.80), q(0.60), q(0.50), q(0.50), q(0.50));
    // (8000 + 6000) / 2 = 7000
    expect(deriveEngineeringCompetence(e)).toBe(Math.round((q(0.80) + q(0.60)) / 2));
  });

  it("entity without cognition returns DEFAULT_ENGINEERING_COMPETENCE", () => {
    const e = mkNoCognitionEntity(2);
    expect(deriveEngineeringCompetence(e)).toBe(DEFAULT_ENGINEERING_COMPETENCE);
  });
});

describe("contributeToCollectiveProject", () => {
  it("advances progress proportional to competence × hours / required", () => {
    const proj = createCollectiveProject("r1", "siege_ramp", "Ramp Alpha", 100);
    const e = mkCognitiveEntity(1, q(0.80), q(0.80), q(0.50), q(0.50), q(0.50));
    // competence = (8000+8000)/2 = 8000; delta = round(8000 * 10 / 100) = 800
    contributeToCollectiveProject(proj, e, 10, 1);
    expect(proj.progress_Q).toBe(800);
  });

  it("higher competence entity contributes more than lower competence", () => {
    const projHigh = createCollectiveProject("h", "field_fortification", "H", 100);
    const projLow  = createCollectiveProject("l", "field_fortification", "L", 100);
    const high = mkCognitiveEntity(1, q(0.90), q(0.70), q(0.50), q(0.50), q(0.50));
    const low  = mkCognitiveEntity(2, q(0.20), q(0.20), q(0.50), q(0.50), q(0.50));
    contributeToCollectiveProject(projHigh, high, 10, 1);
    contributeToCollectiveProject(projLow,  low,  10, 1);
    expect(projHigh.progress_Q).toBeGreaterThan(projLow.progress_Q);
  });

  it("multiple contributors accumulate progress", () => {
    const proj = createCollectiveProject("m", "field_bridge", "Bridge", 100);
    const e1 = mkCognitiveEntity(1, q(0.60), q(0.60), q(0.50), q(0.50), q(0.50));
    const e2 = mkCognitiveEntity(2, q(0.60), q(0.60), q(0.50), q(0.50), q(0.50));
    contributeToCollectiveProject(proj, e1, 50, 1);
    const afterFirst = proj.progress_Q;
    contributeToCollectiveProject(proj, e2, 50, 2);
    expect(proj.progress_Q).toBeGreaterThan(afterFirst);
    expect(proj.contributors).toHaveLength(2);
  });

  it("zero hoursWorked does not change progress and does not add contributor", () => {
    const proj = createCollectiveProject("z", "field_fortification", "Z", 100);
    const e = mkCognitiveEntity(1, q(0.60), q(0.60), q(0.50), q(0.50), q(0.50));
    const delta = contributeToCollectiveProject(proj, e, 0, 1);
    expect(delta).toBe(q(0));
    expect(proj.progress_Q).toBe(q(0));
    expect(proj.contributors).toHaveLength(0);
  });

  it("progress clamped at completionThreshold_Q — cannot exceed 100 %", () => {
    const proj = createCollectiveProject("c", "trade_post", "Post", 10);
    const e = mkCognitiveEntity(1, q(1.0), q(1.0), q(0.50), q(0.50), q(0.50));
    // competence = SCALE.Q; delta = round(10000 * 100 / 10) = 100 000 → clamped to SCALE.Q
    contributeToCollectiveProject(proj, e, 100, 1);
    expect(proj.progress_Q).toBe(proj.completionThreshold_Q);
  });

  it("completedAtTick is set when threshold is first crossed", () => {
    const proj = createCollectiveProject("comp", "field_fortification", "Fort", 10);
    const e = mkCognitiveEntity(1, q(1.0), q(1.0), q(0.50), q(0.50), q(0.50));
    // competence = SCALE.Q; 10 hours at q(1.0) → delta = round(10000*10/10) = 10000 = SCALE.Q
    contributeToCollectiveProject(proj, e, 10, 42);
    expect(proj.completedAtTick).toBe(42);
  });

  it("completedAtTick is NOT overwritten by subsequent contributions", () => {
    const proj = createCollectiveProject("comp2", "field_fortification", "Fort2", 10);
    const e = mkCognitiveEntity(1, q(1.0), q(1.0), q(0.50), q(0.50), q(0.50));
    contributeToCollectiveProject(proj, e, 10, 42);
    contributeToCollectiveProject(proj, e, 10, 99); // already complete
    expect(proj.completedAtTick).toBe(42);
  });
});

describe("isProjectComplete", () => {
  it("returns false for a new project", () => {
    const proj = createCollectiveProject("x", "siege_ramp", "X", 50);
    expect(isProjectComplete(proj)).toBe(false);
  });

  it("returns true when progress reaches completionThreshold_Q", () => {
    const proj = createCollectiveProject("y", "siege_ramp", "Y", 10);
    const e = mkCognitiveEntity(1, q(1.0), q(1.0), q(0.50), q(0.50), q(0.50));
    contributeToCollectiveProject(proj, e, 10, 1);
    expect(isProjectComplete(proj)).toBe(true);
  });
});

// ── 2. Ritual & Ceremony ───────────────────────────────────────────────────────

describe("stepRitual", () => {
  it("empty participant list returns all zeros", () => {
    const r = stepRitual([], RITUAL_DURATION_s);
    expect(r.moraleBonus_Q).toBe(q(0));
    expect(r.fearReduction_Q).toBe(q(0));
    expect(r.participantCount).toBe(0);
  });

  it("zero elapsed time returns zero bonus regardless of participants", () => {
    const e = mkCognitiveEntity(1, q(0.60), q(0.60), q(0.80), q(0.80), q(0.60));
    const r = stepRitual([e], 0);
    expect(r.moraleBonus_Q).toBe(q(0));
    expect(r.fearReduction_Q).toBe(q(0));
  });

  it("single capable participant for full duration produces moraleBonus_Q > 0", () => {
    // HUMAN_BASE: intrapersonal=q(0.55), musical=q(0.50)
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const r = stepRitual([e], RITUAL_DURATION_s);
    expect(r.moraleBonus_Q).toBeGreaterThan(0);
    expect(r.participantCount).toBe(1);
  });

  it("moraleBonus_Q never exceeds RITUAL_MAX_BONUS", () => {
    const e = mkCognitiveEntity(1, q(0.60), q(0.60), q(1.0), q(1.0), q(0.60));
    const r = stepRitual([e], RITUAL_DURATION_s * 10); // very long ritual
    expect(r.moraleBonus_Q).toBeLessThanOrEqual(RITUAL_MAX_BONUS);
  });

  it("four participants produce higher bonus than one (same cognition, low values)", () => {
    // Use low cognition so the bonus doesn't immediately hit the cap.
    const makeE = (id: number) =>
      mkCognitiveEntity(id, q(0.60), q(0.60), q(0.10), q(0.10), q(0.60));
    const solo = stepRitual([makeE(1)], RITUAL_DURATION_s);
    const quad = stepRitual([makeE(1), makeE(2), makeE(3), makeE(4)], RITUAL_DURATION_s);
    expect(quad.moraleBonus_Q).toBeGreaterThan(solo.moraleBonus_Q);
  });

  it("fearReduction_Q ≤ moraleBonus_Q always", () => {
    const e = mkCognitiveEntity(1, q(0.60), q(0.60), q(0.70), q(0.70), q(0.60));
    const r = stepRitual([e], RITUAL_DURATION_s);
    expect(r.fearReduction_Q).toBeLessThanOrEqual(r.moraleBonus_Q);
  });

  it("fearReduction_Q equals moraleBonus_Q × RITUAL_FEAR_REDUCTION_FRAC / SCALE.Q", () => {
    const e = mkCognitiveEntity(1, q(0.60), q(0.60), q(0.70), q(0.70), q(0.60));
    const r = stepRitual([e], RITUAL_DURATION_s);
    const expected = Math.round(r.moraleBonus_Q * RITUAL_FEAR_REDUCTION_FRAC / SCALE.Q);
    expect(r.fearReduction_Q).toBe(expected);
  });

  it("participants with zero cognition produce zero bonus", () => {
    const e = mkCognitiveEntity(1, q(0.60), q(0.60), 0, 0, q(0.60));
    const r = stepRitual([e], RITUAL_DURATION_s);
    expect(r.moraleBonus_Q).toBe(q(0));
  });

  it("half-duration ritual gives roughly half the bonus of full-duration (within 10 %)", () => {
    // Low cognition so we stay below the cap and can compare magnitudes.
    const makeE = (id: number) =>
      mkCognitiveEntity(id, q(0.60), q(0.60), q(0.10), q(0.10), q(0.60));
    const full = stepRitual([makeE(1)], RITUAL_DURATION_s);
    const half = stepRitual([makeE(1)], RITUAL_DURATION_s / 2);
    // half should be ~50 % of full (timeFrac scales linearly)
    expect(half.moraleBonus_Q).toBeGreaterThan(0);
    expect(half.moraleBonus_Q).toBeLessThan(full.moraleBonus_Q);
  });

  it("participantCount reflects actual participants", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 1, 0, 0);
    const e3 = mkHumanoidEntity(3, 1, 0, 0);
    const r = stepRitual([e1, e2, e3], RITUAL_DURATION_s);
    expect(r.participantCount).toBe(3);
  });
});

// ── 3. Trade Caravan Logistics ─────────────────────────────────────────────────

describe("planCaravanRoute", () => {
  it("empty waypoints / no participants returns zero travel time and full sufficiency", () => {
    const plan = planCaravanRoute([], [], new Map());
    expect(plan.estimatedTravelSeconds).toBe(0);
    expect(plan.supplySufficiency_Q).toBe(SCALE.Q);
    expect(plan.participantIds).toHaveLength(0);
  });

  it("two-waypoint 1 km route produces positive travel time", () => {
    const plan = planCaravanRoute(mkRoute1km(), [], new Map());
    expect(plan.estimatedTravelSeconds).toBeGreaterThan(0);
  });

  it("planId is deterministic from waypoint positionIds", () => {
    const route = mkRoute1km();
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const p1 = planCaravanRoute(route, [e], new Map([["bread", 100]]));
    const p2 = planCaravanRoute(route, [e], new Map([["bread", 100]]));
    expect(p1.planId).toBe(p2.planId);
    expect(p1.planId).toContain("A");
    expect(p1.planId).toContain("B");
  });

  it("sufficient inventory yields supplySufficiency_Q = SCALE.Q", () => {
    // 1 km at walking pace = ~104 s → ~0.0012 days; 1 participant × 0.0012 × 3 = 0.0036 rations
    // 10 rations is way more than enough.
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const plan = planCaravanRoute(mkRoute1km(), [e], new Map([["ration", 10]]));
    expect(plan.supplySufficiency_Q).toBe(SCALE.Q);
  });

  it("empty inventory yields supplySufficiency_Q = 0 when travel time > 0", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const plan = planCaravanRoute(mkRoute1km(), [e], new Map());
    expect(plan.supplySufficiency_Q).toBe(q(0));
  });

  it("more participants with the same inventory yields lower supply sufficiency", () => {
    // 70 km route: baseTravelSeconds ≈ 58 333 s.
    // Even at HUMAN_BASE routeQuality (speedFactor ≈ 9200), travel ≈ 63 400 s = 0.73 days.
    // 3 participants × 0.73 × 3 ≈ 6.6 rations needed > 5 rations in inventory.
    // 1 participant needs ~2.2 rations → solo sufficiency clamped to SCALE.Q.
    const longRoute: CaravanWaypoint[] = [
      { positionId: "X", position_m: v3(0, 0, 0),              restHours: 0 },
      { positionId: "Y", position_m: v3(700_000_000, 0, 0),    restHours: 0 },
    ];
    const inv = new Map([["ration", 5]]);
    const solo = planCaravanRoute(longRoute, [mkHumanoidEntity(1, 1, 0, 0)], inv);
    const squad = planCaravanRoute(
      longRoute,
      [mkHumanoidEntity(1, 1, 0, 0), mkHumanoidEntity(2, 1, 0, 0), mkHumanoidEntity(3, 1, 0, 0)],
      inv,
    );
    expect(squad.supplySufficiency_Q).toBeLessThan(solo.supplySufficiency_Q);
  });

  it("routeQuality_Q matches best participant logicalMathematical", () => {
    const route = mkRoute1km();
    const good = mkCognitiveEntity(1, q(0.90), q(0.60), q(0.50), q(0.50), q(0.60));
    const poor = mkCognitiveEntity(2, q(0.30), q(0.60), q(0.50), q(0.50), q(0.60));
    const planGood = planCaravanRoute(route, [good], new Map());
    const planPoor = planCaravanRoute(route, [poor], new Map());
    expect(planGood.routeQuality_Q).toBeGreaterThan(planPoor.routeQuality_Q);
  });

  it("better routeQuality shortens estimated travel time", () => {
    const route = mkRoute1km();
    const expert   = mkCognitiveEntity(1, q(1.0), q(0.60), q(0.50), q(0.50), q(0.60));
    const novice   = mkCognitiveEntity(2, q(0.0), q(0.60), q(0.50), q(0.50), q(0.60));
    const planExp  = planCaravanRoute(route, [expert], new Map());
    const planNov  = planCaravanRoute(route, [novice], new Map());
    expect(planExp.estimatedTravelSeconds).toBeLessThan(planNov.estimatedTravelSeconds);
  });

  it("negotiationBonus_Q matches best participant interpersonal", () => {
    const route = mkRoute1km();
    const diplomat = mkCognitiveEntity(1, q(0.60), q(0.60), q(0.50), q(0.50), q(0.90));
    const recluse  = mkCognitiveEntity(2, q(0.60), q(0.60), q(0.50), q(0.50), q(0.20));
    const planD = planCaravanRoute(route, [diplomat], new Map());
    const planR = planCaravanRoute(route, [recluse],  new Map());
    expect(planD.negotiationBonus_Q).toBeGreaterThan(planR.negotiationBonus_Q);
  });

  it("no participants yields routeQuality_Q = q(0) and negotiationBonus_Q = q(0)", () => {
    const plan = planCaravanRoute(mkRoute1km(), [], new Map());
    expect(plan.routeQuality_Q).toBe(q(0));
    expect(plan.negotiationBonus_Q).toBe(q(0));
  });

  it("rest stops add to estimatedTotalSeconds but not estimatedTravelSeconds", () => {
    const route: CaravanWaypoint[] = [
      { positionId: "A", position_m: v3(0, 0, 0),        restHours: 0 },
      { positionId: "B", position_m: v3(10_000_000, 0, 0), restHours: 2 },
    ];
    const plan = planCaravanRoute(route, [], new Map());
    expect(plan.estimatedTotalSeconds).toBe(plan.estimatedTravelSeconds + 2 * 3600);
  });

  it("participantIds reflects input entity IDs", () => {
    const e1 = mkHumanoidEntity(10, 1, 0, 0);
    const e2 = mkHumanoidEntity(20, 1, 0, 0);
    const plan = planCaravanRoute(mkRoute1km(), [e1, e2], new Map());
    expect(plan.participantIds).toEqual([10, 20]);
  });

  it("CARAVAN_RATIONS_PER_PERSON_PER_DAY is positive integer", () => {
    expect(CARAVAN_RATIONS_PER_PERSON_PER_DAY).toBeGreaterThan(0);
    expect(Number.isInteger(CARAVAN_RATIONS_PER_PERSON_PER_DAY)).toBe(true);
  });
});
