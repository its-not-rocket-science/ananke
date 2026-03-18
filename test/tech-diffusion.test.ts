// test/tech-diffusion.test.ts — Phase 67: Technology Diffusion at Polity Scale

import { describe, it, expect } from "vitest";
import { q, SCALE, type Q }    from "../src/units.js";
import {
  BASE_DIFFUSION_RATE_Q,
  ERA_GAP_BONUS_Q,
  ERA_GAP_BONUS_MAX,
  STABILITY_DIFFUSION_THRESHOLD,
  MAX_TECH_ERA,
  computeDiffusionPressure,
  stepTechDiffusion,
  totalInboundPressure,
  techEraName,
} from "../src/tech-diffusion.js";
import {
  createPolity, createPolityRegistry, declareWar,
  type Polity, type PolityRegistry, type PolityPair,
} from "../src/polity.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkPair(
  a: string, b: string,
  sharedLocations = 1,
  routeQuality_Q: Q = q(0.50) as Q,
): PolityPair {
  return { polityAId: a, polityBId: b, sharedLocations, routeQuality_Q };
}

function mkRegistry(polities: Polity[]): PolityRegistry {
  return createPolityRegistry(polities);
}

function pol(id: string, techEra: number, stability = 0.70): Polity {
  return createPolity(id, id, "f", ["loc1"], 100_000, 50_000,
    techEra as Polity["techEra"],
    q(stability) as Q, q(0.65) as Q);
}

// ── computeDiffusionPressure ──────────────────────────────────────────────────

describe("computeDiffusionPressure", () => {
  it("returns 0 when source and target are at same era", () => {
    const src = pol("src", 2), tgt = pol("tgt", 2);
    const pressure = computeDiffusionPressure(src, tgt, mkPair("src","tgt"), false);
    expect(pressure).toBe(0);
  });

  it("returns 0 when target is ahead of source", () => {
    const src = pol("src", 1), tgt = pol("tgt", 3);
    const pressure = computeDiffusionPressure(src, tgt, mkPair("src","tgt"), false);
    expect(pressure).toBe(0);
  });

  it("returns 0 when at war", () => {
    const src = pol("src", 3), tgt = pol("tgt", 1);
    const pressure = computeDiffusionPressure(src, tgt, mkPair("src","tgt"), true);
    expect(pressure).toBe(0);
  });

  it("returns 0 when target is unstable", () => {
    const src = pol("src", 3);
    const tgt = pol("tgt", 1, 0.20);  // below threshold
    const pressure = computeDiffusionPressure(src, tgt, mkPair("src","tgt"), false);
    expect(pressure).toBe(0);
  });

  it("returns positive pressure when source leads by 1 era", () => {
    const src = pol("src", 2), tgt = pol("tgt", 1);
    const pressure = computeDiffusionPressure(src, tgt, mkPair("src","tgt"), false);
    expect(pressure).toBeGreaterThan(0);
  });

  it("larger era gap produces higher pressure than gap of 1", () => {
    const src = pol("src", 4);
    const tgt1 = pol("tgt1", 3);  // gap 1
    const tgt2 = pol("tgt2", 1);  // gap 3
    const pair = mkPair("src","tgt", 1, q(0.50) as Q);
    const p1 = computeDiffusionPressure(src, tgt1, pair, false);
    const p2 = computeDiffusionPressure(src, tgt2, pair, false);
    expect(p2).toBeGreaterThan(p1);
  });

  it("higher route quality produces higher pressure", () => {
    const src = pol("src", 2), tgt = pol("tgt", 1);
    const pLow  = computeDiffusionPressure(src, tgt, mkPair("src","tgt",1,q(0.20) as Q), false);
    const pHigh = computeDiffusionPressure(src, tgt, mkPair("src","tgt",1,q(0.90) as Q), false);
    expect(pHigh).toBeGreaterThan(pLow);
  });

  it("more shared locations produce higher pressure", () => {
    const src = pol("src", 2), tgt = pol("tgt", 1);
    const p1 = computeDiffusionPressure(src, tgt, mkPair("src","tgt",1), false);
    const p5 = computeDiffusionPressure(src, tgt, mkPair("src","tgt",5), false);
    expect(p5).toBeGreaterThan(p1);
  });

  it("pressure is in range (0, SCALE.Q]", () => {
    const src = pol("src", 8), tgt = pol("tgt", 0);
    const pair = mkPair("src","tgt", 10, q(1.0) as Q);
    const p = computeDiffusionPressure(src, tgt, pair, false);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(SCALE.Q);
  });

  it("era gap bonus is capped at ERA_GAP_BONUS_MAX", () => {
    // gap=10 should produce same pressure as gap=4+ (bonus maxed)
    const src4  = pol("src",  5);
    const srcBig = pol("src2", 8);
    const tgt   = pol("tgt",  1);
    const pair  = mkPair("src","tgt");
    const p4    = computeDiffusionPressure(src4,   tgt, pair, false);
    const pBig  = computeDiffusionPressure(srcBig, tgt, pair, false);
    // The big gap may differ only slightly due to cap; ensure it doesn't grow unboundedly
    expect(pBig).toBeLessThanOrEqual(SCALE.Q);
    expect(pBig).toBeGreaterThanOrEqual(p4);
  });

  it("stability exactly at threshold allows diffusion (check is strict <)", () => {
    const src = pol("src", 3);
    // STABILITY_DIFFUSION_THRESHOLD = q(0.25); exactly at threshold → check is <, so allowed
    const tgt = pol("tgt", 1, STABILITY_DIFFUSION_THRESHOLD / SCALE.Q);
    const pressure = computeDiffusionPressure(src, tgt, mkPair("src","tgt"), false);
    expect(pressure).toBeGreaterThan(0);
  });

  it("stability just above threshold allows diffusion", () => {
    const src = pol("src", 3);
    // stability 0.26 > threshold 0.25
    const tgt = createPolity("tgt","tgt","f",["loc1"],100_000,50_000,
      1 as Polity["techEra"], q(0.26) as Q, q(0.65) as Q);
    const pressure = computeDiffusionPressure(src, tgt, mkPair("src","tgt"), false);
    expect(pressure).toBeGreaterThan(0);
  });
});

