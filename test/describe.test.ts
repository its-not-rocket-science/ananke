import { describe, it, expect } from "vitest";
import { describeCharacter, formatCharacterSheet, formatOneLine } from "../src/describe";
import { generateIndividual } from "../src/generate";
import {
  HUMAN_BASE,
  PRO_BOXER,
  SERVICE_ROBOT,
  LARGE_PACIFIC_OCTOPUS,
} from "../src/archetypes";
import type { Archetype } from "../src/archetypes";
import type { IndividualAttributes } from "../src/types";
import { SCALE } from "../src/units";
import type { Q } from "../src/units";

/**
 * Build an IndividualAttributes directly from archetype nominal values (no RNG variance).
 * Used for absolute tier / label assertions against documented anchor points.
 */
function nominalAttrs(arch: Archetype): IndividualAttributes {
  const halfArcCosQ = Math.round(
    Math.cos((arch.visionArcDeg / 2) * (Math.PI / 180)) * SCALE.Q,
  ) as Q;
  return {
    morphology: {
      stature_m: arch.stature_m,
      mass_kg: arch.mass_kg,
      actuatorMass_kg: Math.trunc((arch.mass_kg * arch.actuatorMassFrac) / SCALE.Q),
      actuatorScale: SCALE.Q as Q,
      structureScale: SCALE.Q as Q,
      reachScale: SCALE.Q as Q,
    },
    performance: {
      peakForce_N: arch.peakForce_N,
      peakPower_W: arch.peakPower_W,
      continuousPower_W: arch.continuousPower_W,
      reserveEnergy_J: arch.reserveEnergy_J,
      conversionEfficiency: arch.conversionEfficiency,
    },
    control: {
      controlQuality: arch.controlQuality,
      reactionTime_s: arch.reactionTime_s,
      stability: arch.stability,
      fineControl: arch.fineControl,
    },
    resilience: {
      surfaceIntegrity: arch.surfaceIntegrity,
      bulkIntegrity: arch.bulkIntegrity,
      structureIntegrity: arch.structureIntegrity,
      distressTolerance: arch.distressTolerance,
      shockTolerance: arch.shockTolerance,
      concussionTolerance: arch.concussionTolerance,
      heatTolerance: arch.heatTolerance,
      coldTolerance: arch.coldTolerance,
      fatigueRate: arch.fatigueRate,
      recoveryRate: arch.recoveryRate,
    },
    perception: {
      visionRange_m: arch.visionRange_m,
      visionArcDeg: arch.visionArcDeg,
      halfArcCosQ,
      hearingRange_m: arch.hearingRange_m,
      decisionLatency_s: arch.decisionLatency_s,
      attentionDepth: arch.attentionDepth,
      threatHorizon_m: arch.threatHorizon_m,
    },
  };
}

// Generated individuals (seed=1) — used for ordering comparisons
const humanDesc   = describeCharacter(generateIndividual(1, HUMAN_BASE));
const proDesc     = describeCharacter(generateIndividual(1, PRO_BOXER));
const robotDesc   = describeCharacter(generateIndividual(1, SERVICE_ROBOT));
const octopusDesc = describeCharacter(generateIndividual(1, LARGE_PACIFIC_OCTOPUS));

// Nominal individuals (zero variance) — used for absolute tier / label assertions
const humanNom   = describeCharacter(nominalAttrs(HUMAN_BASE));
const proNom     = describeCharacter(nominalAttrs(PRO_BOXER));
const robotNom   = describeCharacter(nominalAttrs(SERVICE_ROBOT));
const octopusNom = describeCharacter(nominalAttrs(LARGE_PACIFIC_OCTOPUS));

// ── Tier ordering (8) ────────────────────────────────────────────────────────

