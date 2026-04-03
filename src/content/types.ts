export interface ContentPackRegistry {
  compatRange?: string;
  [key: string]: unknown;
}

export interface WeaponDamageProfile {
  surfaceFrac: number;
  internalFrac: number;
  structuralFrac: number;
  bleedFactor: number;
  penetrationBias: number;
}

export interface ContentWeapon {
  id: string;
  name: string;
  mass_kg: number;
  damage: WeaponDamageProfile;
  [key: string]: unknown;
}

export interface ContentArmour {
  id: string;
  name: string;
  mass_kg: number;
  resist_J: number;
  protectedDamageMul: number;
  coverageByRegion: Record<string, number>;
  [key: string]: unknown;
}

export interface ContentArchetype {
  id: string;
  base?: string;
  overrides?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ContentTerrain {
  id: string;
  name: string;
  tags?: string[];
  tractionMul?: number;
  cover?: number;
  [key: string]: unknown;
}

export interface ContentPack {
  $schema?: string;
  name: string;
  version: string;
  description?: string;
  registry?: ContentPackRegistry;
  weapons?: ContentWeapon[];
  armour?: ContentArmour[];
  archetypes?: ContentArchetype[];
  terrain?: ContentTerrain[];
}

export interface ContentPackValidationError {
  path: string;
  message: string;
}
