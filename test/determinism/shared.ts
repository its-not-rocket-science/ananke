import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { mkHumanoidEntity, mkWorld } from "../../src/sim/testing.js";
import { stepWorld } from "../../src/sim/kernel.js";
import { SCALE, q } from "../../src/units.js";
import type { Command, CommandMap } from "../../src/sim/commands.js";
import type { WorldState } from "../../src/sim/world.js";
import type { WasmKernel } from "../../src/wasm-kernel.js";

export interface TickSnapshot {
  tick: number;
  world: WorldState;
  wasmReport: unknown;
}

export interface RunResult {
  finalWorld: WorldState;
  snapshots: TickSnapshot[];
}

export function makeRng(seed: number): () => number {
  let x = seed | 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0x1_0000_0000;
  };
}

function randInt(next: () => number, min: number, max: number): number {
  return min + Math.floor(next() * (max - min + 1));
}

function pick<T>(next: () => number, values: readonly T[]): T {
  return values[randInt(next, 0, values.length - 1)]!;
}

export function makeWorldFromSeed(seed: number, entityCount: number): WorldState {
  const next = makeRng(seed ^ 0x9e3779b9);
  const entities = Array.from({ length: entityCount }, (_, idx) => {
    const id = idx + 1;
    const x = randInt(next, -50 * SCALE.m, 50 * SCALE.m);
    const y = randInt(next, -50 * SCALE.m, 50 * SCALE.m);
    const teamId = (id % 2) + 1;
    return mkHumanoidEntity(id, teamId, x, y);
  });

  return mkWorld(seed, entities);
}

export function makeCommandSequence(seed: number, entityCount: number, ticks: number): CommandMap[] {
  const next = makeRng(seed ^ 0x85ebca6b);
  const seq: CommandMap[] = [];

  for (let tick = 0; tick < ticks; tick++) {
    const map: CommandMap = new Map();
    for (let id = 1; id <= entityCount; id++) {
      const cmdKind = randInt(next, 0, 3);
      const commands: Command[] = [];
      if (cmdKind === 0) {
        const dirX = randInt(next, -SCALE.Q, SCALE.Q);
        const dirY = randInt(next, -SCALE.Q, SCALE.Q);
        commands.push({
          kind: "move",
          dir: { x: dirX, y: dirY, z: 0 },
          intensity: q(next()),
          mode: pick(next, ["walk", "run", "sprint", "crawl"] as const),
        });
      } else if (cmdKind === 1) {
        commands.push({
          kind: "defend",
          mode: pick(next, ["none", "block", "parry", "dodge"] as const),
          intensity: q(next()),
        });
      } else if (cmdKind === 2) {
        commands.push({ kind: "setProne", prone: next() > 0.5 });
      } else {
        const targetId = randInt(next, 1, entityCount);
        if (targetId !== id) {
          commands.push({ kind: "attack", targetId, mode: "strike", intensity: q(next()) });
        }
      }
      map.set(id, commands);
    }
    seq.push(map);
  }

  return seq;
}

export async function loadWasmKernelFromDist(): Promise<WasmKernel> {
  const distKernel = fileURLToPath(new URL("../../dist/src/wasm-kernel.js", import.meta.url));
  const { loadWasmKernel } = await import(distKernel) as typeof import("../../src/wasm-kernel.js");
  return loadWasmKernel();
}

export function runSequence(world: WorldState, sequence: CommandMap[], kernel: WasmKernel): RunResult {
  const snapshots: TickSnapshot[] = [];
  for (const cmds of sequence) {
    stepWorld(world, cmds, { tractionCoeff: q(0.9) });
    const report = kernel.shadowStep(world, world.tick);
    snapshots.push({
      tick: world.tick,
      world: structuredClone(world),
      wasmReport: structuredClone(report),
    });
  }
  return { finalWorld: structuredClone(world), snapshots };
}

