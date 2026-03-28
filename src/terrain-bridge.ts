// src/terrain-bridge.ts — PA-5: Campaign ↔ Tactical Terrain Bridge
//
// Maps campaign hex tiles to tactical battlefield parameters consumable by
// KernelContext, and merges tactical battle results back into CampaignState.
//
// Typical workflow:
//   1. Army enters a forest hex on the campaign map.
//   2. Call generateBattleSite({ hexType: "forest", ... }) → BattleTerrainParams.
//   3. Build KernelContext from terrain params; run stepWorld until battle ends.
//   4. Call mergeBattleOutcome(campaign, { worldState, elapsedSeconds }) to
//      apply casualties, injuries, and looted equipment back to campaign.

import { q, type Q, type I32 } from "./units.js";
import {
  type TerrainGrid,
  type ObstacleGrid,
  type ElevationGrid,
  type SlopeGrid,
  type SlopeInfo,
  type SurfaceType,
  buildTerrainGrid,
  buildObstacleGrid,
  buildElevationGrid,
  buildSlopeGrid,
  terrainKey,
} from "./sim/terrain.js";
import { type CoverSegment, createCoverSegment } from "./sim/cover.js";
import type { CampaignState } from "./campaign.js";
import type { WorldState } from "./sim/world.js";
import type { Entity } from "./sim/entity.js";

// ── Field constants ────────────────────────────────────────────────────────────

/** Battlefield width [SCALE.m]. 100 m. */
export const FIELD_WIDTH_Sm  = 1_000_000 as I32;
/** Battlefield depth [SCALE.m]. 80 m. */
export const FIELD_HEIGHT_Sm = 800_000 as I32;
/** Terrain cell size [SCALE.m]. 10 m per cell → 10 × 8 grid. */
export const CELL_SIZE_Sm    = 100_000 as I32;
/** Number of grid columns (field width / cell size). */
export const GRID_COLS = 10;
/** Number of grid rows (field height / cell size). */
export const GRID_ROWS = 8;

/** Attacker spawn y [SCALE.m] — 5 m from the south (y=0) edge. */
export const ATTACKER_SPAWN_Y_Sm = 50_000 as I32;
/** Defender spawn y [SCALE.m] — 5 m from the north edge. */
export const DEFENDER_SPAWN_Y_Sm = (FIELD_HEIGHT_Sm - 50_000) as I32;

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Campaign map tile type.
 *
 * Each hex type produces a distinct battlefield layout — surface type, cover
 * density, elevation profile, and obstacle placement.
 */
export type CampaignHexType =
  | "plains"
  | "forest"
  | "hills"
  | "marsh"
  | "urban"
  | "mountain"
  | "river_crossing"
  | "coastal";

/**
 * Initial spawn position and facing for one team entering the battlefield.
 *
 * Attackers (south-entry) have `facingY: 1` (moving toward increasing y).
 * Defenders (north-entry) have `facingY: -1`.
 */
export interface EntryVector {
  /** Team identifier matching `entity.teamId`. */
  teamId: number;
  /** Spawn x-coordinate [SCALE.m]. */
  x_Sm: number;
  /** Spawn y-coordinate [SCALE.m]. */
  y_Sm: number;
  /**
   * Initial movement direction along the y-axis.
   * `1`  = attacker advancing north.
   * `-1` = defender holding or advancing south.
   */
  facingY: 1 | -1;
}

/**
 * Complete tactical battlefield specification derived from a campaign hex encounter.
 *
 * ## Integration
 * ```ts
 * const site = generateBattleSite({ hexType: "forest", ... });
 * const ctx: KernelContext = {
 *   tractionCoeff: SURFACE_TRACTION[site.dominantSurface],
 *   cellSize_m:    site.cellSize_Sm,
 *   terrainGrid:   site.terrainGrid,
 *   obstacleGrid:  site.obstacleGrid,
 *   elevationGrid: site.elevationGrid,
 *   slopeGrid:     site.slopeGrid,
 * };
 * // Position entities at site.entryVectors[n].x_Sm / y_Sm before first stepWorld.
 * ```
 */
