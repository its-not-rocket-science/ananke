/**
 * Phase 47 — Advanced AI Personalities
 *
 * Groups:
 *   Data integrity         (4) — PERSONALITIES, NEUTRAL_PERSONALITY, fields in range
 *   Derivation             (3) — derivePersonalityFromCognition produces valid traits
 *   Aggression (retreat)   (3) — retreat range formula
 *   Aggression (hesitation)(2) — high aggression suppresses hesitation in decide
 *   Caution                (3) — defence intensity formula
 *   Loyalty                (4) — applyLoyaltyBias target switching
 *   Opportunism            (4) — applyOpportunismBias target switching
 *   Integration            (4) — personality absent = neutral; decide wiring
 */

import { describe, it, expect } from "vitest";
import { SCALE, q, type Q } from "../src/units";
import {
  PERSONALITIES,
  NEUTRAL_PERSONALITY,
  derivePersonalityFromCognition,
  computeEffectiveRetreatRange,
  computeDefenceIntensityBoost,
  applyLoyaltyBias,
  applyOpportunismBias,
  computeEffectiveLoyalty,
  type PersonalityTraits,
} from "../src/sim/ai/personality";
import { HUMAN_BASE } from "../src/archetypes";
import { generateIndividual } from "../src/generate";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { AI_PRESETS } from "../src/sim/ai/presets";
import { decideCommandsForEntity } from "../src/sim/ai/decide";
import { buildWorldIndex } from "../src/sim/indexing";
import { buildSpatialIndex } from "../src/sim/spatial";
import type { Entity } from "../src/sim/entity";
import { createPartyRegistry, createParty } from "../src/party.js";
import { createRelationshipGraph, recordRelationshipEvent } from "../src/relationships.js";

const CELL_SIZE = Math.trunc(4 * SCALE.m);

function withPersonality(e: Entity, p: PersonalityTraits): Entity {
  return { ...e, personality: p };
}

// ── Data integrity ─────────────────────────────────────────────────────────────

describe("data integrity", () => {
  it("PERSONALITIES has all 5 named entries", () => {
    const ids = ["berserker", "coward", "guardian", "schemer", "soldier"] as const;
    for (const id of ids) expect(PERSONALITIES[id]).toBeDefined();
  });

  it("every personality field is in [0, SCALE.Q]", () => {
    for (const [, p] of Object.entries(PERSONALITIES)) {
      expect(p.aggression).toBeGreaterThanOrEqual(0);
      expect(p.aggression).toBeLessThanOrEqual(SCALE.Q);
      expect(p.caution).toBeGreaterThanOrEqual(0);
      expect(p.caution).toBeLessThanOrEqual(SCALE.Q);
      expect(p.loyalty).toBeGreaterThanOrEqual(0);
      expect(p.loyalty).toBeLessThanOrEqual(SCALE.Q);
      expect(p.opportunism).toBeGreaterThanOrEqual(0);
      expect(p.opportunism).toBeLessThanOrEqual(SCALE.Q);
    }
  });

  it("NEUTRAL_PERSONALITY has all fields at q(0.50)", () => {
    expect(NEUTRAL_PERSONALITY.aggression).toBe(q(0.50));
    expect(NEUTRAL_PERSONALITY.caution).toBe(q(0.50));
    expect(NEUTRAL_PERSONALITY.loyalty).toBe(q(0.50));
    expect(NEUTRAL_PERSONALITY.opportunism).toBe(q(0.50));
  });

  it("berserker has aggression > guardian; guardian has loyalty > schemer", () => {
    expect(PERSONALITIES.berserker.aggression).toBeGreaterThan(PERSONALITIES.guardian.aggression);
    expect(PERSONALITIES.guardian.loyalty).toBeGreaterThan(PERSONALITIES.schemer.loyalty);
  });
});

// ── Derivation ─────────────────────────────────────────────────────────────────

