// src/sim/explosion.ts — Phase 10: blast and fragmentation physics

import type { I32, Q } from "../units.js";
import { SCALE, q, mulDiv } from "../units.js";

/**
 * Point-source explosion specification.
 *
 * `fragmentCount` is the expected number of fragment hits on an average
 * body-sized target at the blast epicentre (dist = 0).  At distance d it
 * scales quadratically with the same falloff as blast energy.  Set it to
 * reflect how many fragments realistically hit a human-sized target up close,
 * not the total count of fragments ejected (which would be spread over a sphere).
 */
export interface BlastSpec {
  /** Peak blast energy at epicentre (J; SCALE.J = 1 so this is SI joules directly). */
  blastEnergy_J: number;
  /** Effective blast radius (SCALE.m fixed-point). */
  radius_m: I32;
  /** Expected fragment hits on a body-sized target at the epicentre (dist = 0). */
  fragmentCount: number;
  /** Mass of each fragment (SCALE.kg fixed-point; e.g. to.kg(0.005) = 5 for 5 g). */
  fragmentMass_kg: I32;
  /** Fragment ejection speed (m/s raw integer; e.g. 300 for a typical grenade). */
  fragmentVelocity_mps: number;
}

/**
 * Blast energy fraction (Q) delivered to a target at squared fixed-point
 * distance `distSq_m2` from the epicentre.
 * Quadratic falloff: frac = max(0, 1 − dist²/radius²).
 * Returns 0 when distSq_m2 ≥ radius_m².
 */
export function blastEnergyFracQ(spec: BlastSpec, distSq_m2: number): Q {
  const radiusSq = spec.radius_m * spec.radius_m;
  if (distSq_m2 >= radiusSq) return q(0);
  return mulDiv(radiusSq - distSq_m2, SCALE.Q, radiusSq) as Q;
}

/**
 * Expected number of fragment hits on a target at squared distance `distSq_m2`.
 * May be fractional; caller should round stochastically with a seed roll for
 * the fractional part.
 */
export function fragmentsExpected(spec: BlastSpec, distSq_m2: number): number {
  const fracQ = blastEnergyFracQ(spec, distSq_m2);
  if (fracQ <= 0) return 0;
  return spec.fragmentCount * fracQ / SCALE.Q;
}

/**
 * Kinetic energy (J) of a single fragment at squared distance `distSq_m2`.
 * KE = 0.5 × mass × velocity²; attenuated by the quadratic falloff.
 */
export function fragmentKineticEnergy(spec: BlastSpec, distSq_m2: number): number {
  const fracQ = blastEnergyFracQ(spec, distSq_m2);
  if (fracQ <= 0) return 0;
  // KE_base = mass_kg_real × vel² / 2
  // = (fragmentMass_kg / SCALE.kg) × fragmentVelocity_mps² / 2
  // = fragmentMass_kg × velocity² / (2 × SCALE.kg)
  const keBase = Math.trunc(
    (spec.fragmentMass_kg * spec.fragmentVelocity_mps * spec.fragmentVelocity_mps) /
    (2 * SCALE.kg),
  );
  return mulDiv(keBase, fracQ, SCALE.Q);
}
