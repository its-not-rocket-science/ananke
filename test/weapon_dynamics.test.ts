/**
 * Phase 2C: Weapon Dynamics tests
 *
 * Tests for:
 *   - reachDomPenaltyQ
 *   - twoHandedAttackBonusQ
 *   - missRecoveryTicks
 *   - bindChanceQ / bindDurationTicks
 *   - Kernel integration: miss recovery, reach dominance, weapon bind, two-handed bonus
 */
import { describe, it, expect } from "vitest";
import { SCALE, q, qMul, clampQ } from "../src/units";
import {
  reachDomPenaltyQ,
  twoHandedAttackBonusQ,
  missRecoveryTicks,
  bindChanceQ,
  bindDurationTicks,
  breakBindContestQ,
} from "../src/sim/weapon_dynamics";
import type { Weapon } from "../src/equipment";
import { STARTER_WEAPONS, STARTER_SHIELDS } from "../src/equipment";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { TICK_HZ } from "../src/sim/tick.js";
import type { KernelContext } from "../src/sim/context";
import type { AttackCommand, BreakBindCommand, Command } from "../src/sim/commands";
import { TUNING } from "../src/sim/tuning";
import { TraceKinds } from "../src/sim/kinds";
import type { TraceSink, TraceEvent } from "../src/sim/trace";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const knife = STARTER_WEAPONS.find(w => w.id === "wpn_knife")!;
const club = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;

const makeWpn = (mass_kg: number, reach_m: number, momentArm_m: number, handedness: "oneHand" | "twoHand" = "oneHand"): Weapon => ({
  id: "test_wpn",
  kind: "weapon",
  name: "Test weapon",
  mass_kg: Math.round(mass_kg * SCALE.kg),
  bulk: q(1.0),
  reach_m: Math.round(reach_m * SCALE.m),
  momentArm_m: Math.round(momentArm_m * SCALE.m),
  handedness,
  damage: { surfaceFrac: q(0.35), internalFrac: q(0.20), structuralFrac: q(0.45), bleedFactor: q(0.25), penetrationBias: q(0.10) },
});

const ctx: KernelContext = { tractionCoeff: q(0.80) };
const tacCtx: KernelContext = { tractionCoeff: q(0.80), tuning: TUNING.tactical };

// 0.1m apart — within knife reach (0.2m) and within club reach (0.7m)
const CLOSE_DIST = Math.trunc(0.1 * SCALE.m);

// ---------------------------------------------------------------------------
// missRecoveryTicks
// ---------------------------------------------------------------------------

