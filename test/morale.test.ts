/**
 * Phase 5 — Morale and Psychological State tests
 *
 * Unit tests for pure morale functions, plus kernel integration tests
 * covering fear accumulation, routing, pain blocking, and cascade.
 */
import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units";
import type { Q } from "../src/units";
import {
  fearDecayPerTick,
  moraleThreshold,
  isRouting,
  painLevel,
  painBlocksAction,
  FEAR_FOR_ALLY_DEATH,
  FEAR_SURPRISE,
  FEAR_ROUTING_CASCADE,
} from "../src/sim/morale";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld } from "../src/sim/kernel";
import { buildWorldIndex } from "../src/sim/indexing";
import { buildSpatialIndex } from "../src/sim/spatial";
import { STARTER_WEAPONS } from "../src/equipment";
import type { CommandMap } from "../src/sim/commands";
import type { TraceEvent } from "../src/sim/trace";
import { TraceKinds } from "../src/sim/kinds";
import { decideCommandsForEntity } from "../src/sim/ai/decide";
import type { AIPolicy } from "../src/sim/ai/types";
import { v3 } from "../src/sim/vec3";
import { DEFAULT_SENSORY_ENV } from "../src/sim/sensory";
import { deriveFunctionalState } from "../src/sim/impairment";
import { TUNING } from "../src/sim/tuning";

const M = SCALE.m;

// ── helpers ──────────────────────────────────────────────────────────────────

