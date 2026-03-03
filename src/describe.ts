import { SCALE } from "./units.js";
import type { IndividualAttributes } from "./types.js";

export type Tier = 1 | 2 | 3 | 4 | 5 | 6;

export interface AttributeRating {
  tier: Tier;
  label: string;
  comparison: string;
  value: string;
}

export interface CharacterDescription {
  stature: string;
  mass: string;

  strength: AttributeRating;
  explosivePower: AttributeRating;
  endurance: AttributeRating;
  stamina: AttributeRating;

  reactionTime: AttributeRating;
  coordination: AttributeRating;
  balance: AttributeRating;
  precision: AttributeRating;

  painTolerance: AttributeRating;
  toughness: AttributeRating;
  concussionResistance: AttributeRating;

  visionRange: string;
  hearingRange: string;
  decisionSpeed: AttributeRating;
}

// breaks = [t1_max, t2_max, t3_max, t4_max, t5_max]
// value < breaks[0] → tier 1, …, value >= breaks[4] → tier 6
function rateTier(value: number, breaks: [number, number, number, number, number]): Tier {
  if (value < breaks[0]) return 1;
  if (value < breaks[1]) return 2;
  if (value < breaks[2]) return 3;
  if (value < breaks[3]) return 4;
  if (value < breaks[4]) return 5;
  return 6;
}

// For inverted attrs (lower = better)
// breaks = [t6_max, t5_max, t4_max, t3_max, t2_max] (ascending)
// value < breaks[0] → tier 6, …, value >= breaks[4] → tier 1
function rateInverted(value: number, breaks: [number, number, number, number, number]): Tier {
  if (value < breaks[0]) return 6;
  if (value < breaks[1]) return 5;
  if (value < breaks[2]) return 4;
  if (value < breaks[3]) return 3;
  if (value < breaks[4]) return 2;
  return 1;
}

// Breakpoints in fixed-point units

// peakForce_N: fp = N * SCALE.N (100) — tiers at 500/1100/2000/3500/5500 N
const FORCE_BREAKS: [number, number, number, number, number] = [50_000, 110_000, 200_000, 350_000, 550_000];

// peakPower_W: SCALE.W=1 — tiers at 400/800/1400/2000/3000 W
const POWER_BREAKS: [number, number, number, number, number] = [400, 800, 1_400, 2_000, 3_000];

// continuousPower_W — tiers at 80/150/260/380/600 W
const CONT_BREAKS: [number, number, number, number, number] = [80, 150, 260, 380, 600];

// reserveEnergy_J: SCALE.J=1 — tiers at 8/15/23/38/58 kJ
const ENERGY_BREAKS: [number, number, number, number, number] = [8_000, 15_000, 23_000, 38_000, 58_000];

// reactionTime_s (inverted): SCALE.s=10000 — ascending [t6_max…t2_max] in fp
// tiers (seconds): <0.12 | 0.12–0.17 | 0.17–0.22 | 0.22–0.30 | 0.30–0.45 | >0.45
const REACT_BREAKS: [number, number, number, number, number] = [1_200, 1_700, 2_200, 3_000, 4_500];

// Q attrs 0–1 (controlQuality, stability, fineControl): SCALE.Q=10000
// tiers: <0.35 | 0.35–0.58 | 0.58–0.78 | 0.78–0.87 | 0.87–0.93 | >0.93
const Q_BREAKS: [number, number, number, number, number] = [3_500, 5_800, 7_800, 8_700, 9_300];

// resilience Q attrs (distressTolerance, shockTolerance, concussionTolerance)
// tiers: <0.25 | 0.25–0.45 | 0.45–0.62 | 0.62–0.75 | 0.75–0.88 | >0.88
const RES_BREAKS: [number, number, number, number, number] = [2_500, 4_500, 6_200, 7_500, 8_800];

// decisionLatency_s (inverted): SCALE.s=10000 — ascending [t6_max…t2_max] in fp
// tiers (seconds): <0.08 | 0.08–0.30 | 0.30–0.46 | 0.46–0.56 | 0.56–0.80 | >0.80
const DECISION_BREAKS: [number, number, number, number, number] = [800, 3_000, 4_600, 5_600, 8_000];

// Labels indexed by (tier - 1)
const PERF_LABELS  = ["feeble", "weak", "average", "strong", "excellent", "exceptional"] as const;
const SPEED_LABELS = ["sluggish", "slow", "average", "quick", "fast", "instant"] as const;
const CTRL_LABELS  = ["erratic", "poor", "average", "precise", "refined", "masterful"] as const;
const RES_LABELS   = ["fragile", "low", "average", "resilient", "tough", "ironclad"] as const;
const COG_LABELS   = ["sluggish", "slow", "average", "sharp", "razor-sharp", "machine-like"] as const;

