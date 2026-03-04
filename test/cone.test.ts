// test/cone.test.ts — Phase 28: Cone AoE tests

import { describe, it, expect } from "vitest";
import { entityInCone, buildEntityFacingCone, type ConeSpec } from "../src/sim/cone";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { SCALE, q } from "../src/units";
import { DamageChannel } from "../src/channels";
import type { CapabilitySource, CapabilityEffect } from "../src/sim/capability";
import type { CommandMap } from "../src/sim/commands";

// ─── Geometry ─────────────────────────────────────────────────────────────────

describe("cone geometry — entityInCone", () => {
  const makeCone = (halfAngle_rad: number, range_m: number): ConeSpec => ({
    origin:        { x: 0, y: 0 },
    dir:           { dx: SCALE.m, dy: 0 }, // facing +x
    halfAngle_rad,
    range_m,
  });

  it("entity directly in front within range → in cone", () => {
    const entity = mkHumanoidEntity(1, 1, 5 * SCALE.m, 0);
    expect(entityInCone(entity, makeCone(Math.PI / 6, 10 * SCALE.m))).toBe(true);
  });

  it("entity directly behind → not in cone", () => {
    const entity = mkHumanoidEntity(1, 1, -(5 * SCALE.m), 0);
    expect(entityInCone(entity, makeCone(Math.PI / 6, 10 * SCALE.m))).toBe(false);
  });

  it("entity well within half-angle (25° < 30° half-angle) → in cone", () => {
    // 25° < 30° half-angle — clearly inside, robust to rounding
    const angle = 25 * Math.PI / 180;
    const x = Math.round(Math.cos(angle) * 5 * SCALE.m);
    const y = Math.round(Math.sin(angle) * 5 * SCALE.m);
    const entity = mkHumanoidEntity(1, 1, x, y);
    expect(entityInCone(entity, makeCone(Math.PI / 6, 10 * SCALE.m))).toBe(true);
  });

  it("entity past range → not in cone", () => {
    const entity = mkHumanoidEntity(1, 1, 15 * SCALE.m, 0);
    expect(entityInCone(entity, makeCone(Math.PI / 6, 10 * SCALE.m))).toBe(false);
  });

  it("entity at 90° (side) → not in cone for 30° half-angle", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 5 * SCALE.m);
    expect(entityInCone(entity, makeCone(Math.PI / 6, 10 * SCALE.m))).toBe(false);
  });

  it("half-angle π/2 captures hemisphere: entity at 80° → in cone", () => {
    const angle = 80 * Math.PI / 180;
    const x = Math.round(Math.cos(angle) * 5 * SCALE.m);
    const y = Math.round(Math.sin(angle) * 5 * SCALE.m);
    const entity = mkHumanoidEntity(1, 1, x, y);
    expect(entityInCone(entity, makeCone(Math.PI / 2, 10 * SCALE.m))).toBe(true);
  });

  it("zero range → nothing captured except at origin", () => {
    const entity = mkHumanoidEntity(1, 1, SCALE.m, 0);
    expect(entityInCone(entity, makeCone(Math.PI / 4, 0))).toBe(false);

    const atOrigin = mkHumanoidEntity(2, 1, 0, 0);
    expect(entityInCone(atOrigin, makeCone(Math.PI / 4, 0))).toBe(true);
  });
});

// ─── buildEntityFacingCone ────────────────────────────────────────────────────

describe("buildEntityFacingCone", () => {
  it("facing +x: entity in front → in cone", () => {
    const actor = mkHumanoidEntity(1, 1, 0, 0);
    actor.action.facingDirQ = { x: SCALE.Q, y: 0, z: 0 };
    const cone = buildEntityFacingCone(actor, Math.PI / 6, 10 * SCALE.m);
    const target = mkHumanoidEntity(2, 1, 5 * SCALE.m, 0);
    expect(entityInCone(target, cone)).toBe(true);
  });

  it("facing +y: entity above actor → in cone, entity to right → not in cone", () => {
    const actor = mkHumanoidEntity(1, 1, 0, 0);
    actor.action.facingDirQ = { x: 0, y: SCALE.Q, z: 0 };
    const cone = buildEntityFacingCone(actor, Math.PI / 6, 10 * SCALE.m);
    const above = mkHumanoidEntity(2, 1, 0, 5 * SCALE.m);
    const right = mkHumanoidEntity(3, 1, 5 * SCALE.m, 0);
    expect(entityInCone(above, cone)).toBe(true);
    expect(entityInCone(right, cone)).toBe(false);
  });
});