function runTick(world: ReturnType<typeof mkWorld>, cmds: CommandMap, ctx?: object): TraceEvent[] {
  const events: TraceEvent[] = [];
  const trace = { onEvent: (ev: TraceEvent) => events.push(ev) };
  stepWorld(world, cmds, { tractionCoeff: q(0.80), trace, ...ctx });
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

// ── Unit tests: pure morale functions ────────────────────────────────────────

describe("moraleThreshold", () => {
  it("returns q(0.50) when distressTolerance = 0", () => {
    expect(moraleThreshold(q(0))).toBe(q(0.50));
  });

  it("returns q(0.80) when distressTolerance = 1", () => {
    expect(moraleThreshold(q(1.0))).toBe(q(0.80));
  });

  it("returns q(0.65) for average human tolerance q(0.50)", () => {
    // q(0.50) + qMul(q(0.50), q(0.30)) = 5000 + 1500 = 6500 = q(0.65)
    expect(moraleThreshold(q(0.50))).toBe(6500);
  });

  it("clamps to [q(0.50), q(0.80)]", () => {
    expect(moraleThreshold(q(0))).toBeGreaterThanOrEqual(q(0.50));
    expect(moraleThreshold(q(1.0))).toBeLessThanOrEqual(q(0.80));
  });
});

describe("isRouting", () => {
  it("returns false when fearQ is well below threshold", () => {
    expect(isRouting(q(0.20), q(0.50))).toBe(false);
  });

  it("returns true when fearQ meets or exceeds threshold", () => {
    const tol = q(0.50);
    const threshold = moraleThreshold(tol); // 6500
    expect(isRouting(threshold as Q, tol)).toBe(true);
  });

  it("bold entity requires more fear to route", () => {
    const boldTol = q(0.90);
    expect(isRouting(q(0.60), boldTol)).toBe(false);
    expect(isRouting(q(0.80), boldTol)).toBe(true);
  });
});

describe("fearDecayPerTick", () => {
  it("returns > 0 for non-zero tolerance", () => {
    expect(fearDecayPerTick(q(0.50), 0)).toBeGreaterThan(0);
  });

  it("decays faster with higher distressTolerance", () => {
    const low = fearDecayPerTick(q(0.20), 0);
    const high = fearDecayPerTick(q(0.80), 0);
    expect(high).toBeGreaterThan(low);
  });

  it("cohesion from nearby allies increases decay", () => {
    const solo = fearDecayPerTick(q(0.50), 0);
    const withAllies = fearDecayPerTick(q(0.50), 5);
    expect(withAllies).toBeGreaterThan(solo);
  });

  it("caps total decay at q(0.030)", () => {
    expect(fearDecayPerTick(q(1.0), 20)).toBeLessThanOrEqual(q(0.030));
  });

  it("returns 0 when tolerance is 0 and no allies", () => {
    expect(fearDecayPerTick(q(0), 0)).toBe(0);
  });
});

describe("painLevel", () => {
  it("returns 0 when shock is 0", () => {
    expect(painLevel(q(0), q(0.50))).toBe(0);
  });

  it("returns 0 when tolerance is 1.0", () => {
    expect(painLevel(q(0.80), q(1.0))).toBe(0);
  });

  it("returns shock when tolerance is 0", () => {
    expect(painLevel(q(0.80), q(0))).toBe(q(0.80));
  });

  it("scales with (1 - tolerance)", () => {
    const p1 = painLevel(q(0.60), q(0.25));
    const p2 = painLevel(q(0.60), q(0.75));
    expect(p1).toBeGreaterThan(p2);
  });
});

describe("painBlocksAction", () => {
  it("never blocks when shock is 0", () => {
    for (let i = 0; i < 100; i++) {
      expect(painBlocksAction(i * 100, q(0), q(0.50))).toBe(false);
    }
  });

  it("blocks very often when tolerance=0 and shock=1", () => {
    // pain = q(1.0); seed % SCALE.Q < SCALE.Q is true for almost all seeds
    let blocked = 0;
    for (let i = 0; i < 100; i++) {
      if (painBlocksAction(i * 100, q(1.0), q(0))) blocked++;
    }
    // Only seed where seed%10000 == 0 would fail; seed 0 and 10000*k — with step 100 that's 0, 10000 (i=100, not reached)
    // Actually i*100 for i=0 gives seed=0; 0%10000=0; 0 < 10000 → blocks. All 100 block.
    expect(blocked).toBeGreaterThanOrEqual(99);
  });

  it("blocks probabilistically at moderate pain levels", () => {
    // Use seeds spanning [0, SCALE.Q) to get representative sample
    // pain = painLevel(q(0.60), q(0.30)) = qMul(6000, 7000) / 10000 = 4200
    // Expect ~42% blocking rate
    let blockedCount = 0;
    for (let i = 0; i < 100; i++) {
      // seeds: 0, 100, 200, ..., 9900 → well-distributed across [0, 9900]
      if (painBlocksAction(i * 100, q(0.60), q(0.30))) blockedCount++;
    }
    // 4200 out of 10000 → seeds 0..4100 (step 100) block: indices 0..41 = 42 out of 100
    expect(blockedCount).toBeGreaterThan(30);
    expect(blockedCount).toBeLessThan(60);
  });
});

// ── Kernel integration tests ─────────────────────────────────────────────────

describe("fearQ initialised to 0 by default", () => {
  it("defaultCondition includes fearQ = 0", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    expect(e.condition.fearQ).toBe(0);
  });

  it("kernel init guard sets fearQ=0 on old entities without the field", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    delete (e.condition as any).fearQ;
    const world = mkWorld(42, [e]);
    runTick(world, noCmd());
    expect(world.entities[0]!.condition.fearQ).toBeDefined();
    expect(world.entities[0]!.condition.fearQ).toBeGreaterThanOrEqual(0);
  });
});

describe("fear accumulation from suppression", () => {
  it("increases fearQ each tick while suppressedTicks > 0", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.condition.suppressedTicks = 10;
    e.condition.fearQ = q(0.10);
    const world = mkWorld(42, [e]);

    const before = world.entities[0]!.condition.fearQ;
    runTick(world, noCmd());
    const after = world.entities[0]!.condition.fearQ;

    // FEAR_PER_SUPPRESSION_TICK = q(0.020) added; decay removes ~q(0.004) → net positive
    expect(after).toBeGreaterThan(before);
  });

  it("fearQ stays 0 when not suppressed and no threats", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.condition.suppressedTicks = 0;
    e.condition.fearQ = q(0);
    const world = mkWorld(42, [e]);
    runTick(world, noCmd());
    expect(world.entities[0]!.condition.fearQ).toBe(0);
  });
});

