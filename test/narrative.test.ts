// test/narrative.test.ts — Phase 18: Combat Narrative Layer
import { describe, it, expect } from "vitest";
import { q, SCALE, to } from "../src/units.js";
import type { Q } from "../src/units.js";
import type { WeaponDamageProfile } from "../src/equipment.js";
import { defaultInjury } from "../src/sim/injury.js";
import { TraceKinds } from "../src/sim/kinds.js";
import type { TraceEvent } from "../src/sim/trace.js";
import {
  narrateEvent,
  buildCombatLog,
  describeInjuries,
  describeCombatOutcome,
  type NarrativeConfig,
  type CombatantSummary,
} from "../src/narrative.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const normalCfg: NarrativeConfig = { verbosity: "normal" };
const terseCfg:  NarrativeConfig = { verbosity: "terse"  };
const verboseCfg: NarrativeConfig = { verbosity: "verbose" };

function namedCfg(map: Record<number, string>): NarrativeConfig {
  return { verbosity: "normal", nameMap: new Map(Object.entries(map).map(([k, v]) => [Number(k), v])) };
}

/** Build a minimal WeaponDamageProfile for verb selection tests. */
function mkProfile(overrides: Partial<WeaponDamageProfile> = {}): WeaponDamageProfile {
  return {
    surfaceFrac:    q(0.30) as Q,
    internalFrac:   q(0.50) as Q,
    structuralFrac: q(0.20) as Q,
    bleedFactor:    q(0.50) as Q,
    penetrationBias: q(0.30) as Q,
    ...overrides,
  };
}

function mkAttack(overrides: Partial<Extract<TraceEvent, { kind: typeof TraceKinds.Attack }>> = {}): TraceEvent {
  return {
    kind: TraceKinds.Attack,
    tick: 1,
    attackerId: 1,
    targetId: 2,
    region: "torso",
    energy_J: 100,
    blocked: false,
    parried: false,
    shieldBlocked: false,
    armoured: false,
    hitQuality: q(0.7) as Q,
    ...overrides,
  };
}

function mkProjectileHit(overrides: Partial<Extract<TraceEvent, { kind: typeof TraceKinds.ProjectileHit }>> = {}): TraceEvent {
  return {
    kind: TraceKinds.ProjectileHit,
    tick: 1,
    shooterId: 1,
    targetId: 2,
    hit: true,
    region: "torso",
    distance_m: to.m(50),
    energyAtImpact_J: 500,
    suppressed: false,
    ...overrides,
  };
}

// ── narrateEvent — Attack ─────────────────────────────────────────────────────

describe("narrateEvent — Attack: blocked/parried/shield", () => {
  it("blocked attack in normal verbosity contains 'blocked'", () => {
    const line = narrateEvent(mkAttack({ blocked: true }), normalCfg);
    expect(line).not.toBeNull();
    expect(line).toContain("blocked");
  });

  it("parried attack in normal verbosity contains 'parried'", () => {
    const line = narrateEvent(mkAttack({ parried: true }), normalCfg);
    expect(line).not.toBeNull();
    expect(line).toContain("parried");
  });

  it("shield-blocked attack in normal verbosity contains 'shield'", () => {
    const line = narrateEvent(mkAttack({ shieldBlocked: true }), normalCfg);
    expect(line).not.toBeNull();
    expect(line).toContain("shield");
  });

  it("blocked attack in terse verbosity returns null", () => {
    expect(narrateEvent(mkAttack({ blocked: true }), terseCfg)).toBeNull();
  });

  it("parried attack in terse verbosity returns null", () => {
    expect(narrateEvent(mkAttack({ parried: true }), terseCfg)).toBeNull();
  });

  it("shield-blocked attack in terse verbosity returns null", () => {
    expect(narrateEvent(mkAttack({ shieldBlocked: true }), terseCfg)).toBeNull();
  });
});

describe("narrateEvent — Attack: hit quality", () => {
  it("hit with armour flag contains '(armoured)'", () => {
    const line = narrateEvent(mkAttack({ armoured: true }), normalCfg);
    expect(line).toContain("(armoured)");
  });

  it("very weak hit (energy_J < 10) contains 'barely'", () => {
    const line = narrateEvent(mkAttack({ energy_J: 5 }), normalCfg);
    expect(line).toContain("barely");
  });

  it("powerful hit (energy_J >= 200) contains 'powerfully'", () => {
    const line = narrateEvent(mkAttack({ energy_J: 250 }), normalCfg);
    expect(line).toContain("powerfully");
  });

  it("devastating hit (energy_J >= 500) contains 'devastatingly'", () => {
    const line = narrateEvent(mkAttack({ energy_J: 600 }), normalCfg);
    expect(line).toContain("devastatingly");
  });
});

