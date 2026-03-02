/**
 * Phase 5 extensions — morale feature tests
 *
 * Covers all six morale enhancements:
 *   1. Caliber-based suppression fear
 *   2. Fear memory and diminishing returns
 *   3. Leader and standard-bearer auras
 *   4. Panic action variety (surrender / freeze / flee)
 *   5. Rally mechanic
 *   6. Entity archetype fear response (berserk / freeze)
 */
import { describe, it, expect } from "vitest";
import { q, SCALE, qMul, type Q } from "../src/units";
import {
  FEAR_PER_SUPPRESSION_TICK,
  FEAR_FOR_ALLY_DEATH,
  LEADER_AURA_FEAR_REDUCTION,
  BANNER_AURA_FEAR_REDUCTION,
  RALLY_COOLDOWN_TICKS,
  isRouting,
} from "../src/sim/morale";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { buildWorldIndex } from "../src/sim/indexing";
import { buildSpatialIndex } from "../src/sim/spatial";
import { STARTER_RANGED_WEAPONS, STARTER_WEAPONS } from "../src/equipment";
import type { CommandMap } from "../src/sim/commands";
import type { TraceEvent } from "../src/sim/trace";
import { decideCommandsForEntity } from "../src/sim/ai/decide";
import type { AIPolicy } from "../src/sim/ai/types";
import { TUNING } from "../src/sim/tuning";

const M = SCALE.m;

// ── helpers ──────────────────────────────────────────────────────────────────

function runTick(
  world: ReturnType<typeof mkWorld>,
  cmds: CommandMap,
  ctx?: object,
): TraceEvent[] {
  const events: TraceEvent[] = [];
  const trace = { onEvent: (ev: TraceEvent) => events.push(ev) };
  stepWorld(world, cmds, { tractionCoeff: q(0.80), trace, ...ctx } as any);
  return events;
}

function noCmd(): CommandMap { return new Map(); }

function defaultPolicy(): AIPolicy {
  return {
    archetype: "lineInfantry",
    desiredRange_m: Math.trunc(1.5 * M),
    engageRange_m: Math.trunc(1.0 * M),
    retreatRange_m: Math.trunc(0.5 * M),
    threatRange_m: Math.trunc(2.0 * M),
    defendWhenThreatenedQ: q(0.7),
    parryBiasQ: q(0.3),
    dodgeBiasQ: q(0.2),
    retargetCooldownTicks: 5,
    focusStickinessQ: q(0.5),
  };
}

// Builds a minimal world/index/spatial for calling decideCommandsForEntity
function mkDecideCtx(world: ReturnType<typeof mkWorld>) {
  const index = buildWorldIndex(world as any);
  const spatial = buildSpatialIndex(world as any, Math.trunc(4 * M));
  return { world, index, spatial };
}

// ── Feature 1: Caliber-based suppression fear ─────────────────────────────────

