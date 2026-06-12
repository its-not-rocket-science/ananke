import type { WorldState } from "../world.js";
import { type Entity } from "../entity.js";
import type { AttackCommand } from "../commands.js";
import type { KernelContext } from "../context.js";

import { SCALE, q, clampQ, qMul, mulDiv, to, type Q, type I32 } from "../../units.js";
import { DamageChannel } from "../../channels.js";
import { deriveArmourProfile, findWeapon, findShield, findExoskeleton, findSensor, type Weapon, type Shield } from "../../equipment.js";

import { deriveFunctionalState } from "../impairment.js";
import { type SimulationTuning } from "../tuning.js";
import { type Vec3 } from "../vec3.js";
import { resolveHit, shieldCovers, type HitArea } from "../combat.js";
import { normaliseDirCheapQ, dotDirQ } from "../vec3.js";
import { eventSeed } from "../seeds.js";
import { elevationAtPosition } from "../terrain.js";
import { CORE_TEMP_NORMAL_Q, deriveTempModifiers } from "../thermoregulation.js";
import { getSkill } from "../skills.js";
import { TICK_HZ } from "../tick.js";

import { parryLeverageQ } from "../combat.js";

import {
  reachDomPenaltyQ,
  twoHandedAttackBonusQ,
  missRecoveryTicks,
  bindChanceQ,
  bindDurationTicks,
} from "../weapon_dynamics.js";

import { type ImpactEvent } from "../events.js";
import type { TraceSink } from "../trace.js";
import { TraceKinds } from "../kinds.js";
import { type SensoryEnvironment, DEFAULT_SENSORY_ENV, canDetect } from "../sensory.js";
import { FEAR_SURPRISE, painBlocksAction } from "../morale.js";
import type { SpatialIndex } from "../spatial.js";
import type { WorldIndex } from "../indexing.js";
import { isMeleeLaneOccludedByFriendly } from "../occlusion.js";

export type HitSegmentId = string;

const SWING_MOMENTUM_MAX = q(0.12) as Q;

type ResolveAttackOptions = {
  world: WorldState;
  attacker: Entity;
  cmd: AttackCommand;
  tuning: SimulationTuning;
  index: WorldIndex;
  impacts: ImpactEvent[];
  spatial: SpatialIndex;
  trace: TraceSink;
  ctx: KernelContext;
  resolveTargetHitSegment: (target: Entity, roll01: Q, sideBit: 0 | 1, fallbackArea?: HitArea) => HitSegmentId;
  regionCoverageQ: (coverageByRegion: Record<string, Q>, segmentId: HitSegmentId) => Q;
  shieldBlocksSegment: (shield: Shield | undefined, target: Entity, segmentId: HitSegmentId, area: HitArea | undefined) => boolean;
  armourCoversHit: (world: WorldState, coverage: Q, aId: number, bId: number) => boolean;
};