describe("fear decay", () => {
  it("fearQ decreases over ticks with no threats and initial fear", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.condition.fearQ = q(0.30); // Below routing threshold, no shock
    const world = mkWorld(42, [e]);
    // Run for many ticks
    for (let i = 0; i < 60; i++) runTick(world, noCmd());
    expect(world.entities[0]!.condition.fearQ).toBeLessThan(q(0.30));
  });
});

describe("MoraleRoute trace event", () => {
  it("emits MoraleRoute when entity crosses into routing", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    // moraleThreshold(~q(0.50)) ≈ q(0.65) for average human
    // Push fear just below threshold; suppression each tick adds FEAR_PER_SUPPRESSION_TICK=q(0.020)
    e.condition.fearQ = q(0.62);
    e.condition.suppressedTicks = 100;
    const world = mkWorld(42, [e]);

    const allEvents: TraceEvent[] = [];
    for (let i = 0; i < 5; i++) {
      allEvents.push(...runTick(world, noCmd()));
    }

    const moraleEvents = allEvents.filter(ev => ev.kind === TraceKinds.MoraleRoute);
    expect(moraleEvents.length).toBeGreaterThan(0);
    expect((moraleEvents[0] as any).entityId).toBe(1);
  });
});

describe("ally death adds fear to nearby survivors", () => {
  it("survivor detects ally dying this tick and gains fear", () => {
    // Use IDs 2=dying_ally, 3=survivor so ally (ID 2) is processed first in sorted order
    const dyingAlly = mkHumanoidEntity(2, 1, 500, 0); // 0.05m from survivor
    const survivor = mkHumanoidEntity(3, 1, 0, 0);

    // Ally is mortally wounded: will die from stepInjuryProgression this tick
    // consciousness=q(0.001)=10, shock=q(0.99)=9900
    // loss = qMul(q(0.99), q(0.010)) = 99 → consciousness 10-99 = clamped to 0 → dead
    dyingAlly.injury.shock = q(0.99) as Q;
    dyingAlly.injury.consciousness = q(0.001) as Q; // 10 — will drop to 0

    survivor.condition.fearQ = q(0.10);

    const world = mkWorld(42, [dyingAlly, survivor]);
    const before = world.entities.find(e => e.id === 3)!.condition.fearQ;
    runTick(world, noCmd());

    const allyEnt = world.entities.find(e => e.id === 2)!;
    const survEnt = world.entities.find(e => e.id === 3)!;

    // Ally should have died
    expect(allyEnt.injury.dead).toBe(true);

    // Survivor should have gained fear from FEAR_FOR_ALLY_DEATH
    // FEAR_FOR_ALLY_DEATH = q(0.150) = 1500; decay ≈ q(0.004) = 40
    // Net gain ≈ 1460; before = 1000; after ≈ 2460
    expect(survEnt.condition.fearQ).toBeGreaterThan(before);
  });
});

describe("routing cascade", () => {
  it("adds fear when over half of team is routing", () => {
    // Use IDs 2=routing_ally1, 3=routing_ally2, 4=non-routing entity we observe
    // IDs 2 and 3 are processed before 4 in the routing fraction precomputation
    const routing1 = mkHumanoidEntity(2, 1, 1000, 0);
    const routing2 = mkHumanoidEntity(3, 1, 2000, 0);
    const observer = mkHumanoidEntity(4, 1, 0, 0);

    // Force routing on allies: fear >> threshold
    routing1.condition.fearQ = q(0.85) as Q;
    routing2.condition.fearQ = q(0.85) as Q;
    observer.condition.fearQ = q(0); // not routing

    const world = mkWorld(42, [routing1, routing2, observer]);
    const before = q(0);
    runTick(world, noCmd());

    const obs = world.entities.find(e => e.id === 4)!;
    // FEAR_ROUTING_CASCADE = q(0.030) = 300; decay ≈ 40; net = +260
    expect(obs.condition.fearQ).toBeGreaterThan(before);
  });
});

