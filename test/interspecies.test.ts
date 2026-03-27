/**
 * Phase 36 — Inter-Species Intelligence & Xenodiplomacy
 *
 * Groups:
 *   Latency penalty      (5) — unfamiliar species penalty calculation, affinity check
 *   Signal resolution    (6) — success probability, comprehension, aggravation
 *   Dialogue integration (4) — signal action in dialogue system
 *   Edge cases           (3) — missing cognition, backward compatibility
 */

import { describe, it, expect } from "vitest";
import { SCALE, q, type Q } from "../src/units.js";
import {
  computeUnfamiliarSpeciesLatencyPenalty,
  resolveSignal,
  hasSpeciesAffinity,
  buildDefaultSignalVocab,
  getEffectiveEmpathy,
  type SignalSpec,
} from "../src/competence/interspecies.js";
import { mkHumanoidEntity } from "../src/sim/testing.js";
import type { Entity } from "../src/sim/entity.js";
import { resolveDialogue, type DialogueContext } from "../src/dialogue.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkEntityWithInterSpecies(id: number, interSpecies: Q, affinity: string[] = []): Entity {
  const e = mkHumanoidEntity(id, 1, 0, 0);
  return {
    ...e,
    attributes: {
      ...e.attributes,
      cognition: {
        linguistic: q(0.60) as Q,
        logicalMathematical: q(0.60) as Q,
        spatial: q(0.60) as Q,
        bodilyKinesthetic: q(0.60) as Q,
        musical: q(0.55) as Q,
        interpersonal: q(0.60) as Q,
        intrapersonal: q(0.60) as Q,
        naturalist: q(0.55) as Q,
        interSpecies,
        speciesAffinity: affinity,
        signalVocab: buildDefaultSignalVocab("human"),
      },
    },
  };
}

// ── Latency Penalty ───────────────────────────────────────────────────────────

describe("latency penalty", () => {
  it("returns 0 for familiar species (in affinity list)", () => {
    const e = mkEntityWithInterSpecies(1, q(0.35), ["dragon", "wolf"]);
    const penalty = computeUnfamiliarSpeciesLatencyPenalty(e, "dragon");
    expect(penalty).toBe(0);
  });

  it("returns positive penalty for unfamiliar species", () => {
    const e = mkEntityWithInterSpecies(1, q(0.35), ["human"]);
    const penalty = computeUnfamiliarSpeciesLatencyPenalty(e, "dragon");
    expect(penalty).toBeGreaterThan(0);
  });

  it("higher interSpecies reduces penalty", () => {
    const lowSkill = mkEntityWithInterSpecies(1, q(0.20), []);
    const highSkill = mkEntityWithInterSpecies(2, q(0.80), []);

    const lowPenalty = computeUnfamiliarSpeciesLatencyPenalty(lowSkill, "dragon");
    const highPenalty = computeUnfamiliarSpeciesLatencyPenalty(highSkill, "dragon");

    expect(highPenalty).toBeLessThan(lowPenalty);
  });

  it("maximum penalty at interSpecies q(0.0) is ~80ms", () => {
    const e = mkEntityWithInterSpecies(1, q(0), []);
    const penalty = computeUnfamiliarSpeciesLatencyPenalty(e, "dragon");
    // 80ms in SCALE.s units = 0.080 * 10000 = 800
    expect(penalty).toBeLessThanOrEqual(800);
    expect(penalty).toBeGreaterThan(700); // Close to max
  });

  it("zero penalty at interSpecies q(1.0) for unfamiliar", () => {
    const e = mkEntityWithInterSpecies(1, q(1.0), []);
    const penalty = computeUnfamiliarSpeciesLatencyPenalty(e, "dragon");
    expect(penalty).toBe(0);
  });
});

// ── Signal Resolution ─────────────────────────────────────────────────────────