describe("caliber-based suppression fear", () => {
  it("standard multiplier (q(1.0)): suppression adds ~FEAR_PER_SUPPRESSION_TICK per tick", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.condition.suppressedTicks = 10;
    e.condition.suppressionFearMul = SCALE.Q as Q;
    e.condition.fearQ = q(0);
    const world = mkWorld(42, [e]);
    runTick(world, noCmd());
    // net gain = FEAR_PER_SUPPRESSION_TICK × 1.0 - decay > 0
    expect(world.entities[0]!.condition.fearQ).toBeGreaterThan(0);
  });

  it("high-caliber multiplier (q(3.0)): fear gain is ~3× standard", () => {
    // Run standard entity
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    e1.condition.suppressedTicks = 10;
    e1.condition.suppressionFearMul = SCALE.Q as Q;
    e1.condition.fearQ = q(0);
    const w1 = mkWorld(42, [e1]);
    runTick(w1, noCmd());
    const fearStd = w1.entities[0]!.condition.fearQ;

    // Run high-caliber entity (same id → same distressTol and decay)
    const e2 = mkHumanoidEntity(1, 1, 0, 0);
    e2.condition.suppressedTicks = 10;
    e2.condition.suppressionFearMul = q(3.0);
    e2.condition.fearQ = q(0);
    const w2 = mkWorld(42, [e2]);
    runTick(w2, noCmd());
    const fearHigh = w2.entities[0]!.condition.fearQ;

    expect(fearHigh).toBeGreaterThan(fearStd);
    // Difference ≈ 2 × FEAR_PER_SUPPRESSION_TICK = 400
    expect(fearHigh - fearStd).toBeGreaterThan(qMul(FEAR_PER_SUPPRESSION_TICK, q(1.5)));
  });

  it("low-caliber multiplier (q(0.5)): fear gain is less than standard", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    e1.condition.suppressedTicks = 10;
    e1.condition.suppressionFearMul = SCALE.Q as Q;
    e1.condition.fearQ = q(0);
    const w1 = mkWorld(42, [e1]);
    runTick(w1, noCmd());
    const fearStd = w1.entities[0]!.condition.fearQ;

    const e2 = mkHumanoidEntity(1, 1, 0, 0);
    e2.condition.suppressedTicks = 10;
    e2.condition.suppressionFearMul = q(0.5);
    e2.condition.fearQ = q(0);
    const w2 = mkWorld(42, [e2]);
    runTick(w2, noCmd());
    const fearLow = w2.entities[0]!.condition.fearQ;

    expect(fearLow).toBeLessThan(fearStd);
  });

  it("suppressionFearMul is stored on target when shot suppresses", () => {
    // Use a custom multiplier so we can detect it was written
    const customMul = q(2.5);
    const bow = {
      ...STARTER_RANGED_WEAPONS.find(w => w.id === "rng_shortbow")!,
      suppressionFearMul: customMul,
    };

    let suppressionFound = false;
    for (let seed = 1; seed <= 500 && !suppressionFound; seed++) {
      const shooter = mkHumanoidEntity(1, 1, 0, 0);
      shooter.loadout.items = [bow as any];
      // At 50m the grouping radius exceeds body half-width, making suppression possible.
      // At 8m the error circle is too small — the shot always hits.
      const target = mkHumanoidEntity(2, 2, Math.trunc(50 * M), 0);
      const world = mkWorld(seed, [shooter, target]);
      const cmds: CommandMap = new Map([
        [1, [{ kind: "shoot", targetId: 2, weaponId: "rng_shortbow", intensity: q(1.0) }]],
      ]);
      runTick(world, cmds);
      const t = world.entities.find(e => e.id === 2)!;
      if (t.condition.suppressedTicks > 0 && !t.injury.dead) {
        expect(t.condition.suppressionFearMul).toBe(customMul);
        suppressionFound = true;
      }
    }
    expect(suppressionFound).toBe(true);
  });
});

// ── Feature 2: Fear memory and diminishing returns ────────────────────────────

// Helper: create a standard dying-ally + survivor pair and run one tick.
// Returns the survivor's fearQ after the tick.
function allyDeathFear(recentDeaths: number, lastDeathTick: number): Q {
  const dyingAlly = mkHumanoidEntity(2, 1, 500, 0);
  dyingAlly.injury.shock = q(0.99) as Q;
  dyingAlly.injury.consciousness = q(0.001) as Q; // will drop to 0 → dead

  const survivor = mkHumanoidEntity(3, 1, 0, 0);
  survivor.condition.fearQ = q(0);
  survivor.condition.recentAllyDeaths = recentDeaths;
  survivor.condition.lastAllyDeathTick = lastDeathTick;

  const world = mkWorld(42, [dyingAlly, survivor]);
  runTick(world, noCmd());

  const surv = world.entities.find(e => e.id === 3)!;
  expect(world.entities.find(e => e.id === 2)!.injury.dead).toBe(true);
  return surv.condition.fearQ;
}

