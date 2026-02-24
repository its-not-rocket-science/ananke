// test/skills.test.ts — Phase 7: Skill System tests
import { describe, it, expect } from "vitest";
import { q, SCALE, to, type Q } from "../src/units";
import {
  buildSkillMap,
  getSkill,
  defaultSkillLevel,
  combineSkillLevels,
  SKILL_IDS,
} from "../src/sim/skills";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { STARTER_WEAPONS, STARTER_RANGED_WEAPONS, STARTER_SHIELDS } from "../src/equipment";
import { TraceKinds } from "../src/sim/kinds";
import type { TraceEvent } from "../src/sim/trace";
import { grappleContestScore } from "../src/sim/grapple";
import { deriveFunctionalState } from "../src/sim/impairment";
import { TUNING } from "../src/sim/tuning";
import { canDetect, DEFAULT_SENSORY_ENV } from "../src/sim/sensory";
import { decideCommandsForEntity } from "../src/sim/ai/decide";
import { buildWorldIndex } from "../src/sim/indexing";
import { buildSpatialIndex } from "../src/sim/spatial";
import type { AIPolicy } from "../src/sim/ai/types";

const CELL = Math.trunc(4 * SCALE.m);
const CTX = { tractionCoeff: q(0.80), cellSize_m: CELL };

const MELEE_POLICY: AIPolicy = {
  archetype: "lineInfantry",
  desiredRange_m: Math.trunc(0.5 * SCALE.m),
  engageRange_m: Math.trunc(1.0 * SCALE.m),
  retreatRange_m: Math.trunc(0.2 * SCALE.m),
  threatRange_m: Math.trunc(2.0 * SCALE.m),
  defendWhenThreatenedQ: q(0.6),
  parryBiasQ: q(0.6),
  dodgeBiasQ: q(0.2),
  retargetCooldownTicks: 5,
  focusStickinessQ: q(0.7),
};

// ========================
// UNIT TESTS — pure funcs
// ========================

describe("buildSkillMap / getSkill", () => {
  it("getSkill returns neutral defaults for undefined map", () => {
    const d = getSkill(undefined, "meleeCombat");
    expect(d).toEqual(defaultSkillLevel());
  });

  it("getSkill returns neutral defaults for missing skill id", () => {
    const map = buildSkillMap({ grappling: { energyTransferMul: q(1.5) } });
    expect(getSkill(map, "meleeCombat")).toEqual(defaultSkillLevel());
  });

  it("buildSkillMap stores the provided values with neutral defaults for unspecified fields", () => {
    const map = buildSkillMap({ meleeCombat: { hitTimingOffset_s: -to.s(0.3) } });
    const sk = getSkill(map, "meleeCombat");
    expect(sk.hitTimingOffset_s).toBe(-to.s(0.3));
    // Unspecified fields remain neutral
    expect(sk.energyTransferMul).toBe(q(1.0));
    expect(sk.dispersionMul).toBe(q(1.0));
    expect(sk.fatigueRateMul).toBe(q(1.0));
  });

  it("SKILL_IDS contains all 10 domains", () => {
    expect(SKILL_IDS.length).toBe(10);
  });

  it("buildSkillMap handles multiple skills simultaneously", () => {
    const map = buildSkillMap({
      meleeCombat: { energyTransferMul: q(1.4) },
      rangedCombat: { dispersionMul: q(0.5) },
    });
    expect(getSkill(map, "meleeCombat").energyTransferMul).toBe(q(1.4));
    expect(getSkill(map, "rangedCombat").dispersionMul).toBe(q(0.5));
    expect(getSkill(map, "grappling").energyTransferMul).toBe(q(1.0)); // unset
  });
});

