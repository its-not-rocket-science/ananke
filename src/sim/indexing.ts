import type { WorldState } from "./world.js";
import type { Entity } from "./entity.js";

export interface WorldIndex {
    byId: Map<number, Entity>;
    entities: readonly Entity[];
}

export function buildWorldIndex(world: WorldState): WorldIndex {
    const byId = new Map<number, Entity>();
    for (const e of world.entities) {
        byId.set(e.id, e);
    }
    return { byId, entities: world.entities };
}