describe("signal resolution", () => {
  it("higher empathy increases success probability", () => {
    const lowEmpathy = mkEntityWithInterSpecies(1, q(0.30));
    const highEmpathy = mkEntityWithInterSpecies(2, q(0.80));

    const spec: SignalSpec = {
      targetSpecies: "wolf",
      intent: "calm",
      targetFearQ: q(0.20),
    };

    let lowSuccess = 0;
    let highSuccess = 0;
    const trials = 100;

    for (let i = 0; i < trials; i++) {
      const lowOut = resolveSignal(lowEmpathy, spec, i);
      const highOut = resolveSignal(highEmpathy, spec, i + 1000);
      if (lowOut.success) lowSuccess++;
      if (highOut.success) highSuccess++;
    }

    expect(highSuccess).toBeGreaterThan(lowSuccess);
  });

  it("fearful targets are harder to signal", () => {
    const e = mkEntityWithInterSpecies(1, q(0.60));

    const calmSpec: SignalSpec = {
      targetSpecies: "wolf",
      intent: "calm",
      targetFearQ: q(0.10),
    };
    const fearfulSpec: SignalSpec = {
      targetSpecies: "wolf",
      intent: "calm",
      targetFearQ: q(0.80),
    };

    let calmSuccess = 0;
    let fearfulSuccess = 0;
    const trials = 100;

    for (let i = 0; i < trials; i++) {
      const calmOut = resolveSignal(e, calmSpec, i);
      const fearfulOut = resolveSignal(e, fearfulSpec, i + 1000);
      if (calmOut.success) calmSuccess++;
      if (fearfulOut.success) fearfulSuccess++;
    }

    expect(calmSuccess).toBeGreaterThanOrEqual(fearfulSuccess);
  });

  it("vocabulary comprehension affects success", () => {
    const e = mkEntityWithInterSpecies(1, q(0.60));
    // Default vocab has q(0.15) for wolf

    const eWithVocab = mkEntityWithInterSpecies(2, q(0.60));
    eWithVocab.attributes.cognition!.signalVocab!.set("wolf", q(0.80));

    const spec: SignalSpec = {
      targetSpecies: "wolf",
      intent: "calm",
      targetFearQ: q(0.20),
    };

    let baseSuccess = 0;
    let vocabSuccess = 0;
    const trials = 100;

    for (let i = 0; i < trials; i++) {
      const baseOut = resolveSignal(e, spec, i);
      const vocabOut = resolveSignal(eWithVocab, spec, i + 1000);
      if (baseOut.success) baseSuccess++;
      if (vocabOut.success) vocabSuccess++;
    }

    expect(vocabSuccess).toBeGreaterThan(baseSuccess);
  });

  it("low empathy + fearful target can aggravate", () => {
    const lowEmpathy = mkEntityWithInterSpecies(1, q(0.20));

    const spec: SignalSpec = {
      targetSpecies: "bear",
      intent: "calm",
      targetFearQ: q(0.80), // High fear
    };

    let aggravatedCount = 0;
    const trials = 50;

    for (let i = 0; i < trials; i++) {
      const out = resolveSignal(lowEmpathy, spec, i);
      if (out.aggravated) aggravatedCount++;
    }

    // Should aggravate sometimes with low empathy and high fear
    expect(aggravatedCount).toBeGreaterThan(0);
  });

  it("comprehension is 0-1 bounded", () => {
    const e = mkEntityWithInterSpecies(1, q(0.70));
    const spec: SignalSpec = {
      targetSpecies: "wolf",
      intent: "ally",
      targetFearQ: q(0.30),
    };

    const out = resolveSignal(e, spec, 42);

    expect(out.comprehension_Q).toBeGreaterThanOrEqual(0);
    expect(out.comprehension_Q).toBeLessThanOrEqual(SCALE.Q);
  });

  it("is deterministic with same seed", () => {
    const e = mkEntityWithInterSpecies(1, q(0.70));
    const spec: SignalSpec = {
      targetSpecies: "wolf",
      intent: "calm",
      targetFearQ: q(0.30),
    };

    const out1 = resolveSignal(e, spec, 123);
    const out2 = resolveSignal(e, spec, 123);

    expect(out1.success).toBe(out2.success);
    expect(out1.comprehension_Q).toBe(out2.comprehension_Q);
    expect(out1.aggravated).toBe(out2.aggravated);
  });
});

// ── Species Affinity ───────────────────────────────────────────────────────────

describe("species affinity", () => {
  it("hasSpeciesAffinity returns true for familiar species", () => {
    const e = mkEntityWithInterSpecies(1, q(0.50), ["dragon", "wolf", "elf"]);
    expect(hasSpeciesAffinity(e, "dragon")).toBe(true);
    expect(hasSpeciesAffinity(e, "wolf")).toBe(true);
    expect(hasSpeciesAffinity(e, "elf")).toBe(true);
  });

  it("hasSpeciesAffinity returns false for unfamiliar species", () => {
    const e = mkEntityWithInterSpecies(1, q(0.50), ["dragon"]);
    expect(hasSpeciesAffinity(e, "wolf")).toBe(false);
    expect(hasSpeciesAffinity(e, "troll")).toBe(false);
  });

  it("default signal vocab has high comprehension for own species", () => {
    const vocab = buildDefaultSignalVocab("elf");
    expect(vocab.get("elf")).toBe(q(0.80));
  });

  it("default signal vocab has low comprehension for others", () => {
    const vocab = buildDefaultSignalVocab("elf");
    expect(vocab.get("human")).toBe(q(0.15));
    expect(vocab.get("orc")).toBe(q(0.15));
  });
});

// ── Dialogue Integration ───────────────────────────────────────────────────────

