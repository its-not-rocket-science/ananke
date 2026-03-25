// src/wasm-kernel.ts — Node.js loader and host bridge for the AssemblyScript WASM modules.
//
// Provides a shadow-mode step that runs as/push.wasm + as/injury.wasm alongside the
// TypeScript kernel.  In shadow mode the WASM outputs are NOT applied to world state;
// they are returned for the caller to log or validate.
//
// Usage:
//   const kernel = await loadWasmKernel();       // once at startup
//   const report = kernel.shadowStep(world);     // after stepWorld() each tick
//   console.log(report.summary);

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { WorldState } from "./sim/world.js";
import { SCALE } from "./units.js";

// ── Region order shared with as/injury.ts ─────────────────────────────────────

const REGION_ORDER = ["head", "torso", "leftArm", "rightArm", "leftLeg", "rightLeg"] as const;

// ── WASM export types ─────────────────────────────────────────────────────────

interface PushExports {
  MAX_ENTITIES: WebAssembly.Global;
  writeEntity: (slot: number, posX: number, posY: number, alive: number) => void;
  readDvX: (slot: number) => number;
  readDvY: (slot: number) => number;
  stepRepulsionPairs: (n: number, radius_m: number, repelAccel_mps2: number) => void;
}

interface InjuryExports {
  MAX_ENTITIES: WebAssembly.Global;
  writeVitals: (slot: number, fluidLoss: number, shock: number, consciousness: number,
                dead: number, fatigue: number, suffocation: number) => void;
  writeRegion: (slot: number, r: number, bleedingRate: number, structuralDamage: number,
                internalDamage: number, surfaceDamage: number) => void;
  readFluidLoss:     (slot: number) => number;
  readShock:         (slot: number) => number;
  readConsciousness: (slot: number) => number;
  readDead:          (slot: number) => number;
  stepBleedAndShock: (n: number) => void;
}

// ── Shadow step result ────────────────────────────────────────────────────────

export interface WasmEntityReport {
  entityId: number;
  /** Repulsion velocity delta computed by WASM push kernel (SCALE.mps units). */
  pushDvX: number;
  pushDvY: number;
  /** Projected injury state after one WASM injury tick. */
  projFluidLoss:    number;
  projShock:        number;
  projConsciousness:number;
  projDead:         boolean;
}

export interface WasmStepReport {
  tick: number;
  entities: WasmEntityReport[];
  /** True if WASM is available and ran successfully. */
  ok: boolean;
  summary: string;
}

// ── Kernel class ──────────────────────────────────────────────────────────────

export class WasmKernel {
  // Canonical kernel push tuning (mirrors src/sim/kernel.ts)
  private static readonly PUSH_RADIUS_M    = Math.trunc(0.45 * SCALE.m);  // 4500
  private static readonly PUSH_REPEL_MPS2  = Math.trunc(1.5  * SCALE.mps2); // 15000

  constructor(
    private readonly push:   PushExports,
    private readonly injury: InjuryExports,
  ) {}

  /**
   * Run WASM push + injury steps on the current world state (shadow mode — does not
   * mutate world).  Returns a per-entity report and a one-line summary string.
   *
   * Call this after stepWorld() each tick for validation / diagnostics.
   */
  shadowStep(world: WorldState, tick: number): WasmStepReport {
    const entities = world.entities;
    const pushMax   = this.push.MAX_ENTITIES.value as number;
    const injMax    = this.injury.MAX_ENTITIES.value as number;
    const n = Math.min(entities.length, pushMax, injMax);

    // ── Push pass (position-based repulsion) ──────────────────────────────────
    for (let i = 0; i < n; i++) {
      const e = entities[i]!;
      this.push.writeEntity(i, e.position_m.x, e.position_m.y, e.injury.dead ? 0 : 1);
    }
    this.push.stepRepulsionPairs(n, WasmKernel.PUSH_RADIUS_M, WasmKernel.PUSH_REPEL_MPS2);

    // ── Injury pass (clotting / bleed / shock / consciousness) ────────────────
    for (let i = 0; i < n; i++) {
      const e = entities[i]!;
      const suff = (e.condition as unknown as Record<string, number>)["suffocation"] ?? 0;
      this.injury.writeVitals(
        i,
        e.injury.fluidLoss,
        e.injury.shock,
        e.injury.consciousness,
        e.injury.dead ? 1 : 0,
        e.energy.fatigue,
        suff,
      );
      for (let r = 0; r < REGION_ORDER.length; r++) {
        const reg = e.injury.byRegion[REGION_ORDER[r]!];
        this.injury.writeRegion(
          i, r,
          reg?.bleedingRate      ?? 0,
          reg?.structuralDamage  ?? 0,
          reg?.internalDamage    ?? 0,
          (reg as Record<string, number> | undefined)?.["surfaceDamage"] ?? 0,
        );
      }
    }
    this.injury.stepBleedAndShock(n);

    // ── Build report ──────────────────────────────────────────────────────────
    const reports: WasmEntityReport[] = [];
    for (let i = 0; i < n; i++) {
      const e = entities[i]!;
      reports.push({
        entityId:          e.id,
        pushDvX:           this.push.readDvX(i),
        pushDvY:           this.push.readDvY(i),
        projFluidLoss:     this.injury.readFluidLoss(i),
        projShock:         this.injury.readShock(i),
        projConsciousness: this.injury.readConsciousness(i),
        projDead:          this.injury.readDead(i) === 1,
      });
    }

    const summary = reports
      .map(r =>
        `e${r.entityId} dv=(${r.pushDvX},${r.pushDvY}) ` +
        `fl=${(r.projFluidLoss / SCALE.Q).toFixed(3)} ` +
        `sh=${(r.projShock     / SCALE.Q).toFixed(3)} ` +
        `co=${(r.projConsciousness / SCALE.Q).toFixed(3)}` +
        (r.projDead ? " DEAD" : "")
      )
      .join(" | ");

    return { tick, entities: reports, ok: true, summary: `[wasm] tick ${tick}: ${summary}` };
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Load push.wasm and injury.wasm from dist/as/ (co-located with this compiled module)
 * and return a WasmKernel ready for use.
 *
 * Throws if the WASM files are not found (e.g. npm run build:wasm:all not yet run).
 */
export async function loadWasmKernel(): Promise<WasmKernel> {
  // Compiled to dist/src/wasm-kernel.js → WASM files are at ../as/*.wasm
  const base = new URL("../as/", import.meta.url);
  const pushBuf   = readFileSync(fileURLToPath(new URL("push.wasm",   base)));
  const injuryBuf = readFileSync(fileURLToPath(new URL("injury.wasm", base)));
  const [pushResult, injuryResult] = await Promise.all([
    WebAssembly.instantiate(pushBuf),
    WebAssembly.instantiate(injuryBuf),
  ]);
  return new WasmKernel(
    pushResult.instance.exports   as unknown as PushExports,
    injuryResult.instance.exports as unknown as InjuryExports,
  );
}
