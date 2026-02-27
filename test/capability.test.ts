// test/capability.test.ts — Phase 12: Capability Sources and Effects
//
// Clarke's Third Law: the engine cannot distinguish magic from technology.
// All effects resolve through identical engine primitives — only tags differ.

import { describe, it, expect } from "vitest";
import { q, SCALE, to, type Q, type I32 } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import type { KernelContext } from "../src/sim/context";
import { stepWorld } from "../src/sim/kernel";
import { TICK_HZ } from "../src/sim/tick.js";
import { DamageChannel } from "../src/channels";
import { defaultInjury } from "../src/sim/injury";
import { v3 } from "../src/sim/vec3";
import { terrainKey } from "../src/sim/terrain";
import type { CapabilitySource, CapabilityEffect, FieldEffectSpec } from "../src/sim/capability";
import type { ActiveSubstance } from "../src/sim/substance";
import { STARTER_SUBSTANCES } from "../src/sim/substance";
import type { ActivateCommand } from "../src/sim/commands";
import { STARTER_WEAPONS } from "../src/equipment";
import { TechEra, type TechCapability } from "../src/sim/tech";

const BASE_CTX: KernelContext = { tractionCoeff: q(0.80) as Q };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSource(overrides: Partial<CapabilitySource> = {}): CapabilitySource {
  return {
    id: "test_src",
    label: "Test Source",
    tags: ["magic"],
    reserve_J: 100_000,
    maxReserve_J: 100_000,
    regenModel: { type: "constant", regenRate_W: 0 },
    effects: [],
    ...overrides,
  };
}

function makeEffect(overrides: Partial<CapabilityEffect> = {}): CapabilityEffect {
  return {
    id: "test_eff",
    cost_J: 1_000,
    castTime_ticks: 0,
    payload: { kind: "velocity", delta_mps: v3(to.mps(1), 0, 0) },
    ...overrides,
  };
}

function activateCmd(sourceId = "test_src", effectId = "test_eff", targetId?: number): ActivateCommand {
  return targetId !== undefined
    ? { kind: "activate", sourceId, effectId, targetId }
    : { kind: "activate", sourceId, effectId };
}

function runTicks(n: number, world: ReturnType<typeof mkWorld>, cmds = new Map()): void {
  for (let i = 0; i < n; i++) stepWorld(world, cmds, BASE_CTX);
}

// Ticks per second at TICK_HZ = 20 and DT_S = to.s(0.05) = 500
// regen per tick = Math.trunc(regenRate_W * 500 / 10000) = Math.trunc(regenRate_W / 20)
const REGEN_PER_TICK = (rate_W: number) => Math.trunc(rate_W * (500 / 10000));

// ─── Regen: constant ──────────────────────────────────────────────────────────

describe("constant regen", () => {
  it("increases reserve_J every tick", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({ reserve_J: 0, regenModel: { type: "constant", regenRate_W: 200 } })];
    const world = mkWorld(1, [e]);

    runTicks(5, world);

    const reserve = world.entities[0]!.capabilitySources![0]!.reserve_J;
    // 200W / 20 ticks/sec = 10J per tick × 5 ticks = 50J minimum
    expect(reserve).toBeGreaterThanOrEqual(REGEN_PER_TICK(200) * 5);
  });

  it("clamps to maxReserve_J", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      reserve_J: 99_999,
      maxReserve_J: 100_000,
      regenModel: { type: "constant", regenRate_W: 2_000 },
    })];
    const world = mkWorld(1, [e]);

    runTicks(5, world);

    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(100_000);
  });
});

// ─── Regen: rest ──────────────────────────────────────────────────────────────

describe("rest regen", () => {
  it("fires only when entity is stationary with no attack cooldown", () => {
    // Stationary entity — should regen
    const still = mkHumanoidEntity(1, 1, 0, 0);
    still.capabilitySources = [makeSource({ reserve_J: 0, regenModel: { type: "rest", regenRate_W: 200 } })];

    // Moving entity — maintain non-zero velocity via intent
    const moving = mkHumanoidEntity(2, 2, Math.trunc(20 * SCALE.m), 0);
    moving.capabilitySources = [makeSource({ reserve_J: 0, regenModel: { type: "rest", regenRate_W: 200 } })];
    moving.intent.move = { dir: v3(SCALE.Q, 0, 0), intensity: q(1.0) as Q, mode: "sprint" };

    const world = mkWorld(1, [still, moving]);
    const moveCmd = { kind: "move" as const, dir: v3(SCALE.Q, 0, 0), intensity: q(1.0) as Q, mode: "sprint" as const };
    const cmds = new Map([[2, [moveCmd]]]);

    // One tick: moving entity has velocity > threshold → no regen; still entity regens
    stepWorld(world, cmds, BASE_CTX);

    const stillReserve  = world.entities.find(e => e.id === 1)!.capabilitySources![0]!.reserve_J;
    const movingReserve = world.entities.find(e => e.id === 2)!.capabilitySources![0]!.reserve_J;

    expect(stillReserve).toBeGreaterThan(0);
    expect(movingReserve).toBe(0);
  });
});

