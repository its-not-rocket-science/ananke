import type { WorldState } from "./world";
import type { Entity } from "./entity";
import type { CommandMap, Command, AttackCommand } from "./commands";

import { SCALE, q, clampQ, qMul, mulDiv, to, type Q, type I32 } from "../units";
import { deriveMovementCaps, stepEnergyAndFatigue } from "../derive";
import { DamageChannel } from "../channels";
import { deriveArmourProfile, findWeapon, type Weapon } from "../equipment";
import { buildTraitProfile } from "../traits";

import { integratePos, type Vec3, v3 } from "./vec3";
import { defaultIntent } from "./intent";
import { defaultAction } from "./action";
import { eventSeed, normaliseDirCheapQ, dotDirQ, resolveHit, type HitArea } from "./combat";
import { regionFromHit, ALL_REGIONS, DEFAULT_REGION_WEIGHTS } from "./body";
import type { BodyRegion } from "./body";
import { totalBleedingRate, regionKOFactor } from "./injury";

export const TICK_HZ = 20;
export const DT_S: I32 = to.s(1 / TICK_HZ);

export interface KernelContext {
  tractionCoeff: Q;
}

export function stepWorld(world: WorldState, cmds: CommandMap, ctx: KernelContext): void {
  world.entities.sort((a, b) => a.id - b.id);

  for (const e of world.entities) {
    if (!(e as any).intent) (e as any).intent = defaultIntent();
    if (!(e as any).action) (e as any).action = defaultAction();
  }

  for (const e of world.entities) {
    e.action.attackCooldownTicks = Math.max(0, e.action.attackCooldownTicks - 1);
    e.action.defenceCooldownTicks = Math.max(0, e.action.defenceCooldownTicks - 1);
  }

  for (const e of world.entities) {
    if (e.injury.dead) continue;
    applyCommands(e, cmds.get(e.id) ?? []);
  }

  for (const e of world.entities) {
    const d = e.intent.move.dir;
    if (d.x !== 0 || d.y !== 0 || d.z !== 0) e.action.facingDirQ = normaliseDirCheapQ(d);
  }

  for (const e of world.entities) {
    if (e.injury.dead) continue;
    stepMovement(e, ctx);
  }

  for (const e of world.entities) {
    if (e.injury.dead) continue;
    const commands = cmds.get(e.id) ?? [];
    for (const c of commands) if (c.kind === "attack") resolveAttack(world, e, c);
  }

  for (const e of world.entities) {
    if (e.injury.dead) continue;
    stepConditionsToInjury(world, e);
    stepInjuryProgression(e);
    stepEnergy(e, ctx);
  }

  world.tick += 1;
}

function applyCommands(e: Entity, commands: readonly Command[]): void {
  e.intent.defence = { mode: "none", intensity: q(0) };

  for (const c of commands) {
    if (c.kind === "setProne") e.condition.prone = c.prone;
    else if (c.kind === "move") e.intent.move = { dir: c.dir, intensity: c.intensity, mode: c.mode };
    else if (c.kind === "defend") e.intent.defence = { mode: c.mode, intensity: clampQ(c.intensity, 0, SCALE.Q) };
  }
}

function stepMovement(e: Entity, ctx: KernelContext): void {
  const caps = deriveMovementCaps(e.attributes, e.loadout, { tractionCoeff: ctx.tractionCoeff });

  const vmax_mps = caps.maxSprintSpeed_mps;
  const amax_mps2 = caps.maxAcceleration_mps2;

  const controlMul = clampQ(q(1.0) - qMul(q(0.7), e.condition.stunned), q(0.1), q(1.0));
  const mobilityMul = e.condition.prone ? q(0.25) : q(1.0);

  const effVmax = mulDiv(vmax_mps, qMul(controlMul, mobilityMul) as number, SCALE.Q);
  const effAmax = mulDiv(amax_mps2, qMul(controlMul, mobilityMul) as number, SCALE.Q);

  const modeMul = e.intent.move.mode === "walk" ? q(0.40) : e.intent.move.mode === "run" ? q(0.70) : q(1.0);

  const dir = normaliseDirCheapQ(e.intent.move.dir);
  const intensity = clampQ(e.intent.move.intensity, 0, SCALE.Q);

  const vTargetMag = mulDiv(mulDiv(effVmax, intensity as number, SCALE.Q), modeMul as number, SCALE.Q);
  const targetVel = scaleDirToSpeed(dir, vTargetMag);

  e.velocity_mps = accelToward(e.velocity_mps, targetVel, effAmax);
  e.velocity_mps = clampSpeed(e.velocity_mps, effVmax);
  e.position_m = integratePos(e.position_m, e.velocity_mps, DT_S);
}

