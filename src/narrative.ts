// src/narrative.ts — Phase 18: Combat Narrative Layer
//
// Pure translation module — no sim/kernel dependencies.
// Converts TraceEvent streams and injury snapshots into human-readable text.

import { SCALE, q } from "./units.js";
import type { Q } from "./units.js";
import type { WeaponDamageProfile } from "./equipment.js";
import type { InjuryState } from "./sim/injury.js";
import { TraceKinds } from "./sim/kinds.js";
import type { TraceEvent } from "./sim/trace.js";

// ── Public types ──────────────────────────────────────────────────────────────

export interface NarrativeConfig {
  /** How much detail to emit.
   *  terse   — KO, Death, route/rally, fracture, blast, hits only
   *  normal  — adds blocked/parried notes, misses, weapon bind, grapple start/break
   *  verbose — adds grapple ticks, capability events, treatment events
   */
  verbosity: "terse" | "normal" | "verbose";
  /** Display names keyed by entity id. Falls back to "combatant {id}".
   *  Set an entity's name to "you" for second-person verb conjugation. */
  nameMap?: Map<number, string>;
  /** Damage profiles keyed by weapon id; enables verb selection for melee/ranged events. */
  weaponProfiles?: Map<string, WeaponDamageProfile>;
}

/** Minimal entity summary needed for describeCombatOutcome. */
export interface CombatantSummary {
  id: number;
  teamId: number;
  injury: { dead: boolean; consciousness: Q };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function nameOf(id: number, cfg: NarrativeConfig): string {
  return cfg.nameMap?.get(id) ?? `combatant ${id}`;
}

function isYouSubject(id: number, cfg: NarrativeConfig): boolean {
  return cfg.nameMap?.get(id) === "you";
}

// Verb stems and third-person conjugations
const THIRD_PERSON: Record<string, string> = {
  strike:   "strikes",
  slash:    "slashes",
  stab:     "stabs",
  bludgeon: "bludgeons",
  shoot:    "shoots",
  snipe:    "snipes",
  blast:    "blasts",
  grapple:  "grapples",
};

function conjugate(stem: string, youSubject: boolean): string {
  if (youSubject) return stem;
  return THIRD_PERSON[stem] ?? stem + "s";
}

function meleeStem(profile: WeaponDamageProfile | undefined): string {
  if (!profile) return "strike";
  if (profile.penetrationBias >= q(0.65)) return "stab";
  if (profile.structuralFrac  >= q(0.50)) return "bludgeon";
  if (profile.surfaceFrac     >= q(0.50)) return "slash";
  return "strike";
}

function rangedStem(profile: WeaponDamageProfile | undefined): string {
  if (!profile) return "shoot";
  if (profile.penetrationBias >= q(0.80)) return "snipe";
  if (profile.surfaceFrac     >= q(0.55)) return "blast";
  return "shoot";
}

function regionPhrase(region: string): string {
  switch (region) {
    case "head":  return "in the head";
    case "torso": return "in the torso";
    case "arm":   return "in the arm";
    case "leg":   return "in the leg";
    default:      return `on the ${region}`;
  }
}

function energyQualifier(energy_J: number): string {
  if (energy_J >= 500) return "devastatingly";
  if (energy_J >= 200) return "powerfully";
  return "";
}

// ── Per-event narrators ───────────────────────────────────────────────────────

type AttackEv = Extract<TraceEvent, { kind: typeof TraceKinds.Attack }>;
function narrateAttack(ev: AttackEv, cfg: NarrativeConfig): string | null {
  const att = nameOf(ev.attackerId, cfg);
  const tgt = nameOf(ev.targetId, cfg);

  if (ev.blocked) {
    if (cfg.verbosity === "terse") return null;
    return `${att} attacks ${tgt} — blocked`;
  }
  if (ev.parried) {
    if (cfg.verbosity === "terse") return null;
    return `${att} attacks ${tgt} — parried`;
  }
  if (ev.shieldBlocked) {
    if (cfg.verbosity === "terse") return null;
    return `${att} attacks ${tgt} — hits shield`;
  }

  // Landed hit
  if (ev.energy_J < 10) {
    const armourNote = ev.armoured ? " (armoured)" : "";
    return `${att} barely grazes ${tgt} ${regionPhrase(ev.region)}${armourNote}`;
  }

  const profile = ev.weaponId ? cfg.weaponProfiles?.get(ev.weaponId) : undefined;
  const isYou   = isYouSubject(ev.attackerId, cfg);
  const stem     = meleeStem(profile);
  const verb     = conjugate(stem, isYou);
  const qual     = energyQualifier(ev.energy_J);
  const region   = regionPhrase(ev.region);
  const armour   = ev.armoured ? " (armoured)" : "";

  return qual
    ? `${att} ${qual} ${verb} ${tgt} ${region}${armour}`
    : `${att} ${verb} ${tgt} ${region}${armour}`;
}

type ProjectileEv = Extract<TraceEvent, { kind: typeof TraceKinds.ProjectileHit }>;
function narrateProjectileHit(ev: ProjectileEv, cfg: NarrativeConfig): string | null {
  const shooter = nameOf(ev.shooterId, cfg);
  const target  = nameOf(ev.targetId,  cfg);
  const distM   = (ev.distance_m / SCALE.m).toFixed(0);

  if (!ev.hit) {
    if (cfg.verbosity === "terse") return null;
    if (ev.suppressed) return `${shooter} fires at ${target} (suppressive, ${distM}m)`;
    return `${shooter} misses ${target} at ${distM}m`;
  }

  const profile = ev.weaponId ? cfg.weaponProfiles?.get(ev.weaponId) : undefined;
  const isYou   = isYouSubject(ev.shooterId, cfg);
  const stem    = rangedStem(profile);
  const verb    = conjugate(stem, isYou);
  const region  = ev.region ? ` in the ${ev.region}` : "";

  return `${shooter} ${verb} ${target}${region} at ${distM}m`;
}

type GrappleEv = Extract<TraceEvent, { kind: typeof TraceKinds.Grapple }>;
function narrateGrapple(ev: GrappleEv, cfg: NarrativeConfig): string | null {
  const att = nameOf(ev.attackerId, cfg);
  const tgt = nameOf(ev.targetId, cfg);

  switch (ev.phase) {
    case "start":
      if (cfg.verbosity === "terse") return null;
      return `${att} grapples ${tgt}`;
    case "tick":
      if (cfg.verbosity !== "verbose") return null;
      return `${att} maintains grapple on ${tgt}`;
    case "break":
      if (cfg.verbosity === "terse") return null;
      return `${tgt} breaks free from ${att}`;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Narrate a single trace event.
 * Returns null for events that should be omitted at the current verbosity level.
 */
export function narrateEvent(ev: TraceEvent, cfg: NarrativeConfig): string | null {
  switch (ev.kind) {
    case TraceKinds.Attack:
      return narrateAttack(ev, cfg);

    case TraceKinds.ProjectileHit:
      return narrateProjectileHit(ev, cfg);

    case TraceKinds.KO:
      return `${nameOf(ev.entityId, cfg)} is knocked unconscious`;

    case TraceKinds.Death:
      return `${nameOf(ev.entityId, cfg)} dies`;

    case TraceKinds.MoraleRoute:
      return `${nameOf(ev.entityId, cfg)} breaks and flees`;

    case TraceKinds.MoraleRally:
      return `${nameOf(ev.entityId, cfg)} rallies`;

    case TraceKinds.Grapple:
      return narrateGrapple(ev, cfg);

    case TraceKinds.WeaponBind:
      if (cfg.verbosity === "terse") return null;
      return `${nameOf(ev.attackerId, cfg)} and ${nameOf(ev.targetId, cfg)} blades lock (${ev.durationTicks} ticks)`;

    case TraceKinds.WeaponBindBreak:
      if (cfg.verbosity === "terse") return null;
      return `${nameOf(ev.entityId, cfg)} breaks the bind (${ev.reason})`;

    case TraceKinds.Fracture:
      return `${nameOf(ev.entityId, cfg)}'s ${ev.region} is fractured`;

    case TraceKinds.BlastHit:
      return `${nameOf(ev.entityId, cfg)} caught in explosion (${ev.blastEnergy_J}J, ${ev.fragHits} fragments)`;

    case TraceKinds.TreatmentApplied:
      if (cfg.verbosity !== "verbose") return null;
      return `${nameOf(ev.treaterId, cfg)} treats ${nameOf(ev.targetId, cfg)} (${ev.action}${ev.regionId ? ` — ${ev.regionId}` : ""})`;

    case TraceKinds.CapabilityActivated:
      if (cfg.verbosity !== "verbose") return null;
      return `${nameOf(ev.entityId, cfg)} activates ${ev.effectId}`;

    case TraceKinds.CapabilitySuppressed:
      if (cfg.verbosity !== "verbose") return null;
      return `${nameOf(ev.entityId, cfg)}'s ${ev.effectId} is suppressed`;

    case TraceKinds.CastInterrupted:
      if (cfg.verbosity !== "verbose") return null;
      return `${nameOf(ev.entityId, cfg)}'s concentration breaks`;

    default:
      return null;
  }
}

/**
 * Convert a sequence of trace events into a list of narrative lines.
 * Events that return null from narrateEvent are omitted.
 */
export function buildCombatLog(events: TraceEvent[], cfg: NarrativeConfig): string[] {
  const lines: string[] = [];
  for (const ev of events) {
    const line = narrateEvent(ev, cfg);
    if (line !== null) lines.push(line);
  }
  return lines;
}

/**
 * Summarise an entity's injury state as a short descriptive phrase.
 */
export function describeInjuries(injury: InjuryState): string {
  if (injury.dead) return "Fatal";

  const lines: string[] = [];

  if (injury.consciousness < q(0.20)) lines.push("Unconscious");
  else if (injury.consciousness < q(0.50)) lines.push("Semi-conscious");

  if (injury.fluidLoss > q(0.60)) lines.push("Severe hemorrhage");
  else if (injury.fluidLoss > q(0.30)) lines.push("Significant blood loss");
  else if (injury.fluidLoss > q(0.10)) lines.push("Minor bleeding");

  if (injury.shock > q(0.60)) lines.push("Deep shock");
  else if (injury.shock > q(0.30)) lines.push("Shock");

  for (const [region, ri] of Object.entries(injury.byRegion)) {
    if (ri.fractured) lines.push(`${region} fractured`);
  }

  if (lines.length === 0) return "No significant injuries";
  return lines.join("; ");
}

/**
 * Produce a one-line outcome summary for a completed engagement.
 */
export function describeCombatOutcome(
  combatants: CombatantSummary[],
  tickCount?: number,
): string {
  const teams = new Map<number, { alive: number; total: number }>();
  for (const c of combatants) {
    if (!teams.has(c.teamId)) teams.set(c.teamId, { alive: 0, total: 0 });
    const t = teams.get(c.teamId)!;
    t.total++;
    if (!c.injury.dead && c.injury.consciousness > q(0.20)) t.alive++;
  }

  const surviving = [...teams.entries()].filter(([, t]) => t.alive > 0);
  const defeated  = [...teams.entries()].filter(([, t]) => t.alive === 0);
  const suffix    = tickCount !== undefined ? ` (${tickCount} ticks)` : "";

  if (surviving.length === 0) return "All combatants down" + suffix;

  if (defeated.length === 0) {
    const parts = [...teams.entries()]
      .map(([id, t]) => `Team ${id}: ${t.alive}/${t.total} standing`);
    return parts.join("; ") + suffix;
  }

  const winners  = surviving.map(([id]) => `Team ${id}`).join(", ");
  const losers   = defeated.map(([id]) => `Team ${id}`).join(", ");
  return `${winners} wins — ${losers} defeated${suffix}`;
}
