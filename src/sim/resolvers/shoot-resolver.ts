import type { WorldState } from "../world.js";
import { type Entity } from "../entity.js";
import type { ShootCommand } from "../commands.js";
import type { KernelContext } from "../context.js";

import { SCALE, q, clampQ, qMul, mulDiv, type Q } from "../../units.js";
import { DamageChannel } from "../../channels.js";
import { deriveArmourProfile, findRangedWeapon, findShield, type Weapon, type Shield } from "../../equipment.js";

import { deriveFunctionalState } from "../impairment.js";
import { type SimulationTuning } from "../tuning.js";
import { chooseArea, type HitArea } from "../combat.js";
import { eventSeed } from "../seeds.js";
import { coverFractionAtPosition, elevationAtPosition } from "../terrain.js";
import { computeWindAimError } from "../weather.js";
import {
  energyAtRange_J,
  adjustedDispersionQ,
  groupingRadius_m,
  thrownLaunchEnergy_J,
  recycleTicks,
  shootCost_J,
} from "../ranged.js";
import { getSkill } from "../skills.js";
import { TICK_HZ } from "../tick.js";
import { type ImpactEvent } from "../events.js";
import type { TraceSink } from "../trace.js";
import { TraceKinds } from "../kinds.js";

export type HitSegmentId = string;

const AIM_MAX_TICKS = 20;
const AIM_MIN_MUL = q(0.50) as Q;
const AIM_STILL_THRESHOLD = 5_000;

type ResolveShootOptions = {
  world: WorldState;
  shooter: Entity;
  cmd: ShootCommand;
  tuning: SimulationTuning;
  impacts: ImpactEvent[];
  trace: TraceSink;
  ctx: KernelContext;
  target: Entity | undefined;
  resolveTargetHitSegment: (target: Entity, roll01: Q, sideBit: 0 | 1, fallbackArea?: HitArea) => HitSegmentId;
  shieldBlocksSegment: (shield: Shield | undefined, target: Entity, segmentId: HitSegmentId, area: HitArea | undefined) => boolean;
  regionCoverageQ: (coverageByRegion: Record<string, Q>, segmentId: HitSegmentId) => Q;
  armourCoversHit: (world: WorldState, coverage: Q, aId: number, bId: number) => boolean;
};

