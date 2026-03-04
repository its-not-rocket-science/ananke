// test/dialogue.test.ts — Phase 23: Dialogue & Negotiation Layer

import { describe, it, expect } from "vitest";
import { q, to, SCALE } from "../src/units.js";
import {
  resolveDialogue,
  applyDialogueOutcome,
  narrateDialogue,
  dialogueProbability,
  PERSUADE_BASE,
  PERSUADE_FACTION_BONUS,
  PERSUADE_FAILURE_PENALTY,
  LEADER_INTIMIDATE_REDUCTION,
  INTIMIDATE_FEAR_DELTA,
  SURRENDER_THRESHOLD,
  type DialogueContext,
  type DialogueAction,
} from "../src/dialogue.js";
import { mkHumanoidEntity } from "../src/sim/testing.js";
import type { Entity } from "../src/sim/entity.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEntity(id: number): Entity {
  return mkHumanoidEntity(id, 1, 0, 0);
}

function makeContext(overrides?: Partial<DialogueContext>): DialogueContext {
  return {
    initiator:  makeEntity(1),
    target:     makeEntity(2),
    worldSeed:  42,
    tick:       0,
    ...overrides,
  };
}

// ── Group: intimidate ─────────────────────────────────────────────────────────

describe("intimidate", () => {
  it("strong initiator vs fearful target yields high probability", () => {
    const initiator = makeEntity(1);
    // Pro-boxer-level force (5000 N real)
    initiator.attributes.performance.peakForce_N = to.N(5000);
    const target = makeEntity(2);
    target.condition.fearQ = q(0.50);
    target.attributes.resilience.distressTolerance = q(0.30);
    const P = dialogueProbability({ kind: "intimidate", intensity_Q: q(1.0) }, { initiator, target, worldSeed: 1, tick: 0 });
    expect(P).toBeGreaterThan(q(0.70));
  });

  it("weak initiator vs unfearful target yields low probability", () => {
    const initiator = makeEntity(1);
    initiator.attributes.performance.peakForce_N = to.N(500);  // weak
    const target = makeEntity(2);
    target.condition.fearQ = q(0);
    target.attributes.resilience.distressTolerance = q(0.80);
    const P = dialogueProbability({ kind: "intimidate", intensity_Q: q(1.0) }, { initiator, target, worldSeed: 1, tick: 0 });
    expect(P).toBeLessThan(q(0.20));
  });

  it("high fearQ on target increases intimidation probability", () => {
    const base = makeContext();
    base.target.attributes.resilience.distressTolerance = q(0.50);

    const fearful = makeContext();
    fearful.target.attributes.resilience.distressTolerance = q(0.50);
    fearful.target.condition.fearQ = q(0.50);

    const pBase   = dialogueProbability({ kind: "intimidate", intensity_Q: q(1.0) }, base);
    const pFear   = dialogueProbability({ kind: "intimidate", intensity_Q: q(1.0) }, fearful);
    expect(pFear).toBeGreaterThan(pBase);
  });

  it("leader trait on target reduces intimidation probability", () => {
    const noLeader = makeContext();
    const withLeader = makeContext();
    withLeader.target.traits = ["leader"];
    // Same attributes — only trait differs
    const pNo  = dialogueProbability({ kind: "intimidate", intensity_Q: q(1.0) }, noLeader);
    const pYes = dialogueProbability({ kind: "intimidate", intensity_Q: q(1.0) }, withLeader);
    expect(pNo - pYes).toBe(LEADER_INTIMIDATE_REDUCTION);
  });

  it("same seed + same inputs → same outcome (deterministic)", () => {
    const action: DialogueAction = { kind: "intimidate", intensity_Q: q(0.80) };
    const ctx = makeContext();
    const o1 = resolveDialogue(action, ctx);
    const o2 = resolveDialogue(action, ctx);
    expect(o1.result).toBe(o2.result);
  });

  it("successful intimidation sets fearDelta on outcome", () => {
    // Guaranteed success: very strong initiator, very fearful, very cowardly target
    const initiator = makeEntity(1);
    initiator.attributes.performance.peakForce_N = to.N(8000);
    const target = makeEntity(2);
    target.condition.fearQ = q(0.80);
    target.attributes.resilience.distressTolerance = q(0.10);
    const ctx = { initiator, target, worldSeed: 1, tick: 0 };
    const outcome = resolveDialogue({ kind: "intimidate", intensity_Q: q(1.0) }, ctx);
    expect(outcome.result).toBe("success");
    if (outcome.result === "success") {
      expect(outcome.fearDelta).toBe(INTIMIDATE_FEAR_DELTA);
    }
  });
});

// ── Group: persuade ───────────────────────────────────────────────────────────

