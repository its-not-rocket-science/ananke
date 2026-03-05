/**
 * Phase 30 — Nutrition & Starvation
 *
 * Models long-term caloric balance, hunger states, and staged combat penalties
 * from starvation. Complements the Phase 2B short-term stamina (reserveEnergy_J).
 *
 * BMR (Kleiber's law):  BMR_W ≈ 80 × (mass_kg / 75)^0.75
 * AMR (active):         AMR_W = BMR + peakPower_W × activityFrac × 0.15
 *
 * Hunger state thresholds (caloric deficit relative to BMR):
 *   sated   : deficit < 12 h × BMR
 *   hungry  : 12 h × BMR ≤ deficit < 24 h × BMR
 *   starving: 24 h × BMR ≤ deficit < 72 h × BMR  (+fat catabolism)
 *   critical: deficit ≥ 72 h × BMR               (+muscle catabolism)
 */

import { q, SCALE, type Q, clampQ } from "../units.js";
import type { Entity } from "./entity.js";
import type { HungerState } from "./condition.js";

// ── Food catalogue ────────────────────────────────────────────────────────────

export interface FoodItem {
  id:           string;
  name:         string;
  /** Caloric energy in joules (e.g. 1 ration bar ≈ 2 MJ). */
  energy_J:     number;
  /** Mass of the item in grams. */
  massGrams:    number;
  /** Hydration provided in the same unit system as hydrationBalance_J. */
  hydration_J?: number;
}

export const FOOD_ITEMS: readonly FoodItem[] = [
  { id: "ration_bar",    name: "Ration bar",   energy_J: 2_000_000, massGrams: 500 },
  { id: "dried_meat",    name: "Dried meat",   energy_J: 1_500_000, massGrams: 300 },
  { id: "hardtack",      name: "Hardtack",     energy_J:   800_000, massGrams: 200 },
  { id: "fresh_bread",   name: "Fresh bread",  energy_J:   700_000, massGrams: 250 },
  { id: "berry_handful", name: "Berries",      energy_J:   150_000, massGrams:  50 },
  { id: "water_flask",   name: "Water flask",  energy_J:         0, massGrams: 500, hydration_J: 500_000 },
] as const;

const FOOD_BY_ID = new Map(FOOD_ITEMS.map(f => [f.id, f]));

// ── Metabolic constants ───────────────────────────────────────────────────────

/** Fluid loss rate: ~2.5 L/day, scaled as 1 mL = 1000 hydration_J → 29 J/s. */
const FLUID_LOSS_RATE = 29;  // hydration_J per second

/**
 * Fat catabolism during starvation: ~300 g/day in SCALE.kg units.
 * SCALE.kg = 1000 so 300 g = 300 SCALE.kg units.
 * 300 / 86400 ≈ 0.003472 SCALE.kg/s — accumulated as float.
 */
const FAT_CATAB_RATE = 300 / 86400;  // SCALE.kg per second

/**
 * Muscle catabolism in critical starvation: 0.5 N/hour reduction in peakForce_N.
 * 0.5 N × SCALE.N = 50 SCALE.N / 3600 s ≈ 0.01389 SCALE.N/s — accumulated as float.
 */
const MUSCLE_CATAB_RATE = 0.5 * SCALE.N / 3600;  // SCALE.N per second

/** Seconds of BMR-equivalent deficit to enter hungry state (12 h). */
const HUNGRY_SECONDS  = 12 * 3600;   // 43 200

/** Seconds of BMR-equivalent deficit to enter starving state (24 h). */
const STARVING_SECONDS = 24 * 3600;  // 86 400

/** Seconds of BMR-equivalent deficit to enter critical state (72 h). */
const CRITICAL_SECONDS = 72 * 3600;  // 259 200

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Compute Basal Metabolic Rate in watts (integer) using Kleiber's law.
 * mass_kg must be in SCALE.kg units (e.g. 75 000 for 75 kg).
 */
export function computeBMR(mass_kg: number): number {
  const massReal = mass_kg / SCALE.kg;
  return Math.round(80 * Math.pow(massReal / 75, 0.75));
}

