import { describe, it, expect } from "vitest";
import { SCALE, q } from "../src/units.js";
import { TechEra } from "../src/sim/tech.js";
import { createPolity } from "../src/polity.js";
import {
  techEraToLoadout,
  militaryStrengthToTeamSize,
  battleSeed,
  battleConfigFromPolities,
  polityImpactFromBattle,
  applyPolityImpact,
  MIN_TEAM_SIZE,
  MAX_TEAM_SIZE,
  WIN_MORALE_BONUS,
  LOSS_MORALE_PENALTY,
  POP_PER_CASUALTY,
  type BattleOutcome,
} from "../src/battle-bridge.js";

function mkPolity(id: string, era: TechEra, militaryStrength_Q: number) {
  const p = createPolity(
    id, id, id, [],
    100_000, 1_000, era,
    q(0.70), q(0.70),
  );
  p.militaryStrength_Q = militaryStrength_Q as ReturnType<typeof q>;
  return p;
}

describe("techEraToLoadout", () => {
  it("Prehistoric returns club + leather", () => {
    const l = techEraToLoadout(TechEra.Prehistoric);
    expect(l.weaponId).toBe("wpn_club");
    expect(l.armourId).toBe("arm_leather");
  });

  it("Ancient returns knife + leather", () => {
    const l = techEraToLoadout(TechEra.Ancient);
    expect(l.weaponId).toBe("wpn_knife");
  });

  it("Medieval returns longsword + mail", () => {
    const l = techEraToLoadout(TechEra.Medieval);
    expect(l.weaponId).toBe("wpn_longsword");
    expect(l.armourId).toBe("arm_mail");
  });

  it("EarlyModern returns longsword + plate", () => {
    const l = techEraToLoadout(TechEra.EarlyModern);
    expect(l.armourId).toBe("arm_plate");
  });

  it("all eras return HUMAN_BASE archetype", () => {
    for (const era of [TechEra.Prehistoric, TechEra.Ancient, TechEra.Medieval, TechEra.EarlyModern]) {
      expect(techEraToLoadout(era).archetype).toBe("HUMAN_BASE");
    }
  });
});

describe("militaryStrengthToTeamSize", () => {
  it("q(0) → MIN_TEAM_SIZE", () => {
    expect(militaryStrengthToTeamSize(q(0))).toBe(MIN_TEAM_SIZE);
  });

  it("q(1.0) → MAX_TEAM_SIZE", () => {
    expect(militaryStrengthToTeamSize(q(1.0))).toBe(MAX_TEAM_SIZE);
  });

  it("q(0.5) → midpoint", () => {
    const size = militaryStrengthToTeamSize(q(0.5));
    expect(size).toBeGreaterThanOrEqual(MIN_TEAM_SIZE);
    expect(size).toBeLessThanOrEqual(MAX_TEAM_SIZE);
    expect(size).toBeCloseTo((MIN_TEAM_SIZE + MAX_TEAM_SIZE) / 2, 0);
  });

  it("clamps values below 0", () => {
    expect(militaryStrengthToTeamSize(-1000)).toBe(MIN_TEAM_SIZE);
  });

  it("clamps values above SCALE.Q", () => {
    expect(militaryStrengthToTeamSize(SCALE.Q * 2)).toBe(MAX_TEAM_SIZE);
  });
});

describe("battleSeed", () => {
  it("is deterministic", () => {
    expect(battleSeed(77, 42, "a", "b")).toBe(battleSeed(77, 42, "a", "b"));
  });

  it("changes with day", () => {
    expect(battleSeed(77, 1, "a", "b")).not.toBe(battleSeed(77, 2, "a", "b"));
  });

  it("changes with polity ids", () => {
    expect(battleSeed(77, 1, "a", "b")).not.toBe(battleSeed(77, 1, "c", "d"));
  });

  it("returns a non-negative integer", () => {
    const s = battleSeed(77, 1, "iron_clans", "merchant_league");
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
  });
});

describe("battleConfigFromPolities", () => {
  it("team sizes reflect military strength", () => {
    const strong = mkPolity("strong", TechEra.Medieval, q(0.9));
    const weak   = mkPolity("weak",   TechEra.Medieval, q(0.1));
    const cfg = battleConfigFromPolities(strong, weak, 77, 10);
    expect(cfg.teamASize).toBeGreaterThan(cfg.teamBSize);
  });

  it("loadouts reflect each side's tech era", () => {
    const ancient  = mkPolity("a", TechEra.Ancient,  q(0.5));
    const medieval = mkPolity("b", TechEra.Medieval, q(0.5));
    const cfg = battleConfigFromPolities(ancient, medieval, 77, 10);
    expect(cfg.loadoutA.weaponId).toBe("wpn_knife");
    expect(cfg.loadoutB.weaponId).toBe("wpn_longsword");
  });

  it("seed is deterministic", () => {
    const a = mkPolity("iron_clans",      TechEra.Ancient,  q(0.5));
    const b = mkPolity("merchant_league", TechEra.Medieval, q(0.5));
    const c1 = battleConfigFromPolities(a, b, 77, 10);
    const c2 = battleConfigFromPolities(a, b, 77, 10);
    expect(c1.seed).toBe(c2.seed);
  });

  it("polity ids are preserved", () => {
    const a = mkPolity("polity_a", TechEra.Ancient,  q(0.5));
    const b = mkPolity("polity_b", TechEra.Medieval, q(0.5));
    const cfg = battleConfigFromPolities(a, b, 1, 1);
    expect(cfg.polityAId).toBe("polity_a");
    expect(cfg.polityBId).toBe("polity_b");
  });
});

