// test/tech.test.ts — Phase 11: Technology Spectrum

import { describe, it, expect } from "vitest";
import { q, SCALE, to, type Q } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { KernelContext } from "../src/sim/context";
import {
  TechEra,
  defaultTechContext,
  isCapabilityAvailable,
  type TechContext,
} from "../src/sim/tech";
import {
  validateLoadout,
  findExoskeleton,
  findSensor,
  deriveArmourProfile,
  STARTER_ARMOUR,
  STARTER_WEAPONS,
  STARTER_RANGED_WEAPONS,
  STARTER_EXOSKELETONS,
  STARTER_ARMOUR_11C,
  STARTER_SENSORS,
  type Loadout,
} from "../src/equipment";
import { canDetect, DEFAULT_SENSORY_ENV } from "../src/sim/sensory";
import { v3 } from "../src/sim/vec3";

const BASE_CTX: KernelContext = { tractionCoeff: q(0.80) as Q };

// ── defaultTechContext ────────────────────────────────────────────────────────

describe("defaultTechContext", () => {
  it("Prehistoric: no capabilities", () => {
    const ctx = defaultTechContext(TechEra.Prehistoric);
    expect(ctx.era).toBe(TechEra.Prehistoric);
    expect(ctx.available.size).toBe(0);
  });

  it("Ancient: MetallicArmour available", () => {
    const ctx = defaultTechContext(TechEra.Ancient);
    expect(ctx.available.has("MetallicArmour")).toBe(true);
  });

  it("Medieval: MetallicArmour yes, FirearmsPropellant no", () => {
    const ctx = defaultTechContext(TechEra.Medieval);
    expect(ctx.available.has("MetallicArmour")).toBe(true);
    expect(ctx.available.has("FirearmsPropellant")).toBe(false);
  });

  it("EarlyModern: both MetallicArmour and FirearmsPropellant", () => {
    const ctx = defaultTechContext(TechEra.EarlyModern);
    expect(ctx.available.has("MetallicArmour")).toBe(true);
    expect(ctx.available.has("FirearmsPropellant")).toBe(true);
  });

  it("Modern: BallisticArmour yes, PoweredExoskeleton no", () => {
    const ctx = defaultTechContext(TechEra.Modern);
    expect(ctx.available.has("BallisticArmour")).toBe(true);
    expect(ctx.available.has("PoweredExoskeleton")).toBe(false);
  });

  it("NearFuture: PoweredExoskeleton available, EnergyWeapons not", () => {
    const ctx = defaultTechContext(TechEra.NearFuture);
    expect(ctx.available.has("PoweredExoskeleton")).toBe(true);
    expect(ctx.available.has("EnergyWeapons")).toBe(false);
  });

  it("FarFuture: EnergyWeapons available, NanomedicalRepair not", () => {
    const ctx = defaultTechContext(TechEra.FarFuture);
    expect(ctx.available.has("EnergyWeapons")).toBe(true);
    expect(ctx.available.has("NanomedicalRepair")).toBe(false);
  });

  it("DeepSpace: all capabilities available", () => {
    const ctx = defaultTechContext(TechEra.DeepSpace);
    for (const cap of ["MetallicArmour", "FirearmsPropellant", "ExplosiveMunitions",
        "BallisticArmour", "PoweredExoskeleton", "EnergyWeapons", "ReactivePlating",
        "NanomedicalRepair"] as const) {
      expect(ctx.available.has(cap)).toBe(true);
    }
  });
});

// ── isCapabilityAvailable ─────────────────────────────────────────────────────