export interface BattleTerrainParams {
  /** Total battlefield width [SCALE.m]. */
  width_Sm:        number;
  /** Total battlefield depth [SCALE.m]. */
  height_Sm:       number;
  /** Cell size used for terrain grid lookups [SCALE.m]. */
  cellSize_Sm:     number;
  /** Per-cell surface type — pass to `KernelContext.terrainGrid`. */
  terrainGrid:     TerrainGrid;
  /** Per-cell cover fraction — pass to `KernelContext.obstacleGrid`. */
  obstacleGrid:    ObstacleGrid;
  /** Per-cell elevation above ground [SCALE.m] — pass to `KernelContext.elevationGrid`. */
  elevationGrid:   ElevationGrid;
  /** Per-cell slope direction and grade — pass to `KernelContext.slopeGrid`. */
  slopeGrid:       SlopeGrid;
  /** Structural cover segments to place in the world before battle begins. */
  coverSegments:   CoverSegment[];
  /** Entry spawn positions for each team. */
  entryVectors:    EntryVector[];
  /**
   * Dominant surface type — use `SURFACE_TRACTION[dominantSurface]` as
   * the default `KernelContext.tractionCoeff`.
   */
  dominantSurface: SurfaceType;
}

/**
 * Context provided to `generateBattleSite`.
 */
export interface BattleSiteContext {
  /** Campaign hex tile where the battle occurs. */
  hexType:          CampaignHexType;
  /** Attacking team ids — they enter from the south (y ≈ 0). */
  attackerTeamIds:  number[];
  /** Defending team ids — they enter from the north (y ≈ FIELD_HEIGHT). */
  defenderTeamIds:  number[];
  /**
   * World seed from the campaign — reserved for future micro-variance.
   * Currently unused but forwarded for determinism documentation purposes.
   */
  seed?:            number;
}

/**
 * Outcome produced by the tactical simulation, passed to `mergeBattleOutcome`.
 */
export interface BattleOutcome {
  /** Final `WorldState` after the tactical battle ends. */
  worldState:          WorldState;
  /**
   * Battle duration in simulated seconds, added to `CampaignState.worldTime_s`.
   */
  elapsedSeconds:      number;
  /**
   * Entity ids of combatants incapacitated or captured on the losing side.
   * Their weapons and armour will be transferred to the winning team's inventory.
   */
  capturedEntityIds?:  number[];
  /**
   * Team id of the victorious side.  When `undefined` the battle is a draw and
   * no equipment transfer occurs.
   */
  winnerTeamId?:       number;
}

// ── extractTerrainParams ──────────────────────────────────────────────────────

/**
 * Build terrain, obstacle, elevation, and slope grids for a campaign hex type.
 *
 * Fully deterministic — produces the same output for the same `hexType` every
 * call.  Does not include `entryVectors`; use `generateBattleSite` for a full
 * site including team spawn positions.
 *
 * Grid layout: 10 columns × 8 rows, each cell 10 m (100 000 SCALE.m).
 * Total field: 100 m wide × 80 m deep.
 */
export function extractTerrainParams(
  hexType: CampaignHexType,
): Omit<BattleTerrainParams, "entryVectors"> {
  switch (hexType) {
    case "plains":         return _plains();
    case "forest":         return _forest();
    case "hills":          return _hills();
    case "marsh":          return _marsh();
    case "urban":          return _urban();
    case "mountain":       return _mountain();
    case "river_crossing": return _riverCrossing();
    case "coastal":        return _coastal();
  }
}

// ── generateBattleSite ────────────────────────────────────────────────────────

/** Three evenly-spaced x spawn positions (15 m, 50 m, 85 m). */
const SPAWN_X_Sm: readonly number[] = [150_000, 500_000, 850_000];

/**
 * Generate a complete battle site for a campaign encounter.
 *
 * Calls `extractTerrainParams` and appends `EntryVector` entries for each
 * attacking and defending team.
 *
 * Teams with more than three members reuse spawn positions (cyclic).
 */
