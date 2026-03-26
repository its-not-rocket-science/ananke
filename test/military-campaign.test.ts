// test/military-campaign.test.ts — Phase 93: Military Campaigns & War Resolution

import { describe, it, expect } from "vitest";
import {
  MOBILIZATION_POP_FRACTION_Q,
  MAX_MOBILIZATION_Q,
  MOBILIZATION_COST_PER_SOLDIER,
  CAMPAIGN_UPKEEP_PER_SOLDIER,
  BASE_MARCH_RATE_Q,
  VICTORY_TRIBUTE_Q,
  WAR_UNREST_PRESSURE_Q,
  DEFEAT_MORALE_HIT_Q,
  DEFEAT_STABILITY_HIT_Q,
  VICTORY_MORALE_BONUS_Q,
  COMBAT_STABILITY_DRAIN_Q,
  createCampaign,
  computeBattleStrength,
  computeArmySize,
  mobilizeCampaign,
  prepareDefender,
  stepCampaignMarch,
  resolveBattle,
  applyBattleConsequences,
  computeDailyUpkeep,
  computeWarUnrestPressure,
} from "../src/military-campaign.js";
import { createPolity } from "../src/polity.js";
import { TechEra } from "../src/sim/tech.js";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePolity(
  era: number = TechEra.Medieval,
  population = 100_000,
  stabilityQ: Q = q(0.80) as Q,
  treasury = 500_000,
  militaryQ: Q = q(0.70) as Q,
) {
  const p = createPolity("p1", "Test", "f1", [], 50_000, treasury, "Medieval");
  p.techEra             = era as typeof TechEra[keyof typeof TechEra];
  p.population          = population;
  p.stabilityQ          = stabilityQ;
  p.militaryStrength_Q  = militaryQ;
  return p;
}

function makeAttacker(id = "atk") {
  const p = makePolity();
  p.id = id;
  return p;
}

function makeDefender(id = "def") {
  const p = makePolity();
  p.id = id;
  return p;
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("MOBILIZATION_POP_FRACTION_Q is q(0.05)", () => {
    expect(MOBILIZATION_POP_FRACTION_Q).toBe(q(0.05));
  });

  it("MAX_MOBILIZATION_Q is q(0.15)", () => {
    expect(MAX_MOBILIZATION_Q).toBe(q(0.15));
  });

  it("MOBILIZATION_COST_PER_SOLDIER is 5", () => {
    expect(MOBILIZATION_COST_PER_SOLDIER).toBe(5);
  });

  it("CAMPAIGN_UPKEEP_PER_SOLDIER is 1", () => {
    expect(CAMPAIGN_UPKEEP_PER_SOLDIER).toBe(1);
  });

  it("BASE_MARCH_RATE_Q is q(0.05)", () => {
    expect(BASE_MARCH_RATE_Q).toBe(q(0.05));
  });

  it("WAR_UNREST_PRESSURE_Q is q(0.15)", () => {
    expect(WAR_UNREST_PRESSURE_Q).toBe(q(0.15));
  });
});

// ── createCampaign ────────────────────────────────────────────────────────────

describe("createCampaign", () => {
  it("starts in mobilization phase", () => {
    const c = createCampaign("c1", "a", "d", 100);
    expect(c.phase).toBe("mobilization");
  });

  it("stores ids and tick", () => {
    const c = createCampaign("c1", "a", "d", 42);
    expect(c.campaignId).toBe("c1");
    expect(c.attackerPolityId).toBe("a");
    expect(c.defenderPolityId).toBe("d");
    expect(c.startTick).toBe(42);
  });

  it("starts with zero progress", () => {
    const c = createCampaign("c1", "a", "d", 0);
    expect(c.marchProgress_Q).toBe(0);
    expect(c.daysElapsed).toBe(0);
  });
});

// ── computeArmySize ───────────────────────────────────────────────────────────

describe("computeArmySize", () => {
  it("default fraction gives 5% of population", () => {
    const p = makePolity(TechEra.Medieval, 100_000);
    expect(computeArmySize(p)).toBe(5_000);
  });

  it("custom fraction applied correctly", () => {
    const p = makePolity(TechEra.Medieval, 100_000);
    expect(computeArmySize(p, q(0.10) as Q)).toBe(10_000);
  });

  it("clamped to MAX_MOBILIZATION_Q", () => {
    const p = makePolity(TechEra.Medieval, 100_000);
    // Requesting 50% but cap is 15%
    const size = computeArmySize(p, q(0.50) as Q);
    expect(size).toBe(Math.floor(100_000 * q(0.15) / SCALE.Q));
  });

  it("scales with population", () => {
    const small = makePolity(TechEra.Medieval, 50_000);
    const large = makePolity(TechEra.Medieval, 200_000);
    expect(computeArmySize(large)).toBeGreaterThan(computeArmySize(small));
  });
});

