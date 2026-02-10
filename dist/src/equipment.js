import { SCALE, q, clampQ, qMul, mulDiv } from "./units";
import { DamageChannel, channelMask } from "./channels";
export const DEFAULT_CARRY_RULES = {
    capacityFactor: q(0.25),
    bulkToMassFactor: q(0.06),
};
export function computeLoadoutTotals(loadout, armourIsWorn = true) {
    const items = [...loadout.items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    let mass = 0;
    let bulk = 0;
    let wornMass = 0;
    let wornBulk = 0;
    for (const it of items) {
        mass += it.mass_kg;
        bulk = (bulk + it.bulk) | 0;
        if (armourIsWorn && it.kind === "armour") {
            wornMass += it.mass_kg;
            wornBulk = (wornBulk + it.bulk) | 0;
        }
    }
    return {
        carriedMass_kg: mass,
        carriedBulk: bulk,
        wornMass_kg: wornMass,
        wornBulk: wornBulk,
        carriedMassFracOfBody: q(0),
    };
}
export function deriveCarryCapacityMass_kg(a, rules = DEFAULT_CARRY_RULES) {
    // kgScaled ≈ peakForce(N) * k / g
    // Use g ≈ 9.81 (in milli-units 9810) for deterministic integer maths.
    // peakForce_N is scaled by SCALE.N.
    const peakForceScaled = a.performance.peakForce_N; // SCALE.N
    const numerator = BigInt(peakForceScaled) * BigInt(SCALE.kg) * BigInt(rules.capacityFactor);
    const denom = BigInt(SCALE.N) * BigInt(SCALE.Q) * 9810n;
    const kgScaled = Number(numerator / denom);
    return Math.max(1, kgScaled);
}
export function computeEncumbrance(a, loadout, rules = DEFAULT_CARRY_RULES) {
    const totals = computeLoadoutTotals(loadout);
    const bodyMass = Math.max(1, a.morphology.mass_kg);
    totals.carriedMassFracOfBody = mulDiv(totals.carriedMass_kg * SCALE.Q, SCALE.kg, bodyMass);
    const capacity_kg = Math.max(1, deriveCarryCapacityMass_kg(a, rules));
    const massRatio = mulDiv(totals.carriedMass_kg * SCALE.Q, 1, capacity_kg);
    const bulkAbove1 = Math.max(0, totals.carriedBulk - SCALE.Q);
    const bulkTerm = qMul(bulkAbove1, rules.bulkToMassFactor);
    const r = clampQ((massRatio + bulkTerm), 0, 5 * SCALE.Q);
    const penalties = encumbranceCurve(r, a);
    return { totals, penalties };
}
function encumbranceCurve(r, a) {
    const overloaded = r > q(1.5);
    const speedMul = piecewiseMul(r, q(1.0), q(0.92), q(0.78), q(0.55));
    const accelMul = piecewiseMul(r, q(1.0), q(0.88), q(0.70), q(0.45));
    const jumpMul = piecewiseMul(r, q(1.0), q(0.90), q(0.68), q(0.40));
    const baseDemand = piecewiseMul(r, q(1.0), q(1.10), q(1.30), q(1.65));
    const energyDemandMul = clampQ(qMul(baseDemand, a.resilience.fatigueRate), q(0.5), q(3.0));
    const controlMul = piecewiseMul(r, q(1.0), q(0.96), q(0.88), q(0.75));
    const stabilityMul = piecewiseMul(r, q(1.0), q(0.94), q(0.82), q(0.65));
    return {
        speedMul,
        accelMul,
        jumpMul,
        energyDemandMul,
        controlMul,
        stabilityMul,
        encumbranceRatio: r,
        overloaded,
    };
}
function piecewiseMul(r, a, b, c, d) {
    const r05 = q(0.5), r10 = q(1.0), r15 = q(1.5);
    if (r <= r05)
        return a;
    if (r <= r10) {
        const t = mulDiv((r - r05), SCALE.Q, (r10 - r05));
        return (a + mulDiv((b - a), t, SCALE.Q));
    }
    if (r <= r15) {
        const t = mulDiv((r - r10), SCALE.Q, (r15 - r10));
        return (b + mulDiv((c - b), t, SCALE.Q));
    }
    return d;
}
export function deriveArmourProfile(loadout) {
    const items = [...loadout.items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    let protects = 0;
    let protectedMul = q(1.0);
    let mobilityMul = q(1.0);
    let fatigueMul = q(1.0);
    for (const it of items) {
        if (it.kind !== "armour")
            continue;
        protects |= it.protects;
        protectedMul = qMul(protectedMul, it.protectedDamageMul);
        mobilityMul = qMul(mobilityMul, it.mobilityMul ?? q(1.0));
        fatigueMul = qMul(fatigueMul, it.fatigueMul ?? q(1.0));
    }
    return {
        protects,
        protectedDamageMul: clampQ(protectedMul, q(0.05), q(1.0)),
        mobilityMul: clampQ(mobilityMul, q(0.30), q(1.0)),
        fatigueMul: clampQ(fatigueMul, q(0.80), q(3.0)),
    };
}
export const STARTER_WEAPONS = [
    {
        id: "wpn_club",
        kind: "weapon",
        name: "Wooden club",
        mass_kg: Math.round(1.2 * SCALE.kg),
        bulk: q(1.4),
        reach_m: Math.round(0.7 * SCALE.m),
        handlingMul: q(0.95),
        strikeEffectiveMassFrac: q(0.18),
        strikeSpeedMul: q(0.95),
    },
    {
        id: "wpn_knife",
        kind: "weapon",
        name: "Knife",
        mass_kg: Math.round(0.3 * SCALE.kg),
        bulk: q(1.1),
        reach_m: Math.round(0.2 * SCALE.m),
        handlingMul: q(1.0),
        strikeEffectiveMassFrac: q(0.10),
        strikeSpeedMul: q(1.05),
    },
];
export const STARTER_ARMOUR = [
    {
        id: "arm_leather",
        kind: "armour",
        name: "Leather armour",
        mass_kg: Math.round(6.0 * SCALE.kg),
        bulk: q(1.6),
        protects: channelMask(DamageChannel.Kinetic),
        protectedDamageMul: q(0.85),
        mobilityMul: q(0.95),
        fatigueMul: q(1.08),
    },
    {
        id: "arm_mail",
        kind: "armour",
        name: "Mail armour",
        mass_kg: Math.round(10.0 * SCALE.kg),
        bulk: q(1.9),
        protects: channelMask(DamageChannel.Kinetic),
        protectedDamageMul: q(0.75),
        mobilityMul: q(0.90),
        fatigueMul: q(1.15),
    },
];
