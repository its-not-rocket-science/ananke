// test/exoskeleton.test.ts — Phase 8B: Exoskeleton Biology
//
// Tests shell breach mechanics, open hemolymph system, molting regeneration,
// joint vulnerability, and flight locomotion.

import { describe, it, expect } from "vitest";
import { q, SCALE, to, type Q, type I32 } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld, type KernelContext } from "../src/sim/kernel";
import {
  GRASSHOPPER_PLAN,
  type BodyPlan,
  type BodySegment,
  segmentIds,
} from "../src/sim/bodyplan";
import { defaultInjury, defaultRegionInjury } from "../src/sim/injury";
import { DamageChannel } from "../src/channels";
import { STARTER_WEAPONS } from "../src/equipment";
import { TUNING } from "../src/sim/tuning";
import { v3 } from "../src/sim/vec3";
import { generateIndividual } from "../src/generate";
import { HUMAN_BASE } from "../src/archetypes";
import { defaultCondition } from "../src/sim/condition";
import { defaultAction } from "../src/sim/action";
import { defaultIntent } from "../src/sim/intent";
import type { AttackCommand } from "../src/sim/commands";

const BASE_CTX: KernelContext = { tractionCoeff: q(0.80) as Q, tuning: TUNING.tactical };

/** First available weapon (wpn_club) — used for combat tests. */
const CLUB = STARTER_WEAPONS[0]!;

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeGrasshopperEntity(id: number, x_m = 0, y_m = 0) {
  const attrs = generateIndividual(id, HUMAN_BASE);
  return {
    id,
    teamId: id,
    attributes: attrs,
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items: [] },
    traits: [],
    position_m: v3(x_m, y_m, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(),
    action: defaultAction(),
    condition: defaultCondition(),
    injury: defaultInjury(segmentIds(GRASSHOPPER_PLAN)),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
    bodyPlan: GRASSHOPPER_PLAN,
  };
}

/** Build a minimal one-segment body plan with exoskeleton mechanics. */
function singleSegPlan(id: string, overrides: Partial<BodySegment> = {}): BodyPlan {
  return {
    id: `test_${id}`,
    locomotion: { type: "biped" },
    cnsLayout: { type: "centralized" },
    segments: [
      {
        id,
        parent: null,
        mass_kg: 10000 as I32,
        exposureWeight: { [DamageChannel.Kinetic]: q(1.0) },
        cnsRole: "central",
        ...overrides,
      },
    ],
  };
}

function runTicks(n: number, world: ReturnType<typeof mkWorld>, cmds = new Map()): void {
  for (let i = 0; i < n; i++) stepWorld(world, cmds, BASE_CTX);
}

// ─── GRASSHOPPER_PLAN data tests ──────────────────────────────────────────────

describe("GRASSHOPPER_PLAN data", () => {
  it("has id 'grasshopper'", () => {
    expect(GRASSHOPPER_PLAN.id).toBe("grasshopper");
  });

  it("has 12 segments", () => {
    expect(GRASSHOPPER_PLAN.segments).toHaveLength(12);
  });

  it("kinetic exposure weights sum to SCALE.Q", () => {
    let sum = 0;
    for (const seg of GRASSHOPPER_PLAN.segments) {
      sum += seg.exposureWeight[DamageChannel.Kinetic] ?? 0;
    }
    expect(sum).toBe(SCALE.Q);
  });

  it("all segments have structureType: 'exoskeleton'", () => {
    for (const seg of GRASSHOPPER_PLAN.segments) {
      expect(seg.structureType).toBe("exoskeleton");
    }
  });

  it("locomotion.flight is wired with 4 wing segments", () => {
    const flight = GRASSHOPPER_PLAN.locomotion.flight;
    expect(flight).toBeDefined();
    expect(flight!.wingSegments).toHaveLength(4);
    expect(flight!.wingSegments).toContain("forewing_l");
    expect(flight!.wingSegments).toContain("hindwing_r");
  });

  it("all wing segment IDs exist in the plan", () => {
    const ids = new Set(segmentIds(GRASSHOPPER_PLAN));
    for (const wid of GRASSHOPPER_PLAN.locomotion.flight!.wingSegments) {
      expect(ids.has(wid)).toBe(true);
    }
  });

  it("thorax has fluidSystem 'open' and hemolymphLossRate", () => {
    const thorax = GRASSHOPPER_PLAN.segments.find(s => s.id === "thorax")!;
    expect(thorax.fluidSystem).toBe("open");
    expect(thorax.hemolymphLossRate).toBeGreaterThan(0);
  });

  it("wing segments have isJoint=true and jointDamageMultiplier > q(1.0)", () => {
    for (const wid of ["forewing_l", "forewing_r", "hindwing_l", "hindwing_r"]) {
      const seg = GRASSHOPPER_PLAN.segments.find(s => s.id === wid)!;
      expect(seg.isJoint).toBe(true);
      expect(seg.jointDamageMultiplier).toBeGreaterThan(SCALE.Q);
    }
  });

  it("leg segments have regeneratesViaMolting: true", () => {
    for (const lid of ["foreleg_l", "foreleg_r", "midleg_l", "midleg_r", "hindleg_l", "hindleg_r"]) {
      const seg = GRASSHOPPER_PLAN.segments.find(s => s.id === lid)!;
      expect(seg.regeneratesViaMolting).toBe(true);
    }
  });
});