// ── computeBattleStrength ─────────────────────────────────────────────────────

describe("computeBattleStrength", () => {
  it("returns 0 for zero army size", () => {
    const p = makePolity();
    expect(computeBattleStrength(p, 0)).toBe(0);
  });

  it("returns positive value for non-zero army", () => {
    const p = makePolity();
    expect(computeBattleStrength(p, 5_000)).toBeGreaterThan(0);
  });

  it("higher military strength → higher battle strength", () => {
    const weak   = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 500_000, q(0.30) as Q);
    const strong = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 500_000, q(0.90) as Q);
    expect(computeBattleStrength(strong, 5_000)).toBeGreaterThan(computeBattleStrength(weak, 5_000));
  });

  it("higher stability → higher battle strength", () => {
    const lo = makePolity(TechEra.Medieval, 100_000, q(0.20) as Q);
    const hi = makePolity(TechEra.Medieval, 100_000, q(0.90) as Q);
    expect(computeBattleStrength(hi, 5_000)).toBeGreaterThan(computeBattleStrength(lo, 5_000));
  });

  it("larger army → higher strength (up to reference size)", () => {
    const p = makePolity();
    expect(computeBattleStrength(p, 5_000)).toBeLessThanOrEqual(computeBattleStrength(p, 10_000));
  });

  it("result is clamped to [0, SCALE.Q]", () => {
    const p = makePolity(TechEra.Medieval, 1_000_000, SCALE.Q as Q, 500_000, SCALE.Q as Q);
    const s = computeBattleStrength(p, 100_000);
    expect(s).toBeLessThanOrEqual(SCALE.Q);
    expect(s).toBeGreaterThanOrEqual(0);
  });
});

// ── mobilizeCampaign ──────────────────────────────────────────────────────────

describe("mobilizeCampaign", () => {
  it("transitions campaign to march phase", () => {
    const c = createCampaign("c1", "a", "d", 0);
    const p = makePolity();
    mobilizeCampaign(c, p);
    expect(c.phase).toBe("march");
  });

  it("stores army size on campaign", () => {
    const c = createCampaign("c1", "a", "d", 0);
    const p = makePolity(TechEra.Medieval, 100_000);
    mobilizeCampaign(c, p);
    expect(c.attackerArmySize).toBe(computeArmySize(p));
  });

  it("drains treasury by mobilization cost", () => {
    const c = createCampaign("c1", "a", "d", 0);
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 500_000);
    const armySize = computeArmySize(p);
    mobilizeCampaign(c, p);
    expect(p.treasury_cu).toBe(500_000 - armySize * MOBILIZATION_COST_PER_SOLDIER);
  });

  it("treasury capped — cannot go below zero", () => {
    const c = createCampaign("c1", "a", "d", 0);
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 100);
    mobilizeCampaign(c, p);
    expect(p.treasury_cu).toBeGreaterThanOrEqual(0);
  });

  it("sets attackerStrength_Q on campaign", () => {
    const c = createCampaign("c1", "a", "d", 0);
    const p = makePolity();
    mobilizeCampaign(c, p);
    expect(c.attackerStrength_Q).toBeGreaterThan(0);
  });
});

// ── prepareDefender ───────────────────────────────────────────────────────────

describe("prepareDefender", () => {
  it("sets defenderStrength_Q on campaign", () => {
    const c = createCampaign("c1", "a", "d", 0);
    const d = makeDefender();
    prepareDefender(c, d);
    expect(c.defenderStrength_Q).toBeGreaterThan(0);
  });

  it("wall bonus increases defender strength", () => {
    const c1 = createCampaign("c1", "a", "d", 0);
    const c2 = createCampaign("c2", "a", "d", 0);
    const d1 = makeDefender();
    const d2 = makeDefender();
    const noWall   = prepareDefender(c1, d1, 0 as Q);
    const withWall = prepareDefender(c2, d2, q(0.30) as Q);
    expect(withWall).toBeGreaterThan(noWall);
  });

  it("result is clamped to [0, SCALE.Q]", () => {
    const c = createCampaign("c1", "a", "d", 0);
    const d = makeDefender();
    const s = prepareDefender(c, d, SCALE.Q as Q);
    expect(s).toBeLessThanOrEqual(SCALE.Q);
    expect(s).toBeGreaterThanOrEqual(0);
  });
});

// ── stepCampaignMarch ─────────────────────────────────────────────────────────

