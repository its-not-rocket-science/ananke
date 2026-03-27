/**
 * CE-15 — Dynamic Terrain + Cover System tests
 */

import { describe, it, expect } from "vitest";
import {
  MATERIAL_ABSORPTION,
  WOOD_IGNITION_THRESHOLD_J,
  CRATER_RATE_Sm_PER_J,
  CRATER_EROSION_RATE_Sm_PER_S,
  WOOD_BURN_RATE_Sm_PER_S,
  createCoverSegment,
  COVER_STONE_WALL,
  COVER_SANDBAG_BARRICADE,
  COVER_WOODEN_PALISADE,
  COVER_DIRT_BERM,
  isLineOfSightBlocked,
  computeCoverProtection,
  arcClearsCover,
  applyExplosionToTerrain,
  stepCoverDecay,
  coverSegmentCentre,
  isCoverDestroyed,
  type CoverSegment,
  type WorldPoint2D,
} from "../src/sim/cover.js";
import { q, SCALE } from "../src/units.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function clone(seg: CoverSegment): CoverSegment {
  return { ...seg };
}

function _cloneAll(segs: CoverSegment[]): CoverSegment[] {
  return segs.map(clone);
}

// A horizontal wall at y=50 000, from x=0 to x=30 000 (3 m long, 1.5 m tall)
function makeWall(): CoverSegment {
  return createCoverSegment("wall", 0, 50_000, 30_000, 15_000, "stone");
}

// Attacker south of wall, target north of wall — LOS crosses the wall
const SOUTH: WorldPoint2D = { x_Sm: 15_000, y_Sm: 0 };
const NORTH: WorldPoint2D = { x_Sm: 15_000, y_Sm: 100_000 };
// Attacker and target on the same side — no LOS crossing
const SAME_SIDE: WorldPoint2D = { x_Sm: 15_000, y_Sm: 10_000 };

// ── Material absorption constants ─────────────────────────────────────────────

describe("MATERIAL_ABSORPTION", () => {
  it("stone absorbs q(0.70)", () => {
    expect(MATERIAL_ABSORPTION.stone).toBe(q(0.70));
  });
  it("sandbag absorbs q(0.60)", () => {
    expect(MATERIAL_ABSORPTION.sandbag).toBe(q(0.60));
  });
  it("dirt absorbs q(0.50)", () => {
    expect(MATERIAL_ABSORPTION.dirt).toBe(q(0.50));
  });
  it("wood absorbs q(0.35)", () => {
    expect(MATERIAL_ABSORPTION.wood).toBe(q(0.35));
  });
  it("stone absorbs more than wood", () => {
    expect(MATERIAL_ABSORPTION.stone).toBeGreaterThan(MATERIAL_ABSORPTION.wood);
  });
});

// ── Sample segments ───────────────────────────────────────────────────────────

describe("sample segments", () => {
  it("COVER_STONE_WALL has stone material", () => {
    expect(COVER_STONE_WALL.material).toBe("stone");
  });
  it("COVER_SANDBAG_BARRICADE has sandbag material", () => {
    expect(COVER_SANDBAG_BARRICADE.material).toBe("sandbag");
  });
  it("COVER_WOODEN_PALISADE has wood material", () => {
    expect(COVER_WOODEN_PALISADE.material).toBe("wood");
  });
  it("COVER_DIRT_BERM has dirt material", () => {
    expect(COVER_DIRT_BERM.material).toBe("dirt");
  });
  it("samples are not burning", () => {
    expect(COVER_STONE_WALL.burning).toBe(false);
    expect(COVER_WOODEN_PALISADE.burning).toBe(false);
  });
  it("originalHeight matches height on creation", () => {
    expect(COVER_STONE_WALL.height_Sm).toBe(COVER_STONE_WALL.originalHeight_Sm);
  });
});

// ── createCoverSegment ────────────────────────────────────────────────────────

describe("createCoverSegment", () => {
  it("sets all fields correctly", () => {
    const seg = createCoverSegment("s1", 100, 200, 1000, 500, "dirt");
    expect(seg.id).toBe("s1");
    expect(seg.x_Sm).toBe(100);
    expect(seg.y_Sm).toBe(200);
    expect(seg.length_Sm).toBe(1000);
    expect(seg.height_Sm).toBe(500);
    expect(seg.originalHeight_Sm).toBe(500);
    expect(seg.material).toBe("dirt");
    expect(seg.burning).toBe(false);
  });
  it("clamps negative height to 0", () => {
    const seg = createCoverSegment("s", 0, 0, 1000, -100, "stone");
    expect(seg.height_Sm).toBe(0);
    expect(seg.originalHeight_Sm).toBe(0);
  });
  it("clamps negative length to 1", () => {
    const seg = createCoverSegment("s", 0, 0, -500, 1000, "wood");
    expect(seg.length_Sm).toBe(1);
  });
});