describe("routing causes AI to flee", () => {
  it("routing entity moves away from nearest threat", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    const enemy = mkHumanoidEntity(2, 2, Math.trunc(0.5 * M), 0); // 0.5m in +x

    // Force routing: fear well above threshold
    self.condition.fearQ = q(0.85) as Q;

    const world = mkWorld(42, [self, enemy]);
    const index = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * M));

    const cmds = decideCommandsForEntity(world, index, spatial, self, defaultPolicy());
    const moveCmd = cmds.find(c => c.kind === "move");

    expect(moveCmd).toBeDefined();
    if (moveCmd && moveCmd.kind === "move") {
      // Fleeing from +x enemy → dir should point in -x direction
      expect(moveCmd.dir.x).toBeLessThan(0);
      expect((moveCmd as any).mode).toBe("sprint");
    }

    // Routing entity should not issue an attack command
    const attackCmd = cmds.find(c => c.kind === "attack");
    expect(attackCmd).toBeUndefined();
  });

  it("routing entity with no visible threat returns only defend command", () => {
    // Entity is routing but no enemies exist in the world
    const self = mkHumanoidEntity(1, 1, 0, 0);
    self.condition.fearQ = q(0.85) as Q;

    const world = mkWorld(42, [self]); // solo — no threats
    const index = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * M));

    const cmds = decideCommandsForEntity(world, index, spatial, self, defaultPolicy());

    // Should get a defend command and NO move command (no threat to flee from)
    const defendCmd = cmds.find(c => c.kind === "defend");
    const moveCmd = cmds.find(c => c.kind === "move");
    expect(defendCmd).toBeDefined();
    expect(moveCmd).toBeUndefined();
  });

  it("non-routing entity with no targets emits a no-move command", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    self.condition.fearQ = q(0); // not routing

    const world = mkWorld(42, [self]); // solo — no enemies
    const index = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * M));

    const cmds = decideCommandsForEntity(world, index, spatial, self, defaultPolicy());

    // Should emit defend + zero-intensity move
    const moveCmd = cmds.find(c => c.kind === "move");
    expect(moveCmd).toBeDefined();
    if (moveCmd && moveCmd.kind === "move") {
      expect(moveCmd.intensity).toBe(0);
    }
  });
});

describe("pain blocking in resolveAttack", () => {
  it("high shock reduces attack rate vs no shock", () => {
    const wpn = STARTER_WEAPONS[0]!; // wpn_club — guaranteed to exist

    let hitsNoShock = 0;
    let hitsHighShock = 0;

    for (let seed = 1; seed <= 80; seed++) {
      // No shock run
      {
        const attacker = mkHumanoidEntity(1, 1, 0, 0);
        const target = mkHumanoidEntity(2, 2, Math.trunc(0.5 * M), 0);
        attacker.loadout.items = [wpn];
        attacker.injury.shock = q(0) as Q;

        const world = mkWorld(seed, [attacker, target]);
        const cmds: CommandMap = new Map([
          [1, [{ kind: "attack", targetId: 2, weaponId: wpn.id, intensity: q(1.0), mode: "strike" }]],
        ]);
        const events: TraceEvent[] = [];
        stepWorld(world, cmds, { tractionCoeff: q(0.80), trace: { onEvent: (ev) => events.push(ev) } });
        if (events.some(ev => ev.kind === TraceKinds.Attack && (ev as any).attackerId === 1)) hitsNoShock++;
      }

      // High shock run
      {
        const attacker = mkHumanoidEntity(1, 1, 0, 0);
        const target = mkHumanoidEntity(2, 2, Math.trunc(0.5 * M), 0);
        attacker.loadout.items = [wpn];
        // High shock: distressTolerance ≈ q(0.50), painLevel ≈ q(0.60)*q(0.50) = q(0.30)
        attacker.injury.shock = q(0.60) as Q;

        const world = mkWorld(seed, [attacker, target]);
        const cmds: CommandMap = new Map([
          [1, [{ kind: "attack", targetId: 2, weaponId: wpn.id, intensity: q(1.0), mode: "strike" }]],
        ]);
        const events: TraceEvent[] = [];
        stepWorld(world, cmds, { tractionCoeff: q(0.80), trace: { onEvent: (ev) => events.push(ev) } });
        if (events.some(ev => ev.kind === TraceKinds.Attack && (ev as any).attackerId === 1)) hitsHighShock++;
      }
    }

    // No shock: pain blocking never fires → most attacks proceed
    expect(hitsNoShock).toBeGreaterThan(hitsHighShock);
    expect(hitsNoShock).toBeGreaterThan(50); // sanity check: attacks are generally getting through
  });
});

