// test/compat/bridge-contract.test.ts — PH-4: Save/Replay/Bridge Contract Tests
//
// Golden compatibility fixtures for the bridge data-extraction surface.
// On first run, fixtures are generated and written to test/snapshots/.
// On subsequent runs the live output is compared against the committed fixture.
//
// If a test fails the bridge output format has changed — either intentionally
// (delete test/snapshots/bridge-contract-snapshot.json and re-run) or as a
// regression (investigate and fix before merging).

import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { q, SCALE, type Q } from "../../src/units.js";
import type { KernelContext } from "../../src/sim/context.js";
import { stepWorld }          from "../../src/sim/kernel.js";
import { mkWorld }            from "../../src/sim/testing.js";
import { mkKnight }           from "../../src/presets.js";
import { mkHumanoidEntity as _mkHumanoidEntity }   from "../../src/sim/testing.js";
import { extractRigSnapshots, deriveAnimationHints, deriveGrappleConstraint } from "../../src/model3d.js";
import { BridgeEngine }       from "../../src/bridge/bridge-engine.js";

// ── Snapshot helpers (same pattern as kernel_behaviour_snapshot.test.ts) ──────

const SNAPSHOT_DIR  = join(process.cwd(), "test", "snapshots");
const SNAPSHOT_PATH = join(SNAPSHOT_DIR, "bridge-contract-snapshot.json");

if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });

function loadSnapshots(): Record<string, string> {
  if (!existsSync(SNAPSHOT_PATH)) return {};
  try { return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Record<string, string>; }
  catch { return {}; }
}

function saveSnapshot(key: string, value: string): void {
  const all = loadSnapshots();
  all[key] = value;
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(all, null, 2), "utf8");
}

function checkSnapshot(key: string, actual: string): { matched: boolean; expected: string | undefined } {
  const all = loadSnapshots();
  if (!(key in all)) { saveSnapshot(key, actual); return { matched: true, expected: undefined }; }
  return { matched: all[key] === actual, expected: all[key] };
}

// ── Scenario: Knight vs. Brawler at tick 50 ───────────────────────────────────

const CTX: KernelContext = { tractionCoeff: q(0.80) as Q };

function buildKnightVsBrawlerAt50(): ReturnType<typeof extractRigSnapshots> {
  const knight = mkKnight(1, 1, 0, 0);
  const brawler = mkKnight(2, 2, 10000, 0); // mirror knight as proxy for "brawler" shape
  const world = mkWorld(42, [knight, brawler]);

  for (let t = 0; t < 50; t++) {
    const cmds = new Map([
      [1, [{ kind: "attack" as const, targetId: 2, weaponSlot: "mainHand" }]],
      [2, [{ kind: "attack" as const, targetId: 1, weaponSlot: "mainHand" }]],
    ]);
    stepWorld(world, cmds, CTX);
  }

  return extractRigSnapshots(world);
}

// ── Fixture helpers ───────────────────────────────────────────────────────────

/** Strip non-stable fields (tick) before snapshotting structural shape. */
function rigSnapshotShape(snap: ReturnType<typeof extractRigSnapshots>[0]) {
  return {
    entityId:  snap.entityId,
    teamId:    snap.teamId,
    hasAnimation: snap.animation !== undefined,
    animationKeys: Object.keys(snap.animation).sort(),
    hasPose:    Array.isArray(snap.pose),
    hasGrapple: snap.grapple !== undefined,
    grappleKeys: Object.keys(snap.grapple).sort(),
    hasMass:    snap.mass !== undefined,
    massKeys:   Object.keys(snap.mass).sort(),
    hasInertia: snap.inertia !== undefined,
  };
}

// ── Tests: rig snapshot structural compatibility ──────────────────────────────

