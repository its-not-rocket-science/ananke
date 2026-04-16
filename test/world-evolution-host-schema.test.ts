import { describe, expect, it } from "vitest";
import { q } from "../src/units.js";
import {
  fromAnankeEvolutionState,
  normalizeHostWorldInput,
  toAnankeEvolutionState,
  validateWorldEvolutionInput,
  type WorldEvolutionInput,
} from "../src/world-evolution-backend/host-schema.js";

function makeHostInput(): WorldEvolutionInput {
  return {
    worldSeed: 77,
    tick: 5,
    entities: [
      {
        kind: "settlement",
        id: "s.capital",
        name: "Capital",
        polityId: "p.alpha",
        population: 30_000,
        metadata: { districtCount: 12 },
      },
      {
        kind: "polity",
        id: "p.beta",
        name: "Beta League",
        controlledSettlementIds: ["s.port"],
        population: 45_000,
        treasury_cu: 12_000,
      },
      {
        kind: "polity",
        id: "p.alpha",
        name: "Alpha Republic",
        controlledSettlementIds: ["s.capital"],
        treasury_cu: 50_000,
        governanceType: "republic",
        activeLawIds: ["rule_of_law"],
        metadata: { lore: "old-marsh-kingdom" },
      },
      {
        kind: "region",
        id: "r.heartland",
        name: "Heartland",
        polityId: "p.alpha",
        population: 70_000,
      },
    ],
    relationships: [
      {
        id: "route.alpha-beta",
        kind: "trade_route",
        sourceId: "p.alpha",
        targetId: "p.beta",
        baseVolume_cu: 25_000,
        routeQualityQ: q(0.8),
      },
      {
        id: "border.alpha-beta",
        kind: "border",
        sourceId: "p.alpha",
        targetId: "p.beta",
        sharedBorderCount: 2,
        routeQualityQ: q(0.7),
      },
      {
        id: "treaty.alpha-beta",
        kind: "treaty",
        sourceId: "p.alpha",
        targetId: "p.beta",
        treatyType: "trade_pact",
        treatyStrength_Q: q(0.6),
      },
      {
        id: "war.beta-alpha",
        kind: "war",
        sourceId: "p.beta",
        targetId: "p.alpha",
      },
    ],
    resources: [
      { id: "res.iron.1", polityId: "p.alpha", resourceType: "iron", stock: 9_000 },
    ],
    hostMetadata: { setting: "demo" },
  };
}

describe("world-evolution host schema", () => {
  it("normalizes deterministically regardless of input ordering", () => {
    const input = makeHostInput();
    const shuffled = {
      ...input,
      entities: [...input.entities].reverse(),
      relationships: [...(input.relationships ?? [])].reverse(),
      resources: [...(input.resources ?? [])].reverse(),
    };

    expect(normalizeHostWorldInput(shuffled)).toEqual(normalizeHostWorldInput(input));
  });

  it("validates and emits deterministic path-based validation errors", () => {
    const errors = validateWorldEvolutionInput({
      worldSeed: 77,
      entities: [
        { kind: "polity", id: "p.a", name: "A" },
        { kind: "polity", id: "p.a", name: "B" },
      ],
      relationships: [
        { id: "r.1", kind: "trade_route", sourceId: "p.a", targetId: "p.unknown" },
      ],
    });

    expect(errors).toEqual([
      {
        code: "duplicate_entity_id",
        path: "$.entities[1].id",
        message: "duplicate entity id 'p.a'",
      },
      {
        code: "invalid_trade_base_volume",
        path: "$.relationships[0].baseVolume_cu",
        message: "trade_route requires baseVolume_cu >= 0",
      },
      {
        code: "unknown_relationship_target",
        path: "$.relationships[0].targetId",
        message: "unknown entity 'p.unknown'",
      },
    ]);
  });

  it("round-trips host input through Ananke snapshot adapters", () => {
    const input = makeHostInput();
    const { snapshot, context } = toAnankeEvolutionState(input);

    expect(snapshot.polities).toHaveLength(2);
    const alpha = snapshot.polities.find((p) => p.id === "p.alpha");
    expect(alpha?.population).toBe(100_000);

    const roundTripped = fromAnankeEvolutionState(snapshot, context);

    expect(roundTripped.worldSeed).toBe(input.worldSeed);
    expect(roundTripped.entities.filter((e) => e.kind === "polity")).toHaveLength(2);
    expect(roundTripped.resources).toEqual(input.resources);
    const alphaEntity = roundTripped.entities.find((e) => e.kind === "polity" && e.id === "p.alpha");
    expect(alphaEntity).toMatchObject({
      metadata: { lore: "old-marsh-kingdom" },
    });
  });
});