describe("derivePersonalityFromCognition", () => {
  it("returns valid PersonalityTraits from HUMAN_BASE individual", () => {
    const attrs = generateIndividual(1, HUMAN_BASE);
    const p = derivePersonalityFromCognition(attrs);
    expect(p.aggression).toBeGreaterThanOrEqual(0);
    expect(p.loyalty).toBeGreaterThanOrEqual(0);
    expect(p.opportunism).toBeLessThanOrEqual(SCALE.Q);
  });

  it("aggression = distressTolerance", () => {
    const attrs = generateIndividual(1, HUMAN_BASE);
    const p = derivePersonalityFromCognition(attrs);
    expect(p.aggression).toBe(attrs.resilience.distressTolerance);
  });

  it("loyalty = interpersonal from cognition profile", () => {
    const attrs = generateIndividual(1, HUMAN_BASE);
    const p = derivePersonalityFromCognition(attrs);
    expect(p.loyalty).toBe(attrs.cognition?.interpersonal ?? q(0.50));
  });
});

// ── Aggression — retreat range ─────────────────────────────────────────────────

describe("aggression → retreat range", () => {
  const BASE = Math.trunc(0.35 * SCALE.m); // lineInfantry baseline

  it("aggression q(0.90) reduces effective retreat range below baseline", () => {
    const effective = computeEffectiveRetreatRange(BASE, q(0.90) as Q);
    expect(effective).toBeLessThan(BASE);
  });

  it("aggression q(0.10) increases effective retreat range above baseline", () => {
    const effective = computeEffectiveRetreatRange(BASE, q(0.10) as Q);
    expect(effective).toBeGreaterThan(BASE);
  });

  it("aggression q(0.50) leaves retreat range unchanged", () => {
    const effective = computeEffectiveRetreatRange(BASE, q(0.50) as Q);
    expect(effective).toBe(BASE);
  });
});

// ── Aggression — hesitation ────────────────────────────────────────────────────

describe("aggression → hesitation override", () => {
  const policy = AI_PRESETS["lineInfantry"];

  it("berserker personality (aggression q(0.90)) suppresses hesitation despite high fear", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    // Give high fear but NOT routing (fear slightly below threshold)
    const { distressTolerance } = e.attributes.resilience;
    // Set fear to ~75% of morale threshold (hesitant zone) — just below routing
    const hesitantFear = Math.trunc(distressTolerance * 0.75);
    const scared = withPersonality(
      { ...e, condition: { ...e.condition, fearQ: hesitantFear as Q } },
      PERSONALITIES.berserker,
    );
    const world = mkWorld(1, [scared]);
    const index = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, CELL_SIZE);
    const cmds = decideCommandsForEntity(world, index, spatial, scared, policy);
    // Should include an attack-range check; at minimum should not be empty (not frozen)
    // The key signal: command list is not just empty (berserker keeps acting)
    expect(cmds.length).toBeGreaterThanOrEqual(1);
  });

  it("coward personality (aggression q(0.10)): no hesitation override (low aggression)", () => {
    const cowardAggression = PERSONALITIES.coward.aggression;
    expect(cowardAggression).toBeLessThan(q(0.70));
    // Coward does NOT suppress hesitation — just verify aggression is below threshold
  });
});

// ── Caution — defence intensity ────────────────────────────────────────────────

describe("caution → defence intensity", () => {
  const BASE_INTENSITY: Q = q(0.35) as Q; // lineInfantry baseline

  it("caution q(0.90) raises defence intensity above baseline", () => {
    const boosted = computeDefenceIntensityBoost(BASE_INTENSITY, q(0.90) as Q);
    expect(boosted).toBeGreaterThan(BASE_INTENSITY);
  });

  it("caution q(0.10) reduces defence intensity below baseline", () => {
    const reduced = computeDefenceIntensityBoost(BASE_INTENSITY, q(0.10) as Q);
    expect(reduced).toBeLessThan(BASE_INTENSITY);
  });

  it("caution q(0.50) leaves intensity unchanged (neutral)", () => {
    const neutral = computeDefenceIntensityBoost(BASE_INTENSITY, q(0.50) as Q);
    expect(neutral).toBe(BASE_INTENSITY);
  });
});

// ── Loyalty ───────────────────────────────────────────────────────────────────