describe("surprise adds fear to defender", () => {
  it("full-surprise attack (attacker undetectable) adds fear to target", () => {
    // Attacker is behind target (outside 120° vision arc)
    // and noiseMul=0 disables hearing → canDetect = 0 → full surprise
    const attacker = mkHumanoidEntity(1, 1, -Math.trunc(0.5 * M), 0); // 0.5m behind target
    const target = mkHumanoidEntity(2, 2, 0, 0); // at origin, default facing +x

    const wpn = STARTER_WEAPONS[0]!; // wpn_club
    attacker.loadout.items = [wpn];
    target.condition.fearQ = q(0);

    const world = mkWorld(42, [attacker, target]);
    // Silent env: noiseMul=0 disables hearing → target cannot hear attacker behind it
    const silentEnv = { lightMul: q(1.0) as Q, smokeMul: q(1.0) as Q, noiseMul: q(0) as Q };

    const cmds: CommandMap = new Map([
      [1, [{ kind: "attack", targetId: 2, weaponId: wpn.id, intensity: q(1.0), mode: "strike" }]],
    ]);
    runTick(world, cmds, { sensoryEnv: silentEnv });

    const targetFear = world.entities.find(e => e.id === 2)!.condition.fearQ;
    // FEAR_SURPRISE = q(0.080) added on full surprise; decay removes ~q(0.004)
    // Even if attack misses, fear spike was added in resolveAttack
    expect(targetFear).toBeGreaterThan(0);
  });

  it("visible attacker does not add FEAR_SURPRISE to defender", () => {
    // Attacker in front of target (fully visible) — no surprise fear
    const attacker = mkHumanoidEntity(1, 1, Math.trunc(0.5 * M), 0); // 0.5m in front
    const target = mkHumanoidEntity(2, 2, 0, 0); // facing +x → attacker is visible

    const wpn = STARTER_WEAPONS[0]!;
    attacker.loadout.items = [wpn];
    target.condition.fearQ = q(0);

    const world = mkWorld(42, [attacker, target]);
    const cmds: CommandMap = new Map([
      [1, [{ kind: "attack", targetId: 2, weaponId: wpn.id, intensity: q(1.0), mode: "strike" }]],
    ]);
    runTick(world, cmds);

    const targetFear = world.entities.find(e => e.id === 2)!.condition.fearQ;
    // No surprise spike; only shock-based morale effects (likely 0 if miss, small if hit)
    // Attacker at +0.5m is in vision → canDetect ≈ q(1.0) → no FEAR_SURPRISE
    // Without shock, fearQ should remain 0 or very small (just from outnumbering/injury)
    // With default env, attacker IS visible → FEAR_SURPRISE is NOT added
    // We check it's less than FEAR_SURPRISE since no surprise spike occurred
    expect(targetFear).toBeLessThan(FEAR_SURPRISE);
  });

  it("genuinely outnumbered (1 vs 2 enemies) accumulates fear; equal teams do not", () => {
    // 1 entity (id=1, team 1) vs 2 enemies (id=2,3 team 2) — 30m radius, all visible
    const alone = mkHumanoidEntity(1, 1, 0, 0);
    const e2    = mkHumanoidEntity(2, 2, Math.trunc(1 * SCALE.m), 0);
    const e3    = mkHumanoidEntity(3, 2, Math.trunc(2 * SCALE.m), 0);
    const world = mkWorld(1, [alone, e2, e3]);

    const cmds: CommandMap = new Map();
    stepWorld(world, cmds, { tractionCoeff: q(0.80) });

    // 2 enemies vs 0 allies+1 self = 2 > 1 → outnumbered fear fires
    const fearAlone = world.entities[0]!.condition.fearQ;
    expect(fearAlone).toBeGreaterThan(0);

    // Equal 2v2: nobody should be outnumbered (2 enemies vs 1 ally + self = 2)
    const a1 = mkHumanoidEntity(1, 1, 0, 0);
    const a2 = mkHumanoidEntity(2, 1, Math.trunc(0.5 * SCALE.m), 0);
    const b1 = mkHumanoidEntity(3, 2, Math.trunc(1.0 * SCALE.m), 0);
    const b2 = mkHumanoidEntity(4, 2, Math.trunc(1.5 * SCALE.m), 0);
    const world2 = mkWorld(2, [a1, a2, b1, b2]);

    stepWorld(world2, new Map(), { tractionCoeff: q(0.80) });

    // In a 2v2 all within 30m: 2 enemies vs 1 ally + self = 2 → NOT outnumbered (2 > 2 is false)
    for (const e of world2.entities) {
      expect((e.condition as any).fearQ ?? 0).toBe(0);
    }
  });
});