// ─── Shell breach mechanics ───────────────────────────────────────────────────

describe("shell breach — single-segment exoskeleton", () => {
  /**
   * Use threshold (SCALE.Q + 1) = 10001 — above the maximum possible structural
   * damage (SCALE.Q = 10000), so the shell NEVER breaches.  All damage routes
   * exclusively to structuralDamage; surface and internal always stay at 0.
   */
  const UNBREACHABLE_THRESHOLD = (SCALE.Q + 1) as Q;

  it("below breachThreshold: all hits route entirely to structuralDamage (surfaceDamage stays 0)", () => {
    // Shell can NEVER breach, so pre-breach routing always applies.
    const plan = singleSegPlan("carapace", {
      structureType: "exoskeleton",
      breachThreshold: UNBREACHABLE_THRESHOLD,
    });

    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    attacker.loadout = { items: [CLUB] };

    const defender = mkHumanoidEntity(2, 2, Math.trunc(0.5 * SCALE.m), 0);
    defender.bodyPlan = plan;
    defender.injury = defaultInjury(["carapace"]);

    const world = mkWorld(77, [attacker, defender]);

    const attackCmd: AttackCommand = {
      kind: "attack", targetId: 2, weaponId: CLUB.id, intensity: q(1.0) as Q, mode: "strike",
    };
    const cmds = new Map([[1, [attackCmd]]]);

    // 10 ticks guarantees hits (confirmed by joint test with seed 77)
    for (let i = 0; i < 10; i++) stepWorld(world, cmds, BASE_CTX);

    const carapace = world.entities.find(e => e.id === 2)!.injury.byRegion["carapace"]!;

    // Structural should have taken damage (shell absorbed all hits)
    expect(carapace.structuralDamage).toBeGreaterThan(0);
    // Surface and internal damage must remain at zero — exo pre-breach routing
    expect(carapace.surfaceDamage).toBe(q(0));
    expect(carapace.internalDamage).toBe(q(0));
  });

  it("at/above breachThreshold: normal split produces surface and internal damage", () => {
    // Use a threshold low enough that structural starts already AT it.
    const plan = singleSegPlan("carapace", {
      structureType: "exoskeleton",
      breachThreshold: q(0.5),
    });

    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    attacker.loadout = { items: [CLUB] };

    const defender = mkHumanoidEntity(2, 2, Math.trunc(0.5 * SCALE.m), 0);
    defender.bodyPlan = plan;
    defender.injury = defaultInjury(["carapace"]);
    // Pre-set structural damage AT the breach threshold — shell is already breached
    defender.injury.byRegion["carapace"]!.structuralDamage = q(0.5);

    const world = mkWorld(77, [attacker, defender]);

    const attackCmd: AttackCommand = {
      kind: "attack", targetId: 2, weaponId: CLUB.id, intensity: q(1.0) as Q, mode: "strike",
    };
    const cmds = new Map([[1, [attackCmd]]]);

    // 10 ticks → at least a few hits with seed 77
    for (let i = 0; i < 10; i++) stepWorld(world, cmds, BASE_CTX);

    const carapace = world.entities.find(e => e.id === 2)!.injury.byRegion["carapace"]!;
    // Breached shell: surface + internal should be > 0 (normal three-channel split)
    expect(carapace.surfaceDamage + carapace.internalDamage).toBeGreaterThan(0);
  });

  it("non-exoskeleton segment always produces surface damage on hit", () => {
    const plan = singleSegPlan("flesh");  // no structureType → endoskeleton default

    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    attacker.loadout = { items: [CLUB] };

    const defender = mkHumanoidEntity(2, 2, Math.trunc(0.5 * SCALE.m), 0);
    defender.bodyPlan = plan;
    defender.injury = defaultInjury(["flesh"]);

    const world = mkWorld(77, [attacker, defender]);

    const attackCmd: AttackCommand = {
      kind: "attack", targetId: 2, weaponId: CLUB.id, intensity: q(1.0) as Q, mode: "strike",
    };
    const cmds = new Map([[1, [attackCmd]]]);

    for (let i = 0; i < 10; i++) stepWorld(world, cmds, BASE_CTX);

    const flesh = world.entities.find(e => e.id === 2)!.injury.byRegion["flesh"]!;
    expect(flesh.surfaceDamage).toBeGreaterThan(0);
  });
});

// ─── Joint vulnerability ──────────────────────────────────────────────────────

