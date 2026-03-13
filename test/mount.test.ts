// test/mount.test.ts — Phase 59: Mounted Combat & Riding

import { describe, it, expect } from "vitest";
import { q, to, SCALE } from "../src/units.js";
import {
  ALL_MOUNTS,
  PONY,
  HORSE,
  WARHORSE,
  CAMEL,
  WAR_ELEPHANT,
  CHARGE_MASS_FRAC,
  DISMOUNT_SHOCK_Q,
  HEIGHT_AIM_BONUS_MAX,
  getMountGaitSpeed,
  computeChargeBonus,
  deriveRiderHeightBonus,
  deriveRiderStabilityBonus,
  computeFallEnergy_J,
  deriveMountFearPressure,
  checkMountStep,
  entityIsMounted,
  entityIsMount,
  type MountProfile,
} from "../src/sim/mount.js";
import { mkHumanoidEntity } from "../src/sim/testing.js";

// ── Data integrity ────────────────────────────────────────────────────────────

describe("data integrity", () => {
  it("ALL_MOUNTS.length === 5", () => {
    expect(ALL_MOUNTS.length).toBe(5);
  });

  it("all profiles: mass_kg > 0, speed order walk < trot < gallop <= charge", () => {
    for (const p of ALL_MOUNTS) {
      expect(p.mass_kg).toBeGreaterThan(0);
      expect(p.walkSpeed_mps).toBeLessThan(p.trotSpeed_mps);
      expect(p.trotSpeed_mps).toBeLessThan(p.gallopSpeed_mps);
      expect(p.gallopSpeed_mps).toBeLessThanOrEqual(p.chargeSpeed_mps);
    }
  });

  it("mass order: war_elephant > warhorse > horse > pony", () => {
    expect(WAR_ELEPHANT.mass_kg).toBeGreaterThan(WARHORSE.mass_kg);
    expect(WARHORSE.mass_kg).toBeGreaterThan(HORSE.mass_kg);
    expect(HORSE.mass_kg).toBeGreaterThan(PONY.mass_kg);
  });

  it("height order: war_elephant > camel > horse > pony", () => {
    expect(WAR_ELEPHANT.riderHeightBonus_m).toBeGreaterThan(CAMEL.riderHeightBonus_m);
    expect(CAMEL.riderHeightBonus_m).toBeGreaterThan(HORSE.riderHeightBonus_m);
    expect(HORSE.riderHeightBonus_m).toBeGreaterThan(PONY.riderHeightBonus_m);
  });

  it("all stability_Q and fearThreshold_Q are in (0, SCALE.Q)", () => {
    for (const p of ALL_MOUNTS) {
      expect(p.stability_Q).toBeGreaterThan(0);
      expect(p.stability_Q).toBeLessThan(SCALE.Q);
      expect(p.fearThreshold_Q).toBeGreaterThan(0);
      expect(p.fearThreshold_Q).toBeLessThan(SCALE.Q);
    }
  });

  it("warhorse fearThreshold_Q > horse fearThreshold_Q (battle-trained)", () => {
    expect(WARHORSE.fearThreshold_Q).toBeGreaterThan(HORSE.fearThreshold_Q);
  });
});

// ── getMountGaitSpeed ─────────────────────────────────────────────────────────

describe("getMountGaitSpeed", () => {
  it("gallop > trot > walk for every profile", () => {
    for (const p of ALL_MOUNTS) {
      expect(getMountGaitSpeed(p, "walk")).toBeLessThan(getMountGaitSpeed(p, "trot"));
      expect(getMountGaitSpeed(p, "trot")).toBeLessThan(getMountGaitSpeed(p, "gallop"));
    }
  });

  it("charge >= gallop for every profile", () => {
    for (const p of ALL_MOUNTS) {
      expect(getMountGaitSpeed(p, "charge")).toBeGreaterThanOrEqual(getMountGaitSpeed(p, "gallop"));
    }
  });

  it("returns profile field directly for each gait", () => {
    expect(getMountGaitSpeed(HORSE, "walk")).toBe(HORSE.walkSpeed_mps);
    expect(getMountGaitSpeed(HORSE, "trot")).toBe(HORSE.trotSpeed_mps);
    expect(getMountGaitSpeed(HORSE, "gallop")).toBe(HORSE.gallopSpeed_mps);
    expect(getMountGaitSpeed(HORSE, "charge")).toBe(HORSE.chargeSpeed_mps);
  });
});

// ── computeChargeBonus ────────────────────────────────────────────────────────