describe("fear memory — diminishing returns on ally death", () => {
  it("first ally death uses full FEAR_FOR_ALLY_DEATH weight", () => {
    const fear = allyDeathFear(0, 0);
    // FEAR_FOR_ALLY_DEATH × q(1.0) - decay; net is positive
    expect(fear).toBeGreaterThan(0);
  });

  it("second ally death within 5 s window uses reduced weight (×0.85)", () => {
    const fearFull = allyDeathFear(0, 0);   // recentDeaths=0 → ×1.0
    const fearRed  = allyDeathFear(1, 0);   // recentDeaths=1 → ×0.85; lastTick=0 ≤ window
    expect(fearRed).toBeLessThan(fearFull);
  });

  it("deaths after 5 s window reset counter — full weight again", () => {
    const fearFull  = allyDeathFear(0, 0);    // baseline: no prior deaths
    // recentDeaths=5 but lastDeathTick=-200: window check 0-(-200)=200 > 100 → reset
    const fearReset = allyDeathFear(5, -200);
    // Both should use full weight → same fearQ
    expect(fearReset).toBe(fearFull);
  });

  it("4+ prior deaths floors multiplier at q(0.40)", () => {
    // recentDeaths=4 → mul = max(q(0.40), q(1.0)-6000) = max(4000,4000) = q(0.40)
    // recentDeaths=5 → mul = max(q(0.40), q(1.0)-7500) = max(4000,2500) = q(0.40) (floored)
    const fear4 = allyDeathFear(4, 0);
    const fear5 = allyDeathFear(5, 0);
    // Both at floor → same fear
    expect(fear4).toBe(fear5);
    // And both are less than the full-weight case
    const fearFull = allyDeathFear(0, 0);
    expect(fear4).toBeLessThan(fearFull);
  });
});

// ── Feature 3: Leader and standard-bearer auras ───────────────────────────────