describe("stepCampaignMarch", () => {
  it("advances march progress each day", () => {
    const c = createCampaign("c1", "a", "d", 0);
    const p = makePolity();
    mobilizeCampaign(c, p);
    const before = c.marchProgress_Q;
    stepCampaignMarch(c, p, 1);
    expect(c.marchProgress_Q).toBeGreaterThan(before);
  });

  it("road bonus increases march speed", () => {
    const c1 = createCampaign("c1", "a", "d", 0);
    const c2 = createCampaign("c2", "a", "d", 0);
    const p1 = makePolity();
    const p2 = makePolity();
    mobilizeCampaign(c1, p1);
    mobilizeCampaign(c2, p2);
    const r1 = stepCampaignMarch(c1, p1, 1, 0 as Q);
    const r2 = stepCampaignMarch(c2, p2, 1, q(0.05) as Q);
    expect(r2.progressAdded_Q).toBeGreaterThan(r1.progressAdded_Q);
  });

  it("drains daily upkeep from treasury", () => {
    const c = createCampaign("c1", "a", "d", 0);
    const p = makePolity(TechEra.Medieval, 100_000, q(0.80) as Q, 500_000);
    mobilizeCampaign(c, p);
    const before = p.treasury_cu;
    stepCampaignMarch(c, p, 7);
    expect(p.treasury_cu).toBe(before - c.attackerArmySize * 7);
  });

  it("triggers battle when progress reaches SCALE.Q", () => {
    const c = createCampaign("c1", "a", "d", 0);
    const p = makePolity();
    mobilizeCampaign(c, p);
    c.marchProgress_Q = (SCALE.Q - BASE_MARCH_RATE_Q) as Q;  // one day from arrival
    const r = stepCampaignMarch(c, p, 1);
    expect(r.battleTriggered).toBe(true);
    expect(c.phase).toBe("battle");
  });

  it("does not exceed SCALE.Q for marchProgress_Q", () => {
    const c = createCampaign("c1", "a", "d", 0);
    const p = makePolity();
    mobilizeCampaign(c, p);
    stepCampaignMarch(c, p, 100);
    expect(c.marchProgress_Q).toBeLessThanOrEqual(SCALE.Q);
  });

  it("accumulates daysElapsed", () => {
    const c = createCampaign("c1", "a", "d", 0);
    const p = makePolity();
    mobilizeCampaign(c, p);
    stepCampaignMarch(c, p, 5);
    stepCampaignMarch(c, p, 3);
    expect(c.daysElapsed).toBe(8);
  });
});

// ── resolveBattle ─────────────────────────────────────────────────────────────

