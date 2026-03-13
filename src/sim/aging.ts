// src/sim/aging.ts — Phase 57: Aging & Lifespan
//
// Attribute curves parameterized by normalized age fraction (ageFrac = ageYears / lifespanYears).
// Species-agnostic: a human at 25 years and an elf at 187 years both have ageFrac ≈ 0.31 and
// receive the same multipliers — the underlying biology follows the same developmental arc.
//
// Seven multiplier dimensions, each modelled as a piecewise-linear Q curve:
//   muscularStrength  — peakForce, peakPower, continuousPower (peaks ~0.28 ageFrac)
//   reactionTime      — multiplier on reactionTime_s (>q(1.0) = slower; peaks ~0.28)
//   motorControl      — controlQuality, stability, fineControl (peaks ~0.28)
//   stature           — stature_m (stable adult, slight compression in ancient)
//   cognitionFluid    — logical, spatial, kinesthetic, musical (peaks ~0.28)
//   cognitionCrystal  — linguistic, interpersonal, intrapersonal (peaks ~0.58)
//   distressTolerance — pain/fear tolerance; wisdom accumulates to middle age
//
// Public API:
//   computeAgeFrac(ageYears, lifespanYears?)      → Q [0..SCALE.Q]
//   getAgePhase(ageYears, lifespanYears?)          → AgePhase
//   deriveAgeMultipliers(ageYears, lifespanYears?) → AgeMultipliers
//   applyAgingToAttributes(base, ageYears, ...)    → IndividualAttributes (new object)
//   stepAging(entity, elapsedSeconds)              → mutates entity.age

import { q, clampQ, SCALE, type Q } from "../units.js";
import type { IndividualAttributes } from "../types.js";
import type { Entity } from "./entity.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Life-stage classification derived from normalized age fraction.
 * Species-agnostic: boundaries are proportional to lifespan, not absolute years.
 */
export type AgePhase =
  | "infant"       // ageFrac  0.00–0.05
  | "child"        // ageFrac  0.05–0.15
  | "adolescent"   // ageFrac  0.15–0.22
  | "young_adult"  // ageFrac  0.22–0.38
  | "adult"        // ageFrac  0.38–0.62
  | "elder"        // ageFrac  0.62–0.88
  | "ancient";     // ageFrac  0.88+

/** Q-valued multipliers for each aging dimension. */
export interface AgeMultipliers {
  /** Multiplier for peakForce_N, peakPower_W, continuousPower_W [Q]. */
  muscularStrength_Q:  Q;
  /** Multiplier on reactionTime_s — > q(1.0) means slower reaction [Q]. */
  reactionTime_Q:      Q;
  /** Multiplier for controlQuality, stability, fineControl [Q]. */
  motorControl_Q:      Q;
  /** Multiplier for stature_m [Q]. */
  stature_Q:           Q;
  /** Multiplier for logicalMathematical, spatial, bodilyKinesthetic, musical [Q]. */
  cognitionFluid_Q:    Q;
  /** Multiplier for linguistic, interpersonal, intrapersonal [Q]. */
  cognitionCrystal_Q:  Q;
  /** Multiplier for distressTolerance [Q]. */
  distressTolerance_Q: Q;
}

