// test/capability12b.test.ts — Phase 12B deferred: kill triggers, terrain entry,
//   concentration auras, linked sources

import { describe, it, expect } from "vitest";
import { q, to, SCALE } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { TraceKinds } from "../src/sim/kinds";
import { CollectingTrace } from "../src/metrics";
import type { CapabilitySource, CapabilityEffect } from "../src/sim/capability";
import type { ActivateCommand } from "../src/sim/commands";

const BASE_CTX = { tractionCoeff: q(0.80) };

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSource(overrides: Partial<CapabilitySource> = {}): CapabilitySource {
  return {
    id: "src_test",
    label: "Test source",
    tags: ["magic"],
    reserve_J: 10_000,
    maxReserve_J: 10_000,
    regenModel: { type: "constant", regenRate_W: 0 },
    effects: [],
    ...overrides,
  };
}

function makeEffect(overrides: Partial<CapabilityEffect> = {}): CapabilityEffect {
  return {
    id: "eff_test",
    cost_J: 100,
    castTime_ticks: 0,
    payload: { kind: "velocity", delta_mps: { x: 0, y: 0, z: 0 } },
    ...overrides,
  };
}

function activateCmd(sourceId: string, effectId: string, targetId?: number): ActivateCommand {
  return targetId !== undefined
    ? { kind: "activate", sourceId, effectId, targetId }
    : { kind: "activate", sourceId, effectId };
}

// ── Kill-triggered regen ──────────────────────────────────────────────────────

describe("Kill-triggered regen", () => {
  it("entity with kill trigger gains amount_J when target dies", () => {
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    const victim = mkHumanoidEntity(2, 2, to.m(0.3), 0);
    const observer = mkHumanoidEntity(3, 1, to.m(2), 0);

    // Give observer a kill trigger
    const source = makeSource({
      id: "blood_well",
      reserve_J: 0,
      maxReserve_J: 100_000,
      regenModel: { type: "event", triggers: [{ on: "kill", amount_J: 500 }] },
    });
    observer.capabilitySources = [source];

    // Pre-kill the victim by setting fatal fluid loss
    victim.injury.fluidLoss = q(0.85) as any;

    const world = mkWorld(1, [attacker, victim, observer]);
    stepWorld(world, new Map(), BASE_CTX);

    const obsEntity = world.entities.find(e => e.id === 3)!;
    expect(obsEntity.capabilitySources![0]!.reserve_J).toBe(500);
  });

  it("multiple entities each gain their own amount_J from one kill", () => {
    const victim = mkHumanoidEntity(1, 2, 0, 0);
    victim.injury.fluidLoss = q(0.85) as any;

    const obs1 = mkHumanoidEntity(2, 1, to.m(2), 0);
    obs1.capabilitySources = [makeSource({
      id: "src_a", reserve_J: 0, maxReserve_J: 50_000,
      regenModel: { type: "event", triggers: [{ on: "kill", amount_J: 200 }] },
    })];

    const obs2 = mkHumanoidEntity(3, 1, to.m(4), 0);
    obs2.capabilitySources = [makeSource({
      id: "src_b", reserve_J: 0, maxReserve_J: 50_000,
      regenModel: { type: "event", triggers: [{ on: "kill", amount_J: 300 }] },
    })];

    const world = mkWorld(1, [victim, obs1, obs2]);
    stepWorld(world, new Map(), BASE_CTX);

    expect(world.entities.find(e => e.id === 2)!.capabilitySources![0]!.reserve_J).toBe(200);
    expect(world.entities.find(e => e.id === 3)!.capabilitySources![0]!.reserve_J).toBe(300);
  });

  it("killed entity itself is excluded from kill regen", () => {
    const victim = mkHumanoidEntity(1, 2, 0, 0);
    victim.injury.fluidLoss = q(0.85) as any;
    victim.capabilitySources = [makeSource({
      id: "self_src", reserve_J: 0, maxReserve_J: 50_000,
      regenModel: { type: "event", triggers: [{ on: "kill", amount_J: 999 }] },
    })];

    const world = mkWorld(1, [victim]);
    stepWorld(world, new Map(), BASE_CTX);

    // Victim died — should not have credited itself
    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(0);
  });

  it("entity without kill trigger is unaffected", () => {
    const victim = mkHumanoidEntity(1, 2, 0, 0);
    victim.injury.fluidLoss = q(0.85) as any;

    const obs = mkHumanoidEntity(2, 1, to.m(2), 0);
    obs.capabilitySources = [makeSource({
      id: "constant_src", reserve_J: 0, maxReserve_J: 50_000,
      regenModel: { type: "constant", regenRate_W: 0 },  // no kill trigger
    })];

    const world = mkWorld(1, [victim, obs]);
    stepWorld(world, new Map(), BASE_CTX);

    expect(world.entities.find(e => e.id === 2)!.capabilitySources![0]!.reserve_J).toBe(0);
  });

  it("two deaths in same tick: both trigger regen additively", () => {
    const v1 = mkHumanoidEntity(1, 2, 0, 0);
    v1.injury.fluidLoss = q(0.85) as any;
    const v2 = mkHumanoidEntity(2, 2, to.m(1), 0);
    v2.injury.fluidLoss = q(0.85) as any;

    const obs = mkHumanoidEntity(3, 1, to.m(5), 0);
    obs.capabilitySources = [makeSource({
      id: "src_double", reserve_J: 0, maxReserve_J: 100_000,
      regenModel: { type: "event", triggers: [{ on: "kill", amount_J: 400 }] },
    })];

    const world = mkWorld(1, [v1, v2, obs]);
    stepWorld(world, new Map(), BASE_CTX);

    expect(world.entities.find(e => e.id === 3)!.capabilitySources![0]!.reserve_J).toBe(800);
  });
});

