// test/sleep.test.ts — Phase 58: Sleep & Circadian Rhythm

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  OPTIMAL_SLEEP_S,
  OPTIMAL_AWAKE_S,
  IMPAIR_THRESHOLD_S,
  MAX_SLEEP_DEBT_S,
  LIGHT_PHASE_S,
  DEEP_PHASE_S,
  REM_PHASE_S,
  circadianAlertness,
  deriveSleepDeprivationMuls,
  stepSleep,
  applySleepToAttributes,
  entitySleepDebt_h,
  type SleepState,
} from "../src/sim/sleep.js";
import { mkHumanoidEntity } from "../src/sim/testing.js";
import { generateIndividual } from "../src/generate.js";
import { HUMAN_BASE } from "../src/archetypes.js";

// Helper: create a SleepState with given awakeSeconds and optional sleepDebt_s.
function mkState(awakeSeconds: number, sleepDebt_s = 0): SleepState {
  return { phase: "awake", phaseSeconds: awakeSeconds, sleepDebt_s, awakeSeconds };
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("OPTIMAL_SLEEP_S = 8 * 3600", () => {
    expect(OPTIMAL_SLEEP_S).toBe(8 * 3600);
  });

  it("OPTIMAL_AWAKE_S = 16 * 3600", () => {
    expect(OPTIMAL_AWAKE_S).toBe(16 * 3600);
  });

  it("MAX_SLEEP_DEBT_S = 72 * 3600", () => {
    expect(MAX_SLEEP_DEBT_S).toBe(72 * 3600);
  });

  it("IMPAIR_THRESHOLD_S = 17 * 3600", () => {
    expect(IMPAIR_THRESHOLD_S).toBe(17 * 3600);
  });

  it("one sleep cycle = 90 minutes (light + deep + rem)", () => {
    expect(LIGHT_PHASE_S + DEEP_PHASE_S + REM_PHASE_S).toBe(90 * 60);
  });
});

// ── circadianAlertness ────────────────────────────────────────────────────────

describe("circadianAlertness", () => {
  it("nadir at 03:00 — alertness < q(0.40)", () => {
    expect(circadianAlertness(3)).toBeLessThan(q(0.40));
  });

  it("morning peak at 10:00 — alertness >= q(0.90)", () => {
    expect(circadianAlertness(10)).toBeGreaterThanOrEqual(q(0.90));
  });

  it("afternoon peak at 17:00 — alertness >= q(0.98)", () => {
    expect(circadianAlertness(17)).toBeGreaterThanOrEqual(q(0.98));
  });

  it("nadir (03:00) < morning peak (10:00)", () => {
    expect(circadianAlertness(3)).toBeLessThan(circadianAlertness(10));
  });

  it("hour 24 wraps to same value as hour 0", () => {
    expect(circadianAlertness(24)).toBe(circadianAlertness(0));
  });
});

// ── deriveSleepDeprivationMuls ────────────────────────────────────────────────

describe("deriveSleepDeprivationMuls", () => {
  it("fully rested (0 h awake, 0 debt): cognitionFluid_Q = q(1.0)", () => {
    const m = deriveSleepDeprivationMuls(mkState(0, 0));
    expect(m.cognitionFluid_Q).toBe(SCALE.Q);
  });

  it("fully rested: reactionTime_Q = q(1.0) — no slowdown", () => {
    const m = deriveSleepDeprivationMuls(mkState(0, 0));
    expect(m.reactionTime_Q).toBe(SCALE.Q);
  });

  it("exactly at threshold (17 h awake): no impairment (threshold is exclusive)", () => {
    const m = deriveSleepDeprivationMuls(mkState(IMPAIR_THRESHOLD_S, 0));
    expect(m.cognitionFluid_Q).toBe(SCALE.Q);
  });

  it("24 h awake: cognitionFluid_Q < q(0.95) — mild impairment", () => {
    const m = deriveSleepDeprivationMuls(mkState(24 * 3600, 0));
    expect(m.cognitionFluid_Q).toBeLessThan(q(0.95));
  });

  it("24 h awake: reactionTime_Q > q(1.05) — reaction slows", () => {
    const m = deriveSleepDeprivationMuls(mkState(24 * 3600, 0));
    expect(m.reactionTime_Q).toBeGreaterThan(q(1.05));
  });

  it("48 h awake: cognitionFluid_Q < q(0.80) — severe impairment", () => {
    const m = deriveSleepDeprivationMuls(mkState(48 * 3600, 0));
    expect(m.cognitionFluid_Q).toBeLessThan(q(0.80));
  });

  it("72 h awake (max): cognitionFluid_Q <= q(0.60) — extreme", () => {
    const m = deriveSleepDeprivationMuls(mkState(72 * 3600, 0));
    expect(m.cognitionFluid_Q).toBeLessThanOrEqual(q(0.60));
  });

  it("sleepDebt alone (awakeSeconds=0, debt > threshold): impairment present", () => {
    // Entity slept recently (awakeSeconds=0) but carries 20h of prior debt
    const m = deriveSleepDeprivationMuls(mkState(0, 20 * 3600));
    expect(m.reactionTime_Q).toBeGreaterThan(SCALE.Q);
  });

  it("more awake time → more impairment (monotone)", () => {
    const m24 = deriveSleepDeprivationMuls(mkState(24 * 3600));
    const m36 = deriveSleepDeprivationMuls(mkState(36 * 3600));
    expect(m36.cognitionFluid_Q).toBeLessThan(m24.cognitionFluid_Q);
    expect(m36.reactionTime_Q).toBeGreaterThan(m24.reactionTime_Q);
  });
});

// ── applySleepToAttributes ────────────────────────────────────────────────────