describe("isCapabilityAvailable", () => {
  it("returns true for a cap in the set", () => {
    const ctx: TechContext = { era: TechEra.Medieval, available: new Set(["MetallicArmour"]) };
    expect(isCapabilityAvailable(ctx, "MetallicArmour")).toBe(true);
  });

  it("returns false for a cap not in the set", () => {
    const ctx: TechContext = { era: TechEra.Medieval, available: new Set(["MetallicArmour"]) };
    expect(isCapabilityAvailable(ctx, "EnergyWeapons")).toBe(false);
  });

  it("works with empty available set", () => {
    const ctx: TechContext = { era: TechEra.Prehistoric, available: new Set() };
    expect(isCapabilityAvailable(ctx, "MetallicArmour")).toBe(false);
  });
});

// ── validateLoadout ───────────────────────────────────────────────────────────

describe("validateLoadout", () => {
  it("item with no requiredCapabilities is always valid", () => {
    const leather = STARTER_ARMOUR.find(a => a.id === "arm_leather")!;
    const loadout: Loadout = { items: [leather] };
    const ctx = defaultTechContext(TechEra.Prehistoric);
    expect(validateLoadout(loadout, ctx)).toHaveLength(0);
  });

  it("arm_mail is valid in Medieval era", () => {
    const mail = STARTER_ARMOUR.find(a => a.id === "arm_mail")!;
    const loadout: Loadout = { items: [mail] };
    const ctx = defaultTechContext(TechEra.Medieval);
    expect(validateLoadout(loadout, ctx)).toHaveLength(0);
  });

  it("arm_mail is invalid in Prehistoric era", () => {
    const mail = STARTER_ARMOUR.find(a => a.id === "arm_mail")!;
    const loadout: Loadout = { items: [mail] };
    const ctx = defaultTechContext(TechEra.Prehistoric);
    const errors = validateLoadout(loadout, ctx);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("arm_mail");
    expect(errors[0]).toContain("MetallicArmour");
  });

  it("rng_pistol is valid in EarlyModern era", () => {
    const pistol = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_pistol")!;
    const loadout: Loadout = { items: [pistol] };
    const ctx = defaultTechContext(TechEra.EarlyModern);
    expect(validateLoadout(loadout, ctx)).toHaveLength(0);
  });

  it("rng_pistol is invalid in Medieval era", () => {
    const pistol = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_pistol")!;
    const loadout: Loadout = { items: [pistol] };
    const ctx = defaultTechContext(TechEra.Medieval);
    const errors = validateLoadout(loadout, ctx);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("rng_pistol");
    expect(errors[0]).toContain("FirearmsPropellant");
  });

  it("exo_combat is valid in NearFuture era", () => {
    const exo = STARTER_EXOSKELETONS.find(e => e.id === "exo_combat")!;
    const loadout: Loadout = { items: [exo] };
    const ctx = defaultTechContext(TechEra.NearFuture);
    expect(validateLoadout(loadout, ctx)).toHaveLength(0);
  });

  it("exo_combat is invalid in Modern era", () => {
    const exo = STARTER_EXOSKELETONS.find(e => e.id === "exo_combat")!;
    const loadout: Loadout = { items: [exo] };
    const ctx = defaultTechContext(TechEra.Modern);
    const errors = validateLoadout(loadout, ctx);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("exo_combat");
    expect(errors[0]).toContain("PoweredExoskeleton");
  });

  it("plasma_rifle is invalid in NearFuture (no EnergyWeapons)", () => {
    const plasma = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_plasma_rifle")!;
    const loadout: Loadout = { items: [plasma] };
    const ctx = defaultTechContext(TechEra.NearFuture);
    const errors = validateLoadout(loadout, ctx);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("EnergyWeapons");
  });

  it("plasma_rifle is valid in FarFuture", () => {
    const plasma = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_plasma_rifle")!;
    const loadout: Loadout = { items: [plasma] };
    const ctx = defaultTechContext(TechEra.FarFuture);
    expect(validateLoadout(loadout, ctx)).toHaveLength(0);
  });

  it("empty loadout always valid", () => {
    const loadout: Loadout = { items: [] };
    const ctx = defaultTechContext(TechEra.Prehistoric);
    expect(validateLoadout(loadout, ctx)).toHaveLength(0);
  });
});

