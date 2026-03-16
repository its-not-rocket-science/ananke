// tools/validation-constants.ts — Constant mapping for validation suggestions
//
// Maps direct validation scenario names to the underlying simulation constants.
// Used to generate specific constant adjustment suggestions when validation fails.

import { SCALE } from "../src/units.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ConstantReference {
  /** Source file path relative to project root */
  file: string;
  /** Constant name as it appears in source */
  name: string;
  /** Current value (raw integer for Q constants, numeric for plain numbers) */
  currentValue: number;
  /** Line number where constant is defined (approximate) */
  line: number;
  /** Type of constant: 'q' for Q-valued constants, 'numeric' for plain numbers */
  type: 'q' | 'numeric';
  /** For Q constants: the fractional value (currentValue / SCALE.Q) for display */
  fractionalValue?: number;
  /** Optional description of what the constant controls */
  description?: string;
}

// -----------------------------------------------------------------------------
// Constant mapping
// -----------------------------------------------------------------------------

/**
 * Map from direct validation scenario name to the constants it validates.
 * Only includes scenarios that have a direct numeric empirical comparison.
 */
export const SCENARIO_CONSTANT_MAP: Readonly<Record<string, ConstantReference[]>> = {
  // Damage energy constants
  "Surface Damage Constant": [
    {
      file: "src/sim/kernel.ts",
      name: "SURF_J",
      currentValue: 6930,
      line: 1664,
      type: "numeric",
      description: "Surface damage per joule of impact energy (J/Q)"
    }
  ],
  "Internal Damage Constant": [
    {
      file: "src/sim/kernel.ts",
      name: "INT_J",
      currentValue: 1000,
      line: 1665,
      type: "numeric",
      description: "Internal damage per joule of impact energy (J/Q)"
    }
  ],
  "Structural Damage Constant": [
    {
      file: "src/sim/kernel.ts",
      name: "STR_J",
      currentValue: 220,
      line: 1666,
      type: "numeric",
      description: "Structural damage per joule of impact energy (J/Q)"
    }
  ],
  "Impact Energy Distribution": [
    {
      file: "src/sim/kernel.ts",
      name: "SURF_J",
      currentValue: 6930,
      line: 1664,
      type: "numeric",
      description: "Surface damage per joule of impact energy (J/Q)"
    },
    {
      file: "src/sim/kernel.ts",
      name: "INT_J",
      currentValue: 1000,
      line: 1665,
      type: "numeric",
      description: "Internal damage per joule of impact energy (J/Q)"
    },
    {
      file: "src/sim/kernel.ts",
      name: "STR_J",
      currentValue: 220,
      line: 1666,
      type: "numeric",
      description: "Structural damage per joule of impact energy (J/Q)"
    }
  ],
  "Damage Energy Constants": [
    {
      file: "src/sim/kernel.ts",
      name: "SURF_J",
      currentValue: 6930,
      line: 1664,
      type: "numeric",
      description: "Surface damage per joule of impact energy (J/Q)"
    },
    {
      file: "src/sim/kernel.ts",
      name: "INT_J",
      currentValue: 1000,
      line: 1665,
      type: "numeric",
      description: "Internal damage per joule of impact energy (J/Q)"
    },
    {
      file: "src/sim/kernel.ts",
      name: "STR_J",
      currentValue: 220,
      line: 1666,
      type: "numeric",
      description: "Structural damage per joule of impact energy (J/Q)"
    }
  ],
  "Grappling Grip Decay": [
    {
      file: "src/sim/grapple.ts",
      name: "GRIP_DECAY_PER_TICK",
      currentValue: 50, // q(0.005) * SCALE.Q
      line: 41,
      type: "q",
      fractionalValue: 0.005,
      description: "Grip decay per tick without maintenance (fraction)"
    }
  ],
  "Shock from Fluid Loss Constant": [
    {
      file: "src/sim/step/injury.ts",
      name: "SHOCK_FROM_FLUID",
      currentValue: 40, // q(0.0040) * SCALE.Q
      line: 16,
      type: "q",
      fractionalValue: 0.0040,
      description: "Shock increase per Q fluid loss per second (fraction)"
    }
  ],
  "Shock from Internal Damage Constant": [
    {
      file: "src/sim/step/injury.ts",
      name: "SHOCK_FROM_INTERNAL",
      currentValue: 20, // q(0.0020) * SCALE.Q
      line: 17,
      type: "q",
      fractionalValue: 0.0020,
      description: "Shock increase per Q internal damage per second (fraction)"
    }
  ],
  "Consciousness Loss from Shock Constant": [
    {
      file: "src/sim/step/injury.ts",
      name: "CONSC_LOSS_FROM_SHOCK",
      currentValue: 100, // q(0.0100) * SCALE.Q
      line: 18,
      type: "q",
      fractionalValue: 0.0100,
      description: "Consciousness loss per Q shock per second (fraction)"
    }
  ],
  "Consciousness Loss from Suffocation Constant": [
    {
      file: "src/sim/step/injury.ts",
      name: "CONSC_LOSS_FROM_SUFF",
      currentValue: 200, // q(0.0200) * SCALE.Q
      line: 19,
      type: "q",
      fractionalValue: 0.0200,
      description: "Consciousness loss per Q suffocation per second (fraction)"
    }
  ],
  "Fatal Fluid Loss Threshold": [
    {
      file: "src/sim/step/injury.ts",
      name: "FATAL_FLUID_LOSS",
      currentValue: 8000, // q(0.80) * SCALE.Q
      line: 20,
      type: "q",
      fractionalValue: 0.80,
      description: "Fluid loss level that causes death (fraction)"
    }
  ],
  "Mount Charge Bonus": [
    {
      file: "src/sim/mount.ts",
      name: "CHARGE_MASS_FRAC",
      currentValue: 800, // q(0.08) * SCALE.Q
      line: 103,
      type: "q",
      fractionalValue: 0.08,
      description: "Fraction of mount mass that contributes to charge impact"
    }
  ],
  "Collective Ritual Morale": [
    {
      file: "src/collective-activities.ts",
      name: "RITUAL_MAX_BONUS",
      currentValue: 3000, // q(0.30) * SCALE.Q
      line: 106,
      type: "q",
      fractionalValue: 0.30,
      description: "Maximum morale bonus from ritual participation (fraction)"
    }
  ],
  "Wound Aging Sepsis Risk": [
    {
      file: "src/sim/wound-aging.ts",
      name: "SEPSIS_THRESHOLD",
      currentValue: 8500, // q(0.85) * SCALE.Q
      line: 75,
      type: "q",
      fractionalValue: 0.85,
      description: "Internal damage threshold for sepsis detection (fraction)"
    }
  ],
  // Note: The following scenarios reference array/object constants and need special handling
  "Toxicology Radiation Dose": [
    {
      file: "src/sim/systemic-toxicology.ts",
      name: "INGESTED_TOXIN_PROFILES[4].irreversibleRate_Q",
      currentValue: 100, // q(0.010) * SCALE.Q
      line: 185,
      type: "q",
      fractionalValue: 0.010,
      description: "Irreversible dose accumulation rate per second for radiation_dose toxin (fraction)"
    }
  ],
  "Hazard Fatigue Drain": [
    {
      file: "src/sim/hazard.ts",
      name: "BASE_EFFECTS.fire.fatigueInc_Q",
      currentValue: 200, // q(0.020) * SCALE.Q
      line: 96,
      type: "q",
      fractionalValue: 0.020,
      description: "Fatigue increase per second at full fire exposure (fraction)"
    }
  ],
  "Disease Mortality Rate": [
    {
      file: "src/sim/disease.ts",
      name: "DISEASE_PROFILES[2].mortalityRate_Q",
      currentValue: 6000, // q(0.60) * SCALE.Q
      line: 153,
      type: "q",
      fractionalValue: 0.60,
      description: "Mortality rate for pneumonic plague (fraction)"
    }
  ],
  "Movement Energy Cost (AddBiomechanics)": [
    {
      file: "src/sim/step/energy.ts",
      name: "BASE_IDLE_W",
      currentValue: 80,
      line: 11,
      type: "numeric",
      description: "Base idle power demand (watts)"
    }
  ],
  "Projectile Drag (BVR Air Combat)": [
    {
      file: "src/equipment.ts",
      name: "rng_pistol.dragCoeff_perM",
      currentValue: 200, // q(0.002) * SCALE.Q
      line: 726,
      type: "q",
      fractionalValue: 0.002,
      description: "Drag coefficient per metre for pistol projectile (fraction)"
    }
  ],
  "Jump Height (Sports Science Literature)": [
    {
      file: "src/derive.ts",
      name: "JUMP_ENERGY_FRACTION",
      currentValue: 283, // q(0.0283) * SCALE.Q
      line: 18,
      type: "q",
      fractionalValue: 0.0283,
      description: "Fraction of reserve energy that can be spent on a single jump (fraction)"
    },
    {
      file: "src/units.ts",
      name: "G_mps2",
      currentValue: 98067,
      line: 16,
      type: "numeric",
      description: "Gravitational acceleration (m/s² scaled by SCALE.mps2)"
    }
  ],
  "Muscle Force Scaling Exponent (OpenArm)": [
    {
      file: "src/archetypes.ts",
      name: "actuatorScaleVar",
      currentValue: 1800, // q(0.18) * SCALE.Q
      line: 83,
      type: "q",
      fractionalValue: 0.18,
      description: "Coefficient of variation for actuator strength (fraction)"
    },
    {
      file: "src/archetypes.ts",
      name: "actuatorMassFrac",
      currentValue: 4000, // q(0.40) * SCALE.Q
      line: 86,
      type: "q",
      fractionalValue: 0.40,
      description: "Fraction of total mass that is actuator/muscle (fraction)"
    }
  ],
  "Muscle Force Coefficient of Variation (OpenArm)": [
    {
      file: "src/archetypes.ts",
      name: "actuatorScaleVar",
      currentValue: 1800, // q(0.18) * SCALE.Q
      line: 83,
      type: "q",
      fractionalValue: 0.18,
      description: "Coefficient of variation for actuator strength (fraction)"
    },
    {
      file: "src/archetypes.ts",
      name: "peakForceVar",
      currentValue: 2200, // q(0.22) * SCALE.Q
      line: 90,
      type: "q",
      fractionalValue: 0.22,
      description: "Coefficient of variation for peak force (fraction)"
    }
  ],
} as const;