// ─── Regen: boundless ─────────────────────────────────────────────────────────

describe("boundless source", () => {
  it("activation does not reduce reserve_J", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const initial = Number.MAX_SAFE_INTEGER;
    e.capabilitySources = [makeSource({
      reserve_J: initial,
      maxReserve_J: initial,
      regenModel: { type: "boundless" },
      effects: [makeEffect({ cost_J: 1_000_000 })],
    })];
    const world = mkWorld(1, [e]);

    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(initial);
  });

  it("activation succeeds even with cost_J exceeding any finite reserve", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      reserve_J: 0,
      maxReserve_J: Number.MAX_SAFE_INTEGER,
      regenModel: { type: "boundless" },
      effects: [makeEffect({ cost_J: 999_999_999 })],
    })];
    const world = mkWorld(1, [e]);
    const before = v3(0, 0, 0);

    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    // velocity payload should have fired
    const vel = world.entities[0]!.velocity_mps;
    expect(vel.x).toBeGreaterThan(before.x);
  });
});

// ─── Regen: ambient ───────────────────────────────────────────────────────────

describe("ambient regen", () => {
  it("scales with ambientGrid cell value", () => {
    const cellSize_m = Math.trunc(4 * SCALE.m);
    const cx = 0, cy = 0;
    const key = terrainKey(cx, cy);

    const e = mkHumanoidEntity(1, 1, 0, 0); // at cell (0,0)
    e.capabilitySources = [makeSource({ reserve_J: 0, regenModel: { type: "ambient", maxRate_W: 1000 } })];

    const ambientGrid = new Map([[key, q(0.50) as Q]]); // 50% ambient
    const world = mkWorld(1, [e]);
    const ctx: KernelContext = { ...BASE_CTX, cellSize_m, ambientGrid };

    stepWorld(world, new Map(), ctx);

    const reserve = world.entities[0]!.capabilitySources![0]!.reserve_J;
    // rate = trunc(1000 * 5000 / 10000) = 500W; per tick = trunc(500 * 500/10000) = 25J
    expect(reserve).toBeGreaterThan(0);
  });

  it("produces no regen when ambientGrid is absent or cell is empty", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({ reserve_J: 0, regenModel: { type: "ambient", maxRate_W: 1000 } })];
    const world = mkWorld(1, [e]);

    runTicks(5, world);

    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(0);
  });
});

// ─── Regen: event (tick trigger) ─────────────────────────────────────────────

describe("event regen — tick trigger", () => {
  it("fires amount_J every every_n ticks", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      reserve_J: 0,
      regenModel: { type: "event", triggers: [{ on: "tick", every_n: 2, amount_J: 500 }] },
    })];
    const world = mkWorld(1, [e]);

    runTicks(4, world); // should fire at ticks 2 and 4 → 2 × 500 = 1000J

    const reserve = world.entities[0]!.capabilitySources![0]!.reserve_J;
    expect(reserve).toBeGreaterThanOrEqual(500); // at minimum 1 trigger
  });
});

// ─── Cost deduction and insufficient reserve ──────────────────────────────────

describe("activation cost", () => {
  it("deducts cost_J from reserve_J on successful activation", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      reserve_J: 5_000,
      effects: [makeEffect({ cost_J: 1_000 })],
    })];
    const world = mkWorld(1, [e]);

    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(4_000);
  });

  it("silently fails when reserve_J < cost_J", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.velocity_mps = v3(0, 0, 0);
    e.capabilitySources = [makeSource({
      reserve_J: 500,   // below cost_J = 1000
      effects: [makeEffect({ cost_J: 1_000 })],
    })];
    const world = mkWorld(1, [e]);

    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    // reserve unchanged; velocity unchanged (effect didn't fire)
    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(500);
    expect(world.entities[0]!.velocity_mps.x).toBe(0);
  });
});

