import { q, type Q, SCALE } from "../units.js";

/** Phase 30: staged hunger/starvation state derived from caloricBalance_J. */
export type HungerState = "sated" | "hungry" | "starving" | "critical";

export interface ConditionState {
  // Intensities are 0..1 in Q unless otherwise noted
  onFire: Q;              // thermal exposure intensity
  corrosiveExposure: Q;   // chemical/corrosive exposure intensity
  radiation: Q;           // radiation intensity
  electricalOverload: Q;  // electrical hazard intensity

  suffocation: Q;         // hypoxia / vacuum / fluid intrusion analogue
  stunned: Q;             // control disruption intensity

  prone: boolean;
  pinned: boolean;             // Phase 2A: grapple-pinned (cannot stand or act freely)

  // deterministic incapacity timers (ticks)
  standBlockedTicks: number;   // cannot stand while > 0
  unconsciousTicks: number;    // unconscious while > 0

  // Phase 3: suppression from near-miss ranged fire
  suppressedTicks: number;     // coordination penalty while > 0

  // Phase 10C: temporary blindness from explosion flash
  blindTicks: number;          // vision zeroed while > 0; decremented each tick

  // Phase 5: psychological state
  fearQ: Q;                    // accumulated fear 0..1; routing when ≥ moraleThreshold

  // Phase 5 extensions: morale features
  suppressionFearMul: Q;       // caliber-based suppression fear multiplier (default SCALE.Q)
  recentAllyDeaths: number;    // ally deaths within the last 5s window (fear memory)
  lastAllyDeathTick: number;   // tick of last ally death observation (-1 = none)
  surrendered: boolean;        // entity has surrendered (permanent passive state)
  rallyCooldownTicks: number;  // ticks remaining after routing → normal transition

  // Phase 12: temporary energy-absorbing shield from capability armourLayer effects
  shieldReserve_J?: number;    // remaining absorption capacity (joules)
  shieldExpiry_tick?: number;  // tick at which the shield expires

  // Phase 29: core temperature (Q-coded; q(0.5) = 37°C normal body temp)
  coreTemp_Q?: Q;

  // Phase 30: nutritional state
  /** Caloric surplus / deficit in joules; starts at 0, goes negative as deficit grows. */
  caloricBalance_J?:   number;
  /** Hydration surplus / deficit in hydration_J units; negative = dehydrated. */
  hydrationBalance_J?: number;
  /** World tick of last food or water consumption. */
  lastMealTick?:       number;
  /** Derived from caloricBalance_J; updated by stepNutrition / consumeFood. */
  hungerState?:        HungerState;
}

export const defaultCondition = (): ConditionState => ({
  onFire: q(0),
  corrosiveExposure: q(0),
  radiation: q(0),
  electricalOverload: q(0),
  suffocation: q(0),
  stunned: q(0),
  prone: false,
  pinned: false,
  standBlockedTicks: 0,
  unconsciousTicks: 0,
  suppressedTicks: 0,
  blindTicks: 0,
  fearQ: q(0),
  suppressionFearMul: SCALE.Q as Q,
  recentAllyDeaths: 0,
  lastAllyDeathTick: -1,
  surrendered: false,
  rallyCooldownTicks: 0,
});