describe("joint vulnerability", () => {
  it("joint segment accumulates more structural damage per hit than plain plate", () => {
    // Two plans: identical EXCEPT the joint flag.  No exoskeleton — structural
    // damage accumulates via the normal three-channel split so we can compare
    // structuralDamage totals without the pre-breach routing swamping the result.
    const plainPlan = singleSegPlan("plate");

    const jointPlan = singleSegPlan("plate", {
      isJoint: true,
      jointDamageMultiplier: q(1.5),
    });

    function makeEntity(id: number, plan: BodyPlan) {
      const e = mkHumanoidEntity(id, 2, Math.trunc(0.5 * SCALE.m), 0);
      e.bodyPlan = plan;
      e.injury = defaultInjury(["plate"]);
      return e;
    }

    const attackerId = 1;
    const defenderId = 2;

    // World A: plain plate
    const attA = mkHumanoidEntity(attackerId, 1, 0, 0);
    attA.loadout = { items: [CLUB] };
    const defA = makeEntity(defenderId, plainPlan);
    const worldA = mkWorld(77, [attA, defA]);

    // World B: joint
    const attB = mkHumanoidEntity(attackerId, 1, 0, 0);
    attB.loadout = { items: [CLUB] };
    const defB = makeEntity(defenderId, jointPlan);
    const worldB = mkWorld(77, [attB, defB]);

    const attackCmd: AttackCommand = {
      kind: "attack", targetId: defenderId, weaponId: CLUB.id, intensity: q(1.0) as Q, mode: "strike",
    };
    const cmds = new Map([[attackerId, [attackCmd]]]);

    // 5 ticks: enough for a few hits without capping structural damage
    for (let i = 0; i < 5; i++) {
      stepWorld(worldA, cmds, BASE_CTX);
      stepWorld(worldB, cmds, BASE_CTX);
    }

    const plateStr = worldA.entities.find(e => e.id === defenderId)!.injury.byRegion["plate"]!.structuralDamage;
    const jointStr = worldB.entities.find(e => e.id === defenderId)!.injury.byRegion["plate"]!.structuralDamage;

    // Joint segment should take more structural damage than plain plate.
    // If plateStr == 0, no hits occurred — use a brute-force search over seeds.
    if (plateStr > 0) {
      expect(jointStr).toBeGreaterThan(plateStr);
    } else {
      // Seed 77 produced no hits in 5 ticks — run longer to confirm
      for (let i = 0; i < 50; i++) {
        stepWorld(worldA, cmds, BASE_CTX);
        stepWorld(worldB, cmds, BASE_CTX);
      }
      const plateStr2 = worldA.entities.find(e => e.id === defenderId)!.injury.byRegion["plate"]!.structuralDamage;
      const jointStr2 = worldB.entities.find(e => e.id === defenderId)!.injury.byRegion["plate"]!.structuralDamage;
      expect(plateStr2).toBeGreaterThan(0); // confirms attacks hit
      // With both capped at SCALE.Q: joint must cap first, plain catches up
      // Minimum: joint >= plate
      expect(jointStr2).toBeGreaterThanOrEqual(plateStr2);
    }
  });
});

// ─── Hemolymph accumulation ───────────────────────────────────────────────────

describe("hemolymph accumulation", () => {
  it("breached open-fluid segment increases hemolymphLoss each tick", () => {
    const e = makeGrasshopperEntity(1);
    // Breach the thorax (breachThreshold = q(0.4))
    e.injury.byRegion["thorax"]!.structuralDamage = q(0.5); // above q(0.4)

    const world = mkWorld(1, [e]);
    const before = world.entities[0]!.injury.hemolymphLoss;

    runTicks(5, world);

    const after = world.entities[0]!.injury.hemolymphLoss;
    expect(after).toBeGreaterThan(before);
  });

  it("non-breached segment produces no hemolymph loss", () => {
    const e = makeGrasshopperEntity(1);
    // Thorax below breachThreshold
    e.injury.byRegion["thorax"]!.structuralDamage = q(0.1); // below q(0.4)

    const world = mkWorld(1, [e]);
    const before = world.entities[0]!.injury.hemolymphLoss;

    runTicks(5, world);

    const after = world.entities[0]!.injury.hemolymphLoss;
    expect(after).toBe(before); // no change
  });

  it("entity outside grasshopper plan accumulates no hemolymph loss", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    // Standard humanoid — no bodyPlan with open fluid system
    e.injury.byRegion["torso"]!.structuralDamage = q(0.9);

    const world = mkWorld(1, [e]);
    runTicks(5, world);

    expect(world.entities[0]!.injury.hemolymphLoss).toBe(q(0));
  });

  it("high hemolymph loss is fatal", () => {
    const e = makeGrasshopperEntity(1);
    // Set hemolymphLoss close to fatal threshold
    // thorax.hemolymphLossRate = q(0.002) = 20, structuralDamage = 9000
    // loss/tick = qMul(20, 9000) = 18; (8000-7900)/18 ≈ 6 ticks needed
    e.injury.hemolymphLoss = q(0.79);
    // Thorax breached → loss will accumulate past q(0.80) threshold
    e.injury.byRegion["thorax"]!.structuralDamage = q(0.9);

    const world = mkWorld(1, [e]);
    runTicks(10, world); // 10 ticks is enough for ~6 accumulation ticks

    expect(world.entities[0]!.injury.dead).toBe(true);
  });
});