/** Derive hunger state from caloric balance and BMR. */
function deriveHungerState(caloricBalance: number, bmr: number): HungerState {
  const deficit = -caloricBalance;  // positive when in deficit
  if (deficit < HUNGRY_SECONDS  * bmr) return "sated";
  if (deficit < STARVING_SECONDS * bmr) return "hungry";
  if (deficit < CRITICAL_SECONDS * bmr) return "starving";
  return "critical";
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Advance an entity's nutritional state by `delta_s` seconds.
 *
 * Mutates:
 *   condition.caloricBalance_J, condition.hydrationBalance_J, condition.hungerState
 *   attributes.morphology.mass_kg        (during starving or critical)
 *   attributes.performance.peakForce_N   (during critical only)
 *
 * `activity` is a Q value (0 = resting, q(1.0) = maximum).
 */
export function stepNutrition(entity: Entity, delta_s: number, activity: Q): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cond = entity.condition as any;
  const baseBMR  = computeBMR(entity.attributes.morphology.mass_kg);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bmrMul   = (entity as any).physiology?.bmrMultiplier ?? SCALE.Q;
  const bmr      = Math.round(baseBMR * bmrMul / SCALE.Q);

  // Active metabolic rate: BMR + peakPower × activityFrac × 0.15
  const actFrac = activity / SCALE.Q;
  const amr     = bmr + entity.attributes.performance.peakPower_W * actFrac * 0.15;

  // Caloric and hydration drain
  cond.caloricBalance_J   = (cond.caloricBalance_J   ?? 0) - amr * delta_s;
  cond.hydrationBalance_J = (cond.hydrationBalance_J ?? 0) - FLUID_LOSS_RATE * delta_s;

  // Derive and cache hunger state
  const hungerState: HungerState = deriveHungerState(cond.caloricBalance_J as number, bmr);
  cond.hungerState = hungerState;

  // Fat catabolism (starving and critical) — sub-unit float accumulation
  if (hungerState === "starving" || hungerState === "critical") {
    entity.attributes.morphology.mass_kg -= FAT_CATAB_RATE * delta_s;
    if (entity.attributes.morphology.mass_kg < 0) entity.attributes.morphology.mass_kg = 0;
  }

  // Muscle catabolism (critical only)
  if (hungerState === "critical") {
    entity.attributes.performance.peakForce_N -= MUSCLE_CATAB_RATE * delta_s;
    if (entity.attributes.performance.peakForce_N < 0) entity.attributes.performance.peakForce_N = 0;
  }
}

/**
 * Consume a food item from the entity's optional food inventory.
 *
 * Returns `false` if the food ID is unknown, or if the entity has a
 * `foodInventory: Map<string, number>` that does not contain the item.
 * When no inventory is present (undefined), consumption is unconditional.
 *
 * Side effects:
 *   - caloricBalance_J   += food.energy_J
 *   - hydrationBalance_J += food.hydration_J (if any)
 *   - lastMealTick        = tick
 *   - injury.fluidLoss   reduced by scale(hydration_J)  [for water_flask]
 *   - hungerState         re-derived
 */
export function consumeFood(entity: Entity, foodId: string, tick: number): boolean {
  const food = FOOD_BY_ID.get(foodId);
  if (!food) return false;  // unknown food item

  // Inventory check (undefined = unlimited supply)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inventory = (entity as any).foodInventory as Map<string, number> | undefined;
  if (inventory !== undefined) {
    const count = inventory.get(foodId) ?? 0;
    if (count <= 0) return false;
    inventory.set(foodId, count - 1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cond = entity.condition as any;
  cond.caloricBalance_J   = (cond.caloricBalance_J   ?? 0) + food.energy_J;
  cond.hydrationBalance_J = (cond.hydrationBalance_J ?? 0) + (food.hydration_J ?? 0);
  cond.lastMealTick = tick;

  // Water flask: also reduces injury fluid loss
  // Scale: 500 000 hydration_J → Math.trunc(500_000 / 500) = 1000 = q(0.10)
  if (food.hydration_J) {
    const fluidRestore = Math.trunc(food.hydration_J / 500);
    entity.injury.fluidLoss = clampQ((entity.injury.fluidLoss - fluidRestore) as Q, q(0), q(1.0));
  }

  // Re-derive hunger state after eating
  const bmr = computeBMR(entity.attributes.morphology.mass_kg);
  cond.hungerState = deriveHungerState(cond.caloricBalance_J as number, bmr);

  return true;
}

/**
 * Derive performance modifiers from hunger state.
 *
 *   staminaMul : multiplier on effective stamina energy drain (Phase 2B)
 *   forceMul   : multiplier on effective peakForce_N in combat resolution
 *   latencyMul : multiplier on decision latency (Phase 4)
 *   moraleDecay: additional fear per tick (Phase 5)
 */
export function deriveHungerModifiers(state: HungerState): {
  staminaMul:  Q;
  forceMul:    Q;
  latencyMul:  Q;
  moraleDecay: Q;
} {
  switch (state) {
    case "sated":
      return { staminaMul: q(1.0) as Q, forceMul: q(1.0) as Q, latencyMul: q(1.0)  as Q, moraleDecay: q(0)     as Q };
    case "hungry":
      return { staminaMul: q(0.90) as Q, forceMul: q(1.0) as Q, latencyMul: q(1.0)  as Q, moraleDecay: q(0)     as Q };
    case "starving":
      return { staminaMul: q(0.75) as Q, forceMul: q(0.90) as Q, latencyMul: q(1.0)  as Q, moraleDecay: q(0.030) as Q };
    case "critical":
      return { staminaMul: q(0.50) as Q, forceMul: q(0.80) as Q, latencyMul: q(1.50) as Q, moraleDecay: q(0.030) as Q };
  }
}