// ── isLineOfSightBlocked ──────────────────────────────────────────────────────

describe("isLineOfSightBlocked", () => {
  it("returns false with no segments", () => {
    expect(isLineOfSightBlocked(SOUTH, NORTH, [])).toBe(false);
  });

  it("returns true when LOS crosses the wall", () => {
    const wall = makeWall();
    expect(isLineOfSightBlocked(SOUTH, NORTH, [wall])).toBe(true);
  });

  it("returns false when shot goes around the wall (x offset)", () => {
    const wall = makeWall();
    // Wall at x=0..30 000, y=50 000 — shoot from x=40 000
    const from: WorldPoint2D = { x_Sm: 40_000, y_Sm: 0 };
    const to: WorldPoint2D = { x_Sm: 40_000, y_Sm: 100_000 };
    expect(isLineOfSightBlocked(from, to, [wall])).toBe(false);
  });

  it("returns false when both points are on the same side of the wall", () => {
    const wall = makeWall();
    expect(isLineOfSightBlocked(SOUTH, SAME_SIDE, [wall])).toBe(false);
  });

  it("ignores destroyed segments (height = 0)", () => {
    const wall = makeWall();
    wall.height_Sm = 0;
    expect(isLineOfSightBlocked(SOUTH, NORTH, [wall])).toBe(false);
  });

  it("detects first of two walls on the LOS", () => {
    const wall1 = createCoverSegment("w1", 0, 30_000, 30_000, 10_000, "stone");
    const wall2 = createCoverSegment("w2", 0, 70_000, 30_000, 10_000, "stone");
    expect(isLineOfSightBlocked(SOUTH, NORTH, [wall1, wall2])).toBe(true);
  });

  it("returns false when only off-LOS segment present", () => {
    const off = createCoverSegment("off", 100_000, 50_000, 30_000, 15_000, "stone");
    expect(isLineOfSightBlocked(SOUTH, NORTH, [off])).toBe(false);
  });
});

// ── computeCoverProtection ────────────────────────────────────────────────────

describe("computeCoverProtection", () => {
  it("returns 0 with no segments", () => {
    expect(computeCoverProtection(SOUTH, NORTH, [])).toBe(0);
  });

  it("returns 0 when LOS is clear (no intersecting segment)", () => {
    const off = createCoverSegment("off", 100_000, 50_000, 30_000, 15_000, "stone");
    expect(computeCoverProtection(SOUTH, NORTH, [off])).toBe(0);
  });

  it("returns stone absorption for a single stone wall on LOS", () => {
    const wall = makeWall();
    const prot = computeCoverProtection(SOUTH, NORTH, [wall]);
    expect(prot).toBe(MATERIAL_ABSORPTION.stone);
  });

  it("returns 0 for destroyed segment on LOS", () => {
    const wall = makeWall();
    wall.height_Sm = 0;
    expect(computeCoverProtection(SOUTH, NORTH, [wall])).toBe(0);
  });

  it("stacked cover is greater than single cover", () => {
    const wall1 = createCoverSegment("w1", 0, 30_000, 30_000, 10_000, "stone");
    const wall2 = createCoverSegment("w2", 0, 70_000, 30_000, 10_000, "stone");
    const single = computeCoverProtection(SOUTH, NORTH, [wall1]);
    const stacked = computeCoverProtection(SOUTH, NORTH, [wall1, wall2]);
    expect(stacked).toBeGreaterThan(single);
  });

  it("stacked cover does not exceed SCALE.Q", () => {
    const walls = Array.from({ length: 10 }, (_, i) =>
      createCoverSegment(`w${i}`, 0, 10_000 + i * 5_000, 30_000, 10_000, "stone"),
    );
    const prot = computeCoverProtection(SOUTH, NORTH, walls);
    expect(prot).toBeLessThanOrEqual(SCALE.Q);
  });

  it("wood gives less protection than stone", () => {
    const woodWall = createCoverSegment("wood", 0, 50_000, 30_000, 15_000, "wood");
    const stoneWall = makeWall();
    const woodProt = computeCoverProtection(SOUTH, NORTH, [woodWall]);
    const stoneProt = computeCoverProtection(SOUTH, NORTH, [stoneWall]);
    expect(woodProt).toBeLessThan(stoneProt);
  });
});

// ── arcClearsCover ────────────────────────────────────────────────────────────