// ── findExoskeleton ───────────────────────────────────────────────────────────

describe("findExoskeleton", () => {
  it("returns null when no exoskeleton in loadout", () => {
    const loadout: Loadout = { items: [STARTER_ARMOUR[0]!] };
    expect(findExoskeleton(loadout)).toBeNull();
  });

  it("returns the exoskeleton when present", () => {
    const exo = STARTER_EXOSKELETONS[0]!;
    const loadout: Loadout = { items: [exo] };
    expect(findExoskeleton(loadout)).toBe(exo);
  });

  it("STARTER_EXOSKELETONS entries have correct fields", () => {
    const combat = STARTER_EXOSKELETONS.find(e => e.id === "exo_combat")!;
    expect(combat.kind).toBe("exoskeleton");
    expect(combat.speedMultiplier).toBeGreaterThan(SCALE.Q);
    expect(combat.forceMultiplier).toBeGreaterThan(SCALE.Q);
    expect(combat.powerDrain_W).toBeGreaterThan(0);
  });
});

// ── Integration: exoskeleton speed boost ─────────────────────────────────────

describe("exoskeleton speed boost", () => {
  it("entity with exo sprints faster than entity without (equal mass)", () => {
    const exo = STARTER_EXOSKELETONS.find(e => e.id === "exo_combat")!;
    // Give the plain entity the same total mass so encumbrance is identical.
    // Only difference between entities: exoSpeedMul in stepMovement.
    const ballast: Loadout["items"][0] = {
      id: "ballast", kind: "gear", name: "Ballast", mass_kg: exo.mass_kg, bulk: q(0),
    };

    const ePlain = mkHumanoidEntity(1, 1, 0, 0);
    ePlain.loadout = { items: [ballast] };
    ePlain.intent.move = { dir: v3(1, 0, 0), intensity: q(1.0), mode: "sprint" };

    const eExo = mkHumanoidEntity(2, 2, 0, 0);
    eExo.loadout = { items: [exo] };
    eExo.intent.move = { dir: v3(1, 0, 0), intensity: q(1.0), mode: "sprint" };

    const worldPlain = mkWorld(1, [ePlain]);
    const worldExo   = mkWorld(2, [eExo]);

    // Run 30 ticks; no commands
    for (let i = 0; i < 30; i++) {
      stepWorld(worldPlain, new Map(), BASE_CTX);
      stepWorld(worldExo,   new Map(), BASE_CTX);
    }

    const plainX = worldPlain.entities[0]!.position_m.x;
    const exoX   = worldExo.entities[0]!.position_m.x;
    expect(exoX).toBeGreaterThan(plainX);
  });
});

// ── Integration: exoskeleton force multiplier ─────────────────────────────────