const FORCE_COMPARISONS = [
  "weaker than most children",
  "sedentary adult — below average output",
  "average adult — baseline human force",
  "trained athlete or competitive fighter",
  "elite level — professional fighter strength",
  "superhuman or powered — beyond biological norms",
] as const;

const POWER_COMPARISONS = [
  "minimal power output",
  "below average explosive output",
  "moderate explosive output",
  "strong explosive performance",
  "elite explosive output",
  "extreme power — mechanical or enhanced",
] as const;

const CONT_COMPARISONS = [
  "very limited aerobic capacity",
  "below average aerobic output",
  "sustainable aerobic output",
  "strong sustained performance",
  "elite endurance athlete level",
  "extraordinary sustained output",
] as const;

const ENERGY_COMPARISONS = [
  "very low energy reserves",
  "below average combat stamina",
  "typical combat energy reserves",
  "good combat energy reserves",
  "exceptional energy reserves",
  "extraordinary — far beyond normal capacity",
] as const;

const REACT_COMPARISONS = [
  "very slow reflexes",
  "below average response time",
  "average adult response time",
  "trained athlete response time",
  "elite combat reflexes",
  "machine-speed response",
] as const;

const CTRL_COMPARISONS = [
  "very poor motor control",
  "below average movement quality",
  "competent general movement",
  "skilled coordinated movement",
  "highly refined motor control",
  "near-perfect motor precision",
] as const;

const STABILITY_COMPARISONS = [
  "very poor balance",
  "below average stability",
  "normal postural stability",
  "good balance and stability",
  "excellent balance and body control",
  "extraordinary stability",
] as const;

const FINE_COMPARISONS = [
  "very clumsy fine motor",
  "below average manual dexterity",
  "everyday manual dexterity",
  "skilled fine motor control",
  "exceptional precision",
  "near-surgical precision",
] as const;

const PAIN_COMPARISONS = [
  "extremely pain-sensitive",
  "below average pain threshold",
  "typical distress threshold",
  "trained pain tolerance",
  "high pain threshold",
  "extreme pain suppression",
] as const;

const SHOCK_COMPARISONS = [
  "very fragile to shock",
  "below average shock resistance",
  "normal shock resistance",
  "trained shock absorption",
  "high shock resistance",
  "extreme shock tolerance",
] as const;

const CONC_COMPARISONS = [
  "very vulnerable to head trauma",
  "below average concussion resistance",
  "standard skull protection",
  "above average head protection",
  "high concussion resistance",
  "exceptional — distributed or no central brain",
] as const;

const DECISION_COMPARISONS = [
  "extremely slow decision making",
  "slow tactical processing",
  "normal human deliberation time",
  "quick tactical processing",
  "fast tactical decisions",
  "machine-speed decision making",
] as const;

// Value formatters
function fmtN(fp: number): string  { return `${Math.round(fp / SCALE.N)} N`; }
function fmtW(fp: number): string  { return `${fp} W`; }
function fmtJ(fp: number): string  { return fp >= 1000 ? `${(fp / 1000).toFixed(0)} kJ` : `${fp} J`; }
function fmtMs(fp: number): string { return `${Math.round((fp / SCALE.s) * 1000)} ms`; }
function fmtQ(fp: number): string  { return `${(fp / SCALE.Q).toFixed(2)}`; }
function fmtM(fp: number): string  { return `${(fp / SCALE.m).toFixed(2)} m`; }
function fmtKg(fp: number): string { return `${(fp / SCALE.kg).toFixed(1)} kg`; }

function makeRating(
  tier: Tier,
  labels: readonly string[],
  comparisons: readonly string[],
  value: string,
): AttributeRating {
  return {
    tier,
    label: labels[tier - 1] ?? "",
    comparison: comparisons[tier - 1] ?? "",
    value,
  };
}

function describeStature(fp: number): string {
  let label: string;
  if (fp < 14_000) label = "very short";
  else if (fp <= 16_000) label = "short";
  else if (fp < 18_000) label = "average height";
  else if (fp < 19_500) label = "tall";
  else label = "very tall";
  return `${fmtM(fp)} — ${label}`;
}

function describeMass(fp: number): string {
  let label: string;
  if (fp < 50_000) label = "slight build";
  else if (fp < 65_000) label = "lean build";
  else if (fp < 90_000) label = "average build";
  else if (fp < 115_000) label = "heavy build";
  else label = "very heavy build";
  return `${fmtKg(fp)} — ${label}`;
}

