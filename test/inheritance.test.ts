// test/inheritance.test.ts — Phase 49: Legacy & Inheritance

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import type { Entity } from "../src/sim/entity.js";
import { createCampaign } from "../src/campaign.js";
import {
  createRelationshipGraph,
  establishRelationship,
  getRelationship,
  getEntityRelationshipsList,
} from "../src/relationships.js";
import {
  transferEquipment,
  transferRelationships,
  transferInventory,
  applyInheritance,
} from "../src/inheritance.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkEntity(id: number, itemIds: string[] = []): Entity {
  return {
    id,
    teamId: 1,
    attributes: {
      morphology: { stature_m: 17500, mass_kg: 75_000, reachScale: 1.0 },
      performance: { peakForce_N: 2000, peakPower_W: 1200, reactionTime_s: 4000, fineControl: q(0.60) },
      resilience: { distressTolerance: q(0.60), heatTolerance: q(0.50), coldTolerance: q(0.50) },
      control: { fineControl: q(0.60) },
    } as any,
    energy: { reserve_J: 10_000, reserveMax_J: 10_000 },
    loadout: {
      items: itemIds.map((id2) => ({
        id: id2,
        mass_kg: 1000,
        kind: "weapon" as const,
        label: id2,
        handedness: "one-handed" as const,
        reach_m: 1000,
        strikeProfile: { surfaceFrac: q(0.3), internalFrac: q(0.5), structuralFrac: q(0.2), bleedFactor: q(0.1), penetrationBias: q(0.2) },
      } as any)),
    },
    traits: [],
    position_m: { x: 0, y: 0, z: 0 },
    velocity_mps: { x: 0, y: 0, z: 0 },
    intent: { type: "idle" },
    action: {},
    condition: {},
    injury: {
      dead: false, shock: 0, consciousness: SCALE.Q as any, fluidLoss: 0,
      bleedingRate: 0, regions: new Map(), byRegion: {},
    },
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" },
  } as unknown as Entity;
}

// ── transferEquipment ─────────────────────────────────────────────────────────

describe("transferEquipment", () => {
  it("moves all items from deceased to heir", () => {
    const deceased = mkEntity(1, ["sword", "shield"]);
    const heir = mkEntity(2);

    const count = transferEquipment(deceased, heir);

    expect(count).toBe(2);
    expect(heir.loadout.items).toHaveLength(2);
    expect(heir.loadout.items.map((i: any) => i.id)).toContain("sword");
    expect(heir.loadout.items.map((i: any) => i.id)).toContain("shield");
  });

  it("clears deceased's loadout after transfer", () => {
    const deceased = mkEntity(1, ["sword"]);
    const heir = mkEntity(2);

    transferEquipment(deceased, heir);

    expect(deceased.loadout.items).toHaveLength(0);
  });

  it("preserves heir's existing items", () => {
    const deceased = mkEntity(1, ["spear"]);
    const heir = mkEntity(2, ["dagger"]);

    transferEquipment(deceased, heir);

    expect(heir.loadout.items).toHaveLength(2);
    expect(heir.loadout.items.map((i: any) => i.id)).toContain("dagger");
    expect(heir.loadout.items.map((i: any) => i.id)).toContain("spear");
  });

  it("returns 0 when deceased had no items", () => {
    const deceased = mkEntity(1);
    const heir = mkEntity(2);

    const count = transferEquipment(deceased, heir);

    expect(count).toBe(0);
    expect(heir.loadout.items).toHaveLength(0);
  });
});

// ── transferRelationships ─────────────────────────────────────────────────────

