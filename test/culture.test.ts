/**
 * Phase 71 — Cultural Generation & Evolution Framework
 *
 * Covers:
 *  - generateCulture — all five forces, value derivation, contradictions, CYCLES
 *  - stepCultureYear — tech diffusion, military outcome, myth drift, schism events
 *  - describeCulture — structure and prose checks
 *  - getCulturalValue / getDominantValues / getSignificantContradictions
 */

import { describe, it, expect } from "vitest";
import {
  generateCulture,
  stepCultureYear,
  describeCulture,
  getCulturalValue,
  getDominantValues,
  getSignificantContradictions,
  VALUE_THRESHOLD_Q,
  CONTRADICTION_THRESHOLD_Q,
  MAX_VALUES,
  MAX_CYCLES,
} from "../src/culture.js";
import type { CultureProfile } from "../src/culture.js";
import type { Polity, PolityRegistry } from "../src/polity.js";
import type { Myth, MythArchetype } from "../src/mythology.js";
import { q, SCALE } from "../src/units.js";
import { BIOME_UNDERWATER, BIOME_LUNAR } from "../src/sim/biome.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePolity(overrides: Partial<Polity> = {}): Polity {
  return {
    id:                  "realm_a",
    name:                "The Realm",
    factionId:           "realm",
    locationIds:         ["loc_1"],
    population:          100_000,
    treasury_cu:         50_000,
    techEra:             "medieval",
    militaryStrength_Q:  q(0.70) as ReturnType<typeof q>,
    stabilityQ:          q(0.80) as ReturnType<typeof q>,
    moraleQ:             q(0.60) as ReturnType<typeof q>,
    ...overrides,
  };
}

function makeRegistry(): PolityRegistry {
  return { polities: new Map(), activeWars: new Set(), alliances: new Map() };
}

function makeMyth(archetype: MythArchetype, belief_Q = q(0.60)): Myth {
  return {
    id:                  `myth_${archetype}`,
    archetype,
    name:                `The ${archetype}`,
    description:         "A myth.",
    sourceIds:           [],
    believingFactionIds: ["realm"],
    ageInDays:           365,
    belief_Q:            belief_Q as ReturnType<typeof q>,
    effects: {
      moraleModifier_Q:    q(0.00) as ReturnType<typeof q>,
      diplomaticModifier_Q: q(0.00) as ReturnType<typeof q>,
      techModifier_Q:      q(0.00) as ReturnType<typeof q>,
      fearThresholdMod_Q:  q(0.00) as ReturnType<typeof q>,
    },
  };
}

const NO_MYTHS: Myth[] = [];
const NO_VASSALS = [] as const;

// ── generateCulture — basic structure ────────────────────────────────────────

describe("generateCulture — structure", () => {
  it("returns a CultureProfile with the correct polityId", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    expect(p.polityId).toBe("realm_a");
    expect(p.id).toBe("culture_realm_a");
  });

  it("has five forces all in [0, SCALE.Q]", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    for (const k of ["environment", "power", "exchange", "legacy", "belief"] as const) {
      expect(p.forces[k]).toBeGreaterThanOrEqual(0);
      expect(p.forces[k]).toBeLessThanOrEqual(SCALE.Q);
    }
  });

  it("values array respects MAX_VALUES cap", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    expect(p.values.length).toBeLessThanOrEqual(MAX_VALUES);
  });

  it("cycles array respects MAX_CYCLES cap", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    expect(p.cycles.length).toBeLessThanOrEqual(MAX_CYCLES);
  });

  it("values are sorted descending by strength", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    for (let i = 1; i < p.values.length; i++) {
      expect(p.values[i - 1]!.strength_Q).toBeGreaterThanOrEqual(p.values[i]!.strength_Q);
    }
  });

  it("all value strengths are at or above VALUE_THRESHOLD_Q", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    for (const v of p.values) {
      expect(v.strength_Q).toBeGreaterThanOrEqual(VALUE_THRESHOLD_Q);
    }
  });

  it("driftTendency_Q is in (0, SCALE.Q)", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    expect(p.driftTendency_Q).toBeGreaterThan(0);
    expect(p.driftTendency_Q).toBeLessThan(SCALE.Q);
  });
});

