import type { Q } from "../../units";

export type AIArchetype = "skirmisher" | "lineInfantry" | "berserker" | "defender";

export interface AIPolicy {
  archetype: AIArchetype;

  // movement and distance
  desiredRange_m: number;     // try to keep this distance to target
  engageRange_m: number;      // if within, attack
  retreatRange_m: number;     // if closer than this and fragile, back off

  // defence
  threatRange_m: number;      // distance at which we consider ourselves "threatened"
  defendWhenThreatenedQ: Q;   // threshold 0..1
  parryBiasQ: Q;              // preference for parry vs block
  dodgeBiasQ: Q;              // preference for dodge vs stand

  // target selection
  retargetCooldownTicks: number;
  focusStickinessQ: Q;        // 0..1: prefer keeping same target
}