describe("leader and standard-bearer morale auras", () => {
  it("leader within 20 m reduces ally fearQ more than without leader", () => {
    // No leader baseline
    const solo = mkHumanoidEntity(1, 1, 0, 0);
    solo.condition.fearQ = q(0.40);
    const wSolo = mkWorld(42, [solo]);
    runTick(wSolo, noCmd());
    const fearSolo = wSolo.entities[0]!.condition.fearQ;

    // With leader ally 10 m away, same team
    const e2 = mkHumanoidEntity(1, 1, 0, 0);
    e2.condition.fearQ = q(0.40);
    const leader = mkHumanoidEntity(2, 1, Math.trunc(10 * M), 0);
    (leader as any).traits = ["leader"];
    const wLead = mkWorld(42, [e2, leader]);
    runTick(wLead, noCmd());
    const fearWithLeader = wLead.entities.find(e => e.id === 1)!.condition.fearQ;

    expect(fearWithLeader).toBeLessThan(fearSolo);
  });

  it("standardBearer within 20 m reduces ally fearQ (smaller bonus than leader)", () => {
    // With leader
    const eLeader = mkHumanoidEntity(1, 1, 0, 0);
    eLeader.condition.fearQ = q(0.40);
    const leader = mkHumanoidEntity(2, 1, Math.trunc(10 * M), 0);
    (leader as any).traits = ["leader"];
    const wLead = mkWorld(42, [eLeader, leader]);
    runTick(wLead, noCmd());
    const fearWithLeader = wLead.entities.find(e => e.id === 1)!.condition.fearQ;

    // With banner
    const eBanner = mkHumanoidEntity(1, 1, 0, 0);
    eBanner.condition.fearQ = q(0.40);
    const banner = mkHumanoidEntity(2, 1, Math.trunc(10 * M), 0);
    (banner as any).traits = ["standardBearer"];
    const wBanner = mkWorld(42, [eBanner, banner]);
    runTick(wBanner, noCmd());
    const fearWithBanner = wBanner.entities.find(e => e.id === 1)!.condition.fearQ;

    // Solo baseline
    const eSolo = mkHumanoidEntity(1, 1, 0, 0);
    eSolo.condition.fearQ = q(0.40);
    const wSolo = mkWorld(42, [eSolo]);
    runTick(wSolo, noCmd());
    const fearSolo = wSolo.entities[0]!.condition.fearQ;

    expect(fearWithBanner).toBeLessThan(fearSolo);       // banner helps
    expect(fearWithLeader).toBeLessThan(fearWithBanner); // leader helps more
  });

  it("leader at 25 m (beyond AURA_RADIUS_m=20 m) provides less reduction than leader at 10 m", () => {
    // Leader at 10 m — within both MORALE_RADIUS (30m) and AURA_RADIUS (20m)
    const eClose = mkHumanoidEntity(1, 1, 0, 0);
    eClose.condition.fearQ = q(0.40);
    const closeLeader = mkHumanoidEntity(2, 1, Math.trunc(10 * M), 0);
    (closeLeader as any).traits = ["leader"];
    const wClose = mkWorld(42, [eClose, closeLeader]);
    runTick(wClose, noCmd());
    const fearClose = wClose.entities.find(e => e.id === 1)!.condition.fearQ;

    // Leader at 25 m — within MORALE_RADIUS (30m) for cohesion but beyond AURA_RADIUS (20m) for bonus
    const eFar = mkHumanoidEntity(1, 1, 0, 0);
    eFar.condition.fearQ = q(0.40);
    const farLeader = mkHumanoidEntity(2, 1, Math.trunc(25 * M), 0);
    (farLeader as any).traits = ["leader"];
    const wFar = mkWorld(42, [eFar, farLeader]);
    runTick(wFar, noCmd());
    const fearFar = wFar.entities.find(e => e.id === 1)!.condition.fearQ;

    // Close leader gives aura bonus ON TOP of cohesion → lower fear than far leader
    expect(fearClose).toBeLessThan(fearFar);
  });

  it("enemy leader provides no fear reduction to opposing team", () => {
    // Solo baseline (entity 1, team 1)
    const eSolo = mkHumanoidEntity(1, 1, 0, 0);
    eSolo.condition.fearQ = q(0.40);
    const wSolo = mkWorld(42, [eSolo]);
    runTick(wSolo, noCmd());
    const fearSolo = wSolo.entities[0]!.condition.fearQ;

    // Enemy leader (team 2) within 20 m
    const e2 = mkHumanoidEntity(1, 1, 0, 0);
    e2.condition.fearQ = q(0.40);
    const enemyLeader = mkHumanoidEntity(2, 2, Math.trunc(10 * M), 0); // DIFFERENT team
    (enemyLeader as any).traits = ["leader"];
    const wEnemy = mkWorld(42, [e2, enemyLeader]);
    runTick(wEnemy, noCmd());
    const fearEnemyLeader = wEnemy.entities.find(e => e.id === 1)!.condition.fearQ;

    // No benefit from enemy leader
    expect(fearEnemyLeader).toBe(fearSolo);
  });
});

// ── Feature 4: Panic action variety ──────────────────────────────────────────