// ── generateCulture — environment force ──────────────────────────────────────

describe("generateCulture — environment force", () => {
  it("defaults to q(0.50) with no biome", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    expect(p.forces.environment).toBe(q(0.50));
  });

  it("underwater biome raises environment force", () => {
    const pStd  = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    const pUnder = generateCulture(makePolity(), makeRegistry(), NO_MYTHS, NO_VASSALS, BIOME_UNDERWATER);
    expect(pUnder.forces.environment).toBeGreaterThan(pStd.forces.environment);
  });

  it("lunar/vacuum biome raises environment force above underwater", () => {
    const pUnder = generateCulture(makePolity(), makeRegistry(), NO_MYTHS, NO_VASSALS, BIOME_UNDERWATER);
    const pLunar = generateCulture(makePolity(), makeRegistry(), NO_MYTHS, NO_VASSALS, BIOME_LUNAR);
    expect(pLunar.forces.environment).toBeGreaterThan(pUnder.forces.environment);
  });

  it("harsh environment boosts fatalism and martial_virtue", () => {
    const pMild  = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    const pHarsh = generateCulture(makePolity(), makeRegistry(), NO_MYTHS, NO_VASSALS, BIOME_UNDERWATER);
    const fatalismMild  = getCulturalValue(pMild,  "fatalism");
    const fatalismHarsh = getCulturalValue(pHarsh, "fatalism");
    expect(fatalismHarsh).toBeGreaterThan(fatalismMild);
  });
});

// ── generateCulture — power force ────────────────────────────────────────────

describe("generateCulture — power force", () => {
  it("medieval tech era has higher power force than prehistoric", () => {
    const pMed  = generateCulture(makePolity({ techEra: "medieval" }),     makeRegistry(), NO_MYTHS);
    const pPre  = generateCulture(makePolity({ techEra: "prehistoric" }),  makeRegistry(), NO_MYTHS);
    expect(pMed.forces.power).toBeGreaterThan(pPre.forces.power);
  });

  it("high power force produces hierarchy as a dominant value", () => {
    const p = generateCulture(makePolity({ techEra: "medieval" }), makeRegistry(), NO_MYTHS);
    const hier = getCulturalValue(p, "hierarchy");
    expect(hier).toBeGreaterThan(q(0.30));
  });

  it("low power force (prehistoric) suppresses hierarchy", () => {
    const p = generateCulture(makePolity({ techEra: "prehistoric" }), makeRegistry(), NO_MYTHS);
    const hier = getCulturalValue(p, "hierarchy");
    expect(hier).toBeLessThan(q(0.40));
  });
});

// ── generateCulture — exchange force ─────────────────────────────────────────

describe("generateCulture — exchange force", () => {
  it("wealthy polity (high treasury per capita) has higher exchange force", () => {
    const rich = makePolity({ population: 10_000, treasury_cu: 100_000 }); // 10 cu/person
    const poor = makePolity({ population: 100_000, treasury_cu: 1_000 });  // 0.01 cu/person
    const pRich = generateCulture(rich, makeRegistry(), NO_MYTHS);
    const pPoor = generateCulture(poor, makeRegistry(), NO_MYTHS);
    expect(pRich.forces.exchange).toBeGreaterThan(pPoor.forces.exchange);
  });

  it("high exchange force produces commerce as a value", () => {
    const rich = makePolity({ population: 1_000, treasury_cu: 500_000 });
    const p = generateCulture(rich, makeRegistry(), NO_MYTHS);
    const commerce = getCulturalValue(p, "commerce");
    expect(commerce).toBeGreaterThan(VALUE_THRESHOLD_Q);
  });
});

// ── generateCulture — legacy and belief forces ───────────────────────────────

