// src/sim/kinds.ts

import { BodyRegion } from "./body";
import { BodySegmentId } from "./bodyplan";

/** Commands are player/AI intentions */
export const CommandKinds = {
  Move: "move",
  Attack: "attack",
  AttackNearest: "attackNearest",
  Defend: "defend",
  Grapple: "grapple",
  BreakGrapple: "breakGrapple",
  BreakBind: "breakBind",  // Phase 2C
  Shoot: "shoot",          // Phase 3
  Treat: "treat",          // Phase 9
  SetProne: "setProne",
  Activate: "activate",        // Phase 12: use a capability source effect
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
  WeaponBind: "weaponBind",          // Phase 2C
  WeaponBindBreak: "weaponBindBreak", // Phase 2C
  ProjectileHit: "projectileHit",    // Phase 3
  MoraleRoute: "moraleRoute",         // Phase 5
  MoraleRally: "moraleRally",         // Phase 18
  Fracture: "fracture",               // Phase 9
  TreatmentApplied: "treatmentApplied", // Phase 9
  BlastHit: "blastHit",               // Phase 10
  CapabilityActivated:   "capabilityActivated",   // Phase 12
  CapabilitySuppressed:  "capabilitySuppressed",  // Phase 12
  CastInterrupted:       "castInterrupted",        // Phase 12
} as const;

export type TraceKind = typeof TraceKinds[keyof typeof TraceKinds];

export type AllKinds = CommandKind | TraceKind;

export const MoveModes = {
    Walk: "walk",
    Run: "run",
    Sprint: "sprint",
    Crawl: "crawl",
    Hover: "hover",
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

export type HitArea = BodyRegion | BodySegmentId; 