describe("narrateEvent — Attack: verb selection via weaponProfiles", () => {
  it("high penetrationBias weapon → stab verb", () => {
    const cfg: NarrativeConfig = {
      verbosity: "normal",
      weaponProfiles: new Map([["wpn_test", mkProfile({ penetrationBias: q(0.80) as Q })]]),
    };
    const line = narrateEvent(mkAttack({ weaponId: "wpn_test" }), cfg);
    expect(line).toContain("stab");
  });

  it("high structuralFrac weapon → bludgeon verb", () => {
    const cfg: NarrativeConfig = {
      verbosity: "normal",
      weaponProfiles: new Map([["wpn_test", mkProfile({ structuralFrac: q(0.60) as Q, penetrationBias: q(0.10) as Q })]]),
    };
    const line = narrateEvent(mkAttack({ weaponId: "wpn_test" }), cfg);
    expect(line).toContain("bludgeon");
  });

  it("high surfaceFrac weapon → slash verb", () => {
    const cfg: NarrativeConfig = {
      verbosity: "normal",
      weaponProfiles: new Map([["wpn_test", mkProfile({ surfaceFrac: q(0.70) as Q, penetrationBias: q(0.10) as Q, structuralFrac: q(0.20) as Q })]]),
    };
    const line = narrateEvent(mkAttack({ weaponId: "wpn_test" }), cfg);
    expect(line).toContain("slash");
  });

  it("no weaponId falls back to generic 'strike'", () => {
    const line = narrateEvent(mkAttack({}), normalCfg);
    expect(line).toContain("strike");
  });

  it("second-person subject ('you') uses bare infinitive", () => {
    const cfg = namedCfg({ 1: "you", 2: "Bob" });
    const line = narrateEvent(mkAttack({}), cfg);
    // bare infinitive: "you strike" not "you strikes"
    expect(line).toContain("you strike");
    expect(line).not.toContain("strikes");
  });
});

describe("narrateEvent — Attack: region phrasing", () => {
  it("head region → 'in the head'", () => {
    expect(narrateEvent(mkAttack({ region: "head" }), normalCfg)).toContain("in the head");
  });

  it("leg region → 'in the leg'", () => {
    expect(narrateEvent(mkAttack({ region: "leg" }), normalCfg)).toContain("in the leg");
  });

  it("custom region → 'on the {region}'", () => {
    expect(narrateEvent(mkAttack({ region: "carapace" }), normalCfg)).toContain("on the carapace");
  });
});

// ── narrateEvent — ProjectileHit ─────────────────────────────────────────────

describe("narrateEvent — ProjectileHit", () => {
  it("hit=true contains shooter and target names with custom nameMap", () => {
    const cfg = namedCfg({ 1: "Alice", 2: "Bob" });
    const line = narrateEvent(mkProjectileHit(), cfg);
    expect(line).toContain("Alice");
    expect(line).toContain("Bob");
  });

  it("hit=true includes distance in metres", () => {
    const line = narrateEvent(mkProjectileHit({ distance_m: to.m(150) }), normalCfg);
    expect(line).toContain("150m");
  });

  it("hit=true with region includes region text", () => {
    const line = narrateEvent(mkProjectileHit({ region: "head" }), normalCfg);
    expect(line).toContain("head");
  });

  it("hit=false suppressed in terse returns null", () => {
    expect(narrateEvent(mkProjectileHit({ hit: false, suppressed: true }), terseCfg)).toBeNull();
  });

  it("hit=false suppressed in normal contains 'suppressive'", () => {
    const line = narrateEvent(mkProjectileHit({ hit: false, suppressed: true }), normalCfg);
    expect(line).toContain("suppressive");
  });

  it("hit=false not suppressed in terse returns null", () => {
    expect(narrateEvent(mkProjectileHit({ hit: false }), terseCfg)).toBeNull();
  });

  it("hit=false in normal mentions miss", () => {
    const line = narrateEvent(mkProjectileHit({ hit: false }), normalCfg);
    expect(line).toContain("misses");
  });

  it("high-penetration weapon → 'snipe' verb", () => {
    const cfg: NarrativeConfig = {
      verbosity: "normal",
      weaponProfiles: new Map([["rng_test", mkProfile({ penetrationBias: q(0.90) as Q })]]),
    };
    const line = narrateEvent(mkProjectileHit({ weaponId: "rng_test" }), cfg);
    expect(line).toContain("snipe");
  });
});