describe("applySleepToAttributes", () => {
  const base = generateIndividual(1, HUMAN_BASE);

  it("fully rested: reactionTime_s unchanged from base", () => {
    const result = applySleepToAttributes(base, mkState(0, 0));
    expect(result.control.reactionTime_s).toBe(base.control.reactionTime_s);
  });

  it("24 h awake: reactionTime_s increases (slower)", () => {
    const rested = applySleepToAttributes(base, mkState(0, 0)).control.reactionTime_s;
    const tired  = applySleepToAttributes(base, mkState(24 * 3600, 0)).control.reactionTime_s;
    expect(tired).toBeGreaterThan(rested);
  });

  it("24 h awake: logicalMathematical decreases", () => {
    const rested = applySleepToAttributes(base, mkState(0, 0)).cognition!.logicalMathematical;
    const tired  = applySleepToAttributes(base, mkState(24 * 3600, 0)).cognition!.logicalMathematical;
    expect(tired).toBeLessThan(rested);
  });

  it("24 h awake: stability decreases", () => {
    const rested = applySleepToAttributes(base, mkState(0, 0)).control.stability;
    const tired  = applySleepToAttributes(base, mkState(24 * 3600, 0)).control.stability;
    expect(tired).toBeLessThan(rested);
  });

  it("does not mutate the original base attributes", () => {
    const origReact = base.control.reactionTime_s;
    applySleepToAttributes(base, mkState(48 * 3600, 0));
    expect(base.control.reactionTime_s).toBe(origReact);
  });

  it("entity without cognition does not crash — cognition remains undefined", () => {
    const noCog = { ...base, cognition: undefined };
    const result = applySleepToAttributes(noCog, mkState(24 * 3600, 0));
    expect(result.cognition).toBeUndefined();
  });
});

// ── stepSleep — awake mode ────────────────────────────────────────────────────

describe("stepSleep — awake mode", () => {
  it("initializes sleep state if absent", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    expect(e.sleep).toBeUndefined();
    stepSleep(e, 3600, false);
    expect(e.sleep).toBeDefined();
  });

  it("awakeSeconds accumulates across multiple steps", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    stepSleep(e, 3600, false);
    stepSleep(e, 3600, false);
    expect(e.sleep!.awakeSeconds).toBe(7200);
  });

  it("sleepDebt_s accumulates when awake beyond OPTIMAL_AWAKE_S", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    stepSleep(e, 20 * 3600, false);
    expect(e.sleep!.sleepDebt_s).toBeGreaterThan(0);
  });

  it("sleepDebt_s does not accumulate within OPTIMAL_AWAKE_S (16 h)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    stepSleep(e, 8 * 3600, false);
    expect(e.sleep!.sleepDebt_s).toBe(0);
  });

  it("phase remains 'awake' when not sleeping", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    stepSleep(e, 3600, false);
    expect(e.sleep!.phase).toBe("awake");
  });

  it("sleepDebt_s capped at MAX_SLEEP_DEBT_S", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    stepSleep(e, 200 * 3600, false);
    expect(e.sleep!.sleepDebt_s).toBe(MAX_SLEEP_DEBT_S);
  });
});

// ── stepSleep — sleep mode ────────────────────────────────────────────────────

describe("stepSleep — sleep mode", () => {
  it("phase transitions light → deep after LIGHT_PHASE_S seconds", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    stepSleep(e, 1, false);                        // ensure sleep state is initialised
    stepSleep(e, LIGHT_PHASE_S + 1, true);         // sleep through the full light phase
    expect(e.sleep!.phase).toBe("deep");
  });

  it("phase transitions deep → rem after DEEP_PHASE_S seconds", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    stepSleep(e, 1, false);
    stepSleep(e, LIGHT_PHASE_S + DEEP_PHASE_S + 1, true);
    expect(e.sleep!.phase).toBe("rem");
  });

  it("phase cycles rem → light after one full 90-minute cycle", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    stepSleep(e, 1, false);
    stepSleep(e, LIGHT_PHASE_S + DEEP_PHASE_S + REM_PHASE_S + 1, true);
    expect(e.sleep!.phase).toBe("light");
  });

  it("awakeSeconds resets to 0 on sleep onset", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    stepSleep(e, 8 * 3600, false);
    expect(e.sleep!.awakeSeconds).toBe(8 * 3600);
    stepSleep(e, 1, true);
    expect(e.sleep!.awakeSeconds).toBe(0);
  });

  it("sleepDebt_s decreases while sleeping (cannot go below 0)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    stepSleep(e, 20 * 3600, false);   // accrue some debt
    const debt0 = e.sleep!.sleepDebt_s;
    expect(debt0).toBeGreaterThan(0);
    stepSleep(e, 8 * 3600, true);     // sleep 8 h — repays debt
    expect(e.sleep!.sleepDebt_s).toBeLessThan(debt0);
    expect(e.sleep!.sleepDebt_s).toBeGreaterThanOrEqual(0);
  });
});

// ── entitySleepDebt_h ─────────────────────────────────────────────────────────

describe("entitySleepDebt_h", () => {
  it("returns 0 for entity without sleep state", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    expect(entitySleepDebt_h(e)).toBe(0);
  });

  it("matches sleepDebt_s / 3600", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    stepSleep(e, 20 * 3600, false);
    expect(entitySleepDebt_h(e)).toBe(e.sleep!.sleepDebt_s / 3600);
  });

  it("returns non-zero after accruing debt beyond OPTIMAL_AWAKE_S", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    stepSleep(e, 20 * 3600, false);
    expect(entitySleepDebt_h(e)).toBeGreaterThan(0);
  });
});
