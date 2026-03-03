// src/downtime.ts — Phase 19: Downtime & Recovery Simulation
//
// Time-scale bridge between 20 Hz combat and hours-to-days wound recovery.
// Each 1-second simulation step applies the same physics as 1 kernel tick,
// giving 20× slower wall-clock healing than real-time combat — appropriate
// for the hours-to-days recovery scale.
//
// No kernel import — only types and rate constants are used from engine modules.

import { q, clampQ, qMul, mulDiv, SCALE, type Q } from "./units.js";
import type { InjuryState, RegionInjury } from "./sim/injury.js";
import { FRACTURE_THRESHOLD } from "./sim/injury.js";
import type { MedicalTier } from "./sim/medical.js";
import { TIER_MUL } from "./sim/medical.js";
import type { WorldState } from "./sim/world.js";
import { DT_S } from "./sim/tick.js";

// ── Medical resource catalogue ───────────────────────────────────────────────

export interface MedicalResource {
  id: string;
  name: string;
  tier: MedicalTier;
  /** Abstract cost units — host maps to currency of choice. */
  costUnits: number;
  massGrams: number;
}

export const MEDICAL_RESOURCES: MedicalResource[] = [
  { id: "bandage",         name: "Field bandage",       tier: "bandage",      costUnits: 1,    massGrams: 50   },
  { id: "suture_kit",      name: "Suture kit",          tier: "bandage",      costUnits: 8,    massGrams: 100  },
  { id: "surgical_kit",    name: "Surgical kit",        tier: "surgicalKit",  costUnits: 60,   massGrams: 2000 },
  { id: "antibiotic_dose", name: "Antibiotic dose",     tier: "surgicalKit",  costUnits: 15,   massGrams: 50   },
  { id: "iv_fluid_bag",    name: "IV fluid bag",        tier: "autodoc",      costUnits: 25,   massGrams: 500  },
  { id: "autodoc_pack",    name: "Autodoc consumable",  tier: "autodoc",      costUnits: 250,  massGrams: 500  },
  { id: "nanomed_dose",    name: "Nanomed dose",        tier: "nanomedicine", costUnits: 2000, massGrams: 50   },
];

const RESOURCE_BY_ID = new Map(MEDICAL_RESOURCES.map(r => [r.id, r]));

// ── Public types ─────────────────────────────────────────────────────────────

/**
 * Preset care levels: what treatment is available and applied automatically.
 */
export type CareLevel =
  | "none"           // natural clotting only; no intervention
  | "first_aid"      // bandage to each bleeding region as soon as possible
  | "field_medicine" // first_aid + surgical kit for fractures + antibiotics for infection
  | "hospital"       // field_medicine + IV fluid replacement for shock/fluid loss
  | "autodoc";       // all of the above at maximum tier

export interface TreatmentSchedule {
  careLevel: CareLevel;
  /** Seconds post-combat before first treatment can be applied. Default: 0. */
  onsetDelay_s?: number;
  /** Item inventory; if undefined, assume unlimited supply. */
  inventory?: Map<string, number>;
}

export interface DowntimeConfig {
  /** entityId → treatment schedule. Entities not in this map are skipped. */
  treatments: Map<number, TreatmentSchedule>;
  ambientTemperature_Q?: Q;
  /** Entities at rest heal 1.5× faster. */
  rest: boolean;
}

export interface ResourceUsage {
  resourceId: string;
  name: string;
  count: number;
  totalCost: number;
}

/** Lightweight injury snapshot for start/end comparison. */
export interface InjurySummary {
  dead: boolean;
  consciousness: number;           // 0.0–1.0 (real fraction)
  fluidLoss: number;               // 0.0–1.0
  shock: number;                   // 0.0–1.0
  activeBleedingRegions: string[];
  fracturedRegions: string[];
  infectedRegions: string[];
  maxStructuralDamage: number;     // 0.0–1.0 (worst region)
}

export interface EntityRecoveryReport {
  entityId: number;
  elapsedSeconds: number;
  injuryAtStart: InjurySummary;
  injuryAtEnd:   InjurySummary;
  died: boolean;
  bleedingStopped: boolean;    // all bleedingRates reached 0
  infectionCleared: boolean;   // no infected regions at end (regardless of start)
  fracturesSet: boolean;       // at least one surgical kit was used
  combatReadyAt_s: number | null;   // projected seconds to resume light activity; null if fatal
  fullRecoveryAt_s: number | null;  // projected seconds to full structural recovery; null if fatal or no treatment
  resourcesUsed: ResourceUsage[];
  totalCostUnits: number;
  log: Array<{ second: number; text: string }>;
}