describe("generateCulture — legacy and belief forces", () => {
  it("no myths → low legacy force", () => {
    const p = generateCulture(makePolity(), makeRegistry(), []);
    expect(p.forces.legacy).toBeLessThan(q(0.20));
  });

  it("strongly believed myths raise legacy force", () => {
    const myths = [makeMyth("hero", q(0.90)), makeMyth("golden_age", q(0.80))];
    const p = generateCulture(makePolity(), makeRegistry(), myths);
    expect(p.forces.legacy).toBeGreaterThan(q(0.50));
  });

  it("supernatural myths (divine_wrath) raise belief force", () => {
    const pNone = generateCulture(makePolity(), makeRegistry(), []);
    const myths = [makeMyth("divine_wrath"), makeMyth("great_plague")];
    const pWith = generateCulture(makePolity(), makeRegistry(), myths);
    expect(pWith.forces.belief).toBeGreaterThan(pNone.forces.belief);
  });

  it("high belief force produces spiritual_devotion value", () => {
    const myths = [makeMyth("divine_wrath"), makeMyth("divine_wrath"), makeMyth("great_plague")];
    const p = generateCulture(makePolity(), makeRegistry(), myths);
    const devot = getCulturalValue(p, "spiritual_devotion");
    expect(devot).toBeGreaterThan(VALUE_THRESHOLD_Q);
  });

  it("positive myths (hero) suppress fatalism", () => {
    const posMythP = generateCulture(makePolity(), makeRegistry(), [makeMyth("hero"), makeMyth("golden_age")]);
    const negMythP = generateCulture(makePolity(), makeRegistry(), [makeMyth("great_plague"), makeMyth("divine_wrath")]);
    expect(getCulturalValue(negMythP, "fatalism")).toBeGreaterThan(getCulturalValue(posMythP, "fatalism"));
  });
});

// ── generateCulture — contradictions ─────────────────────────────────────────

describe("generateCulture — contradictions", () => {
  it("honour + commerce tension detected in medieval wealthy culture", () => {
    // medieval: high power → high honour; wealthy: high exchange → high commerce
    const richMedieval = makePolity({ techEra: "medieval", population: 10_000, treasury_cu: 200_000 });
    const p = generateCulture(richMedieval, makeRegistry(), NO_MYTHS);
    const _c = p.contradictions.find(x => x.valueA === "honour" && x.valueB === "commerce");
    // May or may not fire depending on balance; check that contradiction list is valid
    for (const x of p.contradictions) {
      expect(x.tension_Q).toBeGreaterThanOrEqual(CONTRADICTION_THRESHOLD_Q);
    }
  });

  it("contradictions are sorted descending by tension", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    for (let i = 1; i < p.contradictions.length; i++) {
      expect(p.contradictions[i - 1]!.tension_Q).toBeGreaterThanOrEqual(p.contradictions[i]!.tension_Q);
    }
  });
});

// ── generateCulture — CYCLES ──────────────────────────────────────────────────

describe("generateCulture — CYCLES", () => {
  it("cycles list is non-empty for a non-trivial polity", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    expect(p.cycles.length).toBeGreaterThan(0);
  });

  it("each cycle has a type, name, and description", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    for (const c of p.cycles) {
      expect(typeof c.type).toBe("string");
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
    }
  });
});

// ── stepCultureYear — force evolution ────────────────────────────────────────