// ─── Sustained emission ───────────────────────────────────────────────────────

describe("sustained emission", () => {
  const makeFireBreath = (sustainedTicks: number, castTime = 0): { src: CapabilitySource; eff: CapabilityEffect } => {
    const eff: CapabilityEffect = {
      id:               "fire_breath",
      cost_J:           200,
      castTime_ticks:   castTime,
      sustainedTicks,
      coneHalfAngle_rad: Math.PI / 4, // 45° cone
      range_m:           10 * SCALE.m,
      payload: { kind: "impact", spec: { energy_J: 200, channel: DamageChannel.Thermal } },
    };
    const src: CapabilitySource = {
      id: "breath_src", label: "Fire Breath", tags: ["magic"],
      reserve_J: 100_000, maxReserve_J: 100_000,
      regenModel: { type: "rest", regenRate_W: 0 },
      effects: [eff],
    };
    return { src, eff };
  };

  it("sustainedTicks=3: fires 3 consecutive ticks (instant activation)", () => {
    const actor  = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 5 * SCALE.m, 0); // 5m ahead in cone
    actor.action.facingDirQ = { x: SCALE.Q, y: 0, z: 0 };
    const { src } = makeFireBreath(3, 0);
    actor.capabilitySources = [src];
    const world = mkWorld(42, [actor, target]);

    const activateCmds: CommandMap = new Map([[1, [{ kind: "activate", sourceId: "breath_src", effectId: "fire_breath" }]]]);
    const noCmds: CommandMap = new Map();

    // Tick 0: activate → fires (tick 0), sets remainingTicks=2
    stepWorld(world, activateCmds, { tractionCoeff: q(0.9) });
    // Tick 1: sustained fires → remainingTicks=1
    stepWorld(world, noCmds,      { tractionCoeff: q(0.9) });
    // Tick 2: sustained fires → remainingTicks=0, emission deleted
    stepWorld(world, noCmds,      { tractionCoeff: q(0.9) });

    // Emission should be gone after 3rd tick
    expect(actor.action.sustainedEmission).toBeUndefined();

    // Target should have accumulated damage from 3 hits
    const totalDamage = Object.values(target.injury.byRegion)
      .reduce((s, r) => s + r.internalDamage + r.surfaceDamage, 0);
    expect(totalDamage).toBeGreaterThan(0);
  });

  it("sustainedTicks=5 with cast time=2: fires 5 ticks after cast completes", () => {
    const actor  = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 5 * SCALE.m, 0);
    actor.action.facingDirQ = { x: SCALE.Q, y: 0, z: 0 };
    const { src } = makeFireBreath(5, 2);
    actor.capabilitySources = [src];
    const world = mkWorld(42, [actor, target]);

    const activateCmds: CommandMap = new Map([[1, [{ kind: "activate", sourceId: "breath_src", effectId: "fire_breath" }]]]);
    const noCmds: CommandMap = new Map();

    stepWorld(world, activateCmds, { tractionCoeff: q(0.9) }); // tick 0: cast starts (2 ticks)
    stepWorld(world, noCmds,       { tractionCoeff: q(0.9) }); // tick 1: casting
    stepWorld(world, noCmds,       { tractionCoeff: q(0.9) }); // tick 2: cast resolves, fires (1 of 5), remainingTicks=4
    stepWorld(world, noCmds,       { tractionCoeff: q(0.9) }); // tick 3: sustained fires (2 of 5)
    stepWorld(world, noCmds,       { tractionCoeff: q(0.9) }); // tick 4
    stepWorld(world, noCmds,       { tractionCoeff: q(0.9) }); // tick 5
    stepWorld(world, noCmds,       { tractionCoeff: q(0.9) }); // tick 6: 5th fire, remainingTicks=0

    expect(actor.action.sustainedEmission).toBeUndefined();
    const totalDamage = Object.values(target.injury.byRegion)
      .reduce((s, r) => s + r.internalDamage + r.surfaceDamage, 0);
    expect(totalDamage).toBeGreaterThan(0);
  });

  it("each tick deducts cost_J from reserve", () => {
    const actor  = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 5 * SCALE.m, 0);
    actor.action.facingDirQ = { x: SCALE.Q, y: 0, z: 0 };
    const { src } = makeFireBreath(3, 0);
    src.reserve_J = 1_000;
    actor.capabilitySources = [src];
    const world = mkWorld(42, [actor, target]);

    const activateCmds: CommandMap = new Map([[1, [{ kind: "activate", sourceId: "breath_src", effectId: "fire_breath" }]]]);
    const noCmds: CommandMap = new Map();

    stepWorld(world, activateCmds, { tractionCoeff: q(0.9) }); // tick 0: deduct 200 (1), reserve=800
    stepWorld(world, noCmds,       { tractionCoeff: q(0.9) }); // tick 1: deduct 200 (2), reserve=600
    stepWorld(world, noCmds,       { tractionCoeff: q(0.9) }); // tick 2: deduct 200 (3), reserve=400

    // 3 × cost_J = 3 × 200 = 600; started at 1000
    expect(src.reserve_J).toBe(400);
  });

  it("emission stops mid-sequence when reserve exhausted", () => {
    const actor  = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 5 * SCALE.m, 0);
    actor.action.facingDirQ = { x: SCALE.Q, y: 0, z: 0 };
    const { src } = makeFireBreath(10, 0);
    src.reserve_J = 400; // only enough for 2 ticks (200 × 2)
    actor.capabilitySources = [src];
    const world = mkWorld(42, [actor, target]);

    const activateCmds: CommandMap = new Map([[1, [{ kind: "activate", sourceId: "breath_src", effectId: "fire_breath" }]]]);
    const noCmds: CommandMap = new Map();

    stepWorld(world, activateCmds, { tractionCoeff: q(0.9) }); // tick 0: 200J → reserve=200, remainingTicks=9
    stepWorld(world, noCmds,       { tractionCoeff: q(0.9) }); // tick 1: 200J → reserve=0, remainingTicks=8
    stepWorld(world, noCmds,       { tractionCoeff: q(0.9) }); // tick 2: reserve=0 < 200 → stops

    // Emission should be cancelled (reserve depleted)
    expect(actor.action.sustainedEmission).toBeUndefined();
    expect(src.reserve_J).toBe(0);
  });

  it("shock ≥ q(0.30) interrupts sustained emission", () => {
    const actor  = mkHumanoidEntity(1, 1, 0, 0);
    const target = mkHumanoidEntity(2, 2, 5 * SCALE.m, 0);
    actor.action.facingDirQ = { x: SCALE.Q, y: 0, z: 0 };
    const { src } = makeFireBreath(10, 0);
    actor.capabilitySources = [src];
    const world = mkWorld(42, [actor, target]);

    const activateCmds: CommandMap = new Map([[1, [{ kind: "activate", sourceId: "breath_src", effectId: "fire_breath" }]]]);
    const noCmds: CommandMap = new Map();

    stepWorld(world, activateCmds, { tractionCoeff: q(0.9) }); // tick 0: activate, fire
    // Simulate shock — actor takes a hit
    actor.injury.shock = q(0.35) as typeof actor.injury.shock;
    stepWorld(world, noCmds,       { tractionCoeff: q(0.9) }); // tick 1: shock >= 0.30 → interrupted

    expect(actor.action.sustainedEmission).toBeUndefined();
  });
});