describe("transferRelationships", () => {
  it("creates heir relationships at reduced values", () => {
    const graph = createRelationshipGraph();
    // deceased (id=1) knows entity 3 with trust=q(0.80), affinity=q(0.60)
    establishRelationship(graph, 1, 3, 0, q(0.60) as any, q(0.80) as any);

    const created = transferRelationships(graph, 1, 2, q(0.50) as any);

    expect(created).toBe(1);
    const rel = getRelationship(graph, 2, 3);
    expect(rel).toBeDefined();
    // Trust: q(0.80) × q(0.50) / SCALE.Q ≈ q(0.40)
    expect(rel!.trust_Q).toBeLessThan(q(0.80));
    expect(rel!.trust_Q).toBeGreaterThan(0);
  });

  it("transfers at q(1.0) copies full values", () => {
    const graph = createRelationshipGraph();
    establishRelationship(graph, 1, 3, 0, q(0.70) as any, q(0.90) as any);

    transferRelationships(graph, 1, 2, SCALE.Q as any);

    const rel = getRelationship(graph, 2, 3);
    expect(rel!.trust_Q).toBe(q(0.90));
    expect(rel!.affinity_Q).toBe(q(0.70));
  });

  it("transfers at q(0) gives zero values", () => {
    const graph = createRelationshipGraph();
    establishRelationship(graph, 1, 3, 0, q(0.70) as any, q(0.90) as any);

    transferRelationships(graph, 1, 2, q(0) as any);

    const rel = getRelationship(graph, 2, 3);
    expect(rel).toBeDefined();
    expect(rel!.trust_Q).toBe(0);
    expect(rel!.affinity_Q).toBe(0);
  });

  it("preserves sign of negative affinity (enemy)", () => {
    const graph = createRelationshipGraph();
    // deceased hates entity 3
    establishRelationship(graph, 1, 3, 0, (-q(0.80)) as any, q(0.10) as any);

    transferRelationships(graph, 1, 2, q(0.50) as any);

    const rel = getRelationship(graph, 2, 3);
    expect(rel!.affinity_Q).toBeLessThan(0);
  });

  it("does not overwrite existing heir–other relationship", () => {
    const graph = createRelationshipGraph();
    establishRelationship(graph, 1, 3, 0, q(0.60) as any, q(0.80) as any);
    // heir already knows entity 3
    establishRelationship(graph, 2, 3, 0, q(0.20) as any, q(0.30) as any);

    const created = transferRelationships(graph, 1, 2, q(0.50) as any);

    expect(created).toBe(0);
    const rel = getRelationship(graph, 2, 3);
    // Should remain at heir's original values
    expect(rel!.trust_Q).toBe(q(0.30));
  });

  it("returns 0 when deceased has no relationships", () => {
    const graph = createRelationshipGraph();

    const created = transferRelationships(graph, 1, 2, q(0.50) as any);

    expect(created).toBe(0);
  });

  it("transfers multiple relationships", () => {
    const graph = createRelationshipGraph();
    establishRelationship(graph, 1, 3, 0, q(0.50) as any, q(0.70) as any);
    establishRelationship(graph, 1, 4, 0, q(0.40) as any, q(0.60) as any);
    establishRelationship(graph, 1, 5, 0, q(0.30) as any, q(0.50) as any);

    const created = transferRelationships(graph, 1, 2, q(0.50) as any);

    expect(created).toBe(3);
    expect(getRelationship(graph, 2, 3)).toBeDefined();
    expect(getRelationship(graph, 2, 4)).toBeDefined();
    expect(getRelationship(graph, 2, 5)).toBeDefined();
  });
});

// ── transferInventory ─────────────────────────────────────────────────────────

describe("transferInventory", () => {
  it("moves all inventory items from deceased to heir", () => {
    const campaign = createCampaign("c1", []);
    campaign.entityInventories.set(1, new Map([["arrows", 20], ["ration_bar", 3]]));

    const transferred = transferInventory(campaign, 1, 2);

    expect(transferred.get("arrows")).toBe(20);
    expect(transferred.get("ration_bar")).toBe(3);
    const heirInv = campaign.entityInventories.get(2)!;
    expect(heirInv.get("arrows")).toBe(20);
    expect(heirInv.get("ration_bar")).toBe(3);
  });

  it("merges with heir's existing inventory", () => {
    const campaign = createCampaign("c1", []);
    campaign.entityInventories.set(1, new Map([["arrows", 20]]));
    campaign.entityInventories.set(2, new Map([["arrows", 5], ["dagger", 1]]));

    transferInventory(campaign, 1, 2);

    const heirInv = campaign.entityInventories.get(2)!;
    expect(heirInv.get("arrows")).toBe(25);   // merged
    expect(heirInv.get("dagger")).toBe(1);    // preserved
  });

  it("removes deceased's inventory entry after transfer", () => {
    const campaign = createCampaign("c1", []);
    campaign.entityInventories.set(1, new Map([["sword", 1]]));

    transferInventory(campaign, 1, 2);

    expect(campaign.entityInventories.has(1)).toBe(false);
  });

  it("returns empty map when deceased had no inventory", () => {
    const campaign = createCampaign("c1", []);

    const transferred = transferInventory(campaign, 1, 2);

    expect(transferred.size).toBe(0);
  });
});

// ── applyInheritance ──────────────────────────────────────────────────────────

