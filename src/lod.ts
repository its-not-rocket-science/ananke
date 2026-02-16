import type { IndividualAttributes } from "./types";
import { q, type Q } from "./units";

export interface SquadAggregate {
  count: number;
  mean: IndividualAttributes;
  cohesion: Q;
  training: Q;
}

export function aggregateSquad(members: IndividualAttributes[]): SquadAggregate {
  const n = Math.max(1, members.length);

  const sum = {
    morphology: { stature_m: 0, mass_kg: 0, actuatorMass_kg: 0, actuatorScale: 0, structureScale: 0, reachScale: 0 },
    performance: { peakForce_N: 0, peakPower_W: 0, continuousPower_W: 0, reserveEnergy_J: 0, conversionEfficiency: 0 },
    control: { controlQuality: 0, reactionTime_s: 0, stability: 0, fineControl: 0 },
    resilience: {
      surfaceIntegrity: 0, bulkIntegrity: 0, structureIntegrity: 0,
      distressTolerance: 0, shockTolerance: 0, concussionTolerance: 0,
      heatTolerance: 0, coldTolerance: 0,
      fatigueRate: 0, recoveryRate: 0,
    },
  };

  for (const m of members) {
    sum.morphology.stature_m += m.morphology.stature_m;
    sum.morphology.mass_kg += m.morphology.mass_kg;
    sum.morphology.actuatorMass_kg += m.morphology.actuatorMass_kg;
    sum.morphology.actuatorScale += m.morphology.actuatorScale;
    sum.morphology.structureScale += m.morphology.structureScale;
    sum.morphology.reachScale += m.morphology.reachScale;

    sum.performance.peakForce_N += m.performance.peakForce_N;
    sum.performance.peakPower_W += m.performance.peakPower_W;
    sum.performance.continuousPower_W += m.performance.continuousPower_W;
    sum.performance.reserveEnergy_J += m.performance.reserveEnergy_J;
    sum.performance.conversionEfficiency += m.performance.conversionEfficiency;

    sum.control.controlQuality += m.control.controlQuality;
    sum.control.reactionTime_s += m.control.reactionTime_s;
    sum.control.stability += m.control.stability;
    sum.control.fineControl += m.control.fineControl;

    sum.resilience.surfaceIntegrity += m.resilience.surfaceIntegrity;
    sum.resilience.bulkIntegrity += m.resilience.bulkIntegrity;
    sum.resilience.structureIntegrity += m.resilience.structureIntegrity;
    sum.resilience.distressTolerance += m.resilience.distressTolerance;
    sum.resilience.shockTolerance += m.resilience.shockTolerance;
    sum.resilience.concussionTolerance += m.resilience.concussionTolerance;
    sum.resilience.heatTolerance += m.resilience.heatTolerance;
    sum.resilience.coldTolerance += m.resilience.coldTolerance;
    sum.resilience.fatigueRate += m.resilience.fatigueRate;
    sum.resilience.recoveryRate += m.resilience.recoveryRate;
  }

  const div = (x: number) => Math.trunc(x / n);
  const divQ = (x: number): Q => Math.trunc(x / n) as Q;

  const mean: IndividualAttributes = {
    morphology: {
      stature_m: div(sum.morphology.stature_m),
      mass_kg: div(sum.morphology.mass_kg),
      actuatorMass_kg: div(sum.morphology.actuatorMass_kg),
      actuatorScale: divQ(sum.morphology.actuatorScale),
      structureScale: divQ(sum.morphology.structureScale),
      reachScale: divQ(sum.morphology.reachScale),
    },
    performance: {
      peakForce_N: div(sum.performance.peakForce_N),
      peakPower_W: div(sum.performance.peakPower_W),
      continuousPower_W: div(sum.performance.continuousPower_W),
      reserveEnergy_J: div(sum.performance.reserveEnergy_J),
      conversionEfficiency: divQ(sum.performance.conversionEfficiency),
    },
    control: {
      controlQuality: divQ(sum.control.controlQuality),
      reactionTime_s: divQ(sum.control.reactionTime_s),
      stability: divQ(sum.control.stability),
      fineControl: div(sum.control.fineControl),
    },
    resilience: {
      surfaceIntegrity: divQ(sum.resilience.surfaceIntegrity) ,
      bulkIntegrity: divQ(sum.resilience.bulkIntegrity) ,
      structureIntegrity: divQ(sum.resilience.structureIntegrity) ,
      distressTolerance: divQ(sum.resilience.distressTolerance) ,
      shockTolerance: divQ(sum.resilience.shockTolerance) ,
      concussionTolerance: divQ(sum.resilience.concussionTolerance) ,
      heatTolerance: divQ(sum.resilience.heatTolerance) ,
      coldTolerance: divQ(sum.resilience.coldTolerance) ,
      fatigueRate: divQ(sum.resilience.fatigueRate) ,
      recoveryRate: div(sum.resilience.recoveryRate),
    },
  };

  return { count: n, mean, cohesion: q(0.75), training: q(0.65) };
}