describe("exoskeleton force multiplier", () => {
  it("attacker with exo delivers more melee damage than attacker without", () => {
    const exo = STARTER_EXOSKELETONS.find(e => e.id === "exo_combat")!;
    const club = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;
    const ATTACK_DIST = to.m(0.5); // within club reach (0.7m)

    // Equalize mass so encumbrance does not confound the test.
    const ballast: Loadout["items"][0] = {
      id: "ballast", kind: "gear", name: "Ballast", mass_kg: exo.mass_kg, bulk: q(0),
    };

    // Use the same entity IDs and same world seed so RNG outcomes (hits/misses) are identical.
    // The only difference is the exo force multiplier on the delivered energy.
    const SEED = 42;
    const ATTACKER_ID = 1;
    const TARGET_ID = 2;

    const attackerPlain = mkHumanoidEntity(ATTACKER_ID, 1, 0, 0);
    attackerPlain.loadout = { items: [club, ballast] };
    const targetA = mkHumanoidEntity(TARGET_ID, 2, ATTACK_DIST, 0);

    const attackerExo = mkHumanoidEntity(ATTACKER_ID, 1, 0, 0);
    attackerExo.loadout = { items: [club, exo] };
    const targetB = mkHumanoidEntity(TARGET_ID, 2, ATTACK_DIST, 0);

    const worldPlain = mkWorld(SEED, [attackerPlain, targetA]);
    const worldExo   = mkWorld(SEED, [attackerExo, targetB]);

    // CommandMap: entityId → Command[] (array)
    const cmdPlain = new Map([[ATTACKER_ID, [{ kind: "attack" as const, targetId: TARGET_ID, weaponId: club.id, intensity: q(1.0) }]]]);
    const cmdExo   = new Map([[ATTACKER_ID, [{ kind: "attack" as const, targetId: TARGET_ID, weaponId: club.id, intensity: q(1.0) }]]]);

    // Run enough ticks for multiple strikes to accumulate
    for (let i = 0; i < 25; i++) {
      stepWorld(worldPlain, cmdPlain, BASE_CTX);
      stepWorld(worldExo,   cmdExo,   BASE_CTX);
    }

    // Sum total damage across all regions for each target
    const totalDamage = (world: typeof worldPlain, targetId: number) => {
      const t = world.entities.find(e => e.id === targetId)!;
      return Object.values(t.injury.byRegion).reduce(
        (sum, r) => sum + r.structuralDamage + r.internalDamage + r.surfaceDamage, 0);
    };

    const dmgPlain = totalDamage(worldPlain, TARGET_ID);
    const dmgExo   = totalDamage(worldExo, TARGET_ID);
    expect(dmgExo).toBeGreaterThan(dmgPlain);
  });
});

// ── Integration: exoskeleton power drain ─────────────────────────────────────

describe("exoskeleton power drain", () => {
  it("entity with exo loses more energy at idle than entity without", () => {
    const exo = STARTER_EXOSKELETONS.find(e => e.id === "exo_combat")!;

    const ePlain = mkHumanoidEntity(1, 1, 0, 0);
    // Ensure full reserve to start
    const startEnergy = ePlain.attributes.performance.reserveEnergy_J;
    ePlain.energy.reserveEnergy_J = startEnergy;

    const eExo = mkHumanoidEntity(2, 2, 0, 0);
    eExo.loadout = { items: [exo] };
    eExo.energy.reserveEnergy_J = startEnergy;

    const worldPlain = mkWorld(1, [ePlain]);
    const worldExo   = mkWorld(2, [eExo]);

    // Run 100 ticks at idle (no move intent)
    for (let i = 0; i < 100; i++) {
      stepWorld(worldPlain, new Map(), BASE_CTX);
      stepWorld(worldExo,   new Map(), BASE_CTX);
    }

    const energyPlain = worldPlain.entities[0]!.energy.reserveEnergy_J;
    const energyExo   = worldExo.entities[0]!.energy.reserveEnergy_J;

    // Entity with exo should have less energy remaining (higher drain)
    expect(energyExo).toBeLessThan(energyPlain);
  });
});

// ── Integration: medical technology gate ─────────────────────────────────────