describe("applyInheritance", () => {
  it("registers heir and removes deceased from campaign", () => {
    const deceased = mkEntity(1, ["sword"]);
    const heir = mkEntity(2);
    const campaign = createCampaign("c1", [deceased]);

    applyInheritance(campaign, undefined, { deceasedId: 1, heirId: 2 }, heir);

    expect(campaign.entities.has(1)).toBe(false);
    expect(campaign.entities.has(2)).toBe(true);
  });

  it("transfers equipment via report", () => {
    const deceased = mkEntity(1, ["axe", "helmet"]);
    const heir = mkEntity(2);
    const campaign = createCampaign("c1", [deceased]);

    const report = applyInheritance(campaign, undefined, { deceasedId: 1, heirId: 2 }, heir);

    expect(report.itemsTransferred).toBe(2);
    expect(heir.loadout.items).toHaveLength(2);
  });

  it("transfers inventory via report", () => {
    const deceased = mkEntity(1);
    const heir = mkEntity(2);
    const campaign = createCampaign("c1", [deceased]);
    campaign.entityInventories.set(1, new Map([["ration_bar", 5]]));

    const report = applyInheritance(campaign, undefined, { deceasedId: 1, heirId: 2 }, heir);

    expect(report.inventoryTransferred.get("ration_bar")).toBe(5);
    expect(campaign.entityInventories.get(2)!.get("ration_bar")).toBe(5);
  });

  it("transfers relationships and reports count", () => {
    const deceased = mkEntity(1);
    const heir = mkEntity(2);
    const campaign = createCampaign("c1", [deceased]);
    const graph = createRelationshipGraph();
    establishRelationship(graph, 1, 10, 0, q(0.70) as any, q(0.80) as any);

    const report = applyInheritance(
      campaign,
      graph,
      { deceasedId: 1, heirId: 2, relationshipTransferRate_Q: q(0.50) as any },
      heir,
    );

    expect(report.relationshipsTransferred).toBe(1);
    expect(getRelationship(graph, 2, 10)).toBeDefined();
  });

  it("inherits location from deceased", () => {
    const deceased = mkEntity(1);
    const heir = mkEntity(2);
    const campaign = createCampaign("c1", [deceased]);
    campaign.entityLocations.set(1, "village_inn");

    applyInheritance(campaign, undefined, { deceasedId: 1, heirId: 2 }, heir);

    expect(campaign.entityLocations.get(2)).toBe("village_inn");
    expect(campaign.entityLocations.has(1)).toBe(false);
  });

  it("logs the inheritance event", () => {
    const deceased = mkEntity(1);
    const heir = mkEntity(2);
    const campaign = createCampaign("c1", [deceased]);

    applyInheritance(campaign, undefined, { deceasedId: 1, heirId: 2 }, heir);

    expect(campaign.log.length).toBeGreaterThan(0);
    const lastLog = campaign.log[campaign.log.length - 1]!;
    expect(lastLog.text).toContain("inherits");
    expect(lastLog.text).toContain("2");
    expect(lastLog.text).toContain("1");
  });

  it("uses default transfer rate q(0.50) when not specified", () => {
    const deceased = mkEntity(1);
    const heir = mkEntity(2);
    const campaign = createCampaign("c1", [deceased]);
    const graph = createRelationshipGraph();
    establishRelationship(graph, 1, 99, 0, q(0.80) as any, SCALE.Q as any);

    applyInheritance(campaign, graph, { deceasedId: 1, heirId: 2 }, heir);

    const rel = getRelationship(graph, 2, 99);
    // trust should be ~q(0.50) of SCALE.Q = q(0.50)
    expect(rel!.trust_Q).toBeGreaterThan(0);
    expect(rel!.trust_Q).toBeLessThan(SCALE.Q);
  });

  it("handles deceased not present in campaign gracefully", () => {
    const heir = mkEntity(2);
    const campaign = createCampaign("c1", []);

    const report = applyInheritance(campaign, undefined, { deceasedId: 99, heirId: 2 }, heir);

    expect(report.itemsTransferred).toBe(0);
    expect(campaign.entities.has(2)).toBe(true);
  });

  it("zero relationship transfer rate creates zero-value relationships", () => {
    const deceased = mkEntity(1);
    const heir = mkEntity(2);
    const campaign = createCampaign("c1", [deceased]);
    const graph = createRelationshipGraph();
    establishRelationship(graph, 1, 5, 0, q(0.90) as any, q(0.90) as any);

    applyInheritance(
      campaign,
      graph,
      { deceasedId: 1, heirId: 2, relationshipTransferRate_Q: q(0) as any },
      heir,
    );

    const rel = getRelationship(graph, 2, 5);
    expect(rel!.trust_Q).toBe(0);
    expect(rel!.affinity_Q).toBe(0);
  });
});