export function describeCharacter(attrs: IndividualAttributes): CharacterDescription {
  const { morphology, performance, control, resilience, perception } = attrs;

  const strengthTier = rateTier(performance.peakForce_N, FORCE_BREAKS);
  const powerTier    = rateTier(performance.peakPower_W, POWER_BREAKS);
  const endTier      = rateTier(performance.continuousPower_W, CONT_BREAKS);
  const stamTier     = rateTier(performance.reserveEnergy_J, ENERGY_BREAKS);

  const reactTier  = rateInverted(control.reactionTime_s, REACT_BREAKS);
  const coordTier  = rateTier(control.controlQuality, Q_BREAKS);
  const balTier    = rateTier(control.stability, Q_BREAKS);
  const precTier   = rateTier(control.fineControl, Q_BREAKS);

  const painTier   = rateTier(resilience.distressTolerance, RES_BREAKS);
  const toughTier  = rateTier(resilience.shockTolerance, RES_BREAKS);
  const concTier   = rateTier(resilience.concussionTolerance, RES_BREAKS);

  const decTier    = rateInverted(perception.decisionLatency_s, DECISION_BREAKS);

  return {
    stature: describeStature(morphology.stature_m),
    mass:    describeMass(morphology.mass_kg),

    strength:      makeRating(strengthTier, PERF_LABELS, FORCE_COMPARISONS,  fmtN(performance.peakForce_N)),
    explosivePower: makeRating(powerTier,   PERF_LABELS, POWER_COMPARISONS,  fmtW(performance.peakPower_W)),
    endurance:     makeRating(endTier,      PERF_LABELS, CONT_COMPARISONS,   fmtW(performance.continuousPower_W)),
    stamina:       makeRating(stamTier,     PERF_LABELS, ENERGY_COMPARISONS, fmtJ(performance.reserveEnergy_J)),

    reactionTime:  makeRating(reactTier,  SPEED_LABELS, REACT_COMPARISONS,     fmtMs(control.reactionTime_s)),
    coordination:  makeRating(coordTier,  CTRL_LABELS,  CTRL_COMPARISONS,      fmtQ(control.controlQuality)),
    balance:       makeRating(balTier,    CTRL_LABELS,  STABILITY_COMPARISONS, fmtQ(control.stability)),
    precision:     makeRating(precTier,   CTRL_LABELS,  FINE_COMPARISONS,      fmtQ(control.fineControl)),

    painTolerance:        makeRating(painTier,  RES_LABELS, PAIN_COMPARISONS,  fmtQ(resilience.distressTolerance)),
    toughness:            makeRating(toughTier, RES_LABELS, SHOCK_COMPARISONS, fmtQ(resilience.shockTolerance)),
    concussionResistance: makeRating(concTier,  RES_LABELS, CONC_COMPARISONS,  fmtQ(resilience.concussionTolerance)),

    visionRange:  `${Math.round(perception.visionRange_m / SCALE.m)} m, ${perception.visionArcDeg}\u00b0 arc`,
    hearingRange: `${Math.round(perception.hearingRange_m / SCALE.m)} m`,
    decisionSpeed: makeRating(decTier, COG_LABELS, DECISION_COMPARISONS, fmtMs(perception.decisionLatency_s)),
  };
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

export function formatCharacterSheet(desc: CharacterDescription): string {
  const row = (name: string, r: AttributeRating) =>
    `  ${pad(name + ":", 14)}${pad(r.value, 12)} [${r.label}]    ${r.comparison}`;

  return [
    "Body",
    `  Stature:      ${desc.stature}`,
    `  Mass:         ${desc.mass}`,
    "",
    "Performance",
    row("Strength",  desc.strength),
    row("Power",     desc.explosivePower),
    row("Endurance", desc.endurance),
    row("Stamina",   desc.stamina),
    "",
    "Control",
    row("Reaction",     desc.reactionTime),
    row("Coordination", desc.coordination),
    row("Balance",      desc.balance),
    row("Precision",    desc.precision),
    "",
    "Resilience",
    row("Pain",       desc.painTolerance),
    row("Toughness",  desc.toughness),
    row("Concussion", desc.concussionResistance),
    "",
    "Perception",
    `  Vision:       ${desc.visionRange}`,
    `  Hearing:      ${desc.hearingRange}`,
    row("Decision",   desc.decisionSpeed),
  ].join("\n");
}

export function formatOneLine(desc: CharacterDescription): string {
  const statureParts = desc.stature.split(" — ");
  const statureM   = statureParts[0] ?? desc.stature;
  const statureLbl = statureParts[1] ?? "";
  const capLbl = statureLbl.charAt(0).toUpperCase() + statureLbl.slice(1);
  const massKg = desc.mass.split(" — ")[0] ?? desc.mass;

  return (
    `${capLbl} (${statureM}), ${massKg}; ` +
    `strength ${desc.strength.label} (${desc.strength.value}), ` +
    `reaction ${desc.reactionTime.label} (${desc.reactionTime.value}), ` +
    `resilience ${desc.painTolerance.label}.`
  );
}