function scaleDirToSpeed(dirQ: Vec3, speed_mps: I32): Vec3 {
  return {
    x: mulDiv(speed_mps, dirQ.x, SCALE.Q),
    y: mulDiv(speed_mps, dirQ.y, SCALE.Q),
    z: mulDiv(speed_mps, dirQ.z, SCALE.Q),
  };
}

function accelToward(v: Vec3, target: Vec3, amax_mps2: I32): Vec3 {
  const maxDv = Math.trunc((amax_mps2 * DT_S) / SCALE.s);
  return {
    x: v.x + clampI32(target.x - v.x, -maxDv, maxDv),
    y: v.y + clampI32(target.y - v.y, -maxDv, maxDv),
    z: v.z + clampI32(target.z - v.z, -maxDv, maxDv),
  };
}

function clampSpeed(v: Vec3, vmax_mps: I32): Vec3 {
  return { x: clampI32(v.x, -vmax_mps, vmax_mps), y: clampI32(v.y, -vmax_mps, vmax_mps), z: clampI32(v.z, -vmax_mps, vmax_mps) };
}

function clampI32(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/* ------------------ Combat ------------------ */

function resolveAttack(world: WorldState, attacker: Entity, cmd: AttackCommand): void {
  if (attacker.action.attackCooldownTicks > 0) return;

  const target = world.entities.find(e => e.id === cmd.targetId);
  if (!target || target.injury.dead) return;

  const wpn = findWeapon(attacker.loadout, cmd.weaponId);
  if (!wpn) return;

  const reach_m = wpn.reach_m ?? Math.trunc(attacker.attributes.morphology.stature_m * 0.45);
  const dx = target.position_m.x - attacker.position_m.x;
  const dy = target.position_m.y - attacker.position_m.y;
  const dz = target.position_m.z - attacker.position_m.z;

  const dist2 = BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy) + BigInt(dz) * BigInt(dz);
  const reach2 = BigInt(reach_m) * BigInt(reach_m);
  if (dist2 > reach2) return;

  const dirToTarget = normaliseDirCheapQ({ x: dx, y: dy, z: dz });

  const readyTime_s = wpn.readyTime_s ?? to.s(0.6);
  attacker.action.attackCooldownTicks = Math.max(1, Math.trunc((readyTime_s * TICK_HZ) / SCALE.s));

  const attackSkill = clampQ(qMul(attacker.attributes.control.controlQuality, attacker.attributes.control.fineControl), q(0.05), q(0.99));
  const defenceSkill = clampQ(qMul(target.attributes.control.controlQuality, target.attributes.control.stability), q(0.05), q(0.99));
  const geomDot = dotDirQ(attacker.action.facingDirQ, dirToTarget);

  const seed = eventSeed(world.seed, world.tick, attacker.id, target.id, 0xA11AC);
  const res = resolveHit(seed, attackSkill, defenceSkill, geomDot, target.intent.defence.mode, target.intent.defence.intensity);
  if (!res.hit) return;

  const sideBit = (eventSeed(world.seed, world.tick, attacker.id, target.id, 0x51DE) & 1) as 0 | 1;
  const region = regionFromHit(res.area, sideBit);

  const intensity = clampQ(cmd.intensity ?? q(1.0), q(0.1), q(1.0));
  const P = attacker.attributes.performance.peakPower_W;
  const base = clampI32(Math.trunc((P * SCALE.mps) / 200), Math.trunc(2 * SCALE.mps), Math.trunc(12 * SCALE.mps));

  const wMul = wpn.strikeSpeedMul ?? q(1.0);
  const cMul = attacker.attributes.control.controlQuality;
  const qualMul = q(0.70) + qMul(res.hitQuality, q(0.30));

  const vStrike = mulDiv(
    mulDiv(
      mulDiv(
        mulDiv(base, wMul as number, SCALE.Q),
        cMul as number,
        SCALE.Q
      ),
      intensity as number,
      SCALE.Q
    ),
    qualMul as number,
    SCALE.Q
  );

  const vStrikeVec = scaleDirToSpeed(dirToTarget, vStrike);

  const rel = {
    x: (attacker.velocity_mps.x - target.velocity_mps.x) + vStrikeVec.x,
    y: (attacker.velocity_mps.y - target.velocity_mps.y) + vStrikeVec.y,
    z: (attacker.velocity_mps.z - target.velocity_mps.z) + vStrikeVec.z,
  };

  const energy_J = impactEnergy_J(attacker, wpn, rel);

  let mitigated = energy_J;
  if (res.blocked) mitigated = Math.trunc(mitigated * 0.40);
  if (res.parried) mitigated = Math.trunc(mitigated * 0.25);

  const armour = deriveArmourProfile(target.loadout);
  const KINETIC_MASK = 1 << DamageChannel.Kinetic;
  const armourHit = armourCoversHit(world, armour.coverageByRegion[region], attacker.id, target.id);
  const protectedByArmour = armourHit && ((armour.protects & KINETIC_MASK) !== 0);

  const finalEnergy = protectedByArmour
    ? applyKineticArmourPenetration(mitigated, armour.resist_J, armour.protectedDamageMul)
    : mitigated;

  applyImpactToInjury(target, wpn, finalEnergy, region, protectedByArmour);
}