export function generateBattleSite(ctx: BattleSiteContext): BattleTerrainParams {
  const base = extractTerrainParams(ctx.hexType);
  const entryVectors: EntryVector[] = [];

  for (let i = 0; i < ctx.attackerTeamIds.length; i++) {
    entryVectors.push({
      teamId: ctx.attackerTeamIds[i]!,
      x_Sm:   SPAWN_X_Sm[i % SPAWN_X_Sm.length]!,
      y_Sm:   ATTACKER_SPAWN_Y_Sm,
      facingY: 1,
    });
  }

  for (let i = 0; i < ctx.defenderTeamIds.length; i++) {
    entryVectors.push({
      teamId: ctx.defenderTeamIds[i]!,
      x_Sm:   SPAWN_X_Sm[i % SPAWN_X_Sm.length]!,
      y_Sm:   DEFENDER_SPAWN_Y_Sm,
      facingY: -1,
    });
  }

  return { ...base, entryVectors };
}

// ── mergeBattleOutcome ────────────────────────────────────────────────────────

/**
 * Merge a completed tactical battle back into campaign state.
 *
 * **What this does:**
 * - Advances `campaign.worldTime_s` by `outcome.elapsedSeconds`.
 * - Removes entities that died in battle (`injury.dead === true`) from the
 *   campaign entity registry, location map, and inventory map.
 * - Copies post-battle `injury` and `condition` state onto surviving campaign
 *   entities so wounds persist between encounters.
 * - Transfers weapons and armour from `capturedEntityIds` to the winning
 *   team's first surviving entity inventory (item id → count).
 * - Appends a human-readable battle summary to `campaign.log`.
 *
 * Mutates `campaign` in-place.
 */