describe("medical technology gate", () => {
  /** Run a treat command for N ticks and return the target's torso structuralDamage. */
  function runNanoTreat(ticks: number, techCtxArg?: typeof BASE_CTX["techCtx"]): number {
    const medic   = mkHumanoidEntity(1, 1, 0, 0);
    const patient = mkHumanoidEntity(2, 1, to.m(0.5), 0);
    patient.injury.byRegion["torso"]!.structuralDamage = q(0.50);

    const world = mkWorld(1, [medic, patient]);
    const cmds = new Map([[1, [{
      kind: "treat" as const,
      targetId: 2,
      action: "surgery" as const,
      tier: "nanomedicine" as const,
      regionId: "torso",
    }]]]);

    const ctx = { ...BASE_CTX, ...(techCtxArg !== undefined ? { techCtx: techCtxArg } : {}) };
    for (let i = 0; i < ticks; i++) stepWorld(world, cmds, ctx);
    return world.entities.find(e => e.id === 2)!.injury.byRegion["torso"]!.structuralDamage;
  }

  it("nanomedicine heals when no techCtx set (default: gate inactive)", () => {
    const dmgAfter = runNanoTreat(20, undefined);
    expect(dmgAfter).toBeLessThan(q(0.50));
  });

  it("nanomedicine heals when NanomedicalRepair capability is present", () => {
    const techCtx = defaultTechContext(TechEra.DeepSpace); // has NanomedicalRepair
    const dmgAfter = runNanoTreat(20, techCtx);
    expect(dmgAfter).toBeLessThan(q(0.50));
  });

  it("nanomedicine tier is blocked when NanomedicalRepair capability is absent", () => {
    const techCtx = defaultTechContext(TechEra.Modern); // no NanomedicalRepair
    const dmgAfter = runNanoTreat(20, techCtx);
    // Treatment was blocked — structural damage unchanged at q(0.50)
    expect(dmgAfter).toBe(q(0.50));
  });

  it("lower tier (surgicalKit) still works when NanomedicalRepair is absent", () => {
    const medic   = mkHumanoidEntity(1, 1, 0, 0);
    const patient = mkHumanoidEntity(2, 1, to.m(0.5), 0);
    patient.injury.byRegion["torso"]!.structuralDamage = q(0.50);

    const world = mkWorld(1, [medic, patient]);
    const cmds = new Map([[1, [{
      kind: "treat" as const,
      targetId: 2,
      action: "surgery" as const,
      tier: "surgicalKit" as const,
      regionId: "torso",
    }]]]);

    const techCtx = defaultTechContext(TechEra.Modern); // no NanomedicalRepair, but surgical kit is fine
    const ctx = { ...BASE_CTX, techCtx };
    for (let i = 0; i < 20; i++) stepWorld(world, cmds, ctx);

    const dmgAfter = world.entities.find(e => e.id === 2)!.injury.byRegion["torso"]!.structuralDamage;
    expect(dmgAfter).toBeLessThan(q(0.50));
  });
});

// ── Phase 11C: Energy Weapons ─────────────────────────────────────────────────

describe("Phase 11C: STARTER_ARMOUR_11C entries", () => {
  it("arm_reflective has Energy channel protection and reflectivity q(0.40)", () => {
    const reflective = STARTER_ARMOUR_11C.find(a => a.id === "arm_reflective")!;
    expect(reflective.kind).toBe("armour");
    expect(reflective.reflectivity).toBe(q(0.40));
    // protects Energy channel (bit 8)
    expect(reflective.protects & (1 << 8)).toBeGreaterThan(0);
  });

  it("arm_reactive is ablative with kinetic protection and resist_J = 1500", () => {
    const reactive = STARTER_ARMOUR_11C.find(a => a.id === "arm_reactive")!;
    expect(reactive.kind).toBe("armour");
    expect(reactive.ablative).toBe(true);
    expect(reactive.resist_J).toBe(1500);
    // protects Kinetic channel (bit 0)
    expect(reactive.protects & 1).toBeGreaterThan(0);
  });
});

describe("Phase 11C: deriveArmourProfile reflectivity", () => {
  it("arm_reflective gives reflectivity q(0.40) in derived profile", () => {
    const reflective = STARTER_ARMOUR_11C.find(a => a.id === "arm_reflective")!;
    const loadout: Loadout = { items: [reflective] };
    const profile = deriveArmourProfile(loadout);
    expect(profile.reflectivity).toBe(q(0.40));
  });

  it("standard armour has reflectivity q(0) — no energy protection", () => {
    const leather = STARTER_ARMOUR.find(a => a.id === "arm_leather")!;
    const loadout: Loadout = { items: [leather] };
    const profile = deriveArmourProfile(loadout);
    expect(profile.reflectivity).toBe(q(0));
  });

  it("ablative armour uses armourState resistRemaining_J when provided", () => {
    const reactive = STARTER_ARMOUR_11C.find(a => a.id === "arm_reactive")!;
    const loadout: Loadout = { items: [reactive] };
    const armourState = new Map([["arm_reactive", { resistRemaining_J: 500 }]]);
    const profile = deriveArmourProfile(loadout, armourState);
    expect(profile.resist_J).toBe(500);
  });
});