describe("arcClearsCover", () => {
  it("clears cover when arc elevation equals wall height", () => {
    const wall = makeWall();  // height = 15 000
    expect(arcClearsCover(SOUTH, NORTH, 15_000, [wall])).toBe(true);
  });

  it("clears cover when arc elevation exceeds wall height", () => {
    const wall = makeWall();  // height = 15 000
    expect(arcClearsCover(SOUTH, NORTH, 20_000, [wall])).toBe(true);
  });

  it("does NOT clear cover when arc elevation is below wall height", () => {
    const wall = makeWall();  // height = 15 000
    expect(arcClearsCover(SOUTH, NORTH, 5_000, [wall])).toBe(false);
  });

  it("ignores destroyed segments", () => {
    const wall = makeWall();
    wall.height_Sm = 0;
    // Low arc that would fail against a standing wall
    expect(arcClearsCover(SOUTH, NORTH, 1_000, [wall])).toBe(true);
  });

  it("returns true with no segments", () => {
    expect(arcClearsCover(SOUTH, NORTH, 0, [])).toBe(true);
  });

  it("must clear ALL walls on LOS", () => {
    const low  = createCoverSegment("low",  0, 30_000, 30_000, 5_000,  "stone");
    const high = createCoverSegment("high", 0, 70_000, 30_000, 20_000, "stone");
    // elevation 10 000 clears the low wall but not the high wall
    expect(arcClearsCover(SOUTH, NORTH, 10_000, [low, high])).toBe(false);
    // elevation 20 000 clears both
    expect(arcClearsCover(SOUTH, NORTH, 20_000, [low, high])).toBe(true);
  });
});

// ── applyExplosionToTerrain ───────────────────────────────────────────────────

describe("applyExplosionToTerrain", () => {
  it("returns empty results when blast misses all segments", () => {
    const segs = [makeWall()];
    // Blast far from the wall
    const result = applyExplosionToTerrain(500_000, 500_000, 1000, 10_000, segs);
    expect(result.cratered).toHaveLength(0);
    expect(result.ignited).toHaveLength(0);
  });

  it("reduces height when blast hits segment centre", () => {
    const seg = makeWall();
    const origH = seg.height_Sm;
    // Blast directly on midpoint
    applyExplosionToTerrain(15_000, 50_000, 1000, 20_000, [seg]);
    expect(seg.height_Sm).toBeLessThan(origH);
  });

  it("includes segment id in cratered list", () => {
    const seg = makeWall();
    const result = applyExplosionToTerrain(15_000, 50_000, 1000, 20_000, [seg]);
    expect(result.cratered).toContain("wall");
  });

  it("does not reduce height below 0", () => {
    const seg = makeWall();
    // Massive explosion
    applyExplosionToTerrain(15_000, 50_000, 100_000, 20_000, [seg]);
    expect(seg.height_Sm).toBeGreaterThanOrEqual(0);
  });

  it("ignites wood above threshold energy", () => {
    const wood = createCoverSegment("palisade", 0, 50_000, 30_000, 20_000, "wood");
    const result = applyExplosionToTerrain(15_000, 50_000, 1000, 20_000, [wood]);
    expect(wood.burning).toBe(true);
    expect(result.ignited).toContain("palisade");
  });

  it("does not ignite stone", () => {
    const stone = makeWall();
    applyExplosionToTerrain(15_000, 50_000, 1000, 20_000, [stone]);
    expect(stone.burning).toBe(false);
  });

  it("does not ignite wood below threshold energy", () => {
    // Very weak blast, scaled energy below WOOD_IGNITION_THRESHOLD_J
    const wood = createCoverSegment("palisade", 0, 50_000, 30_000, 20_000, "wood");
    // Energy = 1 J but segment is at edge of blast radius — scaled energy will be tiny
    applyExplosionToTerrain(15_000, 50_000, 1, 20_000, [wood]);
    // 1 J at centre → localEnergy = 1 J < threshold (30), no ignition
    expect(wood.burning).toBe(false);
  });

  it("does not re-ignite already burning segment", () => {
    const wood = createCoverSegment("w", 0, 50_000, 30_000, 20_000, "wood");
    wood.burning = true;
    const result = applyExplosionToTerrain(15_000, 50_000, 1000, 20_000, [wood]);
    expect(result.ignited).toHaveLength(0);
  });

  it("closer blast causes more damage than distant blast", () => {
    const seg1 = makeWall();
    const seg2 = makeWall();
    const origH = seg1.height_Sm;

    // Close blast (centre at segment midpoint)
    applyExplosionToTerrain(15_000, 50_000, 1000, 20_000, [seg1]);
    // Distant blast (centre far away but within radius)
    applyExplosionToTerrain(15_000 + 15_000, 50_000, 1000, 20_000, [seg2]);

    const lossClose = origH - seg1.height_Sm;
    const lossDistant = origH - seg2.height_Sm;
    expect(lossClose).toBeGreaterThanOrEqual(lossDistant);
  });
});