describe("polityImpactFromBattle", () => {
  const config = battleConfigFromPolities(
    mkPolity("a", TechEra.Medieval, q(0.5)),
    mkPolity("b", TechEra.Medieval, q(0.5)),
    77, 10,
  );

  it("winner gets positive morale delta", () => {
    const outcome: BattleOutcome = { winner: 1, ticksElapsed: 100, teamACasualties: 1, teamBCasualties: 4 };
    const impacts = polityImpactFromBattle(outcome, config);
    const a = impacts.find(i => i.polityId === "a")!;
    expect(a.moraleDelta_Q).toBe(WIN_MORALE_BONUS);
  });

  it("loser gets negative morale delta", () => {
    const outcome: BattleOutcome = { winner: 1, ticksElapsed: 100, teamACasualties: 1, teamBCasualties: 4 };
    const impacts = polityImpactFromBattle(outcome, config);
    const b = impacts.find(i => i.polityId === "b")!;
    expect(b.moraleDelta_Q).toBe(-LOSS_MORALE_PENALTY);
  });

  it("draw gives zero morale delta to both sides", () => {
    const outcome: BattleOutcome = { winner: 0, ticksElapsed: 6000, teamACasualties: 2, teamBCasualties: 2 };
    const impacts = polityImpactFromBattle(outcome, config);
    for (const impact of impacts) {
      expect(impact.moraleDelta_Q).toBe(0);
    }
  });

  it("casualties generate population loss", () => {
    const outcome: BattleOutcome = { winner: 1, ticksElapsed: 100, teamACasualties: 3, teamBCasualties: 5 };
    const impacts = polityImpactFromBattle(outcome, config);
    const a = impacts.find(i => i.polityId === "a")!;
    const b = impacts.find(i => i.polityId === "b")!;
    expect(a.populationLost).toBe(3 * POP_PER_CASUALTY);
    expect(b.populationLost).toBe(5 * POP_PER_CASUALTY);
  });

  it("heavy casualties cause stability penalty", () => {
    // All 8 casualties on side A (100% casualty rate >> 20% threshold)
    const bigConfig = battleConfigFromPolities(
      mkPolity("a", TechEra.Medieval, q(1.0)),
      mkPolity("b", TechEra.Medieval, q(0.5)),
      77, 10,
    );
    const outcome: BattleOutcome = { winner: 2, ticksElapsed: 100,
      teamACasualties: bigConfig.teamASize, teamBCasualties: 0 };
    const impacts = polityImpactFromBattle(outcome, bigConfig);
    const a = impacts.find(i => i.polityId === "a")!;
    expect(a.stabilityDelta_Q).toBeLessThan(0);
  });

  it("returns one impact per polity", () => {
    const outcome: BattleOutcome = { winner: 1, ticksElapsed: 100, teamACasualties: 0, teamBCasualties: 0 };
    const impacts = polityImpactFromBattle(outcome, config);
    expect(impacts).toHaveLength(2);
    expect(impacts.map(i => i.polityId).sort()).toEqual(["a", "b"]);
  });
});

describe("applyPolityImpact", () => {
  it("clamps morale to [0, SCALE.Q]", () => {
    const p = mkPolity("x", TechEra.Medieval, q(0.5));
    p.moraleQ = q(0.02);
    applyPolityImpact(p, { polityId: "x", moraleDelta_Q: -q(0.10), stabilityDelta_Q: 0, populationLost: 0 });
    expect(p.moraleQ).toBeGreaterThanOrEqual(0);
  });

  it("reduces population", () => {
    const p = mkPolity("x", TechEra.Medieval, q(0.5));
    const before = p.population;
    applyPolityImpact(p, { polityId: "x", moraleDelta_Q: 0, stabilityDelta_Q: 0, populationLost: 1000 });
    expect(p.population).toBe(before - 1000);
  });

  it("population cannot go below 0", () => {
    const p = mkPolity("x", TechEra.Medieval, q(0.5));
    applyPolityImpact(p, { polityId: "x", moraleDelta_Q: 0, stabilityDelta_Q: 0, populationLost: p.population + 99_999 });
    expect(p.population).toBeGreaterThanOrEqual(0);
  });
});