describe("dialogue integration", () => {
  it("signal action returns success with comprehension on success", () => {
    const initiator = mkEntityWithInterSpecies(1, q(0.90)); // High empathy
    const target = mkHumanoidEntity(2, 2, 10, 0);
    target.condition.fearQ = q(0.10); // Low fear

    const ctx: DialogueContext = {
      initiator,
      target,
      worldSeed: 42,
      tick: 0,
    };

    const action = {
      kind: "signal" as const,
      targetSpecies: "human",
      intent: "calm" as const,
    };

    const outcome = resolveDialogue(action, ctx);

    // With high empathy and low fear, should succeed
    expect(outcome.result).toBe("success");
    expect(outcome.comprehension_Q).toBeDefined();
  });

  it("signal action returns failure with aggravated flag when appropriate", () => {
    const initiator = mkEntityWithInterSpecies(1, q(0.20)); // Low empathy
    const target = mkHumanoidEntity(2, 2, 10, 0);
    target.condition.fearQ = q(0.90); // High fear

    const ctx: DialogueContext = {
      initiator,
      target,
      worldSeed: 42,
      tick: 0,
    };

    const action = {
      kind: "signal" as const,
      targetSpecies: "dragon",
      intent: "calm" as const,
    };

    // Run multiple times to find a failure case
    let foundAggravated = false;
    for (let i = 0; i < 50; i++) {
      const ctxWithSeed = { ...ctx, worldSeed: i };
      const outcome = resolveDialogue(action, ctxWithSeed);
      if (outcome.result === "failure" && outcome.aggravated) {
        foundAggravated = true;
        break;
      }
    }

    expect(foundAggravated).toBe(true);
  });

  it("signal action is deterministic with same inputs", () => {
    const initiator = mkEntityWithInterSpecies(1, q(0.70));
    const target = mkHumanoidEntity(2, 2, 10, 0);
    target.condition.fearQ = q(0.30);

    const ctx: DialogueContext = {
      initiator,
      target,
      worldSeed: 123,
      tick: 5,
    };

    const action = {
      kind: "signal" as const,
      targetSpecies: "wolf",
      intent: "ally" as const,
    };

    const out1 = resolveDialogue(action, ctx);
    const out2 = resolveDialogue(action, ctx);

    expect(out1.result).toBe(out2.result);
    expect(out1.comprehension_Q).toBe(out2.comprehension_Q);
  });

  it("different intents produce valid outcomes", () => {
    const initiator = mkEntityWithInterSpecies(1, q(0.70));
    const target = mkHumanoidEntity(2, 2, 10, 0);
    target.condition.fearQ = q(0.30);

    const intents: Array<"calm" | "submit" | "ally" | "territory"> = ["calm", "submit", "ally", "territory"];

    for (const intent of intents) {
      const ctx: DialogueContext = {
        initiator,
        target,
        worldSeed: 42,
        tick: 0,
      };

      const action = {
        kind: "signal" as const,
        targetSpecies: "wolf",
        intent,
      };

      const outcome = resolveDialogue(action, ctx);
      expect(["success", "failure"]).toContain(outcome.result);
    }
  });
});

// ── Edge Cases ─────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles missing cognition with defaults", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const eNoCognition = {
      ...e,
      attributes: { ...e.attributes, cognition: undefined },
    };

    const penalty = computeUnfamiliarSpeciesLatencyPenalty(eNoCognition, "dragon");
    expect(penalty).toBeGreaterThanOrEqual(0);

    const spec: SignalSpec = {
      targetSpecies: "wolf",
      intent: "calm",
      targetFearQ: q(0.30),
    };
    const out = resolveSignal(eNoCognition, spec, 1);
    expect(out.success).toBeDefined();
    expect(out.comprehension_Q).toBeGreaterThanOrEqual(0);
  });

  it("getEffectiveEmpathy returns default q(0.35) when cognition absent", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const eNoCognition = {
      ...e,
      attributes: { ...e.attributes, cognition: undefined },
    };

    const empathy = getEffectiveEmpathy(eNoCognition);
    expect(empathy).toBe(q(0.35));
  });

  it("getEffectiveEmpathy returns interSpecies when present", () => {
    const e = mkEntityWithInterSpecies(1, q(0.75));
    const empathy = getEffectiveEmpathy(e);
    expect(empathy).toBe(q(0.75));
  });

  it("empty affinity list means all species are unfamiliar", () => {
    const e = mkEntityWithInterSpecies(1, q(0.50), []);
    expect(hasSpeciesAffinity(e, "human")).toBe(false);
    expect(hasSpeciesAffinity(e, "dragon")).toBe(false);

    const penalty1 = computeUnfamiliarSpeciesLatencyPenalty(e, "human");
    const penalty2 = computeUnfamiliarSpeciesLatencyPenalty(e, "dragon");
    expect(penalty1).toBeGreaterThan(0);
    expect(penalty2).toBeGreaterThan(0);
  });
});
