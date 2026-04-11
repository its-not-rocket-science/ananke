// as/injury.ts — AssemblyScript port of the per-entity injury accumulation inner loop
// from src/sim/step/injury.ts.
//
// Scope: the four arithmetic-only sub-steps that run every tick for every entity:
//   1. Clotting     — bleedingRate decays proportional to structural integrity
//   2. Bleed → fluid loss  — sumBleedRate × DT_S / SCALE.s accumulated into fluidLoss
//   3. Shock        — fluidLoss + torso internalDamage drive shock
//   4. Consciousness — shock + suffocation drive consciousness loss; death check
//
// Omitted (require full entity model / body-plan data): armour, traits, body plans,
// infection timer, molting, wing regen, thermoregulation.  Those stay in TypeScript.
//
// Compile with: npm run build:wasm:injury

import { SCALE_Q, clampQ, qMul } from "./units";

// ── Constants (mirror src/sim/step/injury.ts) ────────────────────────────────

const DT_S: i32 = 500;                  // 20 Hz → 0.05 s in SCALE.s (=10000)
export const SHOCK_FROM_FLUID:    i32 = 40;   // q(0.0040)
export const SHOCK_FROM_INTERNAL: i32 = 20;   // q(0.0020)
export const CONSC_LOSS_FROM_SHOCK: i32 = 100; // q(0.0100)
export const CONSC_LOSS_FROM_SUFF:  i32 = 200; // q(0.0200)
export const FATAL_FLUID_LOSS:    i32 = 8000;  // q(0.80)
export const CLOT_RATE_PER_TICK:  i32 = 2;    // q(0.0002)

// ── Memory layout ─────────────────────────────────────────────────────────────
//
// MAX_ENTITIES entity slots; each slot = ENTITY_STRIDE bytes.
// Entity slot layout (all fields are i32 = 4 bytes):
//
//   Vitals (6 × i32):
//     [0] fluidLoss       — Q [0..SCALE_Q]
//     [1] shock           — Q [0..SCALE_Q]
//     [2] consciousness   — Q [0..SCALE_Q]
//     [3] dead            — 0 or 1
//     [4] fatigue         — Q (read-only for this module)
//     [5] suffocation     — Q; drives consciousness loss
//
//   Per-region data: N_REGIONS (6) × 4 i32 = 24 i32:
//     Region r ∈ [0, N_REGIONS):
//       [6 + r*4 + 0] bleedingRate      — Q
//       [6 + r*4 + 1] structuralDamage  — Q
//       [6 + r*4 + 2] internalDamage    — Q (torso = region 0 drives shock)
//       [6 + r*4 + 3] surfaceDamage     — Q (written by conditions step; read here)
//
// Total per entity: (6 + 24) × 4 = 120 bytes.

export const MAX_ENTITIES: i32 = 256;
export const N_REGIONS:    i32 = 6;    // head, torso, leftArm, rightArm, leftLeg, rightLeg

const VITALS:        i32 = 6;         // number of vital fields
const REGION_FIELDS: i32 = 4;
const ENTITY_I32S:   i32 = VITALS + N_REGIONS * REGION_FIELDS; // 30 i32
export const ENTITY_STRIDE: i32 = ENTITY_I32S * 4;             // 120 bytes

// Torso is region index 1 (head=0, torso=1, leftArm=2, rightArm=3, leftLeg=4, rightLeg=5)
const TORSO_IDX: i32 = 1;

// ── Accessors ─────────────────────────────────────────────────────────────────

function entityBase(slot: i32): i32 {
  return slot * ENTITY_STRIDE;
}

function vitalOff(slot: i32, field: i32): i32 {
  return entityBase(slot) + field * 4;
}

function regionOff(slot: i32, r: i32, field: i32): i32 {
  return entityBase(slot) + (VITALS + r * REGION_FIELDS + field) * 4;
}

// vital field indices
const V_FLUID     = 0;
const V_SHOCK     = 1;
const V_CONSC     = 2;
const V_DEAD      = 3;
const V_FATIGUE   = 4;
const V_SUFF      = 5;

// region field indices
const R_BLEED     = 0;
const R_STRUCT    = 1;
const R_INTERNAL  = 2;
const R_SURFACE   = 3;

// ── Public write API ──────────────────────────────────────────────────────────

/** Write the six vital fields for entity at slot. */
export function writeVitals(
  slot: i32,
  fluidLoss: i32, shock: i32, consciousness: i32, dead: i32,
  fatigue: i32, suffocation: i32
): void {
  store<i32>(vitalOff(slot, V_FLUID),   fluidLoss);
  store<i32>(vitalOff(slot, V_SHOCK),   shock);
  store<i32>(vitalOff(slot, V_CONSC),   consciousness);
  store<i32>(vitalOff(slot, V_DEAD),    dead);
  store<i32>(vitalOff(slot, V_FATIGUE), fatigue);
  store<i32>(vitalOff(slot, V_SUFF),    suffocation);
}

