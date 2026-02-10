import type { IndividualAttributes } from "./types";
import { type Q } from "./units";
export interface SquadAggregate {
    count: number;
    mean: IndividualAttributes;
    cohesion: Q;
    training: Q;
}
export declare function aggregateSquad(members: IndividualAttributes[]): SquadAggregate;
