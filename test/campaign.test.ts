// test/campaign.test.ts — Phase 22: Campaign & World State

import { describe, it, expect } from "vitest";
import { q } from "../src/units.js";
import {
  createCampaign,
  addLocation,
  getEntityLocation,
  mergeEntityState,
  stepCampaignTime,
  travel,
  debitInventory,
  creditInventory,
  getInventoryCount,
  serialiseCampaign,
  deserialiseCampaign,
  type CampaignState,
  type Location,
} from "../src/campaign.js";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing.js";
import type { Entity } from "../src/sim/entity.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEntity(id: number): Entity {
  return mkHumanoidEntity(id, 1, 0, 0);
}

function makeWoundedEntity(id: number): Entity {
  const e = makeEntity(id);
  e.injury.byRegion["torso"]!.bleedingRate = q(0.05) as any;
  return e;
}

function makeLocation(id: string, neighbours: Record<string, number> = {}): Location {
  return {
    id,
    name:        id.charAt(0).toUpperCase() + id.slice(1),
    elevation_m: 0,
    travelCost:  new Map(Object.entries(neighbours)),
  };
}

// ── Group: state management ───────────────────────────────────────────────────

describe("createCampaign", () => {
  it("initialises worldTime_s at 0", () => {
    const c = createCampaign("test", []);
    expect(c.worldTime_s).toBe(0);
  });

  it("populates entity registry from starting entities", () => {
    const e = makeEntity(1);
    const c = createCampaign("test", [e]);
    expect(c.entities.has(1)).toBe(true);
  });

  it("deep-clones entities — mutating original does not affect registry", () => {
    const e = makeEntity(1);
    const c = createCampaign("test", [e]);
    e.teamId = 99;
    expect(c.entities.get(1)!.teamId).toBe(1);
  });

  it("sets epoch to a non-empty string", () => {
    const c = createCampaign("test", []);
    expect(typeof c.epoch).toBe("string");
    expect(c.epoch.length).toBeGreaterThan(0);
  });

  it("accepts an explicit epoch string", () => {
    const c = createCampaign("test", [], "2025-01-01T00:00:00.000Z");
    expect(c.epoch).toBe("2025-01-01T00:00:00.000Z");
  });

  it("starts with empty log", () => {
    const c = createCampaign("test", []);
    expect(c.log).toHaveLength(0);
  });
});

describe("mergeEntityState", () => {
  it("overwrites entity fields in registry", () => {
    const e = makeEntity(1);
    const c = createCampaign("test", [e]);
    const updated = { ...structuredClone(e), teamId: 42 };
    mergeEntityState(c, [updated]);
    expect(c.entities.get(1)!.teamId).toBe(42);
  });

  it("adds new entities not previously in registry", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    mergeEntityState(c, [makeEntity(2)]);
    expect(c.entities.has(2)).toBe(true);
  });

  it("does not mutate the passed array — registry holds deep clones", () => {
    const e = makeEntity(1);
    const c = createCampaign("test", []);
    mergeEntityState(c, [e]);
    e.teamId = 99;
    expect(c.entities.get(1)!.teamId).toBe(1);
  });
});

// ── Group: time advancement ───────────────────────────────────────────────────