describe("combineSkillLevels", () => {
  it("two neutral levels produce a neutral level", () => {
    const d = defaultSkillLevel();
    expect(combineSkillLevels(d, d)).toEqual(d);
  });

  it("hitTimingOffset_s is additive", () => {
    const a = { ...defaultSkillLevel(), hitTimingOffset_s: -to.s(0.2) };
    const b = { ...defaultSkillLevel(), hitTimingOffset_s: -to.s(0.1) };
    expect(combineSkillLevels(a, b).hitTimingOffset_s).toBe(-to.s(0.3));
  });

  it("Q multipliers combine multiplicatively", () => {
    const a = { ...defaultSkillLevel(), energyTransferMul: q(1.2), dispersionMul: q(0.8) };
    const b = { ...defaultSkillLevel(), energyTransferMul: q(1.2), dispersionMul: q(0.8) };
    const c = combineSkillLevels(a, b);
    // q(1.2) × q(1.2) = trunc(12000 * 12000 / 10000) = trunc(14400000/10000) = 14400 ≈ q(1.44)
    expect(c.energyTransferMul).toBe(Math.trunc(12000 * 12000 / 10_000));
    // q(0.8) × q(0.8) = trunc(8000 * 8000 / 10000) = 6400 = q(0.64)
    expect(c.dispersionMul).toBe(Math.trunc(8000 * 8000 / 10_000));
  });

  it("host can express synergy: meleeCombat + athleticism bonus reduces fatigueRateMul", () => {
    const baseMelee = buildSkillMap({ meleeCombat: { energyTransferMul: q(1.3) } });
    const synergyBonus = { ...defaultSkillLevel(), fatigueRateMul: q(0.9) };
    const combined = combineSkillLevels(getSkill(baseMelee, "meleeCombat"), synergyBonus);
    // energyTransferMul unchanged (synergyBonus has neutral q(1.0))
    expect(combined.energyTransferMul).toBe(q(1.3));
    // fatigueRateMul now q(0.9) (was neutral q(1.0))
    expect(combined.fatigueRateMul).toBe(q(0.9));
  });
});

// ========================
// INTEGRATION TESTS
// ========================

describe("meleeCombat skill", () => {
  const sword = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!;
  // Longsword readyTime_s = to.s(0.75) = 7500 → cooldown = 7500*20/10000 = 15 ticks
  // With hitTimingOffset_s = -to.s(0.3): effective = max(7500/3, 7500-3000) = 4500 → 9 ticks

  it("hitTimingOffset_s reduces attack cooldown ticks", () => {
    function cooldownAfterAttack(withSkill: boolean): number {
      const attacker = mkHumanoidEntity(1, 1, 0, 0);
      attacker.loadout.items = [sword];
      if (withSkill) attacker.skills = buildSkillMap({ meleeCombat: { hitTimingOffset_s: -to.s(0.3) } });
      const target = mkHumanoidEntity(2, 2, Math.trunc(0.3 * SCALE.m), 0);
      const world = mkWorld(1, [attacker, target]);
      const cmd = new Map([[1, [{ kind: "attack", targetId: 2, weaponId: sword.id, intensity: q(1.0) }]]]);
      stepWorld(world, cmd, CTX);
      return world.entities[0]!.action.attackCooldownTicks;
    }

    expect(cooldownAfterAttack(true)).toBeLessThan(cooldownAfterAttack(false));
  });

  it("energyTransferMul increases total damage dealt over many seeds", () => {
    function totalDamage(withSkill: boolean): number {
      let total = 0;
      for (let seed = 1; seed <= 100; seed++) {
        const attacker = mkHumanoidEntity(1, 1, 0, 0);
        attacker.loadout.items = [sword];
        if (withSkill) attacker.skills = buildSkillMap({ meleeCombat: { energyTransferMul: q(1.8) } });
        const target = mkHumanoidEntity(2, 2, Math.trunc(0.3 * SCALE.m), 0);
        const world = mkWorld(seed, [attacker, target]);
        const cmd = new Map([[1, [{ kind: "attack", targetId: 2, weaponId: sword.id, intensity: q(1.0) }]]]);
        stepWorld(world, cmd, CTX);
        const tgt = world.entities.find(e => e.id === 2)!;
        total += Object.values(tgt.injury.byRegion)
          .reduce((s: number, r: any) => s + r.surfaceDamage + r.internalDamage + r.structuralDamage, 0);
      }
      return total;
    }

    expect(totalDamage(true)).toBeGreaterThan(totalDamage(false));
  });
});

