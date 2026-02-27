import { to, I32 } from "../units.js";

export const TICK_HZ = 20;        // Hz (good for tactical combat)
export const DT_S: I32 = to.s(1 / TICK_HZ);    // seconds per tick
