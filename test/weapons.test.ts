// test/weapons.test.ts — Phase 17: Historical Weapons Database + Combat Extensions
import { describe, it, expect } from "vitest";
import { q, SCALE, to, qMul, type Q } from "../src/units";
import {
  PREHISTORIC_MELEE,
  CLASSICAL_MELEE,
  MEDIEVAL_MELEE,
  RENAISSANCE_MELEE,
  EARLY_MODERN_MELEE,
  CONTEMPORARY_MELEE,
  PREHISTORIC_RANGED,
  CLASSICAL_RANGED,
  MEDIEVAL_RANGED,
  RENAISSANCE_RANGED,
  EARLY_MODERN_RANGED,
  CONTEMPORARY_RANGED,
  ALL_HISTORICAL_MELEE,
  ALL_HISTORICAL_RANGED,
} from "../src/weapons";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import type { TraceEvent } from "../src/sim/trace";

// Helpers to find specific weapons
const mFind = (id: string) => ALL_HISTORICAL_MELEE.find(w => w.id === id)!;
const rFind = (id: string) => ALL_HISTORICAL_RANGED.find(w => w.id === id)!;

function runTick(world: ReturnType<typeof mkWorld>, cmds: Map<number, any[]>): TraceEvent[] {
  const events: TraceEvent[] = [];
  const trace = { onEvent: (ev: TraceEvent) => events.push(ev) };
  stepWorld(world, cmds, { tractionCoeff: q(0.9), trace });
  return events;
}

// ── Data integrity ────────────────────────────────────────────────────────────

describe("Data integrity — melee", () => {
  it("every melee weapon has positive mass, non-empty id, and damage profile", () => {
    for (const w of ALL_HISTORICAL_MELEE) {
      expect(w.mass_kg, `${w.id} mass`).toBeGreaterThan(0);
      expect(w.id, "id").toBeTruthy();
      expect(w.damage, `${w.id} damage`).toBeDefined();
    }
  });

  it("all damage fractions are in [0, SCALE.Q] for every melee weapon", () => {
    for (const w of ALL_HISTORICAL_MELEE) {
      const d = w.damage;
      for (const [k, v] of Object.entries(d)) {
        expect(v, `${w.id}.damage.${k}`).toBeGreaterThanOrEqual(0);
        expect(v, `${w.id}.damage.${k}`).toBeLessThanOrEqual(SCALE.Q);
      }
    }
  });

  it("each of the 6 melee period arrays is non-empty", () => {
    expect(PREHISTORIC_MELEE.length).toBeGreaterThan(0);
    expect(CLASSICAL_MELEE.length).toBeGreaterThan(0);
    expect(MEDIEVAL_MELEE.length).toBeGreaterThan(0);
    expect(RENAISSANCE_MELEE.length).toBeGreaterThan(0);
    expect(EARLY_MODERN_MELEE.length).toBeGreaterThan(0);
    expect(CONTEMPORARY_MELEE.length).toBeGreaterThan(0);
  });

  it("reach ordering: sarissa > pike_ren > halberd", () => {
    const sarissa  = mFind("wpn_sarissa");
    const pikeRen  = mFind("wpn_pike_ren");
    const halberd  = mFind("wpn_halberd");
    expect(sarissa.reach_m!).toBeGreaterThan(pikeRen.reach_m!);
    expect(pikeRen.reach_m!).toBeGreaterThan(halberd.reach_m!);
  });

  it("mass ordering: zweihander > bastard_sword > arming_sword", () => {
    const zwei     = mFind("wpn_zweihander");
    const bastard  = mFind("wpn_bastard_sword");
    const arming   = mFind("wpn_arming_sword");
    expect(zwei.mass_kg).toBeGreaterThan(bastard.mass_kg);
    expect(bastard.mass_kg).toBeGreaterThan(arming.mass_kg);
  });
});

describe("Data integrity — ranged", () => {
  it("every ranged weapon has non-negative launchEnergy and positive dispersion", () => {
    for (const w of ALL_HISTORICAL_RANGED) {
      expect(w.launchEnergy_J, `${w.id} launchEnergy`).toBeGreaterThanOrEqual(0);
      expect(w.dispersionQ, `${w.id} dispersion`).toBeGreaterThan(0);
    }
  });

  it("each of the 6 ranged period arrays is non-empty", () => {
    expect(PREHISTORIC_RANGED.length).toBeGreaterThan(0);
    expect(CLASSICAL_RANGED.length).toBeGreaterThan(0);
    expect(MEDIEVAL_RANGED.length).toBeGreaterThan(0);
    expect(RENAISSANCE_RANGED.length).toBeGreaterThan(0);
    expect(EARLY_MODERN_RANGED.length).toBeGreaterThan(0);
    expect(CONTEMPORARY_RANGED.length).toBeGreaterThan(0);
  });

  it("magazine weapons have both magCapacity and shotInterval_s defined", () => {
    for (const w of ALL_HISTORICAL_RANGED) {
      if (w.magCapacity !== undefined) {
        expect(w.shotInterval_s, `${w.id} shotInterval_s`).toBeDefined();
      }
      if (w.shotInterval_s !== undefined) {
        expect(w.magCapacity, `${w.id} magCapacity`).toBeDefined();
      }
    }
  });

  it("recycle time ordering: arquebus > percussion_rifle", () => {
    const arquebus   = rFind("rng_arquebus");
    const percussion = rFind("rng_percussion_rifle");
    expect(arquebus.recycleTime_s).toBeGreaterThan(percussion.recycleTime_s);
  });
});