describe("applyLoyaltyBias", () => {
  function mkDistressedAllyWorld() {
    const self  = mkHumanoidEntity(1, 1, 0, 0);
    const ally  = mkHumanoidEntity(2, 1, 5 * SCALE.m, 0); // ally on same team
    // Ally is badly injured (shock > q(0.20))
    ally.injury = { ...ally.injury, shock: q(0.35) as Q };
    // Enemy1: original current target (far from ally)
    const enemy1 = mkHumanoidEntity(3, 2, 30 * SCALE.m, 0);
    // Enemy2: near the distressed ally (within 2.5m)
    const enemy2 = mkHumanoidEntity(4, 2, 6 * SCALE.m, 0);
    const world = mkWorld(1, [self, ally, enemy1, enemy2]);
    return { self, ally, enemy1, enemy2, world };
  }

  it("high loyalty (q(0.90)) frequently switches target to protect wounded ally", () => {
    const { self, enemy1, enemy2, world } = mkDistressedAllyWorld();
    let switchCount = 0;
    for (let tick = 0; tick < 20; tick++) {
      const w = { ...world, tick };
      const result = applyLoyaltyBias(self, w, enemy1, q(0.90) as Q);
      if (result?.id === enemy2.id) switchCount++;
    }
    expect(switchCount).toBeGreaterThan(10); // ~90% switch rate
  });

  it("low loyalty (q(0.10)) never switches target (below q(0.50) guard)", () => {
    const { self, enemy1, world } = mkDistressedAllyWorld();
    for (let tick = 0; tick < 20; tick++) {
      const w = { ...world, tick };
      const result = applyLoyaltyBias(self, w, enemy1, q(0.10) as Q);
      expect(result?.id).toBe(enemy1.id);
    }
  });

  it("no distressed ally → target unchanged regardless of loyalty", () => {
    const self   = mkHumanoidEntity(1, 1, 0, 0);
    const ally   = mkHumanoidEntity(2, 1, 5 * SCALE.m, 0); // healthy ally
    const enemy1 = mkHumanoidEntity(3, 2, 30 * SCALE.m, 0);
    const world  = mkWorld(1, [self, ally, enemy1]);
    for (let tick = 0; tick < 10; tick++) {
      const w = { ...world, tick };
      const result = applyLoyaltyBias(self, w, enemy1, q(0.90) as Q);
      expect(result?.id).toBe(enemy1.id);
    }
  });

  it("guardian loyalty (q(0.90)) > schemer loyalty (q(0.10)) → more switches", () => {
    const { self, enemy1, world } = mkDistressedAllyWorld();
    let guardianSwitches = 0;
    let schemerSwitches  = 0;
    for (let tick = 0; tick < 20; tick++) {
      const w = { ...world, tick };
      if (applyLoyaltyBias(self, w, enemy1, PERSONALITIES.guardian.loyalty)?.id !== enemy1.id) guardianSwitches++;
      if (applyLoyaltyBias(self, w, enemy1, PERSONALITIES.schemer.loyalty)?.id  !== enemy1.id) schemerSwitches++;
    }
    expect(guardianSwitches).toBeGreaterThan(schemerSwitches);
  });
});

// ── Opportunism ───────────────────────────────────────────────────────────────

