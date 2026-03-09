import type { BodySegment } from "../sim/bodyplan.js";
import { q, SCALE, type Q } from "../units.js";
import type {
  CompiledAnatomyModel,
  SegmentCoverageProfile,
  SegmentId,
  SegmentSelector,
  SegmentTargetProfile,
} from "./anatomy-contracts.js";

export interface FunctionalHealthSummary {
  mobility: { structural: Q; internal: Q; fracture: Q };
  manipulation: { structural: Q; internal: Q; fracture: Q };
  cns: { structural: Q; internal: Q; fracture: Q };
  senses: { structural: Q; internal: Q; fracture: Q };
  respiration: { structural: Q; internal: Q; fracture: Q };
  circulation: { structural: Q; internal: Q; fracture: Q };
  cognition: { structural: Q; internal: Q; fracture: Q };
  coordination: { structural: Q; internal: Q; fracture: Q };
}

export interface SegmentDamageLike {
  readonly surfaceDamage?: number;
  readonly internalDamage?: number;
  readonly structuralDamage?: number;
  readonly permanentDamage?: number;
  readonly fractured?: boolean;
}

export interface InjuryStateLike {
  readonly byRegion: Record<string, SegmentDamageLike | undefined>;
}

export interface AnatomyHelperRegistry {
  readonly selectors: {
    selectSegmentIds(selector: SegmentSelector): readonly SegmentId[];
    selectSegments(selector: SegmentSelector): readonly BodySegment[];
  };
  readonly targeting?: {
    sampleSegmentId(profileId: string, roll01: number): SegmentId;
  };
  readonly coverage?: {
    coveredSegmentIds(profileId: string): readonly SegmentId[];
    coversSegmentId(profileId: string, segmentId: SegmentId): boolean;
  };
  readonly functionalDamage?: {
    summarize(injury: InjuryStateLike): FunctionalHealthSummary;
    isFunctionDisabled(injury: InjuryStateLike, functionId: string, threshold?: number): boolean;
  };
  readonly humanoidAliases?: {
    resolve(alias: keyof NonNullable<CompiledAnatomyModel["contracts"]["humanoidTargeting"]>): readonly SegmentId[];
  };
}

export function createAnatomyHelpers(model: CompiledAnatomyModel): AnatomyHelperRegistry {
  const selectors = {
    selectSegmentIds: (selector: SegmentSelector): readonly SegmentId[] =>
      resolveSelectorIds(model, selector),

    selectSegments: (selector: SegmentSelector): readonly BodySegment[] =>
      resolveSelectorIds(model, selector)
        .map((id) => model.indexes.segmentsById.get(id))
        .filter((seg): seg is BodySegment => seg !== undefined),
  };

  const targeting =
    model.capabilities.targetingModel !== "segments"
      ? {
          sampleSegmentId: (profileId: string, roll01: number): SegmentId =>
            sampleProfile(model, requireTargetProfile(model, profileId), roll01),
        }
      : undefined;

  const coverage =
    model.capabilities.supportsShieldCoverage
      ? {
          coveredSegmentIds: (profileId: string): readonly SegmentId[] =>
            resolveCoverageProfile(model, profileId),

          coversSegmentId: (profileId: string, segmentId: SegmentId): boolean =>
            resolveCoverageProfile(model, profileId).includes(segmentId),
        }
      : undefined;

  const functionalDamage =
    model.contracts.ids.has("functionalDamage")
      ? {
          summarize: (injury: InjuryStateLike): FunctionalHealthSummary =>
            summarizeFunctionalHealth(model, injury),

          isFunctionDisabled: (
            injury: InjuryStateLike,
            functionId: string,
            threshold = 0.70,
          ): boolean => functionHealth(model, injury, functionId) <= clamp01(1 - threshold),
        }
      : undefined;

  const humanoidAliases =
    model.contracts.humanoidTargeting
      ? {
          resolve: (
            alias: keyof NonNullable<CompiledAnatomyModel["contracts"]["humanoidTargeting"]>,
          ): readonly SegmentId[] => model.contracts.humanoidTargeting?.[alias] ?? [],
        }
      : undefined;

  return {
    selectors,
    ...(targeting ? { targeting } : {}),
    ...(coverage ? { coverage } : {}),
    ...(functionalDamage ? { functionalDamage } : {}),
    ...(humanoidAliases ? { humanoidAliases } : {}),
  };
}