// ─── Cone direction modes ──────────────────────────────────────────────────────

describe("cone direction modes", () => {
  it("'facing' mode: cone follows actor's facingDirQ", () => {
    const actor  = mkHumanoidEntity(1, 1, 0, 0);
    const inFront = mkHumanoidEntity(2, 2, 5 * SCALE.m, 0);  // ahead in +x
    const behind  = mkHumanoidEntity(3, 2, -(5 * SCALE.m), 0); // behind

    actor.action.facingDirQ = { x: SCALE.Q, y: 0, z: 0 };

    const eff: CapabilityEffect = {
      id: "fire", cost_J: 100, castTime_ticks: 0,
      coneHalfAngle_rad: Math.PI / 4,
      coneDir: "facing",
      range_m: 10 * SCALE.m,
      payload: { kind: "impact", spec: { energy_J: 100, channel: DamageChannel.Thermal } },
    };
    const src: CapabilitySource = {
      id: "src", label: "L", tags: [],
      reserve_J: 10_000, maxReserve_J: 10_000,
      regenModel: { type: "rest", regenRate_W: 0 },
      effects: [eff],
    };
    actor.capabilitySources = [src];
    const world = mkWorld(42, [actor, inFront, behind]);

    const activateCmds: CommandMap = new Map([[1, [{ kind: "activate", sourceId: "src", effectId: "fire" }]]]);
    stepWorld(world, activateCmds, { tractionCoeff: q(0.9) });

    const frontDamage = Object.values(inFront.injury.byRegion).reduce((s, r) => s + r.internalDamage + r.surfaceDamage, 0);
    const rearDamage  = Object.values(behind.injury.byRegion).reduce((s, r) => s + r.internalDamage + r.surfaceDamage, 0);

    expect(frontDamage).toBeGreaterThan(0);
    expect(rearDamage).toBe(0);
  });

  it("'fixed' mode: cone direction ignores actor's facing", () => {
    const actor   = mkHumanoidEntity(1, 1, 0, 0);
    const inFixed = mkHumanoidEntity(2, 2, 0, 5 * SCALE.m); // +y direction
    actor.action.facingDirQ = { x: SCALE.Q, y: 0, z: 0 }; // actor faces +x

    const eff: CapabilityEffect = {
      id: "fire", cost_J: 100, castTime_ticks: 0,
      coneHalfAngle_rad: Math.PI / 4,
      coneDir: "fixed",
      coneDirFixed: { dx: 0, dy: SCALE.m }, // fixed +y direction
      range_m: 10 * SCALE.m,
      payload: { kind: "impact", spec: { energy_J: 100, channel: DamageChannel.Thermal } },
    };
    const src: CapabilitySource = {
      id: "src", label: "L", tags: [],
      reserve_J: 10_000, maxReserve_J: 10_000,
      regenModel: { type: "rest", regenRate_W: 0 },
      effects: [eff],
    };
    actor.capabilitySources = [src];
    const world = mkWorld(42, [actor, inFixed]);

    const activateCmds: CommandMap = new Map([[1, [{ kind: "activate", sourceId: "src", effectId: "fire" }]]]);
    stepWorld(world, activateCmds, { tractionCoeff: q(0.9) });

    const damage = Object.values(inFixed.injury.byRegion).reduce((s, r) => s + r.internalDamage + r.surfaceDamage, 0);
    expect(damage).toBeGreaterThan(0);
  });
});

