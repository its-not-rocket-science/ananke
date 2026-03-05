/**
 * Phase 32E — Phase 6 Remaining features tests
 *
 * Groups:
 *   computeChokeCapacity  (5) — open corridor, choke, fallback, partial block
 *   fearDecayPerTick      (5) — formationAllyCount bonus, cap, backward compat
 */

import { describe, it, expect } from "vitest";
import { q, SCALE, type Q } from "../src/units";
import { computeChokeCapacity } from "../src/sim/frontage";
import { fearDecayPerTick } from "../src/sim/morale";
import { buildObstacleGrid } from "../src/sim/terrain";

// ── computeChokeCapacity helpers ───────────────────────────────────────────────

const CELL = Math.trunc(4 * SCALE.m);    // 4 m cell size
const WIDTH = Math.trunc(0.5 * SCALE.m); // 0.5 m entity width (default)

/**
 * With facingDir = {x:1, y:0} (pure +x integer unit vec), perp is {x:0, y:1}.
 * Steps = max(1, round(scanRange_m / cellSize_m)).
 * For scanRange = CELL → steps = 1 → i in {-1, 0, 1}.
 * Cell coords scanned: (0,-1), (0,0), (0,1).
 */
const FACING_X = { x: 1, y: 0 };
const ORIGIN   = { x: 0, y: 0 };

// ── computeChokeCapacity ───────────────────────────────────────────────────────

describe("computeChokeCapacity", () => {
  it("returns defaultCap (100) when obstacleGrid is undefined", () => {
    const result = computeChokeCapacity(
      undefined, CELL, ORIGIN, FACING_X, CELL, WIDTH,
    );
    expect(result).toBe(100);
  });

  it("returns defaultCap when cellSize_m = 0", () => {
    const grid = buildObstacleGrid({});
    const result = computeChokeCapacity(grid, 0, ORIGIN, FACING_X, CELL, WIDTH);
    expect(result).toBe(100);
  });

  it("open corridor (empty grid) → capacity ≥ 1", () => {
    const grid = buildObstacleGrid({});
    const result = computeChokeCapacity(grid, CELL, ORIGIN, FACING_X, CELL, WIDTH);
    // 3 cells passable, each 4 m wide, entity 0.5 m → 3 * 40000 / 5000 = 24
    expect(result).toBeGreaterThanOrEqual(1);
  });

  it("fully blocked corridor → capacity = 1 (clamped minimum)", () => {
    const grid = buildObstacleGrid({
      "0,-1": SCALE.Q as Q,
      "0,0":  SCALE.Q as Q,
      "0,1":  SCALE.Q as Q,
    });
    const result = computeChokeCapacity(grid, CELL, ORIGIN, FACING_X, CELL, WIDTH);
    expect(result).toBe(1);
  });

  it("partial block: 1 of 3 cells blocked reduces capacity below open-corridor cap", () => {
    const openGrid    = buildObstacleGrid({});
    const partialGrid = buildObstacleGrid({ "0,1": SCALE.Q as Q });
    const open    = computeChokeCapacity(openGrid,    CELL, ORIGIN, FACING_X, CELL, WIDTH);
    const partial = computeChokeCapacity(partialGrid, CELL, ORIGIN, FACING_X, CELL, WIDTH);
    expect(partial).toBeLessThan(open);
  });
});

// ── fearDecayPerTick — formationAllyCount ─────────────────────────────────────

describe("fearDecayPerTick formationAllyCount", () => {
  it("formationAllyCount=0 gives same result as undefined", () => {
    const dt0 = fearDecayPerTick(q(0.5) as Q, 0, 0);
    const dtU = fearDecayPerTick(q(0.5) as Q, 0, undefined);
    expect(dt0).toBe(dtU);
  });

  it("formationAllyCount > 0 increases decay over base (no formation)", () => {
    const base         = fearDecayPerTick(q(0.5) as Q, 0, 0);
    const withFormation = fearDecayPerTick(q(0.5) as Q, 0, 3);
    expect(withFormation).toBeGreaterThan(base);
  });

  it("large formationAllyCount is capped (5 and 100 give same result)", () => {
    // 5 × q(0.003) = q(0.015) = cap; 100 × q(0.003) >> cap → same
    const atFive    = fearDecayPerTick(q(0.5) as Q, 0, 5);
    const atHundred = fearDecayPerTick(q(0.5) as Q, 0, 100);
    expect(atHundred).toBe(atFive);
  });

  it("combined nearbyAllyCount + formationAllyCount stacks additively", () => {
    const nearOnly  = fearDecayPerTick(q(0.5) as Q, 5, 0);
    const bothBonus = fearDecayPerTick(q(0.5) as Q, 5, 3);
    expect(bothBonus).toBeGreaterThan(nearOnly);
  });

  it("total decay is clamped at q(0.040) even with max bonuses", () => {
    const maxDecay = fearDecayPerTick(q(1.0) as Q, 100, 100);
    expect(maxDecay).toBeLessThanOrEqual(q(0.040));
  });
});
