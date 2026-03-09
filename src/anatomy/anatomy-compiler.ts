import type { BodySegment } from "../sim/bodyplan.js";
import type {
  AnatomyCapabilities,
  AnatomyContractId,
  AnatomyContracts,
  AnatomyIndexes,
  AnatomySegmentAugmentation,
  CompiledAnatomyModel,
  SegmentCoverageProfile,
  SegmentFunctionDefinition,
  SegmentId,
  SegmentTargetProfile,
} from "./anatomy-contracts.js";
import {
  type ExtendedBodyPlanDefinition,
  type ValidationIssue,
  validateExtendedBodyPlan,
} from "./anatomy-schema.js";

export interface CompileAnatomyResult {
  readonly ok: boolean;
  readonly model?: CompiledAnatomyModel;
  readonly issues: readonly ValidationIssue[];
}

export function compileAnatomyDefinition(input: unknown): CompileAnatomyResult {
  const validated = validateExtendedBodyPlan(input as ExtendedBodyPlanDefinition);
  if (!validated.ok || !validated.value) {
    return { ok: false, issues: validated.issues };
  }

  const plan = validated.value;
  const indexes = buildIndexes(plan);
  const segmentData = buildSegmentData(plan, indexes.segmentsById);
  const contracts = deriveContracts(plan, segmentData, indexes);
  const capabilities = deriveCapabilities(plan, segmentData, contracts);

  const model: CompiledAnatomyModel = {
    plan,
    segmentData,
    indexes,
    contracts,
    capabilities,
    targetProfiles: toProfileMap(plan.targetProfiles),
    coverageProfiles: toCoverageMap(plan.coverageProfiles),
  };

  return { ok: true, model, issues: [] };
}

export function compileAnatomyDefinitionOrThrow(input: unknown): CompiledAnatomyModel {
  const result = compileAnatomyDefinition(input);
  if (!result.ok || !result.model) {
    const message = result.issues.map(issue => `${issue.path}: ${issue.message}`).join("\n");
    throw new Error(`Invalid anatomy definition\n${message}`);
  }
  return result.model;
}

export function buildIndexes(plan: ExtendedBodyPlanDefinition): AnatomyIndexes {
  const segmentsById = new Map<SegmentId, BodySegment>();
  const childrenMutable = new Map<SegmentId, SegmentId[]>();
  const roots: SegmentId[] = [];

  for (const segment of plan.segments) {
    segmentsById.set(segment.id, segment);
    childrenMutable.set(segment.id, []);
  }

  for (const segment of plan.segments) {
    if (segment.parent === null) roots.push(segment.id);
    else childrenMutable.get(segment.parent)?.push(segment.id);
  }

  const subtreeMutable = new Map<SegmentId, SegmentId[]>();
  const visit = (id: SegmentId): SegmentId[] => {
    const children = childrenMutable.get(id) ?? [];
    const nested = children.flatMap(child => visit(child));
    const subtree = [id, ...nested];
    subtreeMutable.set(id, subtree);
    return subtree;
  };
  for (const root of roots) visit(root);
  for (const id of segmentsById.keys()) if (!subtreeMutable.has(id)) visit(id);

    const tags = new Map<string, SegmentId[]>();
  const functions = new Map<string, SegmentId[]>();

  for (const segment of plan.segments) {
    const inferredTags = inferLegacySegmentTags(segment);
    for (const tag of inferredTags) pushIndex(tags, tag, segment.id);

    for (const fnId of inferLegacyFunctionIds(segment)) {
      pushIndex(functions, fnId, segment.id);
    }

    const explicit = plan.segmentData?.[segment.id];
    for (const tag of explicit?.tags ?? []) {
      pushIndex(tags, tag, segment.id);
    }
    for (const fn of explicit?.functions ?? []) {
      pushIndex(functions, fn.id, segment.id);
    }
    for (const organ of explicit?.organs ?? []) {
      for (const tag of organ.tags ?? []) {
        pushIndex(tags, tag, segment.id);
      }
      for (const fnId of organ.functionIds ?? []) {
        pushIndex(functions, fnId, segment.id);
      }
      if (organ.vital) {
        pushIndex(functions, "vital", segment.id);
      }
    }
  }

  return {
    segmentsById,
    childrenById: freezeIndex(childrenMutable),
    subtreeById: freezeIndex(subtreeMutable),
    segmentsByTag: freezeIndex(tags),
    segmentsByFunction: freezeIndex(functions),
    roots,
  };
}