describe("persuade", () => {
  it("base probability is q(0.40) with no modifiers", () => {
    const ctx = makeContext();
    // Human baseline: attentionDepth=4 → learningBonus=0; no faction; no failed attempts
    const P = dialogueProbability({ kind: "persuade" }, ctx);
    expect(P).toBe(PERSUADE_BASE);
  });

  it("high attentionDepth target boosts persuasion probability", () => {
    const lowAttn = makeContext();
    lowAttn.target.attributes.perception!.attentionDepth = 4;   // baseline

    const highAttn = makeContext();
    highAttn.target.attributes.perception!.attentionDepth = 8;   // sharp mind

    const pLow  = dialogueProbability({ kind: "persuade" }, lowAttn);
    const pHigh = dialogueProbability({ kind: "persuade" }, highAttn);
    expect(pHigh).toBeGreaterThan(pLow);
    expect(pHigh - pLow).toBe((8 - 4) * 250);  // 1000 = q(0.10)
  });

  it("sharedFaction adds PERSUADE_FACTION_BONUS to probability", () => {
    const base   = makeContext();
    const shared = makeContext({ sharedFaction: true });
    const pBase   = dialogueProbability({ kind: "persuade" }, base);
    const pShared = dialogueProbability({ kind: "persuade" }, shared);
    expect(pShared - pBase).toBe(PERSUADE_FACTION_BONUS);
  });

  it("priorFailedAttempts reduces probability by PERSUADE_FAILURE_PENALTY each", () => {
    const base    = makeContext();
    const penalty = makeContext({ priorFailedAttempts: 3 });
    const pBase    = dialogueProbability({ kind: "persuade" }, base);
    const pPenalty = dialogueProbability({ kind: "persuade" }, penalty);
    expect(pBase - pPenalty).toBe(3 * PERSUADE_FAILURE_PENALTY);
  });

  it("priorFailedAttempts state serialises round-trip", () => {
    const state = { priorFailedAttempts: 2, sharedFaction: true };
    const restored = JSON.parse(JSON.stringify(state));
    expect(restored.priorFailedAttempts).toBe(2);
    // Verify the penalty is still applied after restoration
    const ctx = makeContext({ priorFailedAttempts: restored.priorFailedAttempts });
    const pBase  = dialogueProbability({ kind: "persuade" }, makeContext());
    const pAfter = dialogueProbability({ kind: "persuade" }, ctx);
    expect(pAfter).toBeLessThan(pBase);
  });

  it("persuade never returns escalate", () => {
    for (let seed = 0; seed < 20; seed++) {
      const ctx = makeContext({ worldSeed: seed });
      const o = resolveDialogue({ kind: "persuade" }, ctx);
      expect(o.result).not.toBe("escalate");
    }
  });
});

// ── Group: deceive ────────────────────────────────────────────────────────────

describe("deceive", () => {
  it("low plausibility against high attentionDepth yields low probability", () => {
    const ctx = makeContext();
    ctx.target.attributes.perception!.attentionDepth = 8;  // sharp mind
    const P = dialogueProbability({ kind: "deceive", plausibility_Q: q(0.30) }, ctx);
    expect(P).toBeLessThan(q(0.10));
  });

  it("high plausibility against low attentionDepth yields high probability", () => {
    const ctx = makeContext();
    ctx.target.attributes.perception!.attentionDepth = 2;  // inattentive
    const P = dialogueProbability({ kind: "deceive", plausibility_Q: q(0.90) }, ctx);
    expect(P).toBeGreaterThan(q(0.65));
  });

  it("same seed → same outcome (deterministic)", () => {
    const action: DialogueAction = { kind: "deceive", plausibility_Q: q(0.60) };
    const ctx = makeContext();
    expect(resolveDialogue(action, ctx).result).toBe(resolveDialogue(action, ctx).result);
  });

  it("deception outcome is only success or failure — never escalate", () => {
    for (let seed = 0; seed < 20; seed++) {
      const ctx = makeContext({ worldSeed: seed });
      const o = resolveDialogue({ kind: "deceive", plausibility_Q: q(0.50) }, ctx);
      expect(o.result).not.toBe("escalate");
    }
  });
});

// ── Group: surrender ──────────────────────────────────────────────────────────

describe("surrender", () => {
  it("fearful target (fearQ > threshold) accepts", () => {
    const ctx = makeContext();
    ctx.target.condition.fearQ = q(0.80);
    const o = resolveDialogue({ kind: "surrender" }, ctx);
    expect(o.result).toBe("success");
  });

  it("fearless target (fearQ = 0) rejects", () => {
    const ctx = makeContext();
    ctx.target.condition.fearQ = q(0);
    const o = resolveDialogue({ kind: "surrender" }, ctx);
    expect(o.result).toBe("failure");
  });

  it("accepted surrender sets target.condition.surrendered via applyDialogueOutcome", () => {
    const ctx = makeContext();
    ctx.target.condition.fearQ = q(0.90);
    const o = resolveDialogue({ kind: "surrender" }, ctx);
    expect(o.result).toBe("success");
    applyDialogueOutcome(o, ctx.target);
    expect(ctx.target.condition.surrendered).toBe(true);
  });

  it("offer with fearQ exactly above threshold always resolves as accepted", () => {
    // fearQ = SURRENDER_THRESHOLD + 1 → P > 0 → deterministic success
    const ctx = makeContext();
    ctx.target.condition.fearQ = (SURRENDER_THRESHOLD + 1) as any;
    const o = resolveDialogue({ kind: "surrender" }, ctx);
    expect(o.result).toBe("success");
  });
});