export function mergeBattleOutcome(
  campaign: CampaignState,
  outcome: BattleOutcome,
): void {
  campaign.worldTime_s += outcome.elapsedSeconds;

  const { worldState, capturedEntityIds = [], winnerTeamId } = outcome;

  let killed   = 0;
  let survived = 0;

  for (const entity of worldState.entities) {
    const campaignEntity = campaign.entities.get(entity.id);
    if (campaignEntity === undefined) continue;  // not in this campaign

    if (_isDead(entity)) {
      campaign.entities.delete(entity.id);
      campaign.entityLocations.delete(entity.id);
      campaign.entityInventories.delete(entity.id);
      killed++;
    } else {
      // Carry forward post-battle wounds and psychological state
      if (entity.injury    !== undefined) campaignEntity.injury    = entity.injury;
      if (entity.condition !== undefined) campaignEntity.condition = entity.condition;
      survived++;
    }
  }

  // Equipment transfer: looted gear from captured/incapacitated enemies
  if (winnerTeamId !== undefined && capturedEntityIds.length > 0) {
    const winnerId = _firstAliveInTeam(worldState, winnerTeamId);
    if (winnerId !== undefined) {
      const winInv: Map<string, number> =
        campaign.entityInventories.get(winnerId) ?? new Map();

      for (const capturedId of capturedEntityIds) {
        // Carry items from campaign inventory
        const inv = campaign.entityInventories.get(capturedId);
        if (inv !== undefined) {
          for (const [itemId, count] of inv) {
            winInv.set(itemId, (winInv.get(itemId) ?? 0) + count);
          }
        }
        // Transfer equipped items (weapons, armour) by id
        const capEntity = campaign.entities.get(capturedId);
        if (capEntity !== undefined) {
          for (const item of capEntity.loadout.items) {
            winInv.set(item.id, (winInv.get(item.id) ?? 0) + 1);
          }
        }
      }

      campaign.entityInventories.set(winnerId, winInv);
    }
  }

  const outcome_note = winnerTeamId !== undefined
    ? ` Team ${winnerTeamId} victorious.`
    : " Draw.";
  campaign.log.push({
    worldTime_s: campaign.worldTime_s,
    text: `Battle concluded (${survived} survived, ${killed} killed).${outcome_note}`,
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _isDead(entity: Entity): boolean {
  return entity.injury?.dead === true;
}

function _firstAliveInTeam(world: WorldState, teamId: number): number | undefined {
  for (const e of world.entities) {
    if (e.teamId === teamId && !_isDead(e)) return e.id;
  }
  return undefined;
}

// ── Hex terrain recipes ───────────────────────────────────────────────────────

type TerrainResult = Omit<BattleTerrainParams, "entryVectors">;

function _base(): TerrainResult {
  return {
    width_Sm:        FIELD_WIDTH_Sm,
    height_Sm:       FIELD_HEIGHT_Sm,
    cellSize_Sm:     CELL_SIZE_Sm,
    terrainGrid:     new Map(),
    obstacleGrid:    new Map(),
    elevationGrid:   new Map(),
    slopeGrid:       new Map(),
    coverSegments:   [],
    dominantSurface: "normal",
  };
}

function ck(col: number, row: number): string {
  return terrainKey(col, row);
}

/** Plains: open ground, two dirt berm defensive lines. */
function _plains(): TerrainResult {
  const r = _base();
  r.coverSegments.push(
    createCoverSegment("plains_berm_s", 200_000, 250_000, 600_000, 8_000, "dirt"),
    createCoverSegment("plains_berm_n", 200_000, 550_000, 600_000, 8_000, "dirt"),
  );
  return r;
}

/** Forest: muddy undergrowth, partial cover, two wood tree-lines flanking a central path. */
function _forest(): TerrainResult {
  const r = _base();
  r.dominantSurface = "mud";

  const terrain: Record<string, SurfaceType> = {};
  const obstacles: Record<string, Q>         = {};

  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      const key = ck(col, row);
      if (row !== 3 && row !== 4) {   // rows 3-4 = natural path (no mud)
        terrain[key]   = "mud";
        obstacles[key] = q(0.40) as Q;  // dense undergrowth — 40% cover
      }
    }
  }
  r.terrainGrid  = buildTerrainGrid(terrain);
  r.obstacleGrid = buildObstacleGrid(obstacles);

  // Tree-lines flanking the path (y = 25 m and y = 50 m)
  r.coverSegments.push(
    createCoverSegment("forest_tree_s", 0, 250_000, 1_000_000, 12_000, "wood"),
    createCoverSegment("forest_tree_n", 0, 500_000, 1_000_000, 12_000, "wood"),
  );
  return r;
}

/** Hills: gradient elevation south-to-north, stone cover on the crest. */
function _hills(): TerrainResult {
  const r = _base();
  r.dominantSurface = "slope_up";

  const terrain:   Record<string, SurfaceType> = {};
  const elevation: Record<string, I32>         = {};
  const slopes:    Record<string, SlopeInfo>   = {};

  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      const key = ck(col, row);
      if (row < 4) {
        // South half — uphill approach; elevation rises 5 m per row (0–15 m)
        terrain[key]   = "slope_up";
        elevation[key] = (row * 50_000) as I32;
        slopes[key]    = { type: "uphill",   grade: q(0.50) as Q };
      } else {
        // North half — downhill on far side of crest
        terrain[key]   = "slope_down";
        elevation[key] = ((GRID_ROWS - 1 - row) * 50_000) as I32;
        slopes[key]    = { type: "downhill", grade: q(0.50) as Q };
      }
    }
  }
  r.terrainGrid  = buildTerrainGrid(terrain);
  r.elevationGrid = buildElevationGrid(elevation);
  r.slopeGrid    = buildSlopeGrid(slopes);

  // Stone wall along the ridgeline (y ≈ 40 m)
  r.coverSegments.push(
    createCoverSegment("hills_ridgeline", 100_000, 400_000, 800_000, 10_000, "stone"),
  );
  return r;
}

/** Marsh: all-mud terrain, no cover — speed heavily penalised. */
function _marsh(): TerrainResult {
  const r = _base();
  r.dominantSurface = "mud";

  const terrain: Record<string, SurfaceType> = {};
  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      terrain[ck(col, row)] = "mud";
    }
  }
  r.terrainGrid = buildTerrainGrid(terrain);
  return r;
}

