import { describe, it, expect } from "vitest";
import {
  extractTerrainParams,
  generateBattleSite,
  mergeBattleOutcome,
  FIELD_WIDTH_Sm,
  FIELD_HEIGHT_Sm,
  CELL_SIZE_Sm,
  GRID_COLS,
  GRID_ROWS,
  ATTACKER_SPAWN_Y_Sm,
  DEFENDER_SPAWN_Y_Sm,
  type CampaignHexType,
  type BattleOutcome,
} from "../src/terrain-bridge.js";
import { SURFACE_TRACTION, type SurfaceType } from "../src/sim/terrain.js";
import { q, SCALE } from "../src/units.js";
import type { CampaignState } from "../src/campaign.js";
import type { WorldState } from "../src/sim/world.js";
import type { Entity } from "../src/sim/entity.js";
import type { InjuryState } from "../src/sim/injury.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeInjury(dead: boolean): InjuryState {
  return {
    byRegion: {},
    fluidLoss: q(0),
    shock: q(0),
    consciousness: dead ? q(0) : q(1.0),
    dead,
    hemolymphLoss: q(0),
  };
}

function makeEntity(id: number, teamId: number, dead = false): Entity {
  return {
    id,
    teamId,
    attributes: {} as never,
    energy:     { fatigue: q(0), stamina: q(1.0) } as never,
    loadout:    { items: [] },
    traits:     [],
    injury:     makeInjury(dead),
    condition:  {
      onFire: q(0), corrosiveExposure: q(0), radiation: q(0), electricalOverload: q(0),
      suffocation: q(0), stunned: q(0), prone: false, pinned: false,
      standBlockedTicks: 0, unconsciousTicks: 0, suppressedTicks: 0, blindTicks: 0,
    } as never,
  } as never as Entity;
}

function makeWorld(entities: Entity[]): WorldState {
  return { tick: 100, seed: 1, entities };
}