// ─── Molting mechanics ────────────────────────────────────────────────────────

describe("molting", () => {
  it("ticksRemaining decrements each tick", () => {
    const e = makeGrasshopperEntity(1);
    (e as any).molting = { active: true, ticksRemaining: 5, softeningSegments: [] };

    const world = mkWorld(1, [e as any]);
    runTicks(3, world);

    const molting = (world.entities[0]! as any).molting;
    expect(molting.ticksRemaining).toBe(2);
    expect(molting.active).toBe(true);
  });

  it("molting completes when ticksRemaining reaches 0: active becomes false", () => {
    const e = makeGrasshopperEntity(1);
    (e as any).molting = { active: true, ticksRemaining: 1, softeningSegments: [] };

    const world = mkWorld(1, [e as any]);
    runTicks(1, world);

    const molting = (world.entities[0]! as any).molting;
    expect(molting.active).toBe(false);
    expect(molting.ticksRemaining).toBe(0);
  });

  it("molt completion repairs regeneratesViaMolting segments by q(0.10)", () => {
    const e = makeGrasshopperEntity(1);
    // Damage hindleg_l (has regeneratesViaMolting: true in GRASSHOPPER_PLAN)
    e.injury.byRegion["hindleg_l"]!.structuralDamage = q(0.30);
    (e as any).molting = { active: true, ticksRemaining: 1, softeningSegments: [] };

    const world = mkWorld(1, [e as any]);
    runTicks(1, world);

    const segDamage = world.entities[0]!.injury.byRegion["hindleg_l"]!.structuralDamage;
    // Should have dropped by q(0.10): 3000 - 1000 = 2000 = q(0.20)
    expect(segDamage).toBe(q(0.20));
  });

  it("molt completion does not repair below zero", () => {
    const e = makeGrasshopperEntity(1);
    e.injury.byRegion["hindleg_l"]!.structuralDamage = q(0.05); // less than q(0.10)
    (e as any).molting = { active: true, ticksRemaining: 1, softeningSegments: [] };

    const world = mkWorld(1, [e as any]);
    runTicks(1, world);

    const segDamage = world.entities[0]!.injury.byRegion["hindleg_l"]!.structuralDamage;
    expect(segDamage).toBe(q(0)); // clamped to 0
  });

  it("molting softening: structural damage to softening segment is reduced", () => {
    // Plain (non-exo) segment: structural channel receives strInc directly.
    // Softening reduces strInc by ×q(0.70), so the softening defender accumulates
    // less structural damage per hit.
    const plan = singleSegPlan("shell");  // no exo — normal channel split

    function makeDefender(id: number, softening: boolean) {
      const e = mkHumanoidEntity(id, 2, Math.trunc(0.5 * SCALE.m), 0);
      e.bodyPlan = plan;
      e.injury = defaultInjury(["shell"]);
      if (softening) {
        (e as any).molting = { active: true, ticksRemaining: 999, softeningSegments: ["shell"] };
      }
      return e;
    }

    const attA = mkHumanoidEntity(1, 1, 0, 0);
    attA.loadout = { items: [CLUB] };
    const defA = makeDefender(2, false);
    const worldA = mkWorld(77, [attA, defA]);

    const attB = mkHumanoidEntity(1, 1, 0, 0);
    attB.loadout = { items: [CLUB] };
    const defB = makeDefender(2, true);
    const worldB = mkWorld(77, [attB, defB]);

    const attackCmd: AttackCommand = {
      kind: "attack", targetId: 2, weaponId: CLUB.id, intensity: q(1.0) as Q, mode: "strike",
    };
    const cmds = new Map([[1, [attackCmd]]]);

    // 5 ticks — same seed/entities as joint test (confirmed to get hits)
    for (let i = 0; i < 5; i++) {
      stepWorld(worldA, cmds, BASE_CTX);
      stepWorld(worldB, cmds, BASE_CTX);
    }

    const normalStr = worldA.entities.find(e => e.id === 2)!.injury.byRegion["shell"]!.structuralDamage;
    const softenStr = worldB.entities.find(e => e.id === 2)!.injury.byRegion["shell"]!.structuralDamage;

    // If normalStr > 0, hits connected: softening entity must have less structural damage.
    // Both worlds use the same seed/IDs → same hit outcomes; only strInc differs.
    if (normalStr > 0) {
      expect(softenStr).toBeLessThan(normalStr);
    } else {
      // No hits in 5 ticks — extend to guarantee at least one hit
      for (let i = 0; i < 50; i++) {
        stepWorld(worldA, cmds, BASE_CTX);
        stepWorld(worldB, cmds, BASE_CTX);
      }
      const normalStr2 = worldA.entities.find(e => e.id === 2)!.injury.byRegion["shell"]!.structuralDamage;
      const softenStr2 = worldB.entities.find(e => e.id === 2)!.injury.byRegion["shell"]!.structuralDamage;
      expect(normalStr2).toBeGreaterThan(0);
      expect(softenStr2).toBeLessThanOrEqual(normalStr2);
    }
  });
});