describe("meleeDefence skill", () => {
  const sword = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!;

  it("energyTransferMul reduces total damage received by a parrying defender over many seeds", () => {
    function totalDamageReceived(withSkill: boolean): number {
      let total = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const attacker = mkHumanoidEntity(1, 1, 0, 0);
        attacker.loadout.items = [sword];
        const defender = mkHumanoidEntity(2, 2, Math.trunc(0.3 * SCALE.m), 0);
        if (withSkill) defender.skills = buildSkillMap({ meleeDefence: { energyTransferMul: q(2.0) } });
        const world = mkWorld(seed, [attacker, defender]);
        const cmds = new Map([
          [1, [{ kind: "attack", targetId: 2, weaponId: sword.id, intensity: q(1.0) }]],
          [2, [{ kind: "defend", mode: "parry", intensity: q(1.0) }]],
        ]);
        stepWorld(world, cmds, CTX);
        const tgt = world.entities.find(e => e.id === 2)!;
        total += Object.values(tgt.injury.byRegion)
          .reduce((s: number, r: any) => s + r.surfaceDamage + r.internalDamage + r.structuralDamage, 0);
      }
      return total;
    }

    expect(totalDamageReceived(true)).toBeLessThan(totalDamageReceived(false));
  });
});

describe("grappling skill", () => {
  it("energyTransferMul boosts grapple contest score", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const tuning = TUNING.tactical;
    const func = deriveFunctionalState(e, tuning);

    const baseScore = grappleContestScore(e, func);

    e.skills = buildSkillMap({ grappling: { energyTransferMul: q(1.5) } });
    const skilledScore = grappleContestScore(e, func);

    expect(skilledScore).toBeGreaterThan(baseScore);
  });

  it("skilled grappler wins more contests against unskilled opponent over many seeds", () => {
    function countWins(withSkill: boolean): number {
      let wins = 0;
      for (let seed = 1; seed <= 100; seed++) {
        const attacker = mkHumanoidEntity(1, 1, 0, 0);
        if (withSkill) attacker.skills = buildSkillMap({ grappling: { energyTransferMul: q(1.8) } });
        const target = mkHumanoidEntity(2, 2, Math.trunc(0.5 * SCALE.m), 0);
        const world = mkWorld(seed, [attacker, target]);
        const cmd = new Map([[1, [{ kind: "grapple", targetId: 2, intensity: q(1.0) }]]]);
        stepWorld(world, cmd, CTX);
        if (world.entities[0]!.grapple.holdingTargetId === 2) wins++;
      }
      return wins;
    }

    expect(countWins(true)).toBeGreaterThan(countWins(false));
  });
});

describe("rangedCombat skill", () => {
  const shortbow = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_shortbow")!;

  it("dispersionMul increases hit count at range over many seeds", () => {
    function countHits(withSkill: boolean): number {
      let hits = 0;
      for (let seed = 1; seed <= 100; seed++) {
        const shooter = mkHumanoidEntity(1, 1, 0, 0);
        shooter.loadout.items = [shortbow];
        if (withSkill) shooter.skills = buildSkillMap({ rangedCombat: { dispersionMul: q(0.1) } });
        const target = mkHumanoidEntity(2, 2, to.m(30), 0); // 30 m away — moderate range
        const world = mkWorld(seed, [shooter, target]);
        const events: TraceEvent[] = [];
        stepWorld(world, new Map([[1, [{ kind: "shoot", targetId: 2, intensity: q(1.0) }]]]),
          { ...CTX, trace: { onEvent: e => events.push(e) } });
        const ev = events.find(e => e.kind === TraceKinds.ProjectileHit) as any;
        if (ev?.hit) hits++;
      }
      return hits;
    }

    expect(countHits(true)).toBeGreaterThan(countHits(false));
  });
});