/** Per-entity age accumulator stored on `entity.age`. */
export interface AgeState {
  /** Elapsed seconds of this entity's life (from birth). */
  ageSeconds: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Seconds in one year (non-leap). */
export const SECONDS_PER_YEAR = 365 * 86_400;  // 31 536 000

/** Default lifespan for entities without a species override [years]. */
export const HUMAN_LIFESPAN_YEARS = 80;

// ── Knot tables ───────────────────────────────────────────────────────────────
// Each table is [ageFrac_Q, value_Q] sorted ascending.
// piecewise linear interpolation; value_Q may exceed SCALE.Q (e.g. reactionTime_Q).

type Knot = readonly [number, number];

const MUSCULAR_STRENGTH_KNOTS: readonly Knot[] = [
  [q(0.00), q(0.05)],  // birth
  [q(0.15), q(0.55)],  // child
  [q(0.25), q(1.00)],  // peak young adult
  [q(0.45), q(0.95)],  // maintained adult
  [q(0.65), q(0.75)],  // elder decline
  [q(1.00), q(0.40)],  // ancient
];

// reactionTime_Q > SCALE.Q means reaction is SLOWER than the archetype baseline.
const REACTION_TIME_KNOTS: readonly Knot[] = [
  [q(0.00), 25_000],   // infant (2.5× baseline — newborn has negligible voluntary motor)
  [q(0.15), 12_000],   // adolescent (1.2×)
  [q(0.28), 10_000],   // peak (1.0× = no change from archetype)
  [q(0.50), 10_800],   // slight adult slowdown (1.08×)
  [q(0.70), 12_500],   // elder (1.25×)
  [q(1.00), 20_000],   // ancient (2.0×)
];

const MOTOR_CONTROL_KNOTS: readonly Knot[] = [
  [q(0.00), q(0.30)],  // infant
  [q(0.15), q(0.80)],  // adolescent
  [q(0.28), q(1.00)],  // peak
  [q(0.60), q(0.95)],  // adult maintained
  [q(0.85), q(0.75)],  // elder
  [q(1.00), q(0.55)],  // ancient
];

const STATURE_KNOTS: readonly Knot[] = [
  [q(0.00), q(0.30)],  // infant
  [q(0.20), q(0.95)],  // adolescent growth
  [q(0.25), q(1.00)],  // peak adult height
  [q(0.70), q(1.00)],  // stable through adulthood
  [q(0.90), q(0.97)],  // slight compression in elder
  [q(1.00), q(0.94)],  // ancient
];

const COGNITION_FLUID_KNOTS: readonly Knot[] = [
  [q(0.00), q(0.10)],  // infant
  [q(0.20), q(0.90)],  // adolescent rapid development
  [q(0.28), q(1.00)],  // peak young adult (~22 years for human)
  [q(0.50), q(0.90)],  // adult gradual decline
  [q(0.70), q(0.70)],  // elder
  [q(1.00), q(0.35)],  // ancient
];

const COGNITION_CRYSTAL_KNOTS: readonly Knot[] = [
  [q(0.00), q(0.10)],  // infant
  [q(0.25), q(0.75)],  // young adult still accumulating wisdom
  [q(0.55), q(1.00)],  // peak middle age (~44 years for human)
  [q(0.80), q(0.98)],  // elder — wisdom mostly preserved
  [q(1.00), q(0.78)],  // ancient
];

const DISTRESS_TOLERANCE_KNOTS: readonly Knot[] = [
  [q(0.00), q(0.50)],  // infant
  [q(0.20), q(0.80)],  // adolescent
  [q(0.45), q(1.00)],  // peaks middle age (hard-won tolerance)
  [q(0.75), q(1.05)],  // elder slightly above baseline (wisdom bonus)
  [q(1.00), q(0.85)],  // ancient — some decline
];

// ── Core computation ──────────────────────────────────────────────────────────

/** Piecewise-linear interpolation between sorted knot pairs. */
function interpKnots(x_Q: Q, knots: readonly Knot[]): Q {
  if (x_Q <= knots[0]![0]) return knots[0]![1] as Q;
  for (let i = 1; i < knots.length; i++) {
    const [x0, y0] = knots[i - 1]!;
    const [x1, y1] = knots[i]!;
    if (x_Q <= x1) {
      const span = x1 - x0;
      if (span === 0) return y0 as Q;
      const t = Math.round((x_Q - x0) * SCALE.Q / span);
      return (y0 + Math.round((y1 - y0) * t / SCALE.Q)) as Q;
    }
  }
  return knots[knots.length - 1]![1] as Q;
}

/**
 * Compute normalized age fraction [0..SCALE.Q] for a given age and lifespan.
 *
 * A 25-year-old human (lifespan 80) → q(0.3125).
 * A 187-year-old elf (lifespan 600) → q(0.312) — effectively the same developmental stage.
 *
 * @param ageYears      Current age in years.
 * @param lifespanYears Expected lifespan (default: HUMAN_LIFESPAN_YEARS).
 */
export function computeAgeFrac(
  ageYears:      number,
  lifespanYears: number = HUMAN_LIFESPAN_YEARS,
): Q {
  if (lifespanYears <= 0) return q(0) as Q;
  return clampQ(
    Math.round(ageYears * SCALE.Q / lifespanYears) as Q,
    q(0) as Q,
    SCALE.Q as Q,
  );
}

/**
 * Classify the entity's life stage from their normalized age fraction.
 *
 * Boundaries (ageFrac):
 *   infant 0–0.05 | child 0.05–0.15 | adolescent 0.15–0.22 |
 *   young_adult 0.22–0.38 | adult 0.38–0.62 | elder 0.62–0.88 | ancient 0.88+
 */
export function getAgePhase(
  ageYears:      number,
  lifespanYears: number = HUMAN_LIFESPAN_YEARS,
): AgePhase {
  const f = computeAgeFrac(ageYears, lifespanYears);
  if (f < q(0.05)) return "infant";
  if (f < q(0.15)) return "child";
  if (f < q(0.22)) return "adolescent";
  if (f < q(0.38)) return "young_adult";
  if (f < q(0.62)) return "adult";
  if (f < q(0.88)) return "elder";
  return "ancient";
}

/**
 * Derive age-based attribute multipliers from normalized age and lifespan.
 *
 * All returned Q values except `reactionTime_Q` are in [0, SCALE.Q].
 * `reactionTime_Q` may exceed SCALE.Q (values > q(1.0) indicate slower reaction
 * than the archetype baseline).
 */
export function deriveAgeMultipliers(
  ageYears:      number,
  lifespanYears: number = HUMAN_LIFESPAN_YEARS,
): AgeMultipliers {
  const f = computeAgeFrac(ageYears, lifespanYears);
  return {
    muscularStrength_Q:  interpKnots(f, MUSCULAR_STRENGTH_KNOTS),
    reactionTime_Q:      interpKnots(f, REACTION_TIME_KNOTS),
    motorControl_Q:      interpKnots(f, MOTOR_CONTROL_KNOTS),
    stature_Q:           interpKnots(f, STATURE_KNOTS),
    cognitionFluid_Q:    interpKnots(f, COGNITION_FLUID_KNOTS),
    cognitionCrystal_Q:  interpKnots(f, COGNITION_CRYSTAL_KNOTS),
    distressTolerance_Q: interpKnots(f, DISTRESS_TOLERANCE_KNOTS),
  };
}

/**
 * Apply age multipliers to a base attribute set, returning a new object.
 *
 * The input `base` is treated as the archetype peak (typically from `generateIndividual`).
 * The caller is responsible for caching the base and recomputing aged attributes when
 * age advances (e.g. once per in-game month for campaign simulation).
 *
 * Attributes affected:
 *   - morphology.stature_m
 *   - performance.peakForce_N, peakPower_W, continuousPower_W
 *   - control.reactionTime_s, controlQuality, stability, fineControl
 *   - resilience.distressTolerance
 *   - cognition (if present): fluid dims + crystal dims scaled independently
 *
 * All Q outputs are clamped to [0, SCALE.Q]; reactionTime_s is clamped to ≥ 1.
 *
 * @param base          Archetype-peak attributes (unmodified).
 * @param ageYears      Current age in years.
 * @param lifespanYears Expected lifespan (default: HUMAN_LIFESPAN_YEARS).
 */
export function applyAgingToAttributes(
  base:          IndividualAttributes,
  ageYears:      number,
  lifespanYears: number = HUMAN_LIFESPAN_YEARS,
): IndividualAttributes {
  const m = deriveAgeMultipliers(ageYears, lifespanYears);

  return {
    ...base,

    morphology: {
      ...base.morphology,
      stature_m: Math.max(1, Math.round(base.morphology.stature_m * m.stature_Q / SCALE.Q)),
    },

    performance: {
      ...base.performance,
      peakForce_N:       Math.max(1, Math.round(base.performance.peakForce_N * m.muscularStrength_Q / SCALE.Q)),
      peakPower_W:       Math.max(1, Math.round(base.performance.peakPower_W * m.muscularStrength_Q / SCALE.Q)),
      continuousPower_W: Math.max(1, Math.round(base.performance.continuousPower_W * m.muscularStrength_Q / SCALE.Q)),
    },

    control: {
      ...base.control,
      reactionTime_s: Math.max(1, Math.round(base.control.reactionTime_s * m.reactionTime_Q / SCALE.Q)),
      controlQuality:  clampQ(Math.round(base.control.controlQuality  * m.motorControl_Q / SCALE.Q) as Q, q(0) as Q, SCALE.Q as Q),
      stability:       clampQ(Math.round(base.control.stability        * m.motorControl_Q / SCALE.Q) as Q, q(0) as Q, SCALE.Q as Q),
      fineControl:     clampQ(Math.round(base.control.fineControl      * m.motorControl_Q / SCALE.Q) as Q, q(0) as Q, SCALE.Q as Q),
    },

    resilience: {
      ...base.resilience,
      distressTolerance: clampQ(
        Math.round(base.resilience.distressTolerance * m.distressTolerance_Q / SCALE.Q) as Q,
        q(0) as Q, SCALE.Q as Q,
      ),
    },

    // exactOptionalPropertyTypes: spread present cognition, otherwise omit the key entirely.
    ...(base.cognition
      ? {
          cognition: {
            ...base.cognition,
            // Fluid intelligence (peaks young, declines earlier)
            logicalMathematical: clampQ(Math.round(base.cognition.logicalMathematical * m.cognitionFluid_Q   / SCALE.Q) as Q, q(0) as Q, SCALE.Q as Q),
            spatial:             clampQ(Math.round(base.cognition.spatial             * m.cognitionFluid_Q   / SCALE.Q) as Q, q(0) as Q, SCALE.Q as Q),
            bodilyKinesthetic:   clampQ(Math.round(base.cognition.bodilyKinesthetic   * m.cognitionFluid_Q   / SCALE.Q) as Q, q(0) as Q, SCALE.Q as Q),
            musical:             clampQ(Math.round(base.cognition.musical             * m.cognitionFluid_Q   / SCALE.Q) as Q, q(0) as Q, SCALE.Q as Q),
            // Crystallized intelligence (peaks mid-life, persists through elder)
            linguistic:    clampQ(Math.round(base.cognition.linguistic    * m.cognitionCrystal_Q / SCALE.Q) as Q, q(0) as Q, SCALE.Q as Q),
            interpersonal: clampQ(Math.round(base.cognition.interpersonal * m.cognitionCrystal_Q / SCALE.Q) as Q, q(0) as Q, SCALE.Q as Q),
            intrapersonal: clampQ(Math.round(base.cognition.intrapersonal * m.cognitionCrystal_Q / SCALE.Q) as Q, q(0) as Q, SCALE.Q as Q),
          },
        }
      : {}),
  };
}

/**
 * Advance an entity's age by `elapsedSeconds`.
 *
 * Initializes `entity.age` if absent. Does NOT recompute attributes — the host
 * should call `applyAgingToAttributes` when it needs current aged stats.
 *
 * Mutates: `entity.age`.
 */
export function stepAging(entity: Entity, elapsedSeconds: number): void {
  if (!entity.age) {
    entity.age = { ageSeconds: 0 };
  }
  entity.age.ageSeconds += elapsedSeconds;
}

/**
 * Convenience helper: return the current age in fractional years from entity.age.
 * Returns 0 if `entity.age` is absent.
 */
export function entityAgeYears(entity: Entity): number {
  if (!entity.age) return 0;
  return entity.age.ageSeconds / SECONDS_PER_YEAR;
}