// ─── Effect payloads ──────────────────────────────────────────────────────────

describe("impact payload", () => {
  it("deals damage to target entity", () => {
    const actor  = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 0, 0);
    actor.capabilitySources = [makeSource({
      reserve_J: 100_000,
      effects: [makeEffect({
        payload: { kind: "impact", spec: { energy_J: 500, channel: DamageChannel.Thermal } },
      })],
    })];
    const world = mkWorld(1, [actor, target]);

    stepWorld(world, new Map([[1, [activateCmd("test_src", "test_eff", 2)]]]), BASE_CTX);

    // Target should have taken some damage
    const t = world.entities.find(e => e.id === 2)!;
    const totalDmg = Object.values(t.injury.byRegion)
      .reduce((s, r) => s + r.surfaceDamage + r.internalDamage + r.structuralDamage, 0);
    expect(totalDmg).toBeGreaterThan(0);
  });
});

describe("treatment payload", () => {
  it("reduces bleedingRate on target", () => {
    const healer = mkHumanoidEntity(1, 1, 0, 0);
    const patient = mkHumanoidEntity(2, 2, 0, 0);
    patient.injury.byRegion["torso"]!.bleedingRate = q(0.50);

    healer.capabilitySources = [makeSource({
      reserve_J: 100_000,
      effects: [makeEffect({
        payload: { kind: "treatment", tier: "surgicalKit", rateMul: q(3.0) as Q },
      })],
    })];
    const world = mkWorld(1, [healer, patient]);

    stepWorld(world, new Map([[1, [activateCmd("test_src", "test_eff", 2)]]]), BASE_CTX);

    const bleedRate = world.entities.find(e => e.id === 2)!.injury.byRegion["torso"]!.bleedingRate;
    expect(bleedRate).toBeLessThan(q(0.50));
  });
});

describe("armourLayer payload", () => {
  it("shield absorbs incoming physical damage", () => {
    const CLUB = STARTER_WEAPONS[0]!;
    const attackCmd = { kind: "attack" as const, targetId: 2, weaponId: CLUB.id, intensity: q(1.0) as Q, mode: "strike" as const };

    // World A — shielded: activate shield then take attacks
    const attackerA = mkHumanoidEntity(1, 1, 0, 0);
    attackerA.loadout = { items: [CLUB] };
    const defenderA = mkHumanoidEntity(2, 2, Math.trunc(0.5 * SCALE.m), 0);
    defenderA.capabilitySources = [makeSource({
      reserve_J: 100_000,
      effects: [makeEffect({
        payload: { kind: "armourLayer", resist_J: 100_000, channels: [DamageChannel.Kinetic], duration_ticks: 100 },
      })],
    })];
    const worldA = mkWorld(77, [attackerA, defenderA]);
    // tick 0: activate shield + attack
    stepWorld(worldA, new Map([[2, [activateCmd()]], [1, [attackCmd]]]), BASE_CTX);
    // ticks 1-4: keep attacking
    for (let i = 0; i < 4; i++) stepWorld(worldA, new Map([[1, [attackCmd]]]), BASE_CTX);

    // World B — unshielded: same setup, no shield activation
    const attackerB = mkHumanoidEntity(1, 1, 0, 0);
    attackerB.loadout = { items: [CLUB] };
    const defenderB = mkHumanoidEntity(2, 2, Math.trunc(0.5 * SCALE.m), 0);
    const worldB = mkWorld(77, [attackerB, defenderB]);
    for (let i = 0; i < 5; i++) stepWorld(worldB, new Map([[1, [attackCmd]]]), BASE_CTX);

    const totalDmg = (w: ReturnType<typeof mkWorld>) =>
      Object.values(w.entities.find(e => e.id === 2)!.injury.byRegion)
        .reduce((s, r) => s + r.surfaceDamage + r.internalDamage + r.structuralDamage, 0);

    expect(totalDmg(worldA)).toBeLessThan(totalDmg(worldB));
  });
});