describe("throwingWeapons skill", () => {
  const sling = STARTER_RANGED_WEAPONS.find(w => w.id === "rng_sling")!;

  it("energyTransferMul increases energyAtImpact for thrown weapons", () => {
    function energyAtImpact(withSkill: boolean): number {
      const shooter = mkHumanoidEntity(1, 1, 0, 0);
      shooter.loadout.items = [sling];
      if (withSkill) shooter.skills = buildSkillMap({ throwingWeapons: { energyTransferMul: q(2.0) } });
      const target = mkHumanoidEntity(2, 2, to.m(10), 0);
      const world = mkWorld(1, [shooter, target]);
      const events: TraceEvent[] = [];
      stepWorld(world, new Map([[1, [{ kind: "shoot", targetId: 2, intensity: q(1.0) }]]]),
        { ...CTX, trace: { onEvent: e => events.push(e) } });
      const ev = events.find(e => e.kind === TraceKinds.ProjectileHit) as any;
      return ev?.energyAtImpact_J ?? 0;
    }

    expect(energyAtImpact(true)).toBeGreaterThan(energyAtImpact(false));
  });
});

describe("shieldCraft skill", () => {
  const sword = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!;
  const shield = STARTER_SHIELDS.find(s => s.id === "shd_small")!;

  it("energyTransferMul reduces total damage received by a blocker with shield over many seeds", () => {
    function totalDamageReceived(withSkill: boolean): number {
      let total = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const attacker = mkHumanoidEntity(1, 1, 0, 0);
        attacker.loadout.items = [sword];
        const defender = mkHumanoidEntity(2, 2, Math.trunc(0.3 * SCALE.m), 0);
        defender.loadout.items = [shield];
        if (withSkill) defender.skills = buildSkillMap({ shieldCraft: { energyTransferMul: q(2.0) } });
        const world = mkWorld(seed, [attacker, defender]);
        const cmds = new Map([
          [1, [{ kind: "attack", targetId: 2, weaponId: sword.id, intensity: q(1.0) }]],
          [2, [{ kind: "defend", mode: "block", intensity: q(1.0) }]],
        ]);
        stepWorld(world, cmds, CTX);
        const tgt = world.entities.find(e => e.id === 2)!;
        total += Object.values(tgt.injury.byRegion)
          .reduce((s: number, r: any) => s + r.surfaceDamage + r.internalDamage + r.structuralDamage, 0);
      }
      return total;
    }

    expect(totalDamageReceived(true)).toBeLessThan(totalDamageReceived(false));
  });
});

describe("medical skill", () => {
  it("treatmentRateMul reduces fluid loss from bleeding over 20 ticks", () => {
    function fluidLossAfter20(withSkill: boolean): number {
      const e = mkHumanoidEntity(1, 1, 0, 0);
      // Inject heavy bleeding directly
      e.injury.byRegion["torso"]!.bleedingRate = q(0.50) as any;
      if (withSkill) e.skills = buildSkillMap({ medical: { treatmentRateMul: q(4.0) } });
      const world = mkWorld(1, [e]);
      for (let i = 0; i < 20; i++) {
        stepWorld(world, new Map(), CTX);
        if (world.entities[0]!.injury.dead) break;
      }
      return world.entities[0]!.injury.fluidLoss;
    }

    expect(fluidLossAfter20(true)).toBeLessThan(fluidLossAfter20(false));
  });
});