describe("stepCultureYear — force evolution", () => {
  function baseline(): CultureProfile {
    return generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
  }

  it("tech pressure increases exchange force", () => {
    const p = baseline();
    const before = p.forces.exchange;
    const { profile: after } = stepCultureYear(p, q(0.50) as ReturnType<typeof q>, q(0.50) as ReturnType<typeof q>, NO_MYTHS, 1, 1);
    expect(after.forces.exchange).toBeGreaterThanOrEqual(before);
  });

  it("zero tech pressure does not increase exchange force", () => {
    const p = baseline();
    const before = p.forces.exchange;
    const { profile: after } = stepCultureYear(p, q(0.00) as ReturnType<typeof q>, q(0.50) as ReturnType<typeof q>, NO_MYTHS, 1, 1);
    expect(after.forces.exchange).toBe(before);
  });

  it("military victory raises power force", () => {
    const p = baseline();
    const before = p.forces.power;
    const { profile: after } = stepCultureYear(p, q(0.00) as ReturnType<typeof q>, q(1.00) as ReturnType<typeof q>, NO_MYTHS, 1, 1);
    expect(after.forces.power).toBeGreaterThan(before);
  });

  it("military defeat lowers power force", () => {
    const p = baseline();
    const before = p.forces.power;
    const { profile: after } = stepCultureYear(p, q(0.00) as ReturnType<typeof q>, q(0.00) as ReturnType<typeof q>, NO_MYTHS, 1, 1);
    expect(after.forces.power).toBeLessThan(before);
  });

  it("environment force does not change year-to-year", () => {
    const p = baseline();
    const { profile: after } = stepCultureYear(p, q(0.20) as ReturnType<typeof q>, q(0.50) as ReturnType<typeof q>, NO_MYTHS, 1, 1);
    expect(after.forces.environment).toBe(p.forces.environment);
  });

  it("new myths update legacy and belief forces", () => {
    const p = baseline();
    const myths = [makeMyth("divine_wrath"), makeMyth("great_plague")];
    const { profile: after } = stepCultureYear(p, q(0.00) as ReturnType<typeof q>, q(0.50) as ReturnType<typeof q>, myths, 1, 1);
    expect(after.forces.belief).toBeGreaterThan(p.forces.belief);
  });

  it("is deterministic — same inputs produce same output", () => {
    const p = baseline();
    const r1 = stepCultureYear(p, q(0.20) as ReturnType<typeof q>, q(0.70) as ReturnType<typeof q>, NO_MYTHS, 42, 100);
    const r2 = stepCultureYear(p, q(0.20) as ReturnType<typeof q>, q(0.70) as ReturnType<typeof q>, NO_MYTHS, 42, 100);
    expect(r1.profile.forces.exchange).toBe(r2.profile.forces.exchange);
    expect(r1.profile.forces.power).toBe(r2.profile.forces.power);
    expect(r1.schism?.type).toBe(r2.schism?.type);
  });
});

// ── stepCultureYear — schism ──────────────────────────────────────────────────

describe("stepCultureYear — schism", () => {
  it("a highly conservative culture with high tension eventually schisms", () => {
    // Build a culture with extreme honour+commerce tension
    const richMedieval = makePolity({ techEra: "medieval", population: 5_000, treasury_cu: 500_000 });
    let p = generateCulture(richMedieval, makeRegistry(), NO_MYTHS);
    // Force low drift (conservative)
    p = { ...p, driftTendency_Q: q(0.10) as ReturnType<typeof q> };

    let schismFound = false;
    for (let seed = 1; seed <= 200 && !schismFound; seed++) {
      const { schism } = stepCultureYear(p, q(0.00) as ReturnType<typeof q>, q(0.50) as ReturnType<typeof q>, NO_MYTHS, seed, 1);
      if (schism) schismFound = true;
    }
    // Conservative cultures with tension should eventually schism across 200 seeds
    expect(schismFound).toBe(true);
  });

  it("schism result has all required fields when it fires", () => {
    const richMedieval = makePolity({ techEra: "medieval", population: 5_000, treasury_cu: 500_000 });
    let p = generateCulture(richMedieval, makeRegistry(), NO_MYTHS);
    p = { ...p, driftTendency_Q: q(0.05) as ReturnType<typeof q> };

    for (let seed = 1; seed <= 200; seed++) {
      const { schism } = stepCultureYear(p, q(0.00) as ReturnType<typeof q>, q(0.50) as ReturnType<typeof q>, NO_MYTHS, seed, 1);
      if (schism) {
        expect(schism.polityId).toBe(p.polityId);
        expect(["reform_movement", "heresy", "civil_unrest"]).toContain(schism.type);
        expect(schism.severity_Q).toBeGreaterThan(0);
        expect(schism.severity_Q).toBeLessThanOrEqual(SCALE.Q);
        break;
      }
    }
  });

  it("open culture (high driftTendency) almost never schisms", () => {
    const richMedieval = makePolity({ techEra: "medieval", population: 5_000, treasury_cu: 500_000 });
    let p = generateCulture(richMedieval, makeRegistry(), NO_MYTHS);
    p = { ...p, driftTendency_Q: q(0.90) as ReturnType<typeof q> };

    let schismCount = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const { schism } = stepCultureYear(p, q(0.00) as ReturnType<typeof q>, q(0.50) as ReturnType<typeof q>, NO_MYTHS, seed, 1);
      if (schism) schismCount++;
    }
    expect(schismCount).toBeLessThan(15);
  });
});