function makeCampaign(): CampaignState {
  return {
    id: "test_campaign",
    epoch: "2025-01-01T00:00:00Z",
    worldTime_s: 0,
    entities: new Map([
      [1, makeEntity(1, 1)],
      [2, makeEntity(2, 2)],
    ]),
    locations: new Map(),
    entityLocations: new Map([[1, "loc_a"], [2, "loc_a"]]),
    entityInventories: new Map([[1, new Map()], [2, new Map([["arrow", 10]])]]),
    log: [],
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("field constants", () => {
  it("FIELD_WIDTH_Sm is 100 m in SCALE.m units", () => {
    expect(FIELD_WIDTH_Sm).toBe(100 * SCALE.m);
  });

  it("FIELD_HEIGHT_Sm is 80 m in SCALE.m units", () => {
    expect(FIELD_HEIGHT_Sm).toBe(80 * SCALE.m);
  });

  it("CELL_SIZE_Sm is 10 m in SCALE.m units", () => {
    expect(CELL_SIZE_Sm).toBe(10 * SCALE.m);
  });

  it("grid dimensions are correct", () => {
    expect(GRID_COLS).toBe(FIELD_WIDTH_Sm  / CELL_SIZE_Sm);
    expect(GRID_ROWS).toBe(FIELD_HEIGHT_Sm / CELL_SIZE_Sm);
  });

  it("attacker spawn is near south edge", () => {
    expect(ATTACKER_SPAWN_Y_Sm).toBeLessThan(CELL_SIZE_Sm);
  });

  it("defender spawn is near north edge", () => {
    expect(DEFENDER_SPAWN_Y_Sm).toBeGreaterThan(FIELD_HEIGHT_Sm - CELL_SIZE_Sm);
  });
});

// ── extractTerrainParams ──────────────────────────────────────────────────────

const ALL_HEX_TYPES: CampaignHexType[] = [
  "plains", "forest", "hills", "marsh", "urban", "mountain", "river_crossing", "coastal",
];

describe("extractTerrainParams", () => {
  it("returns correct field dimensions for all hex types", () => {
    for (const hexType of ALL_HEX_TYPES) {
      const params = extractTerrainParams(hexType);
      expect(params.width_Sm,    hexType).toBe(FIELD_WIDTH_Sm);
      expect(params.height_Sm,   hexType).toBe(FIELD_HEIGHT_Sm);
      expect(params.cellSize_Sm, hexType).toBe(CELL_SIZE_Sm);
    }
  });

  it("is deterministic — same hexType produces identical params", () => {
    for (const hexType of ALL_HEX_TYPES) {
      const a = extractTerrainParams(hexType);
      const b = extractTerrainParams(hexType);
      expect(a.dominantSurface, hexType).toBe(b.dominantSurface);
      expect(a.coverSegments.length, hexType).toBe(b.coverSegments.length);
      expect(a.terrainGrid.size,     hexType).toBe(b.terrainGrid.size);
    }
  });

  it("dominantSurface is a valid SurfaceType for all hex types", () => {
    const valid: SurfaceType[] = ["normal", "mud", "ice", "slope_up", "slope_down"];
    for (const hexType of ALL_HEX_TYPES) {
      const { dominantSurface } = extractTerrainParams(hexType);
      expect(valid, hexType).toContain(dominantSurface);
    }
  });

  it("dominantSurface has a corresponding SURFACE_TRACTION entry", () => {
    for (const hexType of ALL_HEX_TYPES) {
      const { dominantSurface } = extractTerrainParams(hexType);
      expect(SURFACE_TRACTION[dominantSurface], hexType).toBeDefined();
    }
  });

  // plains ──────────────────────────────────────────────────────────────────

  describe("plains", () => {
    it("has normal dominant surface", () => {
      expect(extractTerrainParams("plains").dominantSurface).toBe("normal");
    });

    it("has no terrain cells (all open ground)", () => {
      expect(extractTerrainParams("plains").terrainGrid.size).toBe(0);
    });

    it("has exactly 2 cover segments", () => {
      expect(extractTerrainParams("plains").coverSegments).toHaveLength(2);
    });

    it("cover segments are dirt berms", () => {
      const segs = extractTerrainParams("plains").coverSegments;
      expect(segs.every(s => s.material === "dirt")).toBe(true);
    });
  });

  // forest ──────────────────────────────────────────────────────────────────

  describe("forest", () => {
    it("has mud dominant surface", () => {
      expect(extractTerrainParams("forest").dominantSurface).toBe("mud");
    });

    it("has mud cells (all non-path rows)", () => {
      const { terrainGrid } = extractTerrainParams("forest");
      expect(terrainGrid.size).toBeGreaterThan(0);
      for (const [, surf] of terrainGrid) {
        expect(surf).toBe("mud");
      }
    });

    it("path rows 3 and 4 have no terrain entry (normal default)", () => {
      const { terrainGrid } = extractTerrainParams("forest");
      for (let col = 0; col < GRID_COLS; col++) {
        expect(terrainGrid.has(`${col},3`), `col ${col} row 3`).toBe(false);
        expect(terrainGrid.has(`${col},4`), `col ${col} row 4`).toBe(false);
      }
    });

    it("has obstacle cells for dense undergrowth", () => {
      expect(extractTerrainParams("forest").obstacleGrid.size).toBeGreaterThan(0);
    });

    it("has 2 wood tree-line cover segments", () => {
      const segs = extractTerrainParams("forest").coverSegments;
      expect(segs).toHaveLength(2);
      expect(segs.every(s => s.material === "wood")).toBe(true);
    });
  });

  // hills ───────────────────────────────────────────────────────────────────

  describe("hills", () => {
    it("has slope_up dominant surface", () => {
      expect(extractTerrainParams("hills").dominantSurface).toBe("slope_up");
    });

    it("south cells are slope_up, north cells are slope_down", () => {
      const { terrainGrid } = extractTerrainParams("hills");
      for (let col = 0; col < GRID_COLS; col++) {
        expect(terrainGrid.get(`${col},0`)).toBe("slope_up");
        expect(terrainGrid.get(`${col},7`)).toBe("slope_down");
      }
    });

    it("south cells have increasing elevation", () => {
      const { elevationGrid } = extractTerrainParams("hills");
      const e0 = elevationGrid.get("0,0") ?? 0;
      const e1 = elevationGrid.get("0,1") ?? 0;
      expect(e1).toBeGreaterThan(e0);
    });

    it("has slope entries for all cells", () => {
      const { slopeGrid } = extractTerrainParams("hills");
      expect(slopeGrid.size).toBe(GRID_COLS * GRID_ROWS);
    });

    it("has a stone cover segment on the ridge", () => {
      const segs = extractTerrainParams("hills").coverSegments;
      expect(segs.some(s => s.material === "stone")).toBe(true);
    });
  });

  // marsh ───────────────────────────────────────────────────────────────────

  describe("marsh", () => {
    it("has mud dominant surface", () => {
      expect(extractTerrainParams("marsh").dominantSurface).toBe("mud");
    });

    it("all cells are mud", () => {
      const { terrainGrid } = extractTerrainParams("marsh");
      expect(terrainGrid.size).toBe(GRID_COLS * GRID_ROWS);
      for (const [, surf] of terrainGrid) {
        expect(surf).toBe("mud");
      }
    });

    it("has no cover segments", () => {
      expect(extractTerrainParams("marsh").coverSegments).toHaveLength(0);
    });
  });

  // urban ───────────────────────────────────────────────────────────────────

  describe("urban", () => {
    it("has normal dominant surface", () => {
      expect(extractTerrainParams("urban").dominantSurface).toBe("normal");
    });

    it("has at least 8 cover segments", () => {
      expect(extractTerrainParams("urban").coverSegments.length).toBeGreaterThanOrEqual(8);
    });

    it("has stone walls and wood barricades", () => {
      const segs = extractTerrainParams("urban").coverSegments;
      expect(segs.some(s => s.material === "stone")).toBe(true);
      expect(segs.some(s => s.material === "wood")).toBe(true);
    });

    it("has obstacle cells for building interiors", () => {
      expect(extractTerrainParams("urban").obstacleGrid.size).toBeGreaterThan(0);
    });
  });

  // mountain ────────────────────────────────────────────────────────────────

  describe("mountain", () => {
    it("has slope_up dominant surface", () => {
      expect(extractTerrainParams("mountain").dominantSurface).toBe("slope_up");
    });

    it("upper rows have ice terrain", () => {
      const { terrainGrid } = extractTerrainParams("mountain");
      for (let col = 0; col < GRID_COLS; col++) {
        expect(terrainGrid.get(`${col},6`), `col ${col} row 6`).toBe("ice");
        expect(terrainGrid.get(`${col},7`), `col ${col} row 7`).toBe("ice");
      }
    });

    it("elevation increases monotonically south to north", () => {
      const { elevationGrid } = extractTerrainParams("mountain");
      for (let row = 1; row < GRID_ROWS; row++) {
        const prev = elevationGrid.get(`0,${row - 1}`) ?? 0;
        const curr = elevationGrid.get(`0,${row}`) ?? 0;
        expect(curr, `row ${row}`).toBeGreaterThan(prev);
      }
    });

    it("has stone outcrop cover segments", () => {
      const segs = extractTerrainParams("mountain").coverSegments;
      expect(segs.length).toBeGreaterThanOrEqual(2);
      expect(segs.every(s => s.material === "stone")).toBe(true);
    });
  });

  // river_crossing ──────────────────────────────────────────────────────────

  describe("river_crossing", () => {
    it("has mud dominant surface", () => {
      expect(extractTerrainParams("river_crossing").dominantSurface).toBe("mud");
    });

    it("ford cells (rows 3-4) are mud", () => {
      const { terrainGrid } = extractTerrainParams("river_crossing");
      for (let col = 0; col < GRID_COLS; col++) {
        expect(terrainGrid.get(`${col},3`)).toBe("mud");
        expect(terrainGrid.get(`${col},4`)).toBe("mud");
      }
    });

    it("outer rows have no terrain entry (normal ground)", () => {
      const { terrainGrid } = extractTerrainParams("river_crossing");
      expect(terrainGrid.has("0,0")).toBe(false);
      expect(terrainGrid.has("0,7")).toBe(false);
    });

    it("has sandbag cover on the far bank", () => {
      const segs = extractTerrainParams("river_crossing").coverSegments;
      expect(segs.some(s => s.material === "sandbag")).toBe(true);
    });
  });

  // coastal ─────────────────────────────────────────────────────────────────

  describe("coastal", () => {
    it("beach rows (0-1) are mud", () => {
      const { terrainGrid } = extractTerrainParams("coastal");
      for (let col = 0; col < GRID_COLS; col++) {
        expect(terrainGrid.get(`${col},0`)).toBe("mud");
        expect(terrainGrid.get(`${col},1`)).toBe("mud");
      }
    });

    it("inland rows have no terrain entry", () => {
      const { terrainGrid } = extractTerrainParams("coastal");
      expect(terrainGrid.has("0,5")).toBe(false);
    });

    it("has dirt and stone cover segments", () => {
      const segs = extractTerrainParams("coastal").coverSegments;
      expect(segs.some(s => s.material === "dirt")).toBe(true);
      expect(segs.some(s => s.material === "stone")).toBe(true);
    });
  });
});

// ── generateBattleSite ────────────────────────────────────────────────────────

describe("generateBattleSite", () => {
  it("returns all terrain params from extractTerrainParams", () => {
    const site = generateBattleSite({
      hexType: "plains", attackerTeamIds: [1], defenderTeamIds: [2],
    });
    const base = extractTerrainParams("plains");
    expect(site.dominantSurface).toBe(base.dominantSurface);
    expect(site.coverSegments.length).toBe(base.coverSegments.length);
  });

  it("produces one entry vector per team", () => {
    const site = generateBattleSite({
      hexType: "forest", attackerTeamIds: [1, 3], defenderTeamIds: [2],
    });
    expect(site.entryVectors).toHaveLength(3);
  });

  it("attackers get facingY: 1", () => {
    const site = generateBattleSite({
      hexType: "plains", attackerTeamIds: [1], defenderTeamIds: [2],
    });
    const attacker = site.entryVectors.find(v => v.teamId === 1)!;
    expect(attacker.facingY).toBe(1);
  });

  it("defenders get facingY: -1", () => {
    const site = generateBattleSite({
      hexType: "plains", attackerTeamIds: [1], defenderTeamIds: [2],
    });
    const defender = site.entryVectors.find(v => v.teamId === 2)!;
    expect(defender.facingY).toBe(-1);
  });

  it("attackers spawn near south edge (small y)", () => {
    const site = generateBattleSite({
      hexType: "plains", attackerTeamIds: [1], defenderTeamIds: [2],
    });
    const attacker = site.entryVectors.find(v => v.teamId === 1)!;
    expect(attacker.y_Sm).toBe(ATTACKER_SPAWN_Y_Sm);
  });

  it("defenders spawn near north edge (large y)", () => {
    const site = generateBattleSite({
      hexType: "plains", attackerTeamIds: [1], defenderTeamIds: [2],
    });
    const defender = site.entryVectors.find(v => v.teamId === 2)!;
    expect(defender.y_Sm).toBe(DEFENDER_SPAWN_Y_Sm);
  });

  it("spawn x is within field boundaries", () => {
    const site = generateBattleSite({
      hexType: "urban", attackerTeamIds: [1, 2, 3, 4], defenderTeamIds: [5],
    });
    for (const ev of site.entryVectors) {
      expect(ev.x_Sm).toBeGreaterThan(0);
      expect(ev.x_Sm).toBeLessThan(FIELD_WIDTH_Sm);
    }
  });

  it("handles empty defender list gracefully", () => {
    const site = generateBattleSite({
      hexType: "marsh", attackerTeamIds: [1], defenderTeamIds: [],
    });
    expect(site.entryVectors).toHaveLength(1);
    expect(site.entryVectors[0]!.teamId).toBe(1);
  });

  it("is deterministic with the same seed", () => {
    const a = generateBattleSite({ hexType: "hills", attackerTeamIds: [1], defenderTeamIds: [2], seed: 42 });
    const b = generateBattleSite({ hexType: "hills", attackerTeamIds: [1], defenderTeamIds: [2], seed: 42 });
    expect(a.entryVectors[0]!.x_Sm).toBe(b.entryVectors[0]!.x_Sm);
    expect(a.coverSegments.length).toBe(b.coverSegments.length);
  });
});

// ── mergeBattleOutcome ────────────────────────────────────────────────────────

describe("mergeBattleOutcome", () => {
  it("advances worldTime_s by elapsedSeconds", () => {
    const campaign = makeCampaign();
    const outcome: BattleOutcome = {
      worldState: makeWorld([makeEntity(1, 1), makeEntity(2, 2)]),
      elapsedSeconds: 120,
    };
    mergeBattleOutcome(campaign, outcome);
    expect(campaign.worldTime_s).toBe(120);
  });

  it("removes dead entities from campaign", () => {
    const campaign = makeCampaign();
    const outcome: BattleOutcome = {
      worldState: makeWorld([makeEntity(1, 1, /*dead=*/true), makeEntity(2, 2)]),
      elapsedSeconds: 60,
    };
    mergeBattleOutcome(campaign, outcome);
    expect(campaign.entities.has(1)).toBe(false);
    expect(campaign.entities.has(2)).toBe(true);
  });

  it("removes dead entity locations", () => {
    const campaign = makeCampaign();
    const outcome: BattleOutcome = {
      worldState: makeWorld([makeEntity(1, 1, /*dead=*/true), makeEntity(2, 2)]),
      elapsedSeconds: 60,
    };
    mergeBattleOutcome(campaign, outcome);
    expect(campaign.entityLocations.has(1)).toBe(false);
  });

  it("removes dead entity inventories", () => {
    const campaign = makeCampaign();
    const outcome: BattleOutcome = {
      worldState: makeWorld([makeEntity(2, 2, /*dead=*/true)]),
      elapsedSeconds: 60,
    };
    mergeBattleOutcome(campaign, outcome);
    expect(campaign.entityInventories.has(2)).toBe(false);
  });

  it("retains surviving entities", () => {
    const campaign = makeCampaign();
    const outcome: BattleOutcome = {
      worldState: makeWorld([makeEntity(1, 1), makeEntity(2, 2)]),
      elapsedSeconds: 60,
    };
    mergeBattleOutcome(campaign, outcome);
    expect(campaign.entities.size).toBe(2);
  });

  it("copies post-battle injury onto surviving campaign entity", () => {
    const campaign = makeCampaign();
    const woundedEntity = makeEntity(1, 1);
    woundedEntity.injury!.shock = q(0.40) as never;
    const outcome: BattleOutcome = {
      worldState: makeWorld([woundedEntity, makeEntity(2, 2)]),
      elapsedSeconds: 60,
    };
    mergeBattleOutcome(campaign, outcome);
    expect(campaign.entities.get(1)!.injury!.shock).toBe(q(0.40));
  });

  it("copies post-battle condition onto surviving campaign entity", () => {
    const campaign = makeCampaign();
    const suppressedEntity = makeEntity(1, 1);
    (suppressedEntity.condition as any).suppressedTicks = 10;
    const outcome: BattleOutcome = {
      worldState: makeWorld([suppressedEntity, makeEntity(2, 2)]),
      elapsedSeconds: 60,
    };
    mergeBattleOutcome(campaign, outcome);
    expect((campaign.entities.get(1)!.condition as any).suppressedTicks).toBe(10);
  });

  it("appends a log entry", () => {
    const campaign = makeCampaign();
    const outcome: BattleOutcome = {
      worldState: makeWorld([makeEntity(1, 1), makeEntity(2, 2)]),
      elapsedSeconds: 60,
    };
    mergeBattleOutcome(campaign, outcome);
    expect(campaign.log).toHaveLength(1);
    expect(campaign.log[0]!.text).toContain("Battle concluded");
  });

  it("log entry mentions winner team when winnerTeamId is set", () => {
    const campaign = makeCampaign();
    const outcome: BattleOutcome = {
      worldState:   makeWorld([makeEntity(1, 1), makeEntity(2, 2)]),
      elapsedSeconds: 60,
      winnerTeamId: 1,
    };
    mergeBattleOutcome(campaign, outcome);
    expect(campaign.log[0]!.text).toContain("Team 1");
  });

  it("log entry says Draw when winnerTeamId is absent", () => {
    const campaign = makeCampaign();
    const outcome: BattleOutcome = {
      worldState:   makeWorld([makeEntity(1, 1), makeEntity(2, 2)]),
      elapsedSeconds: 60,
    };
    mergeBattleOutcome(campaign, outcome);
    expect(campaign.log[0]!.text).toContain("Draw");
  });

  it("transfers captured inventory items to winner", () => {
    const campaign = makeCampaign();
    // entity 2 had 10 arrows; entity 1 wins and captures entity 2
    const outcome: BattleOutcome = {
      worldState:        makeWorld([makeEntity(1, 1), makeEntity(2, 2)]),
      elapsedSeconds:    60,
      winnerTeamId:      1,
      capturedEntityIds: [2],
    };
    mergeBattleOutcome(campaign, outcome);
    const winInv = campaign.entityInventories.get(1)!;
    expect(winInv.get("arrow")).toBe(10);
  });

  it("does not transfer equipment when no winner", () => {
    const campaign = makeCampaign();
    const outcome: BattleOutcome = {
      worldState:        makeWorld([makeEntity(1, 1), makeEntity(2, 2)]),
      elapsedSeconds:    60,
      capturedEntityIds: [2],
    };
    mergeBattleOutcome(campaign, outcome);
    const winInv = campaign.entityInventories.get(1)!;
    expect(winInv.get("arrow")).toBeUndefined();
  });

  it("transfers loadout items from captured entity to winner", () => {
    const campaign = makeCampaign();
    // Give entity 2 a loadout item
    const sword = { id: "broadsword", name: "Broadsword" } as never;
    campaign.entities.get(2)!.loadout.items.push(sword);
    const outcome: BattleOutcome = {
      worldState:        makeWorld([makeEntity(1, 1), makeEntity(2, 2)]),
      elapsedSeconds:    60,
      winnerTeamId:      1,
      capturedEntityIds: [2],
    };
    mergeBattleOutcome(campaign, outcome);
    expect(campaign.entityInventories.get(1)!.get("broadsword")).toBe(1);
  });

  it("does not crash when all winner team entities are dead", () => {
    // _firstAliveInTeam returns undefined → no inventory transfer
    const campaign = makeCampaign();
    // Both entities dead in world state, but campaign still has entity 1
    const deadWorld = makeWorld([makeEntity(1, 1, /*dead=*/true), makeEntity(2, 2)]);
    const outcome: BattleOutcome = {
      worldState:        deadWorld,
      elapsedSeconds:    60,
      winnerTeamId:      1,         // team 1 nominally wins but its only entity died
      capturedEntityIds: [2],
    };
    expect(() => mergeBattleOutcome(campaign, outcome)).not.toThrow();
  });

  it("worldTime_s in log entry matches updated campaign time", () => {
    const campaign = makeCampaign();
    campaign.worldTime_s = 1000;
    const outcome: BattleOutcome = {
      worldState: makeWorld([makeEntity(1, 1)]),
      elapsedSeconds: 300,
    };
    mergeBattleOutcome(campaign, outcome);
    expect(campaign.log[0]!.worldTime_s).toBe(1300);
  });

  it("is a no-op for entities not in the campaign", () => {
    const campaign = makeCampaign();
    const outcome: BattleOutcome = {
      worldState: makeWorld([makeEntity(99, 3)]),   // entity 99 not in campaign
      elapsedSeconds: 60,
    };
    mergeBattleOutcome(campaign, outcome);
    expect(campaign.entities.size).toBe(2);  // unchanged
  });
});