describe("stepCampaignTime", () => {
  it("advances worldTime_s by exact delta", () => {
    const c = createCampaign("test", []);
    stepCampaignTime(c, 3600);
    expect(c.worldTime_s).toBe(3600);
  });

  it("clock is monotone across multiple calls", () => {
    const c = createCampaign("test", []);
    stepCampaignTime(c, 1000);
    stepCampaignTime(c, 500);
    expect(c.worldTime_s).toBe(1500);
  });

  it("returns recovery reports for processed entities", () => {
    const e = makeWoundedEntity(1);
    const c = createCampaign("test", [e]);
    const reports = stepCampaignTime(c, 300);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.entityId).toBe(1);
  });

  it("no entities → empty reports, clock still advances", () => {
    const c = createCampaign("test", []);
    const reports = stepCampaignTime(c, 500);
    expect(reports).toHaveLength(0);
    expect(c.worldTime_s).toBe(500);
  });

  it("24h rest with bleeding wound → bleedingRate reduced (natural clotting)", () => {
    const e = makeWoundedEntity(1);
    const startBleed = e.injury.byRegion["torso"]!.bleedingRate;
    const c = createCampaign("test", [e]);
    stepCampaignTime(c, 86400);  // 24 hours — enough for natural clotting to stop q(0.05)
    const endBleed = c.entities.get(1)!.injury.byRegion["torso"]!.bleedingRate;
    expect(endBleed).toBeLessThan(startBleed);
  });

  it("entity injury is persisted in registry after healing", () => {
    const e = makeWoundedEntity(1);
    const c = createCampaign("test", [e]);
    stepCampaignTime(c, 1000);
    const stored = c.entities.get(1)!;
    // fluidLoss should have accumulated (entity was bleeding for 1000s)
    expect(stored.injury.fluidLoss).toBeGreaterThan(q(0));
  });

  it("applying downtimeConfig with first_aid stops bleeding faster", () => {
    const e1 = makeWoundedEntity(1);
    const c1  = createCampaign("c1", [e1]);
    stepCampaignTime(c1, 300);  // no care

    const e2 = makeWoundedEntity(1);
    const c2  = createCampaign("c2", [e2]);
    stepCampaignTime(c2, 300, {
      downtimeConfig: {
        treatments: new Map([[1, { careLevel: "first_aid" }]]),
        rest: true,
      },
    });

    const fl1 = c1.entities.get(1)!.injury.fluidLoss;
    const fl2 = c2.entities.get(1)!.injury.fluidLoss;
    // First aid reduces bleeding faster → less fluid loss
    expect(fl2).toBeLessThan(fl1);
  });

  it("multiple entities processed independently", () => {
    const e1 = makeWoundedEntity(1);
    const e2 = makeWoundedEntity(2);
    const c  = createCampaign("test", [e1, e2]);
    const reports = stepCampaignTime(c, 300);
    expect(reports).toHaveLength(2);
  });

  it("log entry added when entity dies during recovery", () => {
    const e = makeEntity(1);
    // Extreme bleeding — will die quickly
    e.injury.byRegion["torso"]!.bleedingRate = q(0.15) as any;
    const c = createCampaign("test", [e]);
    stepCampaignTime(c, 5000, {
      downtimeConfig: {
        treatments: new Map([[1, { careLevel: "none" }]]),
        rest: false,
      },
    });
    const hasDeathLog = c.log.some(entry => entry.text.includes("died"));
    expect(hasDeathLog).toBe(true);
  });
});

// ── Group: travel ─────────────────────────────────────────────────────────────

describe("travel", () => {
  it("entity moves to new location", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    addLocation(c, makeLocation("town"));
    travel(c, 1, "town");
    expect(getEntityLocation(c, 1)).toBe("town");
  });

  it("returns 0 for first placement (no current location)", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    addLocation(c, makeLocation("town"));
    const time = travel(c, 1, "town");
    expect(time).toBe(0);
  });

  it("travel time matches travelCost between two locations", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    addLocation(c, makeLocation("town"));
    addLocation(c, makeLocation("cave", { town: 1800 }));  // 30 min from cave to town
    // First, place entity in cave
    travel(c, 1, "cave");
    // Then travel to town — should cost 1800s
    const clockBefore = c.worldTime_s;
    const t = travel(c, 1, "town");
    expect(t).toBe(1800);
    expect(c.worldTime_s).toBe(clockBefore + 1800);
  });

  it("unknown destination returns -1", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    const t = travel(c, 1, "nonexistent_location");
    expect(t).toBe(-1);
  });

  it("travel time is added to worldTime_s", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    addLocation(c, makeLocation("start"));
    addLocation(c, makeLocation("dest", { start: 600 }));
    travel(c, 1, "start");
    const before = c.worldTime_s;
    travel(c, 1, "dest");
    expect(c.worldTime_s).toBeGreaterThan(before);
  });

  it("travel logs an entry", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    addLocation(c, makeLocation("village"));
    travel(c, 1, "village");
    expect(c.log.length).toBeGreaterThan(0);
    expect(c.log.some(l => l.text.includes("village") || l.text.includes("Village"))).toBe(true);
  });
});

// ── Group: inventory ──────────────────────────────────────────────────────────

