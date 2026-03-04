// src/sim/capability.ts
//
// Phase 12 — Capability Sources and Effects
//
// Implements Clarke's Third Law: "Any sufficiently advanced technology is
// indistinguishable from magic." Magic and technology are the same abstraction;
// only the tags differ. The engine cannot tell a fireball from a plasma grenade.

import type { Q } from "../units.js";
import type { Vec3 } from "./vec3.js";
import { DamageChannel } from "../channels.js";
import type { MedicalTier } from "./medical.js";
import type { ActiveSubstance } from "./substance.js";
import type { TechCapability } from "./tech.js";
import type { WeaponDamageProfile } from "../equipment.js";

// ─── Regen models ─────────────────────────────────────────────────────────────

/**
 * Pluggable energy-replenishment model for a CapabilitySource.
 * The engine sees only the resulting reserve_J delta — source flavor is in the tags.
 */
export type RegenModel =
  | { type: "rest";      regenRate_W: number }
    // Regen only while entity is stationary and not attacking.
    // Use for: meditation, sleep-charge, prayer, contemplative focus.

  | { type: "constant";  regenRate_W: number }
    // Regen every tick regardless of activity.
    // Use for: fusion reactor, enchanted gem, passive divine blessing.

  | { type: "ambient";   maxRate_W: number }
    // Regen scales with ambientGrid cell value at entity's current position.
    // KernelContext must supply ambientGrid; zero regen in absent cells.
    // Use for: ley lines, geothermal vents, solar collectors, stellar wind.

  | { type: "event";     triggers: RegenTrigger[] }
    // Regen fires on specific engine events. Kill and terrain triggers
    // are dispatched by the kernel; tick triggers are handled inline.
    // Use for: blood magic on kill, rhythmic charge, resonance crystals.

  | { type: "boundless" };
    // Reserve never depletes — cost deduction is skipped in resolveActivation.
    // Use for: black hole harvester, deity, reality-warper, ambient anchor.

export type RegenTrigger =
  | { on: "kill";    amount_J: number }
  | { on: "tick";    every_n: number; amount_J: number; _nextTick?: number }
  | { on: "terrain"; tag: string; amount_J: number };

// ─── Effect payload types ──────────────────────────────────────────────────────

/** Specification for a capability impact — maps to a DamageChannel. */
export interface ImpactSpec {
  energy_J: number;
  channel: DamageChannel;
}

/** Field effect placed in the world (suppression zone, environmental modifier). */
export interface FieldEffectSpec {
  radius_m: number;        // fixed-point metres (SCALE.m units)
  suppressesTags: string[];
  duration_ticks: number;  // -1 = permanent; > 0 = auto-expires
  /**
   * Phase 12B effect chain: payload applied to every living entity inside the
   * field radius each tick. Fires in the same tick the field is active,
   * before expiry. The placing entity is the actor for attribution.
   */
  chainPayload?: EffectPayload | EffectPayload[];
}

/** A FieldEffect living in WorldState.activeFieldEffects. */
export interface FieldEffect extends FieldEffectSpec {
  id: string;
  origin: Vec3;
  placedByEntityId: number;
}

/**
 * All effect variants. Each maps to an existing engine primitive so the
 * engine applies the same code path regardless of whether the effect is
 * "magical" or "technological".
 */
export type EffectPayload =
  | { kind: "impact";          spec: ImpactSpec }
    // Damage via applyImpactToInjury. Fireball = Thermal. Plasma bolt = Thermal.
    // Gravity crush = Kinetic. Nanobot disassembly = Chemical.

  | { kind: "treatment";       tier: MedicalTier; rateMul: Q }
    // Direct healing — bleedingRate and shock reduction proportional to rateMul.
    // Bypasses equipment/range checks; the capability source IS the treatment tool.

  | { kind: "armourLayer";     resist_J: number; channels: DamageChannel[]; duration_ticks: number }
    // Temporary energy-absorbing shield. Accumulates into condition.shieldReserve_J.
    // Expires at condition.shieldExpiry_tick. Absorbs damage from any attack type.

  | { kind: "velocity";        delta_mps: Vec3 }
    // Direct velocity change (fixed-point m/s). Telekinesis, jump jet, repulsion.

  | { kind: "substance";       substance: ActiveSubstance }
    // Inject a pharmacokinetic substance — magical poison, nano-agent, healing draught.

  | { kind: "structuralRepair"; region: string; amount: Q }
    // Write back structural damage. Only capability effects can do this;
    // normal injury is write-once. Respects permanentDamage floor.

  | { kind: "fieldEffect";     spec: FieldEffectSpec }
    // Place a suppression / modifier zone in world.activeFieldEffects.

  | { kind: "weaponImpact";   profile: WeaponDamageProfile; energy_J: number };
    // Like "impact" but uses a custom damage profile instead of a channel-based
    // synthetic weapon. Used for fire breath, chemical burns, precise damage profiling.

// ─── Capability effect ────────────────────────────────────────────────────────

export interface CapabilityEffect {
  id: string;
  cost_J: number;
  castTime_ticks: number;       // 0 = instant; >0 = charge/concentration/invocation
  cooldown_ticks?: number;      // Phase 12B: ticks before same effect can fire again; 0/undefined = no cooldown
  requiredCapability?: TechCapability; // Phase 12B: if set + techCtx present, gated by tech availability
  range_m?: number;             // fixed-point metres; undefined = self-only
  aoeRadius_m?: number;         // if set, all entities within sphere radius receive payload

  // Phase 28: directional cone AoE (replaces spherical aoeRadius_m when coneHalfAngle_rad is set)
  coneHalfAngle_rad?: number;              // radians; undefined = no cone
  coneDir?: "facing" | "fixed";           // "facing" = actor's facingDirQ; "fixed" = coneDirFixed
  coneDirFixed?: { dx: number; dy: number }; // used when coneDir = "fixed"; SCALE.m-normalised

  // Phase 28: sustained emission — effect auto-fires this many consecutive ticks
  sustainedTicks?: number;               // undefined = one-shot; >0 = fires N ticks total

  payload: EffectPayload | EffectPayload[];
  tags?: string[];
}

// ─── Capability source ────────────────────────────────────────────────────────

export interface CapabilitySource {
  id: string;
  label: string;
  tags: string[];            // flavor + suppression key: ["magic"], ["tech","fusion"], ["cosmic"]
  reserve_J: number;         // current stored energy (joules)
  maxReserve_J: number;      // ceiling; Number.MAX_SAFE_INTEGER for boundless sources
  regenModel: RegenModel;
  effects: CapabilityEffect[];
  /**
   * Phase 12B: if primary reserve is exhausted, draw activation cost from this source instead.
   * Must be the `id` of another CapabilitySource on the same entity.
   */
  linkedFallbackId?: string;
}

// ─── Pending activation (cast-time tracking on Entity) ────────────────────────

export interface PendingActivation {
  sourceId: string;
  effectId: string;
  targetId?: number;
  resolveAtTick: number;
}