describe("tier ordering", () => {
  it("PRO_BOXER strength.tier > HUMAN_BASE strength.tier", () => {
    expect(proDesc.strength.tier).toBeGreaterThan(humanDesc.strength.tier);
  });

  it("SERVICE_ROBOT reactionTime.tier > HUMAN_BASE reactionTime.tier", () => {
    expect(robotDesc.reactionTime.tier).toBeGreaterThan(humanDesc.reactionTime.tier);
  });

  it("SERVICE_ROBOT decisionSpeed.tier > HUMAN_BASE decisionSpeed.tier", () => {
    expect(robotDesc.decisionSpeed.tier).toBeGreaterThan(humanDesc.decisionSpeed.tier);
  });

  it("OCTOPUS coordination.tier >= HUMAN_BASE coordination.tier", () => {
    expect(octopusDesc.coordination.tier).toBeGreaterThanOrEqual(humanDesc.coordination.tier);
  });

  it("OCTOPUS stamina.tier < HUMAN_BASE stamina.tier", () => {
    expect(octopusDesc.stamina.tier).toBeLessThan(humanDesc.stamina.tier);
  });

  it("OCTOPUS concussionResistance.tier > HUMAN_BASE concussionResistance.tier", () => {
    expect(octopusDesc.concussionResistance.tier).toBeGreaterThan(humanDesc.concussionResistance.tier);
  });

  it("PRO_BOXER toughness.tier > HUMAN_BASE toughness.tier", () => {
    expect(proDesc.toughness.tier).toBeGreaterThan(humanDesc.toughness.tier);
  });

  it("HUMAN_BASE nominal strength.tier === 3 (average anchor)", () => {
    // Uses zero-variance nominal attrs so the documented 1840 N anchor maps to tier 3
    expect(humanNom.strength.tier).toBe(3);
  });
});

// ── Label and value content (6) ──────────────────────────────────────────────

describe("label and value content", () => {
  it("HUMAN_BASE nominal strength.label === 'average'", () => {
    expect(humanNom.strength.label).toBe("average");
  });

  it("HUMAN_BASE strength.value contains 'N'", () => {
    expect(humanDesc.strength.value).toContain("N");
  });

  it("HUMAN_BASE strength.comparison is a non-empty string", () => {
    expect(typeof humanDesc.strength.comparison).toBe("string");
    expect(humanDesc.strength.comparison.length).toBeGreaterThan(0);
  });

  it("SERVICE_ROBOT reactionTime.label === 'instant'", () => {
    expect(robotDesc.reactionTime.label).toBe("instant");
  });

  it("PRO_BOXER nominal strength.label is 'excellent' or 'exceptional'", () => {
    expect(["excellent", "exceptional"]).toContain(proNom.strength.label);
  });

  it("all CharacterDescription fields are non-empty strings or valid ratings", () => {
    const d = humanDesc;
    expect(d.stature.length).toBeGreaterThan(0);
    expect(d.mass.length).toBeGreaterThan(0);
    expect(d.visionRange.length).toBeGreaterThan(0);
    expect(d.hearingRange.length).toBeGreaterThan(0);
    expect(d.strength.label.length).toBeGreaterThan(0);
    expect(d.reactionTime.label.length).toBeGreaterThan(0);
    expect(d.decisionSpeed.label.length).toBeGreaterThan(0);
    expect(d.painTolerance.label.length).toBeGreaterThan(0);
    expect(d.concussionResistance.label.length).toBeGreaterThan(0);
  });
});

// ── Formatting (5) ───────────────────────────────────────────────────────────

describe("formatting", () => {
  const sheet = formatCharacterSheet(humanDesc);

  it("formatCharacterSheet contains 'Strength', 'Reaction', 'Vision'", () => {
    expect(sheet).toContain("Strength");
    expect(sheet).toContain("Reaction");
    expect(sheet).toContain("Vision");
  });

  it("formatCharacterSheet contains the numeric strength value", () => {
    expect(sheet).toContain(humanDesc.strength.value);
  });

  it("formatOneLine contains no newlines", () => {
    const line = formatOneLine(humanDesc);
    expect(line).not.toContain("\n");
  });

  it("formatOneLine is non-empty", () => {
    expect(formatOneLine(humanDesc).length).toBeGreaterThan(0);
  });

  it("formatCharacterSheet is multi-line", () => {
    expect(sheet).toContain("\n");
  });
});

// ── Body description (3) ─────────────────────────────────────────────────────

describe("body description", () => {
  it("HUMAN_BASE nominal stature contains '1.75' and 'average height'", () => {
    // Nominal attrs yield exactly the archetype stature (17500 = 1.75 m)
    expect(humanNom.stature).toContain("1.75");
    expect(humanNom.stature).toContain("average height");
  });

  it("OCTOPUS mass string contains '15' and 'slight'", () => {
    expect(octopusDesc.mass).toContain("15");
    expect(octopusDesc.mass).toContain("slight");
    expect(octopusNom.concussionResistance.label).toBe("ironclad"); // 15 kg maps to excellent concussion resistance tier
  });

  it("SERVICE_ROBOT stature string does not contain 'average height' (1.60 m is 'short')", () => {
    // Nominal stature 1.60 m is below the 1.60 m threshold → 'short'
    expect(robotNom.stature).not.toContain("average height");
  });
});
