// test/golden-fixtures.test.ts — Determinism regression tests
//
// These tests load pre-committed fixture files and verify that the engine
// still produces byte-identical results for the same inputs.
//
// If a test fails it means the engine's deterministic output has changed —
// either intentionally (update the fixtures with `npm run generate-fixtures`)
// or as an accidental regression (find and fix the source of non-determinism).
//
// Do NOT mock or stub anything in this file.  The whole point is to run the
// real engine against real recorded data.

import { describe, it, expect } from "vitest";
import { readFileSync }         from "node:fs";
import { q, type Q }            from "../src/units.js";
import { deserializeReplay, replayTo } from "../src/replay.js";
import { deserialiseCampaign, serialiseCampaign } from "../src/campaign.js";
import type { KernelContext } from "../src/sim/context.js";

const ctx: KernelContext = { tractionCoeff: q(0.90) as Q };

// ── Replay fixture ─────────────────────────────────────────────────────────────

describe("golden replay — Knight vs Brawler", () => {
  const raw      = readFileSync("fixtures/replay-knight-brawler.json", "utf8");
  const fixture  = JSON.parse(raw) as {
    version:  string;
    expected: {
      finalTick:            number;
      knightDead:           boolean;
      knightShock:          number;
      knightConsciousness:  number;
      brawlerDead:          boolean;
      brawlerShock:         number;
      brawlerConsciousness: number;
    };
    replay: unknown;
  };

  const replay   = deserializeReplay(JSON.stringify(fixture.replay));
  const lastTick = fixture.expected.finalTick;
  const world    = replayTo(replay, lastTick, ctx);
  const knight   = world.entities.find(e => e.id === 1)!;
  const brawler  = world.entities.find(e => e.id === 2)!;
  const exp      = fixture.expected;

  it("fixture version is current engine version", () => {
    expect(fixture.version).toBe("0.1.0");
  });

  it("replay reaches the recorded final tick", () => {
    expect(world.tick).toBe(exp.finalTick);
  });

  it("knight survival matches fixture", () => {
    expect(knight.injury.dead).toBe(exp.knightDead);
  });

  it("knight shock matches fixture exactly (fixed-point)", () => {
    expect(knight.injury.shock).toBe(exp.knightShock);
  });

  it("knight consciousness matches fixture exactly", () => {
    expect(knight.injury.consciousness).toBe(exp.knightConsciousness);
  });

  it("brawler death matches fixture", () => {
    expect(brawler.injury.dead).toBe(exp.brawlerDead);
  });

  it("brawler shock matches fixture exactly (fixed-point)", () => {
    expect(brawler.injury.shock).toBe(exp.brawlerShock);
  });

  it("brawler consciousness matches fixture exactly", () => {
    expect(brawler.injury.consciousness).toBe(exp.brawlerConsciousness);
  });

  it("replaying twice from the same fixture gives identical results", () => {
    const world2  = replayTo(replay, lastTick, ctx);
    const knight2 = world2.entities.find(e => e.id === 1)!;
    const brawler2 = world2.entities.find(e => e.id === 2)!;
    expect(knight2.injury.shock).toBe(knight.injury.shock);
    expect(knight2.injury.consciousness).toBe(knight.injury.consciousness);
    expect(brawler2.injury.shock).toBe(brawler.injury.shock);
    expect(brawler2.injury.dead).toBe(brawler.injury.dead);
  });
});

// ── Campaign save fixture ──────────────────────────────────────────────────────

describe("golden campaign save — round-trip v1", () => {
  const raw     = readFileSync("fixtures/campaign-save-v1.json", "utf8");
  const fixture = JSON.parse(raw) as { version: string; save: unknown };

  it("fixture version is current engine version", () => {
    expect(fixture.version).toBe("0.1.0");
  });

  it("campaign deserialises without throwing", () => {
    expect(() => deserialiseCampaign(JSON.stringify(fixture.save))).not.toThrow();
  });

  it("campaign round-trips: serialise → deserialise → re-serialise produces identical JSON", () => {
    const campaign    = deserialiseCampaign(JSON.stringify(fixture.save));
    const firstPass   = serialiseCampaign(campaign);
    const campaign2   = deserialiseCampaign(firstPass);
    const secondPass  = serialiseCampaign(campaign2);
    expect(secondPass).toBe(firstPass);
  });

  it("deserialised campaign has the correct location count", () => {
    const campaign = deserialiseCampaign(JSON.stringify(fixture.save));
    expect(campaign.locations.size).toBe(2);
  });

  it("deserialised campaign preserves travelCost Map", () => {
    const campaign = deserialiseCampaign(JSON.stringify(fixture.save));
    const keep     = campaign.locations.get("loc_keep")!;
    expect(keep.travelCost.get("loc_village")).toBe(3600);
  });

  it("deserialised campaign has the correct entity count", () => {
    const campaign = deserialiseCampaign(JSON.stringify(fixture.save));
    expect(campaign.entities.size).toBe(1);
  });

  it("worldTime_s starts at 0", () => {
    const campaign = deserialiseCampaign(JSON.stringify(fixture.save));
    expect(campaign.worldTime_s).toBe(0);
  });
});