describe("athleticism skill", () => {
  it("fatigueRateMul reduces fatigue accumulation while sprinting over 60 ticks", () => {
    function fatigueAfterSprint(withSkill: boolean): number {
      const e = mkHumanoidEntity(1, 1, 0, 0);
      // Shrink reserve so per-tick drain fraction is large enough to register in fixed-point
      // (default 20 000 J reserve → stepFrac_Q ≈ 1 → qMul rounds to 0 each tick).
      // With 100 J reserve and 0 continuous power all demand becomes excess, stepFrac_Q >> 10.
      e.attributes.performance.reserveEnergy_J = 100;
      e.attributes.performance.continuousPower_W = 0;
      e.energy.reserveEnergy_J = 100;
      if (withSkill) e.skills = buildSkillMap({ athleticism: { fatigueRateMul: q(0.2) } });
      const world = mkWorld(1, [e]);
      const sprint = [{ kind: "move", dir: { x: SCALE.Q, y: 0, z: 0 }, intensity: q(1.0), mode: "sprint" }];
      for (let i = 0; i < 60; i++) {
        stepWorld(world, new Map([[1, sprint]]), CTX);
      }
      return world.entities[0]!.energy.fatigue;
    }

    expect(fatigueAfterSprint(true)).toBeLessThan(fatigueAfterSprint(false));
  });
});

describe("tactics skill", () => {
  it("hitTimingOffset_s reduces AI decision cooldown ticks", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0); // no skill
    const e2 = mkHumanoidEntity(2, 1, 0, 0); // with tactics
    e2.skills = buildSkillMap({ tactics: { hitTimingOffset_s: -to.s(0.3) } });

    const enemy = mkHumanoidEntity(9, 2, to.m(5), 0);
    const world = mkWorld(1, [e1, e2, enemy]);
    const index = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, CELL);

    decideCommandsForEntity(world, index, spatial, e1, MELEE_POLICY);
    decideCommandsForEntity(world, index, spatial, e2, MELEE_POLICY);

    // Human default: latencyTicks = max(1, 5000*20/10000) = 10
    // With -to.s(0.3)=-3000: effective = max(5000/2, 5000-3000) = max(2500,2000) = 2500 → 5 ticks
    expect(e2.ai!.decisionCooldownTicks).toBeLessThan(e1.ai!.decisionCooldownTicks);
  });
});

describe("stealth skill", () => {
  it("dispersionMul reduces acoustic signature — entity not heard at range that would normally trigger hearing detection", () => {
    // Place subject 10m behind observer (outside vision arc → only hearing applies).
    // Default hearingRange_m = 50m → 10m should be detectable.
    // With stealth dispersionMul = q(0.1): effectiveHearing = 5m → 10m > 5m → not detected.
    const observer = mkHumanoidEntity(1, 1, 0, 0);          // faces +x (default)
    const subject  = mkHumanoidEntity(2, 2, -to.m(10), 0);  // 10m behind → outside vision arc

    // Without stealth: subject is heard (10m < 50m hearing range)
    expect(canDetect(observer, subject, DEFAULT_SENSORY_ENV)).toBe(q(0.4));

    // With stealth q(0.1): effectiveHearing = 50m × 0.1 = 5m < 10m → not detected
    subject.skills = buildSkillMap({ stealth: { dispersionMul: q(0.1) } });
    expect(canDetect(observer, subject, DEFAULT_SENSORY_ENV)).toBe(q(0));
  });

  it("stealth does not affect vision detection (skill only reduces acoustic signature)", () => {
    // Subject directly in front of observer at 5m (within vision range)
    const observer = mkHumanoidEntity(1, 1, 0, 0);
    const subject  = mkHumanoidEntity(2, 2, to.m(5), 0); // 5m ahead, within 200m vision
    subject.skills = buildSkillMap({ stealth: { dispersionMul: q(0.01) } });

    // Still fully visible despite maximum stealth
    expect(canDetect(observer, subject, DEFAULT_SENSORY_ENV)).toBe(q(1.0));
  });
});