describe("fear degrades combat performance (impairment)", () => {
  it("high fear reduces coordinationMul relative to zero fear", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);

    // Zero fear baseline
    e.condition.fearQ = q(0);
    const funcBase = deriveFunctionalState(e, TUNING.tactical);

    // High fear
    e.condition.fearQ = q(0.80) as Q;
    const funcHigh = deriveFunctionalState(e, TUNING.tactical);

    // fear penalty = qMul(q(0.80), q(0.15)) = 12 → coordination should be lower
    expect(funcHigh.coordinationMul).toBeLessThan(funcBase.coordinationMul);
    expect(funcHigh.manipulationMul).toBeLessThan(funcBase.manipulationMul);
  });

  it("fear penalty is proportional to fearQ", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);

    e.condition.fearQ = q(0.30) as Q;
    const funcLow = deriveFunctionalState(e, TUNING.tactical);

    e.condition.fearQ = q(0.70) as Q;
    const funcHigh = deriveFunctionalState(e, TUNING.tactical);

    // More fear → lower coordination
    expect(funcHigh.coordinationMul).toBeLessThan(funcLow.coordinationMul);
  });
});

describe("hesitant state suppresses AI attacks", () => {
  it("entity at >70% routing threshold does not issue attack commands", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    const enemy = mkHumanoidEntity(2, 2, Math.trunc(0.5 * M), 0); // 0.5m in +x

    // hesitantThreshold = qMul(moraleThreshold(distressTol), q(0.70))
    // For average human: qMul(6500, 7000) / 10000 ≈ 4550
    // Set fear just above that, but below routing threshold (6500)
    const tol = self.attributes.resilience.distressTolerance;
    const threshold = moraleThreshold(tol);
    // Fear = 80% of threshold → hesitant but not routing
    self.condition.fearQ = Math.trunc(threshold * 0.80) as Q;

    const world = mkWorld(42, [self, enemy]);
    const index = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * M));

    // Add a weapon so the entity would normally attack
    const wpn = STARTER_WEAPONS[0]!;
    self.loadout.items = [wpn];

    const cmds = decideCommandsForEntity(world, index, spatial, self, defaultPolicy());

    // Should NOT attack while hesitant
    const attackCmd = cmds.find(c => c.kind === "attack");
    expect(attackCmd).toBeUndefined();

    // Should still produce move/defend commands
    const moveCmd = cmds.find(c => c.kind === "move");
    expect(moveCmd).toBeDefined();
  });

  it("entity below hesitant threshold still attacks when in range", () => {
    const self = mkHumanoidEntity(1, 1, 0, 0);
    const enemy = mkHumanoidEntity(2, 2, Math.trunc(0.3 * M), 0); // 0.3m — well within reach

    // Low fear: well below hesitant threshold
    self.condition.fearQ = q(0.10) as Q;

    const wpn = STARTER_WEAPONS[0]!;
    self.loadout.items = [wpn];

    const world = mkWorld(42, [self, enemy]);
    const index = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * M));

    const cmds = decideCommandsForEntity(world, index, spatial, self, defaultPolicy());

    // With low fear and enemy within reach, attack should be issued
    const attackCmd = cmds.find(c => c.kind === "attack");
    expect(attackCmd).toBeDefined();
  });
});

