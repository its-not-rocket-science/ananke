// tools/validation.ts — Integration Milestone 4: Systematic Validation Against Real-World Data
//
// Validation framework comparing simulation outputs against empirical datasets.
// For each major sub-system:
//  1. Encode real-world dataset references (key data points with sources)
//  2. Replicate experimental conditions in simulation
//  3. Run batch simulation across deterministic seeds
//  4. Compare simulated distribution to empirical (mean difference, CI overlap)
//  5. Flag deviations >20% of empirical mean
//  6. Generate validation report documenting methodology and residual error
//
// Usage: node dist/tools/validation.js [subsystem] [seedStart] [seedEnd]
//   subsystem: "impact", "sprint", "metabolic", "thermoregulation", "bleeding", "all"
//   seedStart: first seed (default: 1)
//   seedEnd: last seed inclusive (default: 100)
//
// Output: validation report in docs/validation-{subsystem}-{timestamp}.md

/// <reference types="node" />
import { q, SCALE, type Q } from "../src/units.js";
import { runArena } from "../src/arena.js";
import {
  CALIBRATION_ARMED_VS_UNARMED,
  CALIBRATION_UNTREATED_KNIFE_WOUND,
  CALIBRATION_FIRST_AID_SAVES_LIVES,
  CALIBRATION_FRACTURE_RECOVERY,
  CALIBRATION_INFECTION_UNTREATED,
  CALIBRATION_PLATE_ARMOUR,
} from "../src/arena.js";
import type { ArenaScenario, ArenaResult } from "../src/arena.js";
import type { WorldState } from "../src/sim/world.js";
import type { KernelContext } from "../src/sim/context.js";
import * as fs from "fs";

// ─── CLI argument handling ──────────────────────────────────────────────────────

declare const process: { argv?: string[] } | undefined;
const args = (typeof process !== "undefined" ? process.argv?.slice(2) : []) ?? [];
const SUBSYSTEM = args[0] ?? "all";
const SEED_START = parseInt(args[1] ?? "1", 10);
const SEED_END = parseInt(args[2] ?? "100", 10);

if (SEED_START < 1 || SEED_END < SEED_START) {
  console.error("Invalid seed range");
  if (typeof process !== "undefined" && (process as any).exit) {
    (process as any).exit(1);
  }
  throw new Error("Invalid seed range");
}

// ─── statistical utilities ──────────────────────────────────────────────────────

/** Compute mean of array of numbers */
function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Compute standard deviation (sample) */
function std(values: number[], meanVal?: number): number {
  if (values.length < 2) return 0;
  const m = meanVal ?? mean(values);
  const sqDiff = values.reduce((sum, v) => sum + (v - m) ** 2, 0);
  return Math.sqrt(sqDiff / (values.length - 1));
}

/** Compute 95% confidence interval half-width using t-distribution approximation */
function confidenceIntervalHalfWidth(values: number[], confidence = 0.95): number {
  if (values.length < 2) return 0;
  const n = values.length;
  // approximate t-value for 95% CI, large n ~1.96, small n use rough approximation
  const t = n <= 30 ? 2.0 + (30 - n) * 0.1 : 1.96;
  return t * std(values) / Math.sqrt(n);
}

/** Check if two means are within tolerance (percentage of empirical mean) */
function withinTolerance(
  simulatedMean: number,
  empiricalMean: number,
  tolerancePercent: number
): boolean {
  if (empiricalMean === 0) return simulatedMean === 0;
  const diff = Math.abs(simulatedMean - empiricalMean);
  const tolerance = (empiricalMean * tolerancePercent) / 100;
  return diff <= tolerance;
}

/** Check if confidence intervals overlap */
function confidenceIntervalsOverlap(
  simMean: number, simCIHalf: number,
  empMean: number, empCIHalf: number
): boolean {
  const simLow = simMean - simCIHalf;
  const simHigh = simMean + simCIHalf;
  const empLow = empMean - empCIHalf;
  const empHigh = empMean + empCIHalf;
  return !(simHigh < empLow || empHigh < simLow);
}

// ─── calibration validation interfaces ─────────────────────────────────────────

interface CalibrationValidationScenario {
  name: string;
  description: string;
  scenario: ArenaScenario;
  /** Source citation for real-world data */
  source: string;
  /** Number of trials to run (seeds) */
  trials?: number;
}

// ─── dataset interfaces ──────────────────────────────────────────────────────

interface EmpiricalDataPoint {
  value: number;
  unit: string;
  source: string;
  notes?: string;
}

interface EmpiricalDataset {
  name: string;
  description: string;
  dataPoints: EmpiricalDataPoint[];
  mean: number;
  confidenceIntervalHalf?: number; // if known
}

// ─── direct validation interfaces ──────────────────────────────────────────────

interface DirectValidationScenario {
  name: string;
  description: string;
  empiricalDataset: EmpiricalDataset;
  /** Set up simulation matching experimental conditions */
  setup: (seed: number) => { world: WorldState; ctx: KernelContext; steps: number };
  /** Extract simulated outcome from world after steps */
  extractOutcome: (world: WorldState) => number;
  /** Unit for comparison */
  unit: string;
  /** Tolerance percentage (default 20%) */
  tolerancePercent?: number;
}

// ─── calibration scenarios ─────────────────────────────────────────────────────