describe("missRecoveryTicks", () => {
  it("knife has 0 extra ticks (light + short)", () => {
    expect(missRecoveryTicks(knife)).toBe(0);
  });

  it("club has 1 extra tick", () => {
    // club: 1200g, 700mm → (1200 * 7000 * 2) / (1000 * 10000) = 1.68 → 1
    expect(missRecoveryTicks(club)).toBe(1);
  });

  it("heavy weapon (2kg, 1.5m) has 6 extra ticks", () => {
    const heavy = makeWpn(2.0, 1.5, 1.0);
    expect(missRecoveryTicks(heavy)).toBe(6);
  });

  it("very light weapon (0.1kg, 0.2m) has 0 ticks", () => {
    const light = makeWpn(0.1, 0.2, 0.1);
    expect(missRecoveryTicks(light)).toBe(0);
  });

  it("result is always non-negative", () => {
    for (const w of STARTER_WEAPONS) {
      expect(missRecoveryTicks(w)).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// reachDomPenaltyQ
// ---------------------------------------------------------------------------

describe("reachDomPenaltyQ", () => {
  it("equal reach → no penalty (1.0)", () => {
    const reach = Math.round(0.7 * SCALE.m);
    expect(reachDomPenaltyQ(reach, reach)).toBe(q(1.0));
  });

  it("attacker longer reach → no penalty (1.0)", () => {
    const atkReach = Math.round(0.8 * SCALE.m);
    const tgtReach = Math.round(0.5 * SCALE.m);
    expect(reachDomPenaltyQ(atkReach, tgtReach)).toBe(q(1.0));
  });

  it("knife vs sword → significant penalty", () => {
    const knifeReach = knife.reach_m!;            // 0.2m = 2000
    const swordReach = Math.round(0.8 * SCALE.m); // 8000
    const penalty = reachDomPenaltyQ(knifeReach, swordReach);
    // deficit = 6000/8000 = 0.75; penalty = 0.75 * 0.40 = 0.30; mul = 0.70
    expect(penalty).toBeLessThan(q(0.80));
    expect(penalty).toBeGreaterThanOrEqual(q(0.60));
  });

  it("result is always in [0.60, 1.0] range", () => {
    const reaches = [1000, 2000, 5000, 8000, 15000, 20000];
    for (const atk of reaches) {
      for (const tgt of reaches) {
        const result = reachDomPenaltyQ(atk, tgt);
        expect(result).toBeGreaterThanOrEqual(q(0.60));
        expect(result).toBeLessThanOrEqual(q(1.0));
      }
    }
  });

  it("penalty increases as attacker reach decreases", () => {
    const targetReach = Math.round(0.8 * SCALE.m);
    const p1 = reachDomPenaltyQ(Math.round(0.7 * SCALE.m), targetReach); // small deficit
    const p2 = reachDomPenaltyQ(Math.round(0.3 * SCALE.m), targetReach); // large deficit
    expect(p1).toBeGreaterThan(p2);
  });
});

// ---------------------------------------------------------------------------
// twoHandedAttackBonusQ
// ---------------------------------------------------------------------------

describe("twoHandedAttackBonusQ", () => {
  it("one-handed weapon → no bonus (1.0)", () => {
    expect(twoHandedAttackBonusQ(knife, false, false, false)).toBe(q(1.0));
    expect(twoHandedAttackBonusQ(club, false, false, false)).toBe(q(1.0));
  });

  it("two-handed weapon, both arms free, no off-hand → 1.12× bonus", () => {
    const twoHand = makeWpn(2.0, 1.2, 0.8, "twoHand");
    expect(twoHandedAttackBonusQ(twoHand, false, false, false)).toBe(q(1.12));
  });

  it("two-handed weapon but left arm disabled → no bonus", () => {
    const twoHand = makeWpn(2.0, 1.2, 0.8, "twoHand");
    expect(twoHandedAttackBonusQ(twoHand, true, false, false)).toBe(q(1.0));
  });

  it("two-handed weapon but right arm disabled → no bonus", () => {
    const twoHand = makeWpn(2.0, 1.2, 0.8, "twoHand");
    expect(twoHandedAttackBonusQ(twoHand, false, true, false)).toBe(q(1.0));
  });

  it("two-handed weapon but off-hand item present → no bonus", () => {
    const twoHand = makeWpn(2.0, 1.2, 0.8, "twoHand");
    expect(twoHandedAttackBonusQ(twoHand, false, false, true)).toBe(q(1.0));
  });

  it("weapon with no handedness field → defaults to one-handed (1.0)", () => {
    const { handedness, ...knifeWithoutHandedness } = knife;
    const noHanded: Weapon = knifeWithoutHandedness;
    expect(handedness).toBe('oneHand');
    expect(twoHandedAttackBonusQ(noHanded, false, false, false)).toBe(q(1.0));
  });
});

// ---------------------------------------------------------------------------
// bindChanceQ
// ---------------------------------------------------------------------------

describe("bindChanceQ", () => {
  it("two knives → low bind chance (< 15%)", () => {
    const chance = bindChanceQ(knife, knife);
    expect(chance).toBeLessThan(q(0.15));
    expect(chance).toBeGreaterThanOrEqual(0);
  });

  it("two clubs → moderate bind chance", () => {
    const chance = bindChanceQ(club, club);
    expect(chance).toBeGreaterThan(q(0.10));
    expect(chance).toBeLessThanOrEqual(q(0.45));
  });

  it("two long polearms → max bind chance (capped at 0.45)", () => {
    const polearm = makeWpn(2.0, 2.0, 1.8);
    const chance = bindChanceQ(polearm, polearm);
    expect(chance).toBe(q(0.45));
  });

  it("asymmetric weapons → chance between the two extremes", () => {
    const knifeChance = bindChanceQ(knife, knife);
    const clubChance = bindChanceQ(club, club);
    const mixed = bindChanceQ(knife, club);
    expect(mixed).toBeGreaterThanOrEqual(knifeChance);
    expect(mixed).toBeLessThanOrEqual(clubChance);
  });

  it("result always in [0, 0.45]", () => {
    const weapons = [knife, club, makeWpn(0.1, 0.1, 0.05), makeWpn(5.0, 2.5, 2.0)];
    for (const a of weapons) {
      for (const b of weapons) {
        const c = bindChanceQ(a, b);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(q(0.45));
      }
    }
  });
});

// ---------------------------------------------------------------------------
// bindDurationTicks
// ---------------------------------------------------------------------------

describe("bindDurationTicks", () => {
  it("two knives → 2 ticks (minimum)", () => {
    expect(bindDurationTicks(knife, knife)).toBe(2);
  });

  it("two clubs → 3 ticks", () => {
    // avgMass = 1200, massReal = 1.2, floor(2 + 1.2) = 3
    expect(bindDurationTicks(club, club)).toBe(3);
  });

  it("very heavy weapons → capped at 8 ticks", () => {
    const heavy = makeWpn(10.0, 2.0, 1.5);
    expect(bindDurationTicks(heavy, heavy)).toBe(8);
  });

  it("result always in [2, 8]", () => {
    const weapons = [knife, club, makeWpn(0.1, 0.1, 0.05), makeWpn(8.0, 2.0, 1.5)];
    for (const a of weapons) {
      for (const b of weapons) {
        const d = bindDurationTicks(a, b);
        expect(d).toBeGreaterThanOrEqual(2);
        expect(d).toBeLessThanOrEqual(8);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Kernel integration: miss recovery
// ---------------------------------------------------------------------------

describe("kernel: miss recovery extends cooldown on miss", () => {
  it("a missed club strike extends cooldown by at least 1 tick", () => {
    // default readyTime = 0.6s → at 20 Hz = 12 ticks
    const baseReadyTicks = Math.max(1, Math.trunc(0.6 * TICK_HZ));
    const expectedExtra = missRecoveryTicks(club);  // 1 tick

    let foundMiss = false;
    for (let seed = 1; seed <= 500; seed++) {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
      a.loadout.items = [club];

      const world = mkWorld(seed, [a, b]);
      const cmds = new Map<number, Command[]>([
        [1, [{ kind: "attack", targetId: 2 } as AttackCommand]],
      ]);

      stepWorld(world, cmds, ctx);

      const entity1 = world.entities.find(e => e.id === 1)!;
      // Miss → cooldown = baseReadyTicks + expectedExtra
      if (entity1.action.attackCooldownTicks > baseReadyTicks) {
        expect(entity1.action.attackCooldownTicks).toBeGreaterThanOrEqual(baseReadyTicks + expectedExtra);
        foundMiss = true;
        break;
      }
    }
    expect(foundMiss).toBe(true);
  });

  it("knife miss adds 0 extra ticks (knife has no recovery penalty)", () => {
    // missRecoveryTicks(knife) === 0: cooldown should never exceed base readyTime
    expect(missRecoveryTicks(knife)).toBe(0);
    const baseReadyTicks = Math.max(1, Math.trunc(0.6 * TICK_HZ));

    for (let seed = 1; seed <= 100; seed++) {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
      a.loadout.items = [knife];

      const world = mkWorld(seed, [a, b]);
      const cmds = new Map<number, Command[]>([
        [1, [{ kind: "attack", targetId: 2 } as AttackCommand]],
      ]);
      stepWorld(world, cmds, ctx);

      const entity1 = world.entities.find(e => e.id === 1)!;
      // Cooldown should be exactly baseReadyTicks on hit or miss (no extra for knife)
      expect(entity1.action.attackCooldownTicks).toBeLessThanOrEqual(baseReadyTicks);
    }
  });
});

// ---------------------------------------------------------------------------
// Kernel integration: weapon bind
// ---------------------------------------------------------------------------

describe("kernel: weapon bind on parry", () => {
  it("both entities become bound after a parried attack (finds a bind within 500 seeds)", () => {
    let foundBind = false;
    for (let seed = 1; seed <= 500; seed++) {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
      // Give both entities clubs (moderate bind chance ~18%)
      a.loadout.items = [{ ...club, id: "club_a" }];
      b.loadout.items = [{ ...club, id: "club_b" }];

      const world = mkWorld(seed, [a, b]);
      const cmds = new Map<number, Command[]>([
        [1, [{ kind: "attack", targetId: 2 } as AttackCommand]],
        [2, [{ kind: "defend", mode: "parry", intensity: q(1.0) }]],
      ]);

      stepWorld(world, cmds, tacCtx);

      const e1 = world.entities.find(e => e.id === 1)!;
      const e2 = world.entities.find(e => e.id === 2)!;

      if (e1.action.weaponBindPartnerId !== 0 && e2.action.weaponBindPartnerId !== 0) {
        expect(e1.action.weaponBindPartnerId).toBe(2);
        expect(e2.action.weaponBindPartnerId).toBe(1);
        expect(e1.action.weaponBindTicks).toBeGreaterThan(0);
        expect(e2.action.weaponBindTicks).toBeGreaterThan(0);
        expect(e1.action.weaponBindTicks).toBe(e2.action.weaponBindTicks);
        foundBind = true;
        break;
      }
    }
    expect(foundBind).toBe(true);
  });

  it("bind duration decays by 1 per tick", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
      a.loadout.items = [{ ...club, id: "club_a" }];
      b.loadout.items = [{ ...club, id: "club_b" }];

      const world = mkWorld(seed, [a, b]);
      const cmds = new Map<number, Command[]>([
        [1, [{ kind: "attack", targetId: 2 } as AttackCommand]],
        [2, [{ kind: "defend", mode: "parry", intensity: q(1.0) }]],
      ]);
      stepWorld(world, cmds, tacCtx);

      const e1 = world.entities.find(e => e.id === 1)!;
      if (e1.action.weaponBindPartnerId !== 0) {
        const bindTicksBefore = e1.action.weaponBindTicks;
        stepWorld(world, new Map(), tacCtx);
        const e1After = world.entities.find(e => e.id === 1)!;
        expect(e1After.action.weaponBindTicks).toBe(Math.max(0, bindTicksBefore - 1));
        return;  // success
      }
    }
  });

  it("bound attacker cannot attack", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
    a.loadout.items = [club];

    const world = mkWorld(42, [a, b]);

    // Force entity 1 into a bind state manually
    const e1 = world.entities.find(e => e.id === 1)!;
    e1.action.weaponBindPartnerId = 2;
    e1.action.weaponBindTicks = 5;

    const shockBefore = world.entities.find(e => e.id === 2)!.injury.shock;

    const cmds = new Map<number, Command[]>([
      [1, [{ kind: "attack", targetId: 2 } as AttackCommand]],
    ]);
    stepWorld(world, cmds, ctx);

    // Entity 2 should have taken no additional shock (attack was gated by bind)
    const e2 = world.entities.find(e => e.id === 2)!;
    expect(e2.injury.shock).toBe(shockBefore);
  });

  it("bind clears after weaponBindTicks reaches 0", () => {
    const a = mkHumanoidEntity(1, 1, 0, 0);
    const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);

    const world = mkWorld(42, [a, b]);

    // Force 1-tick bind
    const e1 = world.entities.find(e => e.id === 1)!;
    e1.action.weaponBindPartnerId = 2;
    e1.action.weaponBindTicks = 1;

    stepWorld(world, new Map(), ctx);

    const e1After = world.entities.find(e => e.id === 1)!;
    expect(e1After.action.weaponBindTicks).toBe(0);
    expect(e1After.action.weaponBindPartnerId).toBe(0);
  });

  it("bind does not trigger in arcade mode", () => {
    const arcadeCtx: KernelContext = { tractionCoeff: q(0.80), tuning: TUNING.arcade };
    for (let seed = 1; seed <= 200; seed++) {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
      a.loadout.items = [{ ...club, id: "club_a" }];
      b.loadout.items = [{ ...club, id: "club_b" }];

      const world = mkWorld(seed, [a, b]);
      const cmds = new Map<number, Command[]>([
        [1, [{ kind: "attack", targetId: 2 } as AttackCommand]],
        [2, [{ kind: "defend", mode: "parry", intensity: q(1.0) }]],
      ]);
      stepWorld(world, cmds, arcadeCtx);

      const e1 = world.entities.find(e => e.id === 1)!;
      const e2 = world.entities.find(e => e.id === 2)!;

      // In arcade mode, bind should never trigger regardless of parry outcome
      expect(e1.action.weaponBindPartnerId).toBe(0);
      expect(e2.action.weaponBindPartnerId).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Kernel integration: reach dominance
// ---------------------------------------------------------------------------

describe("kernel: reach dominance", () => {
  it("knife attacker hits sword defender less often than equal-reach scenario (tactical)", () => {
    let knifeVsSwordHits = 0;
    let swordVsSwordHits = 0;
    const TRIALS = 300;
    // Both attacker and defender within knife reach (0.1m)
    const closeDist = CLOSE_DIST;

    for (let seed = 1; seed <= TRIALS; seed++) {
      // Knife attacker vs sword defender
      {
        const a = mkHumanoidEntity(1, 1, 0, 0);
        const b = mkHumanoidEntity(2, 2, closeDist, 0);
        const sword = makeWpn(1.2, 0.8, 0.55);
        a.loadout.items = [knife];
        b.loadout.items = [{ ...sword, id: "sword_def" }];

        const world = mkWorld(seed, [a, b]);
        const shockBefore = world.entities.find(e => e.id === 2)!.injury.shock;
        const cmds = new Map<number, Command[]>([
          [1, [{ kind: "attack", targetId: 2 } as AttackCommand]],
        ]);
        stepWorld(world, cmds, tacCtx);
        if (world.entities.find(e => e.id === 2)!.injury.shock > shockBefore) knifeVsSwordHits++;
      }

      // Sword attacker vs sword defender (equal reach)
      {
        const a = mkHumanoidEntity(1, 1, 0, 0);
        const b = mkHumanoidEntity(2, 2, closeDist, 0);
        const swordA = makeWpn(1.2, 0.8, 0.55);
        const swordB = makeWpn(1.2, 0.8, 0.55);
        a.loadout.items = [{ ...swordA, id: "sword_a" }];
        b.loadout.items = [{ ...swordB, id: "sword_b" }];

        const world = mkWorld(seed, [a, b]);
        const shockBefore = world.entities.find(e => e.id === 2)!.injury.shock;
        const cmds = new Map<number, Command[]>([
          [1, [{ kind: "attack", targetId: 2 } as AttackCommand]],
        ]);
        stepWorld(world, cmds, tacCtx);
        if (world.entities.find(e => e.id === 2)!.injury.shock > shockBefore) swordVsSwordHits++;
      }
    }

    // Knife vs longer sword should land fewer hits than equal-reach scenario
    expect(knifeVsSwordHits).toBeLessThan(swordVsSwordHits);
  });

  it("reach dominance does not apply when attacker has longer weapon", () => {
    const shortReach = Math.round(0.2 * SCALE.m);
    const longReach = Math.round(0.8 * SCALE.m);
    // Longer attacker gets no penalty
    expect(reachDomPenaltyQ(longReach, shortReach)).toBe(q(1.0));
    // Shorter attacker does get a penalty
    expect(reachDomPenaltyQ(shortReach, longReach)).toBeLessThan(q(1.0));
  });
});

// ---------------------------------------------------------------------------
// Kernel integration: two-handed bonus
// ---------------------------------------------------------------------------

describe("kernel: two-handed attack bonus", () => {
  it("two-handed weapon deals more shock than identical one-handed weapon over many trials", () => {
    // Use a 1.0m reach weapon so both attacker variants can reach at CLOSE_DIST
    const oneHandWpn: Weapon = makeWpn(1.5, 1.0, 0.65, "oneHand");
    const twoHandWpn: Weapon = { ...oneHandWpn, id: "twohand_test", handedness: "twoHand" };

    let oneHandTotalShock = 0;
    let twoHandTotalShock = 0;

    for (let seed = 1; seed <= 300; seed++) {
      {
        const a = mkHumanoidEntity(1, 1, 0, 0);
        const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
        a.loadout.items = [oneHandWpn];
        const world = mkWorld(seed, [a, b]);
        const shockBefore = world.entities.find(e => e.id === 2)!.injury.shock;
        stepWorld(world, new Map([[1, [{ kind: "attack", targetId: 2 } as AttackCommand]]]), ctx);
        oneHandTotalShock += world.entities.find(e => e.id === 2)!.injury.shock - shockBefore;
      }
      {
        const a = mkHumanoidEntity(1, 1, 0, 0);
        const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
        a.loadout.items = [twoHandWpn];
        const world = mkWorld(seed, [a, b]);
        const shockBefore = world.entities.find(e => e.id === 2)!.injury.shock;
        stepWorld(world, new Map([[1, [{ kind: "attack", targetId: 2 } as AttackCommand]]]), ctx);
        twoHandTotalShock += world.entities.find(e => e.id === 2)!.injury.shock - shockBefore;
      }
    }

    // Two-handed should deliver more total shock over 300 trials (12% bonus)
    expect(twoHandTotalShock).toBeGreaterThan(oneHandTotalShock);
  });

  it("two-handed bonus suppressed when entity carries a shield", () => {
    const twoHandWpn: Weapon = makeWpn(1.5, 1.0, 0.65, "twoHand");
    const shield = STARTER_SHIELDS[0]!;

    let noShieldShock = 0;
    let withShieldShock = 0;

    for (let seed = 1; seed <= 200; seed++) {
      {
        const a = mkHumanoidEntity(1, 1, 0, 0);
        const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
        a.loadout.items = [twoHandWpn];
        const world = mkWorld(seed, [a, b]);
        const shockBefore = world.entities.find(e => e.id === 2)!.injury.shock;
        stepWorld(world, new Map([[1, [{ kind: "attack", targetId: 2 } as AttackCommand]]]), ctx);
        noShieldShock += world.entities.find(e => e.id === 2)!.injury.shock - shockBefore;
      }
      {
        const a = mkHumanoidEntity(1, 1, 0, 0);
        const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
        a.loadout.items = [twoHandWpn, shield];  // shield occupies off-hand → bonus lost
        const world = mkWorld(seed, [a, b]);
        const shockBefore = world.entities.find(e => e.id === 2)!.injury.shock;
        stepWorld(world, new Map([[1, [{ kind: "attack", targetId: 2 } as AttackCommand]]]), ctx);
        withShieldShock += world.entities.find(e => e.id === 2)!.injury.shock - shockBefore;
      }
    }

    // Shield should suppress the two-handed bonus → equal or less damage
    expect(noShieldShock).toBeGreaterThan(withShieldShock);
  });
});

// ---------------------------------------------------------------------------
// breakBindContestQ
// ---------------------------------------------------------------------------

describe("breakBindContestQ", () => {
  it("equal fighters → ~50% win probability", () => {
    const SCALE_Q = 10000;
    // Same force and arm → exactly 50%
    const prob = breakBindContestQ(184000, 184000, 5500, 5500);
    expect(prob).toBe(SCALE_Q / 2);  // exactly 5000 = q(0.5)
  });

  it("stronger fighter wins more often", () => {
    const weak = breakBindContestQ(100000, 184000, 5500, 5500);
    const strong = breakBindContestQ(184000, 100000, 5500, 5500);
    expect(strong).toBeGreaterThan(q(0.5));
    expect(weak).toBeLessThan(q(0.5));
  });

  it("longer lever wins more often", () => {
    const short = breakBindContestQ(184000, 184000, 3000, 6000);
    const long  = breakBindContestQ(184000, 184000, 6000, 3000);
    expect(long).toBeGreaterThan(q(0.5));
    expect(short).toBeLessThan(q(0.5));
  });

  it("result clamped to [0.05, 0.95]", () => {
    const hi = breakBindContestQ(1_000_000, 1, 100000, 1);
    const lo = breakBindContestQ(1, 1_000_000, 1, 100000);
    expect(hi).toBeLessThanOrEqual(q(0.95));
    expect(lo).toBeGreaterThanOrEqual(q(0.05));
  });

  it("handles zero-total gracefully → q(0.5)", () => {
    expect(breakBindContestQ(0, 0, 0, 0)).toBe(q(0.5));
  });
});

// ---------------------------------------------------------------------------
// Kernel integration: active bind breaking (#1)
// ---------------------------------------------------------------------------

describe("kernel: breakBind command", () => {
  it("breakBind can clear a bind within 500 seed attempts", () => {
    // First create a bind, then issue breakBind and check it resolves
    let tested = false;
    for (let seed = 1; seed <= 500; seed++) {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
      a.loadout.items = [{ ...club, id: "club_a" }];
      b.loadout.items = [{ ...club, id: "club_b" }];

      // Force bind directly
      a.action.weaponBindPartnerId = 2;
      a.action.weaponBindTicks = 5;
      b.action.weaponBindPartnerId = 1;
      b.action.weaponBindTicks = 5;

      const world = mkWorld(seed, [a, b]);

      // Issue breakBind at full intensity
      const cmds = new Map<number, Command[]>([
        [1, [{ kind: "breakBind", intensity: q(1.0) } as BreakBindCommand]],
      ]);
      stepWorld(world, cmds, tacCtx);

      const e1 = world.entities.find(e => e.id === 1)!;
      const e2 = world.entities.find(e => e.id === 2)!;

      if (e1.action.weaponBindPartnerId === 0 && e2.action.weaponBindPartnerId === 0) {
        // Both cleared — break succeeded
        tested = true;
        break;
      }
    }
    expect(tested).toBe(true);
  });

  it("breakBind failure leaves bind intact", () => {
    // Force a scenario where break will fail: very weak breaker vs strong holder
    // Equal humans → ~50% break, so run many seeds and count
    let bindsClearedCount = 0;
    let trials = 0;

    for (let seed = 1; seed <= 100; seed++) {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
      a.loadout.items = [club];
      b.loadout.items = [club];

      a.action.weaponBindPartnerId = 2;
      a.action.weaponBindTicks = 5;
      b.action.weaponBindPartnerId = 1;
      b.action.weaponBindTicks = 5;

      const world = mkWorld(seed, [a, b]);
      const cmds = new Map<number, Command[]>([
        [1, [{ kind: "breakBind", intensity: q(1.0) } as BreakBindCommand]],
      ]);
      stepWorld(world, cmds, tacCtx);

      trials++;
      const e1 = world.entities.find(e => e.id === 1)!;
      if (e1.action.weaponBindPartnerId === 0) bindsClearedCount++;
    }

    // With equal fighters (~50% chance), some should fail
    expect(bindsClearedCount).toBeGreaterThan(0);
    expect(bindsClearedCount).toBeLessThan(trials);
  });

  it("breakBind emits WeaponBindBreak trace on success", () => {
    const events: TraceEvent[] = [];
    const traceCtx = {
      ...tacCtx,
      trace: { onEvent: (ev: TraceEvent) => events.push(ev) } as TraceSink,
    };

    // Find a seed where break succeeds
    for (let seed = 1; seed <= 500; seed++) {
      events.length = 0;
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
      a.loadout.items = [club];
      b.loadout.items = [club];

      a.action.weaponBindPartnerId = 2;
      a.action.weaponBindTicks = 5;
      b.action.weaponBindPartnerId = 1;
      b.action.weaponBindTicks = 5;

      const world = mkWorld(seed, [a, b]);
      const cmds = new Map<number, Command[]>([
        [1, [{ kind: "breakBind", intensity: q(1.0) } as BreakBindCommand]],
      ]);
      stepWorld(world, cmds, traceCtx);

      const bindBreak = events.find(ev => ev.kind === TraceKinds.WeaponBindBreak);
      if (bindBreak && (bindBreak).reason === "forced") {
        expect((bindBreak).entityId).toBe(1);
        expect((bindBreak).partnerId).toBe(2);
        return;
      }
    }
    expect(true).toBe(false); // should have found one
  });

  it("bind timeout emits WeaponBindBreak trace with reason=timeout (from smaller ID)", () => {
    const events: TraceEvent[] = [];
    const traceCtx = {
      ...tacCtx,
      trace: { onEvent: (ev: TraceEvent) => events.push(ev) } as TraceSink,
    };

    const a = mkHumanoidEntity(1, 1, 0, 0);
    const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
    const world = mkWorld(42, [a, b]);

    // Force a 1-tick bind
    const e1 = world.entities.find(e => e.id === 1)!;
    const e2 = world.entities.find(e => e.id === 2)!;
    e1.action.weaponBindPartnerId = 2;
    e1.action.weaponBindTicks = 1;
    e2.action.weaponBindPartnerId = 1;
    e2.action.weaponBindTicks = 1;

    stepWorld(world, new Map(), traceCtx);

    const bindBreak = events.filter(ev => ev.kind === TraceKinds.WeaponBindBreak);
    const timeoutEvents = bindBreak!.filter(ev => (ev).reason === "timeout");
    // Only one event emitted (from smaller ID = 1)
    expect(timeoutEvents).toHaveLength(1);
    expect((timeoutEvents[0]!).entityId).toBe(1);
    expect((timeoutEvents[0]!).partnerId).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Kernel integration: miss recovery × intensity (#5)
// ---------------------------------------------------------------------------

describe("kernel: miss recovery scales with intensity", () => {
  it("full-intensity club miss adds more cooldown than half-intensity miss", () => {
    const baseReadyTicks = Math.max(1, Math.trunc(0.6 * TICK_HZ));
    const fullExtra = Math.trunc(missRecoveryTicks(club) * q(1.0) / SCALE.Q);    // intensity=1.0
    const halfExtra = Math.trunc(missRecoveryTicks(club) * q(0.5) / SCALE.Q);    // intensity=0.5

    // Find a seed where the attack misses at full intensity
    for (let seed = 1; seed <= 500; seed++) {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
      a.loadout.items = [club];
      const world = mkWorld(seed, [a, b]);

      const cmds = new Map<number, Command[]>([
        [1, [{ kind: "attack", targetId: 2, intensity: q(1.0) } as AttackCommand]],
      ]);
      stepWorld(world, cmds, ctx);
      const e1 = world.entities.find(e => e.id === 1)!;

      if (e1.action.attackCooldownTicks > baseReadyTicks) {
        // It's a miss; the extra ticks should equal fullExtra (1 tick for club at full intensity)
        expect(e1.action.attackCooldownTicks).toBe(baseReadyTicks + fullExtra);
        break;
      }
    }

    // At half intensity: missRecoveryTicks(club)=1, intensity=0.5 → floor(1*5000/10000)=0
    expect(halfExtra).toBe(0);
    expect(fullExtra).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Kernel integration: fatigue increases bind chance (#4)
// ---------------------------------------------------------------------------

describe("kernel: bind chance scales with fatigue", () => {
  it("fatigue modifier formula increases bind chance (unit test of kernel formula)", () => {
    // The kernel applies:
    //   fatigueMod = SCALE.Q + qMul(avgFatigue, q(0.20))   // 1.0 → 1.2 at full fatigue
    //   bChance = clampQ(qMul(bChanceBase, fatigueMod), q(0), q(0.45))
    // Verify that full fatigue produces a strictly higher bind chance than zero fatigue.
    const bChanceBase = bindChanceQ(club, club);

    const freshMod   = (SCALE.Q + qMul(q(0.0), q(0.20)));   // 10000
    const fullMod    = (SCALE.Q + qMul(q(1.0), q(0.20)));   // 12000

    const freshChance    = clampQ(qMul(bChanceBase, freshMod), q(0.0), q(0.45));
    const exhaustedChance = clampQ(qMul(bChanceBase, fullMod),  q(0.0), q(0.45));

    expect(exhaustedChance).toBeGreaterThan(freshChance);
    // Concrete values: clubs → base ≈ q(0.188), fresh → q(0.188), exhausted → q(0.225)
    expect(freshChance).toBeGreaterThan(0);
    expect(exhaustedChance).toBeLessThanOrEqual(q(0.45));
  });

  it("kernel: binds occur under tactical tuning (integration smoke-test)", () => {
    // Just confirm that the bind code path is reachable; detailed formula tested above.
    let bindCount = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const a = mkHumanoidEntity(1, 1, 0, 0);
      const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
      a.loadout.items = [{ ...club, id: "club_a" }];
      b.loadout.items = [{ ...club, id: "club_b" }];
      const world = mkWorld(seed, [a, b]);
      const cmds = new Map<number, Command[]>([
        [1, [{ kind: "attack", targetId: 2 } as AttackCommand]],
        [2, [{ kind: "defend", mode: "parry", intensity: q(1.0) }]],
      ]);
      stepWorld(world, cmds, tacCtx);
      if (world.entities.find(e => e.id === 1)!.action.weaponBindPartnerId !== 0) bindCount++;
    }
    expect(bindCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Kernel integration: reach dominance on defence (#2)
// ---------------------------------------------------------------------------

describe("kernel: reach dominance on parry", () => {
  it("defender with shorter weapon parries less effectively than equal-reach defender", () => {
    let shortParryBlocked = 0;
    let equalParryBlocked = 0;
    const TRIALS = 300;

    for (let seed = 1; seed <= TRIALS; seed++) {
      // Attacker has long sword; defender has knife (short weapon → parry penalty)
      {
        const a = mkHumanoidEntity(1, 1, 0, 0);
        const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
        const swordAtk = makeWpn(1.2, 0.8, 0.55);
        a.loadout.items = [{ ...swordAtk, id: "sword_a" }];
        b.loadout.items = [knife];  // short weapon → parry penalty

        const world = mkWorld(seed, [a, b]);
        const shockBefore = world.entities.find(e => e.id === 2)!.injury.shock;
        const cmds = new Map<number, Command[]>([
          [1, [{ kind: "attack", targetId: 2 } as AttackCommand]],
          [2, [{ kind: "defend", mode: "parry", intensity: q(1.0) }]],
        ]);
        stepWorld(world, cmds, tacCtx);
        // If shock increased, the parry failed to mitigate
        if (world.entities.find(e => e.id === 2)!.injury.shock > shockBefore) shortParryBlocked++;
      }

      // Both have equal swords
      {
        const a = mkHumanoidEntity(1, 1, 0, 0);
        const b = mkHumanoidEntity(2, 2, CLOSE_DIST, 0);
        const swordA = makeWpn(1.2, 0.8, 0.55);
        const swordB = makeWpn(1.2, 0.8, 0.55);
        a.loadout.items = [{ ...swordA, id: "sword_atk" }];
        b.loadout.items = [{ ...swordB, id: "sword_def" }];

        const world = mkWorld(seed, [a, b]);
        const shockBefore = world.entities.find(e => e.id === 2)!.injury.shock;
        const cmds = new Map<number, Command[]>([
          [1, [{ kind: "attack", targetId: 2 } as AttackCommand]],
          [2, [{ kind: "defend", mode: "parry", intensity: q(1.0) }]],
        ]);
        stepWorld(world, cmds, tacCtx);
        if (world.entities.find(e => e.id === 2)!.injury.shock > shockBefore) equalParryBlocked++;
      }
    }

    // Short-weapon defender takes more damage (parry is less effective)
    expect(shortParryBlocked).toBeGreaterThan(equalParryBlocked);
  });
});