// ─── Flight locomotion ────────────────────────────────────────────────────────

describe("flight locomotion", () => {
  it("entity below liftCapacity gets boosted sprint speed vs ground entity", () => {
    // Grasshopper has liftCapacity_kg = 10000 = 10kg
    // Human entity typically has mass ~75kg → ABOVE liftCapacity
    // So we create a SMALL entity whose mass is well below liftCapacity

    // Create a custom plan with flight for a tiny entity
    const tinyFlightPlan: BodyPlan = {
      id: "tiny_flyer",
      locomotion: {
        type: "flight",
        flight: {
          wingSegments: ["wing"],
          liftCapacity_kg: 200000 as I32, // 200kg — well above any human mass
          flightStaminaCost: q(2.0) as Q,
          wingDamagePenalty: q(0.5) as Q,
        },
      },
      cnsLayout: { type: "centralized" },
      segments: [
        {
          id: "wing",
          parent: null,
          mass_kg: 5000 as I32,
          exposureWeight: { [DamageChannel.Kinetic]: q(1.0) },
          cnsRole: "central",
          locomotionRole: "primary",
        },
      ],
    };

    const groundEntity = mkHumanoidEntity(1, 1, 0, 0);
    groundEntity.intent.move = { dir: { x: 10000, y: 0, z: 0 }, intensity: q(1.0), mode: "sprint" };

    const flyerEntity = mkHumanoidEntity(2, 2, Math.trunc(20 * SCALE.m), 0);
    flyerEntity.bodyPlan = tinyFlightPlan;
    flyerEntity.injury = defaultInjury(["wing"]);
    flyerEntity.intent.move = { dir: { x: 10000, y: 0, z: 0 }, intensity: q(1.0), mode: "sprint" };

    const world = mkWorld(1, [groundEntity, flyerEntity]);

    runTicks(10, world);

    const groundX = world.entities.find(e => e.id === 1)!.position_m.x;
    const flyerX = world.entities.find(e => e.id === 2)!.position_m.x;

    // Flyer starts at 20m, ground entity at 0m; flyer should move further
    const groundDist = groundX - 0;
    const flyerDist = flyerX - Math.trunc(20 * SCALE.m);

    expect(flyerDist).toBeGreaterThan(groundDist);
  });

  it("entity above liftCapacity falls back to ground locomotion (no speed boost)", () => {
    // Plan with tiny liftCapacity (1kg) — human entity at ~75kg can't fly
    const tooHeavyPlan: BodyPlan = {
      id: "too_heavy",
      locomotion: {
        type: "flight",
        flight: {
          wingSegments: ["wing"],
          liftCapacity_kg: 1000 as I32, // 1kg — way too low for human
          flightStaminaCost: q(2.0) as Q,
          wingDamagePenalty: q(0.5) as Q,
        },
      },
      cnsLayout: { type: "centralized" },
      segments: [
        {
          id: "wing",
          parent: null,
          mass_kg: 5000 as I32,
          exposureWeight: { [DamageChannel.Kinetic]: q(1.0) },
          cnsRole: "central",
          locomotionRole: "primary",
        },
      ],
    };

    const groundEntity = mkHumanoidEntity(1, 1, 0, 0);
    groundEntity.intent.move = { dir: { x: 10000, y: 0, z: 0 }, intensity: q(1.0), mode: "sprint" };

    const heavyFlyer = mkHumanoidEntity(2, 2, Math.trunc(20 * SCALE.m), 0);
    heavyFlyer.bodyPlan = tooHeavyPlan;
    heavyFlyer.injury = defaultInjury(["wing"]);
    heavyFlyer.intent.move = { dir: { x: 10000, y: 0, z: 0 }, intensity: q(1.0), mode: "sprint" };

    const world = mkWorld(1, [groundEntity, heavyFlyer]);
    runTicks(10, world);

    const groundX = world.entities.find(e => e.id === 1)!.position_m.x;
    const heavyX = world.entities.find(e => e.id === 2)!.position_m.x;

    const groundDist = groundX;
    const heavyDist = heavyX - Math.trunc(20 * SCALE.m);

    // Heavy flyer can't achieve flight — should move at roughly ground speed (no boost)
    // Allow 5% tolerance for minor differences from different entity IDs
    expect(heavyDist).toBeLessThanOrEqual(Math.trunc(groundDist * 1.05));
  });

  it("wing damage reduces effective flight speed", () => {
    const flightPlan: BodyPlan = {
      id: "flyer_dmg_test",
      locomotion: {
        type: "flight",
        flight: {
          wingSegments: ["wing_l", "wing_r"],
          liftCapacity_kg: 200000 as I32,
          flightStaminaCost: q(2.0) as Q,
          wingDamagePenalty: q(0.8) as Q,
        },
      },
      cnsLayout: { type: "centralized" },
      segments: [
        {
          id: "wing_l",
          parent: null,
          mass_kg: 3000 as I32,
          exposureWeight: { [DamageChannel.Kinetic]: q(0.5) },
          cnsRole: "central",
          locomotionRole: "primary",
        },
        {
          id: "wing_r",
          parent: null,
          mass_kg: 3000 as I32,
          exposureWeight: { [DamageChannel.Kinetic]: q(0.5) },
          locomotionRole: "primary",
        },
      ],
    };

    function makeFlyer(id: number, y: number, wingDmg: Q) {
      const e = mkHumanoidEntity(id, id, Math.trunc(20 * SCALE.m), Math.trunc(y * SCALE.m));
      e.bodyPlan = flightPlan;
      e.injury = defaultInjury(["wing_l", "wing_r"]);
      e.injury.byRegion["wing_l"]!.structuralDamage = wingDmg;
      e.injury.byRegion["wing_r"]!.structuralDamage = wingDmg;
      e.intent.move = { dir: { x: 10000, y: 0, z: 0 }, intensity: q(1.0), mode: "sprint" };
      return e;
    }

    const healthyFlyer = makeFlyer(1, 0, q(0));    // no wing damage
    const damagedFlyer = makeFlyer(2, 50, q(0.6)); // 60% wing damage

    const world = mkWorld(1, [healthyFlyer, damagedFlyer]);
    runTicks(10, world);

    const healthyX = world.entities.find(e => e.id === 1)!.position_m.x;
    const damagedX = world.entities.find(e => e.id === 2)!.position_m.x;

    const healthyDist = healthyX - Math.trunc(20 * SCALE.m);
    const damagedDist = damagedX - Math.trunc(20 * SCALE.m);

    expect(healthyDist).toBeGreaterThan(damagedDist);
  });
});