// ── Terrain-entry triggers ────────────────────────────────────────────────────

describe("Terrain-entry triggers", () => {
  it("entity entering a tagged cell fires matching terrain trigger", () => {
    // Place entity directly inside cell 1,0 (x = 4 m) with no lastCellKey set.
    // First tick: currentKey="1,0" ≠ undefined → trigger fires.
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.position_m = { x: to.m(4), y: 0, z: 0 };  // cell 1,0
    e.capabilitySources = [makeSource({
      id: "ley_src", reserve_J: 0, maxReserve_J: 100_000,
      regenModel: { type: "event", triggers: [{ on: "terrain", tag: "ley_line", amount_J: 1000 }] },
    })];

    const cellSize_m = Math.trunc(4 * SCALE.m);
    const terrainTagGrid = new Map([["1,0", ["ley_line"]]]);

    const world = mkWorld(1, [e]);
    stepWorld(world, new Map(), { ...BASE_CTX, cellSize_m, terrainTagGrid });
    const reserveAfter = world.entities[0]!.capabilitySources![0]!.reserve_J;
    expect(reserveAfter).toBe(1000);
  });

  it("non-matching tag does not trigger", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.intent.move = { dir: { x: 1, y: 0, z: 0 }, intensity: q(1.0), mode: "run" };
    e.capabilitySources = [makeSource({
      id: "src_nomatch", reserve_J: 0, maxReserve_J: 100_000,
      regenModel: { type: "event", triggers: [{ on: "terrain", tag: "fire", amount_J: 500 }] },
    })];

    const cellSize_m = Math.trunc(4 * SCALE.m);
    const terrainTagGrid = new Map([["1,0", ["water"]]]);  // different tag

    const world = mkWorld(1, [e]);
    stepWorld(world, new Map(), { ...BASE_CTX, cellSize_m, terrainTagGrid });
    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(0);
  });

  it("staying in the same cell does not re-fire trigger", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);  // no movement intent
    e.capabilitySources = [makeSource({
      id: "src_stationary", reserve_J: 0, maxReserve_J: 100_000,
      regenModel: { type: "event", triggers: [{ on: "terrain", tag: "magic", amount_J: 200 }] },
    })];

    const cellSize_m = Math.trunc(4 * SCALE.m);
    const terrainTagGrid = new Map([["0,0", ["magic"]]]);

    const world = mkWorld(1, [e]);
    // Two ticks — entity stays in cell 0,0 after first tick establishes lastCellKey
    stepWorld(world, new Map(), { ...BASE_CTX, cellSize_m, terrainTagGrid });
    const r1 = world.entities[0]!.capabilitySources![0]!.reserve_J;
    stepWorld(world, new Map(), { ...BASE_CTX, cellSize_m, terrainTagGrid });
    const r2 = world.entities[0]!.capabilitySources![0]!.reserve_J;
    // First tick fires the trigger (entity first enters the tagged cell — lastCellKey undefined)
    // Second tick: same cell, no re-fire
    expect(r2).toBe(r1);
  });

  it("entity re-entering same cell after leaving fires trigger again", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      id: "src_reentry", reserve_J: 0, maxReserve_J: 100_000,
      regenModel: { type: "event", triggers: [{ on: "terrain", tag: "ley", amount_J: 300 }] },
    })];

    const cellSize_m = Math.trunc(4 * SCALE.m);
    const terrainTagGrid = new Map([["0,0", ["ley"]]]);

    const world = mkWorld(1, [e]);
    // First tick: fires (undefined → 0,0)
    stepWorld(world, new Map(), { ...BASE_CTX, cellSize_m, terrainTagGrid });
    const r1 = world.entities[0]!.capabilitySources![0]!.reserve_J;

    // Move to adjacent untagged cell by overriding position directly
    world.entities[0]!.position_m = { x: to.m(5), y: 0, z: 0 };
    world.entities[0]!.action.lastCellKey = "1,0";  // simulate being in cell 1,0

    // Return to cell 0,0
    world.entities[0]!.position_m = { x: 0, y: 0, z: 0 };
    world.entities[0]!.action.lastCellKey = "1,0";  // still "in" the previous cell

    stepWorld(world, new Map(), { ...BASE_CTX, cellSize_m, terrainTagGrid });
    const r2 = world.entities[0]!.capabilitySources![0]!.reserve_J;
    expect(r2).toBe(r1 + 300); // fired again
  });

  it("no terrainTagGrid = no terrain trigger effect", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.intent.move = { dir: { x: 1, y: 0, z: 0 }, intensity: q(1.0), mode: "run" };
    e.capabilitySources = [makeSource({
      id: "src_notag", reserve_J: 0, maxReserve_J: 100_000,
      regenModel: { type: "event", triggers: [{ on: "terrain", tag: "ley", amount_J: 999 }] },
    })];

    const world = mkWorld(1, [e]);
    stepWorld(world, new Map(), BASE_CTX);  // no terrainTagGrid in ctx
    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(0);
  });
});

