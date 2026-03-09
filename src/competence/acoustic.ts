// src/competence/acoustic.ts — Phase 39: Musical Intelligence & Acoustic Systems
//
// Musical intelligence governs cognition in the time-acoustic domain:
//   - Recognition of rhythmic patterns and sound cues
//   - Formation signal interpretation (drums, horns)
//   - Acoustic detection and stealth counter-detection
//
// No kernel import — pure resolution module.

import type { Q } from "../units.js";
import { SCALE, q, clampQ, mulDiv } from "../units.js";
import type { Entity } from "../sim/entity.js";
import { makeRng } from "../rng.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Acoustic signature of an entity — how much noise it produces. */
export interface AcousticSignature {
  /** Base noise level in arbitrary units (0 = silent, 100 = very loud). */
  baseNoise: number;
  /** Noise from movement (scales with velocity). */
  movementNoise: number;
  /** Noise from equipment (armour clanking, weapon swinging). */
  equipmentNoise: number;
  /** Total noise level (computed). */
  totalNoise: number;
}

/** Formation signal types for military/organized coordination. */
export type FormationSignal =
  | "advance"
  | "retreat"
  | "hold"
  | "flank_left"
  | "flank_right"
  | "rally";

/** Outcome of a formation signal transmission attempt. */
export interface FormationSignalOutcome {
  /** Clarity of the signal (0–1). */
  clarity_Q: Q;
  /** Whether the signal was successfully received. */
  received: boolean;
  /** Latency in milliseconds before signal is understood. */
  latency_ms: number;
}