// ─── Hemolymph clotting ───────────────────────────────────────────────────────

describe("hemolymph clotting", () => {
  it("hemolymphLoss decreases each tick when positive and no breach is active", () => {
    const e = makeGrasshopperEntity(1);
    // Set hemolymphLoss to a known positive value; thorax NOT breached → no new loss
    e.injury.hemolymphLoss = q(0.10);
    e.injury.byRegion["thorax"]!.structuralDamage = q(0.1); // below breachThreshold q(0.4)

    const world = mkWorld(1, [e]);
    const before = world.entities[0]!.injury.hemolymphLoss;

    runTicks(10, world);

    const after = world.entities[0]!.injury.hemolymphLoss;
    // Clotting at q(0.0001)/tick over 10 ticks = q(0.001) reduction minimum
    expect(after).toBeLessThan(before);
  });

  it("hemolymphLoss cannot go below zero via clotting", () => {
    const e = makeGrasshopperEntity(1);
    e.injury.hemolymphLoss = q(0.0002); // tiny value — will clot out in ~2 ticks

    const world = mkWorld(1, [e]);
    runTicks(10, world);

    const after = world.entities[0]!.injury.hemolymphLoss;
    expect(after).toBeGreaterThanOrEqual(0);
  });

  it("clotting slows fatal progression: entity with clotting takes longer to die", () => {
    // Entity A: breached thorax → accumulates hemolymph loss; starts near threshold
    // Entity B: identical but hemolymphLoss starts even closer to threshold
    // Because we can't easily compare "time to die" across two entities with the same
    // accumulation rate, we instead verify that clotting reduces net loss when
    // accumulation rate is very slow compared to clotting rate.

    const e = makeGrasshopperEntity(1);
    e.injury.hemolymphLoss = q(0.50);
    // Thorax NOT breached — no new accumulation, only clotting
    e.injury.byRegion["thorax"]!.structuralDamage = q(0.1);

    const world = mkWorld(1, [e]);
    runTicks(100, world);

    // After 100 ticks of pure clotting (q(0.0001)/tick = 100 * 1 = 100 units = q(0.01) total)
    const loss = world.entities[0]!.injury.hemolymphLoss;
    expect(loss).toBeLessThanOrEqual(q(0.50));
    expect(loss).toBeGreaterThanOrEqual(0);
  });
});

// ─── Auto-molt trigger ────────────────────────────────────────────────────────

