import type { WorldState } from "./world";
import type { Entity } from "./entity";
import type { CommandMap, Command, AttackCommand } from "./commands";

import { SCALE, q, clampQ, qMul, mulDiv, to, type Q, type I32 } from "../units";
import { deriveMovementCaps, stepEnergyAndFatigue } from "../derive";
import { DamageChannel } from "../channels";
import { deriveArmourProfile, findWeapon, type Weapon } from "../equipment";
import { deriveFunctionalState } from "./impairment";
import { TUNING, type SimulationTuning } from "./tuning";
import { buildTraitProfile } from "../traits";

import { integratePos, type Vec3, v3 } from "./vec3";
import { defaultIntent } from "./intent";
import { defaultAction } from "./action";
import { resolveHit, type HitArea } from "./combat";
import { normaliseDirCheapQ, dotDirQ } from "./vec3";
import { eventSeed } from "./seeds";
import { type BodyRegion, regionFromHit, ALL_REGIONS, DEFAULT_REGION_WEIGHTS } from "./body";
import { totalBleedingRate, regionKOFactor } from "./injury";
import { WorldIndex, buildWorldIndex } from "./indexing";
import { buildSpatialIndex, queryNearbyIds, type SpatialIndex } from "./spatial";
import { type ImpactEvent, sortEventsDeterministic } from "./events";

import { parryLeverageQ } from "./combat";

import { pickNearestEnemyInReach } from "./formation";
import { isMeleeLaneOccludedByFriendly } from "./occlusion";
import { applyFrontageCap } from "./frontage";

import { type DensityField, computeDensityField } from "./density";
import { stepPushAndRepulsion } from "./push";

export const TICK_HZ = 20;
export const DT_S: I32 = to.s(1 / TICK_HZ);

export interface KernelContext {
  tractionCoeff: Q;
  tuning?: SimulationTuning;
  cellSize_m?: I32; // fixed-point metres; default 4m
  density?: DensityField;
}