// ─── Dragon scenario ──────────────────────────────────────────────────────────

describe("dragon scenario — DRAGON_FIRE_BREATH", () => {
  // Dragon fire breath: weaponImpact with custom damage profile
  const DRAGON_FIRE_EFFECT: CapabilityEffect = {
    id:               "fire_breath",
    cost_J:           800,
    castTime_ticks:   0,
    sustainedTicks:   20,
    coneHalfAngle_rad: Math.PI / 6,      // 30° half-angle (60° total cone)
    coneDir:          "facing",
    range_m:          10 * SCALE.m,
    payload: {
      kind:    "weaponImpact",
      energy_J: 800,
      profile: {
        surfaceFrac:     q(0.60),
        internalFrac:    q(0.30),
        structuralFrac:  q(0.10),
        bleedFactor:     q(0.05),
        penetrationBias: q(0.05),
      },
    },
  };

  const DRAGON_SOURCE: CapabilitySource = {
    id:          "dragon_fire_breath",
    label:       "Fire Breath",
    tags:        ["magic"],
    reserve_J:   32_000,
    maxReserve_J: 32_000,
    regenModel:  { type: "rest", regenRate_W: 0 },
    effects:     [DRAGON_FIRE_EFFECT],
  };

  const makeDragon = (x: number, y: number) => {
    const d = mkHumanoidEntity(10, 1, x, y);
    d.capabilitySources = [{ ...DRAGON_SOURCE, reserve_J: 32_000, effects: [DRAGON_FIRE_EFFECT] }];
    d.action.facingDirQ = { x: SCALE.Q, y: 0, z: 0 }; // faces +x
    return d;
  };

  it("entity in 10m cone takes internal and surface damage within 1 tick", () => {
    const dragon = makeDragon(0, 0);
    const knight = mkHumanoidEntity(11, 2, 5 * SCALE.m, 0); // 5m ahead, in cone
    const world  = mkWorld(99, [dragon, knight]);

    const cmds: CommandMap = new Map([[10, [{ kind: "activate", sourceId: "dragon_fire_breath", effectId: "fire_breath" }]]]);
    stepWorld(world, cmds, { tractionCoeff: q(0.9) });

    const internalDmg = Object.values(knight.injury.byRegion).reduce((s, r) => s + r.internalDamage, 0);
    const surfaceDmg  = Object.values(knight.injury.byRegion).reduce((s, r) => s + r.surfaceDamage, 0);
    expect(internalDmg).toBeGreaterThan(0);
    expect(surfaceDmg).toBeGreaterThan(0);
  });

  it("entity outside cone (90°+ off-axis) takes no damage", () => {
    const dragon = makeDragon(0, 0);
    // Place entity at 90° (directly to the side); 30° half-angle → not in cone
    const outside = mkHumanoidEntity(11, 2, 0, 5 * SCALE.m);
    const world   = mkWorld(99, [dragon, outside]);

    const cmds: CommandMap = new Map([[10, [{ kind: "activate", sourceId: "dragon_fire_breath", effectId: "fire_breath" }]]]);
    stepWorld(world, cmds, { tractionCoeff: q(0.9) });

    const totalDmg = Object.values(outside.injury.byRegion).reduce((s, r) => s + r.internalDamage + r.surfaceDamage, 0);
    expect(totalDmg).toBe(0);
  });

  it("reserve depletes to 16000 after first 20-tick breath (half consumed)", () => {
    const dragon = makeDragon(0, 0);
    const target = mkHumanoidEntity(11, 2, 5 * SCALE.m, 0);
    const world  = mkWorld(99, [dragon, target]);

    const cmds: CommandMap = new Map([[10, [{ kind: "activate", sourceId: "dragon_fire_breath", effectId: "fire_breath" }]]]);
    const noCmds: CommandMap = new Map();

    stepWorld(world, cmds, { tractionCoeff: q(0.9) }); // tick 0: activate + fire 1/20
    for (let i = 1; i < 20; i++) {
      stepWorld(world, noCmds, { tractionCoeff: q(0.9) });
    }

    const src = dragon.capabilitySources![0]!;
    // 20 ticks × 800J/tick = 16000J consumed; reserve should be 32000 - 16000 = 16000
    expect(src.reserve_J).toBe(16_000);
    expect(dragon.action.sustainedEmission).toBeUndefined(); // all ticks exhausted
  });

  it("cooldown prevents immediate re-activation", () => {
    const dragonSrc: CapabilitySource = {
      ...DRAGON_SOURCE,
      reserve_J: 32_000,
      effects: [{ ...DRAGON_FIRE_EFFECT, sustainedTicks: 1, cooldown_ticks: 50 }],
    };
    const dragon = mkHumanoidEntity(10, 1, 0, 0);
    dragon.capabilitySources = [dragonSrc];
    dragon.action.facingDirQ = { x: SCALE.Q, y: 0, z: 0 };
    const target = mkHumanoidEntity(11, 2, 5 * SCALE.m, 0);
    const world  = mkWorld(99, [dragon, target]);

    const cmds: CommandMap = new Map([[10, [{ kind: "activate", sourceId: "dragon_fire_breath", effectId: "fire_breath" }]]]);

    // First activation
    stepWorld(world, cmds, { tractionCoeff: q(0.9) });
    const reserveAfterFirst = dragonSrc.reserve_J; // should be 32000 - 800 = 31200

    // Second activation attempt (cooldown active — should be blocked)
    stepWorld(world, cmds, { tractionCoeff: q(0.9) });
    expect(dragonSrc.reserve_J).toBe(reserveAfterFirst); // no additional deduction
  });

  it("entity retreating beyond range stops taking damage", () => {
    const dragon = makeDragon(0, 0);
    // Target starts in range, then retreats far
    const target = mkHumanoidEntity(11, 2, 5 * SCALE.m, 0);
    const world  = mkWorld(99, [dragon, target]);

    const activateCmds: CommandMap = new Map([[10, [{ kind: "activate", sourceId: "dragon_fire_breath", effectId: "fire_breath" }]]]);
    const noCmds: CommandMap = new Map();

    stepWorld(world, activateCmds, { tractionCoeff: q(0.9) }); // tick 0: in range, takes damage
    const damageAfterFirstHit = Object.values(target.injury.byRegion)
      .reduce((s, r) => s + r.internalDamage + r.surfaceDamage, 0);
    expect(damageAfterFirstHit).toBeGreaterThan(0);

    // Move target far beyond range
    target.position_m.x = 20 * SCALE.m; // 20m > 10m range
    const damageSnapshot = Object.values(target.injury.byRegion)
      .reduce((s, r) => s + r.internalDamage + r.surfaceDamage, 0);

    stepWorld(world, noCmds, { tractionCoeff: q(0.9) }); // tick 1: target out of range
    const damageAfterRetreat = Object.values(target.injury.byRegion)
      .reduce((s, r) => s + r.internalDamage + r.surfaceDamage, 0);
    expect(damageAfterRetreat).toBe(damageSnapshot); // no new damage
  });
});

