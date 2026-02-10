import { DamageChannel, channelMask } from "./channels";
import { SCALE, clampQ, q, qMul } from "./units";
export const TRAITS = {
    sealed: {
        id: "sealed",
        name: "Sealed",
        description: "Resistant to chemical exposure and suffocation-like hazards (sealed system).",
        resistantTo: channelMask(DamageChannel.Chemical, DamageChannel.Suffocation),
        mult: { shockTolerance: q(1.10) },
    },
    nonConductive: {
        id: "nonConductive",
        name: "Non-conductive",
        description: "Highly resistant to electrical hazards.",
        immuneTo: channelMask(DamageChannel.Electrical),
    },
    distributedControl: {
        id: "distributedControl",
        name: "Distributed control",
        description: "No single control core; more tolerant of local disruption.",
        resistantTo: channelMask(DamageChannel.ControlDisruption),
        mult: { concussionTolerance: q(1.20), shockTolerance: q(1.10) },
    },
    noSurfaceLayer: {
        id: "noSurfaceLayer",
        name: "No surface layer",
        description: "Surface injuries are largely irrelevant.",
        mult: { surfaceIntegrity: q(9.99) },
    },
    noBulkMedium: {
        id: "noBulkMedium",
        name: "No bulk medium",
        description: "Bulk trauma effects are reduced.",
        mult: { bulkIntegrity: q(2.00), shockTolerance: q(1.25) },
    },
    highThermalMass: {
        id: "highThermalMass",
        name: "High thermal mass",
        description: "Temperature changes slowly; tolerant of thermal exposure.",
        mult: { heatTolerance: q(1.30), coldTolerance: q(1.30) },
    },
    fragileStructure: {
        id: "fragileStructure",
        name: "Fragile structure",
        description: "More susceptible to structural failure.",
        mult: { structureIntegrity: q(0.75), structureScale: q(0.90) },
    },
    reinforcedStructure: {
        id: "reinforcedStructure",
        name: "Reinforced structure",
        description: "Upgraded load-bearing structure.",
        mult: { structureIntegrity: q(1.25), structureScale: q(1.10) },
    },
    chemicalImmune: {
        id: "chemicalImmune",
        name: "Chemical immune",
        description: "Unaffected by chemical/toxin hazards.",
        immuneTo: channelMask(DamageChannel.Chemical),
    },
    radiationHardened: {
        id: "radiationHardened",
        name: "Radiation hardened",
        description: "Resistant to radiation damage and radiation-induced control glitches.",
        resistantTo: channelMask(DamageChannel.Radiation, DamageChannel.ControlDisruption),
        mult: { controlQuality: q(1.05) },
    },
};
export function buildTraitProfile(traits) {
    let immuneMask = 0;
    let resistantMask = 0;
    for (const id of traits) {
        const t = TRAITS[id];
        if (t.immuneTo)
            immuneMask |= t.immuneTo;
        if (t.resistantTo)
            resistantMask |= t.resistantTo;
    }
    return { traits: [...traits].sort(), immuneMask, resistantMask };
}
export function applyTraitsToAttributes(a, traits) {
    const ids = [...traits].sort();
    const out = JSON.parse(JSON.stringify(a));
    const mulField = (path, mult) => {
        let obj = out;
        for (let i = 0; i < path.length - 1; i++) {
            const k = path[i]; // assert not undefined
            obj = obj[k];
        }
        const key = path[path.length - 1];
        obj[key] = clampQ(qMul(obj[key], mult), 0, 10 * SCALE.Q);
    };
    for (const id of ids) {
        const t = TRAITS[id];
        const m = t.mult;
        if (!m)
            continue;
        if (m.actuatorScale)
            mulField(["morphology", "actuatorScale"], m.actuatorScale);
        if (m.structureScale)
            mulField(["morphology", "structureScale"], m.structureScale);
        if (m.conversionEfficiency)
            mulField(["performance", "conversionEfficiency"], m.conversionEfficiency);
        if (m.controlQuality)
            mulField(["control", "controlQuality"], m.controlQuality);
        if (m.stability)
            mulField(["control", "stability"], m.stability);
        if (m.surfaceIntegrity)
            mulField(["resilience", "surfaceIntegrity"], m.surfaceIntegrity);
        if (m.bulkIntegrity)
            mulField(["resilience", "bulkIntegrity"], m.bulkIntegrity);
        if (m.structureIntegrity)
            mulField(["resilience", "structureIntegrity"], m.structureIntegrity);
        if (m.concussionTolerance)
            mulField(["resilience", "concussionTolerance"], m.concussionTolerance);
        if (m.shockTolerance)
            mulField(["resilience", "shockTolerance"], m.shockTolerance);
        if (m.heatTolerance)
            mulField(["resilience", "heatTolerance"], m.heatTolerance);
        if (m.coldTolerance)
            mulField(["resilience", "coldTolerance"], m.coldTolerance);
        if (m.fatigueRate)
            mulField(["resilience", "fatigueRate"], m.fatigueRate);
        if (m.recoveryRate)
            mulField(["resilience", "recoveryRate"], m.recoveryRate);
    }
    return out;
}