export function parseCliSeed(): number | undefined {
  const fromEnv = process.env.DETERMINISM_SEED;
  if (fromEnv !== undefined) {
    const parsed = Number(fromEnv);
    return Number.isInteger(parsed) ? parsed : undefined;
  }
  const idx = process.argv.indexOf("--seed");
  if (idx < 0 || idx === process.argv.length - 1) return undefined;
  const parsed = Number(process.argv[idx + 1]);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function readBadgeRunDate(): string {
  try {
    const md = readFileSync(fileURLToPath(new URL("../../README.md", import.meta.url)), "utf8");
    const match = md.match(/last run:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
    return match?.[1] ?? "unknown";
  } catch {
    return "unknown";
  }
}

const PUSH_RADIUS = Math.trunc(0.45 * SCALE.m);
const PUSH_REPEL = Math.trunc(1.5 * SCALE.mps2);
const REGION_ORDER = ["head", "torso", "leftArm", "rightArm", "leftLeg", "rightLeg"] as const;

function approxDist(dx: number, dy: number): number {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  return adx > ady ? adx + (ady >> 1) : ady + (adx >> 1);
}

export function tsShadowStep(world: WorldState): unknown {
  const n = world.entities.length;
  const dv = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  const radius2 = BigInt(PUSH_RADIUS) * BigInt(PUSH_RADIUS);

  for (let i = 0; i < n - 1; i++) {
    const a = world.entities[i]!;
    if (a.injury.dead) continue;
    for (let j = i + 1; j < n; j++) {
      const b = world.entities[j]!;
      if (b.injury.dead) continue;
      const dx = b.position_m.x - a.position_m.x;
      const dy = b.position_m.y - a.position_m.y;
      const d2 = BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy);
      if (d2 >= radius2 || d2 === 0n) continue;
      const d = approxDist(dx, dy);
      const overlap = PUSH_RADIUS - d;
      if (overlap <= 0) continue;
      const strengthQ = Math.max(0, Math.min(SCALE.Q, Math.trunc((overlap * SCALE.Q) / PUSH_RADIUS)));
      const denom = BigInt(Math.max(1, d)) * BigInt(SCALE.Q);
      const ax = Number(BigInt(dx) * BigInt(PUSH_REPEL) * BigInt(strengthQ) / denom);
      const ay = Number(BigInt(dy) * BigInt(PUSH_REPEL) * BigInt(strengthQ) / denom);
      dv[i]!.x -= ax;
      dv[i]!.y -= ay;
      dv[j]!.x += ax;
      dv[j]!.y += ay;
    }
  }

  const entities = world.entities.map((e, i) => {
    const suff = (e.condition as Record<string, number>).suffocation ?? 0;
    const perRegion = REGION_ORDER.map((r) => e.injury.byRegion[r]);

    let totalBleed = 0;
    const bleedRates = perRegion.map((region) => {
      const bleed = region?.bleedingRate ?? 0;
      if (bleed <= 0) return 0;
      const structuralDamage = region?.structuralDamage ?? 0;
      const structIntegrity = Math.max(0, Math.min(SCALE.Q, SCALE.Q - structuralDamage));
      const clotRate = Math.trunc((structIntegrity * 2) / SCALE.Q);
      const nextBleed = Math.max(0, Math.min(SCALE.Q, bleed - clotRate));
      totalBleed += nextBleed;
      return nextBleed;
    });
    if (totalBleed === 0) totalBleed = bleedRates.reduce((a, b) => a + b, 0);

    const fluidLoss = Math.max(0, Math.min(SCALE.Q, e.injury.fluidLoss + Math.trunc((totalBleed * 500) / SCALE.Q)));
    const torsoInternal = e.injury.byRegion.torso.internalDamage;
    const shock = Math.max(0, Math.min(SCALE.Q,
      e.injury.shock + Math.trunc((fluidLoss * 40) / SCALE.Q) + Math.trunc((torsoInternal * 20) / SCALE.Q),
    ));
    const consciousnessLoss = Math.max(0, Math.min(SCALE.Q,
      Math.trunc((shock * 100) / SCALE.Q) + Math.trunc((suff * 200) / SCALE.Q),
    ));
    let consciousness = Math.max(0, Math.min(SCALE.Q, e.injury.consciousness - consciousnessLoss));
    let dead = e.injury.dead;
    if (fluidLoss >= 8000 || shock >= SCALE.Q || consciousness === 0) {
      dead = true;
      consciousness = 0;
    }

    return {
      entityId: e.id,
      pushDvX: dv[i]!.x,
      pushDvY: dv[i]!.y,
      projFluidLoss: fluidLoss,
      projShock: shock,
      projConsciousness: consciousness,
      projDead: dead,
    };
  });

  return { tick: world.tick, entities, ok: true };
}