export function buildSegmentData(
  plan: ExtendedBodyPlanDefinition,
  segmentsById: ReadonlyMap<SegmentId, BodySegment>,
): ReadonlyMap<SegmentId, AnatomySegmentAugmentation> {
  const out = new Map<SegmentId, AnatomySegmentAugmentation>();

  for (const [segmentId, segment] of segmentsById) {
    const def = plan.segmentData?.[segmentId];
    const inferredFunctions = inferLegacyFunctions(segment);
    const mergedFunctions = mergeFunctions(inferredFunctions, def?.functions ?? []);
    const mergedTags = unique([
      ...inferLegacySegmentTags(segment),
      ...(def?.tags ?? []),
      ...mergedFunctions.flatMap(fn => fn.tags ?? []),
      ...(def?.organs?.flatMap(organ => organ.tags ?? []) ?? []),
    ]);

    out.set(segmentId, {
      tags: mergedTags,
      tissues: [...(def?.tissues ?? [])],
      organs: [...(def?.organs ?? [])],
      functions: mergedFunctions,
    });
  }

  return out;
}

export function deriveContracts(
  plan: ExtendedBodyPlanDefinition,
  segmentData: ReadonlyMap<SegmentId, AnatomySegmentAugmentation>,
  indexes: AnatomyIndexes,
): AnatomyContracts {
  const ids = new Set<AnatomyContractId>();

  const hasFunctions = [...segmentData.values()].some(seg => seg.functions.length > 0);
  const hasVitalOrgans = [...segmentData.values()].some(seg => seg.organs.some(organ => organ.vital));
  const hasManipulation = [...segmentData.values()].some(seg =>
    seg.functions.some(fn => fn.id === "manipulation"),
  );
  const hasLocomotion = [...segmentData.values()].some(seg => seg.functions.some(fn => fn.id === "mobility"));
  const hasWeaponMounts = [...segmentData.values()].some(seg =>
    seg.functions.some(fn => fn.id === "weaponMount"),
  );
  const hasCoverage = (plan.coverageProfiles?.length ?? 0) > 0;
  const hasHumanoidAliases = plan.contracts?.humanoidTargeting !== undefined;
  const hasBilateral = plan.symmetry === "bilateral" || inferBilateral(indexes);

  if (hasFunctions) ids.add("functionalDamage");
  if (hasVitalOrgans) ids.add("vitalOrganWounding");
  if (hasManipulation) ids.add("manipulation");
  if (hasLocomotion) ids.add("locomotion");
  if (hasCoverage) ids.add("shieldCoverage");
  if (hasWeaponMounts) ids.add("weaponMounts");
  if (hasBilateral) ids.add("bilateralSides");
  if (hasLocomotion && hasBilateral) ids.add("stancePosture");
  if (hasVitalOrgans) ids.add("organMedicalModel");
  if (hasHumanoidAliases) ids.add("humanoidTargeting");

  return {
    ids,
    humanoidTargeting: plan.contracts?.humanoidTargeting,
  };
}

export function deriveCapabilities(
  plan: ExtendedBodyPlanDefinition,
  segmentData: ReadonlyMap<SegmentId, AnatomySegmentAugmentation>,
  contracts: AnatomyContracts,
): AnatomyCapabilities {
  const hasCentralNervousSystem = [...segmentData.values()].some(seg =>
    seg.functions.some(fn => fn.id === "cns"),
  ) || plan.cnsLayout.type === "centralized";
  const hasManipulators = contracts.ids.has("manipulation");
  const hasLocomotion = contracts.ids.has("locomotion");
  const hasLateralSides = contracts.ids.has("bilateralSides");
  const hasVitalOrgans = contracts.ids.has("vitalOrganWounding");
  const supportsPostureModel = contracts.ids.has("stancePosture");
  const supportsFineManipulation = [...segmentData.values()].some(seg =>
    seg.functions.some(fn => fn.id === "manipulation" && (fn.role === "primary" || fn.weight === undefined || fn.weight >= 0.9)),
  );
  const supportsShieldCoverage = contracts.ids.has("shieldCoverage");
  const supportsWeaponMounts = contracts.ids.has("weaponMounts");

  const targetingModel =
    (plan.targetProfiles?.length ?? 0) > 0
      ? "profiles"
      : contracts.ids.has("humanoidTargeting")
        ? "aliases"
        : "segments";

  return {
    hasCentralNervousSystem,
    hasManipulators,
    hasLocomotion,
    hasLateralSides,
    hasVitalOrgans,
    supportsPostureModel,
    supportsFineManipulation,
    supportsShieldCoverage,
    supportsWeaponMounts,
    impairmentModel: contracts.ids.has("functionalDamage") ? "functional" : plan.segments.length > 0 ? "segment" : "none",
    targetingModel,
  };
}

