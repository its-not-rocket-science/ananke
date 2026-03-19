// examples/quickstart-species.ts — Path C: Physiology / species modelling
//
// Generate a human character, apply 40 years of aging, then simulate 24 hours
// of sleep deprivation.  Print the resulting attribute sheet in plain English.
//
// Run:  npm run build && node dist/examples/quickstart-species.js [seed]

import { q, SCALE, from }            from "../src/units.js";
import { HUMAN_BASE }                from "../src/archetypes.js";
import { generateIndividual }        from "../src/generate.js";
import { applyAgingToAttributes,
         getAgePhase }               from "../src/sim/aging.js";
import { applySleepToAttributes,
         deriveSleepDeprivationMuls,
         IMPAIR_THRESHOLD_S,
         type SleepState }           from "../src/sim/sleep.js";
import { describeCharacter,
         formatCharacterSheet,
         formatOneLine }             from "../src/describe.js";

declare const process: { argv?: string[] } | undefined;
const SEED     = parseInt(typeof process !== "undefined" ? (process.argv?.[2] ?? "1") : "1", 10);
const AGE      = 40;   // years
const AWAKE_S  = 24 * 3600;  // 24 hours without sleep

// ── Generate a base human ─────────────────────────────────────────────────────

const base = generateIndividual(SEED, HUMAN_BASE);

// ── Apply aging ───────────────────────────────────────────────────────────────

const aged     = applyAgingToAttributes(base, AGE);
const agePhase = getAgePhase(AGE);

// ── Simulate 24-hour sleep deprivation ───────────────────────────────────────
// awakeSeconds > IMPAIR_THRESHOLD_S (17 h) → impairment kicks in

const sleepState: SleepState = {
  phase:        "awake",
  phaseSeconds: AWAKE_S,
  sleepDebt_s:  Math.max(0, AWAKE_S - 16 * 3600),  // debt from hours beyond optimal
  awakeSeconds: AWAKE_S,
};

const muls    = deriveSleepDeprivationMuls(sleepState);
const depleted = applySleepToAttributes(aged, sleepState);

// ── Describe ──────────────────────────────────────────────────────────────────

const baseDesc  = describeCharacter(base);
const finalDesc = describeCharacter(depleted);

console.log(`\nAnanke — Species quickstart (seed ${SEED})\n`);
console.log(`Character: human, ${AGE} years old (${agePhase} life stage), awake for 24 hours\n`);

console.log(`── Base attributes (unaged, rested) ─────────────────────────────`);
console.log(`   Peak force:     ${from.N(base.performance.peakForce_N).toFixed(0)} N  |  Peak power: ${from.W(base.performance.peakPower_W).toFixed(0)} W`);
console.log(`   Reaction time:  ${from.s(base.control.reactionTime_s).toFixed(3)} s  |  Stability:  ${((base.control.stability / SCALE.Q) * 100).toFixed(0)}%`);
console.log(`   Summary: ${formatOneLine(baseDesc)}\n`);

console.log(`── After 40-year aging + 24-hour sleep deprivation ──────────────`);
console.log(`   Peak force:     ${from.N(depleted.performance.peakForce_N).toFixed(0)} N  |  Peak power: ${from.W(depleted.performance.peakPower_W).toFixed(0)} W`);
console.log(`   Reaction time:  ${from.s(depleted.control.reactionTime_s).toFixed(3)} s  |  Stability:  ${((depleted.control.stability / SCALE.Q) * 100).toFixed(0)}%`);
console.log(`   Summary: ${formatOneLine(finalDesc)}\n`);

console.log(`── Sleep deprivation multipliers ────────────────────────────────`);
console.log(`   Cognition (fluid): ${((muls.cognitionFluid_Q / SCALE.Q) * 100).toFixed(0)}% of rested capacity`);
console.log(`   Reaction time:     ${((muls.reactionTime_Q  / SCALE.Q) * 100).toFixed(0)}% (>100% = slower)`);
console.log(`   Stability:         ${((muls.stability_Q     / SCALE.Q) * 100).toFixed(0)}% of rested capacity`);

console.log(`\n── Full character sheet ─────────────────────────────────────────`);
console.log(formatCharacterSheet(finalDesc));
