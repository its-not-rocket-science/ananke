import type { ContentPack, ContentPackValidationError } from "./types.js";

export interface ContentValidationResult {
  schemaErrors: ContentPackValidationError[];
  semanticWarnings: ContentPackValidationError[];
}

export function runContentSemanticChecks(pack: ContentPack): ContentPackValidationError[] {
  const warnings: ContentPackValidationError[] = [];

  (pack.weapons ?? []).forEach((weapon, idx) => {
    const damage = weapon.damage;
    const roughDamage = (damage.surfaceFrac + damage.internalFrac + damage.structuralFrac) * 1000;
    if (roughDamage > 1000) {
      warnings.push({
        path: `$.weapons[${idx}].damage`,
        message: `weapon damage > 1000 is likely wrong (score=${roughDamage.toFixed(2)})`,
      });
    }
  });

  return warnings;
}
