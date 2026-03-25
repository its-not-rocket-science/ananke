// test/as/injury.wasm.test.ts — CE-5 Phase 3: verify as/injury.wasm per-entity
// injury accumulation loop against the TypeScript reference.
//
// Requires WASM to be built first:  npm run build:wasm:injury
// Run standalone:                   npm run test:wasm
// Auto-skipped when dist/as/injury.wasm is absent.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { q, qMul, clampQ, SCALE } from "../../src/units.js";

interface InjuryExports {
  // constants
  MAX_ENTITIES:          WebAssembly.Global;
  N_REGIONS:             WebAssembly.Global;
  ENTITY_STRIDE:         WebAssembly.Global;
  SHOCK_FROM_FLUID:      WebAssembly.Global;
  SHOCK_FROM_INTERNAL:   WebAssembly.Global;
  CONSC_LOSS_FROM_SHOCK: WebAssembly.Global;
  CONSC_LOSS_FROM_SUFF:  WebAssembly.Global;
  FATAL_FLUID_LOSS:      WebAssembly.Global;
  CLOT_RATE_PER_TICK:    WebAssembly.Global;
  // write API
  writeVitals: (slot: number, fluidLoss: number, shock: number, consciousness: number,
                dead: number, fatigue: number, suffocation: number) => void;
  writeRegion: (slot: number, r: number, bleedingRate: number, structuralDamage: number,
                internalDamage: number, surfaceDamage: number) => void;
  // read API
  readFluidLoss:    (slot: number) => number;
  readShock:        (slot: number) => number;
  readConsciousness:(slot: number) => number;
  readDead:         (slot: number) => number;
  readBleedingRate: (slot: number, r: number) => number;
  // computation
  stepBleedAndShock: (n: number) => void;
}

const WASM_PATH = fileURLToPath(new URL("../../dist/as/injury.wasm", import.meta.url));
const wasmAvailable = existsSync(WASM_PATH);

// ── Reference implementation (mirrors TypeScript source) ─────────────────────

const REF = {
  DT_S:                  500,   // SCALE.s × 0.05
  SHOCK_FROM_FLUID:       40,   // q(0.0040)
  SHOCK_FROM_INTERNAL:    20,   // q(0.0020)
  CONSC_LOSS_FROM_SHOCK: 100,   // q(0.0100)
  CONSC_LOSS_FROM_SUFF:  200,   // q(0.0200)
  FATAL_FLUID_LOSS:     8000,   // q(0.80)
  CLOT_RATE_PER_TICK:      2,   // q(0.0002)
  N_REGIONS: 6,
  TORSO_IDX: 1,
};

