// src/dialogue.ts — Phase 23: Dialogue & Negotiation Layer
//
// Non-combat resolution grounded in the same physical and psychological
// attributes as the combat engine.  No arbitrary Charisma stats —
// intimidation strength comes from peakForce_N, persuasion from cognition,
// deception is defeated by attentionDepth.
//
// No kernel import — pure data-resolution module.

import type { Q, I32 }  from "./units.js";
import { SCALE, q, clampQ, qMul, mulDiv, to } from "./units.js";
import type { Entity } from "./sim/entity.js";
import { eventSeed } from "./sim/seeds.js";
import { makeRng }   from "./rng.js";
import type { NarrativeConfig } from "./narrative.js";
import { resolveSignal } from "./competence/interspecies.js";
import type { FactionRegistry } from "./faction.js";
import type { RelationshipGraph, RelationshipEventType } from "./relationships.js";
import { recordRelationshipEvent } from "./relationships.js";
import type { CampaignState } from "./campaign.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A lightweight trade item for negotiation offers. Full item economy is Phase 25. */
export interface TradeItem {
  id:    string;
  value: number;   // abstract value units (positive integer)
}

/** A proposed exchange: initiator gives items and receives items in return. */
export interface TradeOffer {
  giving:    TradeItem[];   // items initiator offers
  receiving: TradeItem[];   // items initiator asks for
}

/** All possible social actions an entity can take. */
export type DialogueAction =
  | { kind: "intimidate"; intensity_Q: Q }        // back off or we fight
  | { kind: "persuade";   argument?: string }      // reason together
  | { kind: "deceive";    plausibility_Q: Q }      // claim something false
  | { kind: "surrender";  terms?: string }         // ask target to lay down arms
  | { kind: "negotiate";  offer: TradeOffer }      // propose exchange
  | { kind: "signal";     targetSpecies: string; intent: "calm" | "submit" | "ally" | "territory" }; // Phase 36: cross-species signaling

/** The resolution result of a dialogue action. */
export type DialogueOutcome =
  | { result: "success";  moraleDelta?: Q; fearDelta?: Q; setSurrendered?: boolean; comprehension_Q?: Q }
  | { result: "failure";  cooldown_s: number; aggravated?: boolean }
  | { result: "escalate" };

/**
 * Context for a dialogue resolution.
 *
 * `sharedFaction` — when true, applies a `PERSUADE_FACTION_BONUS` to persuasion rolls;
 *   set by the host when entities belong to the same faction.
 * `priorFailedAttempts` — cumulative failed persuasion attempts by this initiator against
 *   this target; each one imposes a PERSUADE_FAILURE_PENALTY.
 */
