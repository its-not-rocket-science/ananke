import type { WorldState } from "../world";
import type { CommandMap } from "../commands";
import type { WorldIndex } from "../indexing";
import type { SpatialIndex } from "../spatial";
import type { AIPolicy } from "./types";
import { decideCommandsForEntity } from "./decide";

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