/**
 * Phase 70 — Stratified Political Simulation ("Vassal Web" Layer)
 *
 * Introduces a `VassalNode` between the individual Entity and the Polity.
 * Seven loyalty types with distinct step dynamics allow political crises
 * (rebellions, succession disputes, noble defections) to emerge from
 * simulation state rather than scripted events.
 *
 * No kernel import — pure data-management module, fixed-point arithmetic only.
 */

import type { Q }              from "./units.js";
import { SCALE, q, clampQ, mulDiv } from "./units.js";
import type { Polity }         from "./polity.js";
import { eventSeed, hashString } from "./sim/seeds.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * The basis of a vassal's loyalty to their liege.
 *
 * Determines how `stepVassalLoyalty` updates `loyaltyQ` each campaign tick
 * and what events cause loyalty to spike or collapse.
 */
export type LoyaltyType =
  | "ideological"        // committed to the cause; hard to sway, slow to break
  | "transactional"      // follows economic incentives; defects if rivals pay more
  | "terrified"          // held by fear; collapses the moment the liege appears weak
  | "honor_bound"        // oath-bound; resists bribes but breaks on betrayal/grievance
  | "opportunistic"      // backs the likely winner; mirrors the strongest polity's morale
  | "kin_bound"          // family ties; resilient but prone to catastrophic break on kin death
  | "ideological_rival"; // formally loyal but actively undermining the liege

export interface VassalLoyalty {
  type:        LoyaltyType;
  /** Current loyalty level [0, SCALE.Q].  q(0) = open rebellion; q(1) = unconditional. */
  loyaltyQ:    Q;
  /**
   * Accumulated grievances [0, SCALE.Q].
   * Drains loyalty each tick; applied by `applyGrievanceEvent` or set directly by the host.
   */
  grievance_Q: Q;
}

export interface VassalNode {
  /** Unique identifier, e.g. "house_harlow", "guild_weavers". */
  id:          string;
  /** The liege polity this vassal owes service to. */
  polityId:    string;
  /** Fractional share of polity territory controlled [0, SCALE.Q]. */
  territory_Q: Q;
  /**
   * Fractional share of polity military strength contracted from this vassal
   * when loyalty is full [0, SCALE.Q].
   */
  military_Q:  Q;
  /** Vassal's own treasury reserves in cost-units (independent of polity). */
  treasury_cu: number;
  loyalty:     VassalLoyalty;
}

export interface VassalContribution {
  /** Actual troop fraction provided this tick (after loyalty scaling). */
  troops_Q:    Q;
  /** Actual treasury contribution in cost-units this tick (after loyalty scaling). */
  treasury_cu: number;
}