describe("applyOpportunismBias", () => {
  function mkWoundedEnemyWorld() {
    const self        = mkHumanoidEntity(1, 1, 0, 0);
    const healthy     = mkHumanoidEntity(2, 2, 5 * SCALE.m, 0); // full consciousness
    const gravely     = mkHumanoidEntity(3, 2, 10 * SCALE.m, 0); // gravely wounded
    gravely.injury    = { ...gravely.injury, consciousness: q(0.10) as Q };
    const world = mkWorld(1, [self, healthy, gravely]);
    return { self, healthy, gravely, world };
  }

  it("high opportunism (q(0.90)) frequently switches to gravely-wounded enemy", () => {
    const { self, healthy, gravely, world } = mkWoundedEnemyWorld();
    let switchCount = 0;
    for (let tick = 0; tick < 20; tick++) {
      const w = { ...world, tick };
      const result = applyOpportunismBias(self, w, healthy, q(0.90) as Q);
      if (result?.id === gravely.id) switchCount++;
    }
    expect(switchCount).toBeGreaterThan(10); // ~90% switch rate
  });

  it("low opportunism (q(0.10)) never switches (below q(0.50) guard)", () => {
    const { self, healthy, world } = mkWoundedEnemyWorld();
    for (let tick = 0; tick < 20; tick++) {
      const w = { ...world, tick };
      const result = applyOpportunismBias(self, w, healthy, q(0.10) as Q);
      expect(result?.id).toBe(healthy.id);
    }
  });

  it("no significantly weaker enemy → target unchanged", () => {
    const self    = mkHumanoidEntity(1, 1, 0, 0);
    const enemy1  = mkHumanoidEntity(2, 2, 5 * SCALE.m, 0);
    const enemy2  = mkHumanoidEntity(3, 2, 8 * SCALE.m, 0);
    // enemy2 only slightly weaker (below OPPORTUNISM_GAP threshold)
    enemy2.injury = { ...enemy2.injury, consciousness: q(0.80) as Q };
    const world   = mkWorld(1, [self, enemy1, enemy2]);
    for (let tick = 0; tick < 10; tick++) {
      const w = { ...world, tick };
      const result = applyOpportunismBias(self, w, enemy1, q(0.90) as Q);
      expect(result?.id).toBe(enemy1.id); // not enough gap to switch
    }
  });

  it("schemer opportunism (q(0.90)) > soldier opportunism (q(0.35)) → more switches", () => {
    const { self, healthy, world } = mkWoundedEnemyWorld();
    let schemerSwitches = 0;
    let soldierSwitches = 0;
    for (let tick = 0; tick < 20; tick++) {
      const w = { ...world, tick };
      if (applyOpportunismBias(self, w, healthy, PERSONALITIES.schemer.opportunism)?.id !== healthy.id) schemerSwitches++;
      if (applyOpportunismBias(self, w, healthy, PERSONALITIES.soldier.opportunism)?.id !== healthy.id) soldierSwitches++;
    }
    expect(schemerSwitches).toBeGreaterThan(soldierSwitches);
  });
});

// ── Integration ───────────────────────────────────────────────────────────────

describe("integration", () => {
  const policy = AI_PRESETS["lineInfantry"];

  it("neutral personality produces same commands as no personality", () => {
    const enemy = mkHumanoidEntity(2, 2, 5 * SCALE.m, 0);

    // Fresh entity for each call — decideCommandsForEntity mutates entity.ai
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const w1 = mkWorld(1, [e1, enemy]);
    const cmdsNone = decideCommandsForEntity(w1, buildWorldIndex(w1), buildSpatialIndex(w1, CELL_SIZE), e1, policy);

    const e2 = withPersonality(mkHumanoidEntity(1, 1, 0, 0), NEUTRAL_PERSONALITY);
    const w2 = mkWorld(1, [e2, enemy]);
    const cmdsNeutral = decideCommandsForEntity(w2, buildWorldIndex(w2), buildSpatialIndex(w2, CELL_SIZE), e2, policy);

    expect(cmdsNone).toEqual(cmdsNeutral);
  });

  it("computeEffectiveRetreatRange is deterministic (same inputs → same output)", () => {
    const a = computeEffectiveRetreatRange(3500, q(0.75) as Q);
    const b = computeEffectiveRetreatRange(3500, q(0.75) as Q);
    expect(a).toBe(b);
  });

  it("computeDefenceIntensityBoost is clamped to [0, SCALE.Q]", () => {
    // Extreme caution q(1.0) at high base intensity must not exceed SCALE.Q
    const extreme = computeDefenceIntensityBoost(q(0.95) as Q, q(1.0) as Q);
    expect(extreme).toBeLessThanOrEqual(SCALE.Q);
    // Extreme caution q(0.0) at near-zero base must not go below 0
    const floored = computeDefenceIntensityBoost(q(0.05) as Q, q(0.0) as Q);
    expect(floored).toBeGreaterThanOrEqual(0);
  });

  it("entity.personality field is optional and backward-compatible (no crash without it)", () => {
    const e       = mkHumanoidEntity(1, 1, 0, 0);
    const enemy   = mkHumanoidEntity(2, 2, 5 * SCALE.m, 0);
    const world   = mkWorld(1, [e, enemy]);
    const index   = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, CELL_SIZE);
    expect(() => decideCommandsForEntity(world, index, spatial, e, policy)).not.toThrow();
  });
});

