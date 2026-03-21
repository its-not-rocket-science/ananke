/**
 * Phase 68 — Multi-Biome Physics
 *
 * Defines BiomeContext: a set of optional physics overrides that alter gravity,
 * thermal conduction, sound propagation, and drag relative to the standard
 * Earth-surface defaults.  Pass a BiomeContext via KernelContext.biome to apply
 * these overrides to every entity in the simulation.
 *
 * Three built-in profiles cover the most common non-standard environments:
 *   BIOME_UNDERWATER — buoyancy-reduced gravity, severe drag, rapid heat exchange
 *   BIOME_LUNAR      — 1/6 g, vacuum, radiation-only heat transfer
 *   BIOME_VACUUM     — microgravity, vacuum, extreme thermal isolation
 */

import { type Q, type I32, G_mps2, q, SCALE } from "../units.js";

// ── BiomeContext interface ─────────────────────────────────────────────────────

export interface BiomeContext {
  /**
   * Gravitational acceleration in SCALE.mps2 units.
   * Default (when absent): G_mps2 ≈ 98 067 (9.807 m/s²).
   * Affects jump height and traction-limited acceleration.
   */
  gravity_mps2?: I32;

  /**
   * Base skin-layer thermal resistance (°C/W).
   * Replaces the default 0.09 (still-air skin layer).
   * Lower values = faster heat exchange (e.g. water ≈ 0.003).
   * Higher values = slower exchange (e.g. vacuum ≈ 50 — radiation only).
   */
  thermalResistanceBase?: number;

  /**
   * Sound propagation multiplier stored as a raw Q multiple.
   * q(1.0) = normal air propagation; q(0.0) = no sound (vacuum);
   * q(4.0) = four-times-faster (water).
   * Used to scale auditory sensory range.
   */
  soundPropagation?: Q;

  /**
   * Velocity drag factor applied to entity velocity each tick (Q, [0..SCALE.Q]).
   * q(1.0) = no drag (default); q(0.3) = retain 30% velocity each tick (heavy drag).
   * Applied by the movement step when non-default.
   */
  dragMul?: Q;

  /**
   * When true, entities without pressurised equipment cannot breathe.
   * Unequipped entities accumulate fatigue at a fixed rate each tick.
   */
  isVacuum?: boolean;
}

// ── Built-in profiles ─────────────────────────────────────────────────────────

/**
 * Deep ocean / underwater environment.
 * Net downward acceleration ≈ 1 m/s² (buoyancy cancels most gravity).
 * Water conducts heat ~25× faster than still air.
 * Sound travels ~4× faster in water than in air.
 * Severe hydrodynamic drag (30% velocity retention per tick).
 */
export const BIOME_UNDERWATER: BiomeContext = {
  gravity_mps2:          Math.round(1.0  * SCALE.mps2) as I32,
  thermalResistanceBase: 0.003,
  soundPropagation:      q(4.0)  as Q,
  dragMul:               q(0.30) as Q,
};

/**
 * Lunar surface — 1/6 Earth gravity, vacuum atmosphere.
 * Heat transfer only via radiation → very high thermal resistance.
 * No air, no sound.  Entities without pressurised suits suffer vacuum fatigue.
 */
export const BIOME_LUNAR: BiomeContext = {
  gravity_mps2:          Math.round(1.62 * SCALE.mps2) as I32,
  thermalResistanceBase: 50.0,
  soundPropagation:      q(0) as Q,
  dragMul:               SCALE.Q as Q,   // no air resistance
  isVacuum:              true,
};

/**
 * Microgravity / open space environment.
 * Near-zero gravity, no atmosphere, extreme thermal isolation.
 * Entities without pressurised suits suffer vacuum fatigue.
 */
export const BIOME_VACUUM: BiomeContext = {
  gravity_mps2:          0 as I32,
  thermalResistanceBase: 100.0,
  soundPropagation:      q(0) as Q,
  dragMul:               SCALE.Q as Q,
  isVacuum:              true,
};

// ── Accessor helpers ──────────────────────────────────────────────────────────

/** Effective gravitational acceleration for this biome (falls back to standard G). */
export function biomeGravity(biome?: BiomeContext): I32 {
  return (biome?.gravity_mps2 ?? G_mps2) as I32;
}

/** Effective base thermal resistance for this biome (falls back to still-air default 0.09 °C/W). */
export function biomeThermalResistanceBase(biome?: BiomeContext): number {
  return biome?.thermalResistanceBase ?? 0.09;
}
