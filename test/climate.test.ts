// test/climate.test.ts — Phase 96: Climate Events & Natural Disasters

import { describe, it, expect } from "vitest";
import {
  BASE_EFFECTS,
  EVENT_DURATION_RANGE,
  EVENT_DAILY_PROBABILITY_Q,
  createClimateEvent,
  activateClimateEvent,
  computeClimateEffects,
  stepClimateEvent,
  isClimateEventExpired,
  generateClimateEvent,
  aggregateClimateEffects,
} from "../src/climate.js";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeActive(type: Parameters<typeof createClimateEvent>[1], severity_Q: Q = q(0.60) as Q, days = 30) {
  const ev = createClimateEvent(`ev_${type}`, type, severity_Q, days);
  return activateClimateEvent(ev);
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("all six event types have BASE_EFFECTS entries", () => {
    const types = ["drought", "flood", "harsh_winter", "earthquake", "plague_season", "locust_swarm"];
    for (const t of types) {
      expect(BASE_EFFECTS[t as keyof typeof BASE_EFFECTS]).toBeDefined();
    }
  });

  it("locust_swarm has the highest harvest penalty", () => {
    const max = Math.max(...Object.values(BASE_EFFECTS).map(e => e.harvestYieldPenalty_Q));
    expect(BASE_EFFECTS.locust_swarm.harvestYieldPenalty_Q).toBe(max);
  });

  it("plague_season has the highest epidemic growth bonus", () => {
    const max = Math.max(...Object.values(BASE_EFFECTS).map(e => e.epidemicGrowthBonus_Q));
    expect(BASE_EFFECTS.plague_season.epidemicGrowthBonus_Q).toBe(max);
  });

  it("earthquake has the highest infrastructure damage", () => {
    const max = Math.max(...Object.values(BASE_EFFECTS).map(e => e.infrastructureDamage_Q));
    expect(BASE_EFFECTS.earthquake.infrastructureDamage_Q).toBe(max);
  });

  it("harsh_winter has the highest march penalty", () => {
    const max = Math.max(...Object.values(BASE_EFFECTS).map(e => e.marchPenalty_Q));
    expect(BASE_EFFECTS.harsh_winter.marchPenalty_Q).toBe(max);
  });

  it("all event types have duration ranges", () => {
    for (const [, range] of Object.entries(EVENT_DURATION_RANGE)) {
      expect(range[0]).toBeGreaterThan(0);
      expect(range[1]).toBeGreaterThanOrEqual(range[0]);
    }
  });

  it("daily probabilities are all positive and below 1%/day", () => {
    for (const prob of Object.values(EVENT_DAILY_PROBABILITY_Q)) {
      expect(prob).toBeGreaterThan(0);
      expect(prob).toBeLessThan(100);  // < 1% per day (100/10000)
    }
  });
});

// ── createClimateEvent ────────────────────────────────────────────────────────

describe("createClimateEvent", () => {
  it("stores all fields", () => {
    const ev = createClimateEvent("e1", "drought", q(0.60) as Q, 90);
    expect(ev.eventId).toBe("e1");
    expect(ev.type).toBe("drought");
    expect(ev.severity_Q).toBe(q(0.60));
    expect(ev.durationDays).toBe(90);
  });

  it("clamps severity to [0, SCALE.Q]", () => {
    const hi = createClimateEvent("e1", "flood", 99999 as Q, 30);
    expect(hi.severity_Q).toBeLessThanOrEqual(SCALE.Q);
    const lo = createClimateEvent("e2", "flood", -1 as Q, 30);
    expect(lo.severity_Q).toBeGreaterThanOrEqual(0);
  });

  it("durationDays minimum is 1", () => {
    const ev = createClimateEvent("e1", "earthquake", q(0.80) as Q, 0);
    expect(ev.durationDays).toBeGreaterThanOrEqual(1);
  });
});

// ── activateClimateEvent ──────────────────────────────────────────────────────

describe("activateClimateEvent", () => {
  it("sets remainingDays to durationDays", () => {
    const ev  = createClimateEvent("e1", "drought", q(0.60) as Q, 60);
    const act = activateClimateEvent(ev);
    expect(act.remainingDays).toBe(60);
  });

  it("starts with elapsedDays = 0", () => {
    const act = makeActive("flood");
    expect(act.elapsedDays).toBe(0);
  });
});

// ── computeClimateEffects ─────────────────────────────────────────────────────