export function resolveAttack(options: ResolveAttackOptions): void {
  const { world, attacker, cmd, tuning, index, impacts, spatial, trace, ctx, resolveTargetHitSegment, regionCoverageQ, shieldBlocksSegment, armourCoversHit } = options;
  if (attacker.action.attackCooldownTicks > 0) return;
  if (attacker.action.weaponBindPartnerId !== 0) return;

  const target = index.byId.get(cmd.targetId);
  if (!target || target.injury.dead) return;

  const funcA = deriveFunctionalState(attacker, tuning);
  const funcB = deriveFunctionalState(target, tuning);

  if (!funcA.canAct) return;

  if (tuning.realism !== "arcade") {
    const painSeed = eventSeed(world.seed, world.tick, attacker.id, target.id, 0xA77A2);
    if (painBlocksAction(painSeed, attacker.injury.shock, attacker.attributes.resilience.distressTolerance)) return;
  }

  const wpn = findWeapon(attacker.loadout, cmd.weaponId);
  if (!wpn) return;

  const reach_m = wpn.reach_m ?? Math.trunc(attacker.attributes.morphology.stature_m * 0.45);
  const dx = target.position_m.x - attacker.position_m.x;
  const dy = target.position_m.y - attacker.position_m.y;
  const dz = target.position_m.z - attacker.position_m.z;

  const cellSizeA = ctx.cellSize_m ?? Math.trunc(4 * SCALE.m);
  const elevA = elevationAtPosition(ctx.elevationGrid, cellSizeA, attacker.position_m.x, attacker.position_m.y);
  const elevT = elevationAtPosition(ctx.elevationGrid, cellSizeA, target.position_m.x, target.position_m.y);
  const dzWithElev = dz + (elevT - elevA);

  const dist2 = BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy) + BigInt(dzWithElev) * BigInt(dzWithElev);
  const reach2 = BigInt(reach_m) * BigInt(reach_m);
  if (dist2 > reach2) return;

  if (tuning.realism !== "arcade") {
    const blocked = isMeleeLaneOccludedByFriendly(
      world,
      attacker,
      target,
      index,
      spatial,
      { laneRadius_m: Math.trunc(0.35 * SCALE.m) }
    );
    if (blocked) return;
  }

  const dirToTarget = normaliseDirCheapQ({ x: dx, y: dy, z: dz });

  const readyTime_s = wpn.readyTime_s ?? to.s(0.6);
  const attackerMeleeSkill = getSkill(attacker.skills, "meleeCombat");
  const effectiveReadyTime = Math.max(
    Math.trunc(readyTime_s / 3),
    readyTime_s + attackerMeleeSkill.hitTimingOffset_s,
  );
  attacker.action.attackCooldownTicks = Math.max(1, Math.trunc((effectiveReadyTime * TICK_HZ) / SCALE.s));

  const clampedIntensity = clampQ(cmd.intensity ?? q(1.0), q(0.1), q(1.0));
  attacker.energy.reserveEnergy_J = Math.max(
    0,
    attacker.energy.reserveEnergy_J - strikeCost_J(attacker, clampedIntensity)
  );

  const attackSkillBase = clampQ(qMul(attacker.attributes.control.controlQuality, attacker.attributes.control.fineControl), q(0.05), q(0.99));
  let attackSkill = clampQ(qMul(attackSkillBase, qMul(funcA.coordinationMul, funcA.manipulationMul)), q(0.01), q(0.99));
  const defenceSkillBase = clampQ(qMul(target.attributes.control.controlQuality, target.attributes.control.stability), q(0.05), q(0.99));
  let defenceSkill = clampQ(qMul(defenceSkillBase, qMul(funcB.coordinationMul, funcB.mobilityMul)), q(0.01), q(0.99));
  const geomDot = dotDirQ(attacker.action.facingDirQ, dirToTarget);

  const grappling = attacker.grapple.holdingTargetId === target.id;
  if (tuning.realism !== "arcade" && !target.condition.prone && !grappling) {
    const tgtWpn = findWeapon(target.loadout);
    if (tgtWpn) {
      const tgtReach_m = tgtWpn.reach_m ?? Math.trunc(target.attributes.morphology.stature_m * 0.45);
      const penalty = reachDomPenaltyQ(reach_m, tgtReach_m);
      attackSkill = clampQ(qMul(attackSkill, penalty), q(0.01), q(0.99));
    }
  }

  if (tuning.realism !== "arcade") {
    const elevDiff = elevA - elevT;
    if (elevDiff > to.m(0.5)) {
      const bonus = clampQ(mulDiv(elevDiff - to.m(0.5), q(0.05), to.m(1)), q(0), q(0.10));
      attackSkill = clampQ(qMul(attackSkill, (SCALE.Q + bonus) as Q), q(0.01), q(0.99));
    }
  }

  const defMeleeSkill = getSkill(target.skills, "meleeDefence");
  defenceSkill = clampQ(qMul(defenceSkill, defMeleeSkill.energyTransferMul), q(0.01), q(0.99));

  const defenceModeEffective = target.action.weaponBindPartnerId !== 0
    ? ("none" as const)
    : target.intent.defence.mode;
  let defenceIntensityEffective = target.action.weaponBindPartnerId !== 0
    ? q(0)
    : target.intent.defence.intensity;

  if (defenceModeEffective === "block") {
    const tgtShield = findShield(target.loadout);
    if (tgtShield) {
      const shieldSkill = getSkill(target.skills, "shieldCraft");
      defenceSkill = clampQ(qMul(defenceSkill, shieldSkill.energyTransferMul), q(0.01), q(0.99));
    }
  }

  if (tuning.realism !== "arcade") {
    const sEnv: SensoryEnvironment = world.runtimeState?.sensoryEnv ?? DEFAULT_SENSORY_ENV;
    const tgtSensor = findSensor(target.loadout);
    const tgtSensorBoost = tgtSensor
      ? { visionRangeMul: tgtSensor.visionRangeMul, hearingRangeMul: tgtSensor.hearingRangeMul }
      : undefined;
    const detectionQ = canDetect(target, attacker, sEnv, tgtSensorBoost);
    if (detectionQ <= 0) {
      defenceIntensityEffective = q(0);
      target.condition.fearQ = clampQ((target.condition.fearQ ?? 0) + FEAR_SURPRISE, 0, SCALE.Q);
    } else if (detectionQ < q(0.8)) {
      defenceIntensityEffective = qMul(defenceIntensityEffective, detectionQ);
    }
  }

  if (tuning.realism !== "arcade" && defenceModeEffective === "parry" && !grappling) {
    const defWpnReach = findWeapon(target.loadout);
    if (defWpnReach) {
      const defReach = defWpnReach.reach_m ?? Math.trunc(target.attributes.morphology.stature_m * 0.45);
      defenceSkill = clampQ(qMul(defenceSkill, reachDomPenaltyQ(defReach, reach_m)), q(0.01), q(0.99));
    }
  }

  const meleeBypassQ = (wpn).shieldBypassQ ?? 0;
  const defenceIntensityForHit = (meleeBypassQ > 0 && defenceModeEffective === "block")
    ? (qMul(defenceIntensityEffective, SCALE.Q - meleeBypassQ) as Q)
    : defenceIntensityEffective;

  const seed = eventSeed(world.seed, world.tick, attacker.id, target.id, 0xA11AC);
  const res = resolveHit(seed, attackSkill, defenceSkill, geomDot, defenceModeEffective, defenceIntensityForHit);

  trace.onEvent({
    kind: TraceKinds.AttackAttempt,
    tick: world.tick,
    attackerId: attacker.id,
    targetId: target.id,
    hit: res.hit,
    blocked: res.blocked,
    parried: res.parried,
    hitQuality: res.hitQuality,
    area: res.area,
  });

  if (!res.hit) {
    attacker.action.attackCooldownTicks += Math.trunc(mulDiv(missRecoveryTicks(wpn), clampedIntensity, SCALE.Q));
    attacker.action.swingMomentumQ = q(0);
    return;
  }

  const hitSeed = eventSeed(world.seed, world.tick, attacker.id, target.id, 0x51DE);
  const sideBit = (hitSeed & 1) as 0 | 1;

  const region: HitSegmentId = resolveTargetHitSegment(
    target,
    ((hitSeed >>> 8) % SCALE.Q) as Q,
    sideBit,
    res.area,
  );

  const defenderBlocking = (target.intent.defence.mode === "block");
  const shield = findShield(target.loadout);
  const shieldBlocked =
    res.hit &&
    res.blocked &&
    defenderBlocking &&
    !!shield &&
    shieldBlocksSegment(shield, target, region, res.area);

  const baseIntensity = clampQ(cmd.intensity ?? q(1.0), q(0.1), q(1.0));
  const handling = wpn.handlingMul ?? q(1.0);

  const handlingPenalty = clampQ(
    q(1.0) - qMul(q(0.18), (handling - SCALE.Q)),
    q(0.70),
    q(1.0)
  );

  const intensity = clampQ(
    qMul(baseIntensity, qMul(funcA.manipulationMul, handlingPenalty)),
    q(0.1),
    q(1.0)
  );

  const coreTempQ = ((attacker.condition).coreTemp_Q as Q | undefined) ?? CORE_TEMP_NORMAL_Q;
  const tempMods = deriveTempModifiers(coreTempQ);
  const P = Math.trunc(qMul(attacker.attributes.performance.peakPower_W, tempMods.powerMul));
  const base = clampI32(Math.trunc((P * SCALE.mps) / 200), Math.trunc(2 * SCALE.mps), Math.trunc(12 * SCALE.mps));

  const wMul = wpn.strikeSpeedMul ?? q(1.0);
  const cMul = attacker.attributes.control.controlQuality;
  const qualMul = q(0.70) + qMul(res.hitQuality, q(0.30));

  const vStrike = mulDiv(
    mulDiv(
      mulDiv(
        mulDiv(base, wMul, SCALE.Q),
        cMul,
        SCALE.Q
      ),
      intensity,
      SCALE.Q
    ),
    qualMul,
    SCALE.Q
  );

  const vStrikeVec = scaleDirToSpeed(dirToTarget, vStrike);

  const APPROACH_CAP: I32 = Math.trunc(2.0 * SCALE.mps);
  const bodyRelX = clampI32(attacker.velocity_mps.x - target.velocity_mps.x, -APPROACH_CAP, APPROACH_CAP);
  const bodyRelY = clampI32(attacker.velocity_mps.y - target.velocity_mps.y, -APPROACH_CAP, APPROACH_CAP);
  const bodyRelZ = clampI32(attacker.velocity_mps.z - target.velocity_mps.z, -APPROACH_CAP, APPROACH_CAP);

  const rel = {
    x: bodyRelX + vStrikeVec.x,
    y: bodyRelY + vStrikeVec.y,
    z: bodyRelZ + vStrikeVec.z,
  };

  const hasOffHand = attacker.loadout.items.some(it => it.kind === "shield") ||
    attacker.loadout.items.filter(it => it.kind === "weapon").length > 1;
  const twoHandBonus = twoHandedAttackBonusQ(wpn, funcA.leftArmDisabled, funcA.rightArmDisabled, hasOffHand);
  const baseEnergy_J = mulDiv(
    mulDiv((impactEnergy_J(attacker, wpn, rel)), funcA.manipulationMul, SCALE.Q),
    twoHandBonus,
    SCALE.Q,
  );
  const attackerExo = findExoskeleton(attacker.loadout);
  const exoForceMul: Q = attackerExo ? attackerExo.forceMultiplier : SCALE.Q as Q;
  let energy_J = mulDiv(mulDiv(baseEnergy_J, attackerMeleeSkill.energyTransferMul, SCALE.Q), exoForceMul, SCALE.Q);

  const momentumBonus_J = Math.trunc(qMul(energy_J, qMul(attacker.action.swingMomentumQ, SWING_MOMENTUM_MAX)));
  energy_J += momentumBonus_J;

  let mitigated = energy_J;

  if (res.blocked || res.parried) {
    target.energy.reserveEnergy_J = Math.max(
      0,
      target.energy.reserveEnergy_J - defenceCost_J(target)
    );

    const leverage = parryLeverageQ(wpn, attacker);
    const handed = (wpn.handedness ?? "oneHand") === "twoHand" ? q(1.10) : q(1.0);
    const defenceMul = qMul(leverage, handed);

    if (res.blocked) {
      const m = clampQ(
        q(0.40) - qMul(q(0.12), (defenceMul - SCALE.Q)),
        q(0.25),
        q(0.60)
      );
      mitigated = mulDiv(mitigated, m, SCALE.Q);
    }

    if (res.parried) {
      const m = clampQ(
        q(0.25) - qMul(q(0.15), (defenceMul - SCALE.Q)),
        q(0.10),
        q(0.45)
      );
      mitigated = mulDiv(mitigated, m, SCALE.Q);

      if (tuning.realism !== "arcade"
        && attacker.action.weaponBindPartnerId === 0
        && target.action.weaponBindPartnerId === 0) {
        const defWpn = findWeapon(target.loadout);
        if (defWpn) {
          const bindSeed = eventSeed(world.seed, world.tick, attacker.id, target.id, 0xB1DE);
          const bindRoll = (bindSeed % SCALE.Q) as Q;
          const bChanceBase = bindChanceQ(wpn, defWpn);
          const avgFatigue = ((attacker.energy.fatigue + target.energy.fatigue) >>> 1) as Q;
          const fatigueMod = (SCALE.Q + qMul(avgFatigue, q(0.20))) as Q;
          const bChance = clampQ(qMul(bChanceBase, fatigueMod), q(0), q(0.45));
          if (bindRoll < bChance) {
            const dur = bindDurationTicks(wpn, defWpn);
            attacker.action.weaponBindPartnerId = target.id;
            attacker.action.weaponBindTicks = dur;
            target.action.weaponBindPartnerId = attacker.id;
            target.action.weaponBindTicks = dur;
            trace.onEvent({
              kind: TraceKinds.WeaponBind,
              tick: world.tick,
              attackerId: attacker.id,
              targetId: target.id,
              durationTicks: dur,
            });
          }
        }
      }
    }

    if (res.shieldBlocked) {
      const m = clampQ(
        q(0.35) - qMul(q(0.10), (defenceMul - SCALE.Q)),
        q(0.20),
        q(0.55)
      );
      mitigated = mulDiv(mitigated, m, SCALE.Q);
    }
  }

  const armour = deriveArmourProfile(target.loadout, target.armourState);
  const isEnergyWeapon = !!(wpn).energyType;
  const CHANNEL_MASK = isEnergyWeapon ? (1 << DamageChannel.Energy) : (1 << DamageChannel.Kinetic);
  const armourHit = armourCoversHit(
    world,
    regionCoverageQ(armour.coverageByRegion, region),
    attacker.id,
    target.id,
  );
  const protectedByArmour = armourHit && ((armour.protects & CHANNEL_MASK) !== 0);

  let finalEnergy = mitigated;
  if (protectedByArmour) {
    if (isEnergyWeapon && armour.reflectivity > q(0)) {
      finalEnergy = mulDiv(finalEnergy, SCALE.Q - armour.reflectivity, SCALE.Q);
    } else if (!isEnergyWeapon) {
      finalEnergy = applyKineticArmourPenetration(mitigated, armour.resist_J, armour.protectedDamageMul);
    }
    if (target.armourState) {
      const armourItems = target.loadout.items.filter(it => it.kind === "armour");
      for (const it of armourItems) {
        if ((it).ablative && target.armourState.has(it.id)) {
          const st = target.armourState.get(it.id)!;
          st.resistRemaining_J = Math.max(0, st.resistRemaining_J - mitigated);
        }
      }
    }
  }

  const kbBodyMass = mulDiv(attacker.attributes.morphology.mass_kg, wpn.strikeEffectiveMassFrac ?? q(0.10), SCALE.Q);
  const kbMassEff = wpn.mass_kg + kbBodyMass;

  impacts.push({
    kind: "impact",
    attackerId: attacker.id,
    targetId: target.id,
    region,
    energy_J: finalEnergy,
    protectedByArmour,
    weaponId: wpn.id,
    wpn,
    blocked: res.blocked,
    parried: res.parried,
    hitQuality: clampQ(res.hitQuality, q(0.05), q(1.0)),
    shieldBlocked,
    massEff_kg: kbMassEff,
  });

  if (res.blocked || res.parried) {
    attacker.action.swingMomentumQ = q(0) as Q;
  } else {
    attacker.action.swingMomentumQ = clampQ(qMul(clampedIntensity, q(0.80)), q(0), SCALE.Q as Q) as Q;
  }
}