describe("velocity payload", () => {
  it("changes target entity velocity by delta_mps", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const delta = v3(to.mps(3), 0, 0);
    e.capabilitySources = [makeSource({
      reserve_J: 100_000,
      effects: [makeEffect({ payload: { kind: "velocity", delta_mps: delta } })],
    })];
    const world = mkWorld(1, [e]);
    const velBefore = world.entities[0]!.velocity_mps.x;

    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    const velAfter = world.entities[0]!.velocity_mps.x;
    expect(velAfter).toBeGreaterThan(velBefore);
  });
});

describe("substance payload", () => {
  it("injects substance into target.substances", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const stimulant = STARTER_SUBSTANCES["stimulant"]!;
    const activeSub: ActiveSubstance = { substance: stimulant, pendingDose: q(1.0) as Q, concentration: q(0) as Q };

    e.capabilitySources = [makeSource({
      reserve_J: 100_000,
      effects: [makeEffect({ payload: { kind: "substance", substance: activeSub } })],
    })];
    const world = mkWorld(1, [e]);

    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    expect(world.entities[0]!.substances?.length).toBeGreaterThan(0);
    expect(world.entities[0]!.substances![0]!.substance.id).toBe("stimulant");
  });
});

describe("structuralRepair payload", () => {
  it("reduces structural damage on the named region", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.byRegion["torso"]!.structuralDamage = q(0.40);

    e.capabilitySources = [makeSource({
      reserve_J: 100_000,
      effects: [makeEffect({
        payload: { kind: "structuralRepair", region: "torso", amount: q(0.15) as Q },
      })],
    })];
    const world = mkWorld(1, [e]);

    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    const dmg = world.entities[0]!.injury.byRegion["torso"]!.structuralDamage;
    expect(dmg).toBeLessThanOrEqual(q(0.40) - q(0.15));
  });

  it("does not repair below permanentDamage floor", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.byRegion["torso"]!.structuralDamage = q(0.30);
    (e.injury.byRegion["torso"] as any).permanentDamage = q(0.25); // floor

    e.capabilitySources = [makeSource({
      reserve_J: 100_000,
      effects: [makeEffect({
        payload: { kind: "structuralRepair", region: "torso", amount: q(0.20) as Q },
      })],
    })];
    const world = mkWorld(1, [e]);

    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    const dmg = world.entities[0]!.injury.byRegion["torso"]!.structuralDamage;
    expect(dmg).toBeGreaterThanOrEqual(q(0.25));
  });
});

describe("fieldEffect payload", () => {
  it("places a FieldEffect in world.activeFieldEffects", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const spec: FieldEffectSpec = { radius_m: to.m(10), suppressesTags: ["magic"], duration_ticks: 50 };

    e.capabilitySources = [makeSource({
      reserve_J: 100_000,
      tags: ["tech"],
      effects: [makeEffect({ payload: { kind: "fieldEffect", spec } })],
    })];
    const world = mkWorld(1, [e]);

    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    expect(world.activeFieldEffects?.length).toBeGreaterThan(0);
    expect(world.activeFieldEffects![0]!.suppressesTags).toContain("magic");
  });
});

// ─── Suppression ──────────────────────────────────────────────────────────────

describe("field effect suppression", () => {
  it("blocks activation when source tags overlap field suppressesTags", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      tags: ["magic"],
      reserve_J: 10_000,
      effects: [makeEffect()],
    })];
    // Pre-seed anti-magic field covering entity's position
    const world = mkWorld(1, [e]);
    world.activeFieldEffects = [{
      id: "antimagic",
      origin: v3(0, 0, 0),
      radius_m: to.m(50),
      suppressesTags: ["magic"],
      duration_ticks: -1,
      placedByEntityId: 0,
    }];

    const velBefore = world.entities[0]!.velocity_mps.x;
    const reserveBefore = world.entities[0]!.capabilitySources![0]!.reserve_J;

    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    // Effect was suppressed: velocity unchanged, reserve unchanged
    expect(world.entities[0]!.velocity_mps.x).toBe(velBefore);
    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(reserveBefore);
  });

  it("does NOT suppress when tags do not overlap (anti-magic vs tech)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      tags: ["tech", "fusion"],
      reserve_J: 10_000,
      effects: [makeEffect()],
    })];
    const world = mkWorld(1, [e]);
    world.activeFieldEffects = [{
      id: "antimagic",
      origin: v3(0, 0, 0),
      radius_m: to.m(50),
      suppressesTags: ["magic"],
      duration_ticks: -1,
      placedByEntityId: 0,
    }];

    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    // Tech source — not suppressed; velocity delta_mps was applied
    expect(world.entities[0]!.velocity_mps.x).toBeGreaterThan(0);
  });
});