// ─── weaponImpact payload ────────────────────────────────────────────────────

describe("weaponImpact payload", () => {
  it("high surfaceFrac profile produces more surface damage than high internalFrac profile", () => {
    const makeActor = (id: number, surfFrac: number, intFrac: number) => {
      const e = mkHumanoidEntity(id, 1, 0, 0);
      e.capabilitySources = [{
        id: "src", label: "L", tags: [],
        reserve_J: 100_000, maxReserve_J: 100_000,
        regenModel: { type: "rest", regenRate_W: 0 },
        effects: [{
          id: "fire", cost_J: 800, castTime_ticks: 0,
          coneHalfAngle_rad: Math.PI / 4, range_m: 10 * SCALE.m,
          payload: {
            kind: "weaponImpact",
            energy_J: 800,
            profile: {
              surfaceFrac:     q(surfFrac),
              internalFrac:    q(intFrac),
              structuralFrac:  q(0.10),
              bleedFactor:     q(0.05),
              penetrationBias: q(0.05),
            },
          },
        }],
      }];
      e.action.facingDirQ = { x: SCALE.Q, y: 0, z: 0 };
      return e;
    };

    // Two separate worlds to avoid cross-contamination
    const actorA = makeActor(1, 0.80, 0.10); // high surface
    const targetA = mkHumanoidEntity(2, 2, 5 * SCALE.m, 0);
    const worldA = mkWorld(42, [actorA, targetA]);
    stepWorld(worldA, new Map([[1, [{ kind: "activate", sourceId: "src", effectId: "fire" }]]]), { tractionCoeff: q(0.9) });
    const surfDmgA = Object.values(targetA.injury.byRegion).reduce((s, r) => s + r.surfaceDamage, 0);

    const actorB = makeActor(3, 0.10, 0.80); // high internal
    const targetB = mkHumanoidEntity(4, 2, 5 * SCALE.m, 0);
    const worldB = mkWorld(42, [actorB, targetB]);
    stepWorld(worldB, new Map([[3, [{ kind: "activate", sourceId: "src", effectId: "fire" }]]]), { tractionCoeff: q(0.9) });
    const surfDmgB = Object.values(targetB.injury.byRegion).reduce((s, r) => s + r.surfaceDamage, 0);

    expect(surfDmgA).toBeGreaterThan(surfDmgB);
  });

  it("entity with armourLayer shield absorbs first hit", () => {
    const actor  = mkHumanoidEntity(1, 1, 0, 0);
    actor.action.facingDirQ = { x: SCALE.Q, y: 0, z: 0 };
    actor.capabilitySources = [{
      id: "src", label: "L", tags: [],
      reserve_J: 100_000, maxReserve_J: 100_000,
      regenModel: { type: "rest", regenRate_W: 0 },
      effects: [{
        id: "fire", cost_J: 800, castTime_ticks: 0,
        coneHalfAngle_rad: Math.PI / 4, range_m: 10 * SCALE.m,
        payload: { kind: "weaponImpact", energy_J: 800, profile: {
          surfaceFrac: q(0.60), internalFrac: q(0.30), structuralFrac: q(0.10),
          bleedFactor: q(0.05), penetrationBias: q(0.05),
        }},
      }],
    }];

    const shielded   = mkHumanoidEntity(2, 2, 5 * SCALE.m, 0);
    shielded.condition.shieldReserve_J   = 800;
    shielded.condition.shieldExpiry_tick = 1000;

    const unshielded = mkHumanoidEntity(3, 2, 5 * SCALE.m, 100); // slightly different y, still in cone
    const world = mkWorld(42, [actor, shielded, unshielded]);

    stepWorld(world, new Map([[1, [{ kind: "activate", sourceId: "src", effectId: "fire" }]]]), { tractionCoeff: q(0.9) });

    const shieldedDmg   = Object.values(shielded.injury.byRegion).reduce((s, r) => s + r.surfaceDamage + r.internalDamage, 0);
    const unshieldedDmg = Object.values(unshielded.injury.byRegion).reduce((s, r) => s + r.surfaceDamage + r.internalDamage, 0);
    // Shielded absorbs full 800J → 0 damage; unshielded takes damage
    expect(shieldedDmg).toBe(0);
    expect(unshieldedDmg).toBeGreaterThan(0);
  });
});