// ── stepCoverDecay ────────────────────────────────────────────────────────────

describe("stepCoverDecay", () => {
  it("no-op for zero elapsed time", () => {
    const segs = [makeWall()];
    const origH = segs[0]!.height_Sm;
    stepCoverDecay(segs, 0);
    expect(segs[0]!.height_Sm).toBe(origH);
  });

  it("no-op for negative elapsed time", () => {
    const segs = [makeWall()];
    const origH = segs[0]!.height_Sm;
    stepCoverDecay(segs, -10);
    expect(segs[0]!.height_Sm).toBe(origH);
  });

  it("burning wood loses height at WOOD_BURN_RATE_Sm_PER_S", () => {
    const wood = createCoverSegment("w", 0, 0, 20_000, 20_000, "wood");
    wood.burning = true;
    stepCoverDecay([wood], 1);
    expect(wood.height_Sm).toBe(20_000 - WOOD_BURN_RATE_Sm_PER_S);
  });

  it("burning stops when height reaches 0", () => {
    const wood = createCoverSegment("w", 0, 0, 20_000, 100, "wood");
    wood.burning = true;
    stepCoverDecay([wood], 100);
    expect(wood.height_Sm).toBe(0);
    expect(wood.burning).toBe(false);
  });

  it("craters erode toward originalHeight", () => {
    const seg = makeWall();
    const craterH = seg.height_Sm - 5_000;
    seg.height_Sm = craterH;
    stepCoverDecay([seg], 1);
    expect(seg.height_Sm).toBe(craterH + CRATER_EROSION_RATE_Sm_PER_S);
  });

  it("erosion does not exceed originalHeight", () => {
    const seg = makeWall();
    seg.height_Sm = seg.originalHeight_Sm - 10;
    stepCoverDecay([seg], 10_000);
    expect(seg.height_Sm).toBe(seg.originalHeight_Sm);
  });

  it("non-damaged stone wall does not change height", () => {
    const seg = makeWall();
    const origH = seg.height_Sm;
    stepCoverDecay([seg], 3600);  // 1 hour
    expect(seg.height_Sm).toBe(origH);
  });

  it("burning wood does not erode (burning takes priority)", () => {
    const wood = createCoverSegment("w", 0, 0, 20_000, 10_000, "wood");
    wood.burning = true;
    // Reduce height to trigger erosion path... but burning should win
    wood.height_Sm = 5_000;
    const before = wood.height_Sm;
    stepCoverDecay([wood], 1);
    // Should decrease (burn) not increase (erode)
    expect(wood.height_Sm).toBeLessThan(before);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

describe("coverSegmentCentre", () => {
  it("returns midpoint of segment", () => {
    const seg = createCoverSegment("s", 0, 50_000, 20_000, 10_000, "stone");
    const centre = coverSegmentCentre(seg);
    expect(centre.x_Sm).toBe(10_000);
    expect(centre.y_Sm).toBe(50_000);
  });

  it("handles odd-length segments correctly (integer truncation)", () => {
    const seg = createCoverSegment("s", 0, 0, 30_001, 1000, "stone");
    const centre = coverSegmentCentre(seg);
    expect(centre.x_Sm).toBe(15_000);  // Math.trunc(30001/2)
  });
});

describe("isCoverDestroyed", () => {
  it("returns false for intact segment", () => {
    expect(isCoverDestroyed(makeWall())).toBe(false);
  });

  it("returns true when height is 0", () => {
    const seg = makeWall();
    seg.height_Sm = 0;
    expect(isCoverDestroyed(seg)).toBe(true);
  });

  it("returns true when height is negative (clamped case)", () => {
    const seg = makeWall();
    seg.height_Sm = -1;
    expect(isCoverDestroyed(seg)).toBe(true);
  });
});

// ── Constants sanity ──────────────────────────────────────────────────────────

describe("constants", () => {
  it("WOOD_IGNITION_THRESHOLD_J is positive", () => {
    expect(WOOD_IGNITION_THRESHOLD_J).toBeGreaterThan(0);
  });
  it("CRATER_RATE_Sm_PER_J is positive", () => {
    expect(CRATER_RATE_Sm_PER_J).toBeGreaterThan(0);
  });
  it("CRATER_EROSION_RATE_Sm_PER_S is positive", () => {
    expect(CRATER_EROSION_RATE_Sm_PER_S).toBeGreaterThan(0);
  });
  it("WOOD_BURN_RATE_Sm_PER_S is positive", () => {
    expect(WOOD_BURN_RATE_Sm_PER_S).toBeGreaterThan(0);
  });
});