// ── Phase 11C: Sensors ────────────────────────────────────────────────────────

describe("Phase 11C: STARTER_SENSORS entries", () => {
  it("sens_nightvision has visionRangeMul q(1.5)", () => {
    const nv = STARTER_SENSORS.find(s => s.id === "sens_nightvision")!;
    expect(nv.kind).toBe("sensor");
    expect(nv.visionRangeMul).toBe(q(1.5));
    expect(nv.hearingRangeMul).toBe(q(1.0));
  });

  it("sens_tactical has visionRangeMul q(2.0) and hearingRangeMul q(1.5)", () => {
    const tac = STARTER_SENSORS.find(s => s.id === "sens_tactical")!;
    expect(tac.kind).toBe("sensor");
    expect(tac.visionRangeMul).toBe(q(2.0));
    expect(tac.hearingRangeMul).toBe(q(1.5));
  });
});

describe("Phase 11C: findSensor", () => {
  it("returns null for empty loadout", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    expect(findSensor(e.loadout)).toBeNull();
  });

  it("returns the sensor when present", () => {
    const nv = STARTER_SENSORS.find(s => s.id === "sens_nightvision")!;
    const loadout: Loadout = { items: [nv] };
    expect(findSensor(loadout)).toBe(nv);
  });

  it("ignores non-sensor items", () => {
    const leather = STARTER_ARMOUR.find(a => a.id === "arm_leather")!;
    const loadout: Loadout = { items: [leather] };
    expect(findSensor(loadout)).toBeNull();
  });
});

describe("Phase 11C: sensor boost extends canDetect range", () => {
  it("night-vision sensor detects beyond normal vision range", () => {
    const observer = mkHumanoidEntity(1, 1, 0, 0);
    // Ensure facing +X (default: facingDirQ = {x:10000,y:0,z:0})
    const subject = mkHumanoidEntity(2, 2, to.m(210), 0); // 210m — beyond default 200m vision

    // Without sensor: energy weapon channel only — cannot see at 210m
    const noSensorQ = canDetect(observer, subject, DEFAULT_SENSORY_ENV);
    expect(noSensorQ).toBe(q(0)); // 210m > hearingRange(50m) and > visionRange(200m)

    // With nightvision (1.5× vision → 300m effective):
    const nv = STARTER_SENSORS.find(s => s.id === "sens_nightvision")!;
    const boost = { visionRangeMul: nv.visionRangeMul, hearingRangeMul: nv.hearingRangeMul };
    const withSensorQ = canDetect(observer, subject, DEFAULT_SENSORY_ENV, boost);
    expect(withSensorQ).toBe(q(1.0)); // 210m < 300m → fully visible
  });

  it("sensor hearing boost detects beyond normal hearing range", () => {
    const observer = mkHumanoidEntity(1, 1, 0, 0);
    // Put subject behind observer (outside 120° arc) so vision doesn't trigger
    const subject = mkHumanoidEntity(2, 2, to.m(-60), 0); // 60m behind, beyond 50m hearing

    // Without sensor: 60m > hearingRange(50m) → undetected
    const noSensorQ = canDetect(observer, subject, DEFAULT_SENSORY_ENV);
    expect(noSensorQ).toBe(q(0));

    // With tactical sensor (1.5× hearing → 75m effective):
    const tac = STARTER_SENSORS.find(s => s.id === "sens_tactical")!;
    const boost = { visionRangeMul: tac.visionRangeMul, hearingRangeMul: tac.hearingRangeMul };
    const withSensorQ = canDetect(observer, subject, DEFAULT_SENSORY_ENV, boost);
    expect(withSensorQ).toBe(q(0.4)); // within boosted hearing range
  });
});