describe("panic action variety", () => {
  it("surrendered entity always returns passive commands (defend-none + prone)", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    (self.condition as any).surrendered = true;
    const world = mkWorld(42, [self]);
    const { index, spatial } = mkDecideCtx(world as any);

    for (let tick = 0; tick < 5; tick++) {
      (world as any).tick = tick;
      const cmds = decideCommandsForEntity(
        world as any, index, spatial, self, defaultPolicy(),
      );
      expect(cmds.some(c => c.kind === "defend" && (c as any).mode === "none")).toBe(true);
      expect(cmds.some(c => c.kind === "setProne" && (c as any).prone === true)).toBe(true);
      expect(cmds.some(c => c.kind === "attack")).toBe(false);
    }
  });

  it("high-distressTol routing entity always flees (zero surrender/freeze chance)", () => {
    // distressTol = q(1.0) → surrenderChance = 0, freezeChance = 0
    const self = mkHumanoidEntity(1, 1, 0, 0);
    self.attributes.resilience.distressTolerance = q(1.0);
    // moraleThreshold = q(0.80); set fearQ above it
    self.condition.fearQ = q(0.90) as Q;
    const enemy = mkHumanoidEntity(2, 2, Math.trunc(5 * M), 0);
    const world = mkWorld(42, [self, enemy]);
    const { index, spatial } = mkDecideCtx(world as any);

    // Sweep over seeds — reset AI cooldown each time so routing path is always reached
    for (let seed = 1; seed <= 100; seed++) {
      (world as any).seed = seed;
      (world as any).tick = seed; // vary tick too
      ((self as any).ai ??= { focusTargetId: 0, retargetCooldownTicks: 0, decisionCooldownTicks: 0 }).decisionCooldownTicks = 0; // reset so routing check runs
      (self.condition as any).surrendered = false;
      const cmds = decideCommandsForEntity(
        world as any, index, spatial, self, defaultPolicy(),
      );
      // Must never surrender (chance = 0 with distressTol = q(1.0))
      expect((self.condition as any).surrendered).toBe(false);
      // Should include a flee move command when there's a target
      const hasMove = cmds.some(c => c.kind === "move" && (c as any).intensity > 0);
      expect(hasMove).toBe(true);
    }
  });

  it("low-distressTol routing entity can surrender (found in seed sweep)", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    self.attributes.resilience.distressTolerance = q(0.10);
    // moraleThreshold ≈ q(0.53); set fearQ well above it
    self.condition.fearQ = q(0.70) as Q;
    const enemy = mkHumanoidEntity(2, 2, Math.trunc(5 * M), 0);
    const world = mkWorld(1, [self, enemy]);
    const { index, spatial } = mkDecideCtx(world as any);

    let surrenderFound = false;
    for (let seed = 1; seed <= 500 && !surrenderFound; seed++) {
      // Reset per-iteration state so routing block runs each time
      (self.condition as any).surrendered = false;
      ((self as any).ai ??= { focusTargetId: 0, retargetCooldownTicks: 0, decisionCooldownTicks: 0 }).decisionCooldownTicks = 0;
      (world as any).seed = seed;
      (world as any).tick = 0;
      decideCommandsForEntity(world as any, index, spatial, self, defaultPolicy());
      if ((self.condition as any).surrendered) surrenderFound = true;
    }
    expect(surrenderFound).toBe(true);
  });

  it("low-distressTol routing entity can freeze (returns empty commands)", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    self.attributes.resilience.distressTolerance = q(0.10);
    self.condition.fearQ = q(0.70) as Q;
    const enemy = mkHumanoidEntity(2, 2, Math.trunc(5 * M), 0);
    const world = mkWorld(1, [self, enemy]);
    const { index, spatial } = mkDecideCtx(world as any);

    let freezeFound = false;
    for (let seed = 1; seed <= 500 && !freezeFound; seed++) {
      (self.condition as any).surrendered = false;
      ((self as any).ai ??= { focusTargetId: 0, retargetCooldownTicks: 0, decisionCooldownTicks: 0 }).decisionCooldownTicks = 0;
      (world as any).seed = seed;
      (world as any).tick = 0;
      const cmds = decideCommandsForEntity(world as any, index, spatial, self, defaultPolicy());
      // Freeze = returns [] (empty commands; not surrendered)
      if (cmds.length === 0 && !(self.condition as any).surrendered) freezeFound = true;
    }
    expect(freezeFound).toBe(true);
  });

  it("panic rolls are deterministic — same seed/tick/entity always same outcome", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    self.attributes.resilience.distressTolerance = q(0.10);
    self.condition.fearQ = q(0.70) as Q;
    const enemy = mkHumanoidEntity(2, 2, Math.trunc(5 * M), 0);
    const world = mkWorld(99, [self, enemy]);
    const { index, spatial } = mkDecideCtx(world as any);

    // First call — reset cooldown so routing block is always reached
    (world as any).tick = 5;
    (self.condition as any).surrendered = false;
    ((self as any).ai ??= { focusTargetId: 0, retargetCooldownTicks: 0, decisionCooldownTicks: 0 }).decisionCooldownTicks = 0;
    const cmds1 = decideCommandsForEntity(world as any, index, spatial, self, defaultPolicy());

    // Second call with identical state
    (world as any).tick = 5;
    (self.condition as any).surrendered = false;
    ((self as any).ai ??= { focusTargetId: 0, retargetCooldownTicks: 0, decisionCooldownTicks: 0 }).decisionCooldownTicks = 0;
    const cmds2 = decideCommandsForEntity(world as any, index, spatial, self, defaultPolicy());

    expect(cmds1.length).toBe(cmds2.length);
    for (let i = 0; i < cmds1.length; i++) {
      expect(JSON.stringify(cmds1[i])).toBe(JSON.stringify(cmds2[i]));
    }
  });
});