function strikeCost_J(attacker: Entity, intensity: Q): I32 {
  const base = Math.max(20, mulDiv(attacker.attributes.performance.peakPower_W, 4, 100));
  return Math.max(5, mulDiv(base, intensity, SCALE.Q));
}

function defenceCost_J(defender: Entity): I32 {
  return Math.max(5, mulDiv(defender.attributes.performance.peakPower_W, 25, 1000));
}

function applyKineticArmourPenetration(energy_J: number, resist_J: number, postMul: Q): number {
  const remaining = Math.max(0, energy_J - Math.max(0, resist_J));
  return mulDiv(remaining, postMul, SCALE.Q);
}

function impactEnergy_J(attacker: Entity, wpn: Weapon, relVel_mps: Vec3): number {
  const frac = wpn.strikeEffectiveMassFrac ?? q(0.10);
  const bodyEffMass = mulDiv(attacker.attributes.morphology.mass_kg, frac, SCALE.Q);
  const mEff = wpn.mass_kg + bodyEffMass;

  const vx = BigInt(relVel_mps.x);
  const vy = BigInt(relVel_mps.y);
  const vz = BigInt(relVel_mps.z);
  const v2 = vx * vx + vy * vy + vz * vz;

  const denom = 2n * BigInt(SCALE.kg) * BigInt(SCALE.mps) * BigInt(SCALE.mps);
  const num = BigInt(mEff) * v2;

  return Math.max(0, Number(num / denom));
}

function scaleDirToSpeed(dirQ: Vec3, speed_mps: I32): Vec3 {
  return {
    x: mulDiv(speed_mps, dirQ.x, SCALE.Q),
    y: mulDiv(speed_mps, dirQ.y, SCALE.Q),
    z: mulDiv(speed_mps, dirQ.z, SCALE.Q),
  };
}

function clampI32(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