describe("PH-4 bridge contract — RigSnapshot structural shape", () => {
  const snaps = buildKnightVsBrawlerAt50();

  it("extractRigSnapshots returns one entry per entity", () => {
    expect(snaps).toHaveLength(2);
  });

  it("every snapshot has entityId, teamId, animation, pose, grapple, mass, inertia", () => {
    for (const snap of snaps) {
      expect(typeof snap.entityId).toBe("number");
      expect(typeof snap.teamId).toBe("number");
      expect(snap.animation).toBeDefined();
      expect(Array.isArray(snap.pose)).toBe(true);
      expect(snap.grapple).toBeDefined();
      expect(snap.mass).toBeDefined();
      expect(snap.inertia).toBeDefined();
    }
  });

  it("AnimationHints has required boolean flags (dead, unconscious, prone)", () => {
    for (const snap of snaps) {
      expect(typeof snap.animation.dead).toBe("boolean");
      expect(typeof snap.animation.unconscious).toBe("boolean");
      expect(typeof snap.animation.prone).toBe("boolean");
    }
  });

  it("AnimationHints locomotion weights are Q integers", () => {
    for (const snap of snaps) {
      expect(Number.isInteger(snap.animation.idle)).toBe(true);
      expect(Number.isInteger(snap.animation.walk)).toBe(true);
      expect(Number.isInteger(snap.animation.run)).toBe(true);
      expect(Number.isInteger(snap.animation.sprint)).toBe(true);
    }
  });

  it("GrapplePoseConstraint has required fields", () => {
    for (const snap of snaps) {
      expect(typeof snap.grapple.isHolder).toBe("boolean");
      expect(typeof snap.grapple.isHeld).toBe("boolean");
      expect(Array.isArray(snap.grapple.heldByIds)).toBe(true);
      expect(typeof snap.grapple.position).toBe("string");
      expect(Number.isInteger(snap.grapple.gripQ)).toBe(true);
    }
  });

  it("entity 1 snapshot shape matches committed fixture", () => {
    const shape  = rigSnapshotShape(snaps[0]!);
    const actual = JSON.stringify(shape);
    const { matched, expected } = checkSnapshot("rig_snapshot_entity1_shape", actual);
    if (!matched) {
      throw new Error(
        `Bridge RigSnapshot shape changed!\nExpected: ${expected}\nActual:   ${actual}\n` +
        `If intentional, delete test/snapshots/bridge-contract-snapshot.json and re-run.`,
      );
    }
  });

  it("entity 2 snapshot shape matches committed fixture", () => {
    const shape  = rigSnapshotShape(snaps[1]!);
    const actual = JSON.stringify(shape);
    const { matched, expected } = checkSnapshot("rig_snapshot_entity2_shape", actual);
    if (!matched) {
      throw new Error(
        `Bridge RigSnapshot shape changed!\nExpected: ${expected}\nActual:   ${actual}\n` +
        `If intentional, delete test/snapshots/bridge-contract-snapshot.json and re-run.`,
      );
    }
  });
});

// ── Tests: AnimationHints structural compatibility ────────────────────────────

describe("PH-4 bridge contract — AnimationHints golden fixture", () => {
  it("deriveAnimationHints output shape matches committed fixture", () => {
    const entity = mkKnight(1, 1, 0, 0);
    const hints  = deriveAnimationHints(entity);
    const shape  = JSON.stringify(Object.keys(hints).sort());
    const { matched, expected } = checkSnapshot("animation_hints_keys", shape);
    if (!matched) {
      throw new Error(
        `AnimationHints keys changed!\nExpected: ${expected}\nActual:   ${shape}\n` +
        `If intentional, delete test/snapshots/bridge-contract-snapshot.json and re-run.`,
      );
    }
  });

  it("idle entity animates as idle (not walking/running/dead)", () => {
    const entity = mkKnight(1, 1, 0, 0);
    const hints  = deriveAnimationHints(entity);
    expect(hints.idle).toBe(SCALE.Q);
    expect(hints.walk).toBe(q(0));
    expect(hints.dead).toBe(false);
    expect(hints.unconscious).toBe(false);
  });
});

// ── Tests: GrapplePoseConstraint ─────────────────────────────────────────────

