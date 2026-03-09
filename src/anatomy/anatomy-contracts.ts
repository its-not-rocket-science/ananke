import type { BodySegment } from "../sim/bodyplan.js";
import { ExtendedBodyPlanDefinition } from "./anatomy-schema.js";

export type SegmentId = BodySegment["id"];

export type AnatomyFunctionId =
  | "mobility"
  | "manipulation"
  | "cns"
  | "vision"
  | "respiration"
  | "circulation"
  | "digestion"
  | "sensor"
  | "balance"
  | "weaponMount"
  | "vital";

export interface TissueLayerDefinition {
  id: string;
  kind:
    | "skin"
    | "fat"
    | "muscle"
    | "bone"
    | "shell"
    | "membrane"
    | "organ"
    | "other";
  integrity?: number;
  tags?: readonly string[];
}

export interface OrganDefinition {
  id: string;
  kind: string;
  functionIds?: readonly AnatomyFunctionId[];
  vital?: boolean;
  paired?: boolean;
  tags?: readonly string[];
}

export interface SegmentFunctionDefinition {
  id: AnatomyFunctionId | string;
  role?: "primary" | "secondary" | "support" | "none";
  weight?: number;
  tags?: readonly string[];
}

export interface SegmentTargetAliasBlock {
  head?: readonly SegmentId[];
  torso?: readonly SegmentId[];
  leftArm?: readonly SegmentId[];
  rightArm?: readonly SegmentId[];
  leftLeg?: readonly SegmentId[];
  rightLeg?: readonly SegmentId[];
}

export interface SegmentCoverageProfile {
  id: string;
  tags?: readonly string[];
  selectors: readonly SegmentSelector[];
}

export interface SegmentTargetProfile {
  id: string;
  selectors: readonly WeightedSegmentSelector[];
}

export interface WeightedSegmentSelector extends SegmentSelector {
  weight: number;
}

export interface SegmentSelector {
  ids?: readonly SegmentId[];
  tags?: readonly string[];
  functionIds?: readonly string[];
  subtreeOf?: SegmentId;
  anyOf?: readonly SegmentSelector[];
  allOf?: readonly SegmentSelector[];
  exclude?: SegmentSelector;
}

export type AnatomyContractId =
  | "functionalDamage"
  | "vitalOrganWounding"
  | "bilateralSides"
  | "manipulation"
  | "locomotion"
  | "stancePosture"
  | "shieldCoverage"
  | "humanoidTargeting"
  | "organMedicalModel"
  | "weaponMounts";

export interface AnatomyContracts {
  readonly ids: ReadonlySet<AnatomyContractId>;
  readonly humanoidTargeting?: SegmentTargetAliasBlock | undefined;
}

export interface AnatomyCapabilities {
  readonly hasCentralNervousSystem: boolean;
  readonly hasManipulators: boolean;
  readonly hasLocomotion: boolean;
  readonly hasLateralSides: boolean;
  readonly hasVitalOrgans: boolean;
  readonly supportsPostureModel: boolean;
  readonly supportsFineManipulation: boolean;
  readonly supportsShieldCoverage: boolean;
  readonly supportsWeaponMounts: boolean;
  readonly impairmentModel: "functional" | "segment" | "none";
  readonly targetingModel: "profiles" | "aliases" | "segments";
}

export interface AnatomyIndexes {
  readonly segmentsById: ReadonlyMap<SegmentId, BodySegment>;
  readonly childrenById: ReadonlyMap<SegmentId, readonly SegmentId[]>;
  readonly subtreeById: ReadonlyMap<SegmentId, readonly SegmentId[]>;
  readonly segmentsByTag: ReadonlyMap<string, readonly SegmentId[]>;
  readonly segmentsByFunction: ReadonlyMap<string, readonly SegmentId[]>;
  readonly roots: readonly SegmentId[];
}

export interface AnatomySegmentAugmentation {
  readonly tags: readonly string[];
  readonly tissues: readonly TissueLayerDefinition[];
  readonly organs: readonly OrganDefinition[];
  readonly functions: readonly SegmentFunctionDefinition[];
}

export interface CompiledAnatomyModel {
  readonly plan: ExtendedBodyPlanDefinition;
  readonly segmentData: ReadonlyMap<SegmentId, AnatomySegmentAugmentation>;
  readonly indexes: AnatomyIndexes;
  readonly capabilities: AnatomyCapabilities;
  readonly contracts: AnatomyContracts;
  readonly targetProfiles: ReadonlyMap<string, SegmentTargetProfile>;
  readonly coverageProfiles: ReadonlyMap<string, SegmentCoverageProfile>;
}