function armourCoversHit(world: WorldState, coverage: Q, aId: number, bId: number): boolean {
  if (coverage <= 0) return false;
  if (coverage >= SCALE.Q) return true;
  const seed = eventSeed(world.seed, world.tick, aId, bId, 0xC0DE);
  const roll = (seed % SCALE.Q) as Q;
  return roll < coverage;
}

function applyKineticArmourPenetration(energy_J: number, resist_J: number, postMul: Q): number {
  const remaining = Math.max(0, energy_J - Math.max(0, resist_J));
  return mulDiv(remaining, postMul as number, SCALE.Q);
}

function impactEnergy_J(attacker: Entity, wpn: Weapon, relVel_mps: Vec3): number {
  const frac = wpn.strikeEffectiveMassFrac ?? q(0.10);
  const bodyEffMass = mulDiv(attacker.attributes.morphology.mass_kg, frac as number, SCALE.Q);
  const mEff = wpn.mass_kg + bodyEffMass;

  const vx = BigInt(relVel_mps.x);
  const vy = BigInt(relVel_mps.y);
  const vz = BigInt(relVel_mps.z);
  const v2 = vx * vx + vy * vy + vz * vz;

  const denom = 2n * BigInt(SCALE.kg) * BigInt(SCALE.mps) * BigInt(SCALE.mps);
  const num = BigInt(mEff) * v2;

  return Math.max(0, Number(num / denom));
}

function applyImpactToInjury(target: Entity, wpn: Weapon, energy_J: number, region: BodyRegion, armoured: boolean): void {
  if (energy_J <= 0) return;

  let areaSurf = q(1.0), areaInt = q(1.0), areaStr = q(1.0);
  if (region === "head") { areaInt = q(1.25); areaStr = q(0.85); }
  else if (region === "leftArm" || region === "rightArm" || region === "leftLeg" || region === "rightLeg") { areaStr = q(1.20); areaInt = q(0.80); }
  else { areaInt = q(1.05); }

  const armourShift = armoured ? q(0.75) : q(1.0);

  const SURF_J = 100;
  const INT_J = 160;
  const STR_J = 220;

  const energyQ = energy_J * SCALE.Q;
  const bias = wpn.damage.penetrationBias;

  const surfFrac = clampQ(wpn.damage.surfaceFrac - qMul(bias, q(0.12)), q(0.05), q(0.95));
  const intFrac = clampQ(wpn.damage.internalFrac + qMul(bias, q(0.12)), q(0.05), q(0.95));

  const surfInc = Math.min(SCALE.Q, mulDiv(Math.trunc(energyQ), qMul(qMul(surfFrac, areaSurf), armourShift) as number, SURF_J * SCALE.Q));
  const intInc  = Math.min(SCALE.Q, mulDiv(Math.trunc(energyQ), qMul(intFrac, areaInt) as number, INT_J * SCALE.Q));
  const strInc  = Math.min(SCALE.Q, mulDiv(Math.trunc(energyQ), qMul(wpn.damage.structuralFrac, areaStr) as number, STR_J * SCALE.Q));

  target.injury.byRegion[region].surfaceDamage = clampQ(target.injury.byRegion[region].surfaceDamage + surfInc, 0, SCALE.Q);
  target.injury.byRegion[region].internalDamage = clampQ(target.injury.byRegion[region].internalDamage + intInc, 0, SCALE.Q);
  target.injury.byRegion[region].structuralDamage = clampQ(target.injury.byRegion[region].structuralDamage + strInc, 0, SCALE.Q);

  const bleedBase = clampQ(((surfInc + intInc) >>> 1) as any, 0, SCALE.Q);
  const bleedDelta = qMul(bleedBase, wpn.damage.bleedFactor);

  const BLEED_SCALE = q(0.004);
  target.injury.byRegion[region].bleedingRate = clampQ(target.injury.byRegion[region].bleedingRate + qMul(bleedDelta, BLEED_SCALE), 0, q(1.0));

  const SHOCK_SPIKE = q(0.010);
  target.injury.shock = clampQ(target.injury.shock + qMul(bleedBase, SHOCK_SPIKE), 0, SCALE.Q);
}