export function stepWorld(world: WorldState, cmds: CommandMap, ctx: KernelContext): void {
  const tuning = ctx.tuning ?? TUNING.tactical;
  world.entities.sort((a, b) => a.id - b.id);

  const index = buildWorldIndex(world);

  const cellSize_m = ctx.cellSize_m ?? Math.trunc(4 * SCALE.m);
  const spatial = buildSpatialIndex(world, cellSize_m);

  const density = computeDensityField(world, index, spatial, {
    personalRadius_m: Math.trunc(0.45 * SCALE.m),
    maxNeighbours: 12,
    crowdingAt: 6,
  });
  ctx.density = density;

  const impacts: ImpactEvent[] = [];

  for (const e of world.entities) {
    if (!(e as any).intent) (e as any).intent = defaultIntent();
    if (!(e as any).action) (e as any).action = defaultAction();
  }

  for (const e of world.entities) {
    e.action.attackCooldownTicks = Math.max(0, e.action.attackCooldownTicks - 1);
    e.action.defenceCooldownTicks = Math.max(0, e.action.defenceCooldownTicks - 1);
    e.condition.standBlockedTicks = Math.max(0, e.condition.standBlockedTicks - 1);
    e.condition.unconsciousTicks = Math.max(0, e.condition.unconsciousTicks - 1);
  }

  for (const e of world.entities) {
    if (e.injury.dead) continue;
    applyCommands(e, cmds.get(e.id) ?? []);
    applyFunctionalGating(world, e, tuning);
    applyStandAndKO(world, e, tuning);
  }

  for (const e of world.entities) {
    const d = e.intent.move.dir;
    if (d.x !== 0 || d.y !== 0 || d.z !== 0) e.action.facingDirQ = normaliseDirCheapQ(d);
  }

  for (const e of world.entities) {
    if (e.injury.dead) continue;
    stepMovement(world, e, ctx, tuning);
  }
  const spatialAfterMove = buildSpatialIndex(world, cellSize_m);

  stepPushAndRepulsion(world, index, spatialAfterMove, {
    personalRadius_m: Math.trunc(0.45 * SCALE.m),
    repelAccel_mps2: Math.trunc(1.5 * SCALE.mps2),
    pushTransfer: q(0.35),
    maxNeighbours: 10,
  });

  for (const e of world.entities) {
    if (e.injury.dead) continue;
    const commands = cmds.get(e.id) ?? [];
    for (const c of commands) {
      if (c.kind === "attack") {
        resolveAttack(world, e, c, tuning, index, impacts, spatial);
      } else if (c.kind === "attackNearest") {
        const wpn = findWeapon(e.loadout, c.weaponId);
        if (!wpn) continue;

        const reach_m = wpn.reach_m ?? Math.trunc(e.attributes.morphology.stature_m * 0.45);
        const target = pickNearestEnemyInReach(
          e,
          index,
          spatial,
          {
            reach_m,
            buffer_m: Math.trunc(0.8 * SCALE.m),
            maxTargets: 12,
            requireFrontArc: tuning.realism !== "arcade",
            minDotQ: tuning.realism === "sim" ? q(0.20) : q(0.0),
          }
        );
        if (!target) continue;

        // Convert to ordinary attack command
        const attackCmd: AttackCommand = {
          kind: "attack",
          targetId: target.id,
          ...(c.weaponId !== undefined ? { weaponId: c.weaponId } : {}),
          ...(c.intensity !== undefined ? { intensity: c.intensity } : {}),
          ...(c.mode !== undefined ? { mode: c.mode } : {}),
        };

        resolveAttack(world, e, attackCmd, tuning, index, impacts, spatialAfterMove);
      }
    }
  }

  let finalImpacts = impacts;

  if (tuning.realism !== "arcade") {
    finalImpacts = applyFrontageCap(impacts, index, { maxEngagersPerTarget: tuning.realism === "sim" ? 2 : 3 });
  }

  sortEventsDeterministic(finalImpacts);

  for (const ev of impacts) {
    const target = index.byId.get(ev.targetId);
    if (!target || target.injury.dead) continue;

    applyImpactToInjury(target, ev.wpn, ev.energy_J, ev.region, ev.protectedByArmour);
  }

  for (const e of world.entities) {
    if (e.injury.dead) continue;
    stepConditionsToInjury(world, e);
    stepInjuryProgression(e);
    stepEnergy(e, ctx);
  }

  world.tick += 1;
}

function applyFunctionalGating(world: WorldState, e: Entity, tuning: SimulationTuning): void {
  const func = deriveFunctionalState(e, tuning);

  // incapacity gates voluntary actions
  if (!func.canAct) {
    e.intent.defence = { mode: "none", intensity: q(0) };
    e.intent.move = { dir: { x: 0, y: 0, z: 0 }, intensity: q(0), mode: "walk" };
    // keep prone if already, and prefer prone for non-acting entities in tactical/sim
    if (tuning.realism !== "arcade") e.condition.prone = true;
    return;
  }

  // forced prone if cannot stand (tactical/sim)
  if (!func.canStand && tuning.realism !== "arcade") e.condition.prone = true;

  // hard limb disable hooks (tactical/sim)
  if (tuning.realism !== "arcade") {
    const armsOut = func.leftArmDisabled && func.rightArmDisabled;
    if (armsOut && (e.intent.defence.mode === "block" || e.intent.defence.mode === "parry")) {
      e.intent.defence = { mode: "none", intensity: q(0) };
    }

    const legsOut = func.leftLegDisabled && func.rightLegDisabled;
    if (legsOut && e.intent.move.mode === "sprint") {
      // no sprinting with both legs disabled
      e.intent.move = { ...e.intent.move, mode: "walk" };
    }
  }
}