// ── Concentration auras (castTime_ticks = -1) ─────────────────────────────────

describe("Concentration auras", () => {
  it("castTime_ticks = -1: sets activeConcentration without applying effect immediately", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const src = makeSource({
      id: "aura_src", reserve_J: 10_000, maxReserve_J: 10_000,
      regenModel: { type: "constant", regenRate_W: 0 },
      effects: [makeEffect({ id: "aura_eff", cost_J: 50, castTime_ticks: -1,
        payload: { kind: "velocity", delta_mps: { x: 0, y: 0, z: 0 } } })],
    });
    e.capabilitySources = [src];

    const world = mkWorld(1, [e]);
    const cmds = new Map([[1, [activateCmd("aura_src", "aura_eff")]]]);
    stepWorld(world, cmds, BASE_CTX);

    const entity = world.entities[0]!;
    expect(entity.activeConcentration).toBeDefined();
    expect(entity.activeConcentration!.sourceId).toBe("aura_src");
    expect(entity.activeConcentration!.effectId).toBe("aura_eff");
    // No upfront cost deduction at activation
    expect(entity.capabilitySources![0]!.reserve_J).toBe(10_000);
  });

  it("each tick deducts cost_J from reserve while concentrating", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      id: "aura_src", reserve_J: 10_000, maxReserve_J: 10_000,
      regenModel: { type: "constant", regenRate_W: 0 },
      effects: [makeEffect({ id: "aura_eff", cost_J: 200, castTime_ticks: -1 })],
    })];

    const world = mkWorld(1, [e]);
    // Activate
    stepWorld(world, new Map([[1, [activateCmd("aura_src", "aura_eff")]]]), BASE_CTX);
    // Let it run for 3 more ticks (0 cost at activation; 200/tick while concentrating)
    for (let i = 0; i < 3; i++) stepWorld(world, new Map(), BASE_CTX);

    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(10_000 - 200 * 3);
  });

  it("each tick applies the payload to target", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    // Use armourLayer as a testable per-tick payload
    e.capabilitySources = [makeSource({
      id: "shield_src", reserve_J: 50_000, maxReserve_J: 50_000,
      regenModel: { type: "constant", regenRate_W: 0 },
      effects: [makeEffect({ id: "shield_eff", cost_J: 10, castTime_ticks: -1,
        payload: { kind: "armourLayer", resist_J: 100, channels: [1], duration_ticks: 5 } })],
    })];

    const world = mkWorld(1, [e]);
    stepWorld(world, new Map([[1, [activateCmd("shield_src", "shield_eff")]]]), BASE_CTX);
    stepWorld(world, new Map(), BASE_CTX);

    // shieldReserve_J should have accumulated from repeated armourLayer payloads
    const shieldVal = (world.entities[0]!.condition as any).shieldReserve_J ?? 0;
    expect(shieldVal).toBeGreaterThan(0);
  });

  it("concentration breaks and emits CastInterrupted when reserve < cost_J", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      id: "drain_src", reserve_J: 150, maxReserve_J: 10_000,
      regenModel: { type: "constant", regenRate_W: 0 },
      effects: [makeEffect({ id: "drain_eff", cost_J: 100, castTime_ticks: -1 })],
    })];

    const tracer = new CollectingTrace();
    const world = mkWorld(1, [e]);

    stepWorld(world, new Map([[1, [activateCmd("drain_src", "drain_eff")]]]), BASE_CTX);
    // Reserve = 150; first concentration tick deducts 100 → 50 remaining
    stepWorld(world, new Map(), { ...BASE_CTX, trace: tracer });
    // Reserve = 50 < 100 cost; concentration should break
    stepWorld(world, new Map(), { ...BASE_CTX, trace: tracer });

    const broken = world.entities[0]!.activeConcentration;
    expect(broken).toBeUndefined();
    const interrupted = tracer.events.some(ev => ev.kind === TraceKinds.CastInterrupted);
    expect(interrupted).toBe(true);
  });

  it("shock >= q(0.30) breaks concentration", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      id: "shock_src", reserve_J: 50_000, maxReserve_J: 50_000,
      regenModel: { type: "constant", regenRate_W: 0 },
      effects: [makeEffect({ id: "shock_eff", cost_J: 1, castTime_ticks: -1 })],
    })];

    const tracer = new CollectingTrace();
    const world = mkWorld(1, [e]);
    stepWorld(world, new Map([[1, [activateCmd("shock_src", "shock_eff")]]]), BASE_CTX);

    // Manually apply high shock to entity
    world.entities[0]!.injury.shock = q(0.35) as any;
    stepWorld(world, new Map(), { ...BASE_CTX, trace: tracer });

    expect(world.entities[0]!.activeConcentration).toBeUndefined();
    expect(tracer.events.some(ev => ev.kind === TraceKinds.CastInterrupted)).toBe(true);
  });

  it("boundless source: concentration never breaks from reserve depletion", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      id: "boundless_src",
      reserve_J: 0, maxReserve_J: Number.MAX_SAFE_INTEGER,
      regenModel: { type: "boundless" },
      effects: [makeEffect({ id: "boundless_eff", cost_J: 999_999, castTime_ticks: -1 })],
    })];

    const world = mkWorld(1, [e]);
    stepWorld(world, new Map([[1, [activateCmd("boundless_src", "boundless_eff")]]]), BASE_CTX);
    for (let i = 0; i < 10; i++) stepWorld(world, new Map(), BASE_CTX);

    expect(world.entities[0]!.activeConcentration).toBeDefined();
  });

  it("activating a second concentration replaces the first", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      id: "dual_src", reserve_J: 50_000, maxReserve_J: 50_000,
      regenModel: { type: "constant", regenRate_W: 0 },
      effects: [
        makeEffect({ id: "eff_a", cost_J: 10, castTime_ticks: -1 }),
        makeEffect({ id: "eff_b", cost_J: 10, castTime_ticks: -1 }),
      ],
    })];

    const world = mkWorld(1, [e]);
    stepWorld(world, new Map([[1, [activateCmd("dual_src", "eff_a")]]]), BASE_CTX);
    expect(world.entities[0]!.activeConcentration?.effectId).toBe("eff_a");

    stepWorld(world, new Map([[1, [activateCmd("dual_src", "eff_b")]]]), BASE_CTX);
    expect(world.entities[0]!.activeConcentration?.effectId).toBe("eff_b");
  });

  it("activeConcentration cleared after break; no further effect next tick", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      id: "src_break", reserve_J: 50, maxReserve_J: 50_000,
      regenModel: { type: "constant", regenRate_W: 0 },
      effects: [makeEffect({ id: "eff_break", cost_J: 60, castTime_ticks: -1 })],
    })];

    const world = mkWorld(1, [e]);
    stepWorld(world, new Map([[1, [activateCmd("src_break", "eff_break")]]]), BASE_CTX);
    // Reserve = 50 < 60 cost — breaks immediately on first step
    stepWorld(world, new Map(), BASE_CTX);

    expect(world.entities[0]!.activeConcentration).toBeUndefined();
    const reserveAfterBreak = world.entities[0]!.capabilitySources![0]!.reserve_J;
    // Tick again — no concentration, reserve unchanged (constant rate = 0)
    stepWorld(world, new Map(), BASE_CTX);
    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(reserveAfterBreak);
  });
});