function refStepOnce(entity: {
  fluidLoss: number; shock: number; consciousness: number; dead: number; suffocation: number;
  bleed: number[]; struct: number[]; internal: number[];
}) {
  if (entity.dead) return;
  // 1. Clotting
  let totalBleed = 0;
  for (let r = 0; r < REF.N_REGIONS; r++) {
    if (entity.bleed[r] > 0) {
      const si = clampQ(SCALE.Q - entity.struct[r], 0, SCALE.Q);
      const clotRate = qMul(si, REF.CLOT_RATE_PER_TICK);
      entity.bleed[r] = clampQ(entity.bleed[r] - clotRate, 0, SCALE.Q);
    }
    totalBleed += entity.bleed[r];
  }
  // 2. Bleed → fluid loss
  const rawBleed = Math.trunc(totalBleed * REF.DT_S / SCALE.Q);
  entity.fluidLoss = clampQ(entity.fluidLoss + rawBleed, 0, SCALE.Q);
  // 3. Shock
  const torsoInt = entity.internal[REF.TORSO_IDX];
  entity.shock = clampQ(
    entity.shock + qMul(entity.fluidLoss, REF.SHOCK_FROM_FLUID)
                 + qMul(torsoInt, REF.SHOCK_FROM_INTERNAL),
    0, SCALE.Q
  );
  // 4. Consciousness
  const loss = clampQ(
    qMul(entity.shock, REF.CONSC_LOSS_FROM_SHOCK) + qMul(entity.suffocation, REF.CONSC_LOSS_FROM_SUFF),
    0, SCALE.Q
  );
  entity.consciousness = clampQ(entity.consciousness - loss, 0, SCALE.Q);
  // 5. Death
  if (entity.fluidLoss >= REF.FATAL_FLUID_LOSS || entity.shock >= SCALE.Q || entity.consciousness === 0) {
    entity.dead = 1;
    entity.consciousness = 0;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function writeHealthyEntity(ex: InjuryExports, slot: number,
  bleedRates: number[] = [0, 0, 0, 0, 0, 0]
): void {
  ex.writeVitals(slot, 0, 0, SCALE.Q, 0, 0, 0);
  for (let r = 0; r < REF.N_REGIONS; r++) {
    ex.writeRegion(slot, r, bleedRates[r] ?? 0, 0, 0, 0);
  }
}

describe.skipIf(!wasmAvailable)("AS injury.wasm vs TypeScript reference", () => {
  let ex: InjuryExports;

  beforeAll(async () => {
    const buffer = readFileSync(WASM_PATH);
    const result = await WebAssembly.instantiate(buffer);
    ex = result.instance.exports as unknown as InjuryExports;
  });

  // ── Constants ──────────────────────────────────────────────────────────────

  it("constants match TypeScript source values", () => {
    expect(ex.MAX_ENTITIES.value).toBe(64);
    expect(ex.N_REGIONS.value).toBe(6);
    expect(ex.FATAL_FLUID_LOSS.value).toBe(q(0.80));
    expect(ex.SHOCK_FROM_FLUID.value).toBe(q(0.0040));
    expect(ex.SHOCK_FROM_INTERNAL.value).toBe(q(0.0020));
    expect(ex.CONSC_LOSS_FROM_SHOCK.value).toBe(q(0.0100));
    expect(ex.CONSC_LOSS_FROM_SUFF.value).toBe(q(0.0200));
    expect(ex.CLOT_RATE_PER_TICK.value).toBe(q(0.0002));
  });

  it("ENTITY_STRIDE == 120 bytes (30 i32 × 4)", () => {
    expect(ex.ENTITY_STRIDE.value).toBe(120);
  });

  // ── Clotting ───────────────────────────────────────────────────────────────

  it("clotting: intact tissue (structDmg=0) decays bleed by CLOT_RATE per tick", () => {
    const initBleed = q(0.20); // 2000
    writeHealthyEntity(ex, 0, [0, initBleed, 0, 0, 0, 0]); // torso bleeding
    ex.stepBleedAndShock(1);
    // clotRate = qMul(SCALE_Q, 2) = 2; newBleed = 2000 - 2 = 1998
    expect(ex.readBleedingRate(0, 1)).toBe(initBleed - REF.CLOT_RATE_PER_TICK); // 1998
  });

  it("clotting: heavily damaged tissue (structDmg=q(0.75)) barely clots", () => {
    // structIntegrity = 2500; qMul(2500, 2) = Math.trunc(5000/10000) = 0
    writeHealthyEntity(ex, 0);
    ex.writeRegion(0, 1, q(0.30), q(0.75), 0, 0); // torso: bleeding, 75% structural damage
    ex.stepBleedAndShock(1);
    // clotRate rounds to 0 due to fixed-point precision → bleed unchanged
    const ref = { fluidLoss:0, shock:0, consciousness:SCALE.Q, dead:0, suffocation:0,
                  bleed:[0,3000,0,0,0,0], struct:[0,7500,0,0,0,0], internal:[0,0,0,0,0,0] };
    refStepOnce(ref);
    expect(ex.readBleedingRate(0, 1)).toBe(ref.bleed[1]);
  });

  // ── Bleed → fluid loss ─────────────────────────────────────────────────────

  it("bleeding at q(0.20) for 1 tick adds expected fluid loss", () => {
    writeHealthyEntity(ex, 0, [0, q(0.20), 0, 0, 0, 0]);
    ex.stepBleedAndShock(1);
    // rawBleed = Math.trunc(1998 * 500 / 10000) = Math.trunc(99.9) = 99
    const ref = { fluidLoss:0, shock:0, consciousness:SCALE.Q, dead:0, suffocation:0,
                  bleed:[0,2000,0,0,0,0], struct:[0,0,0,0,0,0], internal:[0,0,0,0,0,0] };
    refStepOnce(ref);
    expect(ex.readFluidLoss(0)).toBe(ref.fluidLoss);
  });

  it("multiple bleeding regions accumulate into single fluid loss", () => {
    // Two regions bleeding at q(0.10) each
    writeHealthyEntity(ex, 0, [0, q(0.10), q(0.10), 0, 0, 0]);
    ex.stepBleedAndShock(1);
    const ref = { fluidLoss:0, shock:0, consciousness:SCALE.Q, dead:0, suffocation:0,
                  bleed:[0,1000,1000,0,0,0], struct:[0,0,0,0,0,0], internal:[0,0,0,0,0,0] };
    refStepOnce(ref);
    expect(ex.readFluidLoss(0)).toBe(ref.fluidLoss);
  });

  // ── Shock accumulation ─────────────────────────────────────────────────────

  it("torso internal damage drives shock", () => {
    writeHealthyEntity(ex, 0);
    ex.writeRegion(0, 1, 0, 0, q(0.50), 0); // torso: 50% internal damage
    ex.stepBleedAndShock(1);
    // shock = qMul(0, 40) + qMul(5000, 20) = 0 + 10 = 10
    const ref = { fluidLoss:0, shock:0, consciousness:SCALE.Q, dead:0, suffocation:0,
                  bleed:[0,0,0,0,0,0], struct:[0,0,0,0,0,0], internal:[0,5000,0,0,0,0] };
    refStepOnce(ref);
    expect(ex.readShock(0)).toBe(ref.shock);
  });

  it("shock accumulates from both fluid loss and internal damage", () => {
    writeHealthyEntity(ex, 0);
    ex.writeVitals(0, q(0.30), 0, SCALE.Q, 0, 0, 0); // pre-existing fluid loss
    ex.writeRegion(0, 1, 0, 0, q(0.40), 0); // torso internal
    ex.stepBleedAndShock(1);
    const ref = { fluidLoss:3000, shock:0, consciousness:SCALE.Q, dead:0, suffocation:0,
                  bleed:[0,0,0,0,0,0], struct:[0,0,0,0,0,0], internal:[0,4000,0,0,0,0] };
    refStepOnce(ref);
    expect(ex.readShock(0)).toBe(ref.shock);
  });

  // ── Consciousness loss ─────────────────────────────────────────────────────

  it("suffocation alone drains consciousness", () => {
    writeHealthyEntity(ex, 0);
    ex.writeVitals(0, 0, 0, SCALE.Q, 0, 0, q(0.50)); // suffocation=q(0.5)
    ex.stepBleedAndShock(1);
    // loss = qMul(0, 100) + qMul(5000, 200) = 0 + 100 = 100
    const ref = { fluidLoss:0, shock:0, consciousness:SCALE.Q, dead:0, suffocation:5000,
                  bleed:[0,0,0,0,0,0], struct:[0,0,0,0,0,0], internal:[0,0,0,0,0,0] };
    refStepOnce(ref);
    expect(ex.readConsciousness(0)).toBe(ref.consciousness);
  });

  // ── Death check ────────────────────────────────────────────────────────────

  it("entity dies when fluidLoss reaches FATAL_FLUID_LOSS", () => {
    writeHealthyEntity(ex, 0);
    ex.writeVitals(0, q(0.79), 0, SCALE.Q, 0, 0, 0); // just below fatal
    // bleeding enough to push over threshold this tick
    // need rawBleed >= 80: totalBleed * 500 / 10000 >= 80 → totalBleed >= 1600
    ex.writeRegion(0, 1, 2000, 0, 0, 0); // bleed=q(0.20) → rawBleed≈99
    ex.stepBleedAndShock(1);
    // fluidLoss = 7900 + 99 = 7999 → NOT dead yet
    expect(ex.readDead(0)).toBe(0);
    // Push to exactly fatal
    ex.writeVitals(0, q(0.80), 0, SCALE.Q, 0, 0, 0);
    ex.writeRegion(0, 1, 0, 0, 0, 0); // no extra bleed
    ex.stepBleedAndShock(1);
    expect(ex.readDead(0)).toBe(1);
    expect(ex.readConsciousness(0)).toBe(0);
  });

  it("entity dies when shock reaches 1.0", () => {
    writeHealthyEntity(ex, 0);
    ex.writeVitals(0, 0, SCALE.Q, SCALE.Q, 0, 0, 0); // shock at max
    ex.stepBleedAndShock(1);
    expect(ex.readDead(0)).toBe(1);
  });

  it("entity dies when consciousness reaches 0", () => {
    writeHealthyEntity(ex, 0);
    ex.writeVitals(0, 0, 0, 0, 0, 0, 0); // consciousness=0
    ex.stepBleedAndShock(1);
    expect(ex.readDead(0)).toBe(1);
  });

  // ── Dead entity skipped ────────────────────────────────────────────────────

  it("dead entity is not processed: vitals unchanged", () => {
    writeHealthyEntity(ex, 0, [0, q(0.50), 0, 0, 0, 0]); // severe bleed
    ex.writeVitals(0, 0, 0, SCALE.Q, 1, 0, 0); // already dead
    ex.stepBleedAndShock(1);
    expect(ex.readFluidLoss(0)).toBe(0);    // unchanged
    expect(ex.readBleedingRate(0, 1)).toBe(q(0.50)); // not clotted
  });

  // ── Batch (multiple entities) ──────────────────────────────────────────────

  it("batch of 3 entities: each processed independently", () => {
    // Entity 0: healthy, no bleed
    writeHealthyEntity(ex, 0);
    // Entity 1: torso bleeding
    writeHealthyEntity(ex, 1, [0, q(0.20), 0, 0, 0, 0]);
    // Entity 2: dead
    writeHealthyEntity(ex, 2);
    ex.writeVitals(2, 0, 0, SCALE.Q, 1, 0, 0);

    ex.stepBleedAndShock(3);

    const ref1 = { fluidLoss:0, shock:0, consciousness:SCALE.Q, dead:0, suffocation:0,
                   bleed:[0,2000,0,0,0,0], struct:[0,0,0,0,0,0], internal:[0,0,0,0,0,0] };
    refStepOnce(ref1);

    expect(ex.readFluidLoss(0)).toBe(0);          // no bleed
    expect(ex.readFluidLoss(1)).toBe(ref1.fluidLoss); // bleeding
    expect(ex.readFluidLoss(2)).toBe(0);          // dead, skipped
    expect(ex.readDead(2)).toBe(1);               // still dead
  });

  // ── Multi-tick consistency: WASM matches TS reference across 10 ticks ──────

  it("10-tick bleed accumulation matches TS reference step-by-step", () => {
    // Initialize once — WASM carries state between calls in linear memory; ref mutates in place.
    writeHealthyEntity(ex, 0, [0, q(0.30), 0, 0, 0, 0]); // torso bleed=q(0.30)
    const ref = { fluidLoss:0, shock:0, consciousness:SCALE.Q, dead:0, suffocation:0,
                  bleed:[0,3000,0,0,0,0], struct:[0,0,0,0,0,0], internal:[0,0,0,0,0,0] };

    for (let tick = 0; tick < 10; tick++) {
      refStepOnce(ref);        // advance reference
      ex.stepBleedAndShock(1); // advance WASM (reads/writes its own linear memory)

      expect(ex.readBleedingRate(0, 1)).toBe(ref.bleed[1]);
      expect(ex.readFluidLoss(0)).toBe(ref.fluidLoss);
      expect(ex.readShock(0)).toBe(ref.shock);
      expect(ex.readConsciousness(0)).toBe(ref.consciousness);
    }
  });
});