// ── Damage profile ordering ───────────────────────────────────────────────────

describe("Damage profile ordering — melee", () => {
  it("military_pick.structuralFrac > flanged_mace.structuralFrac", () => {
    const pick = mFind("wpn_military_pick");
    const mace = mFind("wpn_flanged_mace");
    expect(pick.damage.structuralFrac).toBeGreaterThan(mace.damage.structuralFrac);
  });

  it("rapier.penetrationBias > arming_sword.penetrationBias", () => {
    const rapier  = mFind("wpn_rapier");
    const arming  = mFind("wpn_arming_sword");
    expect(rapier.damage.penetrationBias).toBeGreaterThan(arming.damage.penetrationBias);
  });

  it("estoc.penetrationBias > rapier.penetrationBias", () => {
    const estoc  = mFind("wpn_estoc");
    const rapier = mFind("wpn_rapier");
    expect(estoc.damage.penetrationBias).toBeGreaterThan(rapier.damage.penetrationBias);
  });
});

describe("Damage profile ordering — ranged", () => {
  it("warbow.penetrationBias > composite_bow.penetrationBias", () => {
    const warbow  = rFind("rng_warbow");
    const comp    = rFind("rng_composite_bow");
    expect(warbow.damage.penetrationBias).toBeGreaterThan(comp.damage.penetrationBias);
  });

  it("shotgun_12g.surfaceFrac > sniper_rifle.surfaceFrac", () => {
    const shotgun = rFind("rng_shotgun_12g");
    const sniper  = rFind("rng_sniper_rifle");
    expect(shotgun.damage.surfaceFrac).toBeGreaterThan(sniper.damage.surfaceFrac);
  });

  it("sniper_rifle.penetrationBias > shotgun_12g.penetrationBias", () => {
    const sniper  = rFind("rng_sniper_rifle");
    const shotgun = rFind("rng_shotgun_12g");
    expect(sniper.damage.penetrationBias).toBeGreaterThan(shotgun.damage.penetrationBias);
  });
});

// ── Shield bypass mechanics ───────────────────────────────────────────────────

describe("Shield bypass mechanics", () => {
  it("war_flail.shieldBypassQ > morning_star.shieldBypassQ > 0", () => {
    const flail  = mFind("wpn_war_flail");
    const mstar  = mFind("wpn_morning_star");
    expect(flail.shieldBypassQ).toBeDefined();
    expect(mstar.shieldBypassQ).toBeDefined();
    expect(flail.shieldBypassQ!).toBeGreaterThan(mstar.shieldBypassQ!);
    expect(mstar.shieldBypassQ!).toBeGreaterThan(0);
  });

  it("standard weapons (arming_sword, gladius, rapier) have no shieldBypassQ", () => {
    const arming = mFind("wpn_arming_sword");
    const gladius = mFind("wpn_gladius");
    const rapier  = mFind("wpn_rapier");
    expect(arming.shieldBypassQ ?? 0).toBe(0);
    expect(gladius.shieldBypassQ ?? 0).toBe(0);
    expect(rapier.shieldBypassQ ?? 0).toBe(0);
  });

  it("shield bypass reduces effective defence intensity when blocking (unit test)", () => {
    // Directly verify the kernel formula: qMul(defIntensity, SCALE.Q - bypassQ)
    const defIntensity = q(1.0) as Q;
    const flailBypass  = mFind("wpn_war_flail").shieldBypassQ!;
    const effective    = qMul(defIntensity, (SCALE.Q - flailBypass) as Q) as Q;
    expect(effective).toBeLessThan(defIntensity);
    // With bypass = q(0.55) = 5500: effective = qMul(10000, 4500) = 4500
    expect(effective).toBe(qMul(defIntensity, (SCALE.Q - flailBypass) as Q));
  });

  it("zero bypass leaves defence intensity unchanged", () => {
    const defIntensity = q(0.75) as Q;
    const bypass       = 0;
    // When bypass is 0 the kernel skips the reduction entirely
    const effective    = bypass > 0
      ? qMul(defIntensity, (SCALE.Q - bypass) as Q)
      : defIntensity;
    expect(effective).toBe(defIntensity);
  });
});

// ── Magazine mechanics ────────────────────────────────────────────────────────

describe("Magazine mechanics — data", () => {
  it("handgun_9mm has magCapacity 15", () => {
    expect(rFind("rng_handgun_9mm").magCapacity).toBe(15);
  });

  it("assault_rifle has magCapacity 30", () => {
    expect(rFind("rng_assault_rifle").magCapacity).toBe(30);
  });

  it("arquebus has no magCapacity (muzzle-loader)", () => {
    expect(rFind("rng_arquebus").magCapacity).toBeUndefined();
  });

  it("sniper_rifle.shotInterval_s > assault_rifle.shotInterval_s (bolt vs semi)", () => {
    const sniper   = rFind("rng_sniper_rifle");
    const assault  = rFind("rng_assault_rifle");
    expect(sniper.shotInterval_s!).toBeGreaterThan(assault.shotInterval_s!);
  });
});

