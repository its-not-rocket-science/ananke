// src/succession.ts — Phase 77: Dynasty & Succession
//
// Resolves inheritance of political leadership when a ruler dies.
// Integrates Phase 76 (Kinship) for candidate discovery and Phase 75 (Renown)
// for claim-strength weighting. No kernel changes; no new Entity fields.
//
// Succession rules:
//   primogeniture  — first-born child (lowest entityId as proxy for birth order)
//   renown_based   — candidate with highest `claimStrength_Q` (renown + inherited)
//   election       — renown-weighted deterministic selection via eventSeed
//
// Stability impact:
//   Direct heir (degree 1) → ±0 base impact
//   Distant heir (degree 2+) → stability penalty per extra degree
//   No heir found → large stability hit
//   Contested succession (top-2 candidates within q(0.10)) → additional penalty

import type { LineageRegistry } from "./kinship.js";
import type { RenownRegistry }  from "./renown.js";
import type { Polity }          from "./polity.js";
import {
  computeInheritedRenown,
  MAX_KINSHIP_DEPTH,
} from "./kinship.js";
import { getRenownRecord } from "./renown.js";
import { eventSeed }       from "./sim/seeds.js";
import { q, SCALE, clampQ, mulDiv } from "./units.js";
import type { Q } from "./units.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** How the succession contest is resolved. */
export type SuccessionRuleType =
  | "primogeniture"   // Eldest child (lowest entityId) inherits
  | "renown_based"    // Highest claimStrength_Q inherits
  | "election";       // Renown-weighted deterministic selection

export interface SuccessionRule {
  type:        SuccessionRuleType;
  /**
   * Maximum kinship degree to search for candidates (default `MAX_KINSHIP_DEPTH`).
   * Closer kin are always preferred at equal claim strength.
   */
  maxDegree?:  number;
}

/**
 * A single candidate in a succession contest.
 */
export interface SuccessionCandidate {
  entityId:          number;
  /** Degree of kinship to the deceased (1 = child/parent, 2 = grandchild, etc.). */
  kinshipDegree:     number;
  /** Candidate's own renown from Phase 75. */
  renown_Q:          Q;
  /**
   * Ancestor-inherited renown bonus from Phase 76.
   * Provides legitimacy even for candidates who have not yet distinguished themselves.
   */
  inheritedRenown_Q: Q;
  /**
   * Final composite claim strength [0, SCALE.Q].
   * For primogeniture: 0 for all except first-born (which gets SCALE.Q).
   * For renown_based / election: weighted combination of renown + inherited.
   */
  claimStrength_Q:   Q;
}

/**
 * Outcome of a succession resolution.
 */
export interface SuccessionResult {
  /** Winning heir, or `null` if no eligible candidates were found. */
  heirId:           number | null;
  /** All candidates evaluated, sorted by claimStrength_Q descending. */
  candidates:       SuccessionCandidate[];
  rule:             SuccessionRuleType;
  /**
   * Signed stability delta [−SCALE.Q, +SCALE.Q].
   * Negative = destabilising (distant heir, no heir, contested succession).
   * Positive = stabilising (clear close-kin heir).
   */
  stabilityImpact_Q: Q;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Weight of own renown vs. inherited renown when computing claim strength. */
export const CLAIM_OWN_RENOWN_WEIGHT_Q:       Q = q(0.70);
export const CLAIM_INHERITED_RENOWN_WEIGHT_Q: Q = q(0.30);

/** Stability penalty per extra degree of kinship beyond 1 (direct child/parent). */
export const STABILITY_DISTANT_HEIR_Q: Q = q(0.05);

/** Stability penalty when no heir is found. */
export const STABILITY_NO_HEIR_Q: Q = q(0.20);

/** Additional penalty when the top two candidates are within this band. */
export const CONTESTED_THRESHOLD_Q: Q = q(0.10);
export const STABILITY_CONTESTED_Q: Q = q(0.05);

/** Stability bonus when a direct child inherits with no contest. */
export const STABILITY_CLEAN_SUCCESSION_Q: Q = q(0.03);

// ── Candidate discovery ───────────────────────────────────────────────────────

/**
 * Find all kin of `deceasedId` up to `maxDegree` and compute their claim strength.
 * Candidates are sorted by claimStrength_Q descending, then kinshipDegree ascending.
 */
export function findSuccessionCandidates(
  lineage:         LineageRegistry,
  deceasedId:      number,
  renownRegistry:  RenownRegistry,
  maxDegree:       number = MAX_KINSHIP_DEPTH,
): SuccessionCandidate[] {
  // BFS over the family graph to collect all kin within maxDegree
  const visited = new Set<number>([deceasedId]);
  const queue: Array<{ id: number; degree: number }> = [];

  // Seed with immediate family
  const deceasedNode = lineage.nodes.get(deceasedId);
  if (!deceasedNode) return [];

  const seeds = [
    ...deceasedNode.childIds,
    ...deceasedNode.parentIds,
    ...deceasedNode.partnerIds,
  ];
  for (const id of seeds) {
    if (!visited.has(id)) {
      visited.add(id);
      queue.push({ id, degree: 1 });
    }
  }

  const candidates: SuccessionCandidate[] = [];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.degree > maxDegree) continue;

    // Compute claim
    const record           = getRenownRecord(renownRegistry, item.id);
    const renown_Q         = record.renown_Q;
    const inheritedRenown  = computeInheritedRenown(lineage, item.id, renownRegistry, 3);

    candidates.push({
      entityId:          item.id,
      kinshipDegree:     item.degree,
      renown_Q,
      inheritedRenown_Q: inheritedRenown,
      claimStrength_Q:   0 as Q, // filled in per-rule below
    });