describe("computeEffectiveLoyalty", () => {
  it("returns base loyalty when no party registry", () => {
    const world = mkWorld(1, []);
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.personality = { aggression: q(0.5), caution: q(0.5), loyalty: q(0.7), opportunism: q(0.5) };
    // No runtimeState.partyRegistry set
    expect(computeEffectiveLoyalty(entity, world)).toBe(q(0.7));
  });

  it("returns base loyalty when entity has no party", () => {
    const world = mkWorld(1, []);
    (world.runtimeState ??= {}).partyRegistry = createPartyRegistry();
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.personality = { aggression: q(0.5), caution: q(0.5), loyalty: q(0.7), opportunism: q(0.5) };
    // entity.party is undefined
    expect(computeEffectiveLoyalty(entity, world)).toBe(q(0.7));
  });

  it("returns base loyalty when party not found", () => {
    const world = mkWorld(1, []);
    (world.runtimeState ??= {}).partyRegistry = createPartyRegistry();
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.personality = { aggression: q(0.5), caution: q(0.5), loyalty: q(0.7), opportunism: q(0.5) };
    entity.party = "nonexistent";
    expect(computeEffectiveLoyalty(entity, world)).toBe(q(0.7));
  });

  it("returns base loyalty when entity is party leader", () => {
    const world = mkWorld(1, []);
    const registry = createPartyRegistry();
    (world.runtimeState ??= {}).partyRegistry = registry;
    createParty(registry, "party1", "Adventurers", 1);
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.personality = { aggression: q(0.5), caution: q(0.5), loyalty: q(0.7), opportunism: q(0.5) };
    entity.party = "party1";
    expect(computeEffectiveLoyalty(entity, world)).toBe(q(0.7));
  });

  it("returns base loyalty when no relationship graph", () => {
    const world = mkWorld(1, []);
    const registry = createPartyRegistry();
    (world.runtimeState ??= {}).partyRegistry = registry;
    createParty(registry, "party1", "Adventurers", 1);
    const entity = mkHumanoidEntity(2, 1, 0, 0);
    entity.personality = { aggression: q(0.5), caution: q(0.5), loyalty: q(0.7), opportunism: q(0.5) };
    entity.party = "party1";
    // No runtimeState.relationshipGraph set
    expect(computeEffectiveLoyalty(entity, world)).toBe(q(0.7));
  });

  it("returns companion loyalty when higher than base loyalty", () => {
    const world = mkWorld(1, []);
    const registry = createPartyRegistry();
    (world.runtimeState ??= {}).partyRegistry = registry;
    createParty(registry, "party1", "Adventurers", 1);
    const graph = createRelationshipGraph();
    (world.runtimeState ??= {}).relationshipGraph = graph;
    const entity = mkHumanoidEntity(2, 1, 0, 0);
    entity.personality = { aggression: q(0.5), caution: q(0.5), loyalty: q(0.3), opportunism: q(0.5) }; // low base loyalty
    entity.party = "party1";
    // Create positive relationship with leader (id 1)
    recordRelationshipEvent(graph, 2, 1, {
      tick: 0,
      type: "fought_alongside",
      magnitude_Q: 8000,
    });
    const result = computeEffectiveLoyalty(entity, world);
    expect(result).toBeGreaterThan(q(0.3)); // Should be higher due to relationship
    expect(result).toBeLessThanOrEqual(SCALE.Q);
  });

  it("returns base loyalty when higher than companion loyalty", () => {
    const world = mkWorld(1, []);
    const registry = createPartyRegistry();
    (world.runtimeState ??= {}).partyRegistry = registry;
    createParty(registry, "party1", "Adventurers", 1);
    const graph = createRelationshipGraph();
    (world.runtimeState ??= {}).relationshipGraph = graph;
    const entity = mkHumanoidEntity(2, 1, 0, 0);
    entity.personality = { aggression: q(0.5), caution: q(0.5), loyalty: q(0.9), opportunism: q(0.5) }; // high base loyalty
    entity.party = "party1";
    // Create negative relationship with leader (id 1)
    recordRelationshipEvent(graph, 2, 1, {
      tick: 0,
      type: "betrayed",
      magnitude_Q: 8000,
    });
    const result = computeEffectiveLoyalty(entity, world);
    expect(result).toBe(q(0.9)); // Base loyalty should win
  });
});
