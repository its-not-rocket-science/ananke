import type { Entity } from "../entity.js";
import type { WorldState } from "../world.js";
import { q, clampQ, qMul, mulDiv, SCALE, type Q } from "../../units.js";
import { buildTraitProfile } from "../../traits.js";
import { deriveArmourProfile } from "../../equipment.js";
import { ALL_REGIONS, BodyRegion, DEFAULT_REGION_WEIGHTS } from "../body.js";
import { getExposureWeight } from "../bodyplan.js";
import { DamageChannel } from "../../channels.js";
import { armourCoversHit } from "../kernel.js";
import { regionKOFactor, totalBleedingRate } from "../injury.js";
import { getSkill } from "../skills.js";
import { v3 } from "../vec3.js";
import { TICK_HZ, DT_S } from "../tick.js";
/* ------------------ Conditions -> injury (armour-aware) ------------------ */

export const SHOCK_FROM_FLUID = q(0.0040);
export const SHOCK_FROM_INTERNAL = q(0.0020);
export const CONSC_LOSS_FROM_SHOCK = q(0.0100);
export const CONSC_LOSS_FROM_SUFF = q(0.0200);
export const FATAL_FLUID_LOSS: Q = q(0.80) as Q;


export function stepConditionsToInjury(e: Entity, world: WorldState, ambientTemperature_Q?: Q): void {
  const traitProfile = buildTraitProfile(e.traits);
  const armour = deriveArmourProfile(e.loadout);

  // Phase 8: use body plan segments when available; fall back to humanoid defaults.
  const planSegments = e.bodyPlan?.segments ?? null;

  // Exposure weights: "what tends to be exposed" for systemic hazards.
  const exposureWeights = (channel: DamageChannel): Record<string, Q> => {
    if (planSegments) {
      // Data-driven: per-segment per-channel weights from body plan
      const out: Record<string, Q> = {};
      for (const seg of planSegments) out[seg.id] = getExposureWeight(seg, channel);
      return out;
    }
    // Humanoid fallback
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
        // Chemical/corrosive aerosols: more even, but torso still prominent.
        // Note: condition.corrosiveExposure feeds this channel — Chemical and
        // Corrosive are unified here. DamageChannel.Corrosive is reserved for
        // future liquid-contact mechanics with a distinct distribution profile.
        return {
          head: q(0.16),
          torso: q(0.36),
          leftArm: q(0.12),
          rightArm: q(0.12),
          leftLeg: q(0.12),
          rightLeg: q(0.12),
        };
      case DamageChannel.Radiation:
        // Penetrating radiation: roughly proportional to mass (torso dominant).
        return {
          head: q(0.12),
          torso: q(0.52),
          leftArm: q(0.09),
          rightArm: q(0.09),
          leftLeg: q(0.09),
          rightLeg: q(0.09),
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
        return DEFAULT_REGION_WEIGHTS;
    }
  };

  const applyDoseToRegion = (channel: DamageChannel, region: BodyRegion, dose: Q): Q => {
    if (dose <= 0) return q(0);
    if ((traitProfile.immuneMask & (1 << channel)) !== 0) return q(0);

    let out = dose;
    if ((traitProfile.resistantMask & (1 << channel)) !== 0) out = Math.trunc(out / 2);

    const cov = (armour.coverageByRegion)[region] ?? q(0);
    const armCovers = armourCoversHit(world, cov, e.id, (e.id ^ 0xBEEF) + (channel << 8) + regionSalt(region));
    if (armCovers && ((armour.protects & (1 << channel)) !== 0)) {
      const mul = armour.channelResistMul[channel] ?? q(1.0);

      // A simple "resist factor" curve; for non-kinetic we treat resist_J as a generalised protective capacity.
      const resistFactor = clampQ(
        q(1.0) - (mulDiv(Math.min(armour.resist_J, 800) * SCALE.Q, 1, 800)),
        q(0.20),
        q(1.0),
      );

      out = qMul(qMul(out, resistFactor), armour.protectedDamageMul);
      out = qMul(out, mul);
    }
    return out;
  };

  const distribute = (channel: DamageChannel, dose: Q): Record<string, Q> => {
    const w = exposureWeights(channel);
    const out: Record<string, Q> = {};
    const regionList = planSegments ? planSegments.map(s => s.id) : ALL_REGIONS as readonly string[];
    for (const r of regionList) out[r] = qMul(dose, w[r] ?? q(0));
    return out;
  };

  const fireBy = distribute(DamageChannel.Thermal, e.condition.onFire);
  const corrBy = distribute(DamageChannel.Chemical, e.condition.corrosiveExposure);
  const elecBy = distribute(DamageChannel.Electrical, e.condition.electricalOverload);
  const radBy = distribute(DamageChannel.Radiation, e.condition.radiation);

  // Suffocation is global rather than surface-localised.
  const suff = (() => {
    if ((traitProfile.immuneMask & (1 << DamageChannel.Suffocation)) !== 0) return q(0);
    let out = e.condition.suffocation;
    if ((traitProfile.resistantMask & (1 << DamageChannel.Suffocation)) !== 0) out = Math.trunc(out / 2);

    // Simple: masks/helmets reduce suffocation slightly if they protect Suffocation.
    const armCovers = armourCoversHit(world, (armour.coverageByRegion)["head"] ?? q(0), e.id, e.id ^ 0x5AFF);
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
  // Radiation: primary effect is internal cellular damage accumulating slowly.
  // Rate calibrated so continuous exposure at q(1.0) reaches ~50% internal
  // damage on the torso (highest-weight region) after ~250 ticks (12.5 s).
  const RAD_INTERNAL_PER_TICK = q(0.0008);
  const RAD_SHOCK_PER_TICK = q(0.0003);

  const allRegionIds = planSegments ? planSegments.map(s => s.id as BodyRegion) : ALL_REGIONS;
  for (const r of allRegionIds) {
    const fire = applyDoseToRegion(DamageChannel.Thermal,    r, fireBy[r] ?? q(0));
    const corr = applyDoseToRegion(DamageChannel.Chemical,   r, corrBy[r] ?? q(0));
    const elec = applyDoseToRegion(DamageChannel.Electrical, r, elecBy[r] ?? q(0));
    const rad  = applyDoseToRegion(DamageChannel.Radiation,  r, radBy[r]  ?? q(0));

    const reg = e.injury.byRegion[r];
    if (!reg) continue;
    if (fire > 0) {
      reg.surfaceDamage = clampQ(reg.surfaceDamage + qMul(fire, FIRE_SURFACE_PER_TICK), 0, SCALE.Q);
      e.injury.shock = clampQ(e.injury.shock + qMul(fire, FIRE_SHOCK_PER_TICK), 0, SCALE.Q);
    }
    if (corr > 0) {
      reg.surfaceDamage = clampQ(reg.surfaceDamage + qMul(corr, CORR_SURFACE_PER_TICK), 0, SCALE.Q);
      reg.internalDamage = clampQ(reg.internalDamage + qMul(corr, CORR_INTERNAL_PER_TICK), 0, SCALE.Q);
    }
    if (elec > 0) {
      reg.internalDamage = clampQ(reg.internalDamage + qMul(elec, ELEC_INTERNAL_PER_TICK), 0, SCALE.Q);
      e.condition.stunned = clampQ(e.condition.stunned + qMul(elec, ELEC_STUNNED_RISE), 0, SCALE.Q);
    }
    if (rad > 0) {
      reg.internalDamage = clampQ(reg.internalDamage + qMul(rad, RAD_INTERNAL_PER_TICK), 0, SCALE.Q);
      e.injury.shock = clampQ(e.injury.shock + qMul(rad, RAD_SHOCK_PER_TICK), 0, SCALE.Q);
    }
  }

  if (suff > 0) {
    e.injury.shock = clampQ(e.injury.shock + qMul(suff, SUFF_SHOCK_PER_TICK), 0, SCALE.Q);
  }

  // Phase 10: ambient temperature stress
  if (ambientTemperature_Q !== undefined) {
    const COMFORT_HIGH: Q = q(0.65) as Q;
    const COMFORT_LOW:  Q = q(0.35) as Q;

    if (ambientTemperature_Q > COMFORT_HIGH) {
      // Heat stress: shock + mild surface damage; heatTolerance scales dose
      const excess = clampQ((ambientTemperature_Q - COMFORT_HIGH) as Q, q(0), q(1.0));
      const baseDose = qMul(excess, q(0.025));
      const heatTol  = Math.max(1, e.attributes.resilience.heatTolerance);
      const dose     = mulDiv(baseDose, SCALE.Q, heatTol);
      e.injury.shock = clampQ((e.injury.shock + dose) as Q, 0, SCALE.Q);
      const torsoReg = e.injury.byRegion["torso"] ?? Object.values(e.injury.byRegion)[0];
      if (torsoReg) {
        torsoReg.surfaceDamage = clampQ(
          (torsoReg.surfaceDamage + qMul(dose, q(0.20))) as Q, 0, SCALE.Q,
        );
      }
    } else if (ambientTemperature_Q < COMFORT_LOW) {
      // Cold stress: shock + fatigue; coldTolerance scales dose
      const deficit = clampQ((COMFORT_LOW - ambientTemperature_Q) as Q, q(0), q(1.0));
      const baseDose = qMul(deficit, q(0.020));
      const coldTol  = Math.max(1, e.attributes.resilience.coldTolerance);
      const dose     = mulDiv(baseDose, SCALE.Q, coldTol);
      e.injury.shock   = clampQ((e.injury.shock   + dose)                  as Q, 0, SCALE.Q);
      e.energy.fatigue = clampQ((e.energy.fatigue + qMul(dose, q(0.50)))   as Q, 0, SCALE.Q);
    }
  }
}

export function stepInjuryProgression(e: Entity, tick: number): void {
  if (e.injury.dead) return;

  // Phase 9: natural clotting — bleedingRate decays proportional to structural integrity.
  // Heavily damaged tissue clots slowly; intact tissue clots quickly.
  const CLOT_RATE_PER_TICK: Q = q(0.0002) as Q;
  const INFECTION_BLEED_THRESHOLD: Q = q(0.05) as Q;
  const INFECTION_INT_THRESHOLD: Q = q(0.10) as Q;
  const INFECTION_ONSET_TICKS = 100;
  const INFECTION_DAMAGE_PER_TICK: Q = q(0.0003) as Q;
  const PERMANENT_THRESHOLD: Q = q(0.90) as Q;
  const PERMANENT_FLOOR_MUL: Q = q(0.75) as Q;

  for (const reg of Object.values(e.injury.byRegion)) {
    // Clotting
    if (reg.bleedingRate > 0) {
      const structureIntegrity = clampQ((SCALE.Q - reg.structuralDamage) as Q, q(0), q(1.0));
      const clotRate = qMul(structureIntegrity, CLOT_RATE_PER_TICK);
      reg.bleedingRate = clampQ((reg.bleedingRate - clotRate) as Q, q(0), q(1.0));
    }

    // Infection timer — track consecutive ticks of active bleeding
    if (reg.bleedingRate > INFECTION_BLEED_THRESHOLD) {
      reg.bleedDuration_ticks++;
      if (reg.bleedDuration_ticks >= INFECTION_ONSET_TICKS
          && reg.internalDamage > INFECTION_INT_THRESHOLD
          && reg.infectedTick < 0) {
        reg.infectedTick = tick;
      }
    } else {
      reg.bleedDuration_ticks = Math.max(0, reg.bleedDuration_ticks - 1);
    }

    // Infection progression — infected regions accumulate internal damage
    if (reg.infectedTick >= 0) {
      reg.internalDamage = clampQ(reg.internalDamage + INFECTION_DAMAGE_PER_TICK, 0, SCALE.Q);
    }

    // Permanent damage floor update — set when structural damage is very high
    if (reg.structuralDamage >= PERMANENT_THRESHOLD) {
      const newFloor = qMul(reg.structuralDamage, PERMANENT_FLOOR_MUL);
      if (newFloor > reg.permanentDamage) reg.permanentDamage = newFloor as Q;
    }
  }

  // Phase 8B: hemolymph accumulation — breached open-fluid segments leak each tick
  if (e.bodyPlan) {
    for (const seg of e.bodyPlan.segments) {
      if (seg.fluidSystem !== "open" || seg.hemolymphLossRate === undefined) continue;
      const segState = e.injury.byRegion[seg.id];
      if (!segState) continue;
      const breachAt = seg.breachThreshold ?? q(0.8);
      if (segState.structuralDamage >= breachAt) {
        const loss = qMul(seg.hemolymphLossRate, segState.structuralDamage as Q);
        e.injury.hemolymphLoss = clampQ((e.injury.hemolymphLoss ?? 0) + loss, 0, SCALE.Q);
      }
    }
  }

  // Phase 8B: hemolymph fatal threshold — same as fluidLoss
  const FATAL_HEMOLYMPH: Q = q(0.80) as Q;
  if ((e.injury.hemolymphLoss ?? 0) >= FATAL_HEMOLYMPH) {
    e.injury.dead = true;
    e.injury.consciousness = q(0);
    e.velocity_mps = v3(0, 0, 0);
    return;
  }

  // Phase 8B: molting tick countdown and structural repair on completion
  if (e.molting?.active) {
    e.molting.ticksRemaining = Math.max(0, e.molting.ticksRemaining - 1);
    if (e.molting.ticksRemaining === 0) {
      e.molting.active = false;
      // Repair regeneratesViaMolting segments
      if (e.bodyPlan) {
        for (const seg of e.bodyPlan.segments) {
          if (!seg.regeneratesViaMolting) continue;
          const segState = e.injury.byRegion[seg.id];
          if (!segState) continue;
          segState.structuralDamage = clampQ(
            (segState.structuralDamage - q(0.10)) as Q, 0, SCALE.Q,
          );
        }
      }
    }
  }

  // Phase 8B: hemolymph clotting — passive decay of hemolymph loss each tick
  const HEMOLYMPH_CLOT_RATE: Q = q(0.0001) as Q;
  if ((e.injury.hemolymphLoss ?? 0) > 0) {
    e.injury.hemolymphLoss = clampQ(
      ((e.injury.hemolymphLoss ?? 0) - HEMOLYMPH_CLOT_RATE) as Q, 0, SCALE.Q,
    );
  }

  // Phase 8B: auto-molt trigger — fires when average structural damage on
  // regeneratesViaMolting segments reaches MOLT_TRIGGER_THRESHOLD and no molt
  // is already active. Post-molt repair (−q(0.10)) typically drops average below
  // threshold, preventing immediate re-trigger for minor damage; severely damaged
  // entities will re-molt until damage falls below the threshold.
  const MOLT_TRIGGER_THRESHOLD: Q = q(0.40) as Q;
  const MOLT_DURATION_TICKS = TICK_HZ * 60; // 60 seconds at TICK_HZ fps
  if (e.bodyPlan && !e.molting?.active) {
    const regenSegs = e.bodyPlan.segments.filter(s => s.regeneratesViaMolting);
    if (regenSegs.length > 0) {
      let totalDmg = 0;
      for (const seg of regenSegs) {
        totalDmg += e.injury.byRegion[seg.id]?.structuralDamage ?? 0;
      }
      const avgDmg = Math.trunc(totalDmg / regenSegs.length) as Q;
      if (avgDmg >= MOLT_TRIGGER_THRESHOLD) {
        e.molting = {
          active: true,
          ticksRemaining: MOLT_DURATION_TICKS,
          softeningSegments: regenSegs.map(s => s.id),
        };
      }
    }
  }

  // Phase 8B: wing passive regeneration — slow structural repair on wing segments
  // when not actively molting (molting repair is handled above on completion).
  const WING_REGEN_RATE: Q = q(0.0001) as Q;
  if (e.bodyPlan?.locomotion.flight && !e.molting?.active) {
    for (const wid of e.bodyPlan.locomotion.flight.wingSegments) {
      const ws = e.injury.byRegion[wid];
      if (ws && ws.structuralDamage > 0) {
        ws.structuralDamage = clampQ(
          (ws.structuralDamage - WING_REGEN_RATE) as Q, 0, SCALE.Q,
        );
      }
    }
  }

  const bleedRate = totalBleedingRate(e.injury);
  const rawBleedThisTick = Math.trunc((bleedRate * DT_S) / SCALE.s);
  // Phase 7: medical.treatmentRateMul reduces fluid loss (passive wound management)
  const medSkill = getSkill(e.skills, "medical");
  const bleedThisTick = medSkill.treatmentRateMul > SCALE.Q
    ? mulDiv(rawBleedThisTick, SCALE.Q, medSkill.treatmentRateMul)
    : rawBleedThisTick;
  e.injury.fluidLoss = clampQ(e.injury.fluidLoss + bleedThisTick, 0, SCALE.Q);


  e.injury.shock = clampQ(
    e.injury.shock + qMul(e.injury.fluidLoss, SHOCK_FROM_FLUID) + qMul(e.injury.byRegion["torso"]?.internalDamage ?? q(0), SHOCK_FROM_INTERNAL),
    0,
    SCALE.Q
  );

  const CONSC_LOSS_FROM_SHOCK = q(0.0100);
  const CONSC_LOSS_FROM_SUFF = q(0.0200);

  const loss = clampQ(qMul(e.injury.shock, CONSC_LOSS_FROM_SHOCK) + qMul(e.condition.suffocation, CONSC_LOSS_FROM_SUFF) + qMul(regionKOFactor(e.injury), q(0.0100)), 0, SCALE.Q);
  e.injury.consciousness = clampQ(e.injury.consciousness - loss, 0, SCALE.Q);

  // Phase 9: explicit fatal fluid loss threshold (complements the shock path)
  const FATAL_FLUID_LOSS: Q = q(0.80) as Q;
  if (e.injury.fluidLoss >= FATAL_FLUID_LOSS || e.injury.shock >= SCALE.Q || e.injury.consciousness === 0) {
    e.injury.dead = true;
    e.injury.consciousness = q(0);
    e.velocity_mps = v3(0, 0, 0);
  }
}


function regionSalt(region: string): number {
  // Well-known humanoid regions get stable salts; others use a hash of the id string.
  switch (region) {
    case "head":     return 0x11;
    case "torso":    return 0x22;
    case "leftArm":  return 0x33;
    case "rightArm": return 0x44;
    case "leftLeg":  return 0x55;
    case "rightLeg": return 0x66;
    default: {
      // Deterministic hash of the segment id (FNV-1a-like)
      let h = 0x77;
      for (let i = 0; i < region.length; i++) h = ((h ^ region.charCodeAt(i)) * 0x1f) & 0xFF;
      return h || 0x77;
    }
  }
}
