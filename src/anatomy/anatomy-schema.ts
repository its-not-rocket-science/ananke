import type { BodyPlan } from "../sim/bodyplan.js";
import type {
  AnatomyFunctionId,
  OrganDefinition,
  SegmentCoverageProfile,
  SegmentFunctionDefinition,
  SegmentSelector,
  SegmentTargetAliasBlock,
  SegmentTargetProfile,
  TissueLayerDefinition,
  WeightedSegmentSelector,
} from "./anatomy-contracts.js";

export interface ExtendedBodySegmentData {
  tags?: readonly string[];
  tissues?: readonly TissueLayerDefinition[];
  organs?: readonly OrganDefinition[];
  functions?: readonly SegmentFunctionDefinition[];
}

export interface ExtendedBodyPlanDefinition extends BodyPlan {
  symmetry?: "none" | "bilateral" | "radial";
  segmentData?: Record<string, ExtendedBodySegmentData>;
  targetProfiles?: readonly SegmentTargetProfile[];
  coverageProfiles?: readonly SegmentCoverageProfile[];
  contracts?: {
    humanoidTargeting?: SegmentTargetAliasBlock;
  };
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly issues: readonly ValidationIssue[];
}

const KNOWN_FUNCTION_IDS: ReadonlySet<string> = new Set<AnatomyFunctionId | string>([
  "mobility",
  "manipulation",
  "cns",
  "vision",
  "respiration",
  "circulation",
  "digestion",
  "sensor",
  "balance",
  "weaponMount",
  "vital",
]);

export function validateExtendedBodyPlan(
  input: ExtendedBodyPlanDefinition,
): ValidationResult<ExtendedBodyPlanDefinition> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return fail([{ path: "$", message: "Expected an object body plan definition." }]);
  }

  const plan = input as ExtendedBodyPlanDefinition;

  if (typeof plan.id !== "string" || plan.id.length === 0) {
    issues.push({ path: "id", message: "Body plan id must be a non-empty string." });
  }

  if (!Array.isArray(plan.segments) || plan.segments.length === 0) {
    issues.push({ path: "segments", message: "Body plan must define at least one segment." });
    return fail(issues);
  }

  const segmentIds = new Set<string>();
  const parentsById = new Map<string, string | null>();

  for (let i = 0; i < plan.segments.length; i += 1) {
    const seg = plan.segments[i];
    const base = `segments[${i}]`;

    if (!isRecord(seg)) {
      issues.push({ path: base, message: "Segment must be an object." });
      continue;
    }
    if (typeof seg.id !== "string" || seg.id.length === 0) {
      issues.push({ path: `${base}.id`, message: "Segment id must be a non-empty string." });
      continue;
    }
    if (segmentIds.has(seg.id)) {
      issues.push({ path: `${base}.id`, message: `Duplicate segment id '${seg.id}'.` });
    }
    segmentIds.add(seg.id);

    if (!(typeof seg.parent === "string" || seg.parent === null)) {
      issues.push({ path: `${base}.parent`, message: "Segment parent must be a string id or null." });
    } else {
      parentsById.set(seg.id, seg.parent);
    }

    if (typeof seg.mass_kg !== "number") {
      issues.push({ path: `${base}.mass_kg`, message: "Segment mass_kg must be numeric." });
    }
    if (!isRecord(seg.exposureWeight)) {
      issues.push({ path: `${base}.exposureWeight`, message: "Segment exposureWeight must be an object." });
    }
  }

  for (const [segmentId, parentId] of parentsById) {
    if (parentId !== null && !segmentIds.has(parentId)) {
      issues.push({
        path: `segments[${segmentId}].parent`,
        message: `Segment '${segmentId}' points to unknown parent '${parentId}'.`,
      });
    }
  }

  detectCycles(parentsById, issues);
  validateSegmentData(plan, segmentIds, issues);
  validateProfiles(plan, segmentIds, issues);
  validateContracts(plan, segmentIds, issues);

  return issues.length === 0 ? ok(plan) : fail(issues);
}