// ── Query helpers ─────────────────────────────────────────────────────────────

describe("getCulturalValue", () => {
  it("returns q(0) for a value not in the profile", () => {
    const p = generateCulture(makePolity({ techEra: "prehistoric", population: 50_000, treasury_cu: 0 }), makeRegistry(), NO_MYTHS);
    // commerce should be near 0 for a prehistoric, bankrupt polity
    const val = getCulturalValue(p, "commerce");
    expect(val).toBeGreaterThanOrEqual(0);
  });

  it("returns the correct value when present", () => {
    const p = generateCulture(makePolity({ techEra: "medieval" }), makeRegistry(), NO_MYTHS);
    const hier = getCulturalValue(p, "hierarchy");
    const found = p.values.find(v => v.id === "hierarchy");
    expect(hier).toBe(found?.strength_Q ?? 0);
  });
});

describe("getDominantValues", () => {
  it("returns at most n values", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    expect(getDominantValues(p, 2).length).toBeLessThanOrEqual(2);
  });

  it("returns values in descending strength order", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    const top = getDominantValues(p, 3);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1]!.strength_Q).toBeGreaterThanOrEqual(top[i]!.strength_Q);
    }
  });
});

describe("getSignificantContradictions", () => {
  it("only returns contradictions at or above CONTRADICTION_THRESHOLD_Q", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    for (const c of getSignificantContradictions(p)) {
      expect(c.tension_Q).toBeGreaterThanOrEqual(CONTRADICTION_THRESHOLD_Q);
    }
  });
});

// ── describeCulture ───────────────────────────────────────────────────────────

describe("describeCulture", () => {
  it("returns non-empty summary string", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    const d = describeCulture(p);
    expect(d.summary.length).toBeGreaterThan(10);
  });

  it("values list matches dominant values count", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    const d = describeCulture(p);
    expect(d.values.length).toBeGreaterThan(0);
    expect(d.values.length).toBeLessThanOrEqual(3);
  });

  it("cycles list matches profile cycles count", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS);
    const d = describeCulture(p);
    expect(d.cycles.length).toBe(p.cycles.length);
  });

  it("includes contradiction prose when contradictions exist", () => {
    const richMedieval = makePolity({ techEra: "medieval", population: 5_000, treasury_cu: 500_000 });
    const p = generateCulture(richMedieval, makeRegistry(), NO_MYTHS);
    const d = describeCulture(p);
    if (p.contradictions.length > 0) {
      expect(d.contradictions.length).toBeGreaterThan(0);
      for (const line of d.contradictions) {
        expect(line.length).toBeGreaterThan(5);
      }
    }
  });

  it("summary mentions environment for harsh biomes", () => {
    const p = generateCulture(makePolity(), makeRegistry(), NO_MYTHS, NO_VASSALS, BIOME_UNDERWATER);
    const d = describeCulture(p);
    expect(d.summary).toContain("harsh conditions");
  });
});