describe("computeChargeBonus", () => {
  it("speed 0 → bonusEnergy_J = 0, strikeMass_kg = 0", () => {
    const r = computeChargeBonus(HORSE, 0);
    expect(r.bonusEnergy_J).toBe(0);
    expect(r.strikeMass_kg).toBe(0);
  });

  it("higher speed → more energy (scales with v²)", () => {
    const low  = computeChargeBonus(HORSE, getMountGaitSpeed(HORSE, "trot"));
    const high = computeChargeBonus(HORSE, getMountGaitSpeed(HORSE, "gallop"));
    expect(high.bonusEnergy_J).toBeGreaterThan(low.bonusEnergy_J);
  });

  it("heavier mount → more energy at the same speed", () => {
    const speed = getMountGaitSpeed(HORSE, "gallop");
    const light = computeChargeBonus(PONY,     speed);
    const heavy = computeChargeBonus(WAR_ELEPHANT, speed);
    expect(heavy.bonusEnergy_J).toBeGreaterThan(light.bonusEnergy_J);
  });

  it("war_elephant charge energy > warhorse charge energy despite slower speed", () => {
    const elephant = computeChargeBonus(WAR_ELEPHANT, getMountGaitSpeed(WAR_ELEPHANT, "charge"));
    const warhorse  = computeChargeBonus(WARHORSE,    getMountGaitSpeed(WARHORSE,    "charge"));
    expect(elephant.bonusEnergy_J).toBeGreaterThan(warhorse.bonusEnergy_J);
  });

  it("horse at gallop delivers > 1000 J bonus (well above typical sword strike)", () => {
    const r = computeChargeBonus(HORSE, getMountGaitSpeed(HORSE, "gallop"));
    expect(r.bonusEnergy_J).toBeGreaterThan(1000);
  });

  it("strikeMass_kg = round(mass_kg × CHARGE_MASS_FRAC / SCALE.Q)", () => {
    const expected = Math.round(HORSE.mass_kg * CHARGE_MASS_FRAC / SCALE.Q);
    const r = computeChargeBonus(HORSE, getMountGaitSpeed(HORSE, "gallop"));
    expect(r.strikeMass_kg).toBe(expected);
  });
});

// ── deriveRiderHeightBonus ────────────────────────────────────────────────────

describe("deriveRiderHeightBonus", () => {
  it("returns Q in [0, HEIGHT_AIM_BONUS_MAX]", () => {
    for (const p of ALL_MOUNTS) {
      const bonus = deriveRiderHeightBonus(p);
      expect(bonus).toBeGreaterThanOrEqual(0);
      expect(bonus).toBeLessThanOrEqual(HEIGHT_AIM_BONUS_MAX);
    }
  });

  it("height order: war_elephant >= camel > horse > pony", () => {
    expect(deriveRiderHeightBonus(WAR_ELEPHANT)).toBeGreaterThanOrEqual(deriveRiderHeightBonus(CAMEL));
    expect(deriveRiderHeightBonus(CAMEL)).toBeGreaterThan(deriveRiderHeightBonus(HORSE));
    expect(deriveRiderHeightBonus(HORSE)).toBeGreaterThan(deriveRiderHeightBonus(PONY));
  });

  it("war_elephant bonus is capped at HEIGHT_AIM_BONUS_MAX = q(0.30)", () => {
    expect(deriveRiderHeightBonus(WAR_ELEPHANT)).toBe(HEIGHT_AIM_BONUS_MAX);
  });

  it("horse bonus is in [q(0.10), q(0.20)]", () => {
    const bonus = deriveRiderHeightBonus(HORSE);
    expect(bonus).toBeGreaterThanOrEqual(q(0.10));
    expect(bonus).toBeLessThanOrEqual(q(0.20));
  });
});

// ── deriveRiderStabilityBonus ─────────────────────────────────────────────────

describe("deriveRiderStabilityBonus", () => {
  it("returns Q in [0, q(0.20)] for all profiles", () => {
    for (const p of ALL_MOUNTS) {
      const bonus = deriveRiderStabilityBonus(p);
      expect(bonus).toBeGreaterThanOrEqual(0);
      expect(bonus).toBeLessThanOrEqual(q(0.20));
    }
  });

  it("warhorse > pony (better-trained, more stable)", () => {
    expect(deriveRiderStabilityBonus(WARHORSE)).toBeGreaterThan(deriveRiderStabilityBonus(PONY));
  });

  it("all profiles return a positive bonus", () => {
    for (const p of ALL_MOUNTS) {
      expect(deriveRiderStabilityBonus(p)).toBeGreaterThan(0);
    }
  });
});

// ── computeFallEnergy_J ───────────────────────────────────────────────────────

describe("computeFallEnergy_J", () => {
  const riderMass = to.kg(80);

  it("returns 0 for zero-height mount", () => {
    const zeroHeightProfile: MountProfile = { ...PONY, riderHeightBonus_m: 0 };
    expect(computeFallEnergy_J(zeroHeightProfile, riderMass)).toBe(0);
  });

  it("higher mount → more fall energy (same rider mass)", () => {
    const ponyFall     = computeFallEnergy_J(PONY,         riderMass);
    const elephantFall = computeFallEnergy_J(WAR_ELEPHANT, riderMass);
    expect(elephantFall).toBeGreaterThan(ponyFall);
  });

  it("heavier rider → more fall energy (same mount)", () => {
    const light = computeFallEnergy_J(HORSE, to.kg(60));
    const heavy = computeFallEnergy_J(HORSE, to.kg(100));
    expect(heavy).toBeGreaterThan(light);
  });

  it("horse fall energy for 80 kg rider > 400 J (meaningful injury risk)", () => {
    expect(computeFallEnergy_J(HORSE, riderMass)).toBeGreaterThan(400);
  });
});