function applyCommands(e: Entity, commands: readonly Command[]): void {
  e.intent.defence = { mode: "none", intensity: q(0) };

  for (const c of commands) {
    if (c.kind === "setProne") e.condition.prone = c.prone;
    else if (c.kind === "move") e.intent.move = { dir: c.dir, intensity: c.intensity, mode: c.mode };
    else if (c.kind === "defend") e.intent.defence = { mode: c.mode, intensity: clampQ(c.intensity, 0, SCALE.Q) };
  }
}

function applyStandAndKO(world: WorldState, e: Entity, tuning: SimulationTuning): void {
  // KO: if below threshold, go unconscious (but do NOT mark dead)
  const wasUnconscious = e.condition.unconsciousTicks > 0;

  if (e.injury.consciousness <= tuning.unconsciousThreshold) {
    if (!wasUnconscious) {
      e.condition.unconsciousTicks = tuning.unconsciousBaseTicks;
      e.condition.prone = true;
      e.intent.defence = { mode: "none", intensity: q(0) };
      e.intent.move = { dir: { x: 0, y: 0, z: 0 }, intensity: q(0), mode: "walk" };

      // SIM: drop weapons
      if (tuning.dropWeaponsOnUnconscious) {
        e.loadout.items = e.loadout.items.filter(it => it.kind !== "weapon");
      }
    } else {
      // keep them down
      e.condition.prone = true;
    }
  }

  // If unconscious, cannot act/stand
  if (e.condition.unconsciousTicks > 0) {
    e.intent.defence = { mode: "none", intensity: q(0) };
    e.intent.move = { dir: { x: 0, y: 0, z: 0 }, intensity: q(0), mode: "walk" };
    e.condition.prone = true;
    return;
  }

  // Standing rules: if player wants to stand but is blocked, force prone
  if (!e.intent.prone && e.condition.prone) {
    if (tuning.realism === "arcade") {
      e.condition.prone = false;
      return;
    }

    if (e.condition.standBlockedTicks > 0) {
      e.condition.prone = true;
      return;
    }

    // Compute stand-up time based on leg damage + shock + fatigue + encumbrance
    const func = deriveFunctionalState(e, tuning);
    const slow = (SCALE.Q - func.mobilityMul) as any; // 0..1
    const extra = Math.trunc((slow * tuning.standUpMaxExtraTicks) / SCALE.Q);
    const ticks = tuning.standUpBaseTicks + extra;

    e.condition.standBlockedTicks = Math.max(1, ticks);
    e.condition.prone = true;
    e.intent.prone = true; // reflect forced state
  }
}

