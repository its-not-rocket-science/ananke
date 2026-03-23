/**
 * CE-15 — Dynamic Terrain + Cover System
 *
 * Structural cover segments that reduce incoming damage and deform under explosions.
 * Complements Phase 60 (Environmental Hazard Zones), which handles area-effect
 * environmental damage; this module handles solid cover and line-of-sight blocking.
 *
 * ## Cover model
 * Each `CoverSegment` is an axis-aligned horizontal obstacle (wall/barricade).
 * LOS and protection are computed in 2-D (x/y world plane); `height_Sm` is used
 * for above-cover arc checks (grenade lobs, indirect fire).
 *
 * All coordinates are in SCALE.m units (1 unit = 0.1 mm; 10 000 units = 1 m).
 *
 * ## Deformation model
 * Explosions reduce `height_Sm` and may ignite wood segments.
 * `stepCoverDecay` advances burn-out and crater erosion over real-time seconds.
 *
 * Integration with Phase 60: callers may convert an ignited segment into a
 * `HazardZone` of type "fire" centred on the segment midpoint.
 */

import { q, SCALE, clampQ, mulDiv, type Q } from "../units.js";

// ── Material types ────────────────────────────────────────────────────────────

/** Cover material — determines energy absorption and deformation behaviour. */
export type CoverMaterial = "dirt" | "stone" | "wood" | "sandbag";

/**
 * Energy absorption fraction per material [Q].
 * Applied to incoming projectile / blast energy before it reaches the target.
 */
export const MATERIAL_ABSORPTION: Record<CoverMaterial, Q> = {
  stone:   q(0.70),  // dense masonry — absorbs 70% of incoming energy
  sandbag: q(0.60),  // packed granular — 60%
  dirt:    q(0.50),  // loose earth — 50%
  wood:    q(0.35),  // timber — 35% (burns easily)
};

/**
 * Explosion energy threshold [J] above which wood ignites.
 * A grenade at close range (~30 J) reliably sets wood alight.
 */
export const WOOD_IGNITION_THRESHOLD_J = 30;

/**
 * Height lost per joule of explosion energy at the segment [SCALE.m / J].
 * Calibrated so a 1 000 J blast (artillery shell) craters 1 m of height
 * (10 000 SCALE.m) — i.e. rate = 10 SCALE.m / J.
 */
export const CRATER_RATE_Sm_PER_J = 10;

/**
 * Natural crater erosion rate [SCALE.m / s].
 * Rain and loose earth refill a small crater in hours.
 * At 1 SCALE.m/s a 1 m (10 000 Sm) crater refills in ~10 000 s (~2.8 h).
 */
export const CRATER_EROSION_RATE_Sm_PER_S = 1;

/**
 * Wood burn-out rate [SCALE.m of height consumed per second while burning].
 * A 2 m tall (20 000 Sm) wooden wall burns down in ~200 s (~3 min).
 */
export const WOOD_BURN_RATE_Sm_PER_S = 100;

// ── Core types ────────────────────────────────────────────────────────────────

/**
 * An axis-aligned rectangular cover segment in world-space (2-D top-down view).
 *
 * The segment occupies the line from `(x_Sm, y_Sm)` to `(x_Sm + length_Sm, y_Sm)`.
 * For LOS purposes it is treated as an infinitely thin vertical wall of the given
 * length; `height_Sm` is used only for above-cover arc checks.
 */
export interface CoverSegment {
  id: string;
  /** Left end x-coordinate [SCALE.m]. */
  x_Sm: number;
  /** Left end y-coordinate (constant along the segment) [SCALE.m]. */
  y_Sm: number;
  /** Segment length along the x-axis [SCALE.m]. */
  length_Sm: number;
  /** Current cover height [SCALE.m]. Reduced by explosions. */
  height_Sm: number;
  /** Original (undamaged) height [SCALE.m]. Used as crater refill ceiling. */
  originalHeight_Sm: number;
  material: CoverMaterial;
  /** True when the segment is actively on fire (wood only). */
  burning: boolean;
}