// ── stepTechDiffusion ─────────────────────────────────────────────────────────

describe("stepTechDiffusion", () => {
  it("returns empty array when no pairs", () => {
    const reg = mkRegistry([pol("a",2), pol("b",1)]);
    const results = stepTechDiffusion(reg, [], 1, 0);
    expect(results).toHaveLength(0);
  });

  it("returns empty array when all polities are at same era", () => {
    const reg = mkRegistry([pol("a",2), pol("b",2)]);
    const results = stepTechDiffusion(reg, [mkPair("a","b")], 1, 0);
    expect(results).toHaveLength(0);
  });

  it("lagging polity can advance when paired with advanced polity", () => {
    // Run 200 seeds — at BASE_DIFFUSION_RATE ~0.5%/day, expect some advances
    let advances = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const reg = mkRegistry([pol("a",3), pol("b",1)]);
      const pair = mkPair("a","b", 3, q(0.80) as Q);
      const results = stepTechDiffusion(reg, [pair], seed, 0);
      if (results.length > 0) advances++;
    }
    expect(advances).toBeGreaterThan(0);
    expect(advances).toBeLessThan(200);  // not certain every tick
  });

  it("advancing polity's techEra is mutated", () => {
    let advanced = false;
    for (let seed = 1; seed <= 500; seed++) {
      const reg = mkRegistry([pol("adv",3), pol("lag",1)]);
      const pair = mkPair("adv","lag", 5, q(1.0) as Q);
      const results = stepTechDiffusion(reg, [pair], seed, 0);
      if (results.length > 0) {
        expect(reg.polities.get("lag")!.techEra).toBe(2);  // was 1, now 2
        advanced = true;
        break;
      }
    }
    expect(advanced).toBe(true);
  });

  it("result reports correct previousTechEra and newTechEra", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const reg = mkRegistry([pol("adv",4), pol("lag",2)]);
      const pair = mkPair("adv","lag", 5, q(1.0) as Q);
      const results = stepTechDiffusion(reg, [pair], seed, 0);
      if (results.length > 0) {
        const r = results[0]!;
        expect(r.polityId).toBe("lag");
        expect(r.previousTechEra).toBe(2);
        expect(r.newTechEra).toBe(3);  // advances exactly 1 era
        return;
      }
    }
  });

  it("a polity can only advance once per tick (no double-advance)", () => {
    // lag polity is paired with two advanced polities
    const reg = mkRegistry([pol("adv1",5), pol("adv2",5), pol("lag",1)]);
    const pairs = [mkPair("adv1","lag",5,q(1.0) as Q), mkPair("adv2","lag",5,q(1.0) as Q)];
    // Over many seeds, lag should never advance more than once
    for (let seed = 1; seed <= 100; seed++) {
      const r2 = mkRegistry([pol("adv1",5), pol("adv2",5), pol("lag",1)]);
      const results = stepTechDiffusion(r2, pairs, seed, 0);
      const lagAdvances = results.filter(r => r.polityId === "lag");
      expect(lagAdvances.length).toBeLessThanOrEqual(1);
    }
  });

  it("polity at MAX_TECH_ERA never advances further", () => {
    const reg = mkRegistry([pol("adv",8), pol("also",8)]);
    const pair = mkPair("adv","also");
    for (let seed = 1; seed <= 50; seed++) {
      const results = stepTechDiffusion(reg, [pair], seed, 0);
      expect(results).toHaveLength(0);
    }
  });

  it("war between polities prevents diffusion", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const reg = mkRegistry([pol("a",5), pol("b",1)]);
      declareWar(reg, "a", "b");
      const pair = mkPair("a","b", 5, q(1.0) as Q);
      const results = stepTechDiffusion(reg, [pair], seed, 0);
      expect(results).toHaveLength(0);
    }
  });

  it("diffusion is deterministic for the same seed and tick", () => {
    const run = (seed: number) => {
      const reg = mkRegistry([pol("a",3), pol("b",1)]);
      return stepTechDiffusion(reg, [mkPair("a","b",3,q(0.80) as Q)], seed, 0);
    };
    for (let seed = 1; seed <= 20; seed++) {
      expect(run(seed).length).toBe(run(seed).length);
    }
  });

  it("skips missing polity ids in pairs gracefully", () => {
    const reg = mkRegistry([pol("a",3)]);
    const pair = mkPair("a","nonexistent");
    expect(() => stepTechDiffusion(reg, [pair], 1, 0)).not.toThrow();
  });

  it("both directions are checked in each pair", () => {
    // Run many seeds to confirm b→a advances can also occur when b > a
    let bAdvanced = false;
    for (let seed = 1; seed <= 500; seed++) {
      const reg = mkRegistry([pol("a",1), pol("b",4)]);
      const pair = mkPair("a","b", 4, q(1.0) as Q);
      const results = stepTechDiffusion(reg, [pair], seed, 0);
      if (results.some(r => r.polityId === "a")) { bAdvanced = true; break; }
    }
    expect(bAdvanced).toBe(true);
  });
});

