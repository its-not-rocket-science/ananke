/**
 * Phase 29 — Environmental Stress: Staged Hypothermia & Hyperthermia
 *
 * Core temperature model: linear Q encoding where q(0.5) = 37°C (normal body temp),
 * 0 = 10°C, SCALE.Q = 64°C — so 1°C ≈ 185.2 Q units over the 54°C span.
 *
 * Heat balance (per second):
 *   ΔT_°C = (metabolicHeat − conductiveLoss) × delta_s / thermalMass
 *   metabolicHeat  = peakPower_W × activityFrac × (1 − EFFICIENCY)
 *   conductiveLoss = (coreTemp_°C − ambientTemp_°C) / thermalResistance
 *   thermalResistance = 0.09 + sum(armour.insulation_m2KW)   [°C/W]
 *   thermalMass = (mass_kg_real) × 3500                       [J/°C]
 */

import { q, SCALE, type Q, qMul } from "../units.js";
import type { Entity } from "./entity.js";

// ── Temperature encoding helpers ──────────────────────────────────────────────

const TEMP_MIN_C   = 10;   // °C at Q = 0
const TEMP_RANGE_C = 54;   // °C spanned by [0, SCALE.Q]

/** Q-coded temperature → Celsius (floating-point, for physics calculations only). */
function qToC(qVal: number): number {
  return TEMP_MIN_C + (qVal / SCALE.Q) * TEMP_RANGE_C;
}

/** Celsius → Q-coded temperature (rounds to nearest integer). */
export function cToQ(celsius: number): Q {
  return Math.round(((celsius - TEMP_MIN_C) / TEMP_RANGE_C) * SCALE.Q) as Q;
}

// ── Exported threshold constants ──────────────────────────────────────────────

/** Normal body temperature (37.0 °C). */
export const CORE_TEMP_NORMAL_Q: Q = q(0.500) as Q;

/** Mild hyperthermia entry (~37.8 °C). */
export const CORE_TEMP_HEAT_MILD: Q = q(0.515) as Q;

/** Heat exhaustion entry (~38.6 °C). */
export const CORE_TEMP_HEAT_EXHAUS: Q = q(0.529) as Q;

/** Heat stroke entry (~39.4 °C). */
export const CORE_TEMP_HEAT_STROKE: Q = q(0.544) as Q;

/** Mild hypothermia entry (~36.2 °C; below normal). */
export const CORE_TEMP_HYPOTHERMIA_MILD: Q = q(0.485) as Q;

/** Moderate hypothermia entry (~34.6 °C). */
export const CORE_TEMP_HYPOTHERMIA_MOD: Q = q(0.456) as Q;

/** Severe hypothermia entry (~33.0 °C). */
export const CORE_TEMP_HYPOTHERMIA_SEVERE: Q = q(0.426) as Q;

// Internal critical thresholds (not exported; outside the named stage range)
const CORE_TEMP_CRITICAL_HIGH: Q = q(0.558) as Q;  // ~40.1 °C — death trajectory
// Critical hypothermia is below HYPOTHERMIA_SEVERE (q(0.426) ≈ 33 °C)

/** Helper: derive total armour insulation from loadout items. */
export function sumArmourInsulation(items: readonly { kind?: string; insulation_m2KW?: number }[]): number {
  let total = 0;
  for (const item of items) {
    if (item.kind === "armour" && item.insulation_m2KW != null) total += item.insulation_m2KW;
  }
  return total;
}

// ── Metabolic heat model ──────────────────────────────────────────────────────
//
// Metabolic heat depends on body mass and activity level, NOT on combat peak power.
// Using W/kg specific metabolic heat production (tissue heat output directly):
//   Resting (BMR): ~1.06 W/kg — standard basal metabolic rate for adults
//   Active (brisk walk/march): ~5.5 W/kg — ≈ 5 MET
//
// These produce ≈ 80 W and ≈ 412 W for a 75 kg human, matching real physiology.
const REST_SPECIFIC_W = 1.06;  // W / real kg — resting metabolic heat
const ACT_SPECIFIC_W  = 5.50;  // W / real kg — active/marching metabolic heat

/** Velocity threshold for "active" in SCALE.mps units (1.0 m/s). */
const ACTIVE_VEL_THRESH = Math.trunc(1.0 * SCALE.mps);  // 10000

// ── Pure computation helper ───────────────────────────────────────────────────

/**
 * Compute the new core temperature Q value given explicit parameters (no entity mutation).
 *
 * Used by stepCoreTemp and by the downtime simulator (which does not hold an entity reference).
 * Note: floating-point accumulation is intentional — sub-unit Q fractions accumulate correctly
 * across successive calls since Q is stored as `number` (JS float).
 */
