import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mkHumanoidEntity, mkWorld } from "../../src/sim/testing.js";
import { SCALE } from "../../src/units.js";

export interface OracleEntity {
  entityId: number;
  x: number;
  y: number;
  pushDvX: number;
  pushDvY: number;
  projFluidLoss: number;
  projShock: number;
  projConsciousness: number;
  projDead: boolean;
  bleedingRate: number;
  structuralDamage: number;
  internalDamage: number;
  suffocation: number;
}

export interface OracleState {
  tick: number;
  seed: number;
  entities: OracleEntity[];
}

export interface TickSnapshot {
  tick: number;
  entities: Array<Omit<OracleEntity, "x" | "y" | "structuralDamage" | "internalDamage" | "suffocation"> & { projHeadBleedingRate: number }>;
}

export interface DeterminismTrace {
  finalState: OracleState;
  snapshots: TickSnapshot[];
}

export interface KernelLike {
  shadowStep: (world: ReturnType<typeof mkWorld>, tick: number) => { tick: number; entities: Array<Record<string, unknown>> };
}

const DIST_KERNEL = fileURLToPath(new URL("../../dist/src/wasm-kernel.js", import.meta.url));
const PUSH_WASM = fileURLToPath(new URL("../../dist/as/push.wasm", import.meta.url));
const INJURY_WASM = fileURLToPath(new URL("../../dist/as/injury.wasm", import.meta.url));

export function hasBuiltWasmKernel(): boolean {
  return existsSync(DIST_KERNEL) && existsSync(PUSH_WASM) && existsSync(INJURY_WASM);
}

export async function loadWasmKernelFromDist(): Promise<KernelLike> {
  const mod = await import(DIST_KERNEL) as { loadWasmKernel: () => Promise<KernelLike> };
  return mod.loadWasmKernel();
}

