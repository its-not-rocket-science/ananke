/**
 * Phase 37 — Linguistic Intelligence: Language and Command
 *
 * Groups:
 *   Language capacity      (6) — fluency, communication check, barrier
 *   Command transmission   (5) — reception rate, delay, formation size
 *   Command range          (2) — range scaling with linguistic
 *   Language helpers       (3) — hasCapacity, primary language
 */

import { describe, it, expect } from "vitest";
import { SCALE, q, type Q } from "../src/units";
import {
  getLanguageFluency,
  checkLanguage,
  computeLanguageBarrier,
  resolveCommandTransmission,
  computeCommandRange_m,
  hasLanguageCapacity,
  getPrimaryLanguage,
  type LanguageCapacity,
} from "../src/competence/language";
import { mkHumanoidEntity } from "../src/sim/testing";
import type { Entity } from "../src/sim/entity";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkEntityWithLanguages(id: number, languages: LanguageCapacity[]): Entity {
  const e = mkHumanoidEntity(id, 1, 0, 0);
  return {
    ...e,
    attributes: {
      ...e.attributes,
      languages,
    },
  };
}

function mkEntityWithLinguistic(id: number, linguistic: Q): Entity {
  const e = mkHumanoidEntity(id, 1, 0, 0);
  return {
    ...e,
    attributes: {
      ...e.attributes,
      cognition: {
        linguistic,
        logicalMathematical: q(0.60) as Q,
        spatial: q(0.60) as Q,
        bodilyKinesthetic: q(0.60) as Q,
        musical: q(0.55) as Q,
        interpersonal: q(0.60) as Q,
        intrapersonal: q(0.60) as Q,
        naturalist: q(0.55) as Q,
        interSpecies: q(0.35) as Q,
      },
    },
  };
}

// ── Language Capacity ─────────────────────────────────────────────────────────

describe("language capacity", () => {
  it("returns default fluency when no languages defined", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const fluency = getLanguageFluency(e, "common");
    expect(fluency).toBe(q(0.50)); // Default
  });

  it("returns correct fluency for known language", () => {
    const e = mkEntityWithLanguages(1, [
      { languageId: "common", fluency_Q: q(1.0) as Q },
      { languageId: "elvish", fluency_Q: q(0.50) as Q },
    ]);

    expect(getLanguageFluency(e, "common")).toBe(q(1.0));
    expect(getLanguageFluency(e, "elvish")).toBe(q(0.50));
  });

  it("returns minimum fluency for unknown language", () => {
    const e = mkEntityWithLanguages(1, [
      { languageId: "common", fluency_Q: q(1.0) as Q },
    ]);

    const fluency = getLanguageFluency(e, "unknown");
    expect(fluency).toBe(q(0.10)); // Minimum threshold
  });

  it("checkLanguage returns canCommunicate based on minimum fluency", () => {
    const e = mkEntityWithLanguages(1, [
      { languageId: "common", fluency_Q: q(0.30) as Q },
    ]);

    const canCommunicate = checkLanguage(e, {
      targetLanguage: "common",
      minFluency_Q: q(0.20),
    });
    expect(canCommunicate.canCommunicate).toBe(true);

    const cannotCommunicate = checkLanguage(e, {
      targetLanguage: "common",
      minFluency_Q: q(0.50),
    });
    expect(cannotCommunicate.canCommunicate).toBe(false);
  });

  it("computeLanguageBarrier returns minimum of both parties' fluency", () => {
    const initiator = mkEntityWithLanguages(1, [
      { languageId: "common", fluency_Q: q(0.80) as Q },
    ]);
    const target = mkEntityWithLanguages(2, [
      { languageId: "common", fluency_Q: q(0.40) as Q },
    ]);

    const barrier = computeLanguageBarrier(initiator, target, "common", "common");
    expect(barrier).toBe(q(0.40)); // Limited by target's fluency
  });

  it("hasLanguageCapacity returns true when languages defined", () => {
    const withLangs = mkEntityWithLanguages(1, [
      { languageId: "common", fluency_Q: q(1.0) as Q },
    ]);
    expect(hasLanguageCapacity(withLangs)).toBe(true);

    const withoutLangs = mkHumanoidEntity(2, 1, 0, 0);
    expect(hasLanguageCapacity(withoutLangs)).toBe(false);
  });

  it("getPrimaryLanguage returns native language or highest fluency", () => {
    const native = mkEntityWithLanguages(1, [
      { languageId: "common", fluency_Q: q(1.0) as Q },
      { languageId: "elvish", fluency_Q: q(0.60) as Q },
    ]);
    expect(getPrimaryLanguage(native)).toBe("common");

    const nonNative = mkEntityWithLanguages(2, [
      { languageId: "common", fluency_Q: q(0.60) as Q },
      { languageId: "elvish", fluency_Q: q(0.80) as Q },
    ]);
    expect(getPrimaryLanguage(nonNative)).toBe("elvish");
  });
});