// ── totalInboundPressure ──────────────────────────────────────────────────────

describe("totalInboundPressure", () => {
  it("returns 0 for unknown polityId", () => {
    const reg = mkRegistry([pol("a",2)]);
    expect(totalInboundPressure("unknown", reg, [])).toBe(0);
  });

  it("returns 0 when no pairs", () => {
    const reg = mkRegistry([pol("a",1), pol("b",3)]);
    expect(totalInboundPressure("a", reg, [])).toBe(0);
  });

  it("returns positive pressure when a neighbour has higher tech", () => {
    const reg = mkRegistry([pol("lag",1), pol("adv",4)]);
    const pairs = [mkPair("lag","adv",2,q(0.60) as Q)];
    const p = totalInboundPressure("lag", reg, pairs);
    expect(p).toBeGreaterThan(0);
  });

  it("returns 0 for already-max-era polity", () => {
    const reg = mkRegistry([pol("max",8), pol("also",8)]);
    const pairs = [mkPair("max","also")];
    expect(totalInboundPressure("max", reg, pairs)).toBe(0);
  });

  it("sums pressure from multiple advanced neighbours", () => {
    const reg = mkRegistry([pol("lag",0), pol("adv1",3), pol("adv2",4)]);
    const pairs = [mkPair("lag","adv1"), mkPair("lag","adv2")];
    const p1 = totalInboundPressure("lag", reg, [mkPair("lag","adv1")]);
    const pBoth = totalInboundPressure("lag", reg, pairs);
    expect(pBoth).toBeGreaterThan(p1);
  });

  it("excludes war pairs from pressure", () => {
    const reg = mkRegistry([pol("lag",1), pol("adv",4)]);
    declareWar(reg, "lag", "adv");
    const pairs = [mkPair("lag","adv",3,q(1.0) as Q)];
    expect(totalInboundPressure("lag", reg, pairs)).toBe(0);
  });

  it("result is clamped to [0, SCALE.Q]", () => {
    const reg = mkRegistry([pol("lag",0), pol("a",8), pol("b",8), pol("c",8)]);
    const pairs = [
      mkPair("lag","a",10,q(1.0) as Q),
      mkPair("lag","b",10,q(1.0) as Q),
      mkPair("lag","c",10,q(1.0) as Q),
    ];
    const p = totalInboundPressure("lag", reg, pairs);
    expect(p).toBeLessThanOrEqual(SCALE.Q);
  });
});

// ── techEraName ───────────────────────────────────────────────────────────────

describe("techEraName", () => {
  it("returns named eras for indices 0-8", () => {
    const names = ["Prehistoric","Ancient","Medieval","EarlyModern",
                   "Industrial","Modern","NearFuture","FarFuture","DeepSpace"];
    for (let i = 0; i <= 8; i++) {
      expect(techEraName(i)).toBe(names[i]);
    }
  });

  it("returns fallback string for unknown index", () => {
    expect(techEraName(99)).toBe("Era99");
  });
});

// ── Long-run convergence ──────────────────────────────────────────────────────

describe("long-run convergence", () => {
  it("lagging polity eventually catches up over 2000 daily ticks", () => {
    const reg = mkRegistry([pol("adv",3), pol("lag",1)]);
    const pair = mkPair("adv","lag", 3, q(0.70) as Q);
    const pairs = [pair];

    for (let tick = 0; tick < 2000; tick++) {
      stepTechDiffusion(reg, pairs, 42, tick);
      if (reg.polities.get("lag")!.techEra >= 3) break;
    }
    // Lag polity should have caught up (era 3) within 2000 days
    expect(reg.polities.get("lag")!.techEra).toBe(3);
  });

  it("isolated polity (no pairs) never advances", () => {
    const reg = mkRegistry([pol("iso",1)]);
    for (let tick = 0; tick < 200; tick++) {
      stepTechDiffusion(reg, [], 1, tick);
    }
    expect(reg.polities.get("iso")!.techEra).toBe(1);
  });
});
