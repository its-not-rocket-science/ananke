import { SCALE, q, clampQ, qMul, mulDiv, cbrtQ, sqrtQ } from "./units";
import { computeEncumbrance, deriveArmourProfile, DEFAULT_CARRY_RULES } from "./equipment";
export function derivePeakForceEff_N(a) {
    const F0 = a.performance.peakForce_N;
    const controlFactor = q(0.7) + qMul(q(0.3), a.control.controlQuality);
    const combined = qMul(a.morphology.actuatorScale, controlFactor);
    return mulDiv(F0, combined, SCALE.Q);
}
export function deriveMaxAcceleration_mps2(a, tractionCoeff) {
    const m = Math.max(1, a.morphology.mass_kg);
    // normalForce ~ m*g. Use g~9.81 and keep deterministic:
    const normalForce_N_scaled = mulDiv(m, 9810 * SCALE.N, SCALE.kg); // scaled N
    const tractionLimit_N = mulDiv(normalForce_N_scaled, tractionCoeff, SCALE.Q);
    const F_eff = derivePeakForceEff_N(a);
    const usable_N = Math.min(F_eff, tractionLimit_N);
    // a = F/m
    return mulDiv(usable_N, SCALE.kg * SCALE.mps2, m * SCALE.N);
}
export function deriveMaxSprintSpeed_mps(a) {
    const m = Math.max(1, a.morphology.mass_kg);
    const P = a.performance.peakPower_W;
    const p2m_Q = mulDiv(P * SCALE.Q, SCALE.kg, m); // Q
    const c = cbrtQ(Math.max(1, p2m_Q));
    const reachSqrt = sqrtQ(a.morphology.reachScale);
    const controlFactor = q(0.6) + qMul(q(0.4), a.control.controlQuality);
    const K = q(6.2);
    const mult = qMul(qMul(qMul(qMul(K, c), reachSqrt), controlFactor), a.performance.conversionEfficiency);
    return mulDiv(mult, SCALE.mps, SCALE.Q);
}
export function deriveJumpHeight_m(a, reserveSpend_J) {
    const m = Math.max(1, a.morphology.mass_kg);
    const Euse = Math.min(a.performance.reserveEnergy_J, reserveSpend_J);
    const controlFactor = q(0.7) + qMul(q(0.3), a.control.controlQuality);
    const Eeff = mulDiv(mulDiv(Euse, a.performance.conversionEfficiency, SCALE.Q), controlFactor, SCALE.Q);
    // h = E/(m*g)
    const denom = mulDiv(m, 9810, SCALE.kg); // ~m*g in N-ish units
    return mulDiv(Eeff, SCALE.m, Math.max(1, denom));
}
export function deriveMovementCaps(a, loadout, ctx) {
    const carryRules = ctx.carryRules ?? DEFAULT_CARRY_RULES;
    const { penalties } = computeEncumbrance(a, loadout, carryRules);
    const armour = deriveArmourProfile(loadout);
    const speedMul = qMul(penalties.speedMul, armour.mobilityMul);
    const accelMul = qMul(penalties.accelMul, armour.mobilityMul);
    const jumpMul = qMul(penalties.jumpMul, armour.mobilityMul);
    const baseV = deriveMaxSprintSpeed_mps(a);
    const baseA = deriveMaxAcceleration_mps2(a, ctx.tractionCoeff);
    const baseH = deriveJumpHeight_m(a, Math.trunc(a.performance.reserveEnergy_J / 6));
    return {
        maxSprintSpeed_mps: mulDiv(baseV, speedMul, SCALE.Q),
        maxAcceleration_mps2: mulDiv(baseA, accelMul, SCALE.Q),
        jumpHeight_m: mulDiv(baseH, jumpMul, SCALE.Q),
    };
}
export function stepEnergyAndFatigue(a, state, loadout, demandedPower_W, dt_s, ctx) {
    const carryRules = ctx.carryRules ?? DEFAULT_CARRY_RULES;
    const { penalties } = computeEncumbrance(a, loadout, carryRules);
    const armour = deriveArmourProfile(loadout);
    const demandMul = qMul(penalties.energyDemandMul, armour.fatigueMul);
    const P = mulDiv(demandedPower_W, demandMul, SCALE.Q);
    const dt = dt_s;
    const E_need = mulDiv(P, dt, SCALE.s);
    const cont = a.performance.continuousPower_W;
    const P_sustain = Math.min(P, cont);
    const E_sustain = mulDiv(P_sustain, dt, SCALE.s);
    const E_excess = Math.max(0, E_need - E_sustain);
    const eff = Math.max(1, a.performance.conversionEfficiency);
    const E_reserveDrain = mulDiv(E_excess * SCALE.Q, 1, eff);
    state.reserveEnergy_J = Math.max(0, state.reserveEnergy_J - E_reserveDrain);
    const cap = Math.max(1, a.performance.reserveEnergy_J);
    const stepFrac_Q = mulDiv(E_reserveDrain * SCALE.Q, 1, cap);
    const k = q(0.15);
    const delta = qMul(qMul(k, stepFrac_Q), a.resilience.fatigueRate);
    state.fatigue = clampQ((state.fatigue + delta), 0, SCALE.Q);
}