    // Expand neighbours
    const node = lineage.nodes.get(item.id);
    if (!node) continue;
    for (const nbr of [...node.childIds, ...node.parentIds, ...node.partnerIds]) {
      if (!visited.has(nbr)) {
        visited.add(nbr);
        queue.push({ id: nbr, degree: item.degree + 1 });
      }
    }
  }

  return candidates;
}

// ── Claim strength computation ─────────────────────────────────────────────────

/** Compute `claimStrength_Q` for a candidate under the given rule. */
function computeClaimStrength(
  candidate: SuccessionCandidate,
  rule:      SuccessionRuleType,
  firstBornId: number | null,
): Q {
  switch (rule) {
    case "primogeniture":
      // First-born (lowest entityId among children at degree 1) gets full claim;
      // all others get proportionally less based on distance
      if (candidate.entityId === firstBornId) return SCALE.Q as Q;
      // Other children score by closeness only
      return clampQ(SCALE.Q - candidate.kinshipDegree * STABILITY_DISTANT_HEIR_Q, 0, SCALE.Q);

    case "renown_based":
    case "election": {
      // Weighted combination of own renown and inherited renown
      const ownPart = mulDiv(candidate.renown_Q, CLAIM_OWN_RENOWN_WEIGHT_Q, SCALE.Q);
      const inhPart = mulDiv(candidate.inheritedRenown_Q, CLAIM_INHERITED_RENOWN_WEIGHT_Q, SCALE.Q);
      return clampQ(ownPart + inhPart, 0, SCALE.Q);
    }
  }
}

// ── Succession resolution ─────────────────────────────────────────────────────

/**
 * Resolve succession after `deceasedId` dies.
 *
 * @param lineage         Kinship registry (Phase 76).
 * @param deceasedId      The entity whose position must be inherited.
 * @param renownRegistry  Renown registry (Phase 75).
 * @param rule            Succession rule to apply.
 * @param worldSeed       For deterministic election roll.
 * @param tick            Current simulation tick.
 */
export function resolveSuccession(
  lineage:         LineageRegistry,
  deceasedId:      number,
  renownRegistry:  RenownRegistry,
  rule:            SuccessionRule,
  worldSeed:       number,
  tick:            number,
): SuccessionResult {
  const maxDegree  = rule.maxDegree ?? MAX_KINSHIP_DEPTH;
  const ruleType   = rule.type;

  // Find candidates
  const raw = findSuccessionCandidates(lineage, deceasedId, renownRegistry, maxDegree);
  if (raw.length === 0) {
    return {
      heirId:            null,
      candidates:        [],
      rule:              ruleType,
      stabilityImpact_Q: -STABILITY_NO_HEIR_Q as Q,
    };
  }

  // Identify first-born (lowest entityId among direct children)
  const directChildren = raw.filter(c => c.kinshipDegree === 1 &&
    lineage.nodes.get(deceasedId)?.childIds.includes(c.entityId));
  const firstBornId = directChildren.length > 0
    ? Math.min(...directChildren.map(c => c.entityId))
    : null;

  // Fill claim strength
  for (const c of raw) {
    c.claimStrength_Q = computeClaimStrength(c, ruleType, firstBornId);
  }

  // Sort: claim strength desc, then kinshipDegree asc (closer kin breaks ties)
  raw.sort((a, b) =>
    b.claimStrength_Q - a.claimStrength_Q || a.kinshipDegree - b.kinshipDegree,
  );

  // Select heir
  let heirId: number;

  if (ruleType === "election" && raw.length > 1) {
    // Renown-weighted lottery: for each candidate, roll eventSeed and weight by claimStrength
    const totalClaim = raw.reduce((s, c) => s + c.claimStrength_Q, 0);
    const roll = eventSeed(worldSeed, tick, deceasedId, 0, 77) % Math.max(totalClaim, 1);
    let cumulative = 0;
    let elected = raw[0]!.entityId;
    for (const c of raw) {
      cumulative += c.claimStrength_Q;
      if (roll < cumulative) { elected = c.entityId; break; }
    }
    heirId = elected;
  } else {
    heirId = raw[0]!.entityId;
  }

  const winner = raw.find(c => c.entityId === heirId)!;

  // Compute stability impact
  let stability = 0;

  // Bonus for clean direct succession
  if (winner.kinshipDegree === 1 && raw.length === 1) {
    stability += STABILITY_CLEAN_SUCCESSION_Q;
  }

  // Penalty for distant heir
  if (winner.kinshipDegree > 1) {
    stability -= (winner.kinshipDegree - 1) * STABILITY_DISTANT_HEIR_Q;
  }

  // Penalty for contested succession
  if (raw.length >= 2) {
    const gap = raw[0]!.claimStrength_Q - raw[1]!.claimStrength_Q;
    if (gap < CONTESTED_THRESHOLD_Q) {
      stability -= STABILITY_CONTESTED_Q;
    }
  }

  return {
    heirId,
    candidates:        raw,
    rule:              ruleType,
    stabilityImpact_Q: clampQ(stability, -SCALE.Q, SCALE.Q) as Q,
  };
}

// ── Polity integration ────────────────────────────────────────────────────────

/**
 * Apply a succession result to a polity.
 * Adjusts `stabilityQ` by `result.stabilityImpact_Q`.
 * Does NOT change the ruler field (Polity has no rulerId); callers update faction
 * leadership separately if needed.
 */
export function applySuccessionToPolity(
  polity: Polity,
  result: SuccessionResult,
): void {
  polity.stabilityQ = clampQ(
    polity.stabilityQ + result.stabilityImpact_Q,
    0,
    SCALE.Q,
  );
}