/** Point in the 2-D world plane used for LOS / protection queries. */
export interface WorldPoint2D {
  x_Sm: number;
  y_Sm: number;
}

/** Result of `applyExplosionToTerrain`. */
export interface CoverExplosionResult {
  /** Ids of segments that lost height (craters formed). */
  cratered: string[];
  /** Ids of segments that ignited (wood only). */
  ignited: string[];
}

// ── Construction helpers ──────────────────────────────────────────────────────

/**
 * Create a `CoverSegment` with `originalHeight_Sm` initialised from `height_Sm`.
 */
export function createCoverSegment(
  id: string,
  x_Sm: number,
  y_Sm: number,
  length_Sm: number,
  height_Sm: number,
  material: CoverMaterial,
): CoverSegment {
  return {
    id,
    x_Sm,
    y_Sm,
    length_Sm: Math.max(1, length_Sm),
    height_Sm: Math.max(0, height_Sm),
    originalHeight_Sm: Math.max(0, height_Sm),
    material,
    burning: false,
  };
}

// ── Sample segments ───────────────────────────────────────────────────────────

/** 3 m stone wall (30 000 Sm long, 1.5 m tall). */
export const COVER_STONE_WALL: CoverSegment = createCoverSegment(
  "stone_wall", 0, 50_000, 30_000, 15_000, "stone",
);

/** 2 m sandbag barricade (20 000 Sm long, 1.0 m tall). */
export const COVER_SANDBAG_BARRICADE: CoverSegment = createCoverSegment(
  "sandbag_barricade", 0, 30_000, 20_000, 10_000, "sandbag",
);

/** 4 m wooden palisade (40 000 Sm long, 2.0 m tall). */
export const COVER_WOODEN_PALISADE: CoverSegment = createCoverSegment(
  "wooden_palisade", 0, 20_000, 40_000, 20_000, "wood",
);

/** 5 m dirt berm (50 000 Sm long, 1.2 m tall). */
export const COVER_DIRT_BERM: CoverSegment = createCoverSegment(
  "dirt_berm", 0, 40_000, 50_000, 12_000, "dirt",
);

// ── Geometry helpers (integer arithmetic only) ────────────────────────────────

/** Squared Euclidean distance between two points [SCALE.m²]. */
function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/**
 * Cross product of vectors (AB × AC) — positive = C is left of AB.
 */