// ── Command Transmission ──────────────────────────────────────────────────────

describe("command transmission", () => {
  it("higher linguistic increases reception rate", () => {
    const lowSkill = mkEntityWithLinguistic(1, q(0.30));
    const highSkill = mkEntityWithLinguistic(2, q(0.90));

    const lowResult = resolveCommandTransmission(lowSkill, 5);
    const highResult = resolveCommandTransmission(highSkill, 5);

    expect(highResult.receptionRate_Q).toBeGreaterThan(lowResult.receptionRate_Q);
  });

  it("larger formations reduce reception rate", () => {
    const commander = mkEntityWithLinguistic(1, q(0.70));

    const small = resolveCommandTransmission(commander, 5);
    const large = resolveCommandTransmission(commander, 100); // Much larger formation

    expect(small.receptionRate_Q).toBeGreaterThanOrEqual(large.receptionRate_Q);
  });

  it("larger formations increase transmission delay", () => {
    const commander = mkEntityWithLinguistic(1, q(0.70));

    const small = resolveCommandTransmission(commander, 5);
    const large = resolveCommandTransmission(commander, 50);

    expect(large.transmissionDelay_ticks).toBeGreaterThanOrEqual(
      small.transmissionDelay_ticks
    );
  });

  it("higher linguistic reduces transmission delay", () => {
    const lowSkill = mkEntityWithLinguistic(1, q(0.30));
    const highSkill = mkEntityWithLinguistic(2, q(0.90));

    const lowResult = resolveCommandTransmission(lowSkill, 20);
    const highResult = resolveCommandTransmission(highSkill, 20);

    expect(highResult.transmissionDelay_ticks).toBeLessThanOrEqual(
      lowResult.transmissionDelay_ticks
    );
  });

  it("reception rate is bounded 0.10–1.0", () => {
    const veryLow = mkEntityWithLinguistic(1, q(0.05));
    const veryHigh = mkEntityWithLinguistic(2, q(1.0));

    const lowResult = resolveCommandTransmission(veryLow, 100);
    const highResult = resolveCommandTransmission(veryHigh, 1);

    expect(lowResult.receptionRate_Q).toBeGreaterThanOrEqual(q(0.10));
    expect(highResult.receptionRate_Q).toBeLessThanOrEqual(SCALE.Q);
  });
});

// ── Command Range ─────────────────────────────────────────────────────────────

describe("command range", () => {
  it("higher linguistic increases command range", () => {
    const lowSkill = mkEntityWithLinguistic(1, q(0.30));
    const highSkill = mkEntityWithLinguistic(2, q(0.90));

    const lowRange = computeCommandRange_m(lowSkill);
    const highRange = computeCommandRange_m(highSkill);

    expect(highRange).toBeGreaterThan(lowRange);
  });

  it("command range has base 50m and max 500m", () => {
    const minSkill = mkEntityWithLinguistic(1, q(0));
    const maxSkill = mkEntityWithLinguistic(2, q(1.0));

    const minRange = computeCommandRange_m(minSkill);
    const maxRange = computeCommandRange_m(maxSkill);

    expect(minRange).toBeGreaterThanOrEqual(50);
    expect(maxRange).toBeLessThanOrEqual(500);
  });
});