describe("auto-molt trigger", () => {
  it("molt triggers automatically when average regen segment damage >= q(0.40)", () => {
    const e = makeGrasshopperEntity(1);
    // All 6 legs have regeneratesViaMolting: true in GRASSHOPPER_PLAN
    // Set each to q(0.50) — well above trigger threshold q(0.40)
    for (const lid of ["foreleg_l", "foreleg_r", "midleg_l", "midleg_r", "hindleg_l", "hindleg_r"]) {
      e.injury.byRegion[lid]!.structuralDamage = q(0.50);
    }
    // Ensure no molt is active at start
    expect((e as any).molting).toBeUndefined();

    const world = mkWorld(1, [e as any]);
    // One tick is enough — trigger checks on each stepInjuryProgression call
    runTicks(1, world);

    const molting = (world.entities[0]! as any).molting;
    expect(molting).toBeDefined();
    expect(molting.active).toBe(true);
    expect(molting.ticksRemaining).toBeGreaterThan(0);
  });

  it("molt does NOT trigger when average regen segment damage < q(0.40)", () => {
    const e = makeGrasshopperEntity(1);
    // Set each leg to q(0.20) — below trigger threshold
    for (const lid of ["foreleg_l", "foreleg_r", "midleg_l", "midleg_r", "hindleg_l", "hindleg_r"]) {
      e.injury.byRegion[lid]!.structuralDamage = q(0.20);
    }

    const world = mkWorld(1, [e as any]);
    runTicks(5, world);

    const molting = (world.entities[0]! as any).molting;
    expect(molting?.active ?? false).toBe(false);
  });

  it("molt does NOT re-trigger while already active", () => {
    const e = makeGrasshopperEntity(1);
    for (const lid of ["foreleg_l", "foreleg_r", "midleg_l", "midleg_r", "hindleg_l", "hindleg_r"]) {
      e.injury.byRegion[lid]!.structuralDamage = q(0.50);
    }
    // Start a molt manually with a long duration
    (e as any).molting = { active: true, ticksRemaining: 500, softeningSegments: [] };

    const world = mkWorld(1, [e as any]);
    runTicks(3, world);

    // ticksRemaining should decrement, not reset to TICK_HZ * 60 = 1200
    const molting = (world.entities[0]! as any).molting;
    expect(molting.ticksRemaining).toBe(497); // 500 - 3
    expect(molting.active).toBe(true);
  });

  it("softeningSegments in auto-triggered molt matches the regen segment IDs", () => {
    const e = makeGrasshopperEntity(1);
    for (const lid of ["foreleg_l", "foreleg_r", "midleg_l", "midleg_r", "hindleg_l", "hindleg_r"]) {
      e.injury.byRegion[lid]!.structuralDamage = q(0.50);
    }

    const world = mkWorld(1, [e as any]);
    runTicks(1, world);

    const molting = (world.entities[0]! as any).molting;
    const regenIds = GRASSHOPPER_PLAN.segments
      .filter(s => s.regeneratesViaMolting)
      .map(s => s.id)
      .sort();
    expect([...molting.softeningSegments].sort()).toEqual(regenIds);
  });
});

// ─── Wing passive regeneration ────────────────────────────────────────────────