describe("decide.ts branch coverage", () => {
  it("dodge policy picks dodge defence mode when threatened", () => {
    // dodgeBiasQ > parryBiasQ && dodgeBiasQ > q(0.50) → pickDefenceModeDeterministic returns "dodge"
    const self  = mkHumanoidEntity(1, 1, 0, 0);
    const enemy = mkHumanoidEntity(2, 2, Math.trunc(1.0 * M), 0); // within 2m threatRange

    const world   = mkWorld(42, [self, enemy]);
    const index   = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * M));

    const dodgePolicy: AIPolicy = {
      ...defaultPolicy(),
      dodgeBiasQ: q(0.7),  // > parryBiasQ=0.2 and > 0.50 → dodge selected
      parryBiasQ: q(0.2),
    };

    const cmds = decideCommandsForEntity(world, index, spatial, self, dodgePolicy);
    const def = cmds.find(c => c.kind === "defend");
    expect(def).toBeDefined();
    if (def && def.kind === "defend") {
      expect(def.mode).toBe("dodge");
    }
  });

  it("weapon without reach_m uses stature-derived default", () => {
    // weapon.reach_m is undefined → fallback to floor(stature_m × 0.45)
    const self  = mkHumanoidEntity(1, 1, 0, 0);
    // Place enemy within default reach: stature×0.45 = 17500×0.45 ≈ 7875; +0.25m buffer = 10375
    // Use 0.5m (5000) — safely within that
    const enemy = mkHumanoidEntity(2, 2, Math.trunc(0.5 * M), 0);

    // Create weapon without reach_m (optional field)
    const wpnNoReach: any = { ...STARTER_WEAPONS[0], reach_m: undefined };
    self.loadout.items = [wpnNoReach];
    self.condition.fearQ = q(0);

    const world   = mkWorld(42, [self, enemy]);
    const index   = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * M));

    const cmds = decideCommandsForEntity(world, index, spatial, self, defaultPolicy());
    // Should still produce an attack command using the derived reach
    const attackCmd = cmds.find(c => c.kind === "attack");
    expect(attackCmd).toBeDefined();
  });

  it("approxDist handles Y-dominant displacement (ady > adx branch)", () => {
    // Place enemy along Y axis so ady > adx in approxDist
    const self  = mkHumanoidEntity(1, 1, 0, 0);
    const enemy = mkHumanoidEntity(2, 2, 0, Math.trunc(0.5 * M)); // 0.5m along Y

    const wpn = STARTER_WEAPONS[0]!;
    self.loadout.items = [wpn];

    const world   = mkWorld(42, [self, enemy]);
    const index   = buildWorldIndex(world);
    const spatial = buildSpatialIndex(world, Math.trunc(4 * M));

    const cmds = decideCommandsForEntity(world, index, spatial, self, defaultPolicy());
    // Enemy is at dy=0.5m, dx=0 — ady(5000) > adx(0) → takes the ady+adx>>1 path
    // Should still produce attack command (within reach)
    const attackCmd = cmds.find(c => c.kind === "attack");
    expect(attackCmd).toBeDefined();
  });
});