function validateSegmentData(
  plan: ExtendedBodyPlanDefinition,
  segmentIds: ReadonlySet<string>,
  issues: ValidationIssue[],
): void {
  const data = plan.segmentData;
  if (!data) return;
  if (!isRecord(data)) {
    issues.push({ path: "segmentData", message: "segmentData must be an object keyed by segment id." });
    return;
  }

  for (const [segmentId, def] of Object.entries(data)) {
    if (!segmentIds.has(segmentId)) {
      issues.push({
        path: `segmentData.${segmentId}`,
        message: `segmentData references unknown segment '${segmentId}'.`,
      });
      continue;
    }
    if (!isRecord(def)) {
      issues.push({ path: `segmentData.${segmentId}`, message: "segmentData entry must be an object." });
      continue;
    }

    if (def.tags !== undefined && !isStringArray(def.tags)) {
      issues.push({ path: `segmentData.${segmentId}.tags`, message: "tags must be a string array." });
    }
    if (def.tissues !== undefined) validateTissues(segmentId, def.tissues, issues);
    if (def.organs !== undefined) validateOrgans(segmentId, def.organs, issues);
    if (def.functions !== undefined) validateFunctions(segmentId, def.functions, issues);
  }
}

function validateTissues(segmentId: string, tissues: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(tissues)) {
    issues.push({ path: `segmentData.${segmentId}.tissues`, message: "tissues must be an array." });
    return;
  }
  const ids = new Set<string>();
  tissues.forEach((t, idx) => {
    const base = `segmentData.${segmentId}.tissues[${idx}]`;
    if (!isRecord(t)) {
      issues.push({ path: base, message: "Tissue definition must be an object." });
      return;
    }
    if (typeof t.id !== "string" || t.id.length === 0) {
      issues.push({ path: `${base}.id`, message: "Tissue id must be a non-empty string." });
    } else if (ids.has(t.id)) {
      issues.push({ path: `${base}.id`, message: `Duplicate tissue id '${t.id}'.` });
    } else {
      ids.add(t.id);
    }
    if (typeof t.kind !== "string" || t.kind.length === 0) {
      issues.push({ path: `${base}.kind`, message: "Tissue kind must be a non-empty string." });
    }
    if (t.integrity !== undefined && typeof t.integrity !== "number") {
      issues.push({ path: `${base}.integrity`, message: "Tissue integrity must be numeric when present." });
    }
    if (t.tags !== undefined && !isStringArray(t.tags)) {
      issues.push({ path: `${base}.tags`, message: "Tissue tags must be a string array." });
    }
  });
}

function validateOrgans(segmentId: string, organs: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(organs)) {
    issues.push({ path: `segmentData.${segmentId}.organs`, message: "organs must be an array." });
    return;
  }
  const ids = new Set<string>();
  organs.forEach((o, idx) => {
    const base = `segmentData.${segmentId}.organs[${idx}]`;
    if (!isRecord(o)) {
      issues.push({ path: base, message: "Organ definition must be an object." });
      return;
    }
    if (typeof o.id !== "string" || o.id.length === 0) {
      issues.push({ path: `${base}.id`, message: "Organ id must be a non-empty string." });
    } else if (ids.has(o.id)) {
      issues.push({ path: `${base}.id`, message: `Duplicate organ id '${o.id}'.` });
    } else {
      ids.add(o.id);
    }
    if (typeof o.kind !== "string" || o.kind.length === 0) {
      issues.push({ path: `${base}.kind`, message: "Organ kind must be a non-empty string." });
    }
    if (o.functionIds !== undefined && !isStringArray(o.functionIds)) {
      issues.push({ path: `${base}.functionIds`, message: "Organ functionIds must be a string array." });
    }
    if (o.tags !== undefined && !isStringArray(o.tags)) {
      issues.push({ path: `${base}.tags`, message: "Organ tags must be a string array." });
    }
    if (o.vital !== undefined && typeof o.vital !== "boolean") {
      issues.push({ path: `${base}.vital`, message: "Organ vital must be boolean when present." });
    }
  });
}