/** Urban: dense stone and wood cover forming a street grid; partial obstacle cells. */
function _urban(): TerrainResult {
  const r = _base();

  // Stone building walls — south block, mid block, north block
  r.coverSegments.push(
    createCoverSegment("urban_s1",    0,       200_000, 350_000, 20_000, "stone"),
    createCoverSegment("urban_s2",    450_000, 200_000, 350_000, 20_000, "stone"),
    createCoverSegment("urban_s3",    200_000, 300_000, 200_000, 20_000, "stone"),
    createCoverSegment("urban_m1",    0,       400_000, 250_000, 20_000, "stone"),
    createCoverSegment("urban_m2",    350_000, 400_000, 300_000, 20_000, "stone"),
    createCoverSegment("urban_m3",    750_000, 400_000, 250_000, 20_000, "stone"),
    createCoverSegment("urban_n1",    100_000, 600_000, 350_000, 20_000, "stone"),
    createCoverSegment("urban_n2",    550_000, 600_000, 350_000, 20_000, "stone"),
    createCoverSegment("urban_barr1", 350_000, 350_000, 100_000, 10_000, "wood"),
    createCoverSegment("urban_barr2", 350_000, 500_000, 100_000, 10_000, "wood"),
  );

  // Partial obstacles in building interiors (~50% cover)
  r.obstacleGrid = buildObstacleGrid({
    [ck(1, 2)]: q(0.50) as Q,
    [ck(5, 2)]: q(0.50) as Q,
    [ck(2, 4)]: q(0.50) as Q,
    [ck(7, 4)]: q(0.50) as Q,
  });
  return r;
}

/** Mountain: steep icy ascent, high elevation, rocky outcrops. */
function _mountain(): TerrainResult {
  const r = _base();
  r.dominantSurface = "slope_up";

  const terrain:   Record<string, SurfaceType> = {};
  const elevation: Record<string, I32>         = {};
  const slopes:    Record<string, SlopeInfo>   = {};

  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      const key = ck(col, row);
      elevation[key] = (row * 100_000) as I32;           // 0–70 m rise
      terrain[key]   = row >= 4 ? "ice" : "slope_up";
      slopes[key]    = {
        type:  "uphill",
        grade: (row >= 4 ? q(0.80) : q(0.60)) as Q,
      };
    }
  }
  r.terrainGrid   = buildTerrainGrid(terrain);
  r.elevationGrid = buildElevationGrid(elevation);
  r.slopeGrid     = buildSlopeGrid(slopes);

  // Rocky outcrops for cover
  r.coverSegments.push(
    createCoverSegment("mtn_rock1", 100_000, 200_000, 150_000, 15_000, "stone"),
    createCoverSegment("mtn_rock2", 600_000, 350_000, 200_000, 15_000, "stone"),
    createCoverSegment("mtn_rock3", 300_000, 500_000, 150_000, 15_000, "stone"),
  );
  return r;
}

/** River crossing: muddy ford in the center, sandbag cover on the defending bank. */
function _riverCrossing(): TerrainResult {
  const r = _base();
  r.dominantSurface = "mud";

  // Mud band at rows 3-4 (30–50 m) — the ford
  const terrain: Record<string, SurfaceType> = {};
  for (let col = 0; col < GRID_COLS; col++) {
    terrain[ck(col, 3)] = "mud";
    terrain[ck(col, 4)] = "mud";
  }
  r.terrainGrid = buildTerrainGrid(terrain);

  // Sandbag defensive line on the far (north) bank
  r.coverSegments.push(
    createCoverSegment("river_cover_w", 50_000,  500_000, 350_000, 12_000, "sandbag"),
    createCoverSegment("river_cover_e", 600_000, 500_000, 350_000, 12_000, "sandbag"),
  );
  return r;
}

/** Coastal: muddy beach approach (south 2 rows), dunes and rocky outcrops for cover. */
function _coastal(): TerrainResult {
  const r = _base();

  // Soft sand / surf zone — rows 0-1 (0–20 m from south)
  const terrain: Record<string, SurfaceType> = {};
  for (let col = 0; col < GRID_COLS; col++) {
    terrain[ck(col, 0)] = "mud";
    terrain[ck(col, 1)] = "mud";
  }
  r.terrainGrid = buildTerrainGrid(terrain);

  // Dunes and rocky coastal outcrops
  r.coverSegments.push(
    createCoverSegment("coastal_dune1", 100_000, 150_000, 300_000,  8_000, "dirt"),
    createCoverSegment("coastal_dune2", 600_000, 150_000, 300_000,  8_000, "dirt"),
    createCoverSegment("coastal_rock1", 0,       350_000, 200_000, 12_000, "stone"),
    createCoverSegment("coastal_rock2", 800_000, 450_000, 200_000, 12_000, "stone"),
  );
  return r;
}

