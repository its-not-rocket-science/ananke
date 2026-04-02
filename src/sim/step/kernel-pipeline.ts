import type { CommandMap } from "../commands.js";
import type { KernelContext } from "../context.js";
import type { WorldState } from "../world.js";

export interface KernelPhase {
  name: string;
  responsibility: string;
  run(world: WorldState, cmds: CommandMap, ctx: KernelContext): void;
}

export const KERNEL_PHASE_ORDER = [
  "prepare",
  "cooldowns",
  "capabilityCasting",
  "intent",
  "movement",
  "hazardsAndPush",
  "actions",
  "grappleMaintenance",
  "impactResolution",
  "effectPropagation",
  "physiology",
  "morale",
  "finalize",
] as const;
