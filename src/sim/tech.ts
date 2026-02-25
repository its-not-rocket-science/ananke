/**
 * Phase 11 — Technology Spectrum
 *
 * TechContext gates which items and capabilities are available in a given scenario.
 * Items declare their requirements via `requiredCapabilities`; validateLoadout()
 * checks them against the active TechContext.
 *
 * Design: era provides a sensible default capability set, but any capability
 * can be added or removed for bespoke scenarios (time-travel, magitech, etc.).
 */

/** Numeric era codes; higher = more advanced. */
export const TechEra = {
  Prehistoric: 0,
  Ancient:     1,
  Medieval:    2,
  EarlyModern: 3,
  Industrial:  4,
  Modern:      5,
  NearFuture:  6,
  FarFuture:   7,
  DeepSpace:   8,
} as const;

export type TechEra = typeof TechEra[keyof typeof TechEra];

/**
 * Discrete capabilities that items may require.
 * A scenario can have any combination regardless of era.
 */
export type TechCapability =
  | "MetallicArmour"
  | "FirearmsPropellant"
  | "ExplosiveMunitions"
  | "BallisticArmour"
  | "PoweredExoskeleton"
  | "EnergyWeapons"
  | "ReactivePlating"
  | "NanomedicalRepair"
  // Phase 12: Clarke's Third Law — magic/para-science capability gates.
  // Not included in any ERA_DEFAULTS; add to bespoke scenarios as needed.
  | "ArcaneMagic"    // traditional spellcasting, ley-line tapping, enchantment
  | "DivineMagic"    // prayer, miracles, channelled deity power
  | "Psionics"       // telekinesis, mind-read, precognition, psionic blast
  | "Nanotech";      // nano-agent delivery, molecular assembly, swarm intelligence

export interface TechContext {
  era:       TechEra;
  available: Set<TechCapability>;
}

/**
 * Default capability sets for each era.
 * Capabilities are cumulative: each era includes all capabilities of previous eras.
 */
const ERA_DEFAULTS: ReadonlyArray<readonly TechCapability[]> = [
  /* Prehistoric */ [],
  /* Ancient     */ ["MetallicArmour"],
  /* Medieval    */ ["MetallicArmour"],
  /* EarlyModern */ ["MetallicArmour", "FirearmsPropellant"],
  /* Industrial  */ ["MetallicArmour", "FirearmsPropellant", "ExplosiveMunitions"],
  /* Modern      */ ["MetallicArmour", "FirearmsPropellant", "ExplosiveMunitions", "BallisticArmour"],
  /* NearFuture  */ ["MetallicArmour", "FirearmsPropellant", "ExplosiveMunitions", "BallisticArmour", "PoweredExoskeleton"],
  /* FarFuture   */ ["MetallicArmour", "FirearmsPropellant", "ExplosiveMunitions", "BallisticArmour", "PoweredExoskeleton", "EnergyWeapons", "ReactivePlating"],
  /* DeepSpace   */ ["MetallicArmour", "FirearmsPropellant", "ExplosiveMunitions", "BallisticArmour", "PoweredExoskeleton", "EnergyWeapons", "ReactivePlating", "NanomedicalRepair"],
];

/** Build a TechContext from a named era with its default capability set. */
export function defaultTechContext(era: TechEra): TechContext {
  const caps = ERA_DEFAULTS[era] ?? [];
  return { era, available: new Set<TechCapability>(caps as TechCapability[]) };
}

/** Return true if the given capability is available in this context. */
export function isCapabilityAvailable(ctx: TechContext, cap: TechCapability): boolean {
  return ctx.available.has(cap);
}