// ── Internal rate constants ───────────────────────────────────────────────────
//
// Each 1-second downtime step uses the same constants as 1 kernel tick.
// Sources: src/sim/step/injury.ts (clotting, infection), src/sim/kernel.ts (treatment).

const CLOT_RATE        = q(0.0002) as Q;  // structureIntegrity × this per step → bleed reduction
const INFECT_ONSET_SEC = 100;             // continuous-bleed seconds before infection can start
const INFECT_DMG_RATE  = q(0.0003) as Q; // internal damage added per step while infected
const BANDAGE_RATE     = q(0.0050) as Q; // base bleed reduction per step (bandage tier)
const SURGERY_RATE     = q(0.0020) as Q; // base structural repair per step (surgicalKit tier)
const FLUID_REPL_RATE  = q(0.0050) as Q; // base fluid restoration per step (autodoc tier)
const SHOCK_FROM_FLUID = q(0.0040) as Q; // shock += fluidLoss × this per step
const SHOCK_FROM_INT   = q(0.0020) as Q; // shock += torsoInternal × this per step
const CONSC_FROM_SHOCK = q(0.0100) as Q; // consciousness -= shock × this per step
const FATAL_FLUID      = q(0.80)   as Q;

// ── Internal simulation state ─────────────────────────────────────────────────