// ── Phase 11C: Ablative Armour ────────────────────────────────────────────────

describe("Phase 11C: ablative armour decrement", () => {
  const club = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;

  it("armourState initialized with full resist_J on first tick", () => {
    const reactive = STARTER_ARMOUR_11C.find(a => a.id === "arm_reactive")!;
    const target = mkHumanoidEntity(2, 2, to.m(0.5), 0);
    target.loadout = { items: [reactive] };

    const world = mkWorld(1, [target]);
    // stepWorld initializes armourState in preamble
    stepWorld(world, new Map(), BASE_CTX);

    const t = world.entities.find(e => e.id === 2)!;
    expect(t.armourState).toBeDefined();
    expect(t.armourState!.has("arm_reactive")).toBe(true);
    expect(t.armourState!.get("arm_reactive")!.resistRemaining_J).toBe(1500);
  });

  it("ablative armour resist decrements after kinetic hits", () => {
    const reactive = STARTER_ARMOUR_11C.find(a => a.id === "arm_reactive")!;
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    attacker.loadout = { items: [club] };
    const target = mkHumanoidEntity(2, 2, to.m(0.5), 0);
    target.loadout = { items: [reactive] };

    const world = mkWorld(1, [attacker, target]);
    const cmds = new Map([[1, [{ kind: "attack" as const, targetId: 2, weaponId: club.id, intensity: q(1.0) }]]]);

    // Run enough ticks for multiple protected hits
    for (let i = 0; i < 40; i++) stepWorld(world, cmds, BASE_CTX);

    const t = world.entities.find(e => e.id === 2)!;
    const state = t.armourState?.get("arm_reactive");
    expect(state).toBeDefined();
    expect(state!.resistRemaining_J).toBeLessThan(1500);
  });

  it("depleted ablative armour passes full kinetic damage", () => {
    const reactive = STARTER_ARMOUR_11C.find(a => a.id === "arm_reactive")!;
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    attacker.loadout = { items: [club] };

    // Target A: with ablative armour pre-depleted
    const targetA = mkHumanoidEntity(2, 2, to.m(0.5), 0);
    targetA.loadout = { items: [reactive] };
    targetA.armourState = new Map([["arm_reactive", { resistRemaining_J: 0 }]]);

    // Target B: no armour
    const targetB = mkHumanoidEntity(4, 2, to.m(0.5), 0);

    const worldA = mkWorld(42, [attacker, targetA]);
    const worldB = mkWorld(42, [{ ...attacker, id: 3, teamId: 1 }, targetB]);

    const cmdsA = new Map([[1, [{ kind: "attack" as const, targetId: 2, weaponId: club.id, intensity: q(1.0) }]]]);
    const cmdsB = new Map([[3, [{ kind: "attack" as const, targetId: 4, weaponId: club.id, intensity: q(1.0) }]]]);

    for (let i = 0; i < 30; i++) {
      stepWorld(worldA, cmdsA, BASE_CTX);
      stepWorld(worldB, cmdsB, BASE_CTX);
    }

    const totalDmg = (world: typeof worldA, id: number) => {
      const t = world.entities.find(e => e.id === id)!;
      return Object.values(t.injury.byRegion).reduce((s, r) => s + r.structuralDamage + r.internalDamage + r.surfaceDamage, 0);
    };

    // Depleted armour should offer no more protection than no armour
    // (resist_J derived from armourState = 0, same as unarmoured)
    const dmgDepleted = totalDmg(worldA, 2);
    const dmgUnarmoured = totalDmg(worldB, 4);
    // Allow a small margin since protectedDamageMul still applies structurally
    expect(dmgDepleted).toBeGreaterThanOrEqual(dmgUnarmoured * 0.85);
  });
});