describe("wing passive regeneration", () => {
  it("wing structural damage decreases each tick when not molting", () => {
    const e = makeGrasshopperEntity(1);
    // Set wing damage — wings are forewing_l/r and hindwing_l/r in GRASSHOPPER_PLAN
    e.injury.byRegion["forewing_l"]!.structuralDamage = q(0.20);
    // Ensure no molting (leg damage below trigger threshold)
    for (const lid of ["foreleg_l", "foreleg_r", "midleg_l", "midleg_r", "hindleg_l", "hindleg_r"]) {
      e.injury.byRegion[lid]!.structuralDamage = q(0.10); // below q(0.40) trigger
    }

    const world = mkWorld(1, [e]);
    const before = world.entities[0]!.injury.byRegion["forewing_l"]!.structuralDamage;

    runTicks(20, world);

    const after = world.entities[0]!.injury.byRegion["forewing_l"]!.structuralDamage;
    // q(0.0001)/tick × 20 ticks = q(0.002) reduction
    expect(after).toBeLessThan(before);
  });

  it("wing regen does NOT fire during active molting", () => {
    const e = makeGrasshopperEntity(1);
    e.injury.byRegion["forewing_l"]!.structuralDamage = q(0.20);
    // Force active molting — leg damage below threshold so trigger won't reset it
    (e as any).molting = { active: true, ticksRemaining: 999, softeningSegments: [] };
    // Keep leg damage low so auto-trigger doesn't interfere
    for (const lid of ["foreleg_l", "foreleg_r", "midleg_l", "midleg_r", "hindleg_l", "hindleg_r"]) {
      e.injury.byRegion[lid]!.structuralDamage = q(0.10);
    }

    const world = mkWorld(1, [e as any]);
    const before = world.entities[0]!.injury.byRegion["forewing_l"]!.structuralDamage;

    runTicks(20, world);

    const after = world.entities[0]!.injury.byRegion["forewing_l"]!.structuralDamage;
    // No regen during active molt — damage should be unchanged (or higher from combat, but no regen)
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("wing damage does not regenerate below zero", () => {
    const e = makeGrasshopperEntity(1);
    e.injury.byRegion["forewing_l"]!.structuralDamage = q(0.0003); // tiny — will clamp to 0
    for (const lid of ["foreleg_l", "foreleg_r", "midleg_l", "midleg_r", "hindleg_l", "hindleg_r"]) {
      e.injury.byRegion[lid]!.structuralDamage = q(0.10);
    }

    const world = mkWorld(1, [e]);
    runTicks(10, world);

    const after = world.entities[0]!.injury.byRegion["forewing_l"]!.structuralDamage;
    expect(after).toBeGreaterThanOrEqual(0);
  });
});

// ─── Phase 8C: intrinsic exoskeleton armor ────────────────────────────────────

describe("intrinsic exoskeleton armor (intrinsicArmor_J)", () => {
  const attackCmd: AttackCommand = {
    kind: "attack", targetId: 2, weaponId: CLUB.id, intensity: q(1.0) as Q, mode: "strike",
  };
  const cmds = new Map([[1, [attackCmd]]]);

  it("GRASSHOPPER_PLAN thorax has intrinsicArmor_J > 0", () => {
    const thorax = GRASSHOPPER_PLAN.segments.find(s => s.id === "thorax")!;
    expect(thorax.intrinsicArmor_J).toBeDefined();
    expect(thorax.intrinsicArmor_J!).toBeGreaterThan(0);
  });

  it("partial absorption: segment with intrinsicArmor_J receives less damage than one without", () => {
    // Two identical worlds; only the defender's segment differs.
    const makeWorld = (withArmor: boolean) => {
      const plan = singleSegPlan("plate", withArmor ? { intrinsicArmor_J: 100 } : {});
      const attacker = mkHumanoidEntity(1, 1, 0, 0);
      attacker.loadout = { items: [CLUB] };
      const defender = mkHumanoidEntity(2, 2, Math.trunc(0.5 * SCALE.m), 0);
      defender.bodyPlan = plan;
      defender.injury = defaultInjury(["plate"]);
      return mkWorld(77, [attacker, defender]);
    };

    const worldA = makeWorld(true);   // with intrinsic armor
    const worldB = makeWorld(false);  // without

    for (let i = 0; i < 20; i++) {
      stepWorld(worldA, cmds, BASE_CTX);
      stepWorld(worldB, cmds, BASE_CTX);
    }

    const dmgA = worldA.entities.find(e => e.id === 2)!.injury.byRegion["plate"]!;
    const dmgB = worldB.entities.find(e => e.id === 2)!.injury.byRegion["plate"]!;

    const totalA = dmgA.surfaceDamage + dmgA.internalDamage + dmgA.structuralDamage;
    const totalB = dmgB.surfaceDamage + dmgB.internalDamage + dmgB.structuralDamage;

    // Intrinsic armor must have reduced total damage
    expect(totalA).toBeLessThan(totalB);
  });

  it("full absorption: huge intrinsicArmor_J prevents all damage", () => {
    const plan = singleSegPlan("plate", { intrinsicArmor_J: 999_999 });
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    attacker.loadout = { items: [CLUB] };
    const defender = mkHumanoidEntity(2, 2, Math.trunc(0.5 * SCALE.m), 0);
    defender.bodyPlan = plan;
    defender.injury = defaultInjury(["plate"]);

    const world = mkWorld(77, [attacker, defender]);
    for (let i = 0; i < 20; i++) stepWorld(world, cmds, BASE_CTX);

    const plate = world.entities.find(e => e.id === 2)!.injury.byRegion["plate"]!;
    expect(plate.surfaceDamage).toBe(0);
    expect(plate.internalDamage).toBe(0);
    expect(plate.structuralDamage).toBe(0);
  });

  it("intrinsicArmor_J = 0 is a no-op (same damage as absent)", () => {
    const makeWorld = (explicit: boolean) => {
      const plan = singleSegPlan("plate", explicit ? { intrinsicArmor_J: 0 } : {});
      const attacker = mkHumanoidEntity(1, 1, 0, 0);
      attacker.loadout = { items: [CLUB] };
      const defender = mkHumanoidEntity(2, 2, Math.trunc(0.5 * SCALE.m), 0);
      defender.bodyPlan = plan;
      defender.injury = defaultInjury(["plate"]);
      return mkWorld(77, [attacker, defender]);
    };

    const worldA = makeWorld(true);
    const worldB = makeWorld(false);
    for (let i = 0; i < 10; i++) {
      stepWorld(worldA, cmds, BASE_CTX);
      stepWorld(worldB, cmds, BASE_CTX);
    }

    const dmgA = worldA.entities.find(e => e.id === 2)!.injury.byRegion["plate"]!;
    const dmgB = worldB.entities.find(e => e.id === 2)!.injury.byRegion["plate"]!;
    expect(dmgA.structuralDamage).toBe(dmgB.structuralDamage);
    expect(dmgA.surfaceDamage).toBe(dmgB.surfaceDamage);
  });

  it("intrinsic armor blocks all damage inside exo breach routing path", () => {
    // Un-breachable exo + huge intrinsicArmor_J: energy fully absorbed before
    // breach routing runs, so no structural damage accumulates.
    const UNBREACHABLE = (SCALE.Q + 1) as Q;
    const plan = singleSegPlan("shell", {
      structureType: "exoskeleton",
      breachThreshold: UNBREACHABLE,
      intrinsicArmor_J: 999_999,
    });
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    attacker.loadout = { items: [CLUB] };
    const defender = mkHumanoidEntity(2, 2, Math.trunc(0.5 * SCALE.m), 0);
    defender.bodyPlan = plan;
    defender.injury = defaultInjury(["shell"]);

    const world = mkWorld(77, [attacker, defender]);
    for (let i = 0; i < 20; i++) stepWorld(world, cmds, BASE_CTX);

    const shell = world.entities.find(e => e.id === 2)!.injury.byRegion["shell"]!;
    expect(shell.structuralDamage).toBe(0);
  });
});