// ── Linked sources ────────────────────────────────────────────────────────────

describe("Linked sources", () => {
  it("primary has enough reserve: fallback untouched, cost drawn from primary", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const primary = makeSource({
      id: "primary", reserve_J: 5_000, maxReserve_J: 10_000,
      regenModel: { type: "constant", regenRate_W: 0 },
      linkedFallbackId: "fallback",
      effects: [makeEffect({ id: "eff", cost_J: 100, castTime_ticks: 0 })],
    });
    const fallback = makeSource({
      id: "fallback", reserve_J: 3_000, maxReserve_J: 10_000,
      regenModel: { type: "constant", regenRate_W: 0 },
      effects: [],
    });
    e.capabilitySources = [primary, fallback];

    const world = mkWorld(1, [e]);
    stepWorld(world, new Map([[1, [activateCmd("primary", "eff")]]]), BASE_CTX);

    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(4_900); // primary deducted
    expect(world.entities[0]!.capabilitySources![1]!.reserve_J).toBe(3_000); // fallback untouched
  });

  it("primary depleted, fallback sufficient: cost drawn from fallback", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const primary = makeSource({
      id: "primary", reserve_J: 50, maxReserve_J: 10_000,  // 50 < 200 cost
      regenModel: { type: "constant", regenRate_W: 0 },
      linkedFallbackId: "fallback",
      effects: [makeEffect({ id: "eff", cost_J: 200, castTime_ticks: 0 })],
    });
    const fallback = makeSource({
      id: "fallback", reserve_J: 5_000, maxReserve_J: 10_000,
      regenModel: { type: "constant", regenRate_W: 0 },
      effects: [],
    });
    e.capabilitySources = [primary, fallback];

    const world = mkWorld(1, [e]);
    stepWorld(world, new Map([[1, [activateCmd("primary", "eff")]]]), BASE_CTX);

    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(50); // primary untouched
    expect(world.entities[0]!.capabilitySources![1]!.reserve_J).toBe(4_800); // fallback deducted
  });

  it("both depleted: activation silently fails", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const primary = makeSource({
      id: "primary", reserve_J: 10, maxReserve_J: 10_000,
      regenModel: { type: "constant", regenRate_W: 0 },
      linkedFallbackId: "fallback",
      effects: [makeEffect({ id: "eff", cost_J: 500, castTime_ticks: 0,
        payload: { kind: "velocity", delta_mps: { x: to.m(5), y: 0, z: 0 } } })],
    });
    const fallback = makeSource({
      id: "fallback", reserve_J: 20, maxReserve_J: 10_000,
      regenModel: { type: "constant", regenRate_W: 0 },
      effects: [],
    });
    e.capabilitySources = [primary, fallback];

    const world = mkWorld(1, [e]);
    const velBefore = world.entities[0]!.velocity_mps.x;
    stepWorld(world, new Map([[1, [activateCmd("primary", "eff")]]]), BASE_CTX);

    // Velocity unchanged — activation failed silently
    expect(world.entities[0]!.velocity_mps.x).toBe(velBefore);
    // Reserves unchanged
    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(10);
    expect(world.entities[0]!.capabilitySources![1]!.reserve_J).toBe(20);
  });

  it("fallback is boundless: activation always succeeds regardless of primary reserve", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const primary = makeSource({
      id: "primary", reserve_J: 0, maxReserve_J: 10_000,
      regenModel: { type: "constant", regenRate_W: 0 },
      linkedFallbackId: "fallback",
      effects: [makeEffect({ id: "eff", cost_J: 999, castTime_ticks: 0 })],
    });
    const fallback = makeSource({
      id: "fallback", reserve_J: 0, maxReserve_J: Number.MAX_SAFE_INTEGER,
      regenModel: { type: "boundless" },
      effects: [],
    });
    e.capabilitySources = [primary, fallback];

    const tracer = new CollectingTrace();
    const world = mkWorld(1, [e]);
    stepWorld(world, new Map([[1, [activateCmd("primary", "eff")]]]), { ...BASE_CTX, trace: tracer });

    // Activation should have succeeded (CapabilityActivated emitted)
    expect(tracer.events.some(ev => ev.kind === TraceKinds.CapabilityActivated)).toBe(true);
    // Fallback is boundless — its reserve is unchanged
    expect(world.entities[0]!.capabilitySources![1]!.reserve_J).toBe(0);
  });

  it("no linkedFallbackId on exhausted source: activation fails (existing behaviour)", () => {

    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      id: "solo", reserve_J: 10, maxReserve_J: 10_000,
      regenModel: { type: "constant", regenRate_W: 0 },
      effects: [makeEffect({ id: "eff", cost_J: 500, castTime_ticks: 0 })],
      // no linkedFallbackId
    })];

    const tracer = new CollectingTrace();
    const world = mkWorld(1, [e]);
    stepWorld(world, new Map([[1, [activateCmd("solo", "eff")]]]), { ...BASE_CTX, trace: tracer });

    expect(tracer.events.some(ev => ev.kind === TraceKinds.CapabilityActivated)).toBe(false);
    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(10);
  });
});