function inferLegacyFunctions(segment: BodySegment): SegmentFunctionDefinition[] {
  const out: SegmentFunctionDefinition[] = [];
  if (segment.locomotionRole && segment.locomotionRole !== "none") {
    out.push({
      id: "mobility",
      role: mapLegacyRole(segment.locomotionRole),
      weight: segment.locomotionRole === "primary" ? 1.0 : 0.6,
      tags: ["locomotor"],
    });
  }
  if (segment.manipulationRole && segment.manipulationRole !== "none") {
    out.push({
      id: "manipulation",
      role: mapLegacyRole(segment.manipulationRole),
      weight: segment.manipulationRole === "primary" ? 1.0 : 0.6,
      tags: ["manipulator"],
    });
  }
  if (segment.cnsRole && segment.cnsRole !== "none") {
    out.push({
      id: "cns",
      role: segment.cnsRole === "central" ? "primary" : "secondary",
      weight: segment.cnsRole === "central" ? 1.0 : 0.6,
      tags: ["cns"],
    });
  }
  return out;
}

function inferLegacyFunctionIds(segment: BodySegment): string[] {
  return inferLegacyFunctions(segment).map(fn => fn.id);
}

function inferLegacySegmentTags(segment: BodySegment): string[] {
  const tags = new Set<string>();
  const id = segment.id.toLowerCase();
  if (id.includes("left")) tags.add("left");
  if (id.includes("right")) tags.add("right");
  if (id.includes("head")) tags.add("head");
  if (id.includes("torso") || id.includes("chest") || id.includes("abdomen")) tags.add("torso");
  if (id.includes("arm") || id.includes("hand") || id.includes("forelimb") || id.includes("tentacle")) {
    tags.add("manipulator");
  }
  if (id.includes("leg") || id.includes("foot") || id.includes("hindlimb") || id.includes("hoof")) {
    tags.add("locomotor");
  }
  if (id.includes("wing")) tags.add("wing");
  if (id.includes("tail")) tags.add("tail");
  return [...tags];
}

function inferBilateral(indexes: AnatomyIndexes): boolean {
  const leftCount = (indexes.segmentsByTag.get("left") ?? []).length;
  const rightCount = (indexes.segmentsByTag.get("right") ?? []).length;
  return leftCount > 0 && leftCount === rightCount;
}

function mergeFunctions(
  inferred: readonly SegmentFunctionDefinition[],
  explicit: readonly SegmentFunctionDefinition[],
): SegmentFunctionDefinition[] {
  const byId = new Map<string, SegmentFunctionDefinition>();
  for (const fn of inferred) byId.set(fn.id, { ...fn, tags: [...(fn.tags ?? [])] });
  for (const fn of explicit) {
    const prior = byId.get(fn.id);
    byId.set(fn.id, {
      id: fn.id,
      role: fn.role ?? prior?.role ?? "none",
      weight: fn.weight ?? prior?.weight ?? 0,
      tags: unique([...(prior?.tags ?? []), ...(fn.tags ?? [])]),
    });
  }
  return [...byId.values()];
}

function mapLegacyRole(role: "primary" | "secondary" | "none"): "primary" | "secondary" | "support" | "none" {
  if (role === "none") return "none";
  return role;
}

function toProfileMap(profiles: readonly SegmentTargetProfile[] | undefined): ReadonlyMap<string, SegmentTargetProfile> {
  return new Map((profiles ?? []).map(profile => [profile.id, profile]));
}

function toCoverageMap(
  profiles: readonly SegmentCoverageProfile[] | undefined,
): ReadonlyMap<string, SegmentCoverageProfile> {
  return new Map((profiles ?? []).map(profile => [profile.id, profile]));
}

function pushIndex<T>(index: Map<string, T[]>, key: string, value: T): void {
  const prior = index.get(key);
  if (prior) prior.push(value);
  else index.set(key, [value]);
}

function freezeIndex<T>(index: Map<string, T[]>): ReadonlyMap<string, readonly T[]> {
  return new Map([...index.entries()].map(([key, value]) => [key, [...value]]));
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