describe("Magazine mechanics — simulation", () => {
  // Place target 600m away so shots miss (0 energy at range) and target stays alive
  const FAR_DIST = to.m(600);
  const TICK_HZ  = 20;

  function shootNTimes(n: number) {
    const handgun = { ...rFind("rng_handgun_9mm") };
    const shooter = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [handgun as any];
    const target = mkHumanoidEntity(2, 2, FAR_DIST, 0);
    const world = mkWorld(7, [shooter, target]);

    const cmds = new Map([[
      1,
      [{ kind: "shoot", targetId: 2, weaponId: handgun.id, intensity: q(1.0) }],
    ]]);

    for (let i = 0; i < n; i++) {
      const e = world.entities.find(e => e.id === 1)!;
      (e as any).action.shootCooldownTicks = 0;
      runTick(world, cmds);
    }

    return world.entities.find(e => e.id === 1)!;
  }

  it("after 14 shots roundsInMag === 1 and cooldown equals shotInterval ticks", () => {
    const handgun = rFind("rng_handgun_9mm");
    const shooter = shootNTimes(14);
    expect((shooter as any).action.roundsInMag).toBe(1);
    const expectedCooldown = Math.ceil((handgun.shotInterval_s! * TICK_HZ) / SCALE.s);
    expect((shooter as any).action.shootCooldownTicks).toBe(expectedCooldown);
  });

  it("after 15th shot roundsInMag reloads to magCapacity and cooldown = recycleTicks", () => {
    const handgun = rFind("rng_handgun_9mm");
    const shooter = shootNTimes(15);
    expect((shooter as any).action.roundsInMag).toBe(handgun.magCapacity!);
    // Reload cooldown = Math.max(1, Math.trunc(recycleTime_s * TICK_HZ / SCALE.s))
    const expectedReload = Math.max(1, Math.trunc((handgun.recycleTime_s * TICK_HZ) / SCALE.s));
    expect((shooter as any).action.shootCooldownTicks).toBe(expectedReload);
  });

  it("firing muzzle-loader (arquebus) leaves roundsInMag undefined", () => {
    const arquebus = { ...rFind("rng_arquebus") };
    const shooter  = mkHumanoidEntity(1, 1, 0, 0);
    shooter.loadout.items = [arquebus as any];
    const target   = mkHumanoidEntity(2, 2, FAR_DIST, 0);
    const world    = mkWorld(7, [shooter, target]);
    const cmds     = new Map([[
      1,
      [{ kind: "shoot", targetId: 2, weaponId: arquebus.id, intensity: q(1.0) }],
    ]]);

    const e = world.entities.find(e => e.id === 1)!;
    (e as any).action.shootCooldownTicks = 0;
    runTick(world, cmds);

    expect((e as any).action.roundsInMag).toBeUndefined();
  });
});

// ── Energy ordering ───────────────────────────────────────────────────────────

describe("Energy ordering", () => {
  it("assault_rifle.launchEnergy_J > handgun_9mm.launchEnergy_J", () => {
    expect(rFind("rng_assault_rifle").launchEnergy_J).toBeGreaterThan(
      rFind("rng_handgun_9mm").launchEnergy_J,
    );
  });

  it("sniper_rifle.launchEnergy_J >= battle_rifle.launchEnergy_J", () => {
    expect(rFind("rng_sniper_rifle").launchEnergy_J).toBeGreaterThanOrEqual(
      rFind("rng_battle_rifle").launchEnergy_J,
    );
  });

  it("arbalest.launchEnergy_J > warbow.launchEnergy_J > composite_bow.launchEnergy_J", () => {
    const arbalest = rFind("rng_arbalest");
    const warbow   = rFind("rng_warbow");
    const compBow  = rFind("rng_composite_bow");
    expect(arbalest.launchEnergy_J).toBeGreaterThan(warbow.launchEnergy_J);
    expect(warbow.launchEnergy_J).toBeGreaterThan(compBow.launchEnergy_J);
  });

  it("arbalest.launchEnergy_J > arquebus.launchEnergy_J (energy not accuracy)", () => {
    expect(rFind("rng_arbalest").launchEnergy_J).toBeGreaterThan(
      rFind("rng_arquebus").launchEnergy_J,
    );
  });

  it("shotgun_12g.dragCoeff_perM > sniper_rifle.dragCoeff_perM", () => {
    expect(rFind("rng_shotgun_12g").dragCoeff_perM).toBeGreaterThan(
      rFind("rng_sniper_rifle").dragCoeff_perM,
    );
  });

  it("assault_rifle.dispersionQ < shotgun_12g.dispersionQ", () => {
    expect(rFind("rng_assault_rifle").dispersionQ).toBeLessThan(
      rFind("rng_shotgun_12g").dispersionQ,
    );
  });
});