describe("computeClimateEffects", () => {
  it("returns all-zero effects when expired", () => {
    const act = makeActive("drought");
    act.remainingDays = 0;
    const fx = computeClimateEffects(act);
    expect(fx.deathPressure_Q).toBe(0);
    expect(fx.harvestYieldPenalty_Q).toBe(0);
    expect(fx.unrestPressure_Q).toBe(0);
  });

  it("scales effects by severity — higher severity = larger effects", () => {
    const lo = makeActive("drought", q(0.30) as Q);
    const hi = makeActive("drought", q(0.80) as Q);
    expect(computeClimateEffects(hi).harvestYieldPenalty_Q)
      .toBeGreaterThan(computeClimateEffects(lo).harvestYieldPenalty_Q);
  });

  it("drought has significant harvest penalty", () => {
    const act = makeActive("drought", SCALE.Q as Q);
    expect(computeClimateEffects(act).harvestYieldPenalty_Q).toBeGreaterThan(0);
  });

  it("locust_swarm has highest harvest penalty at same severity", () => {
    const drought = makeActive("drought", q(0.60) as Q);
    const locust  = makeActive("locust_swarm", q(0.60) as Q);
    expect(computeClimateEffects(locust).harvestYieldPenalty_Q)
      .toBeGreaterThan(computeClimateEffects(drought).harvestYieldPenalty_Q);
  });

  it("harsh_winter has march penalty", () => {
    const act = makeActive("harsh_winter", q(0.70) as Q);
    expect(computeClimateEffects(act).marchPenalty_Q).toBeGreaterThan(0);
  });

  it("earthquake has infrastructure damage", () => {
    const act = makeActive("earthquake", q(0.80) as Q);
    expect(computeClimateEffects(act).infrastructureDamage_Q).toBeGreaterThan(0);
  });

  it("plague_season has epidemic growth bonus", () => {
    const act = makeActive("plague_season", q(0.60) as Q);
    expect(computeClimateEffects(act).epidemicGrowthBonus_Q).toBeGreaterThan(0);
  });

  it("all effect values are clamped to [0, SCALE.Q]", () => {
    const act = makeActive("earthquake", SCALE.Q as Q);
    const fx  = computeClimateEffects(act);
    for (const val of Object.values(fx)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(SCALE.Q);
    }
  });

  it("zero severity returns near-zero effects", () => {
    const act = makeActive("flood", 0 as Q);
    const fx  = computeClimateEffects(act);
    expect(fx.harvestYieldPenalty_Q).toBe(0);
    expect(fx.marchPenalty_Q).toBe(0);
  });
});

// ── stepClimateEvent ──────────────────────────────────────────────────────────

describe("stepClimateEvent", () => {
  it("decrements remainingDays", () => {
    const act = makeActive("drought", q(0.60) as Q, 30);
    stepClimateEvent(act, 7);
    expect(act.remainingDays).toBe(23);
  });

  it("increments elapsedDays", () => {
    const act = makeActive("drought", q(0.60) as Q, 30);
    stepClimateEvent(act, 7);
    expect(act.elapsedDays).toBe(7);
  });

  it("remainingDays never goes below zero", () => {
    const act = makeActive("flood", q(0.60) as Q, 10);
    stepClimateEvent(act, 100);
    expect(act.remainingDays).toBe(0);
  });

  it("returns true when event expires this step", () => {
    const act = makeActive("earthquake", q(0.80) as Q, 3);
    const expired = stepClimateEvent(act, 3);
    expect(expired).toBe(true);
  });

  it("returns false when event still has days remaining", () => {
    const act = makeActive("drought", q(0.60) as Q, 60);
    const expired = stepClimateEvent(act, 7);
    expect(expired).toBe(false);
  });

  it("accumulates elapsedDays over multiple steps", () => {
    const act = makeActive("harsh_winter", q(0.60) as Q, 90);
    stepClimateEvent(act, 30);
    stepClimateEvent(act, 30);
    expect(act.elapsedDays).toBe(60);
  });
});

// ── isClimateEventExpired ─────────────────────────────────────────────────────

describe("isClimateEventExpired", () => {
  it("returns false for active event", () => {
    const act = makeActive("flood");
    expect(isClimateEventExpired(act)).toBe(false);
  });

  it("returns true when remainingDays is 0", () => {
    const act = makeActive("flood");
    act.remainingDays = 0;
    expect(isClimateEventExpired(act)).toBe(true);
  });
});

// ── generateClimateEvent ──────────────────────────────────────────────────────