export function resolveShoot(options: ResolveShootOptions): void {
  const { world, shooter, cmd, tuning, impacts, trace, ctx, target, resolveTargetHitSegment, shieldBlocksSegment, regionCoverageQ, armourCoversHit } = options;
  void tuning;
  {
    const svx = shooter.velocity_mps.x;
    const svy = shooter.velocity_mps.y;
    const shooterVelMag = Math.trunc(Math.sqrt(svx * svx + svy * svy));
    if (cmd.targetId !== shooter.action.aimTargetId || shooterVelMag > AIM_STILL_THRESHOLD) {
      shooter.action.aimTicks = 0;
      shooter.action.aimTargetId = cmd.targetId;
    } else if (shooter.action.shootCooldownTicks > 0 && shooterVelMag <= AIM_STILL_THRESHOLD) {
      shooter.action.aimTicks = Math.min(shooter.action.aimTicks + 1, AIM_MAX_TICKS);
    }
  }

  if (shooter.action.shootCooldownTicks > 0) return;

  const wpn = findRangedWeapon(shooter.loadout, cmd.weaponId);
  if (!wpn) return;

  if (!target || target.injury.dead) return;

  const ammo = cmd.ammoId ? wpn.ammo?.find(a => a.id === cmd.ammoId) : undefined;
  const projMass_kg = ammo?.projectileMass_kg ?? wpn.projectileMass_kg;
  const dragCoeff_perM = ammo?.dragCoeff_perM ?? wpn.dragCoeff_perM;
  const ammoDamage = ammo?.damage ?? wpn.damage;
  const launchMul = ammo?.launchEnergyMul ?? (SCALE.Q as Q);

  const funcA = deriveFunctionalState(shooter, tuning);
  if (!funcA.canAct) return;

  const dx = BigInt(target.position_m.x - shooter.position_m.x);
  const dy = BigInt(target.position_m.y - shooter.position_m.y);
  const cellSizeRS = ctx.cellSize_m ?? Math.trunc(4 * SCALE.m);
  const elevSh = elevationAtPosition(ctx.elevationGrid, cellSizeRS, shooter.position_m.x, shooter.position_m.y);
  const elevTg = elevationAtPosition(ctx.elevationGrid, cellSizeRS, target.position_m.x, target.position_m.y);
  const dz = BigInt(target.position_m.z - shooter.position_m.z + (elevTg - elevSh));
  const dist_m = Number(isqrtBig(dx * dx + dy * dy + dz * dz));

  const intensity = clampQ(cmd.intensity ?? q(1.0), q(0.1), q(1.0));

  const launchEnergy = wpn.category === "thrown"
    ? mulDiv(
      thrownLaunchEnergy_J(shooter.attributes.performance.peakPower_W),
      getSkill(shooter.skills, "throwingWeapons").energyTransferMul,
      SCALE.Q,
    )
    : Math.trunc(qMul(wpn.launchEnergy_J, launchMul));

  const energy_J = energyAtRange_J(launchEnergy, dragCoeff_perM, dist_m);

  const v_impact_mps = projMass_kg > 0
    ? Math.trunc(Math.sqrt(2 * energy_J * SCALE.kg / projMass_kg) * SCALE.mps)
    : 0;

  const ctrl = shooter.attributes.control;
  const adjDisp = adjustedDispersionQ(
    wpn.dispersionQ,
    ctrl.controlQuality,
    ctrl.fineControl,
    shooter.energy.fatigue,
    intensity,
  );
  const rangedSkill = getSkill(shooter.skills, "rangedCombat");
  const skillAdjDisp = qMul(adjDisp, rangedSkill.dispersionMul);
  let gRadius_m = groupingRadius_m(skillAdjDisp, dist_m);

  const aimReduction = mulDiv(SCALE.Q - AIM_MIN_MUL, Math.min(shooter.action.aimTicks, AIM_MAX_TICKS), AIM_MAX_TICKS);
  const aimMul = (SCALE.Q - aimReduction) as Q;
  gRadius_m = Math.trunc(qMul(gRadius_m, aimMul));

  const tvx = target.velocity_mps.x;
  const tvy = target.velocity_mps.y;
  const targetVelMag = Math.trunc(Math.sqrt(tvx * tvx + tvy * tvy));
  const leadError_m = mulDiv(targetVelMag, 2_000, SCALE.mps);
  gRadius_m += leadError_m;

  if (ctx.weather?.wind && v_impact_mps > 0 && dist_m > 0) {
    gRadius_m += computeWindAimError(
      ctx.weather.wind,
      Number(dx), Number(dy),
      dist_m,
      v_impact_mps,
    );
  }

  const rawHalfWidth_m = mulDiv(shooter.attributes.morphology.stature_m, 2000, SCALE.Q);
  const cover = ctx.obstacleGrid
    ? coverFractionAtPosition(ctx.obstacleGrid, cellSizeRS, target.position_m.x, target.position_m.y)
    : 0;
  const bodyHalfWidth_m = cover > 0
    ? mulDiv(rawHalfWidth_m, Math.max(0, SCALE.Q - cover), SCALE.Q)
    : rawHalfWidth_m;

  const dispSeed = eventSeed(world.seed, world.tick, shooter.id, target.id, 0xD15A);
  const errorMag_m = gRadius_m > 0
    ? mulDiv(dispSeed % SCALE.Q, gRadius_m, SCALE.Q)
    : 0;

  const hit = errorMag_m <= bodyHalfWidth_m;
  const suppressed = !hit && errorMag_m <= bodyHalfWidth_m * 3;

  shooter.energy.reserveEnergy_J = Math.max(
    0,
    shooter.energy.reserveEnergy_J - shootCost_J(wpn, intensity, shooter.attributes.performance.peakPower_W),
  );
  shooter.action.aimTicks = 0;

  if (wpn.magCapacity !== undefined) {
    if (shooter.action.roundsInMag === undefined) {
      shooter.action.roundsInMag = wpn.magCapacity;
    }
    shooter.action.roundsInMag -= 1;
    if (shooter.action.roundsInMag <= 0) {
      shooter.action.roundsInMag = wpn.magCapacity;
      shooter.action.shootCooldownTicks = recycleTicks(wpn, TICK_HZ);
    } else {
      shooter.action.shootCooldownTicks =
        wpn.shotInterval_s !== undefined
          ? Math.ceil((wpn.shotInterval_s * TICK_HZ) / SCALE.s)
          : recycleTicks(wpn, TICK_HZ);
    }
  } else {
    shooter.action.shootCooldownTicks = recycleTicks(wpn, TICK_HZ);
  }

  if (suppressed) {
    target.condition.suppressedTicks = Math.max(target.condition.suppressedTicks, 4);
    target.condition.suppressionFearMul = wpn.suppressionFearMul ?? (SCALE.Q as Q);
  }

  let hitRegion: HitSegmentId | undefined;

  if (hit && energy_J > 0) {
    const sideSeed = eventSeed(world.seed, world.tick, shooter.id, target.id, 0xD15B);
    const areaSeed = eventSeed(world.seed, world.tick, shooter.id, target.id, 0xD15C);
    const hitArea: HitArea | undefined = target.bodyPlan
      ? undefined
      : chooseArea((areaSeed % SCALE.Q) as Q);

    const sideBit = (sideSeed & 1) as 0 | 1;
    hitRegion = resolveTargetHitSegment(
      target,
      ((areaSeed >>> 8) % SCALE.Q) as Q,
      sideBit,
      hitArea,
    );

    const shield = findShield(target.loadout);
    const shieldSeed = eventSeed(world.seed, world.tick, shooter.id, target.id, 0xD15D);
    const projBypassQ = ("shieldBypassQ" in wpn) ? wpn.shieldBypassQ : 0;
    const effectiveCoverageQ = projBypassQ > 0
      ? Math.max(0, qMul((shield)?.coverageQ ?? 0, SCALE.Q - projBypassQ))
      : ((shield)?.coverageQ ?? 0);
    const shieldHit =
      shield !== undefined &&
      ((shieldSeed % SCALE.Q) < effectiveCoverageQ) &&
      shieldBlocksSegment(shield, target, hitRegion, hitArea);

    const armour = deriveArmourProfile(target.loadout, target.armourState);
    const isEnergyProjectile = !!(wpn).energyType;
    const PROJ_CHANNEL_MASK = isEnergyProjectile ? (1 << DamageChannel.Energy) : (1 << DamageChannel.Kinetic);
    const armourHit = armourCoversHit(
      world,
      regionCoverageQ(armour.coverageByRegion, hitRegion),
      shooter.id,
      target.id,
    );
    const protectedByArmour = armourHit && ((armour.protects & PROJ_CHANNEL_MASK) !== 0);

    let finalEnergy = energy_J;
    if (shield && shieldHit) {
      const shieldResidual = Math.max(0, energy_J - (shield).blockResist_J);
      finalEnergy = mulDiv(shieldResidual, (shield).deflectQ ?? q(0.30), SCALE.Q);
    }
    if (protectedByArmour) {
      if (isEnergyProjectile && armour.reflectivity > q(0)) {
        finalEnergy = mulDiv(finalEnergy, SCALE.Q - armour.reflectivity, SCALE.Q);
      } else if (!isEnergyProjectile) {
        finalEnergy = applyKineticArmourPenetration(finalEnergy, armour.resist_J, armour.protectedDamageMul);
      }
      if (target.armourState) {
        const armourItems = target.loadout.items.filter(it => it.kind === "armour");
        for (const it of armourItems) {
          if ((it).ablative && target.armourState.has(it.id)) {
            const st = target.armourState.get(it.id)!;
            st.resistRemaining_J = Math.max(0, st.resistRemaining_J - energy_J);
          }
        }
      }
    }

    const wpnProxy: Weapon = {
      id: wpn.id,
      kind: "weapon",
      name: wpn.name,
      mass_kg: projMass_kg,
      bulk: q(0),
      damage: ammoDamage,
    };

    impacts.push({
      kind: "impact",
      attackerId: shooter.id,
      targetId: target.id,
      region: hitRegion,
      energy_J: finalEnergy,
      protectedByArmour,
      weaponId: wpn.id,
      wpn: wpnProxy,
      blocked: shieldHit ?? false,
      parried: false,
      hitQuality: q(0.75),
      shieldBlocked: shieldHit ?? false,
      massEff_kg: projMass_kg,
      v_impact_mps,
    });
  }

  trace.onEvent({
    kind: TraceKinds.ProjectileHit,
    tick: world.tick,
    shooterId: shooter.id,
    targetId: target.id,
    weaponId: wpn.id,
    hit,
    ...(hitRegion !== undefined ? { region: hitRegion } : {}),
    distance_m: dist_m,
    energyAtImpact_J: energy_J,
    suppressed,
  });
}

function applyKineticArmourPenetration(energy_J: number, resist_J: number, postMul: Q): number {
  const remaining = Math.max(0, energy_J - Math.max(0, resist_J));
  return mulDiv(remaining, postMul, SCALE.Q);
}

function isqrtBig(n: bigint): bigint {
  if (n <= 0n) return 0n;
  let r = n;
  let r1 = (r + 1n) >> 1n;
  while (r1 < r) { r = r1; r1 = (r + n / r) >> 1n; }
  return r;
}