// ── Group: escalation ─────────────────────────────────────────────────────────

describe("escalation", () => {
  it("intimidation failure + fearQ < ESCALATE_THRESHOLD → escalate", () => {
    // Guaranteed failure: weak initiator, and target is fearless (escalation condition)
    const initiator = makeEntity(1);
    initiator.attributes.performance.peakForce_N = to.N(400);   // very weak
    const target = makeEntity(2);
    target.condition.fearQ = q(0.05);                           // below escalate threshold
    target.attributes.resilience.distressTolerance = q(0.90);  // very brave

    let escalated = false;
    for (let seed = 0; seed < 50; seed++) {
      const o = resolveDialogue(
        { kind: "intimidate", intensity_Q: q(1.0) },
        { initiator, target, worldSeed: seed, tick: 0 },
      );
      if (o.result === "escalate") { escalated = true; break; }
    }
    expect(escalated).toBe(true);
  });

  it("persuade never returns escalate", () => {
    for (let seed = 0; seed < 30; seed++) {
      const o = resolveDialogue({ kind: "persuade" }, makeContext({ worldSeed: seed }));
      expect(o.result).not.toBe("escalate");
    }
  });

  it("escalate outcome carries no moraleDelta or fearDelta", () => {
    const initiator = makeEntity(1);
    initiator.attributes.performance.peakForce_N = to.N(400);
    const target = makeEntity(2);
    target.condition.fearQ = q(0.05);
    target.attributes.resilience.distressTolerance = q(0.90);

    for (let seed = 0; seed < 50; seed++) {
      const o = resolveDialogue(
        { kind: "intimidate", intensity_Q: q(1.0) },
        { initiator, target, worldSeed: seed, tick: 0 },
      );
      if (o.result === "escalate") {
        // Escalate has no delta fields
        expect((o as any).fearDelta).toBeUndefined();
        expect((o as any).moraleDelta).toBeUndefined();
        break;
      }
    }
  });
});

// ── Group: narrative ──────────────────────────────────────────────────────────

describe("narrateDialogue", () => {
  const action: DialogueAction = { kind: "intimidate", intensity_Q: q(0.80) };
  const successOutcome         = { result: "success" as const, fearDelta: INTIMIDATE_FEAR_DELTA };
  const failureOutcome         = { result: "failure" as const, cooldown_s: 30 };

  it("returns a non-empty string for any action/outcome pair", () => {
    const cfg = { verbosity: "normal" as const };
    expect(narrateDialogue(action, successOutcome, cfg).length).toBeGreaterThan(0);
    expect(narrateDialogue(action, failureOutcome, cfg).length).toBeGreaterThan(0);
    expect(narrateDialogue(action, { result: "escalate" }, cfg).length).toBeGreaterThan(0);
  });

  it("verbose output is longer than terse for the same action/outcome", () => {
    const terseCfg   = { verbosity: "terse" as const };
    const verboseCfg = { verbosity: "verbose" as const };
    const terse   = narrateDialogue(action, successOutcome, terseCfg);
    const verbose = narrateDialogue(action, successOutcome, verboseCfg);
    expect(verbose.length).toBeGreaterThan(terse.length);
  });

  it("includes entity names from nameMap in verbose mode", () => {
    const cfg = {
      verbosity: "verbose" as const,
      nameMap:   new Map([[1, "Sir Roland"], [2, "the bandit"]]),
    };
    const line = narrateDialogue(action, successOutcome, cfg, { initiatorId: 1, targetId: 2 });
    expect(line).toContain("Sir Roland");
    expect(line).toContain("the bandit");
  });
});

// ── Group: applyDialogueOutcome ───────────────────────────────────────────────

describe("applyDialogueOutcome", () => {
  it("fearDelta is added to target.condition.fearQ", () => {
    const target = makeEntity(2);
    target.condition.fearQ = q(0.30);
    applyDialogueOutcome({ result: "success", fearDelta: INTIMIDATE_FEAR_DELTA }, target);
    expect(target.condition.fearQ).toBe(q(0.30) + INTIMIDATE_FEAR_DELTA);
  });

  it("fearQ is clamped to [0, SCALE.Q] on application", () => {
    const target = makeEntity(2);
    target.condition.fearQ = q(0.95);
    applyDialogueOutcome({ result: "success", fearDelta: q(0.20) }, target);
    expect(target.condition.fearQ).toBeLessThanOrEqual(SCALE.Q);
  });

  it("moraleDelta reduces fearQ", () => {
    const target = makeEntity(2);
    target.condition.fearQ = q(0.50);
    applyDialogueOutcome({ result: "success", moraleDelta: q(0.10) }, target);
    expect(target.condition.fearQ).toBe(q(0.40));
  });

  it("no-op on failure outcome", () => {
    const target = makeEntity(2);
    const before = target.condition.fearQ;
    applyDialogueOutcome({ result: "failure", cooldown_s: 30 }, target);
    expect(target.condition.fearQ).toBe(before);
  });
});
