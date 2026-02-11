import type { Q } from "../units";
import { q, SCALE } from "../units";
import type { HitArea } from "./combat";

export type BodyRegion =
  | "head"
  | "torso"
  | "leftArm"
  | "rightArm"
  | "leftLeg"
  | "rightLeg";

export const ALL_REGIONS: readonly BodyRegion[] = [
  "head",
  "torso",
  "leftArm",
  "rightArm",
  "leftLeg",
  "rightLeg",
] as const;

export const DEFAULT_REGION_WEIGHTS: Record<BodyRegion, Q> = {
  head: q(0.12),
  torso: q(0.50),
  leftArm: q(0.095),
  rightArm: q(0.095),
  leftLeg: q(0.095),
  rightLeg: q(0.095),
};

export function regionFromHit(area: HitArea, sideBit: 0 | 1): BodyRegion {
  if (area === "head") return "head";
  if (area === "torso") return "torso";
  if (area === "arm") return sideBit === 0 ? "leftArm" : "rightArm";
  return sideBit === 0 ? "leftLeg" : "rightLeg";
}

export function weightedMean01(values: Record<BodyRegion, Q>, weights: Record<BodyRegion, Q> = DEFAULT_REGION_WEIGHTS): Q {
  let acc = 0;
  for (const k of ALL_REGIONS) acc += Math.trunc((values[k] * weights[k]) / SCALE.Q);
  return acc as Q;
}