function validateFunctions(segmentId: string, fns: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(fns)) {
    issues.push({ path: `segmentData.${segmentId}.functions`, message: "functions must be an array." });
    return;
  }
  fns.forEach((fn, idx) => {
    const base = `segmentData.${segmentId}.functions[${idx}]`;
    if (!isRecord(fn)) {
      issues.push({ path: base, message: "Function definition must be an object." });
      return;
    }
    if (typeof fn.id !== "string" || fn.id.length === 0) {
      issues.push({ path: `${base}.id`, message: "Function id must be a non-empty string." });
    }
    if (fn.role !== undefined && !["primary", "secondary", "support", "none"].includes(String(fn.role))) {
      issues.push({ path: `${base}.role`, message: "Function role must be primary/secondary/support/none." });
    }
    if (fn.weight !== undefined && typeof fn.weight !== "number") {
      issues.push({ path: `${base}.weight`, message: "Function weight must be numeric when present." });
    }
    if (fn.tags !== undefined && !isStringArray(fn.tags)) {
      issues.push({ path: `${base}.tags`, message: "Function tags must be a string array." });
    }
    if (typeof fn.id === "string" && !KNOWN_FUNCTION_IDS.has(fn.id) && !fn.id.startsWith("x:")) {
      issues.push({
        path: `${base}.id`,
        message: `Unknown function id '${fn.id}'. Use a known id or namespace custom ids with 'x:'.`,
      });
    }
  });
}

function validateProfiles(
  plan: ExtendedBodyPlanDefinition,
  segmentIds: ReadonlySet<string>,
  issues: ValidationIssue[],
): void {
  if (plan.targetProfiles !== undefined) {
    if (!Array.isArray(plan.targetProfiles)) {
      issues.push({ path: "targetProfiles", message: "targetProfiles must be an array." });
    } else {
      const ids = new Set<string>();
      plan.targetProfiles.forEach((profile, idx) => {
        const base = `targetProfiles[${idx}]`;
        if (!validateProfileId(base, profile?.id, ids, issues)) return;
        if (!Array.isArray(profile.selectors) || profile.selectors.length === 0) {
          issues.push({ path: `${base}.selectors`, message: "Target profile must define selectors." });
        } else {
          profile.selectors.forEach(
            (selector: WeightedSegmentSelector, sIdx: number) => {
              validateSelector(`${base}.selectors[${sIdx}]`, selector, segmentIds, issues);

              if (typeof selector.weight !== "number" || selector.weight <= 0) {
                issues.push({
                  path: `${base}.selectors[${sIdx}].weight`,
                  message: "Weighted selector weight must be a positive number.",
                });
              }
            },
          );
        }
      });
    }
  }

  if (plan.coverageProfiles !== undefined) {
    if (!Array.isArray(plan.coverageProfiles)) {
      issues.push({ path: "coverageProfiles", message: "coverageProfiles must be an array." });
    } else {
      const ids = new Set<string>();
      plan.coverageProfiles.forEach((profile, idx) => {
        const base = `coverageProfiles[${idx}]`;
        if (!validateProfileId(base, profile?.id, ids, issues)) return;
        if (profile.tags !== undefined && !isStringArray(profile.tags)) {
          issues.push({ path: `${base}.tags`, message: "Coverage profile tags must be a string array." });
        }
        if (!Array.isArray(profile.selectors) || profile.selectors.length === 0) {
          issues.push({ path: `${base}.selectors`, message: "Coverage profile must define selectors." });
        } else {
          profile.selectors.forEach((selector: WeightedSegmentSelector, sIdx: number) => {
            validateSelector(`${base}.selectors[${sIdx}]`, selector, segmentIds, issues);
          });
        }
      });
    }
  }
}

function validateContracts(
  plan: ExtendedBodyPlanDefinition,
  segmentIds: ReadonlySet<string>,
  issues: ValidationIssue[],
): void {
  const humanoid = plan.contracts?.humanoidTargeting;
  if (!humanoid) return;

  const paths: Array<[keyof SegmentTargetAliasBlock, readonly string[] | undefined]> = [
    ["head", humanoid.head],
    ["torso", humanoid.torso],
    ["leftArm", humanoid.leftArm],
    ["rightArm", humanoid.rightArm],
    ["leftLeg", humanoid.leftLeg],
    ["rightLeg", humanoid.rightLeg],
  ];

  for (const [key, ids] of paths) {
    if (ids === undefined) continue;
    if (!isStringArray(ids)) {
      issues.push({
        path: `contracts.humanoidTargeting.${String(key)}`,
        message: "Humanoid alias entry must be a string array.",
      });
      continue;
    }
    for (const id of ids) {
      if (!segmentIds.has(id)) {
        issues.push({
          path: `contracts.humanoidTargeting.${String(key)}`,
          message: `Unknown segment '${id}' in humanoid target alias '${String(key)}'.`,
        });
      }
    }
  }
}