describe("resolveBattle", () => {
  function makeCampaign() {
    const a  = makeAttacker();
    const d  = makeDefender();
    const c  = createCampaign("c1", a.id, d.id, 0);
    mobilizeCampaign(c, a);
    prepareDefender(c, d);
    c.phase = "battle";
    return { c, a, d };
  }

  it("returns a valid outcome", () => {
    const { c, a, d } = makeCampaign();
    const valid = new Set(["attacker_victory", "defender_holds", "stalemate"]);
    const r = resolveBattle(c, a, d, 42, 100);
    expect(valid.has(r.outcome)).toBe(true);
  });

  it("sets campaign.phase to resolved", () => {
    const { c, a, d } = makeCampaign();
    resolveBattle(c, a, d, 42, 100);
    expect(c.phase).toBe("resolved");
  });

  it("sets campaign.outcome", () => {
    const { c, a, d } = makeCampaign();
    resolveBattle(c, a, d, 42, 100);
    expect(c.outcome).toBeDefined();
  });

  it("is deterministic — same seed + tick produces same outcome", () => {
    const { c: c1, a: a1, d: d1 } = makeCampaign();
    const { c: c2, a: a2, d: d2 } = makeCampaign();
    const r1 = resolveBattle(c1, a1, d1, 99, 200);
    const r2 = resolveBattle(c2, a2, d2, 99, 200);
    expect(r1.outcome).toBe(r2.outcome);
  });

  it("different seeds may produce different outcomes", () => {
    const outcomes = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      const { c, a, d } = makeCampaign();
      outcomes.add(resolveBattle(c, a, d, seed, seed).outcome);
    }
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it("attacker_victory grants tribute from defender treasury", () => {
    // Force attacker_victory by making attacker overwhelmingly strong
    for (let tick = 0; tick < 200; tick++) {
      const a = makeAttacker();
      const d = makeDefender();
      a.militaryStrength_Q = SCALE.Q as Q;
      a.stabilityQ = SCALE.Q as Q;
      a.population = 1_000_000;
      d.militaryStrength_Q = 0 as Q;
      d.stabilityQ = 0 as Q;
      d.population = 1_000;
      d.treasury_cu = 200_000;
      const c = createCampaign("c1", a.id, d.id, 0);
      mobilizeCampaign(c, a);
      prepareDefender(c, d);
      c.phase = "battle";
      const r = resolveBattle(c, a, d, 1, tick);
      if (r.outcome === "attacker_victory") {
        expect(r.tributeAmount).toBeGreaterThan(0);
        expect(a.treasury_cu).toBeGreaterThan(500_000 - 1_000_000 * 5);  // gained tribute
        break;
      }
    }
  });

  it("defender_holds gives no tribute", () => {
    for (let tick = 0; tick < 200; tick++) {
      const a = makeAttacker();
      const d = makeDefender();
      a.militaryStrength_Q = 0 as Q;
      d.militaryStrength_Q = SCALE.Q as Q;
      d.stabilityQ = SCALE.Q as Q;
      const c = createCampaign("c1", a.id, d.id, 0);
      mobilizeCampaign(c, a);
      prepareDefender(c, d);
      c.phase = "battle";
      const r = resolveBattle(c, a, d, 1, tick);
      if (r.outcome === "defender_holds") {
        expect(r.tributeAmount).toBeUndefined();
        break;
      }
    }
  });

  it("reduces attacker and defender strength after battle", () => {
    const { c, a, d } = makeCampaign();
    const atkBefore = c.attackerStrength_Q;
    const defBefore = c.defenderStrength_Q;
    resolveBattle(c, a, d, 42, 100);
    expect(c.attackerStrength_Q).toBeLessThan(atkBefore);
    expect(c.defenderStrength_Q).toBeLessThan(defBefore);
  });

  it("strength values never go below 0 after battle", () => {
    const { c, a, d } = makeCampaign();
    resolveBattle(c, a, d, 42, 100);
    expect(c.attackerStrength_Q).toBeGreaterThanOrEqual(0);
    expect(c.defenderStrength_Q).toBeGreaterThanOrEqual(0);
  });
});

// ── applyBattleConsequences ───────────────────────────────────────────────────

describe("applyBattleConsequences", () => {
  it("both sides lose stability after battle", () => {
    const a = makeAttacker();
    const d = makeDefender();
    const atkStab = a.stabilityQ;
    const defStab = d.stabilityQ;
    const result = { outcome: "stalemate" as const, attackerCasualties_Q: q(0.25) as Q, defenderCasualties_Q: q(0.25) as Q };
    applyBattleConsequences(result, a, d);
    expect(a.stabilityQ).toBeLessThan(atkStab);
    expect(d.stabilityQ).toBeLessThan(defStab);
  });

  it("attacker_victory boosts attacker morale", () => {
    const a = makeAttacker();
    const d = makeDefender();
    const before = a.moraleQ;
    const result = { outcome: "attacker_victory" as const, attackerCasualties_Q: q(0.20) as Q, defenderCasualties_Q: q(0.50) as Q, tributeAmount: 0 };
    applyBattleConsequences(result, a, d);
    expect(a.moraleQ).toBeGreaterThan(before);
  });

  it("defender_holds boosts defender morale", () => {
    const a = makeAttacker();
    const d = makeDefender();
    const before = d.moraleQ;
    const result = { outcome: "defender_holds" as const, attackerCasualties_Q: q(0.40) as Q, defenderCasualties_Q: q(0.15) as Q };
    applyBattleConsequences(result, a, d);
    expect(d.moraleQ).toBeGreaterThan(before);
  });

  it("loser morale goes down on defeat", () => {
    const a = makeAttacker();
    const d = makeDefender();
    const before = d.moraleQ;
    const result = { outcome: "attacker_victory" as const, attackerCasualties_Q: q(0.20) as Q, defenderCasualties_Q: q(0.50) as Q, tributeAmount: 0 };
    applyBattleConsequences(result, a, d);
    expect(d.moraleQ).toBeLessThan(before);
  });

  it("morale and stability never go below zero", () => {
    const a = makeAttacker();
    const d = makeDefender();
    a.moraleQ    = q(0.01) as Q;
    a.stabilityQ = q(0.01) as Q;
    d.moraleQ    = q(0.01) as Q;
    d.stabilityQ = q(0.01) as Q;
    const result = { outcome: "attacker_victory" as const, attackerCasualties_Q: q(0.40) as Q, defenderCasualties_Q: q(0.50) as Q, tributeAmount: 0 };
    applyBattleConsequences(result, a, d);
    expect(a.moraleQ).toBeGreaterThanOrEqual(0);
    expect(a.stabilityQ).toBeGreaterThanOrEqual(0);
    expect(d.moraleQ).toBeGreaterThanOrEqual(0);
    expect(d.stabilityQ).toBeGreaterThanOrEqual(0);
  });

  it("morale never exceeds SCALE.Q after victory bonus", () => {
    const a = makeAttacker();
    const d = makeDefender();
    a.moraleQ = SCALE.Q as Q;
    const result = { outcome: "attacker_victory" as const, attackerCasualties_Q: q(0.20) as Q, defenderCasualties_Q: q(0.50) as Q, tributeAmount: 0 };
    applyBattleConsequences(result, a, d);
    expect(a.moraleQ).toBeLessThanOrEqual(SCALE.Q);
  });
});

// ── computeDailyUpkeep ────────────────────────────────────────────────────────

describe("computeDailyUpkeep", () => {
  it("returns armySize × CAMPAIGN_UPKEEP_PER_SOLDIER", () => {
    const c = createCampaign("c1", "a", "d", 0);
    const p = makePolity(TechEra.Medieval, 100_000);
    mobilizeCampaign(c, p);
    expect(computeDailyUpkeep(c)).toBe(c.attackerArmySize * CAMPAIGN_UPKEEP_PER_SOLDIER);
  });

  it("returns 0 for empty army", () => {
    const c = createCampaign("c1", "a", "d", 0);
    c.attackerArmySize = 0;
    expect(computeDailyUpkeep(c)).toBe(0);
  });
});

// ── computeWarUnrestPressure ──────────────────────────────────────────────────

describe("computeWarUnrestPressure", () => {
  it("returns WAR_UNREST_PRESSURE_Q during active campaign", () => {
    const c = createCampaign("c1", "a", "d", 0);
    expect(computeWarUnrestPressure(c)).toBe(WAR_UNREST_PRESSURE_Q);
  });

  it("returns 0 when campaign resolved", () => {
    const c = createCampaign("c1", "a", "d", 0);
    c.phase   = "resolved";
    c.outcome = "attacker_victory";
    expect(computeWarUnrestPressure(c)).toBe(0);
  });

  it("returns positive value during march phase", () => {
    const c = createCampaign("c1", "a", "d", 0);
    c.phase = "march";
    expect(computeWarUnrestPressure(c)).toBeGreaterThan(0);
  });
});

// ── Integration ───────────────────────────────────────────────────────────────

describe("integration", () => {
  it("full campaign lifecycle: mobilize → march → battle → consequences", () => {
    const a = makeAttacker();
    const d = makeDefender();
    const c = createCampaign("c1", a.id, d.id, 0);

    // Mobilize
    const mob = mobilizeCampaign(c, a);
    expect(mob.armySize).toBeGreaterThan(0);
    expect(c.phase).toBe("march");

    // Prepare defender
    prepareDefender(c, d);
    expect(c.defenderStrength_Q).toBeGreaterThan(0);

    // March until battle triggers
    let triggered = false;
    for (let day = 0; day < 25 && !triggered; day++) {
      const r = stepCampaignMarch(c, a, 1);
      if (r.battleTriggered) triggered = true;
    }
    expect(triggered).toBe(true);
    expect(c.phase).toBe("battle");

    // Resolve
    const result = resolveBattle(c, a, d, 42, c.daysElapsed);
    expect(["attacker_victory", "defender_holds", "stalemate"]).toContain(result.outcome);
    expect(c.phase).toBe("resolved");

    // Apply consequences
    applyBattleConsequences(result, a, d);
    // Both sides lost stability
    expect(a.stabilityQ).toBeLessThan(q(0.80));
  });

  it("treasury is drained by mobilization + march upkeep", () => {
    const a = makeAttacker();
    a.treasury_cu = 500_000;
    const d = makeDefender();
    const c = createCampaign("c1", a.id, d.id, 0);
    mobilizeCampaign(c, a);
    const afterMob = a.treasury_cu;
    stepCampaignMarch(c, a, 10);
    expect(a.treasury_cu).toBeLessThan(afterMob);
  });

  it("war unrest pressure is zero after resolution", () => {
    const a = makeAttacker();
    const d = makeDefender();
    const c = createCampaign("c1", a.id, d.id, 0);
    mobilizeCampaign(c, a);
    prepareDefender(c, d);
    expect(computeWarUnrestPressure(c)).toBeGreaterThan(0);  // during campaign
    c.phase   = "resolved";
    c.outcome = "stalemate";
    expect(computeWarUnrestPressure(c)).toBe(0);             // after
  });
});