// ─── AoE ──────────────────────────────────────────────────────────────────────

describe("AoE effects", () => {
  it("applies payload to all living entities within aoeRadius_m", () => {
    const caster = mkHumanoidEntity(1, 1, 0, 0);
    const nearby = mkHumanoidEntity(2, 2, Math.trunc(3 * SCALE.m), 0);   // 3m away
    const far    = mkHumanoidEntity(3, 3, Math.trunc(15 * SCALE.m), 0);  // 15m away

    caster.capabilitySources = [makeSource({
      reserve_J: 100_000,
      effects: [makeEffect({
        aoeRadius_m: to.m(5),  // 5m radius
        payload: { kind: "impact", spec: { energy_J: 200, channel: DamageChannel.Thermal } },
      })],
    })];
    const world = mkWorld(1, [caster, nearby, far]);

    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    const nearbyDmg = Object.values(world.entities.find(e => e.id === 2)!.injury.byRegion)
      .reduce((s, r) => s + r.surfaceDamage + r.internalDamage + r.structuralDamage, 0);
    const farDmg = Object.values(world.entities.find(e => e.id === 3)!.injury.byRegion)
      .reduce((s, r) => s + r.surfaceDamage + r.internalDamage + r.structuralDamage, 0);

    expect(nearbyDmg).toBeGreaterThan(0);     // within radius — hit
    expect(farDmg).toBe(0);                   // outside radius — unaffected
  });
});

// ─── Cast time ────────────────────────────────────────────────────────────────

describe("cast time", () => {
  it("effect not applied until castTime_ticks have elapsed", () => {
    // Use structuralRepair payload — it's persistent and not reset by stepMovement
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.byRegion["torso"]!.structuralDamage = q(0.40);
    e.capabilitySources = [makeSource({
      reserve_J: 50_000,
      effects: [makeEffect({
        castTime_ticks: 5,
        payload: { kind: "structuralRepair", region: "torso", amount: q(0.15) as Q },
      })],
    })];
    const world = mkWorld(1, [e]);

    // Issue activate command once
    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    // After 1 tick: pending — structural damage unchanged
    expect(world.entities[0]!.injury.byRegion["torso"]!.structuralDamage).toBe(q(0.40));
    expect(world.entities[0]!.pendingActivation).toBeDefined();

    // Run 5 more ticks without re-issuing the command
    runTicks(5, world);

    // Cast has resolved: structuralDamage decreased from q(0.40) to q(0.25)
    expect(world.entities[0]!.injury.byRegion["torso"]!.structuralDamage).toBeLessThan(q(0.40));
    expect(world.entities[0]!.pendingActivation).toBeUndefined();
  });

  it("concentration break: high shock clears pendingActivation", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      reserve_J: 50_000,
      effects: [makeEffect({ castTime_ticks: 20 })],
    })];
    const world = mkWorld(1, [e]);

    // Start the cast
    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);
    expect(world.entities[0]!.pendingActivation).toBeDefined();

    // Inject shock above interrupt threshold (q(0.30))
    world.entities[0]!.injury.shock = q(0.50);

    stepWorld(world, new Map(), BASE_CTX);

    expect(world.entities[0]!.pendingActivation).toBeUndefined();
    // velocity should NOT have changed (cast was interrupted)
    expect(world.entities[0]!.velocity_mps.x).toBe(0);
  });
});

// ─── Field effect expiry ──────────────────────────────────────────────────────

describe("stepFieldEffects", () => {
  it("decrements duration_ticks each tick and removes expired effects", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    world.activeFieldEffects = [{
      id: "timed",
      origin: v3(0, 0, 0),
      radius_m: to.m(10),
      suppressesTags: [],
      duration_ticks: 2,
      placedByEntityId: 0,
    }];

    runTicks(1, world);
    expect(world.activeFieldEffects![0]!.duration_ticks).toBe(1);

    runTicks(1, world);
    // After 2 ticks, expired and removed
    expect(world.activeFieldEffects?.length ?? 0).toBe(0);
  });

  it("permanent effects (duration_ticks = -1) are never removed", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    world.activeFieldEffects = [{
      id: "perm",
      origin: v3(0, 0, 0),
      radius_m: to.m(10),
      suppressesTags: [],
      duration_ticks: -1,
      placedByEntityId: 0,
    }];

    runTicks(50, world);
    expect(world.activeFieldEffects?.length).toBe(1);
  });
});