function validateSelector(
  path: string,
  selector: unknown,
  segmentIds: ReadonlySet<string>,
  issues: ValidationIssue[],
): void {
  if (!isRecord(selector)) {
    issues.push({ path, message: "Selector must be an object." });
    return;
  }

  const hasAnyCriterion =
    selector.ids !== undefined ||
    selector.tags !== undefined ||
    selector.functionIds !== undefined ||
    selector.subtreeOf !== undefined ||
    selector.anyOf !== undefined ||
    selector.allOf !== undefined;

  if (!hasAnyCriterion) {
    issues.push({ path, message: "Selector must define at least one criterion." });
  }
  if (selector.ids !== undefined) {
    if (!isStringArray(selector.ids)) {
      issues.push({ path: `${path}.ids`, message: "ids must be a string array." });
    } else {
      for (const id of selector.ids) {
        if (!segmentIds.has(id)) {
          issues.push({ path: `${path}.ids`, message: `Unknown segment '${id}' in selector.` });
        }
      }
    }
  }
  if (selector.tags !== undefined && !isStringArray(selector.tags)) {
    issues.push({ path: `${path}.tags`, message: "tags must be a string array." });
  }
  if (selector.functionIds !== undefined && !isStringArray(selector.functionIds)) {
    issues.push({ path: `${path}.functionIds`, message: "functionIds must be a string array." });
  }
  if (selector.subtreeOf !== undefined) {
    if (typeof selector.subtreeOf !== "string") {
      issues.push({ path: `${path}.subtreeOf`, message: "subtreeOf must be a segment id string." });
    } else if (!segmentIds.has(selector.subtreeOf)) {
      issues.push({ path: `${path}.subtreeOf`, message: `Unknown subtree root '${selector.subtreeOf}'.` });
    }
  }
  if (selector.anyOf !== undefined) {
    if (!Array.isArray(selector.anyOf) || selector.anyOf.length === 0) {
      issues.push({ path: `${path}.anyOf`, message: "anyOf must be a non-empty selector array." });
    } else {
      selector.anyOf.forEach((nested, idx) =>
        validateSelector(`${path}.anyOf[${idx}]`, nested, segmentIds, issues),
      );
    }
  }
  if (selector.allOf !== undefined) {
    if (!Array.isArray(selector.allOf) || selector.allOf.length === 0) {
      issues.push({ path: `${path}.allOf`, message: "allOf must be a non-empty selector array." });
    } else {
      selector.allOf.forEach((nested, idx) =>
        validateSelector(`${path}.allOf[${idx}]`, nested, segmentIds, issues),
      );
    }
  }
  if (selector.exclude !== undefined) {
    validateSelector(`${path}.exclude`, selector.exclude, segmentIds, issues);
  }
}

function validateProfileId(
  path: string,
  id: unknown,
  ids: Set<string>,
  issues: ValidationIssue[],
): id is string {
  if (typeof id !== "string" || id.length === 0) {
    issues.push({ path: `${path}.id`, message: "Profile id must be a non-empty string." });
    return false;
  }
  if (ids.has(id)) {
    issues.push({ path: `${path}.id`, message: `Duplicate profile id '${id}'.` });
    return false;
  }
  ids.add(id);
  return true;
}

function detectCycles(
  parentsById: ReadonlyMap<string, string | null>,
  issues: ValidationIssue[],
): void {
  const seen = new Set<string>();
  const visiting = new Set<string>();

  const walk = (id: string): void => {
    if (seen.has(id)) return;
    if (visiting.has(id)) {
      issues.push({ path: `segments[${id}]`, message: `Cycle detected at segment '${id}'.` });
      return;
    }
    visiting.add(id);
    const parent = parentsById.get(id);
    if (parent) walk(parent);
    visiting.delete(id);
    seen.add(id);
  };

  for (const id of parentsById.keys()) walk(id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(v => typeof v === "string");
}

function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value, issues: [] };
}

function fail<T>(issues: readonly ValidationIssue[]): ValidationResult<T> {
  return { ok: false, issues };
}

export type { SegmentSelector };
