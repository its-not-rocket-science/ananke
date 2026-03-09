// src/competence/crafting.ts — Phase 34: Bodily-Kinesthetic Non-Combat Applications
//
// Crafting quality model:
//   quality_Q  = materialQ × bodilyKinesthetic × skillBonus × toolBonus  (± RNG variance)
//   timeTaken_s = baseTime_s × q(0.50) / bodilyKinesthetic
//     (baseTime_s is defined for a BK q(0.50) entity as the reference)
//
// No kernel import — pure resolution module.

import type { Q }                  from "../units.js";
import { SCALE, q, clampQ, qMul, mulDiv } from "../units.js";
import type { Entity }             from "../sim/entity.js";
import { makeRng }                 from "../rng.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CraftingSpec {
  outputId:       string;
  toolCategory?:  "bladed" | "blunt" | "needlework" | "forge" | "precision";
  /** Base seconds for a bodilyKinesthetic q(0.50) entity. */
  baseTime_s:     number;
  /** Raw material quality 0–1 (Q-encoded). */
  materialQ:      Q;
  /** Minimum bodilyKinesthetic required to attempt; below → success=false. */
  minBKQ:         Q;
}

export interface CraftingOutcome {
  quality_Q:   Q;
  timeTaken_s: number;
  success:     boolean;
  descriptor:  "masterwork" | "fine" | "adequate" | "poor" | "ruined";
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TOOL_BONUS: Record<NonNullable<CraftingSpec["toolCategory"]>, Q> = {
  precision:  q(1.20) as Q,
  bladed:     q(1.10) as Q,
  forge:      q(1.10) as Q,
  needlework: q(1.05) as Q,
  blunt:      q(1.05) as Q,
};

/** Half-width of RNG quality variance band. */
const VARIANCE_HALF: Q = q(0.10) as Q;

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDescriptor(quality_Q: Q): CraftingOutcome["descriptor"] {
  if (quality_Q >= q(0.85)) return "masterwork";
  if (quality_Q >= q(0.65)) return "fine";
  if (quality_Q >= q(0.40)) return "adequate";
  if (quality_Q >= q(0.20)) return "poor";
  return "ruined";
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve a crafting attempt.
 *
 * @param entity  - The crafter; uses `cognition.bodilyKinesthetic` and `control.fineControl`.
 * @param spec    - Crafting specification.
 * @param seed    - Deterministic seed (e.g. from eventSeed()).
 */
export function resolveCrafting(
  entity: Entity,
  spec:   CraftingSpec,
  seed:   number,
): CraftingOutcome {
  const bkQ: Q = (entity.attributes.cognition?.bodilyKinesthetic ?? q(0.50)) as Q;

  // Minimum BK gate: not skilled enough to attempt this work
  if (bkQ < spec.minBKQ) {
    return {
      quality_Q:   q(0) as Q,
      timeTaken_s: spec.baseTime_s,
      success:     false,
      descriptor:  "ruined",
    };
  }

  // Tool bonus
  const toolBonus: Q = spec.toolCategory ? TOOL_BONUS[spec.toolCategory] : q(1.0) as Q;

  // Skill bonus from fineControl: lerp(q(0.80), q(1.20), fineControl)
  //   fineControl q(0.0)  → skillBonus q(0.80)  (no precision in hands)
  //   fineControl q(0.50) → skillBonus q(1.00)  (neutral)
  //   fineControl q(1.0)  → skillBonus q(1.20)  (exceptional fine motor control)
  const fc = entity.attributes.control.fineControl;
  const skillBonus: Q = clampQ(
    (q(0.80) + mulDiv(q(0.40), fc, SCALE.Q)) as Q,
    q(0.80), q(1.20),
  );

  // Expected quality = materialQ × bkQ × skillBonus × toolBonus (all Q-scaled)
  const expected: Q = qMul(qMul(spec.materialQ, bkQ), qMul(skillBonus, toolBonus));

  // RNG variance ±VARIANCE_HALF (roll in [0, SCALE.Q-1], centered at SCALE.Q/2)
  const rng = makeRng(seed, SCALE.Q);
  const roll  = rng.q01();
  const variance = mulDiv(roll - SCALE.Q / 2, 2 * VARIANCE_HALF, SCALE.Q);
  const quality_Q: Q = clampQ((expected + variance) as Q, q(0), q(1.0));

  // Time: baseTime_s is the reference at BK q(0.50); scales inversely with BK
  const timeTaken_s = Math.round(spec.baseTime_s * q(0.50) / bkQ);

  const success = quality_Q >= q(0.20);
  return {
    quality_Q,
    timeTaken_s,
    success,
    descriptor: success ? toDescriptor(quality_Q) : "ruined",
  };
}

/**
 * Phase 34: compute surgical precision multiplier from surgeon's bodilyKinesthetic.
 * Result: lerp(q(0.70), q(1.30), bk)
 *   - Assign to `TreatmentSchedule.surgicalPrecisionMul` in downtime config.
 *   - BK q(0.00) → q(0.70)  (clumsy; slower/worse surgery)
 *   - BK q(0.50) → q(1.00)  (normal)
 *   - BK q(1.00) → q(1.30)  (expert; faster/better surgery)
 */
export function computeSurgicalPrecision(entity: Entity): Q {
  const bkQ: Q = (entity.attributes.cognition?.bodilyKinesthetic ?? q(0.50)) as Q;
  return clampQ(
    (q(0.70) + mulDiv(q(0.60), bkQ, SCALE.Q)) as Q,
    q(0.70), q(1.30),
  );
}