/* ------------------ Conditions -> injury (armour-aware) ------------------ */

function stepConditionsToInjury(world: WorldState, e: Entity): void {
  const traitProfile = buildTraitProfile(e.traits);
  const armour = deriveArmourProfile(e.loadout);

  // Exposure weights: "what tends to be exposed" for systemic hazards.
  // v1: humanoid defaults; other body plans can override later.
  const exposureWeights = (channel: DamageChannel): Record<BodyRegion, Q> => {
    switch (channel) {
      case DamageChannel.Thermal:
        // Fire: limbs tend to be exposed and catch/keep burning; torso often partly shielded.
        return {
          head: q(0.18),
          torso: q(0.28),
          leftArm: q(0.14),
          rightArm: q(0.14),
          leftLeg: q(0.13),
          rightLeg: q(0.13),
        };
      case DamageChannel.Chemical:
        // Corrosives/aerosols: more even, but torso still prominent.
        return {
          head: q(0.16),
          torso: q(0.36),
          leftArm: q(0.12),
          rightArm: q(0.12),
          leftLeg: q(0.12),
          rightLeg: q(0.12),
        };
      case DamageChannel.Electrical:
        // Conductive contact often through extremities.
        return {
          head: q(0.10),
          torso: q(0.22),
          leftArm: q(0.22),
          rightArm: q(0.22),
          leftLeg: q(0.12),
          rightLeg: q(0.12),
        };
      default:
        // Fallback: assume proportional to area.
        return DEFAULT_REGION_WEIGHTS as any;
    }
  };

  const applyDoseToRegion = (channel: DamageChannel, region: BodyRegion, dose: Q): Q => {
    if (dose <= 0) return q(0);
    if ((traitProfile.immuneMask & (1 << channel)) !== 0) return q(0);

    let out = dose;
    if ((traitProfile.resistantMask & (1 << channel)) !== 0) out = Math.trunc(out / 2) as any;

    const cov = armour.coverageByRegion[region];
    const armCovers = armourCoversHit(world, cov, e.id, (e.id ^ 0xBEEF) + (channel << 8) + regionSalt(region));
    if (armCovers && ((armour.protects & (1 << channel)) !== 0)) {
      const mul = armour.channelResistMul[channel] ?? q(1.0);

      // A simple "resist factor" curve; for non-kinetic we treat resist_J as a generalised protective capacity.
      const resistFactor = clampQ(
        q(1.0) - (mulDiv(Math.min(armour.resist_J, 800) * SCALE.Q, 1, 800) as any),
        q(0.20),
        q(1.0),
      );

      out = qMul(qMul(out, resistFactor), armour.protectedDamageMul);
      out = qMul(out, mul);
    }
    return out;
  };

  const distribute = (channel: DamageChannel, dose: Q): Record<BodyRegion, Q> => {
    const w = exposureWeights(channel);
    const out: any = {};
    for (const r of ALL_REGIONS) out[r] = qMul(dose, w[r]);
    return out;
  };

  const fireBy = distribute(DamageChannel.Thermal, e.condition.onFire);
  const corrBy = distribute(DamageChannel.Chemical, e.condition.corrosiveExposure);
  const elecBy = distribute(DamageChannel.Electrical, e.condition.electricalOverload);

  // Suffocation is global rather than surface-localised.
  const suff = (() => {
    if ((traitProfile.immuneMask & (1 << DamageChannel.Suffocation)) !== 0) return q(0);
    let out = e.condition.suffocation;
    if ((traitProfile.resistantMask & (1 << DamageChannel.Suffocation)) !== 0) out = Math.trunc(out / 2) as any;

    // Simple: masks/helmets reduce suffocation slightly if they protect Suffocation.
    const armCovers = armourCoversHit(world, armour.coverageByRegion.head, e.id, e.id ^ 0x5AFF);
    if (armCovers && ((armour.protects & (1 << DamageChannel.Suffocation)) !== 0)) {
      out = qMul(out, armour.protectedDamageMul);
    }
    return out;
  })();

  const FIRE_SURFACE_PER_TICK = q(0.0020);
  const FIRE_SHOCK_PER_TICK = q(0.0010);
  const CORR_SURFACE_PER_TICK = q(0.0015);
  const CORR_INTERNAL_PER_TICK = q(0.0008);
  const SUFF_SHOCK_PER_TICK = q(0.0015);
  const ELEC_INTERNAL_PER_TICK = q(0.0010);
  const ELEC_STUNNED_RISE = q(0.0200);

  for (const r of ALL_REGIONS) {
    const fire = applyDoseToRegion(DamageChannel.Thermal, r, fireBy[r]);
    const corr = applyDoseToRegion(DamageChannel.Chemical, r, corrBy[r]);
    const elec = applyDoseToRegion(DamageChannel.Electrical, r, elecBy[r]);

    if (fire > 0) {
      e.injury.byRegion[r].surfaceDamage = clampQ(e.injury.byRegion[r].surfaceDamage + qMul(fire, FIRE_SURFACE_PER_TICK), 0, SCALE.Q);
      e.injury.shock = clampQ(e.injury.shock + qMul(fire, FIRE_SHOCK_PER_TICK), 0, SCALE.Q);
    }
    if (corr > 0) {
      e.injury.byRegion[r].surfaceDamage = clampQ(e.injury.byRegion[r].surfaceDamage + qMul(corr, CORR_SURFACE_PER_TICK), 0, SCALE.Q);
      e.injury.byRegion[r].internalDamage = clampQ(e.injury.byRegion[r].internalDamage + qMul(corr, CORR_INTERNAL_PER_TICK), 0, SCALE.Q);
    }
    if (elec > 0) {
      e.injury.byRegion[r].internalDamage = clampQ(e.injury.byRegion[r].internalDamage + qMul(elec, ELEC_INTERNAL_PER_TICK), 0, SCALE.Q);
      e.condition.stunned = clampQ(e.condition.stunned + qMul(elec, ELEC_STUNNED_RISE), 0, SCALE.Q);
    }
  }

  if (suff > 0) {
    e.injury.shock = clampQ(e.injury.shock + qMul(suff, SUFF_SHOCK_PER_TICK), 0, SCALE.Q);
  }
}