function nextU32(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function randInt(seed: number, lo: number, hi: number): [number, number] {
  const next = nextU32(seed);
  return [next, lo + (next % (hi - lo + 1))];
}

export function makeInitialState(seed: number, entityCount: number): OracleState {
  let s = seed >>> 0;
  const entities: OracleEntity[] = [];
  for (let i = 0; i < entityCount; i++) {
    let v: number;
    [s, v] = randInt(s, -25_000, 25_000);
    const x = v;
    [s, v] = randInt(s, -25_000, 25_000);
    const y = v;
    entities.push({
      entityId: i + 1,
      x,
      y,
      pushDvX: 0,
      pushDvY: 0,
      projFluidLoss: 0,
      projShock: 0,
      projConsciousness: SCALE.Q,
      projDead: false,
      bleedingRate: 0,
      structuralDamage: SCALE.Q,
      internalDamage: 0,
      suffocation: 0,
    });
  }
  return { tick: 0, seed, entities };
}

export type OracleCommand =
  | { kind: "noop" }
  | { kind: "move"; entityId: number; dx: number; dy: number }
  | { kind: "teleport"; entityId: number; x: number; y: number }
  | { kind: "bleed"; entityId: number; delta: number }
  | { kind: "internal"; entityId: number; delta: number }
  | { kind: "suffocation"; entityId: number; delta: number }
  | { kind: "kill"; entityId: number; dead: boolean }
  | { kind: "setBleed"; entityId: number; value: number }
  | { kind: "setInternal"; entityId: number; value: number }
  | { kind: "setSuffocation"; entityId: number; value: number }
  | { kind: "setFluidLoss"; entityId: number; value: number }
  | { kind: "setShock"; entityId: number; value: number }
  | { kind: "setConsciousness"; entityId: number; value: number }
  | { kind: "setStructuralDamage"; entityId: number; value: number };

function clampQ(value: number): number {
  return Math.max(0, Math.min(SCALE.Q, value));
}

export function makeCommandSequence(seed: number, entityCount: number, length: number): OracleCommand[] {
  const out: OracleCommand[] = [];
  let s = seed ^ 0x9e3779b9;
  for (let i = 0; i < length; i++) {
    let kindRoll: number;
    [s, kindRoll] = randInt(s, 0, 13);
    let entityId: number;
    [s, entityId] = randInt(s, 1, entityCount);
    if (kindRoll === 0) {
      out.push({ kind: "noop" });
    } else if (kindRoll === 1) {
      let dx: number;
      let dy: number;
      [s, dx] = randInt(s, -5_000, 5_000);
      [s, dy] = randInt(s, -5_000, 5_000);
      out.push({ kind: "move", entityId, dx, dy });
    } else if (kindRoll === 2) {
      let x: number;
      let y: number;
      [s, x] = randInt(s, -60_000, 60_000);
      [s, y] = randInt(s, -60_000, 60_000);
      out.push({ kind: "teleport", entityId, x, y });
    } else if (kindRoll === 3) {
      let delta: number;
      [s, delta] = randInt(s, -240, 240);
      out.push({ kind: "bleed", entityId, delta });
    } else if (kindRoll === 4) {
      let delta: number;
      [s, delta] = randInt(s, -200, 200);
      out.push({ kind: "internal", entityId, delta });
    } else if (kindRoll === 5) {
      let delta: number;
      [s, delta] = randInt(s, -200, 200);
      out.push({ kind: "suffocation", entityId, delta });
    } else if (kindRoll === 6) {
      out.push({ kind: "kill", entityId, dead: (s & 1) === 0 });
    } else if (kindRoll === 7) {
      let value: number;
      [s, value] = randInt(s, -SCALE.Q, SCALE.Q * 2);
      out.push({ kind: "setBleed", entityId, value });
    } else if (kindRoll === 8) {
      let value: number;
      [s, value] = randInt(s, -SCALE.Q, SCALE.Q * 2);
      out.push({ kind: "setInternal", entityId, value });
    } else if (kindRoll === 9) {
      let value: number;
      [s, value] = randInt(s, -SCALE.Q, SCALE.Q * 2);
      out.push({ kind: "setSuffocation", entityId, value });
    } else if (kindRoll === 10) {
      let value: number;
      [s, value] = randInt(s, -SCALE.Q, SCALE.Q * 2);
      out.push({ kind: "setFluidLoss", entityId, value });
    } else if (kindRoll === 11) {
      let value: number;
      [s, value] = randInt(s, -SCALE.Q, SCALE.Q * 2);
      out.push({ kind: "setShock", entityId, value });
    } else if (kindRoll === 12) {
      let value: number;
      [s, value] = randInt(s, -SCALE.Q, SCALE.Q * 2);
      out.push({ kind: "setConsciousness", entityId, value });
    } else {
      let value: number;
      [s, value] = randInt(s, -SCALE.Q, SCALE.Q * 2);
      out.push({ kind: "setStructuralDamage", entityId, value });
    }
  }
  return out;
}

function applyCommand(state: OracleState, cmd: OracleCommand): void {
  if (cmd.kind === "noop") return;
  const e = state.entities[cmd.entityId - 1];
  if (!e) return;
  if (cmd.kind === "move") {
    e.x += cmd.dx;
    e.y += cmd.dy;
    return;
  }
  if (cmd.kind === "teleport") {
    e.x = cmd.x;
    e.y = cmd.y;
    return;
  }
  if (cmd.kind === "bleed") {
    e.bleedingRate = clampQ(e.bleedingRate + cmd.delta);
    return;
  }
  if (cmd.kind === "internal") {
    e.internalDamage = clampQ(e.internalDamage + cmd.delta);
    return;
  }
  if (cmd.kind === "suffocation") {
    e.suffocation = clampQ(e.suffocation + cmd.delta);
    return;
  }
  if (cmd.kind === "kill") {
    e.projDead = cmd.dead;
    return;
  }
  if (cmd.kind === "setBleed") {
    e.bleedingRate = clampQ(cmd.value);
    return;
  }
  if (cmd.kind === "setInternal") {
    e.internalDamage = clampQ(cmd.value);
    return;
  }
  if (cmd.kind === "setSuffocation") {
    e.suffocation = clampQ(cmd.value);
    return;
  }
  if (cmd.kind === "setFluidLoss") {
    e.projFluidLoss = clampQ(cmd.value);
    return;
  }
  if (cmd.kind === "setShock") {
    e.projShock = clampQ(cmd.value);
    return;
  }
  if (cmd.kind === "setConsciousness") {
    e.projConsciousness = clampQ(cmd.value);
    return;
  }
  e.structuralDamage = clampQ(cmd.value);
}

function qMul(a: number, b: number): number {
  return Math.trunc((a * b) / SCALE.Q);
}

function approxDist(dx: number, dy: number): number {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  return adx > ady ? adx + (ady >> 1) : ady + (adx >> 1);
}

function tsStep(state: OracleState): TickSnapshot {
  const radius = Math.trunc(0.45 * SCALE.m);
  const repelAccel = Math.trunc(1.5 * SCALE.mps2);
  const R2 = BigInt(radius) * BigInt(radius);

  for (const e of state.entities) {
    e.pushDvX = 0;
    e.pushDvY = 0;
  }

  for (let i = 0; i < state.entities.length - 1; i++) {
    const a = state.entities[i]!;
    if (a.projDead) continue;
    for (let j = i + 1; j < state.entities.length; j++) {
      const b = state.entities[j]!;
      if (b.projDead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy);
      if (d2 >= R2 || d2 === 0n) continue;
      const d = approxDist(dx, dy);
      const overlap = radius - d;
      if (overlap <= 0) continue;
      const strengthQ = Math.max(0, Math.min(SCALE.Q, Math.trunc((overlap * SCALE.Q) / radius)));
      const denom = Math.max(1, d) * SCALE.Q;
      const ax = Math.trunc((dx * repelAccel * strengthQ) / denom);
      const ay = Math.trunc((dy * repelAccel * strengthQ) / denom);
      a.pushDvX -= ax;
      a.pushDvY -= ay;
      b.pushDvX += ax;
      b.pushDvY += ay;
    }
  }

  const SHOCK_FROM_FLUID = 40;
  const SHOCK_FROM_INTERNAL = 20;
  const CONSC_LOSS_FROM_SHOCK = 100;
  const CONSC_LOSS_FROM_SUFF = 200;
  const FATAL_FLUID_LOSS = 8000;
  const CLOT_RATE_PER_TICK = 2;
  const DT_S = 500;

  for (const e of state.entities) {
    if (e.projDead) continue;
    const structureIntegrity = Math.max(0, Math.min(SCALE.Q, SCALE.Q - e.structuralDamage));
    const clotRate = qMul(structureIntegrity, CLOT_RATE_PER_TICK);
    e.bleedingRate = Math.max(0, Math.min(SCALE.Q, e.bleedingRate - clotRate));

    const rawBleed = Math.trunc((e.bleedingRate * DT_S) / SCALE.Q);
    e.projFluidLoss = Math.max(0, Math.min(SCALE.Q, e.projFluidLoss + rawBleed));
    e.projShock = Math.max(
      0,
      Math.min(
        SCALE.Q,
        e.projShock + qMul(e.projFluidLoss, SHOCK_FROM_FLUID) + qMul(e.internalDamage, SHOCK_FROM_INTERNAL),
      ),
    );
    const consciousnessLoss = Math.max(0, Math.min(SCALE.Q, qMul(e.projShock, CONSC_LOSS_FROM_SHOCK) + qMul(e.suffocation, CONSC_LOSS_FROM_SUFF)));
    e.projConsciousness = Math.max(0, Math.min(SCALE.Q, e.projConsciousness - consciousnessLoss));
    if (e.projFluidLoss >= FATAL_FLUID_LOSS || e.projShock >= SCALE.Q || e.projConsciousness === 0) {
      e.projDead = true;
      e.projConsciousness = 0;
    }

    e.x += e.pushDvX;
    e.y += e.pushDvY;
  }

  state.tick += 1;

  return {
    tick: state.tick,
    entities: state.entities.map((e) => ({
      entityId: e.entityId,
      pushDvX: e.pushDvX,
      pushDvY: e.pushDvY,
      projFluidLoss: e.projFluidLoss,
      projShock: e.projShock,
      projConsciousness: e.projConsciousness,
      projDead: e.projDead,
      projHeadBleedingRate: e.bleedingRate,
    })),
  };
}

function toWorld(state: OracleState): ReturnType<typeof mkWorld> {
  const world = mkWorld(state.seed, state.entities.map((e, idx) => mkHumanoidEntity(e.entityId, (idx % 2) + 1, e.x, e.y)));
  for (const src of state.entities) {
    const ent = world.entities[src.entityId - 1]!;
    ent.injury.fluidLoss = src.projFluidLoss;
    ent.injury.shock = src.projShock;
    ent.injury.consciousness = src.projConsciousness;
    ent.injury.dead = src.projDead;
    ent.condition.suffocation = src.suffocation;
    ent.injury.byRegion.head.bleedingRate = src.bleedingRate;
    ent.injury.byRegion.head.structuralDamage = src.structuralDamage;
    ent.injury.byRegion.torso.internalDamage = src.internalDamage;
  }
  world.tick = state.tick;
  return world;
}

function applyWasmReport(state: OracleState, report: TickSnapshot): void {
  for (const row of report.entities) {
    const e = state.entities[row.entityId - 1]!;
    e.pushDvX = row.pushDvX;
    e.pushDvY = row.pushDvY;
    e.projFluidLoss = row.projFluidLoss;
    e.projShock = row.projShock;
    e.projConsciousness = row.projConsciousness;
    e.projDead = row.projDead;
    e.bleedingRate = row.projHeadBleedingRate;
    e.x += row.pushDvX;
    e.y += row.pushDvY;
  }
  state.tick = report.tick;
}

function normalizeWasmSnapshot(report: { tick: number; entities: Array<Record<string, unknown>> }): TickSnapshot {
  return {
    tick: report.tick,
    entities: report.entities.map((e) => ({
      entityId: Number(e.entityId),
      pushDvX: Number(e.pushDvX),
      pushDvY: Number(e.pushDvY),
      projFluidLoss: Number(e.projFluidLoss),
      projShock: Number(e.projShock),
      projConsciousness: Number(e.projConsciousness),
      projDead: Boolean(e.projDead),
      projHeadBleedingRate: Number(e.projHeadBleedingRate ?? 0),
    })),
  };
}

export function cloneState(state: OracleState): OracleState {
  return {
    tick: state.tick,
    seed: state.seed,
    entities: state.entities.map((e) => ({ ...e })),
  };
}

export function runTraceWithTs(state: OracleState, commands: OracleCommand[]): DeterminismTrace {
  const mutable = cloneState(state);
  const snapshots: TickSnapshot[] = [];
  for (const cmd of commands) {
    applyCommand(mutable, cmd);
    snapshots.push(tsStep(mutable));
  }
  return { finalState: mutable, snapshots };
}

export function runTraceWithWasm(state: OracleState, commands: OracleCommand[], kernel: KernelLike): DeterminismTrace {
  const mutable = cloneState(state);
  const snapshots: TickSnapshot[] = [];
  for (const cmd of commands) {
    applyCommand(mutable, cmd);
    const report = normalizeWasmSnapshot(kernel.shadowStep(toWorld(mutable), mutable.tick + 1));
    snapshots.push(report);
    applyWasmReport(mutable, report);
  }
  return { finalState: mutable, snapshots };
}

export function assertDeterminismOrThrow(
  expected: DeterminismTrace,
  actual: DeterminismTrace,
  repro: { runSeed: number; worldSeed: number; entityCount: number; commandCount: number; label?: string },
): void {
  const divergence = firstDivergence(expected.snapshots, actual.snapshots);
  if (divergence) {
    throw new Error(
      [
        "Determinism mismatch",
        repro.label ? `label=${repro.label}` : "",
        `runSeed=${repro.runSeed}`,
        `worldSeed=${repro.worldSeed}`,
        `entityCount=${repro.entityCount}`,
        `commandCount=${repro.commandCount}`,
        `tick=${divergence.tick}`,
        `entity=${divergence.entityId}`,
        `expected=${JSON.stringify(divergence.expected)}`,
        `actual=${JSON.stringify(divergence.actual)}`,
      ].filter(Boolean).join(" "),
    );
  }
  if (JSON.stringify(actual.finalState) !== JSON.stringify(expected.finalState)) {
    throw new Error(
      [
        "Determinism final state mismatch",
        repro.label ? `label=${repro.label}` : "",
        `runSeed=${repro.runSeed}`,
        `worldSeed=${repro.worldSeed}`,
        `entityCount=${repro.entityCount}`,
        `commandCount=${repro.commandCount}`,
      ].filter(Boolean).join(" "),
    );
  }
}

export function firstDivergence(a: TickSnapshot[], b: TickSnapshot[]): { tick: number; entityId: number; expected: unknown; actual: unknown } | undefined {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ea = a[i]!;
    const eb = b[i]!;
    if (JSON.stringify(ea) === JSON.stringify(eb)) continue;
    const m = Math.min(ea.entities.length, eb.entities.length);
    for (let j = 0; j < m; j++) {
      if (JSON.stringify(ea.entities[j]) !== JSON.stringify(eb.entities[j])) {
        return {
          tick: ea.tick,
          entityId: ea.entities[j]!.entityId,
          expected: ea.entities[j],
          actual: eb.entities[j],
        };
      }
    }
    return {
      tick: ea.tick,
      entityId: -1,
      expected: ea,
      actual: eb,
    };
  }
  return undefined;
}