export interface DialogueContext {
  initiator:            Entity;
  target:               Entity;
  worldSeed:            number;
  tick:                 number;
  sharedFaction?:       boolean;   // bonus applied when initiator and target share a faction
  priorFailedAttempts?: number;    // failed persuasion attempts (penalty accumulator)
  /** Initiator standing with target's faction (q(0.5)=neutral). */
  factionStanding_Q?:   Q;
  /** Existing interpersonal trust between initiator and target. */
  relationshipTrust_Q?: Q;
  /** Existing interpersonal affinity (-q(1.0)..q(1.0)). */
  relationshipAffinity_Q?: Q;
  /** Initiator fame axis from renown registry. */
  initiatorRenown_Q?:   Q;
  /** Initiator dark reputation axis from renown registry. */
  initiatorInfamy_Q?:   Q;
  /** Campaign pressure on target (siege, attrition, isolation). */
  campaignPressure_Q?:  Q;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Real-newton threshold where intimidation force factor reaches q(1.0). */
const INTIMIDATE_FORCE_SCALE: I32 = to.N(4000);

/** Reduction to intimidation probability when target has the "leader" trait. */
export const LEADER_INTIMIDATE_REDUCTION: Q = q(0.15);

/** Base success probability for an unmodified persuade attempt. */
export const PERSUADE_BASE: Q = q(0.40);

/** Persuasion bonus when initiator and target share a faction (Phase 24). */
export const PERSUADE_FACTION_BONUS: Q = q(0.10);

/** Persuasion penalty per prior failed attempt against this target. */
export const PERSUADE_FAILURE_PENALTY: Q = q(0.10);

/** Fear increase applied to target when intimidation succeeds. */
export const INTIMIDATE_FEAR_DELTA: Q = q(0.15);

/** Minimum fearQ for target to consider accepting surrender. Below this = always refuses. */
export const SURRENDER_THRESHOLD: Q = q(0.40);

/**
 * If intimidation *fails* and target's fearQ is below this value,
 * the target interprets the attempt as an insult and escalates.
 */
export const ESCALATE_THRESHOLD: Q = q(0.20);
export const STANDING_NEUTRAL_Q: Q = q(0.50);
export const RELATIONSHIP_NEUTRAL_AFFINITY_Q: Q = q(0);
export const INTIMIDATE_REPUTATION_WEIGHT_Q: Q = q(0.20);
export const PERSUADE_STANDING_WEIGHT_Q: Q = q(0.20);
export const PERSUADE_TRUST_WEIGHT_Q: Q = q(0.20);
export const PERSUADE_AFFINITY_WEIGHT_Q: Q = q(0.10);
export const PERSUADE_RENOWN_WEIGHT_Q: Q = q(0.15);
export const SURRENDER_PRESSURE_WEIGHT_Q: Q = q(0.20);
export const NEGOTIATE_STANDING_WEIGHT_Q: Q = q(0.30);
export const NEGOTIATE_TRUST_WEIGHT_Q: Q = q(0.20);
export const NEGOTIATE_AFFINITY_WEIGHT_Q: Q = q(0.10);

// ── RNG salts ─────────────────────────────────────────────────────────────────

const SALT_INTIMIDATE = 0xD1A100;
const SALT_PERSUADE   = 0xD1A101;
const SALT_DECEIVE    = 0xD1A102;
const SALT_SIGNAL     = 0xD1A103; // Phase 36: cross-species signaling

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Convert a fixed-point force (SCALE.N units) to a Q fraction in [0, 1].
 * q(1.0) corresponds to INTIMIDATE_FORCE_SCALE (4000 N real).
 */
function forceToQ(peakForce_N: I32): Q {
  return clampQ(mulDiv(peakForce_N, SCALE.Q, INTIMIDATE_FORCE_SCALE), 0, SCALE.Q);
}

/**
 * Convert an integer `attentionDepth` to a Q fraction in [0, 1].
 * Human baseline (4) → q(0.40); robot / sharp mind (10) → q(1.0).
 */
function attentionDepthQ(depth: number): Q {
  return clampQ(Math.trunc((depth * SCALE.Q) / 10), 0, SCALE.Q);
}

/**
 * Learning rate bonus for persuasion derived from attentionDepth.
 * +250 per point above the human baseline of 4, capped at q(0.20).
 */
function learningBonus(attentionDepth: number): Q {
  return clampQ(Math.max(0, attentionDepth - 4) * 250, 0, q(0.20)) as Q;
}

function signedMulQ(value_Q: Q, weight_Q: Q): Q {
  return Math.trunc((value_Q * weight_Q) / SCALE.Q) as Q;
}

function standingCenteredQ(standing_Q?: Q): Q {
  return ((standing_Q ?? STANDING_NEUTRAL_Q) - STANDING_NEUTRAL_Q) as Q;
}

function persuasionSocialModifier(ctx: DialogueContext): Q {
  const standingBonus = signedMulQ(standingCenteredQ(ctx.factionStanding_Q), PERSUADE_STANDING_WEIGHT_Q);
  const trustBonus = signedMulQ(
    ((ctx.relationshipTrust_Q ?? STANDING_NEUTRAL_Q) - STANDING_NEUTRAL_Q) as Q,
    PERSUADE_TRUST_WEIGHT_Q,
  );
  const affinityBonus = signedMulQ(
    (ctx.relationshipAffinity_Q ?? RELATIONSHIP_NEUTRAL_AFFINITY_Q),
    PERSUADE_AFFINITY_WEIGHT_Q,
  );
  const renownDelta = ((ctx.initiatorRenown_Q ?? q(0)) - (ctx.initiatorInfamy_Q ?? q(0))) as Q;
  const renownBonus = signedMulQ(renownDelta, PERSUADE_RENOWN_WEIGHT_Q);
  return (standingBonus + trustBonus + affinityBonus + renownBonus) as Q;
}

function intimidationReputationModifier(ctx: DialogueContext): Q {
  const profile = Math.max(ctx.initiatorRenown_Q ?? q(0), ctx.initiatorInfamy_Q ?? q(0)) as Q;
  return signedMulQ(profile, INTIMIDATE_REPUTATION_WEIGHT_Q);
}

function negotiationSocialBias(ctx: DialogueContext): Q {
  const standingBias = signedMulQ(standingCenteredQ(ctx.factionStanding_Q), NEGOTIATE_STANDING_WEIGHT_Q);
  const trustCentered = ((ctx.relationshipTrust_Q ?? STANDING_NEUTRAL_Q) - STANDING_NEUTRAL_Q) as Q;
  const trustBias = signedMulQ(trustCentered, NEGOTIATE_TRUST_WEIGHT_Q);
  const affinityBias = signedMulQ(
    (ctx.relationshipAffinity_Q ?? RELATIONSHIP_NEUTRAL_AFFINITY_Q),
    NEGOTIATE_AFFINITY_WEIGHT_Q,
  );
  return (standingBias + trustBias + affinityBias) as Q;
}

// ── Probability computation ───────────────────────────────────────────────────

/**
 * Compute the success probability for a dialogue action without rolling RNG.
 *
 * Exported so tests can assert on exact probability values without seeding concerns.
 * For "escalate" scenarios the probability returned is the *intimidation* probability;
 * escalation is a post-failure branch, not a separate probability.
 */
export function dialogueProbability(
  action: DialogueAction,
  ctx:    DialogueContext,
): Q {
  const { initiator, target } = ctx;

  switch (action.kind) {
    case "intimidate": {
      const forceFrac  = forceToQ(initiator.attributes.performance.peakForce_N);
      const leaderRed  = target.traits.includes("leader") ? LEADER_INTIMIDATE_REDUCTION : 0;
      return clampQ(
        forceFrac
          + target.condition.fearQ!
          - target.attributes.resilience.distressTolerance
          + intimidationReputationModifier(ctx)
          - leaderRed,
        0, SCALE.Q,
      );
    }

    case "persuade": {
      const failed = ctx.priorFailedAttempts ?? 0;
      // Phase 33: linguistic intelligence sets per-entity persuasion base
      // Formula: q(0.20) + linguistic × q(0.30); human (0.65) → q(0.395); elf (0.80) → q(0.44)
      const linguisticQ = initiator.attributes.cognition?.linguistic;
      const dynamicBase: Q = linguisticQ !== undefined
        ? clampQ((q(0.20) + mulDiv(q(0.30), linguisticQ, SCALE.Q)) as Q, q(0.20), q(0.50))
        : PERSUADE_BASE;
      return clampQ(
        dynamicBase
          + learningBonus(target.attributes.perception?.attentionDepth ?? 0)
          + (ctx.sharedFaction ? PERSUADE_FACTION_BONUS : 0)
          + persuasionSocialModifier(ctx)
          - (failed * PERSUADE_FAILURE_PENALTY),
        0, SCALE.Q,
      );
    }

    case "deceive": {
      // Phase 37: deception detection uses both attentionDepth AND interpersonal
      // P_success = plausibility × (1 - attentionDepth) × (1 - interpersonal × 0.50)
      const attentionFactor = (SCALE.Q - attentionDepthQ(target.attributes.perception?.attentionDepth ?? 0)) as Q;
      // Interpersonal gives defensive bonus against deception
      const interpersonal: Q = (target.attributes.cognition?.interpersonal ?? q(0.50)) as Q;
      const interpersonalFactor = clampQ(
        (SCALE.Q - mulDiv(interpersonal, q(0.50), SCALE.Q)) as Q,
        q(0.50),
        SCALE.Q as Q,
      );
      return qMul(qMul(action.plausibility_Q, attentionFactor), interpersonalFactor);
    }

    case "surrender":
      // Returns non-zero only when target's fear exceeds the acceptance threshold.
      return clampQ(
        target.condition.fearQ!
          + signedMulQ((ctx.campaignPressure_Q ?? q(0)), SURRENDER_PRESSURE_WEIGHT_Q)
          - SURRENDER_THRESHOLD,
        0,
        SCALE.Q,
      );

    case "negotiate": {
      const given    = action.offer.giving.reduce((s, i)    => s + i.value, 0);
      const received = action.offer.receiving.reduce((s, i) => s + i.value, 0);
      const total = Math.max(1, given + received);
      const baseUtility_Q = Math.trunc(((given - received) * SCALE.Q) / total) as Q;
      const adjusted = (baseUtility_Q + negotiationSocialBias(ctx)) as Q;
      return adjusted > 0 ? SCALE.Q : 0;
    }

    case "signal":
      // Phase 36: signal probability is computed in resolveSignal; here we return a placeholder
      // The actual resolution uses the interspecies resolver
      return q(0.50);
  }
}

// ── Resolution ────────────────────────────────────────────────────────────────

/**
 * Resolve a dialogue action and return the outcome.
 *
 * - Intimidate, persuade, and deceive use seeded RNG.
 * - Surrender is deterministic: succeeds if target.fearQ > SURRENDER_THRESHOLD.
 * - Negotiate is deterministic: succeeds if trade utility is positive for the target.
 *
 * @returns A DialogueOutcome.  Use `applyDialogueOutcome` to write deltas back to entities.
 */
export function resolveDialogue(
  action: DialogueAction,
  ctx:    DialogueContext,
): DialogueOutcome {
  const P = dialogueProbability(action, ctx);

  // Deterministic branches
  if (action.kind === "surrender") {
    if (P > 0) return { result: "success", setSurrendered: true };
    return { result: "failure", cooldown_s: 0 };
  }

  if (action.kind === "negotiate") {
    return P > 0
      ? { result: "success" }
      : { result: "failure", cooldown_s: 0 };
  }

  // Phase 36: Signal action uses interspecies resolver
  if (action.kind === "signal") {
    const seed = eventSeed(ctx.worldSeed, ctx.tick, ctx.initiator.id, ctx.target.id, SALT_SIGNAL);
    const signalOutcome = resolveSignal(ctx.initiator, {
      targetSpecies: action.targetSpecies,
      intent: action.intent,
      targetFearQ: ctx.target.condition.fearQ ?? q(0),
    }, seed);

    if (signalOutcome.success) {
      return { result: "success", comprehension_Q: signalOutcome.comprehension_Q };
    }
    return { result: "failure", cooldown_s: 45, aggravated: signalOutcome.aggravated };
  }

  // RNG-based branches (intimidate, persuade, deceive)
  const salt = action.kind === "intimidate" ? SALT_INTIMIDATE
             : action.kind === "persuade"   ? SALT_PERSUADE
             :                                SALT_DECEIVE;

  const seed = eventSeed(ctx.worldSeed, ctx.tick, ctx.initiator.id, ctx.target.id, salt);
  const rng  = makeRng(seed, SCALE.Q);

  if (rng.q01() < P) {
    if (action.kind === "intimidate") {
      return { result: "success", fearDelta: INTIMIDATE_FEAR_DELTA };
    }
    return { result: "success" };
  }

  // Failure branches
  if (action.kind === "intimidate") {
    // Fearless targets interpret intimidation as an insult.
    if (ctx.target.condition.fearQ! < ESCALATE_THRESHOLD) {
      return { result: "escalate" };
    }
    return { result: "failure", cooldown_s: 30 };
  }

  const cooldown = action.kind === "persuade" ? 60 : 120;
  return { result: "failure", cooldown_s: cooldown };
}

// ── Outcome application ───────────────────────────────────────────────────────

/**
 * Write a successful outcome's deltas back to the target entity.
 *
 * - `fearDelta`  — added directly to `target.condition.fearQ` (positive = more fear).
 * - `moraleDelta` — subtracted from `target.condition.fearQ` (positive morale = less fear).
 * - `setSurrendered` — sets `target.condition.surrendered = true`.
 *
 * No-op if `outcome.result !== "success"`.
 */
export function applyDialogueOutcome(
  outcome: DialogueOutcome,
  target:  Entity,
): void {
  if (outcome.result !== "success") return;

  if (outcome.fearDelta !== undefined) {
    target.condition.fearQ = clampQ(
      target.condition.fearQ! + outcome.fearDelta, 0, SCALE.Q,
    ) as Q;
  }

  if (outcome.moraleDelta !== undefined) {
    target.condition.fearQ = clampQ(
      target.condition.fearQ! - outcome.moraleDelta, 0, SCALE.Q,
    ) as Q;
  }

  if (outcome.setSurrendered) {
    target.condition.surrendered = true;
  }
}

export interface DialogueStateAdapters {
  factionRegistry?: FactionRegistry;
  relationshipGraph?: RelationshipGraph;
  campaign?: CampaignState;
}

export interface DialogueStateReport {
  reputationDelta_Q: Q;
  relationshipEvent?: RelationshipEventType;
  campaignLogEntry?: string;
}

function applyFactionDelta(
  registry: FactionRegistry,
  actorId: number,
  factionId: string | undefined,
  delta_Q: Q,
): void {
  if (!factionId || delta_Q === 0) return;
  let reps = registry.entityReputations.get(actorId);
  if (!reps) {
    reps = new Map<string, Q>();
    registry.entityReputations.set(actorId, reps);
  }
  const current = reps.get(factionId) ?? STANDING_NEUTRAL_Q;
  reps.set(factionId, clampQ((current + delta_Q) as Q, 0, SCALE.Q) as Q);
}

/**
 * Apply dialogue outcome to broader campaign/faction/relationship state.
 * All state holders are optional and explicitly injected by host code.
 */
export function applyDialogueState(
  action: DialogueAction,
  outcome: DialogueOutcome,
  ctx: DialogueContext,
  state: DialogueStateAdapters,
): DialogueStateReport {
  applyDialogueOutcome(outcome, ctx.target);

  let reputationDelta_Q = q(0) as Q;
  let relationshipEvent: RelationshipEventType | undefined;
  let campaignLogEntry: string | undefined;

  if (outcome.result === "success") {
    if (action.kind === "surrender") {
      reputationDelta_Q = q(0.05) as Q;
      relationshipEvent = "saved";
      campaignLogEntry = `Entity ${ctx.target.id} surrendered to entity ${ctx.initiator.id}.`;
    } else if (action.kind === "negotiate") {
      reputationDelta_Q = q(0.04) as Q;
      relationshipEvent = "gift_given";
    } else if (action.kind === "persuade") {
      reputationDelta_Q = q(0.02) as Q;
      relationshipEvent = "bonded";
    } else if (action.kind === "intimidate") {
      reputationDelta_Q = q(-0.03) as Q;
      relationshipEvent = "insult";
    }
  } else if (outcome.result === "failure" || outcome.result === "escalate") {
    if (action.kind === "negotiate" || action.kind === "persuade") {
      relationshipEvent = "insult";
    }
  }

  if (state.factionRegistry) {
    applyFactionDelta(state.factionRegistry, ctx.initiator.id, ctx.target.faction, reputationDelta_Q);
  }

  if (state.relationshipGraph && relationshipEvent) {
    recordRelationshipEvent(state.relationshipGraph, ctx.initiator.id, ctx.target.id, {
      tick: ctx.tick,
      type: relationshipEvent,
      magnitude_Q: outcome.result === "success" ? q(0.20) : q(0.10),
    });
  }

  if (state.campaign && campaignLogEntry) {
    state.campaign.log.push({
      worldTime_s: state.campaign.worldTime_s,
      text: campaignLogEntry,
    });
  }

  return { reputationDelta_Q, relationshipEvent, campaignLogEntry };
}

// ── Narrative ─────────────────────────────────────────────────────────────────

/** Short display label per action kind. */
function actionLabel(action: DialogueAction): string {
  switch (action.kind) {
    case "intimidate": return "Intimidation";
    case "persuade":   return "Persuasion";
    case "deceive":    return "Deception";
    case "surrender":  return "Surrender demand";
    case "negotiate":  return "Negotiation";
    case "signal":     return "Cross-species signal";
  }
}

/** Extended description for verbose mode. */
function verboseDetail(action: DialogueAction, outcome: DialogueOutcome): string {
  const res = outcome.result;
  switch (action.kind) {
    case "intimidate":
      return res === "success"   ? "the target was cowed by the show of force"
           : res === "escalate"  ? "the fearless target took it as an insult and attacked"
           :                       "the target stood firm and was not intimidated";
    case "persuade":
      return res === "success"   ? "the argument was accepted after careful consideration"
           :                       "the target remained unconvinced";
    case "deceive":
      return res === "success"   ? "the false claim was believed"
           :                       "the target detected the deception";
    case "surrender":
      return res === "success"   ? "the target laid down arms"
           :                       "the target refused to surrender";
    case "negotiate":
      return res === "success"   ? "both parties agreed to the exchange"
           :                       "the offer was rejected as unfavourable";
    case "signal":
      return res === "success"   ? `the ${action.targetSpecies} understood the ${action.intent} signal`
           : res === "failure" && outcome.aggravated  ? `the ${action.targetSpecies} was aggravated by the signal`
           :                       `the ${action.targetSpecies} did not comprehend the signal`;
  }
}

/**
 * Produce a human-readable description of a dialogue action and its outcome.
 *
 * Verbosity levels:
 * - `terse`   — single word label + result token  (shortest)
 * - `normal`  — one sentence with action and outcome context
 * - `verbose` — entity names + extended description of what happened
 *
 * @param ids — optional initiator/target entity ids used to resolve names from `cfg.nameMap`
 */
export function narrateDialogue(
  action:  DialogueAction,
  outcome: DialogueOutcome,
  cfg:     NarrativeConfig,
  ids?:    { initiatorId?: number; targetId?: number },
): string {
  const label = actionLabel(action);
  const res   = outcome.result;

  if (cfg.verbosity === "terse") {
    return `${label}: ${res}`;
  }

  const iName = ids?.initiatorId !== undefined
    ? (cfg.nameMap?.get(ids.initiatorId) ?? `entity ${ids.initiatorId}`)
    : "the initiator";
  const tName = ids?.targetId !== undefined
    ? (cfg.nameMap?.get(ids.targetId) ?? `entity ${ids.targetId}`)
    : "the target";

  if (cfg.verbosity === "normal") {
    const resultPhrase = res === "success"  ? "succeeded"
                       : res === "escalate" ? "provoked hostility"
                       :                      "failed";
    return `${iName}'s ${label.toLowerCase()} against ${tName} ${resultPhrase}.`;
  }

  // verbose
  const detail = verboseDetail(action, outcome);
  return `${iName} attempted ${label.toLowerCase()} on ${tName} — ${detail}.`;
}
