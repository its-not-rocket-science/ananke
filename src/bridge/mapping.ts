// src/bridge/mapping.ts — Segment‑to‑bone mapping resolution

import type { SegmentMapping, BodyPlanMapping, BridgeConfig } from "./types.js";
import type { PoseModifier } from "../model3d.js";

// ─── Mapping resolution ────────────────────────────────────────────────────────

/**
 * Find the bone name for a segment ID according to the given mapping.
 * Falls back to defaultBoneName if not found.
 */
export function resolveBoneName(
  segmentId: string,
  mapping: BodyPlanMapping,
  defaultBoneName: string = "root",
): string {
  const seg = mapping.segments.find(s => s.segmentId === segmentId);
  return seg?.boneName ?? defaultBoneName;
}

/**
 * Resolve the full mapping for a body plan ID.
 * Returns the first mapping whose bodyPlanId matches, or undefined.
 */
export function findBodyPlanMapping(
  config: BridgeConfig,
  bodyPlanId: string,
): BodyPlanMapping | undefined {
  return config.mappings.find(m => m.bodyPlanId === bodyPlanId);
}

/**
 * Apply mapping to a pose modifier array, converting segmentId → boneName.
 * If a segment is not mapped, it is omitted (or can be kept with default bone name).
 */
export function mapPoseModifiers(
  poseModifiers: PoseModifier[],
  mapping: BodyPlanMapping,
  defaultBoneName: string = "root",
): Array<{
  segmentId: string;
  boneName: string;
  impairmentQ: number;
  structuralQ: number;
  surfaceQ: number;
}> {
  const result = [];
  for (const pm of poseModifiers) {
    const boneName = resolveBoneName(pm.segmentId, mapping, defaultBoneName);
    result.push({
      segmentId: pm.segmentId,
      boneName,
      impairmentQ: pm.impairmentQ,
      structuralQ: pm.structuralQ,
      surfaceQ: pm.surfaceQ,
    });
  }
  return result;
}

/**
 * Create a default mapping that maps each segment ID to itself as bone name.
 * Useful for testing or as a fallback when no explicit mapping is provided.
 */
export function createIdentityMapping(bodyPlanId: string, segmentIds: string[]): BodyPlanMapping {
  return {
    bodyPlanId,
    segments: segmentIds.map(id => ({ segmentId: id, boneName: id })),
  };
}

// ─── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate that a mapping covers all segment IDs of a body plan.
 * Returns missing segment IDs.
 */
export function validateMappingCoverage(
  mapping: BodyPlanMapping,
  segmentIds: string[],
): string[] {
  const mapped = new Set(mapping.segments.map(s => s.segmentId));
  return segmentIds.filter(id => !mapped.has(id));
}