// ── Feature 5: Rally mechanic ─────────────────────────────────────────────────

describe("rally mechanic", () => {
  it("rallyCooldownTicks set to RALLY_COOLDOWN_TICKS when fear drops below routing threshold", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.attributes.resilience.distressTolerance = q(0.50);
    // moraleThreshold(q(0.50)) = q(0.50) + qMul(q(0.50), q(0.30)) = 5000 + 1500 = 6500
    // fearQ just above: should drop below in 1 tick
    e.condition.fearQ = (6500 + 10) as Q; // just above threshold

    // Add a non-routing ally so routing fraction = 1/2 = 0.50, which is NOT > 0.50.
    // This prevents the routing cascade (+300 fear/tick) from firing.
    const ally = mkHumanoidEntity(2, 1, Math.trunc(10 * M), 0);
    ally.condition.fearQ = q(0); // not routing

    const world = mkWorld(42, [e, ally]);
    runTick(world, noCmd());
    const ent = world.entities.find(en => en.id === 1)!;
    // After tick: fear decayed below threshold → wasRouting && !nowRouting → rally triggered
    expect(ent.condition.rallyCooldownTicks).toBe(RALLY_COOLDOWN_TICKS);
  });

  it("rallyCooldownTicks decrements by 1 per tick (min 0)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.condition.rallyCooldownTicks = 10;
    const world = mkWorld(42, [e]);
    runTick(world, noCmd());
    expect(world.entities[0]!.condition.rallyCooldownTicks).toBe(9);
    runTick(world, noCmd());
    expect(world.entities[0]!.condition.rallyCooldownTicks).toBe(8);
  });

  it("rallying entity suppresses attack commands", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    const weapon = STARTER_WEAPONS[0]!;
    self.loadout.items = [weapon];
    self.condition.rallyCooldownTicks = 5; // rallying
    self.condition.fearQ = q(0.10) as Q;   // not routing

    const target = mkHumanoidEntity(2, 2, Math.trunc(0.3 * M), 0); // very close — within reach
    const world = mkWorld(42, [self, target]);
    const { index, spatial } = mkDecideCtx(world as any);

    const cmds = decideCommandsForEntity(world as any, index, spatial, self, defaultPolicy());
    expect(cmds.some(c => c.kind === "attack")).toBe(false);
  });

  it("at rallyCooldownTicks=0 attacks resume", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    const weapon = STARTER_WEAPONS[0]!;
    self.loadout.items = [weapon];
    self.condition.rallyCooldownTicks = 0; // NOT rallying
    self.condition.fearQ = q(0.10) as Q;

    const reach = weapon.reach_m ?? Math.trunc(self.attributes.morphology.stature_m * 0.45);
    const target = mkHumanoidEntity(2, 2, reach - Math.trunc(0.1 * M), 0); // within reach
    const world = mkWorld(42, [self, target]);
    const { index, spatial } = mkDecideCtx(world as any);

    const cmds = decideCommandsForEntity(world as any, index, spatial, self, defaultPolicy());
    expect(cmds.some(c => c.kind === "attack")).toBe(true);
  });
});