function stepMovement(world: WorldState, e: Entity, ctx: KernelContext, tuning: SimulationTuning): void {
  const caps = deriveMovementCaps(e.attributes, e.loadout, { tractionCoeff: ctx.tractionCoeff });
  const func = deriveFunctionalState(e, tuning);

  // Capability gating
  if (!func.canAct) {
    // unconscious/otherwise incapable: no voluntary movement
    e.intent.move = { dir: { x: 0, y: 0, z: 0 }, intensity: q(0), mode: "walk" };
  }
  if (!func.canStand) {
    // force prone if unable to stand (tactical/sim)
    if (tuning.realism !== "arcade") e.condition.prone = true;
  }


  if (e.condition.unconsciousTicks > 0) {
    e.velocity_mps = v3(0, 0, 0);
    return;
  }

  const vmax_mps = caps.maxSprintSpeed_mps;
  const amax_mps2 = caps.maxAcceleration_mps2;

  const controlMulBase = clampQ(q(1.0) - qMul(q(0.7), e.condition.stunned), q(0.1), q(1.0));
  let mobilityMulBase = e.condition.prone ? q(0.25) : q(1.0);

  // crawl tuning
  if (e.condition.prone && e.condition.unconsciousTicks === 0 && tuning.realism !== "arcade") {
    mobilityMulBase = qMul(mobilityMulBase, q(0.20)); // crawling is slow
  }
  
  // impairment affects control and mobility
  const controlMul = qMul(controlMulBase, func.coordinationMul);
  const mobilityMul = qMul(mobilityMulBase, func.mobilityMul);
  const crowd = ctx.density?.crowdingQ.get(e.id) ?? 0;
  const crowdMul = clampQ(q(1.0) - qMul(q(0.65), crowd as any), q(0.25), q(1.0));

  const baseMul = qMul(qMul(controlMul, mobilityMul), crowdMul);

  const effVmax = mulDiv(vmax_mps, baseMul, SCALE.Q);
  const effAmax = mulDiv(amax_mps2, baseMul, SCALE.Q);

  let modeMul =
    e.intent.move.mode === "walk" ? q(0.40) :
    e.intent.move.mode === "run"  ? q(0.70) : q(1.0);

  if (e.condition.prone && tuning.realism !== "arcade") {
    // cannot sprint while prone
    if (e.intent.move.mode === "sprint") modeMul = q(0.40);
  }

  const dir = normaliseDirCheapQ(e.intent.move.dir);
  const intensity = clampQ(e.intent.move.intensity, 0, SCALE.Q);

  // Sim-only: stumble/fall risk when sprinting with impaired mobility/coordination
  if (tuning.realism === "sim" && intensity > 0 && e.intent.move.mode === "sprint" && !e.condition.prone) {
    const instability = (SCALE.Q - qMul(func.mobilityMul, func.coordinationMul)) as any;
    const chance = clampQ(tuning.stumbleBaseChance + qMul(instability, q(0.05)), q(0), q(0.25));
    if (chance > 0) {
      const seed = eventSeed(world.seed, world.tick, e.id, 0, 0xF411);
      const roll = (seed % SCALE.Q) as any;
      if (roll < chance) {
        e.condition.prone = true;
        // a small deterministic shock spike
        e.injury.shock = clampQ(e.injury.shock + q(0.02), 0, SCALE.Q);
      }
    }
  }


  const vTargetMag = mulDiv(mulDiv(effVmax, intensity, SCALE.Q), modeMul, SCALE.Q);
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
function resolveAttack(world: WorldState, attacker: Entity, cmd: AttackCommand, tuning: SimulationTuning, index: WorldIndex, impacts: ImpactEvent[], spatial: SpatialIndex): void {
  if (attacker.action.attackCooldownTicks > 0) return;

  const target = index.byId.get(cmd.targetId);
  if (!target || target.injury.dead) return;

  const effTuning = ((world as any).__tuning as SimulationTuning | undefined) ?? tuning;

  const funcA = deriveFunctionalState(attacker, effTuning);
  const funcB = deriveFunctionalState(target, effTuning);

  if (!funcA.canAct) return;

  const wpn = findWeapon(attacker.loadout, cmd.weaponId);
  if (!wpn) return;

  const reach_m = wpn.reach_m ?? Math.trunc(attacker.attributes.morphology.stature_m * 0.45);
  const dx = target.position_m.x - attacker.position_m.x;
  const dy = target.position_m.y - attacker.position_m.y;
  const dz = target.position_m.z - attacker.position_m.z;

  const dist2 = BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy) + BigInt(dz) * BigInt(dz);
  const reach2 = BigInt(reach_m) * BigInt(reach_m);
  if (dist2 > reach2) return;

  if (tuning.realism !== "arcade") {
    const blocked = isMeleeLaneOccludedByFriendly(
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
  attacker.action.attackCooldownTicks = Math.max(1, Math.trunc((readyTime_s * TICK_HZ) / SCALE.s));

  const attackSkillBase = clampQ(qMul(attacker.attributes.control.controlQuality, attacker.attributes.control.fineControl), q(0.05), q(0.99));
  const attackSkill = clampQ(qMul(attackSkillBase, qMul(funcA.coordinationMul, funcA.manipulationMul)), q(0.01), q(0.99));
  const defenceSkillBase = clampQ(qMul(target.attributes.control.controlQuality, target.attributes.control.stability), q(0.05), q(0.99));
  const defenceSkill = clampQ(qMul(defenceSkillBase, qMul(funcB.coordinationMul, funcB.mobilityMul)), q(0.01), q(0.99));
  const geomDot = dotDirQ(attacker.action.facingDirQ, dirToTarget);

  const seed = eventSeed(world.seed, world.tick, attacker.id, target.id, 0xA11AC);
  const res = resolveHit(seed, attackSkill, defenceSkill, geomDot, target.intent.defence.mode, target.intent.defence.intensity);
  if (!res.hit) return;

  const sideBit = (eventSeed(world.seed, world.tick, attacker.id, target.id, 0x51DE) & 1) as 0 | 1;
  const region = regionFromHit(res.area, sideBit);


  const baseIntensity = clampQ(cmd.intensity ?? q(1.0), q(0.1), q(1.0));
  const handling = wpn.handlingMul ?? q(1.0);

  const handlingPenalty = clampQ(
    q(1.0) - qMul(q(0.18), (handling - SCALE.Q) as any),
    q(0.70),
    q(1.0)
  );

  const intensity = clampQ(
    qMul(baseIntensity, qMul(funcA.manipulationMul, handlingPenalty)),
    q(0.1),
    q(1.0)
  );

  const P = attacker.attributes.performance.peakPower_W;
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

  const rel = {
    x: (attacker.velocity_mps.x - target.velocity_mps.x) + vStrikeVec.x,
    y: (attacker.velocity_mps.y - target.velocity_mps.y) + vStrikeVec.y,
    z: (attacker.velocity_mps.z - target.velocity_mps.z) + vStrikeVec.z,
  };

  const energy_J = mulDiv((impactEnergy_J(attacker, wpn, rel)) as any, funcA.manipulationMul as any, SCALE.Q);

  let mitigated = energy_J;

  if (res.blocked || res.parried) {
    const leverage = parryLeverageQ(wpn, attacker);
    const handed = (wpn.handedness ?? "oneHand") === "twoHand" ? q(1.10) : q(1.0);
    const defenceMul = qMul(leverage, handed);

    if (res.blocked) {
      const m = clampQ(
        q(0.40) - qMul(q(0.12), (defenceMul - SCALE.Q) as any),
        q(0.25),
        q(0.60)
      );
      mitigated = mulDiv(mitigated, m, SCALE.Q);
    }

    if (res.parried) {
      const m = clampQ(
        q(0.25) - qMul(q(0.15), (defenceMul - SCALE.Q) as any),
        q(0.10),
        q(0.45)
      );
      mitigated = mulDiv(mitigated, m, SCALE.Q);
    }
  }

  

  const armour = deriveArmourProfile(target.loadout);
  const KINETIC_MASK = 1 << DamageChannel.Kinetic;
  const armourHit = armourCoversHit(world, armour.coverageByRegion[region], attacker.id, target.id);
  const protectedByArmour = armourHit && ((armour.protects & KINETIC_MASK) !== 0);

  const finalEnergy = protectedByArmour
    ? applyKineticArmourPenetration(mitigated, armour.resist_J, armour.protectedDamageMul)
    : mitigated;

  impacts.push({
    kind: "impact",
    attackerId: attacker.id,
    targetId: target.id,
    region,
    energy_J: finalEnergy,
    protectedByArmour,
    weaponId: wpn.id,
    wpn,
  });
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

  const surfInc = Math.min(SCALE.Q, mulDiv(Math.trunc(energyQ), qMul(qMul(surfFrac, areaSurf), armourShift), SURF_J * SCALE.Q));
  const intInc  = Math.min(SCALE.Q, mulDiv(Math.trunc(energyQ), qMul(intFrac, areaInt), INT_J * SCALE.Q));
  const strInc  = Math.min(SCALE.Q, mulDiv(Math.trunc(energyQ), qMul(wpn.damage.structuralFrac, areaStr), STR_J * SCALE.Q));

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
