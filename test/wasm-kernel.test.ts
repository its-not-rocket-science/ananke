// test/wasm-kernel.test.ts — end-to-end test for WasmKernel.shadowStep()
//
// Requires WASM to be built first:  npm run build:wasm:all
// Auto-skipped when dist/as/push.wasm is absent.

import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { WasmKernel } from "../src/wasm-kernel.js";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing.js";
import { SCALE } from "../src/units.js";

// loadWasmKernel() resolves WASM paths relative to the *compiled* JS file
// (dist/src/wasm-kernel.js → ../as/*.wasm).  Import from dist/ so that
// import.meta.url resolves correctly; skip if either artefact is absent.
const DIST_KERNEL = fileURLToPath(new URL("../dist/src/wasm-kernel.js", import.meta.url));
const PUSH_WASM   = fileURLToPath(new URL("../dist/as/push.wasm",        import.meta.url));
const INJURY_WASM = fileURLToPath(new URL("../dist/as/injury.wasm",      import.meta.url));
const wasmBuilt   = existsSync(DIST_KERNEL) && existsSync(PUSH_WASM) && existsSync(INJURY_WASM);

describe.skipIf(!wasmBuilt)("WasmKernel.shadowStep()", () => {
  let kernel: WasmKernel;

  beforeAll(async () => {
    const { loadWasmKernel } = await import(DIST_KERNEL) as typeof import("../src/wasm-kernel.js");
    kernel = await loadWasmKernel();
  });

  it("returns ok:true with one entity per world entity", () => {
    const world = mkWorld(1, [
      mkHumanoidEntity(1, 1, 0, 0),
      mkHumanoidEntity(2, 2, 1 * SCALE.m, 0),
    ]);
    const report = kernel.shadowStep(world, 1);
    expect(report.ok).toBe(true);
    expect(report.tick).toBe(1);
    expect(report.entities).toHaveLength(2);
  });

  it("report entity ids match world entity ids", () => {
    const world = mkWorld(1, [
      mkHumanoidEntity(10, 1, 0, 0),
      mkHumanoidEntity(20, 1, 2 * SCALE.m, 0),
    ]);
    const report = kernel.shadowStep(world, 5);
    expect(report.entities[0]!.entityId).toBe(10);
    expect(report.entities[1]!.entityId).toBe(20);
  });

  it("overlapping entities produce non-zero repulsion dv", () => {
    // Two entities 0.1 m apart — well inside the 0.45 m personal radius
    const world = mkWorld(1, [
      mkHumanoidEntity(1, 1, 0, 0),
      mkHumanoidEntity(2, 2, Math.trunc(0.1 * SCALE.m), 0),
    ]);
    const report = kernel.shadowStep(world, 1);
    const dvX0 = report.entities[0]!.pushDvX;
    const dvX1 = report.entities[1]!.pushDvX;
    // Equal and opposite
    expect(dvX0).not.toBe(0);
    expect(dvX1).not.toBe(0);
    expect(dvX0 + dvX1).toBe(0);
  });

  it("entities far apart produce zero repulsion dv", () => {
    // 10 m apart — well beyond 0.45 m personal radius
    const world = mkWorld(1, [
      mkHumanoidEntity(1, 1, 0, 0),
      mkHumanoidEntity(2, 2, 10 * SCALE.m, 0),
    ]);
    const report = kernel.shadowStep(world, 1);
    expect(report.entities[0]!.pushDvX).toBe(0);
    expect(report.entities[1]!.pushDvX).toBe(0);
  });

  it("healthy entity at tick 0 has zero projected fluid loss and non-zero consciousness", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const report = kernel.shadowStep(world, 0);
    const e = report.entities[0]!;
    expect(e.projFluidLoss).toBe(0);
    expect(e.projConsciousness).toBeGreaterThan(0);
    expect(e.projDead).toBe(false);
  });

  it("dead entity is skipped — projDead remains true", () => {
    const world = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    world.entities[0]!.injury.dead = true;
    const report = kernel.shadowStep(world, 1);
    expect(report.entities[0]!.projDead).toBe(true);
  });

  it("shadow step does not mutate world state", () => {
    const world = mkWorld(1, [
      mkHumanoidEntity(1, 1, 0, 0),
      mkHumanoidEntity(2, 2, 0, 0),
    ]);
    const fluidBefore = world.entities[0]!.injury.fluidLoss;
    const tickBefore = world.tick;
    kernel.shadowStep(world, 1);
    expect(world.entities[0]!.injury.fluidLoss).toBe(fluidBefore);
    expect(world.tick).toBe(tickBefore);
  });

  it("summary string contains tick and entity ids", () => {
    const world = mkWorld(1, [
      mkHumanoidEntity(3, 1, 0, 0),
      mkHumanoidEntity(7, 1, 5 * SCALE.m, 0),
    ]);
    const report = kernel.shadowStep(world, 42);
    expect(report.summary).toContain("tick 42");
    expect(report.summary).toContain("e3");
    expect(report.summary).toContain("e7");
  });
});
