import { DamageChannel, type ChannelMask, channelMask } from "./channels.js";
import { Q, SCALE, clampQ, q, qMul } from "./units.js";
import type { IndividualAttributes } from "./types.js";

export type TraitId =
  | "sealed"
  | "nonConductive"
  | "distributedControl"
  | "noSurfaceLayer"
  | "noBulkMedium"
  | "highThermalMass"
  | "fragileStructure"
  | "reinforcedStructure"
  | "chemicalImmune"
  | "radiationHardened"
  | "leader"
  | "standardBearer";

export type TraitMult = Partial<Record<TraitMultKey, Q>>;

export interface TraitEffect {
  id: TraitId;
  name: string;
  description: string;
  immuneTo?: ChannelMask;
  resistantTo?: ChannelMask;
  mult?: TraitMult;
}

export const TRAITS: Record<TraitId, TraitEffect> = {
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
  leader: {
    id: "leader",
    name: "Leader",
    description: "Provides morale aura to nearby allies, reducing their fear accumulation.",
  },
  standardBearer: {
    id: "standardBearer",
    name: "Standard-bearer",
    description: "Carries a rallying standard; provides a smaller morale aura to nearby allies.",
  },
};


export type TraitMultKey =
  | "shockTolerance"
  | "concussionTolerance"
  | "distressTolerance"
  | "surfaceIntegrity"
  | "bulkIntegrity"
  | "structureIntegrity"
  | "structureScale"
  | "heatTolerance"
  | "coldTolerance"
  | "controlQuality";

type Accessor = {
  get: (a: IndividualAttributes) => number;
  set: (a: IndividualAttributes, v: number) => void;
  // Optional per-field clamp range if you want more realism later:
  max?: number;
};

const MULT_ACCESSORS: Record<TraitMultKey, Accessor> = {
  // Resilience
  shockTolerance: {
    get: (a) => a.resilience.shockTolerance,
    set: (a, v) => { a.resilience.shockTolerance = v; },
    max: 10 * SCALE.Q,
  },
  concussionTolerance: {
    get: (a) => a.resilience.concussionTolerance,
    set: (a, v) => { a.resilience.concussionTolerance = v; },
    max: 10 * SCALE.Q,
  },
  distressTolerance: {
    get: (a) => a.resilience.distressTolerance,
    set: (a, v) => { a.resilience.distressTolerance = v; },
    max: 10 * SCALE.Q,
  },

  // Integrity (your traits imply these exist; adjust nesting if needed)
  surfaceIntegrity: {
    get: (a) => a.resilience.surfaceIntegrity,
    set: (a, v) => { a.resilience.surfaceIntegrity = v; },
    max: 10 * SCALE.Q,
  },
  bulkIntegrity: {
    get: (a) => a.resilience.bulkIntegrity,
    set: (a, v) => { a.resilience.bulkIntegrity = v; },
    max: 10 * SCALE.Q,
  },
  structureIntegrity: {
    get: (a) => a.resilience.structureIntegrity,
    set: (a, v) => { a.resilience.structureIntegrity = v; },
    max: 10 * SCALE.Q,
  },

  // Morphology / structure scaling
  structureScale: {
    get: (a) => a.morphology.structureScale,
    set: (a, v) => { a.morphology.structureScale = v; },
    max: 10 * SCALE.Q,
  },

  // Thermoregulation / tolerances
  heatTolerance: {
    get: (a) => a.resilience.heatTolerance,
    set: (a, v) => { a.resilience.heatTolerance = v; },
    max: 10 * SCALE.Q,
  },
  coldTolerance: {
    get: (a) => a.resilience.coldTolerance,
    set: (a, v) => { a.resilience.coldTolerance = v; },
    max: 10 * SCALE.Q,
  },

  // Control / coordination quality
  controlQuality: {
    get: (a) => a.control.controlQuality,
    set: (a, v) => { a.control.controlQuality = v; },
    max: 10 * SCALE.Q,
  },
} as const;

type AttrMutator = (a: IndividualAttributes) => void;

function applyMult(a: IndividualAttributes, key: TraitMultKey, mult: Q): void {
  const acc = MULT_ACCESSORS[key];
  const current = acc.get(a);
  const next = clampQ(qMul(current, mult), 0, acc.max ?? (10 * SCALE.Q));
  acc.set(a, next);
}

export const TRAIT_MUTATORS: Record<TraitId, AttrMutator> = (() => {
  const out = {} as Record<TraitId, AttrMutator>;
  for (const id of Object.keys(TRAITS) as TraitId[]) {
    const trait = TRAITS[id];
    out[id] = (a) => {
      if (!trait.mult) return;
      for (const [k, mult] of Object.entries(trait.mult) as Array<[TraitMultKey, Q]>) {
        applyMult(a, k, mult);
      }
    };
  }
  return out;
})();

export interface TraitProfile {
  traits: TraitId[];
  immuneMask: ChannelMask;
  resistantMask: ChannelMask;
}

export function buildTraitProfile(traits: readonly TraitId[]): TraitProfile {
  let immuneMask = 0;
  let resistantMask = 0;
  for (const id of traits) {
    const t = TRAITS[id];
    if (t.immuneTo) immuneMask |= t.immuneTo;
    if (t.resistantTo) resistantMask |= t.resistantTo;
  }
  return { traits: [...traits].sort(), immuneMask, resistantMask };
}
export function applyTraitsToAttributes(
  base: IndividualAttributes,
  traits: readonly TraitId[],
): IndividualAttributes {
  const out: IndividualAttributes = structuredClone(base);

  // Deterministic ordering
  const sorted = [...traits].sort();

  for (const t of sorted) {
    const mut = TRAIT_MUTATORS[t];
    if (!mut) throw new Error(`Unknown trait: ${t}`);
    mut(out);
  }

  return out;
}