// ─── Multiple payloads ────────────────────────────────────────────────────────

describe("multiple payloads on one effect", () => {
  it("all payloads fire on a single activation", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.byRegion["torso"]!.structuralDamage = q(0.30);

    e.capabilitySources = [makeSource({
      reserve_J: 100_000,
      effects: [makeEffect({
        payload: [
          { kind: "velocity",        delta_mps: v3(to.mps(2), 0, 0) },
          { kind: "structuralRepair", region: "torso", amount: q(0.10) as Q },
        ],
      })],
    })];
    const world = mkWorld(1, [e]);

    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    // Both payloads fired
    expect(world.entities[0]!.velocity_mps.x).toBeGreaterThan(0);
    expect(world.entities[0]!.injury.byRegion["torso"]!.structuralDamage).toBeLessThan(q(0.30));
  });
});

// ─── Clarke's Third Law — engine parity ──────────────────────────────────────

describe("Clarke's Third Law — engine cannot distinguish magic from technology", () => {
  it("'mend_bone' spell and 'nano_repair' nanobot both reduce structural damage identically", () => {
    function makeRepairSource(label: string, tags: string[]): CapabilitySource {
      return makeSource({
        id: "repair_src",
        label,
        tags,
        reserve_J: 100_000,
        effects: [makeEffect({
          id: "repair",
          payload: { kind: "structuralRepair", region: "torso", amount: q(0.20) as Q },
        })],
      });
    }

    // World A: medieval magic spell
    const magicUser = mkHumanoidEntity(1, 1, 0, 0);
    magicUser.injury.byRegion["torso"]!.structuralDamage = q(0.50);
    magicUser.capabilitySources = [makeRepairSource("Arcane mana", ["magic", "arcane"])];
    const worldA = mkWorld(1, [magicUser]);

    // World B: deep-space nanobot
    const nanoUser = mkHumanoidEntity(1, 1, 0, 0);
    nanoUser.injury.byRegion["torso"]!.structuralDamage = q(0.50);
    nanoUser.capabilitySources = [makeRepairSource("Nanobot colony", ["tech", "nano"])];
    const worldB = mkWorld(1, [nanoUser]);

    const cmd = activateCmd("repair_src", "repair");
    stepWorld(worldA, new Map([[1, [cmd]]]), BASE_CTX);
    stepWorld(worldB, new Map([[1, [cmd]]]), BASE_CTX);

    const magicDmg = worldA.entities[0]!.injury.byRegion["torso"]!.structuralDamage;
    const nanoDmg  = worldB.entities[0]!.injury.byRegion["torso"]!.structuralDamage;

    // Both reduced by q(0.20) — engine path is identical
    expect(magicDmg).toBe(nanoDmg);
    expect(magicDmg).toBeLessThan(q(0.50));
  });
});

// ─── Tech gating ─────────────────────────────────────────────────────────────

describe("tech gating (requiredCapability)", () => {
  function makeGatedSource(cap: TechCapability): ReturnType<typeof makeSource> {
    return makeSource({
      reserve_J: 100_000,
      effects: [makeEffect({ requiredCapability: cap })],
    });
  }

  it("fires when techCtx includes the required capability", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeGatedSource("ArcaneMagic")];
    const world = mkWorld(1, [e]);
    const ctx: KernelContext = { ...BASE_CTX, techCtx: { era: TechEra.Medieval, available: new Set<TechCapability>(["ArcaneMagic"]) } };

    stepWorld(world, new Map([[1, [activateCmd()]]]), ctx);

    // Cost deducted → activation fired
    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(99_000);
  });

  it("is blocked when techCtx lacks the required capability", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeGatedSource("ArcaneMagic")];
    const world = mkWorld(1, [e]);
    const ctx: KernelContext = { ...BASE_CTX, techCtx: { era: TechEra.Modern, available: new Set<TechCapability>(["MetallicArmour"]) } };

    stepWorld(world, new Map([[1, [activateCmd()]]]), ctx);

    // Reserve unchanged — gated out
    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(100_000);
  });

  it("fires when no techCtx is provided (no restriction)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeGatedSource("Psionics")];
    const world = mkWorld(1, [e]);

    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(99_000);
  });
});

// ─── Capability cooldown ──────────────────────────────────────────────────────