export interface SuccessionResult {
  /** The heir identifier that was evaluated. */
  heirId:        string;
  /** True if the heir secured majority military support; false = contested succession. */
  successful:    boolean;
  /** Weighted military support fraction for the heir [0, SCALE.Q]. */
  supportQ:      Q;
  /**
   * Loyalty delta for each vassal this tick (id → delta Q, can be negative).
   * Supporters of the winning side gain loyalty; supporters of the losing side lose it.
   */
  loyaltyDeltas: Map<string, Q>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Natural grievance decay per tick for most loyalty types. */
export const GRIEVANCE_DECAY_Q          = q(0.010) as Q;
/** Slower natural decay for honor_bound — oaths and grudges linger. */
export const GRIEVANCE_DECAY_HONOR_Q    = q(0.004) as Q;
/** Hard loyalty ceiling for terrified vassals (fear ≠ devotion). */
export const TERRIFIED_MAX_LOYALTY_Q    = q(0.70)  as Q;
/** Loyalty target kin_bound vassals gravitate toward in the absence of grievance. */
export const KIN_BOUND_BASE_Q           = q(0.85)  as Q;
/** Constant loyalty decay per tick for ideological_rival — undermining is ceaseless. */
export const RIVAL_DECAY_Q              = q(0.005) as Q;
/** Below this loyalty Q, contribution drops to zero (passive defiance). */
export const CONTRIBUTION_FLOOR_Q       = q(0.20)  as Q;
/** At or above this loyalty Q, full contribution is provided. */
export const CONTRIBUTION_FULL_Q        = q(0.50)  as Q;
/**
 * Treasury difference (in cost-units) that shifts transactional loyalty by q(0.40).
 * A liege with 50 000 cu more than the richest rival earns maximum loyalty advantage.
 */
export const TRANSACTIONAL_TREASURY_NORM = 50_000;
/** eventSeed salt for succession crisis rolls. */
export const SUCCESSION_SALT = 0x5ECC as number;

// ── Grievance events ──────────────────────────────────────────────────────────

/**
 * Apply a grievance event to a vassal and return the updated node.
 * Typical events: broken promise, tax hike, kin killed in service, territory seized.
 *
 * @param delta_Q  Grievance increment [0, SCALE.Q]; positive = more aggrieved.
 */
export function applyGrievanceEvent(node: VassalNode, delta_Q: Q): VassalNode {
  return {
    ...node,
    loyalty: {
      ...node.loyalty,
      grievance_Q: clampQ(node.loyalty.grievance_Q + delta_Q, 0, SCALE.Q),
    },
  };
}

// ── Loyalty step ──────────────────────────────────────────────────────────────

/**
 * Advance a vassal's loyalty state by one campaign tick.
 *
 * Loyalty dynamics are determined entirely by the vassal's `LoyaltyType`.
 * Returns a new `VassalNode` — the input is never mutated.
 *
 * @param node      Current vassal state.
 * @param liege     The liege polity.
 * @param rivals    All other polities the vassal might consider as alternatives.
 * @param worldSeed Deterministic RNG seed (unused directly — reserved for future variance).
 * @param tick      Current campaign tick.
 */
export function stepVassalLoyalty(
  node:      VassalNode,
  liege:     Polity,
  rivals:    readonly Polity[],
  _worldSeed: number,
  _tick:     number,
): VassalNode {
  const { loyalty } = node;
  const { type, loyaltyQ, grievance_Q } = loyalty;

  // ── Step 1: decay grievance naturally ─────────────────────────────────────
  const decayRate  = type === "honor_bound" ? GRIEVANCE_DECAY_HONOR_Q : GRIEVANCE_DECAY_Q;
  const newGrievance = clampQ(grievance_Q - decayRate, 0, SCALE.Q);

  // ── Step 2: compute loyalty delta by type ─────────────────────────────────
  let deltaNum = 0;

  switch (type) {
    case "ideological": {
      // Slow ideological drift: grievance has minimal effect; passive recovery when content.
      if (newGrievance > q(0.30)) {
        deltaNum = -mulDiv(newGrievance, q(0.08), SCALE.Q);
      } else {
        // Gentle recovery toward conviction
        deltaNum = loyaltyQ < SCALE.Q ? q(0.003) : 0;
      }
      break;
    }

    case "transactional": {
      // Target loyalty tracks how much richer the liege is than the best-paying rival.
      const maxRivalTreasury = rivals.reduce((best, r) => Math.max(best, r.treasury_cu), 0);
      const diff  = Math.max(-TRANSACTIONAL_TREASURY_NORM,
                             Math.min( TRANSACTIONAL_TREASURY_NORM,
                                       liege.treasury_cu - maxRivalTreasury));
      const targetQ = clampQ(
        q(0.50) + Math.round(diff * q(0.40) / TRANSACTIONAL_TREASURY_NORM),
        0, SCALE.Q,
      );
      // Move 5 %/tick toward target; grievance also bleeds loyalty.
      deltaNum  = mulDiv(targetQ - loyaltyQ, q(0.05), SCALE.Q);
      deltaNum -= mulDiv(newGrievance,         q(0.20), SCALE.Q);
      break;
    }

    case "terrified": {
      // Instant collapse if the liege is no stronger than the vassal.
      if (liege.militaryStrength_Q <= node.military_Q) {
        return {
          ...node,
          loyalty: { type, loyaltyQ: q(0.0) as Q, grievance_Q: newGrievance },
        };
      }
      // Slow recovery toward the terrified ceiling; grievance undermines it.
      deltaNum  = mulDiv(TERRIFIED_MAX_LOYALTY_Q - loyaltyQ, q(0.03), SCALE.Q);
      deltaNum -= mulDiv(newGrievance, q(0.25), SCALE.Q);
      break;
    }

    case "honor_bound": {
      // Heavy grievance causes sharp loyalty drain; without it, loyalty recovers.
      if (grievance_Q > q(0.40)) {
        deltaNum = -mulDiv(grievance_Q, q(0.30), SCALE.Q);
      } else {
        deltaNum  = loyaltyQ < q(0.90) ? q(0.008) : 0;
        deltaNum -= mulDiv(newGrievance, q(0.10), SCALE.Q);
      }
      break;
    }

    case "opportunistic": {
      // Target loyalty = liege.moraleQ: stays loyal when the liege is thriving,
      // drifts away when the liege looks weak compared to rivals.
      // Rivals pull target down proportionally if any of them out-morale the liege.
      let maxRivalMorale = 0;
      for (const r of rivals) if (r.moraleQ > maxRivalMorale) maxRivalMorale = r.moraleQ;
      // If a rival outperforms the liege, drag the target below liege.moraleQ.
      const relativeQ  = maxRivalMorale > liege.moraleQ
        ? clampQ(mulDiv(liege.moraleQ, SCALE.Q, maxRivalMorale), 0, SCALE.Q)
        : liege.moraleQ;
      deltaNum  = mulDiv(relativeQ - loyaltyQ, q(0.08), SCALE.Q);
      deltaNum -= mulDiv(newGrievance,          q(0.15), SCALE.Q);
      break;
    }

    case "kin_bound": {
      // Very stable; slow recovery; grievance has half the normal weight.
      deltaNum  = loyaltyQ < KIN_BOUND_BASE_Q ? q(0.01) : 0;
      deltaNum -= mulDiv(newGrievance, q(0.10), SCALE.Q);
      break;
    }

    case "ideological_rival": {
      // Constant, inexorable decay — no incentive can reverse it.
      deltaNum = -RIVAL_DECAY_Q;
      break;
    }
  }

  const rawLoyalty = clampQ(loyaltyQ + deltaNum, 0, SCALE.Q);
  const newLoyalty = type === "terrified"
    ? clampQ(rawLoyalty, 0, TERRIFIED_MAX_LOYALTY_Q)
    : rawLoyalty;

  return {
    ...node,
    loyalty: { type, loyaltyQ: newLoyalty, grievance_Q: newGrievance },
  };
}

// ── Contribution ──────────────────────────────────────────────────────────────

/**
 * Compute the actual troop and treasury contribution a vassal provides this tick.
 *
 * - `loyaltyQ >= CONTRIBUTION_FULL_Q` (q(0.50)): full contracted contribution.
 * - `loyaltyQ <= CONTRIBUTION_FLOOR_Q` (q(0.20)): zero (passive defiance).
 * - Between floor and full: linear interpolation.
 */
export function computeVassalContribution(node: VassalNode): VassalContribution {
  const { loyaltyQ } = node.loyalty;
  const range = CONTRIBUTION_FULL_Q - CONTRIBUTION_FLOOR_Q; // q(0.30)

  let factor: number;
  if (loyaltyQ >= CONTRIBUTION_FULL_Q) {
    factor = SCALE.Q;
  } else if (loyaltyQ <= CONTRIBUTION_FLOOR_Q) {
    factor = 0;
  } else {
    factor = Math.round((loyaltyQ - CONTRIBUTION_FLOOR_Q) * SCALE.Q / range);
  }

  return {
    troops_Q:    mulDiv(node.military_Q, factor, SCALE.Q) as Q,
    treasury_cu: Math.round(node.treasury_cu * factor / SCALE.Q),
  };
}

/**
 * Aggregate the effective military strength a polity can actually field,
 * accounting for disloyal vassals.
 *
 * Pass this value as the force multiplier to `resolveTacticalEngagement` (Phase 69)
 * instead of the polity's nominal `militaryStrength_Q`.
 *
 * ```typescript
 * const effective = computeEffectiveMilitary(vassals);
 * // scale polity's military by effective fraction
 * const scaledForce = mulDiv(polity.militaryStrength_Q, effective, SCALE.Q);
 * ```
 */
export function computeEffectiveMilitary(vassals: readonly VassalNode[]): Q {
  return clampQ(
    vassals.reduce((sum, v) => sum + computeVassalContribution(v).troops_Q, 0),
    0,
    SCALE.Q,
  );
}

// ── Rebellion risk ────────────────────────────────────────────────────────────

/**
 * Compute the rebellion risk for a vassal [0, SCALE.Q].
 *
 * Risk = 70 % from low loyalty + 30 % from high grievance.
 * Use as an AI query or host-side event trigger threshold.
 */
export function detectRebellionRisk(node: VassalNode): Q {
  const { loyaltyQ, grievance_Q } = node.loyalty;
  const loyaltyContrib   = mulDiv(SCALE.Q - loyaltyQ, q(0.70), SCALE.Q);
  const grievanceContrib = mulDiv(grievance_Q,          q(0.30), SCALE.Q);
  return clampQ(loyaltyContrib + grievanceContrib, 0, SCALE.Q);
}

// ── Succession crisis ─────────────────────────────────────────────────────────

/**
 * Resolve a succession crisis: determine whether the intended heir secures
 * enough vassal support to rule unchallenged.
 *
 * Each vassal "votes" based on their loyalty type, current loyalty level,
 * and a deterministic roll from `eventSeed`.  The vote is weighted by
 * `military_Q` so powerful nobles matter more.
 *
 * On success:  supporters gain +q(0.05) loyalty; opponents lose −q(0.08).
 * On failure:  deltas are inverted (the pretender's faction benefits).
 *
 * @param polity    The polity undergoing succession.
 * @param vassals   Current vassal roster.
 * @param heirId    Identifier of the intended heir.
 * @param worldSeed
 * @param tick
 */
export function resolveSuccessionCrisis(
  polity:    Polity,
  vassals:   readonly VassalNode[],
  heirId:    string,
  worldSeed: number,
  tick:      number,
): SuccessionResult {
  const polityHash = hashString(polity.id);
  const heirHash   = hashString(heirId);

  let supportMilitary = 0;
  let totalMilitary   = 0;
  const supportsHeir  = new Map<string, boolean>();

  for (const vassal of vassals) {
    const vassalHash = hashString(vassal.id);
    const seed = eventSeed(worldSeed, tick, vassalHash, heirHash, (polityHash + SUCCESSION_SALT) & 0x7fff);
    const roll = seed % (SCALE.Q + 1); // 0 .. SCALE.Q

    // Support threshold: vassal supports heir if roll < threshold
    let threshold: number;
    switch (vassal.loyalty.type) {
      case "ideological":
        // Ideologically committed to the current regime → likely backs the heir.
        threshold = q(0.70);
        break;
      case "transactional":
        // Support proportional to current loyalty (loyalty ≈ economic satisfaction).
        threshold = vassal.loyalty.loyaltyQ;
        break;
      case "terrified":
        // Terrified vassals back whoever they think will win; proxy: loyalty.
        threshold = vassal.loyalty.loyaltyQ;
        break;
      case "honor_bound":
        // Oath-bound: strong support unless grievance has eroded trust.
        threshold = vassal.loyalty.grievance_Q > q(0.60) ? q(0.25) : q(0.80);
        break;
      case "opportunistic":
        // Genuinely uncertain — 50/50 until the outcome is clear.
        threshold = q(0.50);
        break;
      case "kin_bound":
        // Family ties: strongly backs the heir.
        threshold = clampQ(vassal.loyalty.loyaltyQ + q(0.10), 0, SCALE.Q);
        break;
      case "ideological_rival":
        // Almost never supports the heir — opposition is their purpose.
        threshold = q(0.10);
        break;
    }

    const backs = roll < threshold;
    supportsHeir.set(vassal.id, backs);
    totalMilitary += vassal.military_Q;
    if (backs) supportMilitary += vassal.military_Q;
  }

  const supportQ = totalMilitary > 0
    ? clampQ(Math.round(supportMilitary * SCALE.Q / totalMilitary), 0, SCALE.Q)
    : (q(0.0) as Q);

  const successful = supportQ > q(0.50);

  const loyaltyDeltas = new Map<string, Q>();
  for (const vassal of vassals) {
    const backed = supportsHeir.get(vassal.id) ?? false;
    // Winners gain loyalty; losers lose it (winning/losing is relative to outcome).
    const backedHeir = backed;
    const onWinningSide = successful ? backedHeir : !backedHeir;
    loyaltyDeltas.set(
      vassal.id,
      (onWinningSide ? q(0.05) : -q(0.08)) as Q,
    );
  }

  return { heirId, successful, supportQ, loyaltyDeltas };
}
