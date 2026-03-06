import type { Entity } from "../entity.js";

import { q, clampQ, qMul, mulDiv, SCALE, type Q } from "../../units.js";
import { hasSubstanceType } from "../substance.js";

export function stepSubstances(e: Entity, ambientTemperature_Q?: Q): void {
  if (!e.substances || e.substances.length === 0) return;

  for (const active of e.substances) {
    const sub = active.substance;

    // Absorption: pendingDose → concentration
    const absorbed = qMul(active.pendingDose, sub.absorptionRate);
    active.pendingDose    = clampQ(active.pendingDose    - absorbed, q(0), q(1.0));
    active.concentration  = clampQ(active.concentration  + absorbed, q(0), q(1.0));

    // Elimination — base rate, then modifiers
    let effectiveElimRate = sub.eliminationRate;

    // Phase 10C: substance interactions — modify elimination rate
    if (sub.effectType === "haemostatic" && hasSubstanceType(e, "stimulant")) {
      // Stimulant-induced vasoconstriction antagonises haemostatic absorption: clears 30% faster
      effectiveElimRate = qMul(effectiveElimRate, q(1.30));
    }
    if (sub.effectType === "anaesthetic" && hasSubstanceType(e, "stimulant")) {
      // Stimulant partially counteracts anaesthetic: clears 25% faster
      effectiveElimRate = qMul(effectiveElimRate, q(1.25));
    }
    if (sub.effectType === "haemostatic" && hasSubstanceType(e, "poison")) {
      // Haemostatic partially counteracts poison-induced bleeding: clears 20% slower
      effectiveElimRate = qMul(effectiveElimRate, q(0.80));
    }

    // Phase 10C: temperature-dependent metabolism — cold slows hepatic clearance
    if (ambientTemperature_Q !== undefined && ambientTemperature_Q < q(0.35)) {
      const coldFrac = Math.max(q(0.50) as number, mulDiv(ambientTemperature_Q, SCALE.Q, q(0.35)));
      effectiveElimRate = qMul(effectiveElimRate, coldFrac as Q);
    }

    const eliminated = qMul(active.concentration, effectiveElimRate);
    active.concentration  = clampQ(active.concentration  - eliminated, q(0), q(1.0));

    // Effects — only when above threshold
    if (active.concentration <= sub.effectThreshold) continue;

    const delta = clampQ(active.concentration - sub.effectThreshold, q(0), q(1.0));
    // Phase 10C: anaesthetic onset/strength is reduced when a stimulant is active
    let effectStrengthMod = sub.effectStrength;
    if (sub.effectType === "anaesthetic" && hasSubstanceType(e, "stimulant")) {
      effectStrengthMod = qMul(effectStrengthMod, q(0.75));
    }
    const effectDose = qMul(delta, effectStrengthMod);

    switch (sub.effectType) {
      case "stimulant":
        // Reduces fear and slows fatigue accumulation
        e.condition.fearQ  = clampQ((e.condition.fearQ ?? 0)  - qMul(effectDose, q(0.005)), q(0), q(1.0));
        e.energy.fatigue   = clampQ(e.energy.fatigue   - qMul(effectDose, q(0.003)), q(0), q(1.0));
        break;
      case "anaesthetic":
        // Erodes consciousness
        e.injury.consciousness = clampQ(e.injury.consciousness - qMul(effectDose, q(0.008)), q(0), q(1.0));
        break;
      case "poison": {
        // Internal damage to torso (or first region)
        const torsoReg = e.injury.byRegion["torso"] ?? Object.values(e.injury.byRegion)[0];
        if (torsoReg) {
          torsoReg.internalDamage = clampQ(torsoReg.internalDamage + qMul(effectDose, q(0.002)), q(0), q(1.0));
        }
        e.injury.shock = clampQ(e.injury.shock + qMul(effectDose, q(0.001)), 0, SCALE.Q);
        break;
      }
      case "haemostatic":
        // Reduces bleeding rate across all regions
        for (const reg of Object.values(e.injury.byRegion)) {
          if (reg.bleedingRate > 0) {
            reg.bleedingRate = clampQ(reg.bleedingRate - qMul(effectDose, q(0.003)), q(0), q(1.0));
          }
        }
        break;
    }
  }

  // Remove exhausted substances (keep only those with meaningful dose or concentration)
  e.substances = e.substances.filter(a => a.pendingDose > 1 || a.concentration > 1);
}