describe("inventory", () => {
  it("debitInventory returns true when stock is available", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    creditInventory(c, 1, "bandage", 5);
    expect(debitInventory(c, 1, "bandage", 3)).toBe(true);
  });

  it("debitInventory returns false when insufficient stock", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    creditInventory(c, 1, "bandage", 2);
    expect(debitInventory(c, 1, "bandage", 5)).toBe(false);
  });

  it("stock reaches 0 but never goes negative", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    creditInventory(c, 1, "arrow", 3);
    debitInventory(c, 1, "arrow", 3);
    expect(getInventoryCount(c, 1, "arrow")).toBe(0);
    // Try to debit from 0 — should fail and remain 0
    const ok = debitInventory(c, 1, "arrow", 1);
    expect(ok).toBe(false);
    expect(getInventoryCount(c, 1, "arrow")).toBe(0);
  });

  it("multiple item types tracked independently", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    creditInventory(c, 1, "bandage", 10);
    creditInventory(c, 1, "arrow",   30);
    debitInventory(c, 1, "arrow", 5);
    expect(getInventoryCount(c, 1, "bandage")).toBe(10);
    expect(getInventoryCount(c, 1, "arrow")).toBe(25);
  });

  it("debit is logged", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    creditInventory(c, 1, "bandage", 5);
    debitInventory(c, 1, "bandage", 2);
    expect(c.log.some(l => l.text.includes("bandage"))).toBe(true);
  });

  it("getInventoryCount returns 0 for unknown item", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    expect(getInventoryCount(c, 1, "potion")).toBe(0);
  });

  it("getInventoryCount returns 0 for entity with no inventory", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    expect(getInventoryCount(c, 99, "bandage")).toBe(0);
  });
});

// ── Group: serialisation ──────────────────────────────────────────────────────

describe("serialisation", () => {
  it("round-trip preserves worldTime_s", () => {
    const c = createCampaign("test", []);
    c.worldTime_s = 7200;
    const c2 = deserialiseCampaign(serialiseCampaign(c));
    expect(c2.worldTime_s).toBe(7200);
  });

  it("round-trip preserves id and epoch", () => {
    const c  = createCampaign("my-campaign", [], "2025-06-01T00:00:00.000Z");
    const c2 = deserialiseCampaign(serialiseCampaign(c));
    expect(c2.id).toBe("my-campaign");
    expect(c2.epoch).toBe("2025-06-01T00:00:00.000Z");
  });

  it("Map fields survive round-trip — entities, locations, entityLocations", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    addLocation(c, makeLocation("town", { village: 600 }));
    travel(c, 1, "town");
    const c2 = deserialiseCampaign(serialiseCampaign(c));
    expect(c2.entities.has(1)).toBe(true);
    expect(c2.locations.has("town")).toBe(true);
    expect(c2.entityLocations.get(1)).toBe("town");
    expect(c2.locations.get("town")!.travelCost instanceof Map).toBe(true);
  });

  it("entityInventories survive round-trip", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    creditInventory(c, 1, "bandage", 5);
    const c2 = deserialiseCampaign(serialiseCampaign(c));
    expect(getInventoryCount(c2, 1, "bandage")).toBe(5);
  });

  it("log array preserved", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    addLocation(c, makeLocation("town"));
    travel(c, 1, "town");
    const c2 = deserialiseCampaign(serialiseCampaign(c));
    expect(c2.log.length).toBe(c.log.length);
  });

  it("empty campaign round-trips cleanly", () => {
    const c  = createCampaign("empty", []);
    const c2 = deserialiseCampaign(serialiseCampaign(c));
    expect(c2.entities.size).toBe(0);
    expect(c2.locations.size).toBe(0);
    expect(c2.log).toHaveLength(0);
  });

  it("large campaign (20 entities) round-trips", () => {
    const entities = Array.from({ length: 20 }, (_, i) => makeEntity(i + 1));
    const c  = createCampaign("large", entities);
    const c2 = deserialiseCampaign(serialiseCampaign(c));
    expect(c2.entities.size).toBe(20);
  });

  it("entity injury state preserved across serialisation", () => {
    const e = makeWoundedEntity(1);
    const c = createCampaign("test", [e]);
    const c2 = deserialiseCampaign(serialiseCampaign(c));
    const stored = c2.entities.get(1)!;
    expect(stored.injury.byRegion["torso"]!.bleedingRate).toBeGreaterThan(0);
  });

  it("serialiseCampaign output is valid JSON", () => {
    const c = createCampaign("test", [makeEntity(1)]);
    expect(() => JSON.parse(serialiseCampaign(c))).not.toThrow();
  });
});
