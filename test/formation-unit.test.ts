import { describe, it, expect } from "vitest";
import { SCALE, q } from "../src/units.js";
import {
  computeShieldWallCoverage,
  deriveRankSplit,
  stepFormationCasualtyFill,
  computeFormationMomentum,
  deriveFormationCohesion,
  deriveFormationAllyFearDecay,
  SHIELD_SHARING_FRAC,
  SHIELD_WALL_MAX_COVERAGE,
  RANK_DEPTH_DEFAULT_m,
  FORMATION_INTACT_THRESHOLD,
  FORMATION_MORALE_BONUS,
  FORMATION_MORALE_PENALTY,
  FORMATION_ALLY_FEAR_DECAY,
  FORMATION_ALLY_DECAY_CAP,
  type FormationCohesionState,
  type RankSplit,
} from "../src/sim/formation-unit.js";

// ─── Constants ────────────────────────────────────────────────────────────────

describe("Formation constants", () => {
  it("SHIELD_SHARING_FRAC = q(0.60)", () => {
    expect(SHIELD_SHARING_FRAC).toBe(q(0.60));
  });

  it("SHIELD_WALL_MAX_COVERAGE = SCALE.Q (= 1.0)", () => {
    expect(SHIELD_WALL_MAX_COVERAGE).toBe(SCALE.Q);
  });

  it("RANK_DEPTH_DEFAULT_m = 2 m in SCALE.m units", () => {
    expect(RANK_DEPTH_DEFAULT_m).toBe(Math.round(2.0 * SCALE.m));
  });

  it("FORMATION_INTACT_THRESHOLD = q(0.60)", () => {
    expect(FORMATION_INTACT_THRESHOLD).toBe(q(0.60));
  });

  it("FORMATION_MORALE_BONUS = q(0.008)", () => {
    expect(FORMATION_MORALE_BONUS).toBe(q(0.008));
  });

  it("FORMATION_MORALE_PENALTY = q(0.010)", () => {
    expect(FORMATION_MORALE_PENALTY).toBe(q(0.010));
  });

  it("FORMATION_ALLY_FEAR_DECAY = q(0.004)", () => {
    expect(FORMATION_ALLY_FEAR_DECAY).toBe(q(0.004));
  });

  it("FORMATION_ALLY_DECAY_CAP = 8", () => {
    expect(FORMATION_ALLY_DECAY_CAP).toBe(8);
  });
});

// ─── computeShieldWallCoverage ────────────────────────────────────────────────