export function resolveSelectorIds(
  model: CompiledAnatomyModel,
  selector: SegmentSelector,
): readonly SegmentId[] {
  let current = new Set<SegmentId>(model.indexes.segmentsById.keys());

  if (selector.ids) current = intersect(current, new Set(selector.ids));
  if (selector.tags) {
    const tagMatches = new Set<SegmentId>();
    for (const tag of selector.tags) {
      for (const id of model.indexes.segmentsByTag.get(tag) ?? []) tagMatches.add(id);
    }
    current = intersect(current, tagMatches);
  }
  if (selector.functionIds) {
    const fnMatches = new Set<SegmentId>();
    for (const fnId of selector.functionIds) {
      for (const id of model.indexes.segmentsByFunction.get(fnId) ?? []) fnMatches.add(id);
    }
    current = intersect(current, fnMatches);
  }
  if (selector.subtreeOf) {
    current = intersect(current, new Set(model.indexes.subtreeById.get(selector.subtreeOf) ?? []));
  }
  if (selector.anyOf) {
    const anyOf = new Set<SegmentId>();
    for (const nested of selector.anyOf) {
      for (const id of resolveSelectorIds(model, nested)) anyOf.add(id);
    }
    current = intersect(current, anyOf);
  }
  if (selector.allOf) {
    for (const nested of selector.allOf) {
      current = intersect(current, new Set(resolveSelectorIds(model, nested)));
    }
  }
  if (selector.exclude) {
    const excluded = new Set(resolveSelectorIds(model, selector.exclude));
    current = difference(current, excluded);
  }

  return [...current];
}

export function summarizeFunctionalHealth(
  model: CompiledAnatomyModel,
  injury: InjuryStateLike,
): FunctionalHealthSummary {
  return {
    mobility: summarizeDamageGroup(model, injury, ["mobility", "locomotion"]),
    manipulation: summarizeDamageGroup(model, injury, ["manipulation"]),
    cns: summarizeDamageGroup(model, injury, ["cns", "cognition", "control"]),
    senses: summarizeDamageGroup(model, injury, ["sensor", "vision", "balance"]),
    respiration: summarizeDamageGroup(model, injury, ["respiration"]),
    circulation: summarizeDamageGroup(model, injury, ["circulation"]),
    cognition: summarizeDamageGroup(model, injury, ["cognition"]),
    coordination: summarizeDamageGroup(model, injury, ["coordination", "stancePosture"]),
  };
}

function summarizeDamageGroup(
  model: CompiledAnatomyModel,
  injury: InjuryStateLike,
  functionIds: readonly string[],
): { structural: Q; internal: Q; fracture: Q } {
  const segmentIds = new Set<string>();

  for (const functionId of functionIds) {
    const ids = model.indexes.segmentsByFunction.get(functionId) ?? [];
    for (const id of ids) segmentIds.add(id);
  }

  const ids = [...segmentIds];
  if (ids.length === 0) {
    return {
      structural: q(0),
      internal: q(0),
      fracture: q(0),
    };
  }

  let structuralSum = 0;
  let internalSum = 0;
  let fractureCount = 0;

  for (const id of ids) {
    const region = injury.byRegion[id];
    structuralSum += region?.structuralDamage ?? 0;
    internalSum += region?.internalDamage ?? 0;
    if (region?.fractured) fractureCount += 1;
  }

  return {
    structural: Math.trunc(structuralSum / ids.length) as Q,
    internal: Math.trunc(internalSum / ids.length) as Q,
    fracture: Math.trunc((fractureCount * SCALE.Q) / ids.length) as Q,
  };
}