// -----------------------------------------------------------------------------
// Helper functions
// -----------------------------------------------------------------------------

/**
 * Get constant references for a scenario name.
 * Returns empty array if scenario not found or not mapped.
 */
export function getConstantsForScenario(scenarioName: string): ConstantReference[] {
  return SCENARIO_CONSTANT_MAP[scenarioName]?.slice() || [];
}

/**
 * Compute suggested new value for a constant based on deviation ratio.
 * Returns null if ratio cannot be computed (division by zero, invalid inputs).
 */
export function computeConstantSuggestion(
  currentValue: number,
  empiricalMean: number,
  simulatedMean: number,
  constantType: 'q' | 'numeric'
): number | null {
  if (simulatedMean === 0) return null;
  const ratio = empiricalMean / simulatedMean;
  const suggested = Math.round(currentValue * ratio);

  // For Q constants, clamp to valid Q range [0, SCALE.Q]
  if (constantType === 'q') {
    return Math.max(0, Math.min(suggested, SCALE.Q));
  }
  return suggested;
}

/**
 * Format a constant suggestion as a markdown bullet point.
 */
export function formatConstantSuggestion(
  ref: ConstantReference,
  suggestedValue: number
): string {
  const current = ref.currentValue;
  const change = suggestedValue - current;
  const percent = current !== 0 ? (change / current * 100).toFixed(1) : "∞";
  const sign = change >= 0 ? "+" : "";

  let valueDisplay = suggestedValue.toString();
  if (ref.type === 'q' && ref.fractionalValue !== undefined) {
    const suggestedFraction = suggestedValue / SCALE.Q;
    valueDisplay = `${suggestedValue} (${suggestedFraction.toFixed(4)})`;
  }

  return `- **${ref.name}** (${ref.file}:${ref.line}): ${current} → ${valueDisplay} (${sign}${percent}%)`;
}

/**
 * Generate markdown suggestions for all constants in a scenario.
 * Returns empty string if no constants mapped or all suggestions null.
 */
export function generateConstantSuggestions(
  scenarioName: string,
  simulatedMean: number,
  empiricalMean: number
): string {
  const constants = getConstantsForScenario(scenarioName);
  if (constants.length === 0) return '';

  const suggestions: string[] = [];
  for (const ref of constants) {
    const suggested = computeConstantSuggestion(
      ref.currentValue,
      empiricalMean,
      simulatedMean,
      ref.type
    );
    if (suggested !== null) {
      suggestions.push(formatConstantSuggestion(ref, suggested));
    }
  }

  if (suggestions.length === 0) return '';

  return `## Suggested Constant Adjustments\n\n${suggestions.join('\n')}\n`;
}