/** Detection outcome for acoustic sensing. */
export interface AcousticDetectionOutcome {
  /** Detection confidence (0–1). */
  confidence_Q: Q;
  /** Estimated direction in degrees (0–360, -1 if unknown). */
  estimatedDirection_deg: number;
  /** Estimated distance in metres (-1 if unknown). */
  estimatedDistance_m: number;
  /** Whether detection is certain enough to act on. */
  detected: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Scale factor for acoustic detection formula. */
const SCALE_ACOUSTIC = 100; // multiplier to get useful detection ranges

/** Base detection range in metres at average musical intelligence. */
const BASE_DETECTION_RANGE_m = 50;

/** Maximum effective detection range. */
const MAX_DETECTION_RANGE_m = 500;

/** Range factor: clarity degrades with distance. */
const RANGE_DEGRADATION_PER_METER = 0.002; // 0.2% per metre

/** Threshold for successful signal reception. */
const SIGNAL_RECEPTION_THRESHOLD: Q = q(0.40) as Q;

/** Base latency for signal interpretation in milliseconds. */
const BASE_SIGNAL_LATENCY_MS = 200;

/** Latency reduction from high musical intelligence. */
const MUSICAL_LATENCY_REDUCTION_FACTOR = 0.5; // up to 50% faster

// Noise level constants
const NOISE_SILENT = 0;
const NOISE_VERY_QUIET = 10;
const NOISE_QUIET = 25;
const NOISE_NORMAL = 50;
const NOISE_LOUD = 75;
const NOISE_VERY_LOUD = 100;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Get stealth skill value from entity (0 if not present).
 * Higher stealth = lower noise.
 */
function getStealthValue(entity: Entity): Q {
  // Check for stealth in skills map
  const stealthSkill = entity.skills?.get("stealth");
  if (stealthSkill !== undefined) {
    // Convert SkillLevel to Q (SkillLevel is already a Q-encoded value)
    return (stealthSkill as unknown as number) as Q;
  }
  // Default: average stealth
  return q(0.50) as Q;
}

/**
 * Calculate equipment noise based on armour type.
 */
function calculateEquipmentNoise(entity: Entity): number {
  let noise = NOISE_NORMAL; // base walking noise

  // Process all items in loadout
  for (const item of entity.loadout.items) {
    // Armour adds noise based on material
    if (item.kind === "armour") {
      const armour = item as { material?: string };
      if (armour.material === "metal") {
        noise += 15; // clanking
      } else if (armour.material === "leather") {
        noise += 5; // creaking
      }
      // fabric/cloth is silent
    }

    // Weapons add noise when moved
    if (item.kind === "weapon") {
      const weapon = item as { mass_kg: number };
      if (weapon.mass_kg > 2000) { // heavy weapons
        noise += 10;
      } else if (weapon.mass_kg > 1000) {
        noise += 5;
      }
    }
  }

  return Math.min(NOISE_VERY_LOUD, noise);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Derive the acoustic signature of an entity.
 *
 * Formula:
 *   baseNoise = 50 (normal human movement)
 *   stealth reduces baseNoise: base × (1 − stealth × 0.60)
 *   movementNoise = velocity_mps × 10
 *   equipmentNoise = based on armour material and weapon mass
 *
 * @param entity - The entity to analyze.
 * @returns Acoustic signature with all noise components.
 */
export function deriveAcousticSignature(entity: Entity): AcousticSignature {
  // Base noise level
  let baseNoise = NOISE_NORMAL;

  // Stealth reduces base noise
  const stealth = getStealthValue(entity);
  const stealthReduction = mulDiv(stealth, q(0.60), SCALE.Q) / SCALE.Q;
  baseNoise = Math.round(baseNoise * (1 - stealthReduction));

  // Movement noise from velocity
  const velocity = Math.sqrt(
    entity.velocity_mps.x ** 2 +
    entity.velocity_mps.y ** 2 +
    entity.velocity_mps.z ** 2,
  ) / SCALE.mps; // convert to m/s
  const movementNoise = Math.round(velocity * 10);

  // Equipment noise
  const equipmentNoise = calculateEquipmentNoise(entity);

  // Total noise
  const totalNoise = Math.min(NOISE_VERY_LOUD, baseNoise + movementNoise + equipmentNoise);

  return {
    baseNoise,
    movementNoise,
    equipmentNoise,
    totalNoise,
  };
}

/**
 * Detect an acoustic signature.
 *
 * Formula:
 *   detection_Q = clamp(sourceNoise / dist_m × listener.musical × SCALE_ACOUSTIC, 0, 1)
 *
 * Higher sourceNoise = easier to detect.
 * Higher listener musical intelligence = better detection.
 * Distance degrades detection linearly.
 *
 * @param listener - The entity attempting to detect.
 * @param source - The entity producing sound.
 * @param dist_m - Distance between entities in metres.
 * @returns Detection confidence and metadata.
 */
export function detectAcousticSignature(
  listener: Entity,
  source: Entity,
  dist_m: number,
): AcousticDetectionOutcome {
  const musical: Q = (listener.attributes.cognition?.musical ?? q(0.50)) as Q;

  // Get source noise
  const signature = deriveAcousticSignature(source);
  const sourceNoise = signature.totalNoise;

  // Distance factor: detection degrades with distance
  const distanceFactor = Math.max(0, 1 - dist_m * RANGE_DEGRADATION_PER_METER);

  // Detection formula
  const musicalNorm = musical / SCALE.Q; // 0-1
  const rawDetection = (sourceNoise / 100) * distanceFactor * musicalNorm * SCALE_ACOUSTIC;

  // Clamp to valid Q range
  const confidence_Q = clampQ(
    Math.round(rawDetection * SCALE.Q) as Q,
    q(0),
    SCALE.Q as Q,
  );

  // Detection threshold
  const detected = confidence_Q >= q(0.30);

  // Estimate direction (simplified: assume we can determine direction if confidence is high)
  let estimatedDirection_deg = -1;
  let estimatedDistance_m = -1;

  if (confidence_Q >= q(0.50)) {
    // Can estimate distance with moderate accuracy
    estimatedDistance_m = Math.round(dist_m * (0.8 + Math.random() * 0.4));
  }

  if (confidence_Q >= q(0.70)) {
    // Can determine direction (in a real implementation, would compute from positions)
    estimatedDirection_deg = Math.floor(Math.random() * 360);
  }

  return {
    confidence_Q,
    estimatedDirection_deg,
    estimatedDistance_m,
    detected,
  };
}

/**
 * Resolve a formation signal transmission.
 *
 * Used for military coordination: drums, horns, whistles, shouted commands.
 *
 * Formula:
 *   clarity_Q = musical(signaller) × musical(listener) × rangeFactor(dist_m)
 *   received = clarity_Q >= SIGNAL_RECEPTION_THRESHOLD
 *   latency_ms = BASE_LATENCY_MS × (1 − avgMusical × 0.50)
 *
 * Satyr signaller (0.95) → Elf listeners (0.85) → near-perfect reception at long range.
 * Troll → Troll → commands degrade rapidly beyond a few metres.
 *
 * @param signaller - The entity sending the signal.
 * @param signal - The formation signal type.
 * @param listener - The entity receiving the signal.
 * @param dist_m - Distance between entities in metres.
 * @returns Signal outcome with clarity and reception status.
 */
export function resolveFormationSignal(
  signaller: Entity,
  signal: FormationSignal,
  listener: Entity,
  dist_m: number,
): FormationSignalOutcome {
  const signallerMusical: Q = (signaller.attributes.cognition?.musical ?? q(0.50)) as Q;
  const listenerMusical: Q = (listener.attributes.cognition?.musical ?? q(0.50)) as Q;

  // Range factor degrades with distance
  const rangeFactor = Math.max(0, 1 - dist_m * RANGE_DEGRADATION_PER_METER * 0.5); // slower degradation for intentional signals

  // Musical product (both need musical intelligence for clear transmission)
  const signallerNorm = signallerMusical / SCALE.Q;
  const listenerNorm = listenerMusical / SCALE.Q;
  const musicalProduct = signallerNorm * listenerNorm;

  // Clarity calculation
  const rawClarity = musicalProduct * rangeFactor * SCALE_ACOUSTIC / 100;
  const clarity_Q = clampQ(
    Math.round(rawClarity * SCALE.Q) as Q,
    q(0),
    SCALE.Q as Q,
  );

  // Reception check
  const received = clarity_Q >= SIGNAL_RECEPTION_THRESHOLD;

  // Latency: better musical intelligence = faster interpretation
  const avgMusical = (signallerNorm + listenerNorm) / 2;
  const latencyReduction = avgMusical * MUSICAL_LATENCY_REDUCTION_FACTOR;
  const latency_ms = Math.round(BASE_SIGNAL_LATENCY_MS * (1 - latencyReduction));

  return {
    clarity_Q,
    received,
    latency_ms,
  };
}

/**
 * Check if an entity can effectively use formation signals.
 * Requires minimum musical intelligence to produce clear signals.
 *
 * @param entity - The potential signaller.
 * @param minMusical - Minimum musical intelligence required (default q(0.40)).
 * @returns True if entity can serve as a signaller.
 */
export function canUseFormationSignals(
  entity: Entity,
  minMusical: Q = q(0.40),
): boolean {
  const musical: Q = (entity.attributes.cognition?.musical ?? q(0.50)) as Q;
  return musical >= minMusical;
}

/**
 * Calculate maximum effective signal range for a signaller.
 *
 * @param signaller - The entity sending signals.
 * @param minClarity - Minimum clarity required for reception (default q(0.40)).
 * @returns Maximum range in metres.
 */
export function calculateSignalRange(
  signaller: Entity,
  minClarity: Q = q(0.40),
): number {
  const signallerMusical: Q = (signaller.attributes.cognition?.musical ?? q(0.50)) as Q;
  const musicalNorm = signallerMusical / SCALE.Q;

  // clarity = musicalProduct * rangeFactor * SCALE_ACOUSTIC / SCALE.Q
  // At distance 0, rangeFactor = 1, so maxClarity = musicalProduct * SCALE_ACOUSTIC / SCALE.Q
  // Assuming average listener (musical = 0.50)
  const listenerNorm = 0.50;
  const musicalProduct = musicalNorm * listenerNorm;

  // Max possible clarity at point-blank
  const maxClarity = musicalProduct * SCALE_ACOUSTIC; // This gives 0-100 range
  const minClarityNorm = minClarity / SCALE.Q; // Convert Q to 0-1

  if (maxClarity < minClarityNorm * 100) {
    return 0; // Cannot reach minimum clarity even at point-blank
  }

  // minClarityNorm = musicalProduct * (1 - dist * degradation * 0.5) * SCALE_ACOUSTIC / SCALE.Q
  // Solve for dist where clarity = minClarity
  const requiredRatio = (minClarityNorm * 100) / (musicalProduct * SCALE_ACOUSTIC);
  const maxDist = (1 - requiredRatio) / (RANGE_DEGRADATION_PER_METER * 0.5);
  return Math.min(MAX_DETECTION_RANGE_m, Math.round(maxDist));
}
