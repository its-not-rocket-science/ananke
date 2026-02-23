// src/sim/trace.ts
import type { Vec3 } from "./vec3.js";
import type { BodyRegion } from "./body.js";
import type { Q, I32 } from "../units.js";

import { TraceKinds, type HitArea } from "./kinds.js";

export type TraceEvent =
  | { kind: typeof TraceKinds.TickStart, tick: number }
  | { kind: typeof TraceKinds.TickEnd, tick: number }
  | { kind: typeof TraceKinds.Intent, tick: number; entityId: number; intent: unknown }
  | { kind: typeof TraceKinds.Move, tick: number; entityId: number; pos: Vec3; vel: Vec3 }
  | {
      kind: typeof TraceKinds.Injury;
      tick: number;
      entityId: number;
      // keep this summary stable + small; don't dump whole object by default
      dead: boolean;
      shockQ: Q;
      fluidLossQ: Q;
      consciousnessQ: Q;
    }
  | {
      kind: typeof TraceKinds.Attack;
      tick: number;
      attackerId: number;
      targetId: number;
      region: BodyRegion;
      energy_J: number;
      blocked: boolean;
      parried: boolean;
      shieldBlocked: boolean;
      armoured: boolean;
      hitQuality: Q;
    }
  | {
      kind: typeof TraceKinds.AttackAttempt;
      tick: number;
      attackerId: number;
      targetId: number;
      hit: boolean;
      blocked: boolean;
      parried: boolean;
      hitQuality: number;
      area: HitArea;
    }
  | {
      kind: typeof TraceKinds.KO;
      tick: number;
      entityId: number;
    }
  | {
      kind: typeof TraceKinds.Death;
      tick: number;
      entityId: number;
    }
  | {
      kind: typeof TraceKinds.Grapple;
      tick: number;
      attackerId: number;
      targetId: number;
      phase: "start" | "tick" | "break";
      strengthQ?: number;
    }
  | {
      kind: typeof TraceKinds.WeaponBind;  // Phase 2C
      tick: number;
      attackerId: number;
      targetId: number;
      durationTicks: number;
    }
  | {
      kind: typeof TraceKinds.WeaponBindBreak;  // Phase 2C
      tick: number;
      entityId: number;
      partnerId: number;
      reason: "timeout" | "forced";
    }
  | {
      kind: typeof TraceKinds.ProjectileHit;  // Phase 3
      tick: number;
      shooterId: number;
      targetId: number;
      hit: boolean;
      region?: BodyRegion;          // only when hit=true
      distance_m: I32;
      energyAtImpact_J: number;
      suppressed: boolean;
    };

export interface TraceSink {
  onEvent(ev: TraceEvent): void;
}

export const nullTrace: TraceSink = { onEvent() {} };