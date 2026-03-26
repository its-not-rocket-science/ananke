// src/espionage.ts — Phase 82: Espionage & Intelligence Networks
//
// Covert operations between polities. Each deployed spy runs a specific
// operation that resolves deterministically via eventSeed. Detection
// risk rises with operation severity and falls with agent skill.
//
// Design:
//   - Pure data layer — no Entity fields, no kernel changes.
//   - `EspionageRegistry` tracks deployed agents by entity ID.
//   - `resolveOperation` returns success/detection/effectDelta each time it
//     is called — idempotent for the same (worldSeed, tick) inputs.
//   - Callers apply `effectDelta_Q` to the relevant Phase-79/80 registry.
//   - `stepAgentCover` is called once per simulated day and may flip an
//     "active" agent to "compromised" or "captured".

import { eventSeed, hashString } from "./sim/seeds.js";
import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q } from "./units.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** What the spy is trying to achieve. */
export type OperationType =
  | "intelligence_gather" // reveals target polity stats (host-rendered)
  | "treaty_sabotage"     // weakens a treaty between target and third party
  | "bond_subversion"     // weakens a feudal bond held by target as liege
  | "treasury_theft"      // steals a fraction of target treasury
  | "incite_migration";   // adds push pressure boost to target population

/** Current cover status of the agent in the target polity. */
export type AgentStatus = "active" | "compromised" | "captured";

/**
 * A spy deployed by one polity against another.
 * Stored in `EspionageRegistry`, keyed by `agentId` (entity ID).
 */
export interface SpyAgent {
  /** Entity ID of the spy character. */
  agentId:        number;
  ownerPolityId:  string;
  targetPolityId: string;
  operation:      OperationType;
  status:         AgentStatus;
  /** Simulation tick when the agent was deployed. */
  deployedTick:   number;
  /**
   * Agent skill [0, SCALE.Q].
   * Higher skill → better success rate and lower detection risk.
   */
  skill_Q:        Q;
}

/** Registry of all deployed spy agents. */
export interface EspionageRegistry {
  agents: Map<number, SpyAgent>;
}