// ── narrateEvent — KO / Death / Morale ───────────────────────────────────────

describe("narrateEvent — KO, Death, MoraleRoute, MoraleRally", () => {
  it("KO contains 'unconscious'", () => {
    const line = narrateEvent({ kind: TraceKinds.KO, tick: 1, entityId: 3 }, normalCfg);
    expect(line).toContain("unconscious");
  });

  it("Death contains 'dies'", () => {
    const line = narrateEvent({ kind: TraceKinds.Death, tick: 1, entityId: 3 }, normalCfg);
    expect(line).toContain("dies");
  });

  it("MoraleRoute contains 'flees' or 'breaks'", () => {
    const line = narrateEvent({ kind: TraceKinds.MoraleRoute, tick: 1, entityId: 3, fearQ: q(0.8) as Q }, normalCfg);
    expect(line).toMatch(/flees|breaks/);
  });

  it("MoraleRally contains 'rallies'", () => {
    const line = narrateEvent({ kind: TraceKinds.MoraleRally, tick: 1, entityId: 3, fearQ: q(0.4) as Q }, normalCfg);
    expect(line).toContain("rallies");
  });

  it("custom nameMap is used for entity names", () => {
    const cfg = namedCfg({ 3: "Ser Roland" });
    const line = narrateEvent({ kind: TraceKinds.KO, tick: 1, entityId: 3 }, cfg);
    expect(line).toContain("Ser Roland");
  });

  it("unknown entity falls back to 'combatant {id}'", () => {
    const line = narrateEvent({ kind: TraceKinds.Death, tick: 1, entityId: 99 }, normalCfg);
    expect(line).toContain("combatant 99");
  });
});

// ── narrateEvent — Grapple ────────────────────────────────────────────────────

describe("narrateEvent — Grapple", () => {
  const grappleStart: TraceEvent = { kind: TraceKinds.Grapple, tick: 1, attackerId: 1, targetId: 2, phase: "start" };
  const grappleTick:  TraceEvent = { kind: TraceKinds.Grapple, tick: 2, attackerId: 1, targetId: 2, phase: "tick" };
  const grappleBreak: TraceEvent = { kind: TraceKinds.Grapple, tick: 3, attackerId: 1, targetId: 2, phase: "break" };

  it("grapple start in normal verbosity contains 'grapple'", () => {
    const line = narrateEvent(grappleStart, normalCfg);
    expect(line).toContain("grapple");
  });

  it("grapple start in terse verbosity returns null", () => {
    expect(narrateEvent(grappleStart, terseCfg)).toBeNull();
  });

  it("grapple tick in normal verbosity returns null", () => {
    expect(narrateEvent(grappleTick, normalCfg)).toBeNull();
  });

  it("grapple tick in verbose verbosity returns non-null", () => {
    expect(narrateEvent(grappleTick, verboseCfg)).not.toBeNull();
  });

  it("grapple break in normal contains 'breaks free'", () => {
    const line = narrateEvent(grappleBreak, normalCfg);
    expect(line).toContain("breaks free");
  });
});

// ── narrateEvent — WeaponBind, Fracture, BlastHit ────────────────────────────

describe("narrateEvent — other events", () => {
  it("WeaponBind in terse returns null", () => {
    const ev: TraceEvent = { kind: TraceKinds.WeaponBind, tick: 1, attackerId: 1, targetId: 2, durationTicks: 4 };
    expect(narrateEvent(ev, terseCfg)).toBeNull();
  });

  it("WeaponBind in normal contains 'lock'", () => {
    const ev: TraceEvent = { kind: TraceKinds.WeaponBind, tick: 1, attackerId: 1, targetId: 2, durationTicks: 4 };
    const line = narrateEvent(ev, normalCfg);
    expect(line).toContain("lock");
  });

  it("WeaponBindBreak in normal contains the reason", () => {
    const ev: TraceEvent = { kind: TraceKinds.WeaponBindBreak, tick: 1, entityId: 1, partnerId: 2, reason: "timeout" };
    const line = narrateEvent(ev, normalCfg);
    expect(line).toContain("timeout");
  });

  it("Fracture contains region name and 'fractured'", () => {
    const ev: TraceEvent = { kind: TraceKinds.Fracture, tick: 1, entityId: 1, region: "arm" };
    const line = narrateEvent(ev, normalCfg);
    expect(line).toContain("arm");
    expect(line).toContain("fractured");
  });

  it("BlastHit contains 'explosion' and fragment count", () => {
    const ev: TraceEvent = { kind: TraceKinds.BlastHit, tick: 1, entityId: 1, blastEnergy_J: 5000, fragHits: 3 };
    const line = narrateEvent(ev, normalCfg);
    expect(line).toContain("explosion");
    expect(line).toContain("3");
  });

  it("TickStart returns null (internal event)", () => {
    const ev: TraceEvent = { kind: TraceKinds.TickStart, tick: 1 };
    expect(narrateEvent(ev, normalCfg)).toBeNull();
  });
});