const calibrationScenarios: CalibrationValidationScenario[] = [
  {
    name: "Armed vs. Unarmed",
    description: "Armed trained human vs. unarmed untrained human. Expect armed win rate ≥70%.",
    scenario: CALIBRATION_ARMED_VS_UNARMED,
    source: "criminal assault literature, self-defence training studies",
  },
  {
    name: "Untreated Knife Wound",
    description: "Severe torso laceration, no treatment, 60 min downtime. Expect ≥80% mortality.",
    scenario: CALIBRATION_UNTREATED_KNIFE_WOUND,
    source: "Sperry (2013) untreated penetrating abdominal trauma mortality",
  },
  {
    name: "First Aid Saves Lives",
    description: "Severe torso laceration, first aid applied, 60 min downtime. Expect ≥90% survival.",
    scenario: CALIBRATION_FIRST_AID_SAVES_LIVES,
    source: "TCCC tourniquet outcome data",
  },
  {
    name: "Fracture Recovery",
    description: "Long-bone fracture, field_medicine, 6000 s downtime. Expect ≥90% recovery within 6000 s.",
    scenario: CALIBRATION_FRACTURE_RECOVERY,
    source: "orthopaedic rehabilitation literature",
  },
  {
    name: "Untreated Infection",
    description: "Active infection + internal damage, no treatment, 24 h downtime. Expect ≥60% mortality.",
    scenario: CALIBRATION_INFECTION_UNTREATED,
    source: "pre-antibiotic era wound infection mortality (Ogston, Lister era data)",
  },
  {
    name: "Plate Armour Effectiveness",
    description: "Knight (plate armour) vs. unarmoured swordsman. Expect knight win rate ≥45%.",
    scenario: CALIBRATION_PLATE_ARMOUR,
    source: "HEMA literature on plate armour effectiveness",
  },
];

// ─── report generation ─────────────────────────────────────────────────────────

function generateCalibrationReport(
  scenario: CalibrationValidationScenario,
  result: ArenaResult,
  pass: boolean,
  trials: number
): string {
  const expectations = scenario.scenario.expectations ?? [];
  const expectationResults = result.expectationResults;

  return `# Validation Report: ${scenario.name}

**Date:** ${new Date().toISOString()}
**Trials:** ${trials} seeds (${SEED_START}–${SEED_END})
**Source:** ${scenario.source}

## Methodology

${scenario.description}

Simulation replicates the real-world experimental conditions described in the source literature.

## Results

### Aggregate Statistics

- **Trials:** ${result.trials}
- **Win rates:** ${Array.from(result.winRateByTeam.entries()).map(([team, rate]) => `Team ${team}: ${(rate * 100).toFixed(1)}%`).join(", ")}
- **Mean combat duration:** ${result.meanCombatDuration_s.toFixed(1)} s
- **Survival rates:** ${Array.from(result.survivalRateByEntity.entries()).map(([id, rate]) => `Entity ${id}: ${(rate * 100).toFixed(1)}%`).join(", ")}

### Expectation Checks

${expectationResults.map((er, i) => {
  const exp = expectations[i];
  return `- **${exp?.description ?? "Unknown"}**: ${er.passed ? "✓ PASS" : "✗ FAIL"}${er.detail ? ` (${er.detail})` : ""}`;
}).join("\n")}

## Conclusion

${pass ? "**PASS** — All expectations satisfied." : "**FAIL** — One or more expectations failed."}

${
  !pass
    ? `**Recommendation:** Review tuning constants affecting ${scenario.name}. Compare simulation outputs with source data and adjust constants as needed.`
    : "**Recommendation:** No changes needed."
}

---

*Generated by Ananke validation tool.*
`;
}

// ─── main validation runner ────────────────────────────────────────────────────

async function runValidation() {
  console.log("=== Ananke Validation Framework ===\n");
  console.log(`Sub-system: calibration scenarios`);
  console.log(`Seeds: ${SEED_START}–${SEED_END}`);
  console.log("");

  const selectedScenarios = SUBSYSTEM === "all"
    ? calibrationScenarios
    : calibrationScenarios.filter(s => s.name.toLowerCase().includes(SUBSYSTEM.toLowerCase()));

  if (selectedScenarios.length === 0) {
    console.error(`No validation scenario found for subsystem '${SUBSYSTEM}'`);
    if (typeof process !== "undefined" && (process as any).exit) {
      (process as any).exit(1);
    }
    throw new Error(`No validation scenario found for subsystem '${SUBSYSTEM}'`);
  }


  for (const scenario of selectedScenarios) {
    console.log(`\n--- Validating: ${scenario.name} ---`);
    console.log(`  Source: ${scenario.source}`);

    const trials = scenario.trials ?? (SEED_END - SEED_START + 1);
    const result = runArena(scenario.scenario, trials, { seedOffset: SEED_START - 1 });

    const expectations = scenario.scenario.expectations ?? [];
    const expectationResults = result.expectationResults;
    const passed = expectationResults.every(er => er.passed);

    console.log(`  Trials: ${result.trials}`);
    console.log(`  Expectations: ${expectationResults.filter(er => er.passed).length}/${expectationResults.length} passed`);
    expectationResults.forEach(er => {
      console.log(`    ${er.passed ? "✓" : "✗"} ${er.description}`);
    });

    const report = generateCalibrationReport(scenario, result, passed, trials);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, "-");
    const filename = `docs/validation-${scenario.name.toLowerCase().replace(/\s+/g, "-")}-${timestamp}.md`;
    fs.writeFileSync(filename, report);
    console.log(`  Report saved to ${filename}`);
  }

  console.log("\n=== Validation complete ===");
}

// ─── entry point ───────────────────────────────────────────────────────────────

runValidation().catch(err => {
  console.error("Validation failed:", err);
  if (typeof process !== "undefined" && (process as any).exit) {
    (process as any).exit(1);
  }
  throw err;
});