// ── Feature 6: Entity archetype fear response ─────────────────────────────────

describe("berserk fear response", () => {
  it("berserk entity: fearQ stays 0 regardless of stimuli", () => {
    // Entity surrounded by enemies, suppressed, and has shock — would normally accumulate lots of fear
    const e = mkHumanoidEntity(1, 1, 0, 0);
    (e.attributes.resilience as any).fearResponse = "berserk";
    e.condition.fearQ = q(0.30) as Q; // start with some fear
    e.condition.suppressedTicks = 10;
    e.injury.shock = q(0.50) as Q;

    // Three enemies nearby
    const en1 = mkHumanoidEntity(2, 2, Math.trunc(5 * M), 0);
    const en2 = mkHumanoidEntity(3, 2, Math.trunc(6 * M), 0);
    const en3 = mkHumanoidEntity(4, 2, Math.trunc(7 * M), 0);

    const world = mkWorld(42, [e, en1, en2, en3]);
    runTick(world, noCmd());
    expect(world.entities.find(e => e.id === 1)!.condition.fearQ).toBe(0);
  });

  it("berserk entity: isRouting never returns true", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    (e.attributes.resilience as any).fearResponse = "berserk";
    e.condition.suppressedTicks = 100;
    e.injury.shock = q(0.80) as Q;
    const en1 = mkHumanoidEntity(2, 2, Math.trunc(5 * M), 0);
    const en2 = mkHumanoidEntity(3, 2, Math.trunc(6 * M), 0);

    const world = mkWorld(42, [e, en1, en2]);
    for (let i = 0; i < 20; i++) {
      runTick(world, noCmd());
      const ent = world.entities.find(e => e.id === 1)!;
      expect(isRouting(ent.condition.fearQ, ent.attributes.resilience.distressTolerance)).toBe(false);
    }
  });

  it("berserk entity: never routes or hesitates in AI", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    (self.attributes.resilience as any).fearResponse = "berserk";
    // Force berserk entity to have max fear (would normally route)
    self.condition.fearQ = q(0.99) as Q;
    const weapon = STARTER_WEAPONS[0]!;
    self.loadout.items = [weapon];

    const reach = weapon.reach_m ?? Math.trunc(self.attributes.morphology.stature_m * 0.45);
    const enemy = mkHumanoidEntity(2, 2, reach - Math.trunc(0.1 * M), 0);
    const world = mkWorld(42, [self, enemy]);
    const { index, spatial } = mkDecideCtx(world as any);

    const cmds = decideCommandsForEntity(world as any, index, spatial, self, defaultPolicy());
    // Should have attack (not routing/hesitant)
    expect(cmds.some(c => c.kind === "attack")).toBe(true);
  });
});

describe("freeze fear response", () => {
  it("freeze archetype: returns [] when routing instead of flee commands", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    (self.attributes.resilience as any).fearResponse = "freeze";
    // moraleThreshold for distressTol ≈ 0.5: q(0.65)
    self.condition.fearQ = q(0.80) as Q; // well above threshold
    const enemy = mkHumanoidEntity(2, 2, Math.trunc(5 * M), 0);
    const world = mkWorld(42, [self, enemy]);
    const { index, spatial } = mkDecideCtx(world as any);

    const cmds = decideCommandsForEntity(world as any, index, spatial, self, defaultPolicy());
    // Freeze archetype: routing → empty commands
    expect(cmds).toHaveLength(0);
  });
});