// ── buildCombatLog ────────────────────────────────────────────────────────────

describe("buildCombatLog", () => {
  it("returns one entry per narrated event, skipping nulls", () => {
    const events: TraceEvent[] = [
      { kind: TraceKinds.TickStart, tick: 1 },
      mkAttack(),
      { kind: TraceKinds.TickEnd, tick: 1 },
    ];
    const log = buildCombatLog(events, normalCfg);
    expect(log).toHaveLength(1);
  });

  it("preserves event ordering", () => {
    const events: TraceEvent[] = [
      { kind: TraceKinds.Death, tick: 1, entityId: 2 },
      { kind: TraceKinds.KO,    tick: 1, entityId: 3 },
    ];
    const log = buildCombatLog(events, normalCfg);
    expect(log[0]).toContain("dies");
    expect(log[1]).toContain("unconscious");
  });

  it("terse mode returns fewer entries than normal for same events", () => {
    const events: TraceEvent[] = [
      mkAttack({ blocked: true }),
      mkAttack({ parried: true }),
      mkAttack(),
      { kind: TraceKinds.Death, tick: 1, entityId: 2 },
    ];
    const terseLog  = buildCombatLog(events, terseCfg);
    const normalLog = buildCombatLog(events, normalCfg);
    expect(terseLog.length).toBeLessThan(normalLog.length);
  });

  it("empty event list returns empty array", () => {
    expect(buildCombatLog([], normalCfg)).toEqual([]);
  });
});

// ── describeInjuries ──────────────────────────────────────────────────────────

describe("describeInjuries", () => {
  it("dead entity returns 'Fatal'", () => {
    const inj = defaultInjury();
    inj.dead = true;
    expect(describeInjuries(inj)).toBe("Fatal");
  });

  it("healthy entity returns 'No significant injuries'", () => {
    expect(describeInjuries(defaultInjury())).toBe("No significant injuries");
  });

  it("high fluid loss mentions hemorrhage", () => {
    const inj = defaultInjury();
    (inj as any).fluidLoss = q(0.70);
    expect(describeInjuries(inj)).toContain("hemorrhage");
  });

  it("low consciousness mentions unconscious or semi-conscious", () => {
    const inj = defaultInjury();
    (inj as any).consciousness = q(0.10);
    expect(describeInjuries(inj)).toMatch(/[Uu]nconscious/);
  });

  it("fractured region is listed", () => {
    const inj = defaultInjury();
    inj.byRegion["leftArm"]!.fractured = true;
    const result = describeInjuries(inj);
    expect(result).toContain("leftArm");
    expect(result).toContain("fractured");
  });
});

// ── describeCombatOutcome ─────────────────────────────────────────────────────

describe("describeCombatOutcome", () => {
  function alive(id: number, teamId: number): CombatantSummary {
    return { id, teamId, injury: { dead: false, consciousness: q(1.0) as Q } };
  }
  function dead(id: number, teamId: number): CombatantSummary {
    return { id, teamId, injury: { dead: true, consciousness: q(0.0) as Q } };
  }

  it("all opponents down — winner team named", () => {
    const result = describeCombatOutcome([alive(1, 1), dead(2, 2)]);
    expect(result).toContain("Team 1");
    expect(result).toContain("wins");
  });

  it("all combatants down returns 'All combatants down'", () => {
    const result = describeCombatOutcome([dead(1, 1), dead(2, 2)]);
    expect(result).toBe("All combatants down");
  });

  it("mixed teams both alive shows standing counts", () => {
    const result = describeCombatOutcome([alive(1, 1), alive(2, 1), alive(3, 2)]);
    expect(result).toContain("2/2");
    expect(result).toContain("1/1");
  });

  it("tickCount is appended when provided", () => {
    const result = describeCombatOutcome([alive(1, 1), dead(2, 2)], 200);
    expect(result).toContain("200");
  });
});