describe("PH-4 bridge contract — GrapplePoseConstraint golden fixture", () => {
  it("deriveGrappleConstraint keys match committed fixture", () => {
    const entity   = mkKnight(1, 1, 0, 0);
    const grapple  = deriveGrappleConstraint(entity);
    const shape    = JSON.stringify(Object.keys(grapple).sort());
    const { matched, expected } = checkSnapshot("grapple_constraint_keys", shape);
    if (!matched) {
      throw new Error(
        `GrapplePoseConstraint keys changed!\nExpected: ${expected}\nActual:   ${shape}\n` +
        `If intentional, delete test/snapshots/bridge-contract-snapshot.json and re-run.`,
      );
    }
  });

  it("non-grappling entity: isHolder=false, isHeld=false, position=standing", () => {
    const entity  = mkKnight(1, 1, 0, 0);
    const grapple = deriveGrappleConstraint(entity);
    expect(grapple.isHolder).toBe(false);
    expect(grapple.isHeld).toBe(false);
    expect(grapple.heldByIds).toEqual([]);
    expect(grapple.position).toBe("standing");
  });

  it("entity with active grip: isHolder=true, holdingEntityId set", () => {
    const holder = mkKnight(1, 1, 0, 0);
    // Manually set grapple state (mirrors what the kernel would set)
    holder.grapple.holdingTargetId = 2;
    holder.grapple.gripQ           = q(0.75) as Q;
    holder.grapple.position        = "standing";

    const grapple = deriveGrappleConstraint(holder);
    expect(grapple.isHolder).toBe(true);
    expect(grapple.holdingEntityId).toBe(2);
    expect(grapple.gripQ).toBe(q(0.75));
  });

  it("entity being held: isHeld=true, heldByIds populated", () => {
    const held = mkKnight(2, 2, 0, 0);
    held.grapple.heldByIds = [1];
    held.grapple.position  = "prone";

    const grapple = deriveGrappleConstraint(held);
    expect(grapple.isHeld).toBe(true);
    expect(grapple.heldByIds).toEqual([1]);
    expect(grapple.position).toBe("prone");
  });
});

// ── Tests: BridgeEngine consumption ──────────────────────────────────────────

describe("PH-4 bridge contract — BridgeEngine round-trip", () => {
  it("BridgeEngine ingests RigSnapshots and returns valid InterpolatedState", () => {
    const knight = mkKnight(1, 1, 0, 0);
    const world  = mkWorld(42, [knight]);
    const engine = new BridgeEngine({ mappings: [], defaultBoneName: "root" });
    engine.setEntityBodyPlan(1, "humanoid");

    // Two ticks to enable interpolation
    stepWorld(world, new Map(), CTX);
    const snaps1 = extractRigSnapshots(world);
    engine.update(snaps1);

    stepWorld(world, new Map(), CTX);
    const snaps2 = extractRigSnapshots(world);
    engine.update(snaps2);

    const DT = 1 / 20;
    const renderTime = world.tick * DT - DT * 0.5; // midpoint between ticks
    const state = engine.getInterpolatedState(1, renderTime);

    expect(state).not.toBeNull();
    expect(state!.entityId).toBe(1);
    expect(typeof state!.interpolationFactor).toBe("number");
    expect(state!.position_m).toBeDefined();
    expect(typeof state!.position_m.x).toBe("number");
    expect(state!.animation).toBeDefined();
    expect(Array.isArray(state!.poseModifiers)).toBe(true);
    expect(state!.grapple).toBeDefined();
  });

  it("BridgeEngine getLatestSimTime advances with each update", () => {
    const world  = mkWorld(1, [mkKnight(1, 1, 0, 0)]);
    const engine = new BridgeEngine({ mappings: [], defaultBoneName: "root" });

    const t0 = engine.getLatestSimTime();
    stepWorld(world, new Map(), CTX);
    engine.update(extractRigSnapshots(world));
    const t1 = engine.getLatestSimTime();

    expect(t1).toBeGreaterThan(t0);
  });

  it("bridge snapshot format is structurally identical when re-run with same seed/tick", () => {
    const snaps1 = buildKnightVsBrawlerAt50();
    const snaps2 = buildKnightVsBrawlerAt50();

    // Tick and entity IDs must match exactly
    expect(snaps1.map(s => s.entityId)).toEqual(snaps2.map(s => s.entityId));
    expect(snaps1.map(s => s.tick)).toEqual(snaps2.map(s => s.tick));
    // Key simulation fields must be byte-identical
    expect(snaps1[0]!.animation.dead).toBe(snaps2[0]!.animation.dead);
    expect(snaps1[0]!.animation.shockQ).toBe(snaps2[0]!.animation.shockQ);
    expect(snaps1[0]!.grapple.position).toBe(snaps2[0]!.grapple.position);
  });
});