function cross2D(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Check whether point (px, py) lies on segment (ax, ay)→(bx, by). */
function onSegment2D(
  ax: number, ay: number, bx: number, by: number,
  px: number, py: number,
): boolean {
  return (
    Math.min(ax, bx) <= px && px <= Math.max(ax, bx) &&
    Math.min(ay, by) <= py && py <= Math.max(ay, by)
  );
}

/**
 * Test whether line segment P1→P2 intersects segment P3→P4.
 * Pure integer arithmetic — no division, no float.
 */
function segmentsIntersect(
  p1x: number, p1y: number, p2x: number, p2y: number,
  p3x: number, p3y: number, p4x: number, p4y: number,
): boolean {
  const d1 = cross2D(p3x, p3y, p4x, p4y, p1x, p1y);
  const d2 = cross2D(p3x, p3y, p4x, p4y, p2x, p2y);
  const d3 = cross2D(p1x, p1y, p2x, p2y, p3x, p3y);
  const d4 = cross2D(p1x, p1y, p2x, p2y, p4x, p4y);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment2D(p3x, p3y, p4x, p4y, p1x, p1y)) return true;
  if (d2 === 0 && onSegment2D(p3x, p3y, p4x, p4y, p2x, p2y)) return true;
  if (d3 === 0 && onSegment2D(p1x, p1y, p2x, p2y, p3x, p3y)) return true;
  if (d4 === 0 && onSegment2D(p1x, p1y, p2x, p2y, p4x, p4y)) return true;

  return false;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Test whether at least one non-destroyed cover segment crosses the LOS
 * line from `from` to `to`.
 *
 * Segments with `height_Sm ≤ 0` are considered destroyed and ignored.
 *
 * Pure integer arithmetic — no `Math.sqrt`.
 *
 * @param from     Attacker position.
 * @param to       Target position.
 * @param segments Cover segments to test.
 * @returns `true` if LOS is blocked by at least one segment.
 */
export function isLineOfSightBlocked(
  from: WorldPoint2D,
  to: WorldPoint2D,
  segments: readonly CoverSegment[],
): boolean {
  for (const seg of segments) {
    if (seg.height_Sm <= 0) continue;
    if (segmentsIntersect(
      from.x_Sm, from.y_Sm, to.x_Sm, to.y_Sm,
      seg.x_Sm, seg.y_Sm, seg.x_Sm + seg.length_Sm, seg.y_Sm,
    )) {
      return true;
    }
  }
  return false;
}

/**
 * Compute the aggregate cover protection factor [Q] for a shot from `attacker`
 * to `target`.
 *
 * For each cover segment that:
 *   1. Intersects the LOS line.
 *   2. Has `height_Sm > 0`.
 *
 * the material absorption fraction is composed multiplicatively:
 *
 *   passthrough = ∏ (1 − absorptionᵢ)
 *   protection  = 1 − passthrough
 *
 * Returns Q ∈ [0, SCALE.Q]:
 *   0        = no cover (clear LOS)
 *   SCALE.Q  = complete protection (unreachable for finite stacked cover)
 */
export function computeCoverProtection(
  attacker: WorldPoint2D,
  target: WorldPoint2D,
  segments: readonly CoverSegment[],
): Q {
  let passthrough = SCALE.Q;  // q(1.0) — all energy passes through initially

  for (const seg of segments) {
    if (seg.height_Sm <= 0) continue;
    if (segmentsIntersect(
      attacker.x_Sm, attacker.y_Sm, target.x_Sm, target.y_Sm,
      seg.x_Sm, seg.y_Sm, seg.x_Sm + seg.length_Sm, seg.y_Sm,
    )) {
      const absorption = MATERIAL_ABSORPTION[seg.material];
      passthrough = mulDiv(passthrough, SCALE.Q - absorption, SCALE.Q);
    }
  }

  return clampQ((SCALE.Q - passthrough) as Q, 0, SCALE.Q);
}

/**
 * Test whether arc fire (lob / indirect trajectory) at `elevation_Sm` clears all
 * cover segments on the LOS from `attacker` to `target`.
 *
 * A segment blocks the arc only if `elevation_Sm < seg.height_Sm`.  Destroyed
 * segments (height ≤ 0) are ignored.
 *
 * @param attacker     Attacker position.
 * @param target       Target position.
 * @param elevation_Sm Arc peak height above ground [SCALE.m].
 * @param segments     Segments to test.
 * @returns `true` if the arc passes over all cover.
 */
export function arcClearsCover(
  attacker: WorldPoint2D,
  target: WorldPoint2D,
  elevation_Sm: number,
  segments: readonly CoverSegment[],
): boolean {
  for (const seg of segments) {
    if (seg.height_Sm <= 0) continue;
    if (segmentsIntersect(
      attacker.x_Sm, attacker.y_Sm, target.x_Sm, target.y_Sm,
      seg.x_Sm, seg.y_Sm, seg.x_Sm + seg.length_Sm, seg.y_Sm,
    )) {
      if (elevation_Sm < seg.height_Sm) return false;
    }
  }
  return true;
}

/**
 * Apply a point-source explosion to nearby cover segments.
 *
 * For each segment whose midpoint falls within `blastRadius_Sm` of `(cx, cy)`:
 * - Height is reduced proportional to proximity and energy.
 * - Wood segments above `WOOD_IGNITION_THRESHOLD_J` (scaled energy) ignite.
 *
 * Proximity scaling uses a squared falloff approximation
 * `proximityQ ≈ 1 − distSq / radiusSq` (integer, no sqrt).
 *
 * Mutates `segments` in-place.
 *
 * @param cx             Blast centre x [SCALE.m].
 * @param cy             Blast centre y [SCALE.m].
 * @param energy_J       Total explosion energy [J].
 * @param blastRadius_Sm Blast radius [SCALE.m].
 * @param segments       Segments to affect (mutated).
 * @returns Summary of craters and ignitions.
 */
export function applyExplosionToTerrain(
  cx: number,
  cy: number,
  energy_J: number,
  blastRadius_Sm: number,
  segments: CoverSegment[],
): CoverExplosionResult {
  const cratered: string[] = [];
  const ignited: string[] = [];
  const radiusSq = blastRadius_Sm * blastRadius_Sm;

  for (const seg of segments) {
    const midX = seg.x_Sm + Math.trunc(seg.length_Sm / 2);
    const midY = seg.y_Sm;
    const dSq = distSq(cx, cy, midX, midY);

    if (dSq > radiusSq) continue;

    // proximityQ: q(1.0) at centre, q(0) at edge — squared distance falloff
    const proximityQ = Math.max(
      0,
      Math.round(SCALE.Q - Math.round((dSq * SCALE.Q) / Math.max(1, radiusSq))),
    );
    const localEnergy_J = Math.round((energy_J * proximityQ) / SCALE.Q);

    if (localEnergy_J <= 0) continue;

    // Crater: reduce height, min 0
    const heightLoss = Math.min(seg.height_Sm, localEnergy_J * CRATER_RATE_Sm_PER_J);
    if (heightLoss > 0) {
      seg.height_Sm = Math.max(0, seg.height_Sm - heightLoss);
      cratered.push(seg.id);
    }

    // Ignition: wood above threshold
    if (seg.material === "wood" && !seg.burning && localEnergy_J >= WOOD_IGNITION_THRESHOLD_J) {
      seg.burning = true;
      ignited.push(seg.id);
    }
  }

  return { cratered, ignited };
}

/**
 * Advance cover decay over `elapsedSeconds`:
 *
 * - **Burning wood**: height decreases at `WOOD_BURN_RATE_Sm_PER_S` per second.
 *   Burning stops when height reaches 0.
 * - **Craters (non-burning)**: height erodes toward `originalHeight_Sm`
 *   at `CRATER_EROSION_RATE_Sm_PER_S` per second.
 *
 * Mutates `segments` in-place.
 *
 * @param segments        Segments to advance.
 * @param elapsedSeconds  Elapsed real time in seconds.
 */
export function stepCoverDecay(segments: CoverSegment[], elapsedSeconds: number): void {
  if (elapsedSeconds <= 0) return;

  for (const seg of segments) {
    if (seg.burning) {
      const burnLoss = Math.round(WOOD_BURN_RATE_Sm_PER_S * elapsedSeconds);
      seg.height_Sm = Math.max(0, seg.height_Sm - burnLoss);
      if (seg.height_Sm === 0) {
        seg.burning = false;  // nothing left to burn
      }
    } else if (seg.height_Sm < seg.originalHeight_Sm) {
      const erosion = Math.round(CRATER_EROSION_RATE_Sm_PER_S * elapsedSeconds);
      seg.height_Sm = Math.min(seg.originalHeight_Sm, seg.height_Sm + erosion);
    }
  }
}

/**
 * Return the 2-D midpoint of a cover segment.
 */
export function coverSegmentCentre(seg: CoverSegment): WorldPoint2D {
  return {
    x_Sm: seg.x_Sm + Math.trunc(seg.length_Sm / 2),
    y_Sm: seg.y_Sm,
  };
}

/**
 * Return `true` if the segment has been completely destroyed (height reduced to 0).
 */
export function isCoverDestroyed(seg: CoverSegment): boolean {
  return seg.height_Sm <= 0;
}