// ─── Non-cone effects unaffected ──────────────────────────────────────────────

describe("non-cone effects unaffected by Phase 28", () => {
  it("spherical AoE (aoeRadius_m) still works correctly", () => {
    const actor  = mkHumanoidEntity(1, 1, 0, 0);
    const nearby = mkHumanoidEntity(2, 2, 2 * SCALE.m, 0); // 2m away, in radius
    const far    = mkHumanoidEntity(3, 2, 20 * SCALE.m, 0); // 20m away, outside radius

    actor.capabilitySources = [{
      id: "src", label: "L", tags: [],
      reserve_J: 100_000, maxReserve_J: 100_000,
      regenModel: { type: "rest", regenRate_W: 0 },
      effects: [{
        id: "blast", cost_J: 500, castTime_ticks: 0,
        aoeRadius_m: 5 * SCALE.m,
        payload: { kind: "impact", spec: { energy_J: 500, channel: DamageChannel.Kinetic } },
      }],
    }];
    const world = mkWorld(42, [actor, nearby, far]);

    stepWorld(world, new Map([[1, [{ kind: "activate", sourceId: "src", effectId: "blast" }]]]), { tractionCoeff: q(0.9) });

    const nearbyDmg = Object.values(nearby.injury.byRegion).reduce((s, r) => s + r.internalDamage + r.surfaceDamage, 0);
    const farDmg    = Object.values(far.injury.byRegion).reduce((s, r) => s + r.internalDamage + r.surfaceDamage, 0);

    expect(nearbyDmg).toBeGreaterThan(0);
    expect(farDmg).toBe(0);
  });
});
