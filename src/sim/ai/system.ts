import type { WorldState } from "../world.js";
import type { CommandMap } from "../commands.js";
import type { WorldIndex } from "../indexing.js";
import type { SpatialIndex } from "../spatial.js";
import type { AIPolicy } from "./types.js";
import { decideCommandsForEntity } from "./decide.js";

export function buildAICommands(
  world: WorldState,
  index: WorldIndex,
  spatial: SpatialIndex,
  policyFor: (eId: number) => AIPolicy | undefined
): CommandMap {
  const out: CommandMap = new Map();

  for (const e of world.entities) {
    const policy = policyFor(e.id);
    if (!policy) continue;

    const cmds = decideCommandsForEntity(world, index, spatial, e, policy);
    if (cmds.length > 0) out.set(e.id, cmds);
  }

  return out;
}