describe("generateClimateEvent", () => {
  it("is deterministic — same inputs produce same output", () => {
    const r1 = generateClimateEvent(12345, 99, 1000);
    const r2 = generateClimateEvent(12345, 99, 1000);
    expect(r1?.type).toBe(r2?.type);
    expect(r1?.severity_Q).toBe(r2?.severity_Q);
    expect(r1?.durationDays).toBe(r2?.durationDays);
  });

  it("different ticks may produce different events", () => {
    const results = new Set<string>();
    for (let tick = 0; tick < 2000; tick++) {
      const ev = generateClimateEvent(42, 1, tick);
      if (ev) results.add(ev.type);
    }
    // With ~0.5%/day for harsh_winter alone, expect several events across 2000 ticks
    expect(results.size).toBeGreaterThan(1);
  });

  it("returns undefined on most ticks (low daily probability)", () => {
    let hitCount = 0;
    for (let tick = 0; tick < 365; tick++) {
      if (generateClimateEvent(1, 1, tick)) hitCount++;
    }
    // Should not trigger every day
    expect(hitCount).toBeLessThan(365);
  });

  it("when event is generated, severity is in [q(0.20), q(0.90)]", () => {
    for (let tick = 0; tick < 2000; tick++) {
      const ev = generateClimateEvent(77, 42, tick);
      if (ev) {
        expect(ev.severity_Q).toBeGreaterThanOrEqual(q(0.20));
        expect(ev.severity_Q).toBeLessThanOrEqual(q(0.90));
        break;
      }
    }
  });

  it("when event is generated, duration is within expected range for its type", () => {
    for (let tick = 0; tick < 2000; tick++) {
      const ev = generateClimateEvent(33, 7, tick);
      if (ev) {
        const [min, max] = EVENT_DURATION_RANGE[ev.type];
        expect(ev.durationDays).toBeGreaterThanOrEqual(min);
        expect(ev.durationDays).toBeLessThanOrEqual(max);
        break;
      }
    }
  });
});

// ── aggregateClimateEffects ───────────────────────────────────────────────────

describe("aggregateClimateEffects", () => {
  it("empty list returns all-zero effects", () => {
    const fx = aggregateClimateEffects([]);
    expect(fx.harvestYieldPenalty_Q).toBe(0);
    expect(fx.unrestPressure_Q).toBe(0);
  });

  it("single event matches computeClimateEffects", () => {
    const act = makeActive("drought", q(0.60) as Q);
    const agg = aggregateClimateEffects([act]);
    const single = computeClimateEffects(act);
    expect(agg.harvestYieldPenalty_Q).toBe(single.harvestYieldPenalty_Q);
    expect(agg.unrestPressure_Q).toBe(single.unrestPressure_Q);
  });

  it("multiple events produce higher combined effects", () => {
    const drought = makeActive("drought",      q(0.60) as Q);
    const locust  = makeActive("locust_swarm", q(0.60) as Q);
    const agg     = aggregateClimateEffects([drought, locust]);
    const d       = computeClimateEffects(drought);
    expect(agg.harvestYieldPenalty_Q).toBeGreaterThan(d.harvestYieldPenalty_Q);
  });

  it("all aggregated values clamped to [0, SCALE.Q]", () => {
    // stack many severe events to test clamping
    const climateTypes = ["drought", "flood", "harsh_winter", "earthquake", "plague_season", "locust_swarm"] as const;
    const events = Array.from({ length: 6 }, (_, i) =>
      makeActive(climateTypes[i], SCALE.Q as Q)
    );
    const agg = aggregateClimateEffects(events);
    for (const val of Object.values(agg)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(SCALE.Q);
    }
  });

  it("expired events contribute zero to aggregate", () => {
    const active  = makeActive("drought", q(0.60) as Q);
    const expired = makeActive("flood",   q(0.80) as Q);
    expired.remainingDays = 0;
    const withExpired = aggregateClimateEffects([active, expired]);
    const without     = aggregateClimateEffects([active]);
    expect(withExpired.harvestYieldPenalty_Q).toBe(without.harvestYieldPenalty_Q);
  });
});

// ── Integration ───────────────────────────────────────────────────────────────

describe("integration", () => {
  it("full lifecycle: generate → activate → step → expire", () => {
    let event: ReturnType<typeof generateClimateEvent> | undefined;
    for (let tick = 0; tick < 2000 && !event; tick++) {
      event = generateClimateEvent(55, 3, tick);
    }
    expect(event).toBeDefined();

    const active = activateClimateEvent(event!);
    expect(active.remainingDays).toBe(event!.durationDays);

    const fx = computeClimateEffects(active);
    expect(Object.values(fx).some(v => v > 0)).toBe(true);  // some effects present

    // Step to expiry
    const expired = stepClimateEvent(active, event!.durationDays);
    expect(expired).toBe(true);
    expect(isClimateEventExpired(active)).toBe(true);

    // Effects now zero
    const fxAfter = computeClimateEffects(active);
    expect(fxAfter.harvestYieldPenalty_Q).toBe(0);
  });

  it("drought + locust swarm simultaneously devastates harvest", () => {
    const drought = makeActive("drought",      q(0.80) as Q);
    const locust  = makeActive("locust_swarm", q(0.70) as Q);
    const agg = aggregateClimateEffects([drought, locust]);
    // Combined harvest penalty should be very high
    expect(agg.harvestYieldPenalty_Q).toBeGreaterThan(q(0.50));
  });
});
