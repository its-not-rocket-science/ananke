import { q } from "../../units";
import type { AIPolicy } from "./types";
import { SCALE } from "../../units";

export const AI_PRESETS: Record<string, AIPolicy> = {
  lineInfantry: {
    archetype: "lineInfantry",
    desiredRange_m: Math.trunc(0.9 * SCALE.m),
    engageRange_m: Math.trunc(1.2 * SCALE.m),
    retreatRange_m: Math.trunc(0.35 * SCALE.m),

    threatRange_m: Math.trunc(1.6 * SCALE.m),
    defendWhenThreatenedQ: q(0.35),
    parryBiasQ: q(0.55),
    dodgeBiasQ: q(0.10),

    retargetCooldownTicks: 15,
    focusStickinessQ: q(0.75),
  },
  skirmisher: {
    archetype: "skirmisher",
    desiredRange_m: Math.trunc(1.4 * SCALE.m),
    engageRange_m: Math.trunc(1.6 * SCALE.m),
    retreatRange_m: Math.trunc(0.50 * SCALE.m),

    threatRange_m: Math.trunc(1.6 * SCALE.m),
    defendWhenThreatenedQ: q(0.25),
    parryBiasQ: q(0.35),
    dodgeBiasQ: q(0.45),

    retargetCooldownTicks: 10,
    focusStickinessQ: q(0.55),
  },
};