export function functionHealth(
  model: CompiledAnatomyModel,
  injury: InjuryStateLike,
  functionId: string,
): number {
  const segmentIds = model.indexes.segmentsByFunction.get(functionId) ?? [];
  if (segmentIds.length === 0) return 1;

  const contributions: number[] = [];
  for (const segmentId of segmentIds) {
    const augmentation = model.segmentData.get(segmentId);
    const fn = augmentation?.functions.find(candidate => candidate.id === functionId);
    const weight = fn?.weight ?? defaultFunctionWeight(fn?.role);
    contributions.push(segmentHealth(injury.byRegion[segmentId]) * weight);
  }

  const totalWeight = segmentIds.reduce((sum, segmentId) => {
    const augmentation = model.segmentData.get(segmentId);
    const fn = augmentation?.functions.find(candidate => candidate.id === functionId);
    return sum + (fn?.weight ?? defaultFunctionWeight(fn?.role));
  }, 0);

  if (totalWeight <= 0) return average(contributions);
  return clamp01(contributions.reduce((sum, value) => sum + value, 0) / totalWeight);
}

export function segmentHealth(region: SegmentDamageLike | undefined): number {
  if (!region) return 1;
  const structural = clamp01(region.structuralDamage ?? 0);
  const internal = clamp01(region.internalDamage ?? 0);
  const surface = clamp01(region.surfaceDamage ?? 0);
  const permanent = clamp01(region.permanentDamage ?? 0);
  const fracturePenalty = region.fractured ? 0.20 : 0;
  return clamp01(1 - (structural * 0.40 + internal * 0.35 + surface * 0.15 + permanent * 0.10 + fracturePenalty));
}

export function sampleProfile(
  model: CompiledAnatomyModel,
  profile: SegmentTargetProfile,
  roll01: number,
): SegmentId {
  const segments = profile.selectors.flatMap(selector => {
    const ids = resolveSelectorIds(model, selector);
    return ids.map(id => ({ id, weight: selector.weight }));
  });

  if (segments.length === 0) {
    return fallbackSegment(model);
  }

  const byId = new Map<SegmentId, number>();
  for (const entry of segments) {
    byId.set(entry.id, (byId.get(entry.id) ?? 0) + entry.weight);
  }

  const total = [...byId.values()].reduce((sum, value) => sum + value, 0);
  if (total <= 0) return fallbackSegment(model);

  let cursor = clamp01(roll01) * total;
  for (const [id, weight] of byId) {
    if (cursor < weight) return id;
    cursor -= weight;
  }

  return [...byId.keys()][byId.size - 1] ?? fallbackSegment(model);
}

function resolveCoverageProfile(model: CompiledAnatomyModel, profileId: string): readonly SegmentId[] {
  const profile = model.coverageProfiles.get(profileId);
  if (!profile) throw new Error(`Unknown coverage profile '${profileId}'.`);
  return unique(profile.selectors.flatMap(selector => resolveSelectorIds(model, selector)));
}

function requireTargetProfile(model: CompiledAnatomyModel, profileId: string): SegmentTargetProfile {
  const profile = model.targetProfiles.get(profileId);
  if (!profile) throw new Error(`Unknown target profile '${profileId}'.`);
  return profile;
}

function fallbackSegment(model: CompiledAnatomyModel): SegmentId {
  return model.plan.segments[model.plan.segments.length - 1]?.id ?? "torso";
}

function defaultFunctionWeight(role: string | undefined): number {
  switch (role) {
    case "primary":
      return 1.0;
    case "secondary":
      return 0.6;
    case "support":
      return 0.35;
    default:
      return 1.0;
  }
}

function average(values: readonly number[]): number {
  const filtered = values.filter(v => Number.isFinite(v));
  if (filtered.length === 0) return 1;
  return clamp01(filtered.reduce((sum, value) => sum + value, 0) / filtered.length);
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

function intersect<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): Set<T> {
  const out = new Set<T>();
  for (const value of left) if (right.has(value)) out.add(value);
  return out;
}

function difference<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): Set<T> {
  const out = new Set<T>();
  for (const value of left) if (!right.has(value)) out.add(value);
  return out;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export type { SegmentCoverageProfile };