describe("computeShieldWallCoverage", () => {
  it("returns q(0) for empty array", () => {
    expect(computeShieldWallCoverage([])).toBe(q(0));
  });

  it("single bearer contributes at full strength", () => {
    const cov = q(0.50);
    expect(computeShieldWallCoverage([cov])).toBe(cov);
  });

  it("second bearer contributes at SHIELD_SHARING_FRAC efficiency", () => {
    // highest = q(0.50), second = q(0.40)
    // expected = q(0.50) + q(0.40)*q(0.60)/SCALE.Q
    const first = q(0.50);
    const second = q(0.40);
    const expectedRaw = first + Math.round((second * SHIELD_SHARING_FRAC) / SCALE.Q);
    const result = computeShieldWallCoverage([first, second]);
    expect(result).toBe(expectedRaw);
  });

  it("sorts inputs descending so highest bearer always leads", () => {
    const lo = q(0.30);
    const hi = q(0.70);
    const ascending = computeShieldWallCoverage([lo, hi]);
    const descending = computeShieldWallCoverage([hi, lo]);
    expect(ascending).toBe(descending);
  });

  it("result is capped at SHIELD_WALL_MAX_COVERAGE even for many high-coverage bearers", () => {
    const coverages = Array<ReturnType<typeof q>>(10).fill(q(0.90));
    expect(computeShieldWallCoverage(coverages)).toBe(SHIELD_WALL_MAX_COVERAGE);
  });

  it("three bearers: each additional one still improves total (below cap)", () => {
    const two = computeShieldWallCoverage([q(0.30), q(0.30)]);
    const three = computeShieldWallCoverage([q(0.30), q(0.30), q(0.30)]);
    expect(three).toBeGreaterThan(two);
  });

  it("result is a non-negative integer", () => {
    const result = computeShieldWallCoverage([q(0.45), q(0.35)]);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

// ─── deriveRankSplit ───────────────────────────────────────────────────────────

describe("deriveRankSplit", () => {
  // Facing north (+y direction) — facingDirQ = { x:0, y:SCALE.Q }
  const northFacing = { x: 0, y: SCALE.Q };

  it("returns empty front and rear for empty entity list", () => {
    const result = deriveRankSplit([], new Map(), northFacing);
    expect(result).toEqual({ frontRank: [], rearRank: [] });
  });

  it("single entity lands in front rank", () => {
    const positions = new Map([[1, { x: 0, y: 1000 }]]);
    const result = deriveRankSplit([1], positions, northFacing);
    expect(result.frontRank).toContain(1);
    expect(result.rearRank).toHaveLength(0);
  });

  it("entities within rankDepth of frontmost go to front rank", () => {
    // north facing: higher y = more forward
    // SCALE.m = 10000 so 1m = 10000 units
    // id=1 at y=30000 (3m), id=2 at y=20000 (2m) — 1m gap, within 2m default depth
    const positions = new Map([
      [1, { x: 0, y: 30000 }],
      [2, { x: 0, y: 20000 }],
    ]);
    const result = deriveRankSplit([1, 2], positions, northFacing);
    expect(result.frontRank).toContain(1);
    expect(result.frontRank).toContain(2);
    expect(result.rearRank).toHaveLength(0);
  });

  it("entity beyond rankDepth goes to rear rank", () => {
    // id=1 at y=50000 (5m frontmost), id=2 at y=5000 (0.5m) — 4.5m gap > 2m default depth
    const positions = new Map([
      [1, { x: 0, y: 50000 }],
      [2, { x: 0, y: 5000  }],
    ]);
    const result = deriveRankSplit([1, 2], positions, northFacing);
    expect(result.frontRank).toContain(1);
    expect(result.rearRank).toContain(2);
  });

  it("front rank is sorted front-to-back (highest projection first)", () => {
    // All within 2m of frontmost (y=15000=1.5m), so all in front rank
    const positions = new Map([
      [1, { x: 0, y: 10000 }],
      [2, { x: 0, y: 15000 }],
      [3, { x: 0, y:  8000 }],
    ]);
    const result = deriveRankSplit([1, 2, 3], positions, northFacing);
    expect(result.frontRank[0]).toBe(2); // highest y first
    expect(result.frontRank[1]).toBe(1);
    expect(result.frontRank[2]).toBe(3);
  });

  it("entity with no position entry is assigned projection 0", () => {
    // id=1 at y=50000 (5m), id=99 missing → proj=0 → gap 5m > 2m → rear rank
    const positions = new Map([[1, { x: 0, y: 50000 }]]);
    const result = deriveRankSplit([1, 99], positions, northFacing);
    expect(result.frontRank).toContain(1);
    expect(result.rearRank).toContain(99);
  });

  it("respects a custom rankDepth_m parameter", () => {
    // id=1 at y=40000 (4m), id=2 at y=30000 (3m) — exactly 1m gap
    const positions = new Map([
      [1, { x: 0, y: 40000 }],
      [2, { x: 0, y: 30000 }],
    ]);
    const oneMeter = SCALE.m; // 10000 — id=2: 30000 >= 40000-10000=30000 → frontRank
    const result1m = deriveRankSplit([1, 2], positions, northFacing, oneMeter);
    expect(result1m.frontRank).toContain(2);

    const fourTenths = Math.round(0.4 * SCALE.m); // 4000 — id=2: 30000 >= 36000 → false → rearRank
    const resultHalf = deriveRankSplit([1, 2], positions, northFacing, fourTenths);
    expect(resultHalf.rearRank).toContain(2);
  });

  it("works with east-facing direction", () => {
    // facing east (+x): higher x = more forward
    const eastFacing = { x: SCALE.Q, y: 0 };
    const positions = new Map([
      [1, { x: 50000, y: 0 }],  // frontmost (5m)
      [2, { x: 40000, y: 0 }],  // 1m behind — within 2m default depth
      [3, { x:  1000, y: 0 }],  // 4.9m behind — beyond depth
    ]);
    const result = deriveRankSplit([1, 2, 3], positions, eastFacing);
    expect(result.frontRank).toContain(1);
    expect(result.frontRank).toContain(2);
    expect(result.rearRank).toContain(3);
  });
});

// ─── stepFormationCasualtyFill ────────────────────────────────────────────────

describe("stepFormationCasualtyFill", () => {
  it("no changes when no dead", () => {
    const split: RankSplit = { frontRank: [1, 2], rearRank: [3, 4] };
    const result = stepFormationCasualtyFill(split, new Set());
    expect(result.frontRank).toEqual([1, 2]);
    expect(result.rearRank).toEqual([3, 4]);
  });

  it("removes dead entity from front rank with no replacements when rear is empty", () => {
    const split: RankSplit = { frontRank: [1, 2], rearRank: [] };
    const result = stepFormationCasualtyFill(split, new Set([1]));
    expect(result.frontRank).toEqual([2]);
    expect(result.rearRank).toEqual([]);
  });

  it("promotes rear-rank entity to fill front-rank vacancy", () => {
    const split: RankSplit = { frontRank: [1, 2], rearRank: [3, 4] };
    const result = stepFormationCasualtyFill(split, new Set([1]));
    expect(result.frontRank).toContain(2);
    expect(result.frontRank).toContain(3); // promoted
    expect(result.rearRank).toContain(4);
    expect(result.rearRank).not.toContain(3);
  });

  it("promotes front-of-rear-rank first", () => {
    const split: RankSplit = { frontRank: [1], rearRank: [10, 20, 30] };
    const result = stepFormationCasualtyFill(split, new Set([1]));
    expect(result.frontRank).toEqual([10]); // first rear entity promoted
    expect(result.rearRank).toEqual([20, 30]);
  });

  it("removes dead from both ranks simultaneously", () => {
    const split: RankSplit = { frontRank: [1, 2], rearRank: [3, 4] };
    const result = stepFormationCasualtyFill(split, new Set([1, 3]));
    // 1 vacancy → filled by first alive rear (= 4)
    expect(result.frontRank).toContain(2);
    expect(result.frontRank).toContain(4);
    expect(result.rearRank).toHaveLength(0);
  });

  it("handles all front rank dead with enough rear replacements", () => {
    const split: RankSplit = { frontRank: [1, 2, 3], rearRank: [4, 5, 6, 7] };
    const result = stepFormationCasualtyFill(split, new Set([1, 2, 3]));
    expect(result.frontRank).toEqual([4, 5, 6]);
    expect(result.rearRank).toEqual([7]);
  });

  it("does not mutate original rankSplit", () => {
    const split: RankSplit = { frontRank: [1, 2], rearRank: [3] };
    stepFormationCasualtyFill(split, new Set([1]));
    expect(split.frontRank).toEqual([1, 2]);
    expect(split.rearRank).toEqual([3]);
  });
});

// ─── computeFormationMomentum ──────────────────────────────────────────────────

describe("computeFormationMomentum", () => {
  it("returns zero momentum for empty arrays", () => {
    const result = computeFormationMomentum([], []);
    expect(result.momentum_Skg_mps).toBe(0);
    expect(result.entityCount).toBe(0);
  });

  it("excludes entities with zero speed", () => {
    // mass=80000 (80 kg), speed=0
    const result = computeFormationMomentum([80000], [0]);
    expect(result.momentum_Skg_mps).toBe(0);
    expect(result.entityCount).toBe(0);
  });

  it("computes momentum for a single moving entity", () => {
    // mass = 80000 (80 kg in SCALE.kg=1000), speed = 15000 (1.5 m/s in SCALE.mps=10000)
    // momentum = trunc(80000 * 15000 / 10000) = trunc(120000000 / 10000) = 12000
    // physical = 12000 / 1000 = 12 kg·m/s  (matches 80 kg × 1.5 m/s)
    const result = computeFormationMomentum([80000], [15000]);
    expect(result.momentum_Skg_mps).toBe(Math.trunc(80000 * 15000 / SCALE.mps));
    expect(result.entityCount).toBe(1);
  });

  it("sums momentum from multiple moving entities", () => {
    const masses  = [80000, 70000, 90000];
    const speeds  = [10000, 20000, 15000];
    const expected = masses.reduce(
      (sum, m, i) => sum + Math.trunc(m * speeds[i]! / SCALE.mps),
      0,
    );
    const result = computeFormationMomentum(masses, speeds);
    expect(result.momentum_Skg_mps).toBe(expected);
    expect(result.entityCount).toBe(3);
  });

  it("ignores negative speeds (treats as stationary)", () => {
    const result = computeFormationMomentum([80000], [-10000]);
    expect(result.momentum_Skg_mps).toBe(0);
    expect(result.entityCount).toBe(0);
  });

  it("uses the shorter array length when lengths differ", () => {
    // 3 masses, 2 speeds → only 2 pairs processed
    const result = computeFormationMomentum([80000, 70000, 90000], [10000, 20000]);
    const expected = Math.trunc(80000 * 10000 / SCALE.mps)
                   + Math.trunc(70000 * 20000 / SCALE.mps);
    expect(result.momentum_Skg_mps).toBe(expected);
    expect(result.entityCount).toBe(2);
  });
});

// ─── deriveFormationCohesion ──────────────────────────────────────────────────

describe("deriveFormationCohesion", () => {
  it("empty formation is vacuously intact with no bonus or penalty", () => {
    const state: FormationCohesionState = deriveFormationCohesion([], new Set());
    expect(state.intact).toBe(true);
    expect(state.moraleBonus_Q).toBe(q(0));
    expect(state.moralePenalty_Q).toBe(q(0));
  });

  it("all entities alive → intact, grants morale bonus", () => {
    const state = deriveFormationCohesion([1, 2, 3, 4], new Set());
    expect(state.intact).toBe(true);
    expect(state.intactFrac_Q).toBe(SCALE.Q);
    expect(state.moraleBonus_Q).toBe(FORMATION_MORALE_BONUS);
    expect(state.moralePenalty_Q).toBe(q(0));
  });

  it("all entities dead/routed → broken, applies morale penalty", () => {
    const ids = [1, 2, 3];
    const state = deriveFormationCohesion(ids, new Set(ids));
    expect(state.intact).toBe(false);
    expect(state.intactFrac_Q).toBe(0);
    expect(state.moraleBonus_Q).toBe(q(0));
    expect(state.moralePenalty_Q).toBe(FORMATION_MORALE_PENALTY);
  });

  it("exactly at threshold (60% intact) → intact", () => {
    // 6 out of 10 alive → intactFrac = 6000 = q(0.60) = FORMATION_INTACT_THRESHOLD
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const dead = new Set([7, 8, 9, 10]);
    const state = deriveFormationCohesion(ids, dead);
    expect(state.intact).toBe(true);
  });

  it("just below threshold (50% intact) → broken", () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const dead = new Set([6, 7, 8, 9, 10]);
    const state = deriveFormationCohesion(ids, dead);
    expect(state.intact).toBe(false);
  });

  it("intactFrac_Q reflects correct proportion", () => {
    const ids = [1, 2, 3, 4];
    const dead = new Set([4]);
    const state = deriveFormationCohesion(ids, dead);
    const expected = Math.round((3 * SCALE.Q) / 4);
    expect(state.intactFrac_Q).toBe(expected);
  });

  it("bonus and penalty are mutually exclusive", () => {
    const idsIntact  = [1, 2, 3, 4, 5];
    const idsBroken  = [1, 2, 3, 4, 5];
    const deadBroken = new Set([1, 2, 3]);

    const intact  = deriveFormationCohesion(idsIntact, new Set());
    const broken  = deriveFormationCohesion(idsBroken, deadBroken);

    expect(intact.moraleBonus_Q).toBeGreaterThan(0);
    expect(intact.moralePenalty_Q).toBe(0);
    expect(broken.moralePenalty_Q).toBeGreaterThan(0);
    expect(broken.moraleBonus_Q).toBe(0);
  });
});

// ─── deriveFormationAllyFearDecay ─────────────────────────────────────────────

describe("deriveFormationAllyFearDecay", () => {
  it("zero allies gives zero decay", () => {
    expect(deriveFormationAllyFearDecay(0)).toBe(0);
  });

  it("one ally gives FORMATION_ALLY_FEAR_DECAY", () => {
    expect(deriveFormationAllyFearDecay(1)).toBe(FORMATION_ALLY_FEAR_DECAY);
  });

  it("scales linearly up to cap", () => {
    for (let n = 1; n <= FORMATION_ALLY_DECAY_CAP; n++) {
      const result = deriveFormationAllyFearDecay(n);
      const expected = n * FORMATION_ALLY_FEAR_DECAY;
      expect(result).toBe(expected);
    }
  });

  it("caps at FORMATION_ALLY_DECAY_CAP allies", () => {
    const atCap    = deriveFormationAllyFearDecay(FORMATION_ALLY_DECAY_CAP);
    const overCap  = deriveFormationAllyFearDecay(FORMATION_ALLY_DECAY_CAP + 5);
    expect(atCap).toBe(overCap);
  });

  it("large ally count still returns capped value, not a number > cap×rate", () => {
    const maxDecay = FORMATION_ALLY_DECAY_CAP * FORMATION_ALLY_FEAR_DECAY;
    expect(deriveFormationAllyFearDecay(1000)).toBe(maxDecay);
  });

  it("result is non-negative integer", () => {
    const result = deriveFormationAllyFearDecay(4);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});