// ── Effect chains ─────────────────────────────────────────────────────────────

import type { FieldEffectSpec } from "../src/sim/capability";
import { SCALE as _SCALE } from "../src/units";

describe("Effect chains", () => {
  /** Helper: make a FieldEffectSpec with an optional chainPayload. */
  function makeFieldSpec(overrides: Partial<FieldEffectSpec> = {}): FieldEffectSpec {
    return {
      radius_m: Math.trunc(5 * SCALE.m),  // 5 m radius
      suppressesTags: [],
      duration_ticks: 3,
      ...overrides,
    };
  }

  /** Helper: capability source that places a field effect on activation. */
  function makePlacerSource(fieldSpec: FieldEffectSpec): CapabilitySource {
    return makeSource({
      id: "placer_src",
      reserve_J: 100_000,
      maxReserve_J: 100_000,
      regenModel: { type: "boundless" },
      effects: [makeEffect({
        id: "place_field",
        cost_J: 0,
        castTime_ticks: 0,
        payload: { kind: "fieldEffect", spec: fieldSpec },
      })],
    });
  }

  it("entity within field radius receives chainPayload each tick", () => {
    // Placer at origin; target at 2 m (inside 5 m radius)
    const placer = mkHumanoidEntity(1, 1, 0, 0);
    placer.capabilitySources = [makePlacerSource(makeFieldSpec({
      chainPayload: { kind: "armourLayer", resist_J: 500, channels: [], duration_ticks: 10 },
    }))];

    const target = mkHumanoidEntity(2, 2, to.m(2), 0);
    const world = mkWorld(1, [placer, target]);

    // Tick 1: place field
    stepWorld(world, new Map([[1, [activateCmd("placer_src", "place_field")]]]), BASE_CTX);
    const shieldAfterT1 = world.entities[1]!.condition.shieldReserve_J ?? 0;
    expect(shieldAfterT1).toBe(500);

    // Tick 2: chain fires again (field duration=2 remaining)
    stepWorld(world, new Map(), BASE_CTX);
    const shieldAfterT2 = world.entities[1]!.condition.shieldReserve_J ?? 0;
    expect(shieldAfterT2).toBe(1000);
  });

  it("entity outside field radius does not receive chainPayload", () => {
    const placer = mkHumanoidEntity(1, 1, 0, 0);
    placer.capabilitySources = [makePlacerSource(makeFieldSpec({
      radius_m: Math.trunc(3 * SCALE.m),  // 3 m radius
      chainPayload: { kind: "armourLayer", resist_J: 500, channels: [], duration_ticks: 10 },
    }))];

    const outside = mkHumanoidEntity(2, 2, to.m(10), 0);  // 10 m away
    const world = mkWorld(1, [placer, outside]);

    stepWorld(world, new Map([[1, [activateCmd("placer_src", "place_field")]]]), BASE_CTX);
    expect(world.entities[1]!.condition.shieldReserve_J ?? 0).toBe(0);
  });

  it("dead entity inside field radius is excluded from chainPayload", () => {
    const placer = mkHumanoidEntity(1, 1, 0, 0);
    placer.capabilitySources = [makePlacerSource(makeFieldSpec({
      chainPayload: { kind: "armourLayer", resist_J: 500, channels: [], duration_ticks: 10 },
    }))];

    const dead = mkHumanoidEntity(2, 2, to.m(1), 0);
    dead.injury.dead = true;

    const world = mkWorld(1, [placer, dead]);
    stepWorld(world, new Map([[1, [activateCmd("placer_src", "place_field")]]]), BASE_CTX);
    expect(world.entities[1]!.condition.shieldReserve_J ?? 0).toBe(0);
  });

  it("chain stops firing after field expires", () => {
    const placer = mkHumanoidEntity(1, 1, 0, 0);
    placer.capabilitySources = [makePlacerSource(makeFieldSpec({
      duration_ticks: 2,  // expires after 2 ticks
      chainPayload: { kind: "armourLayer", resist_J: 100, channels: [], duration_ticks: 99 },
    }))];

    const target = mkHumanoidEntity(2, 2, to.m(1), 0);
    const world = mkWorld(1, [placer, target]);

    stepWorld(world, new Map([[1, [activateCmd("placer_src", "place_field")]]]), BASE_CTX);
    const s1 = world.entities[1]!.condition.shieldReserve_J ?? 0;  // 100 (tick 1)
    stepWorld(world, new Map(), BASE_CTX);
    const s2 = world.entities[1]!.condition.shieldReserve_J ?? 0;  // 200 (tick 2 — last active tick)
    stepWorld(world, new Map(), BASE_CTX);
    const s3 = world.entities[1]!.condition.shieldReserve_J ?? 0;  // still 200 — field expired

    expect(s1).toBe(100);
    expect(s2).toBe(200);
    expect(s3).toBe(200);
  });

  it("multiple entities inside radius all receive chainPayload", () => {
    const placer = mkHumanoidEntity(1, 1, 0, 0);
    placer.capabilitySources = [makePlacerSource(makeFieldSpec({
      chainPayload: { kind: "armourLayer", resist_J: 300, channels: [], duration_ticks: 10 },
    }))];

    const t2 = mkHumanoidEntity(2, 2, to.m(1), 0);
    const t3 = mkHumanoidEntity(3, 2, to.m(2), 0);
    const world = mkWorld(1, [placer, t2, t3]);

    stepWorld(world, new Map([[1, [activateCmd("placer_src", "place_field")]]]), BASE_CTX);
    expect(world.entities[1]!.condition.shieldReserve_J ?? 0).toBe(300);
    expect(world.entities[2]!.condition.shieldReserve_J ?? 0).toBe(300);
  });
});