interface EState {
  entityId: number;
  injury: InjuryState;
  schedule: TreatmentSchedule;
  /** undefined = unlimited supply */
  inventory: Map<string, number> | undefined;
  usageMap: Map<string, number>;
  log: Array<{ second: number; text: string }>;
  tourniquetedRegions: Set<string>;
  antibioticsApplied: Set<string>;
  surgeryStarted: Set<string>;
  fluidReplStarted: boolean;
  autodocStarted: boolean;
  /** Consecutive seconds each region has been actively bleeding. */
  bleedDurationSec: Map<string, number>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cloneInjury(inj: InjuryState): InjuryState {
  const byRegion: Record<string, RegionInjury> = {};
  for (const [r, ri] of Object.entries(inj.byRegion)) byRegion[r] = { ...ri };
  return { ...inj, byRegion };
}

function captureInjurySummary(inj: InjuryState): InjurySummary {
  const activeBleedingRegions: string[] = [];
  const fracturedRegions: string[]      = [];
  const infectedRegions: string[]       = [];
  let maxStr = 0;
  for (const [r, ri] of Object.entries(inj.byRegion)) {
    if (ri.bleedingRate   > 0)  activeBleedingRegions.push(r);
    if (ri.fractured)           fracturedRegions.push(r);
    if (ri.infectedTick >= 0)   infectedRegions.push(r);
    if (ri.structuralDamage > maxStr) maxStr = ri.structuralDamage;
  }
  return {
    dead:                  inj.dead,
    consciousness:         inj.consciousness  / SCALE.Q,
    fluidLoss:             inj.fluidLoss      / SCALE.Q,
    shock:                 inj.shock          / SCALE.Q,
    activeBleedingRegions,
    fracturedRegions,
    infectedRegions,
    maxStructuralDamage:   maxStr             / SCALE.Q,
  };
}

/** Treatment tier for most actions at a given care level. */
function careTier(care: CareLevel): MedicalTier {
  switch (care) {
    case "first_aid":      return "bandage";
    case "field_medicine": return "surgicalKit";
    case "hospital":       return "surgicalKit";
    case "autodoc":        return "autodoc";
    default:               return "none";
  }
}

/** Treatment tier for fluid replacement (needs autodoc regardless of care level). */
function fluidTier(care: CareLevel): MedicalTier {
  return (care === "hospital" || care === "autodoc") ? "autodoc" : "none";
}

/**
 * Try to consume one unit of a resource from the inventory.
 * Unlimited (undefined inventory) always succeeds and still tracks usage.
 */
function tryConsume(state: EState, resourceId: string): boolean {
  if (state.inventory === undefined) {
    state.usageMap.set(resourceId, (state.usageMap.get(resourceId) ?? 0) + 1);
    return true;
  }
  const avail = state.inventory.get(resourceId) ?? 0;
  if (avail <= 0) return false;
  state.inventory.set(resourceId, avail - 1);
  state.usageMap.set(resourceId, (state.usageMap.get(resourceId) ?? 0) + 1);
  return true;
}

// ── Per-second simulation step ────────────────────────────────────────────────

function stepSecond(state: EState, second: number, config: DowntimeConfig): void {
  const inj = state.injury;
  if (inj.dead) return;

  const onset   = state.schedule.onsetDelay_s ?? 0;
  const restMul = config.rest ? q(1.50) as Q : q(1.0) as Q;

  // ── 1. Natural clotting + infection tracking ──────────────────────────────
  for (const [region, reg] of Object.entries(inj.byRegion)) {
    if (reg.bleedingRate > 0) {
      const integrity = clampQ((SCALE.Q - reg.structuralDamage) as Q, 0, SCALE.Q);
      const clot = mulDiv(qMul(integrity, CLOT_RATE), restMul, SCALE.Q) as Q;
      reg.bleedingRate = clampQ((reg.bleedingRate - clot) as Q, q(0), q(1.0));

      const dur = (state.bleedDurationSec.get(region) ?? 0) + 1;
      state.bleedDurationSec.set(region, dur);
      if (dur >= INFECT_ONSET_SEC
          && reg.internalDamage > q(0.10)
          && reg.infectedTick < 0) {
        reg.infectedTick = second;
        state.log.push({ second, text: `infection onset: ${region}` });
      }
    } else {
      const dur = state.bleedDurationSec.get(region) ?? 0;
      if (dur > 0) state.bleedDurationSec.set(region, dur - 1);
    }

    // Infection damage progression
    if (reg.infectedTick >= 0) {
      reg.internalDamage = clampQ((reg.internalDamage + INFECT_DMG_RATE) as Q, 0, SCALE.Q);
    }
  }

  // ── 2. Treatment (after onset delay) ──────────────────────────────────────
  if (second >= onset && state.schedule.careLevel !== "none") {
    applyTreatment(state, second, restMul);
  }

  // ── 3. Fluid loss from bleeding (same formula as kernel per tick) ──────────
  let totalFluidThisSec: Q = q(0);
  for (const reg of Object.values(inj.byRegion)) {
    if (reg.bleedingRate > 0) {
      totalFluidThisSec = clampQ(
        (totalFluidThisSec + mulDiv(reg.bleedingRate, DT_S, SCALE.s)) as Q,
        0, SCALE.Q,
      );
    }
  }
  inj.fluidLoss = clampQ((inj.fluidLoss + totalFluidThisSec) as Q, 0, SCALE.Q);

  // ── 4. Shock accumulation ─────────────────────────────────────────────────
  const torsoInt = inj.byRegion["torso"]?.internalDamage
    ?? (Object.values(inj.byRegion)[0]?.internalDamage ?? q(0));
  const shockInc = clampQ(
    (qMul(inj.fluidLoss, SHOCK_FROM_FLUID) + qMul(torsoInt as Q, SHOCK_FROM_INT)) as Q,
    0, SCALE.Q,
  );
  inj.shock = clampQ((inj.shock + shockInc) as Q, 0, SCALE.Q);

  // ── 5. Consciousness loss ─────────────────────────────────────────────────
  const conscLoss = qMul(inj.shock, CONSC_FROM_SHOCK);
  inj.consciousness = clampQ((inj.consciousness - conscLoss) as Q, 0, SCALE.Q);

  // ── 6. Death check ────────────────────────────────────────────────────────
  if (inj.fluidLoss >= FATAL_FLUID || inj.shock >= SCALE.Q || inj.consciousness === 0) {
    inj.dead = true;
    inj.consciousness = q(0);
    state.log.push({ second, text: "entity died" });
  }
}

function applyTreatment(state: EState, second: number, restMul: Q): void {
  const inj  = state.injury;
  const care = state.schedule.careLevel;

  const tier      = careTier(care);
  const effectMul = TIER_MUL[tier];
  const bleedRed  = mulDiv(qMul(BANDAGE_RATE, restMul), effectMul, SCALE.Q) as Q;
  const surgRed   = mulDiv(qMul(SURGERY_RATE, restMul), effectMul, SCALE.Q) as Q;

  for (const [region, reg] of Object.entries(inj.byRegion)) {

    // Tourniquet: first time a region is seen bleeding, apply one bandage
    if (reg.bleedingRate > 0 && !state.tourniquetedRegions.has(region)) {
      if (tryConsume(state, "bandage")) {
        state.tourniquetedRegions.add(region);
        reg.bleedingRate    = q(0);
        reg.bleedDuration_ticks = 0;
        state.bleedDurationSec.set(region, 0);
        state.log.push({ second, text: `tourniquet: ${region}` });
        continue;  // no further bleed processing this step
      }
      // Out of bandages — fall through to rate reduction only
    }

    // Ongoing bleed reduction (bandage-rate)
    if (reg.bleedingRate > 0) {
      reg.bleedingRate = clampQ((reg.bleedingRate - bleedRed) as Q, q(0), q(1.0));
    }

    // Surgery for fractures (field_medicine+)
    if ((care === "field_medicine" || care === "hospital" || care === "autodoc")
        && reg.fractured && !state.surgeryStarted.has(region)) {
      if (tryConsume(state, "surgical_kit")) {
        state.surgeryStarted.add(region);
        state.log.push({ second, text: `surgery started: ${region}` });
      }
    }

    if (state.surgeryStarted.has(region)) {
      const newStr = clampQ(
        (reg.structuralDamage - surgRed) as Q,
        reg.permanentDamage, SCALE.Q,
      );
      reg.structuralDamage = newStr as Q;
      // Surgery also reduces bleeding
      reg.bleedingRate = clampQ((reg.bleedingRate - bleedRed) as Q, q(0), q(1.0));
      // Clear fracture once structural drops below threshold
      if (reg.fractured && reg.structuralDamage < FRACTURE_THRESHOLD) {
        reg.fractured = false;
        state.log.push({ second, text: `fracture cleared: ${region}` });
      }
      // Surgery also clears infection
      if (reg.infectedTick >= 0) {
        reg.infectedTick = -1;
        state.antibioticsApplied.add(region);
        state.log.push({ second, text: `infection cleared (surgery): ${region}` });
      }
    }

    // Antibiotics for infection (field_medicine+, not already cleared)
    if ((care === "field_medicine" || care === "hospital" || care === "autodoc")
        && reg.infectedTick >= 0 && !state.antibioticsApplied.has(region)) {
      if (tryConsume(state, "antibiotic_dose")) {
        state.antibioticsApplied.add(region);
        reg.infectedTick = -1;
        state.log.push({ second, text: `antibiotics: ${region}` });
      }
    }
  }

  // IV fluid replacement (hospital+)
  if ((care === "hospital" || care === "autodoc") && inj.fluidLoss > 0) {
    if (!state.fluidReplStarted) {
      if (tryConsume(state, "iv_fluid_bag")) {
        state.fluidReplStarted = true;
        state.log.push({ second, text: "IV fluid replacement started" });
      }
    }
    if (state.fluidReplStarted) {
      const fMul = TIER_MUL[fluidTier(care)];
      const fluidRec = mulDiv(qMul(FLUID_REPL_RATE, restMul), fMul, SCALE.Q) as Q;
      inj.fluidLoss = clampQ((inj.fluidLoss - fluidRec) as Q, q(0), SCALE.Q);
      inj.shock     = clampQ((inj.shock - q(0.002)) as Q, q(0), SCALE.Q);
    }
  }

  // Autodoc consumable (autodoc only, consumed once per session)
  if (care === "autodoc" && !state.autodocStarted) {
    if (tryConsume(state, "autodoc_pack")) {
      state.autodocStarted = true;
    }
  }
}

// ── Recovery projection ───────────────────────────────────────────────────────

function projectRecovery(
  state:      EState,
  endSummary: InjurySummary,
  elapsedSec: number,
  config:     DowntimeConfig,
): { combatReadyAt_s: number | null; fullRecoveryAt_s: number | null } {
  if (endSummary.dead) return { combatReadyAt_s: null, fullRecoveryAt_s: null };

  const inj     = state.injury;
  const care    = state.schedule.careLevel;
  const restF   = config.rest ? 1.5 : 1.0;  // real multiplier for projection math

  // ── Combat-ready: no active bleeding and shock < 30% ──────────────────────
  const alreadyCombatReady =
    endSummary.activeBleedingRegions.length === 0 && endSummary.shock < 0.30;

  let combatReadyAt_s: number;
  if (alreadyCombatReady) {
    combatReadyAt_s = elapsedSec;
  } else {
    // Estimate based on slowest-clotting bleeding region
    let worstBleedStopSec = 0;
    for (const r of endSummary.activeBleedingRegions) {
      const reg = inj.byRegion[r];
      if (!reg || reg.bleedingRate <= 0) continue;
      const integrityF  = Math.max(0, SCALE.Q - reg.structuralDamage) / SCALE.Q;
      const clotPerSec  = integrityF * (CLOT_RATE / SCALE.Q) * restF;
      const secToStop   = clotPerSec > 0
        ? (reg.bleedingRate / SCALE.Q) / clotPerSec
        : 3600;
      worstBleedStopSec = Math.max(worstBleedStopSec, secToStop);
    }
    const shockBuffer = endSummary.shock >= 0.30 ? 120 : 0;
    combatReadyAt_s   = elapsedSec + Math.ceil(worstBleedStopSec) + shockBuffer;
  }

  // ── Full recovery: all structural damage at permanentDamage floor ──────────
  if (care === "none" || care === "first_aid") {
    // No structural treatment — can't estimate a full recovery date
    return { combatReadyAt_s, fullRecoveryAt_s: null };
  }

  let totalRemainingFP = 0;
  for (const reg of Object.values(inj.byRegion)) {
    totalRemainingFP += Math.max(0, reg.structuralDamage - reg.permanentDamage);
  }

  if (totalRemainingFP <= 0) {
    return { combatReadyAt_s, fullRecoveryAt_s: elapsedSec };
  }

  const tierMulF   = TIER_MUL[careTier(care)] / SCALE.Q;
  const surgPerSec = (SURGERY_RATE / SCALE.Q) * tierMulF * restF;
  const secsToHeal = surgPerSec > 0
    ? (totalRemainingFP / SCALE.Q) / surgPerSec
    : null;

  return {
    combatReadyAt_s,
    fullRecoveryAt_s: secsToHeal !== null
      ? elapsedSec + Math.ceil(secsToHeal)
      : null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Simulate wound recovery over `elapsedSeconds` at 1 Hz.
 * Reads entity injury states from `world`; returns per-entity recovery reports.
 * Does NOT mutate the world.
 */
export function stepDowntime(
  world:          WorldState,
  elapsedSeconds: number,
  config:         DowntimeConfig,
): EntityRecoveryReport[] {
  const reports: EntityRecoveryReport[] = [];

  for (const entity of world.entities) {
    const schedule = config.treatments.get(entity.id);
    if (!schedule) continue;

    const injClone     = cloneInjury(entity.injury);
    const injuryAtStart = captureInjurySummary(injClone);

    const state: EState = {
      entityId: entity.id,
      injury:   injClone,
      schedule,
      inventory: schedule.inventory ? new Map(schedule.inventory) : undefined,
      usageMap:  new Map(),
      log:       [],
      tourniquetedRegions: new Set(),
      antibioticsApplied:  new Set(),
      surgeryStarted:      new Set(),
      fluidReplStarted: false,
      autodocStarted:   false,
      bleedDurationSec: new Map(),
    };

    // Pre-populate bleed duration for regions already bleeding on entry
    for (const [region, reg] of Object.entries(injClone.byRegion)) {
      if (reg.bleedDuration_ticks > 0) {
        // Convert existing combat ticks → simulated seconds (1 sec = 1 tick here)
        state.bleedDurationSec.set(region, reg.bleedDuration_ticks);
      }
      if (reg.infectedTick >= 0) {
        // Already infected — mark bleed duration as past threshold
        state.bleedDurationSec.set(region, INFECT_ONSET_SEC);
      }
    }

    // Simulation loop
    for (let sec = 0; sec < elapsedSeconds; sec++) {
      if (injClone.dead) break;
      stepSecond(state, sec, config);
    }

    const injuryAtEnd = captureInjurySummary(injClone);

    const bleedingStopped  = injuryAtEnd.activeBleedingRegions.length === 0;
    const infectionCleared = injuryAtEnd.infectedRegions.length === 0;
    const fracturesSet     = state.surgeryStarted.size > 0;

    const { combatReadyAt_s, fullRecoveryAt_s } = projectRecovery(
      state, injuryAtEnd, elapsedSeconds, config,
    );

    // Collate resource usage
    const resourcesUsed: ResourceUsage[] = [];
    let   totalCostUnits = 0;
    for (const [rid, count] of state.usageMap) {
      if (count === 0) continue;
      const res  = RESOURCE_BY_ID.get(rid);
      const cost = (res?.costUnits ?? 0) * count;
      resourcesUsed.push({ resourceId: rid, name: res?.name ?? rid, count, totalCost: cost });
      totalCostUnits += cost;
    }

    reports.push({
      entityId:      entity.id,
      elapsedSeconds,
      injuryAtStart,
      injuryAtEnd,
      died:           injClone.dead,
      bleedingStopped,
      infectionCleared,
      fracturesSet,
      combatReadyAt_s,
      fullRecoveryAt_s,
      resourcesUsed,
      totalCostUnits,
      log: state.log,
    });
  }

  return reports;
}