/** Outcome of a single operation resolution. */
export interface OperationResult {
  success:      boolean;
  detected:     boolean;
  /**
   * Magnitude of the effect in Q units.
   * For `treasury_theft` this is a fraction of treasury; host scales to cu.
   * For `intelligence_gather` this is always 0 (effect is information).
   */
  effectDelta_Q: Q;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Base success probability per operation at agent skill = SCALE.Q.
 * Actual threshold = `skill_Q × BASE_SUCCESS_Q / SCALE.Q`.
 */
export const OPERATION_BASE_SUCCESS_Q: Record<OperationType, Q> = {
  intelligence_gather: q(0.70),
  treaty_sabotage:     q(0.50),
  bond_subversion:     q(0.45),
  treasury_theft:      q(0.35),
  incite_migration:    q(0.55),
};

/**
 * Detection probability on failure for each operation.
 * High-impact operations (treasury_theft) are riskier.
 */
export const OPERATION_DETECTION_RISK_Q: Record<OperationType, Q> = {
  intelligence_gather: q(0.10),
  incite_migration:    q(0.15),
  treaty_sabotage:     q(0.20),
  bond_subversion:     q(0.25),
  treasury_theft:      q(0.40),
};

/**
 * Maximum effect delta per successful operation, scaled by `skill_Q`.
 * `intelligence_gather` has no Q delta (information is the outcome).
 */
export const OPERATION_EFFECT_Q: Record<OperationType, Q> = {
  intelligence_gather: q(0.00),
  treaty_sabotage:     q(0.10),
  bond_subversion:     q(0.08),
  treasury_theft:      q(0.05),
  incite_migration:    q(0.15),
};

/**
 * Daily base probability that an active agent's cover is blown
 * regardless of operations. Low but non-zero.
 */
export const COVER_DECAY_PER_DAY: Q = q(0.005);

// ── Salt constants (deterministic per operation type) ──────────────────────────

const OP_SALT: Record<OperationType, number> = {
  intelligence_gather: 1001,
  treaty_sabotage:     1002,
  bond_subversion:     1003,
  treasury_theft:      1004,
  incite_migration:    1005,
};

const COVER_CHECK_SALT = 9901;

// ── Factory ───────────────────────────────────────────────────────────────────

export function createEspionageRegistry(): EspionageRegistry {
  return { agents: new Map() };
}

// ── Agent management ───────────────────────────────────────────────────────────

/**
 * Deploy an agent and register them.
 * If an agent with this ID is already registered they are replaced.
 */
export function deployAgent(
  registry:       EspionageRegistry,
  agentId:        number,
  ownerPolityId:  string,
  targetPolityId: string,
  operation:      OperationType,
  skill_Q:        Q,
  tick:           number = 0,
): SpyAgent {
  const agent: SpyAgent = {
    agentId,
    ownerPolityId,
    targetPolityId,
    operation,
    status:       "active",
    deployedTick: tick,
    skill_Q,
  };
  registry.agents.set(agentId, agent);
  return agent;
}

/** Recall (remove) an active agent. Returns `true` if found and removed. */
export function recallAgent(registry: EspionageRegistry, agentId: number): boolean {
  return registry.agents.delete(agentId);
}

/** Return all agents deployed by `ownerPolityId`. */
export function getAgentsByOwner(
  registry:      EspionageRegistry,
  ownerPolityId: string,
): SpyAgent[] {
  return [...registry.agents.values()].filter(a => a.ownerPolityId === ownerPolityId);
}

/** Return all agents currently operating against `targetPolityId`. */
export function getAgentsByTarget(
  registry:       EspionageRegistry,
  targetPolityId: string,
): SpyAgent[] {
  return [...registry.agents.values()].filter(a => a.targetPolityId === targetPolityId);
}

// ── Operation resolution ───────────────────────────────────────────────────────

/**
 * Resolve one tick of an operation. Idempotent for the same (worldSeed, tick).
 *
 * Success check:
 *   successThreshold = skill_Q × BASE_SUCCESS_Q[op] / SCALE.Q
 *   successRoll      = eventSeed(…, opSalt) % SCALE.Q
 *   success          = successRoll < successThreshold
 *
 * Detection check (only on failure):
 *   detectionRoll = eventSeed(…, opSalt+1) % SCALE.Q
 *   detected      = detectionRoll < DETECTION_RISK_Q[op]
 *
 * Does NOT mutate `agent.status` — call `stepAgentCover` for passive detection.
 */
export function resolveOperation(
  agent:     SpyAgent,
  worldSeed: number,
  tick:      number,
): OperationResult {
  if (agent.status !== "active") {
    return { success: false, detected: false, effectDelta_Q: 0 as Q };
  }

  const targetHash    = hashString(agent.targetPolityId);
  const salt          = OP_SALT[agent.operation];

  const successSeed   = eventSeed(worldSeed, tick, agent.agentId, targetHash, salt);
  const successRoll   = successSeed % SCALE.Q;
  const successThresh = mulDiv(agent.skill_Q, OPERATION_BASE_SUCCESS_Q[agent.operation], SCALE.Q);
  const success       = successRoll < successThresh;

  const detectSeed    = eventSeed(worldSeed, tick, agent.agentId, targetHash, salt + 1);
  const detectRoll    = detectSeed % SCALE.Q;
  const detected      = !success && detectRoll < OPERATION_DETECTION_RISK_Q[agent.operation];

  const effectDelta_Q = success
    ? clampQ(mulDiv(agent.skill_Q, OPERATION_EFFECT_Q[agent.operation], SCALE.Q), 0, SCALE.Q)
    : 0 as Q;

  return { success, detected, effectDelta_Q };
}

/**
 * Run a daily cover check for an active agent.
 * If the check fires, the agent transitions to "compromised" or "captured"
 * (50/50 split via a secondary roll).
 * Mutates `agent.status` directly.
 * No-op if agent is already compromised or captured.
 */
export function stepAgentCover(
  agent:     SpyAgent,
  worldSeed: number,
  tick:      number,
): void {
  if (agent.status !== "active") return;

  const targetHash = hashString(agent.targetPolityId);
  // Skill reduces detection: effective risk = COVER_DECAY × (1 - skill / SCALE.Q)
  const skillMitigation = mulDiv(COVER_DECAY_PER_DAY, agent.skill_Q, SCALE.Q);
  const effectiveRisk   = Math.max(0, COVER_DECAY_PER_DAY - skillMitigation);

  const coverSeed  = eventSeed(worldSeed, tick, agent.agentId, targetHash, COVER_CHECK_SALT);
  const coverRoll  = coverSeed % SCALE.Q;

  if (coverRoll < effectiveRisk) {
    const captSeed = eventSeed(worldSeed, tick, agent.agentId, targetHash, COVER_CHECK_SALT + 1);
    agent.status   = (captSeed % 2 === 0) ? "captured" : "compromised";
  }
}

// ── Counterintelligence ────────────────────────────────────────────────────────

/**
 * Compute the counterintelligence strength of a polity based on the number
 * of known (compromised) agents inside its borders.
 * Returns a Q modifier applied by hosts to reduce incoming operation success.
 *
 * `knownAgentCount × COUNTER_INTEL_PER_AGENT`, clamped to [0, SCALE.Q].
 */
export const COUNTER_INTEL_PER_AGENT: Q = q(0.05);

export function computeCounterIntelligence(
  registry:       EspionageRegistry,
  targetPolityId: string,
): Q {
  const known = getAgentsByTarget(registry, targetPolityId)
    .filter(a => a.status === "compromised").length;
  return clampQ(known * COUNTER_INTEL_PER_AGENT, 0, SCALE.Q);
}
