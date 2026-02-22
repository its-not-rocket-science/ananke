// src/sim/kinds.ts

/** Commands are player/AI intentions */
export const CommandKinds = {
  Move: "move",
  Attack: "attack",
  AttackNearest: "attackNearest",
  Defend: "defend",
  Grapple: "grapple",
  BreakGrapple: "breakGrapple",
  SetProne: "setProne",
} as const;

export type CommandKind = typeof CommandKinds[keyof typeof CommandKinds];

/** Trace events are engine observations */
export const TraceKinds = {
  TickStart: "tickStart",
  TickEnd: "tickEnd",
  Intent: "intent",
  Move: "move",
  Injury: "injury",
  Attack: "attack",
  AttackAttempt: "attackAttempt",
  Grapple: "grapple",
  KO: "ko",
  Death: "death",
} as const;

export type TraceKind = typeof TraceKinds[keyof typeof TraceKinds];

export type AllKinds = CommandKind | TraceKind;

export const MoveModes = {
    Walk: "walk",
    Run: "run",
    Sprint: "sprint",
    Crawl: "crawl",
} as const;

export type MoveMode = typeof MoveModes[keyof typeof MoveModes];

export const DefenceModes = {
    None: "none",
    Block: "block",
    Parry: "parry",
    Dodge: "dodge",
} as const;

export type DefenceMode = typeof DefenceModes[keyof typeof DefenceModes];

export const EngageModes = {
    None: "none",
    Strike: "strike",
} as const;

export type EngageMode = typeof EngageModes[keyof typeof EngageModes];

export type HitArea = "head" | "torso" | "arm" | "leg";