function regionSalt(region: BodyRegion): number {
  switch (region) {
    case "head": return 0x11;
    case "torso": return 0x22;
    case "leftArm": return 0x33;
    case "rightArm": return 0x44;
    case "leftLeg": return 0x55;
    case "rightLeg": return 0x66;
  }
}

function stepInjuryProgression(e: Entity): void {
  if (e.injury.dead) return;

    const bleedRate = totalBleedingRate(e.injury);
  const bleedThisTick = Math.trunc((bleedRate * DT_S) / SCALE.s) as any;
  e.injury.fluidLoss = clampQ(e.injury.fluidLoss + bleedThisTick, 0, SCALE.Q);

  const SHOCK_FROM_FLUID = q(0.0040);
  const SHOCK_FROM_INTERNAL = q(0.0020);

  e.injury.shock = clampQ(
    e.injury.shock + qMul(e.injury.fluidLoss, SHOCK_FROM_FLUID) + qMul(e.injury.byRegion.torso.internalDamage, SHOCK_FROM_INTERNAL),
    0,
    SCALE.Q
  );

  const CONSC_LOSS_FROM_SHOCK = q(0.0100);
  const CONSC_LOSS_FROM_SUFF  = q(0.0200);

  const loss = clampQ(qMul(e.injury.shock, CONSC_LOSS_FROM_SHOCK) + qMul(e.condition.suffocation, CONSC_LOSS_FROM_SUFF) + qMul(regionKOFactor(e.injury), q(0.0100)), 0, SCALE.Q);
  e.injury.consciousness = clampQ(e.injury.consciousness - loss, 0, SCALE.Q);

  if (e.injury.shock >= SCALE.Q || e.injury.consciousness === 0) {
    e.injury.dead = true;
    e.injury.consciousness = 0;
    e.velocity_mps = v3(0, 0, 0);
  }
}

function stepEnergy(e: Entity, ctx: KernelContext): void {
  const BASE_IDLE_W = 80;

  const speedAbs = Math.max(Math.abs(e.velocity_mps.x), Math.abs(e.velocity_mps.y), Math.abs(e.velocity_mps.z));
  const moving = speedAbs > Math.trunc(0.05 * SCALE.mps);

  const demand = moving ? 250 : BASE_IDLE_W;

  stepEnergyAndFatigue(e.attributes, e.energy, e.loadout, demand, DT_S, { tractionCoeff: ctx.tractionCoeff });

  if (!moving && e.injury.shock < q(0.4)) {
    e.energy.fatigue = clampQ(e.energy.fatigue - q(0.0020), 0, SCALE.Q);
  }
}
