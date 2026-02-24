// test/tech.test.ts — Phase 11: Technology Spectrum

import { describe, it, expect } from "vitest";
import { q, SCALE, to } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import {
  TechEra,
  defaultTechContext,
  isCapabilityAvailable,
  type TechContext,
} from "../src/sim/tech";
import {
  validateLoadout,
  findExoskeleton,
  STARTER_ARMOUR,
  STARTER_WEAPONS,
  STARTER_RANGED_WEAPONS,
  STARTER_EXOSKELETONS,
  type Loadout,
} from "../src/equipment";
import { v3 } from "../src/sim/vec3";

const BASE_CTX = { tractionCoeff: q(0.80) };

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
    patient.injury.byRegion["torso"]!.structuralDamage = q(0.50) as any;

    const world = mkWorld(1, [medic, patient]);
    const cmds = new Map([[1, [{
      kind: "treat" as const,
      targetId: 2,
      action: "surgery" as const,
      tier: "nanomedicine" as const,
      regionId: "torso",
    }]]]);

    const ctx = { ...BASE_CTX, ...(techCtxArg !== undefined ? { techCtx: techCtxArg } : {}) };
    for (let i = 0; i < ticks; i++) stepWorld(world, cmds, ctx as any);
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
    patient.injury.byRegion["torso"]!.structuralDamage = q(0.50) as any;

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
    for (let i = 0; i < 20; i++) stepWorld(world, cmds, ctx as any);

    const dmgAfter = world.entities.find(e => e.id === 2)!.injury.byRegion["torso"]!.structuralDamage;
    expect(dmgAfter).toBeLessThan(q(0.50));
  });
});