/** Write one region's four fields for entity at slot. r ∈ [0, N_REGIONS). */
export function writeRegion(
  slot: i32, r: i32,
  bleedingRate: i32, structuralDamage: i32, internalDamage: i32, surfaceDamage: i32
): void {
  store<i32>(regionOff(slot, r, R_BLEED),    bleedingRate);
  store<i32>(regionOff(slot, r, R_STRUCT),   structuralDamage);
  store<i32>(regionOff(slot, r, R_INTERNAL), internalDamage);
  store<i32>(regionOff(slot, r, R_SURFACE),  surfaceDamage);
}

// ── Public read API ───────────────────────────────────────────────────────────

export function readFluidLoss(slot: i32): i32      { return load<i32>(vitalOff(slot, V_FLUID)); }
export function readShock(slot: i32): i32           { return load<i32>(vitalOff(slot, V_SHOCK)); }
export function readConsciousness(slot: i32): i32   { return load<i32>(vitalOff(slot, V_CONSC)); }
export function readDead(slot: i32): i32            { return load<i32>(vitalOff(slot, V_DEAD));  }
export function readBleedingRate(slot: i32, r: i32): i32 {
  return load<i32>(regionOff(slot, r, R_BLEED));
}

// ── Main computation ──────────────────────────────────────────────────────────

/**
 * Run the injury accumulation inner loop for `n` entities (in entity-slot order).
 * Mirrors the core of stepInjuryProgression() in src/sim/step/injury.ts:
 *
 *   1. Per-region clotting: bleedingRate -= structureIntegrity × CLOT_RATE_PER_TICK
 *   2. Fluid loss: accumulated from sum of all bleeding rates × DT_S / SCALE_s
 *   3. Shock: fluidLoss × SHOCK_FROM_FLUID + torsoInternal × SHOCK_FROM_INTERNAL
 *   4. Consciousness: decrement by shock × CONSC_LOSS_FROM_SHOCK + suffocation × CONSC_LOSS_FROM_SUFF
 *   5. Death: fluidLoss >= FATAL_FLUID_LOSS || shock >= SCALE_Q || consciousness == 0
 *
 * All Q arithmetic is fixed-point: 1.0 == SCALE_Q (10000).
 * Skips dead entities.
 */
export function stepBleedAndShock(n: i32): void {
  for (let slot = 0; slot < n; slot++) {
    if (load<i32>(vitalOff(slot, V_DEAD))) continue;

    // ── 1. Clotting ────────────────────────────────────────────────────────
    let totalBleed: i32 = 0;
    for (let r = 0; r < N_REGIONS; r++) {
      let bleed: i32 = load<i32>(regionOff(slot, r, R_BLEED));
      if (bleed > 0) {
        const structDmg: i32 = load<i32>(regionOff(slot, r, R_STRUCT));
        const structIntegrity: i32 = clampQ(SCALE_Q - structDmg, 0, SCALE_Q);
        const clotRate: i32 = qMul(structIntegrity, CLOT_RATE_PER_TICK);
        bleed = clampQ(bleed - clotRate, 0, SCALE_Q);
        store<i32>(regionOff(slot, r, R_BLEED), bleed);
      }
      totalBleed += bleed;
    }

    // ── 2. Bleed → fluid loss ─────────────────────────────────────────────
    // rawBleed = Math.trunc(totalBleed × DT_S / SCALE_s)
    // DT_S and SCALE_s are both in SCALE.s units (10000), so DT_S = 500 (0.05 s)
    const rawBleed: i32 = <i32>((<i64>totalBleed * <i64>DT_S) / <i64>SCALE_Q);
    const fluidLoss: i32 = clampQ(load<i32>(vitalOff(slot, V_FLUID)) + rawBleed, 0, SCALE_Q);
    store<i32>(vitalOff(slot, V_FLUID), fluidLoss);

    // ── 3. Shock accumulation ─────────────────────────────────────────────
    const torsoInternal: i32 = load<i32>(regionOff(slot, TORSO_IDX, R_INTERNAL));
    let shock: i32 = load<i32>(vitalOff(slot, V_SHOCK));
    shock = clampQ(
      shock + qMul(fluidLoss, SHOCK_FROM_FLUID) + qMul(torsoInternal, SHOCK_FROM_INTERNAL),
      0, SCALE_Q
    );
    store<i32>(vitalOff(slot, V_SHOCK), shock);

    // ── 4. Consciousness loss ─────────────────────────────────────────────
    const suff: i32 = load<i32>(vitalOff(slot, V_SUFF));
    const consciousnessLoss: i32 = clampQ(
      qMul(shock, CONSC_LOSS_FROM_SHOCK) + qMul(suff, CONSC_LOSS_FROM_SUFF),
      0, SCALE_Q
    );
    const consc: i32 = clampQ(load<i32>(vitalOff(slot, V_CONSC)) - consciousnessLoss, 0, SCALE_Q);
    store<i32>(vitalOff(slot, V_CONSC), consc);

    // ── 5. Death check ────────────────────────────────────────────────────
    if (fluidLoss >= FATAL_FLUID_LOSS || shock >= SCALE_Q || consc == 0) {
      store<i32>(vitalOff(slot, V_DEAD),  1);
      store<i32>(vitalOff(slot, V_CONSC), 0);
    }
  }
}