export function computeNewCoreQ(
  coreQ:            number,
  massReal_kg:      number,  // real kg (entity.attributes.morphology.mass_kg / SCALE.kg)
  armourInsulation: number,
  isActive:         boolean, // true if entity velocity ≥ 1 m/s
  ambientTemp:      Q,
  delta_s:          number,
): Q {
  if (massReal_kg <= 0) return coreQ as Q;

  const coreC = qToC(coreQ);
  const ambC  = qToC(ambientTemp);

  // Metabolic heat: mass-proportional (independent of combat peak power)
  const specificW     = isActive ? ACT_SPECIFIC_W : REST_SPECIFIC_W;
  const metabolicHeat = massReal_kg * specificW;  // W

  const thermalResistance = 0.09 + armourInsulation;  // °C/W
  const thermalMass       = massReal_kg * 3500;       // J/°C

  const conductiveLoss = (coreC - ambC) / thermalResistance;  // W
  const deltaTc        = (metabolicHeat - conductiveLoss) * delta_s / thermalMass;  // °C
  const deltaTq        = (deltaTc / TEMP_RANGE_C) * SCALE.Q;  // fractional Q

  return Math.max(0, Math.min(SCALE.Q, coreQ + deltaTq)) as Q;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Advance an entity's core temperature by `delta_s` seconds given the ambient temperature.
 *
 * Reads `entity.condition.coreTemp_Q` (defaults to CORE_TEMP_NORMAL_Q if absent).
 * Writes the new value back to `entity.condition.coreTemp_Q` and returns it.
 */
export function stepCoreTemp(
  entity:      Entity,
  ambientTemp: Q,       // Phase 29 Q-coded temperature (same scale as coreTemp_Q)
  delta_s:     number,  // elapsed seconds
): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cond   = entity.condition as any;
  const coreQ: number = cond.coreTemp_Q ?? CORE_TEMP_NORMAL_Q;

  const mReal = entity.attributes.morphology.mass_kg / SCALE.kg;
  const insul = sumArmourInsulation(entity.loadout.items as any[])
             + (entity.physiology?.naturalInsulation_m2KW ?? 0);

  const vx   = entity.velocity_mps.x;
  const vy   = entity.velocity_mps.y;
  const vMag = Math.sqrt(vx * vx + vy * vy);

  const newCoreQ = computeNewCoreQ(coreQ, mReal, insul, vMag >= ACTIVE_VEL_THRESH, ambientTemp, delta_s);
  cond.coreTemp_Q = newCoreQ;
  return newCoreQ;
}

export interface TempModifiers {
  /** Effective multiplier on peakPower_W for action resolution. */
  powerMul: Q;
  /** Penalty subtracted from controlQuality. */
  fineControlPen: Q;
  /** Multiplier on decision latency. */
  latencyMul: Q;
  /** True when temperature is in death-trajectory range. */
  dead: boolean;
}

/**
 * Derive performance modifiers from current core temperature.
 *
 * Stages (high → low):
 *   > CRITICAL_HIGH  : critical hyperthermia (dead=true)
 *   > HEAT_STROKE    : heat stroke
 *   > HEAT_EXHAUS    : heat exhaustion
 *   > HEAT_MILD      : mild hyperthermia
 *   >= NORMAL        : normal
 *   >= HYPO_MILD     : mild hypothermia
 *   >= HYPO_MOD      : moderate hypothermia
 *   >= HYPO_SEVERE   : severe hypothermia
 *   < HYPO_SEVERE    : critical hypothermia (dead=true)
 */
export function deriveTempModifiers(coreTemp_Q: Q): TempModifiers {
  if (coreTemp_Q >= CORE_TEMP_CRITICAL_HIGH) {
    // Critical hyperthermia (> ~40°C) — death trajectory
    return { powerMul: q(0.60) as Q, fineControlPen: q(0.30) as Q, latencyMul: q(3.0) as Q, dead: true };
  }
  if (coreTemp_Q >= CORE_TEMP_HEAT_STROKE) {
    // Heat stroke (~39–40°C) — −40% power, decision latency ×2
    return { powerMul: q(0.60) as Q, fineControlPen: q(0.20) as Q, latencyMul: q(2.0) as Q, dead: false };
  }
  if (coreTemp_Q >= CORE_TEMP_HEAT_EXHAUS) {
    // Heat exhaustion (~38.6–39.4°C) — −15% power, fine control penalty
    return { powerMul: q(0.85) as Q, fineControlPen: q(0.10) as Q, latencyMul: q(1.0) as Q, dead: false };
  }
  if (coreTemp_Q >= CORE_TEMP_HEAT_MILD) {
    // Mild hyperthermia (~37.8–38.6°C) — −5% power
    return { powerMul: q(0.95) as Q, fineControlPen: q(0) as Q, latencyMul: q(1.0) as Q, dead: false };
  }
  if (coreTemp_Q >= CORE_TEMP_NORMAL_Q) {
    // Normal (37.0–37.8°C)
    return { powerMul: q(1.0) as Q, fineControlPen: q(0) as Q, latencyMul: q(1.0) as Q, dead: false };
  }
  if (coreTemp_Q >= CORE_TEMP_HYPOTHERMIA_MILD) {
    // Mild hypothermia (~36.2–37.0°C) — shivering, −5% power
    return { powerMul: q(0.95) as Q, fineControlPen: q(0.05) as Q, latencyMul: q(1.0) as Q, dead: false };
  }
  if (coreTemp_Q >= CORE_TEMP_HYPOTHERMIA_MOD) {
    // Moderate hypothermia (~34.6–36.2°C) — −20% power, reaction time +20%
    return { powerMul: q(0.80) as Q, fineControlPen: q(0.15) as Q, latencyMul: q(1.2) as Q, dead: false };
  }
  if (coreTemp_Q >= CORE_TEMP_HYPOTHERMIA_SEVERE) {
    // Severe hypothermia (~33.0–34.6°C) — −50% power, decision latency ×3
    return { powerMul: q(0.50) as Q, fineControlPen: q(0.20) as Q, latencyMul: q(3.0) as Q, dead: false };
  }
  // Critical hypothermia (< ~33°C) — cardiac arrest, death trajectory
  return { powerMul: q(0.50) as Q, fineControlPen: q(0.30) as Q, latencyMul: q(4.0) as Q, dead: true };
}