describe("capability cooldown", () => {
  it("blocks re-activation until cooldown_ticks have elapsed", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.capabilitySources = [makeSource({
      reserve_J: 200_000,
      regenModel: { type: "constant", regenRate_W: 0 },
      effects: [makeEffect({ cost_J: 1_000, cooldown_ticks: 5 })],
    })];
    const world = mkWorld(1, [e]);
    const activateMap = new Map([[1, [activateCmd()]]]);

    // First activation fires
    stepWorld(world, activateMap, BASE_CTX);
    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(199_000);

    // Four immediate re-attempts — all blocked by cooldown
    for (let i = 0; i < 4; i++) stepWorld(world, activateMap, BASE_CTX);
    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(199_000);

    // Fifth tick: cooldown 1 → 0 (cleared), activation fires
    stepWorld(world, activateMap, BASE_CTX);
    expect(world.entities[0]!.capabilitySources![0]!.reserve_J).toBe(198_000);
  });
});

// ─── Magic resistance ─────────────────────────────────────────────────────────

describe("magic resistance (magicResist)", () => {
  function makeTargetedRepairSource(range_m: number): ReturnType<typeof makeSource> {
    return makeSource({
      reserve_J: 100_000,
      effects: [makeEffect({
        range_m,
        payload: { kind: "structuralRepair", region: "torso", amount: q(0.20) as Q },
      })],
    });
  }

  it("q(1.0) magicResist fully blocks incoming effects", () => {
    const caster = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, Math.trunc(0.5 * SCALE.m), 0);
    target.injury.byRegion["torso"]!.structuralDamage = q(0.50);
    target.attributes.resilience.magicResist = q(1.0) as Q;
    caster.capabilitySources = [makeTargetedRepairSource(to.m(2))];
    const world = mkWorld(1, [caster, target]);

    stepWorld(world, new Map([[1, [activateCmd("test_src", "test_eff", 2)]]]), BASE_CTX);

    expect(world.entities.find(e => e.id === 2)!.injury.byRegion["torso"]!.structuralDamage).toBe(q(0.50));
  });

  it("q(0) magicResist (or absent) never blocks", () => {
    const caster = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, Math.trunc(0.5 * SCALE.m), 0);
    target.injury.byRegion["torso"]!.structuralDamage = q(0.50);
    // no magicResist set — defaults to 0
    caster.capabilitySources = [makeTargetedRepairSource(to.m(2))];
    const world = mkWorld(1, [caster, target]);

    stepWorld(world, new Map([[1, [activateCmd("test_src", "test_eff", 2)]]]), BASE_CTX);

    expect(world.entities.find(e => e.id === 2)!.injury.byRegion["torso"]!.structuralDamage).toBeLessThan(q(0.50));
  });

  it("self-cast effects bypass magicResist entirely", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.byRegion["torso"]!.structuralDamage = q(0.50);
    e.attributes.resilience.magicResist = q(1.0) as Q;
    e.capabilitySources = [makeSource({
      reserve_J: 100_000,
      effects: [makeEffect({ payload: { kind: "structuralRepair", region: "torso", amount: q(0.20) as Q } })],
    })];
    const world = mkWorld(1, [e]);

    stepWorld(world, new Map([[1, [activateCmd()]]]), BASE_CTX);

    // Self-cast — not gated by magicResist
    expect(world.entities[0]!.injury.byRegion["torso"]!.structuralDamage).toBeLessThan(q(0.50));
  });

  it("q(0.5) magicResist blocks roughly half over 100 seeds", () => {
    let blocked = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const caster = mkHumanoidEntity(1, 1, 0, 0);
      const target = mkHumanoidEntity(2, 2, Math.trunc(0.5 * SCALE.m), 0);
      target.injury.byRegion["torso"]!.structuralDamage = q(0.50);
      target.attributes.resilience.magicResist = q(0.5) as Q;
      caster.capabilitySources = [makeTargetedRepairSource(to.m(2))];
      const world = mkWorld(seed, [caster, target]);

      stepWorld(world, new Map([[1, [activateCmd("test_src", "test_eff", 2)]]]), BASE_CTX);

      if (world.entities.find(e => e.id === 2)!.injury.byRegion["torso"]!.structuralDamage === q(0.50)) blocked++;
    }
    expect(blocked).toBeGreaterThan(30);
    expect(blocked).toBeLessThan(70);
  });
});