// ── deriveMountFearPressure ───────────────────────────────────────────────────

describe("deriveMountFearPressure", () => {
  it("returns q(0) when mount shock is below fearThreshold", () => {
    expect(deriveMountFearPressure(q(0.40) as any, HORSE.fearThreshold_Q)).toBe(q(0));
  });

  it("returns q(0) at exactly the threshold", () => {
    expect(deriveMountFearPressure(HORSE.fearThreshold_Q, HORSE.fearThreshold_Q)).toBe(q(0));
  });

  it("returns > q(0) when mount shock exceeds threshold", () => {
    const pressure = deriveMountFearPressure(q(0.80) as any, HORSE.fearThreshold_Q);
    expect(pressure).toBeGreaterThan(q(0));
  });

  it("higher excess shock → higher fear pressure (monotone)", () => {
    const mid  = deriveMountFearPressure(q(0.70) as any, HORSE.fearThreshold_Q);
    const high = deriveMountFearPressure(q(0.90) as any, HORSE.fearThreshold_Q);
    expect(high).toBeGreaterThan(mid);
  });
});

// ── checkMountStep ────────────────────────────────────────────────────────────

describe("checkMountStep", () => {
  const healthy_Q   = q(0.10) as any;  // low shock — neither rider nor mount stressed
  const rider_Skg   = to.kg(80);

  it("no dismount when both healthy and calm", () => {
    const r = checkMountStep(healthy_Q, healthy_Q, false, HORSE, rider_Skg);
    expect(r.shouldDismount).toBe(false);
    expect(r.dismountCause).toBe("none");
    expect(r.fallEnergy_J).toBe(0);
  });

  it("forced dismount with cause 'rider_shock' when rider shock > DISMOUNT_SHOCK_Q", () => {
    const r = checkMountStep(q(0.80) as any, healthy_Q, false, HORSE, rider_Skg);
    expect(r.shouldDismount).toBe(true);
    expect(r.dismountCause).toBe("rider_shock");
  });

  it("forced dismount with cause 'mount_dead' when mount dies", () => {
    const r = checkMountStep(healthy_Q, healthy_Q, true, HORSE, rider_Skg);
    expect(r.shouldDismount).toBe(true);
    expect(r.dismountCause).toBe("mount_dead");
  });

  it("forced dismount with cause 'mount_bolt' when mount shock exceeds fearThreshold", () => {
    const r = checkMountStep(healthy_Q, q(0.90) as any, false, HORSE, rider_Skg);
    expect(r.shouldDismount).toBe(true);
    expect(r.dismountCause).toBe("mount_bolt");
  });

  it("fallEnergy_J > 0 when dismounted", () => {
    const r = checkMountStep(q(0.80) as any, healthy_Q, false, HORSE, rider_Skg);
    expect(r.fallEnergy_J).toBeGreaterThan(0);
  });

  it("fallEnergy_J = 0 when not dismounted", () => {
    const r = checkMountStep(healthy_Q, healthy_Q, false, HORSE, rider_Skg);
    expect(r.fallEnergy_J).toBe(0);
  });

  it("fear pressure is non-zero when mount panics, even without dismount (warhorse high threshold)", () => {
    // Warhorse fearThreshold = q(0.72); push mount shock above it but below rider shock threshold
    const r = checkMountStep(
      q(0.20) as any,     // rider is calm
      q(0.80) as any,     // mount is panicking (> 0.72 warhorse threshold)
      false,
      WARHORSE,
      rider_Skg,
    );
    expect(r.fearPressure_Q).toBeGreaterThan(q(0));
  });
});

// ── Entity convenience ────────────────────────────────────────────────────────

describe("entityIsMounted / entityIsMount", () => {
  it("entityIsMounted returns false when entity has no mount state", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    expect(entityIsMounted(e)).toBe(false);
  });

  it("entityIsMounted returns true when mount.mountId > 0", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.mount = { mountId: 5, riderId: 0, gait: "gallop" };
    expect(entityIsMounted(e)).toBe(true);
  });

  it("entityIsMount returns false when entity has no mount state", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    expect(entityIsMount(e)).toBe(false);
  });

  it("entityIsMount returns true when mount.riderId > 0", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.mount = { mountId: 0, riderId: 3, gait: "trot" };
    expect(entityIsMount(e)).toBe(true);
  });

  it("entityIsMounted and entityIsMount are independent", () => {
    const rider = mkHumanoidEntity(1, 1, 0, 0);
    const mount = mkHumanoidEntity(2, 1, 0, 0);
    rider.mount = { mountId: 2, riderId: 0, gait: "gallop" };
    mount.mount  = { mountId: 0, riderId: 1, gait: "gallop" };
    expect(entityIsMounted(rider)).toBe(true);
    expect(entityIsMount(rider)).toBe(false);
    expect(entityIsMounted(mount)).toBe(false);
    expect(entityIsMount(mount)).toBe(true);
  });
});
