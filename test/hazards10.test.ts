// test/hazards10.test.ts — Phase 10: fall damage, explosions, pharmacokinetics, ambient temperature

import { describe, it, expect } from "vitest";
import { q, SCALE, to } from "../src/units";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { stepWorld, applyFallDamage, applyExplosion } from "../src/sim/kernel";
import { blastEnergyFracQ, fragmentsExpected, fragmentKineticEnergy, type BlastSpec } from "../src/sim/explosion";
import { STARTER_SUBSTANCES, hasSubstanceType, type ActiveSubstance } from "../src/sim/substance";
import { canDetect, DEFAULT_SENSORY_ENV } from "../src/sim/sensory";
import { v3 } from "../src/sim/vec3";
import { TraceEvent } from "../src";
import { TraceKinds } from "../src/sim/kinds";

const BASE_CTX = { tractionCoeff: q(0.80) };

// ── Explosion physics unit tests ──────────────────────────────────────────

describe("blastEnergyFracQ", () => {
  const spec: BlastSpec = {
    blastEnergy_J: 50_000,
    radius_m: to.m(10),
    fragmentCount: 20,
    fragmentMass_kg: Math.round(0.005 * SCALE.kg),
    fragmentVelocity_mps: 300,
  };

  it("returns q(1.0) at epicentre (distSq = 0)", () => {
    expect(blastEnergyFracQ(spec, 0)).toBe(SCALE.Q);
  });

  it("returns 0 at or beyond radius", () => {
    const rSq = spec.radius_m * spec.radius_m;
    expect(blastEnergyFracQ(spec, rSq)).toBe(0);
    expect(blastEnergyFracQ(spec, rSq + 1)).toBe(0);
  });

  it("returns intermediate value inside radius", () => {
    const halfRadSq = (spec.radius_m / 2) * (spec.radius_m / 2);
    const frac = blastEnergyFracQ(spec, halfRadSq);
    expect(frac).toBeGreaterThan(0);
    expect(frac).toBeLessThan(SCALE.Q);
  });
});

describe("fragmentsExpected", () => {
  const spec: BlastSpec = {
    blastEnergy_J: 50_000,
    radius_m: to.m(10),
    fragmentCount: 20,
    fragmentMass_kg: Math.round(0.005 * SCALE.kg),
    fragmentVelocity_mps: 300,
  };

  it("returns fragmentCount at epicentre", () => {
    expect(fragmentsExpected(spec, 0)).toBe(spec.fragmentCount);
  });

  it("returns 0 at radius", () => {
    expect(fragmentsExpected(spec, spec.radius_m * spec.radius_m)).toBe(0);
  });

  it("decreases monotonically with distance", () => {
    const nearSq  = (to.m(2)) * (to.m(2));
    const midSq   = (to.m(5)) * (to.m(5));
    const farSq   = (to.m(9)) * (to.m(9));
    expect(fragmentsExpected(spec, nearSq)).toBeGreaterThan(fragmentsExpected(spec, midSq));
    expect(fragmentsExpected(spec, midSq)).toBeGreaterThan(fragmentsExpected(spec, farSq));
  });
});

describe("fragmentKineticEnergy", () => {
  const spec: BlastSpec = {
    blastEnergy_J: 50_000,
    radius_m: to.m(10),
    fragmentCount: 20,
    fragmentMass_kg: Math.round(0.005 * SCALE.kg),
    fragmentVelocity_mps: 300,
  };

  it("returns positive value at epicentre", () => {
    expect(fragmentKineticEnergy(spec, 0)).toBeGreaterThan(0);
  });

  it("returns 0 at radius", () => {
    expect(fragmentKineticEnergy(spec, spec.radius_m * spec.radius_m)).toBe(0);
  });

  it("ke at epicentre ≤ 0.5 × mass × v² (physical upper bound)", () => {
    // Full KE = mass_real × v² / 2 = (5g × 300²) / 2 = 0.005 × 90000 / 2 = 225 J
    const keMax = 225;
    expect(fragmentKineticEnergy(spec, 0)).toBeLessThanOrEqual(keMax);
  });
});

// ── Fall damage integration tests ─────────────────────────────────────────

describe("applyFallDamage", () => {
  it("deals structural damage to legs on humanoid from 2m fall", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const leftLegBefore = e.injury.byRegion["leftLeg"]!.structuralDamage;

    applyFallDamage(world, 1, to.m(2), 0, { onEvent() {} });

    expect(world.entities[0]!.injury.byRegion["leftLeg"]!.structuralDamage)
      .toBeGreaterThan(leftLegBefore);
  });

  it("forces prone when height ≥ 1m", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.condition.prone = false;
    const world = mkWorld(1, [e]);

    applyFallDamage(world, 1, to.m(1), 0, { onEvent() {} });

    expect(world.entities[0]!.condition.prone).toBe(true);
  });

  it("does not force prone for very short falls (< 1m)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.condition.prone = false;
    const world = mkWorld(1, [e]);

    applyFallDamage(world, 1, Math.trunc(0.5 * SCALE.m), 0, { onEvent() {} });

    expect(world.entities[0]!.condition.prone).toBe(false);
  });

  it("higher fall causes more damage than shorter fall", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 1, 0, 0);
    const w1 = mkWorld(1, [e1]);
    const w2 = mkWorld(1, [e2]);

    applyFallDamage(w1, 1, to.m(5), 0, { onEvent() {} });
    applyFallDamage(w2, 2, to.m(2), 0, { onEvent() {} });

    const str5m = w1.entities[0]!.injury.byRegion["leftLeg"]!.structuralDamage;
    const str2m = w2.entities[0]!.injury.byRegion["leftLeg"]!.structuralDamage;
    expect(str5m).toBeGreaterThan(str2m);
  });

  it("no damage for height = 0", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const before = JSON.stringify(e.injury);

    applyFallDamage(world, 1, 0, 0, { onEvent() {} });

    expect(JSON.stringify(world.entities[0]!.injury)).toBe(before);
  });

  it("ignores dead entities", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.dead = true;
    const world = mkWorld(1, [e]);
    const strBefore = e.injury.byRegion["leftLeg"]!.structuralDamage;

    applyFallDamage(world, 1, to.m(10), 0, { onEvent() {} });

    expect(world.entities[0]!.injury.byRegion["leftLeg"]!.structuralDamage).toBe(strBefore);
  });
});

// ── Explosion integration tests ───────────────────────────────────────────

const GRENADE_SPEC: BlastSpec = {
  blastEnergy_J: 50_000,
  radius_m: to.m(10),
  fragmentCount: 8,
  fragmentMass_kg: Math.round(0.005 * SCALE.kg),
  fragmentVelocity_mps: 300,
};

describe("applyExplosion", () => {
  it("emits BlastHit trace event for entity within radius", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const events: TraceEvent[] = [];

    applyExplosion(world, v3(0, 0, 0), GRENADE_SPEC, 0, { onEvent: ev => events.push(ev) });

    const blastEvent = events.find(ev => ev.kind === "blastHit" && ev.entityId === 1);
    expect(blastEvent).toBeDefined();
  });

  it("entity at epicentre takes torso damage", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const torsoBefore = e.injury.byRegion["torso"]!.internalDamage;

    applyExplosion(world, v3(0, 0, 0), GRENADE_SPEC, 0, { onEvent() {} });

    expect(world.entities[0]!.injury.byRegion["torso"]!.internalDamage).toBeGreaterThan(torsoBefore);
  });

  it("entity outside radius is unaffected and no trace emitted", () => {
    const e = mkHumanoidEntity(1, 1, to.m(15), 0);  // 15m away from epicentre at origin
    const world = mkWorld(1, [e]);
    const events: TraceEvent[] = [];
    const injuryBefore = JSON.stringify(e.injury);

    applyExplosion(world, v3(0, 0, 0), GRENADE_SPEC, 0, { onEvent: ev => events.push(ev) });

    expect(JSON.stringify(world.entities[0]!.injury)).toBe(injuryBefore);
    expect(events.filter(ev => ev.kind === "blastHit")).toHaveLength(0);
  });

  it("entity closer to epicentre receives more blast energy than one farther away", () => {
    const eNear = mkHumanoidEntity(1, 1, 0, 0);
    const eFar  = mkHumanoidEntity(2, 1, to.m(8), 0);
    const world = mkWorld(1, [eNear, eFar]);
    const events: TraceEvent[] = [];

    applyExplosion(world, v3(0, 0, 0), GRENADE_SPEC, 0, { onEvent: ev => events.push(ev) });

    const nearEv = events.find(ev => ev.kind === TraceKinds.BlastHit && ev.entityId === 1) as any;
    const farEv  = events.find(ev => ev.kind === TraceKinds.BlastHit && ev.entityId === 2) as any;
    expect(nearEv!.blastEnergy_J).toBeGreaterThan(farEv!.blastEnergy_J);
  });

  it("dead entities are skipped", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.injury.dead = true;
    const world = mkWorld(1, [e]);
    const events: TraceEvent[] = [];

    applyExplosion(world, v3(0, 0, 0), GRENADE_SPEC, 0, { onEvent: ev => events.push(ev) });

    expect(events.filter(ev => ev.kind === TraceKinds.BlastHit)).toHaveLength(0);
  });

  it("blastEnergy_J in trace event matches computed delivery", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const events: TraceEvent[] = [];

    applyExplosion(world, v3(0, 0, 0), GRENADE_SPEC, 0, { onEvent: ev => events.push(ev) });

    const ev = events.find(e => e.kind === TraceKinds.BlastHit)!;
    expect(ev.blastEnergy_J).toBeGreaterThan(0);
    expect(ev.blastEnergy_J).toBeLessThanOrEqual(GRENADE_SPEC.blastEnergy_J);
  });
});

  it("entity facing away from blast receives less blast energy than entity facing toward it", () => {
    // Both entities at identical distance; differ only in facing direction.
    // Compare blastEnergy_J in trace events (reflects reduction before damage clamping).
    const eToward = mkHumanoidEntity(1, 1, to.m(3), 0);
    const eAway   = mkHumanoidEntity(1, 1, to.m(3), 0);
    eToward.action.facingDirQ = { x: -SCALE.Q, y: 0, z: 0 }; // facing toward origin
    eAway.action.facingDirQ   = { x:  SCALE.Q, y: 0, z: 0 }; // facing away from origin

    const wToward = mkWorld(1, [eToward]);
    const wAway   = mkWorld(1, [eAway]);
    const evToward: any[] = [];
    const evAway:   any[] = [];

    applyExplosion(wToward, v3(0, 0, 0), GRENADE_SPEC, 0, { onEvent: ev => evToward.push(ev) });
    applyExplosion(wAway,   v3(0, 0, 0), GRENADE_SPEC, 0, { onEvent: ev => evAway.push(ev) });

    const blastToward = evToward.find(e => e.kind === TraceKinds.BlastHit)!.blastEnergy_J;
    const blastAway   = evAway.find(e => e.kind === TraceKinds.BlastHit)!.blastEnergy_J;
    expect(blastToward).toBeGreaterThan(blastAway);
    // Away should be exactly 70% of toward
    expect(blastAway).toBeCloseTo(blastToward * 0.70, -1);
  });

  it("blast applies outward velocity to entity", () => {
    // Use a small blast so we can observe throw without massive damage
    const smallSpec: BlastSpec = {
      blastEnergy_J: 500,
      radius_m: to.m(5),
      fragmentCount: 0,
      fragmentMass_kg: 0,
      fragmentVelocity_mps: 0,
    };
    const e = mkHumanoidEntity(1, 1, to.m(2), 0);  // 2m east of origin
    e.velocity_mps = v3(0, 0, 0);
    const world = mkWorld(1, [e]);

    applyExplosion(world, v3(0, 0, 0), smallSpec, 0, { onEvent() {} });

    // Should have been pushed eastward (positive x velocity)
    expect(world.entities[0]!.velocity_mps.x).toBeGreaterThan(0);
  });

  it("entity closer to epicentre is thrown further than one farther away", () => {
    const smallSpec: BlastSpec = {
      blastEnergy_J: 500,
      radius_m: to.m(10),
      fragmentCount: 0,
      fragmentMass_kg: 0,
      fragmentVelocity_mps: 0,
    };
    const eNear = mkHumanoidEntity(1, 1, to.m(1), 0);
    const eFar  = mkHumanoidEntity(2, 1, to.m(7), 0);
    eNear.velocity_mps = v3(0, 0, 0);
    eFar.velocity_mps  = v3(0, 0, 0);
    const wNear = mkWorld(1, [eNear]);
    const wFar  = mkWorld(1, [eFar]);

    applyExplosion(wNear, v3(0, 0, 0), smallSpec, 0, { onEvent() {} });
    applyExplosion(wFar,  v3(0, 0, 0), smallSpec, 0, { onEvent() {} });

    expect(wNear.entities[0]!.velocity_mps.x).toBeGreaterThan(wFar.entities[0]!.velocity_mps.x);
  });

  it("entity at exact epicentre receives no throw (zero direction vector)", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);  // exactly at origin
    e.velocity_mps = v3(0, 0, 0);
    const world = mkWorld(1, [e]);

    applyExplosion(world, v3(0, 0, 0), GRENADE_SPEC, 0, { onEvent() {} });

    expect(world.entities[0]!.velocity_mps.x).toBe(0);
    expect(world.entities[0]!.velocity_mps.y).toBe(0);
  });

// ── Pharmacokinetics tests ─────────────────────────────────────────────────

describe("substance — stimulant", () => {
  it("reduces fearQ over several ticks when above threshold", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    // Use fearQ below routing threshold (~q(0.65)) to avoid routing cascade overwhelming the effect
    e.condition.fearQ = q(0.4);
    e.substances = [{
      substance: STARTER_SUBSTANCES["stimulant"]!,
      pendingDose: q(1.0),
      concentration: q(0),
    }];
    const world = mkWorld(1, [e]);

    // run enough ticks for absorption to build concentration above threshold
    for (let i = 0; i < 10; i++) {
      stepWorld(world, new Map(), BASE_CTX);
    }

    expect(world.entities[0]!.condition.fearQ).toBeLessThan(q(0.4));
  });

  it("reduces fatigue over several ticks", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.energy.fatigue = q(0.9);
    e.substances = [{
      substance: STARTER_SUBSTANCES["stimulant"]!,
      pendingDose: q(1.0),
      concentration: q(0),
    }];
    const world = mkWorld(1, [e]);

    for (let i = 0; i < 10; i++) {
      stepWorld(world, new Map(), BASE_CTX);
    }

    expect(world.entities[0]!.energy.fatigue).toBeLessThan(q(0.9));
  });
});

describe("substance — anaesthetic", () => {
  it("erodes consciousness over time", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.substances = [{
      substance: STARTER_SUBSTANCES["anaesthetic"]!,
      pendingDose: q(1.0),
      concentration: q(0),
    }];
    const world = mkWorld(1, [e]);
    const conscBefore = e.injury.consciousness;

    for (let i = 0; i < 20; i++) {
      stepWorld(world, new Map(), BASE_CTX);
    }

    // Allow for the fact that shock/conditions also affect consciousness
    // The key check is that consciousness fell from starting value
    expect(world.entities[0]!.injury.consciousness).toBeLessThan(conscBefore);
  });
});

describe("substance — poison", () => {
  it("accumulates torso internalDamage over time", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.substances = [{
      substance: STARTER_SUBSTANCES["poison"]!,
      pendingDose: q(1.0),
      concentration: q(0),
    }];
    const world = mkWorld(1, [e]);
    const intBefore = e.injury.byRegion["torso"]!.internalDamage;

    for (let i = 0; i < 20; i++) {
      stepWorld(world, new Map(), BASE_CTX);
    }

    expect(world.entities[0]!.injury.byRegion["torso"]!.internalDamage).toBeGreaterThan(intBefore);
  });
});

describe("substance — haemostatic", () => {
  it("reduces bleeding rate when above threshold", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    // Set up active bleeding
    e.injury.byRegion["torso"]!.bleedingRate = q(0.50);
    e.substances = [{
      substance: STARTER_SUBSTANCES["haemostatic"]!,
      pendingDose: q(1.0),
      concentration: q(0),
    }];
    const world = mkWorld(1, [e]);

    for (let i = 0; i < 10; i++) {
      stepWorld(world, new Map(), BASE_CTX);
    }

    expect(world.entities[0]!.injury.byRegion["torso"]!.bleedingRate).toBeLessThan(q(0.50));
  });
});

describe("substance — concentration dynamics", () => {
  it("concentration rises above threshold when pendingDose is sufficient", () => {
    const sub = STARTER_SUBSTANCES["stimulant"]!;
    const active: ActiveSubstance = {
      substance: sub,
      pendingDose: q(1.0),
      concentration: q(0),
    };
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.substances = [active];
    const world = mkWorld(1, [e]);

    for (let i = 0; i < 5; i++) {
      stepWorld(world, new Map(), BASE_CTX);
    }

    expect(world.entities[0]!.substances![0]!.concentration).toBeGreaterThan(sub.effectThreshold);
  });

  it("substances array is cleaned up once exhausted", () => {
    const sub = STARTER_SUBSTANCES["stimulant"]!;
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.substances = [{
      substance: sub,
      pendingDose: q(0.01),  // tiny dose — will exhaust quickly
      concentration: q(0),
    }];
    const world = mkWorld(1, [e]);

    for (let i = 0; i < 100; i++) {
      stepWorld(world, new Map(), BASE_CTX);
    }

    // After exhaustion, substance should be removed or have negligible concentration
    const remaining = world.entities[0]!.substances ?? [];
    const allBelowThreshold = remaining.every(a => a.concentration <= sub.effectThreshold);
    expect(remaining.length === 0 || allBelowThreshold).toBe(true);
  });
});

// ── Ambient temperature tests ─────────────────────────────────────────────

describe("ambient temperature — heat stress", () => {
  it("increases shock when temperature is above comfort range", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const shockBefore = e.injury.shock;

    stepWorld(world, new Map(), { ...BASE_CTX, ambientTemperature_Q: q(0.90) });

    expect(world.entities[0]!.injury.shock).toBeGreaterThan(shockBefore);
  });

  it("increases torso surfaceDamage in extreme heat", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const surfBefore = e.injury.byRegion["torso"]!.surfaceDamage;

    stepWorld(world, new Map(), { ...BASE_CTX, ambientTemperature_Q: q(0.95) });

    expect(world.entities[0]!.injury.byRegion["torso"]!.surfaceDamage).toBeGreaterThan(surfBefore);
  });

  it("no heat stress within comfort range", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const shockBefore = e.injury.shock;

    stepWorld(world, new Map(), { ...BASE_CTX, ambientTemperature_Q: q(0.50) });

    expect(world.entities[0]!.injury.shock).toBe(shockBefore);
  });
});

describe("ambient temperature — cold stress", () => {
  it("increases shock when temperature is below comfort range", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const shockBefore = e.injury.shock;

    stepWorld(world, new Map(), { ...BASE_CTX, ambientTemperature_Q: q(0.10) });

    expect(world.entities[0]!.injury.shock).toBeGreaterThan(shockBefore);
  });

  it("increases fatigue in cold conditions", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    // Give entity some fatigue room to grow from cold
    e.energy.fatigue = q(0.1);

    stepWorld(world, new Map(), { ...BASE_CTX, ambientTemperature_Q: q(0.05) });

    expect(world.entities[0]!.energy.fatigue).toBeGreaterThan(q(0.1));
  });

  it("extreme cold causes more stress than mild cold", () => {
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 1, 0, 0);
    const w1 = mkWorld(1, [e1]);
    const w2 = mkWorld(1, [e2]);

    // Run multiple ticks to accumulate measurable difference
    for (let i = 0; i < 5; i++) {
      stepWorld(w1, new Map(), { ...BASE_CTX, ambientTemperature_Q: q(0.05) });
      stepWorld(w2, new Map(), { ...BASE_CTX, ambientTemperature_Q: q(0.25) });
    }

    expect(w1.entities[0]!.injury.shock).toBeGreaterThan(w2.entities[0]!.injury.shock);
  });
});

// ── Phase 10C: substance interactions ────────────────────────────────────────

describe("Phase 10C: hasSubstanceType helper", () => {
  it("returns false when no substances", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    expect(hasSubstanceType(e, "stimulant")).toBe(false);
  });

  it("returns false when substance below effectThreshold", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.substances = [{ substance: STARTER_SUBSTANCES.stimulant!, pendingDose: q(0), concentration: q(0.05) }];
    // effectThreshold for stimulant = q(0.10); q(0.05) < q(0.10)
    expect(hasSubstanceType(e, "stimulant")).toBe(false);
  });

  it("returns true when substance is above effectThreshold", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.substances = [{ substance: STARTER_SUBSTANCES.stimulant!, pendingDose: q(0), concentration: q(0.50) }];
    expect(hasSubstanceType(e, "stimulant")).toBe(true);
  });
});

describe("Phase 10C: stimulant antagonises haemostatic (clears faster)", () => {
  it("haemostatic clears faster when stimulant is also active", () => {
    // Entity A: haemostatic + stimulant
    const eA = mkHumanoidEntity(1, 1, 0, 0);
    eA.substances = [
      { substance: STARTER_SUBSTANCES.haemostatic!, pendingDose: q(0), concentration: q(0.50) },
      { substance: STARTER_SUBSTANCES.stimulant!,   pendingDose: q(0), concentration: q(0.80) },
    ];
    // Entity B: haemostatic only
    const eB = mkHumanoidEntity(2, 2, 0, 0);
    eB.substances = [
      { substance: STARTER_SUBSTANCES.haemostatic!, pendingDose: q(0), concentration: q(0.50) },
    ];
    const wA = mkWorld(1, [eA]);
    const wB = mkWorld(2, [eB]);

    for (let i = 0; i < 20; i++) {
      stepWorld(wA, new Map(), BASE_CTX);
      stepWorld(wB, new Map(), BASE_CTX);
    }

    const concA = wA.entities[0]!.substances?.find(s => s.substance.effectType === "haemostatic")?.concentration ?? 0;
    const concB = wB.entities[0]!.substances?.find(s => s.substance.effectType === "haemostatic")?.concentration ?? 0;
    // With stimulant, haemostatic should be lower concentration (cleared faster)
    expect(concA).toBeLessThan(concB);
  });
});

describe("Phase 10C: stimulant reduces anaesthetic effect", () => {
  it("anaesthetic erodes consciousness more slowly when stimulant is active", () => {
    // Entity A: anaesthetic + stimulant
    const eA = mkHumanoidEntity(1, 1, 0, 0);
    eA.substances = [
      { substance: STARTER_SUBSTANCES.anaesthetic!, pendingDose: q(0), concentration: q(0.80) },
      { substance: STARTER_SUBSTANCES.stimulant!,   pendingDose: q(0), concentration: q(0.80) },
    ];
    // Entity B: anaesthetic only
    const eB = mkHumanoidEntity(2, 2, 0, 0);
    eB.substances = [
      { substance: STARTER_SUBSTANCES.anaesthetic!, pendingDose: q(0), concentration: q(0.80) },
    ];
    const wA = mkWorld(1, [eA]);
    const wB = mkWorld(2, [eB]);

    for (let i = 0; i < 30; i++) {
      stepWorld(wA, new Map(), BASE_CTX);
      stepWorld(wB, new Map(), BASE_CTX);
    }

    // With stimulant, consciousness should be higher (less eroded)
    expect(wA.entities[0]!.injury.consciousness).toBeGreaterThan(wB.entities[0]!.injury.consciousness);
  });
});

describe("Phase 10C: poison + haemostatic interaction", () => {
  it("haemostatic clears more slowly when poison is active", () => {
    // Entity A: haemostatic + poison
    const eA = mkHumanoidEntity(1, 1, 0, 0);
    eA.substances = [
      { substance: STARTER_SUBSTANCES.haemostatic!, pendingDose: q(0), concentration: q(0.50) },
      { substance: STARTER_SUBSTANCES.poison!,      pendingDose: q(0), concentration: q(0.80) },
    ];
    // Entity B: haemostatic only
    const eB = mkHumanoidEntity(2, 2, 0, 0);
    eB.substances = [
      { substance: STARTER_SUBSTANCES.haemostatic!, pendingDose: q(0), concentration: q(0.50) },
    ];
    const wA = mkWorld(1, [eA]);
    const wB = mkWorld(2, [eB]);

    for (let i = 0; i < 20; i++) {
      stepWorld(wA, new Map(), BASE_CTX);
      stepWorld(wB, new Map(), BASE_CTX);
    }

    const concA = wA.entities[0]!.substances?.find(s => s.substance.effectType === "haemostatic")?.concentration ?? 0;
    const concB = wB.entities[0]!.substances?.find(s => s.substance.effectType === "haemostatic")?.concentration ?? 0;
    // With poison, haemostatic persists longer (higher concentration)
    expect(concA).toBeGreaterThan(concB);
  });
});

// ── Phase 10C: temperature-dependent metabolism ───────────────────────────────

describe("Phase 10C: cold slows substance elimination", () => {
  it("stimulant lasts longer in cold environment than normal temperature", () => {
    const eCold   = mkHumanoidEntity(1, 1, 0, 0);
    const eNormal = mkHumanoidEntity(2, 2, 0, 0);
    eCold.substances   = [{ substance: STARTER_SUBSTANCES.stimulant!, pendingDose: q(0), concentration: q(0.60) }];
    eNormal.substances = [{ substance: STARTER_SUBSTANCES.stimulant!, pendingDose: q(0), concentration: q(0.60) }];

    const wCold   = mkWorld(1, [eCold]);
    const wNormal = mkWorld(2, [eNormal]);

    for (let i = 0; i < 30; i++) {
      stepWorld(wCold,   new Map(), { ...BASE_CTX, ambientTemperature_Q: q(0.05) }); // very cold
      stepWorld(wNormal, new Map(), { ...BASE_CTX, ambientTemperature_Q: q(0.60) }); // warm
    }

    const concCold   = wCold.entities[0]!.substances?.find(s => s.substance.id === "stimulant")?.concentration ?? 0;
    const concNormal = wNormal.entities[0]!.substances?.find(s => s.substance.id === "stimulant")?.concentration ?? 0;
    expect(concCold).toBeGreaterThan(concNormal);
  });

  it("temperature at or above q(0.35) does not slow metabolism", () => {
    // Above threshold: no cold modifier applied — result identical to normal
    const e1 = mkHumanoidEntity(1, 1, 0, 0);
    const e2 = mkHumanoidEntity(2, 2, 0, 0);
    e1.substances = [{ substance: STARTER_SUBSTANCES.stimulant!, pendingDose: q(0), concentration: q(0.60) }];
    e2.substances = [{ substance: STARTER_SUBSTANCES.stimulant!, pendingDose: q(0), concentration: q(0.60) }];

    const w1 = mkWorld(1, [e1]);
    const w2 = mkWorld(2, [e2]);

    for (let i = 0; i < 10; i++) {
      stepWorld(w1, new Map(), { ...BASE_CTX, ambientTemperature_Q: q(0.35) });
      stepWorld(w2, new Map(), { ...BASE_CTX, ambientTemperature_Q: q(0.80) });
    }

    const c1 = w1.entities[0]!.substances?.find(s => s.substance.id === "stimulant")?.concentration ?? 0;
    const c2 = w2.entities[0]!.substances?.find(s => s.substance.id === "stimulant")?.concentration ?? 0;
    // Both at or above threshold: same clearance rate
    expect(c1).toBe(c2);
  });
});

// ── Phase 10C: explosive flash / blindness ────────────────────────────────────

describe("Phase 10C: explosion flash blindness", () => {
  const SPEC: BlastSpec = {
    blastEnergy_J: 50_000,
    radius_m: to.m(10),
    fragmentCount: 0,
    fragmentMass_kg: 0,
    fragmentVelocity_mps: 0,
  };

  it("entity at epicentre is blinded after explosion", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const world = mkWorld(1, [e]);
    const trace = { onEvent: () => {} };
    applyExplosion(world, v3(0, 0, 0), SPEC, 1, trace);
    expect(world.entities[0]!.condition.blindTicks).toBeGreaterThan(0);
  });

  it("entity outside flash radius is not blinded", () => {
    // flashRadiusSq = radius² × 0.40; effective flash radius = 10m × √0.40 ≈ 6.32m
    const e = mkHumanoidEntity(1, 1, to.m(7), 0);
    const world = mkWorld(1, [e]);
    const trace = { onEvent: () => {} };
    applyExplosion(world, v3(0, 0, 0), SPEC, 1, trace);
    expect(world.entities[0]!.condition.blindTicks).toBe(0);
  });

  it("closer entity is blinded longer than entity at edge of flash radius", () => {
    const eNear = mkHumanoidEntity(1, 1, 0, 0);          // at epicentre
    const eFar  = mkHumanoidEntity(2, 2, to.m(3.5), 0);  // near edge of 4m flash radius
    const world = mkWorld(1, [eNear, eFar]);
    const trace = { onEvent: () => {} };
    applyExplosion(world, v3(0, 0, 0), SPEC, 1, trace);
    expect(world.entities[0]!.condition.blindTicks).toBeGreaterThan(world.entities[1]!.condition.blindTicks);
  });

  it("blindTicks decrements each stepWorld tick", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    e.condition.blindTicks = 5;
    const world = mkWorld(1, [e]);
    stepWorld(world, new Map(), BASE_CTX);
    expect(world.entities[0]!.condition.blindTicks).toBe(4);
  });

  it("blinded entity has degraded vision detection (canDetect)", () => {
    const observer = mkHumanoidEntity(1, 1, 0, 0);
    const subject  = mkHumanoidEntity(2, 2, to.m(10), 0); // within vision range
    // Without blindness: fully visible
    const normalQ = canDetect(observer, subject, DEFAULT_SENSORY_ENV);
    expect(normalQ).toBe(q(1.0));

    // With blindness: vision zeroed, only hearing possible (10m > hearing 50m? no — within hearing)
    observer.condition.blindTicks = 10;
    const blindQ = canDetect(observer, subject, DEFAULT_SENSORY_ENV);
    // 10m < hearingRange(50m) → heard at q(0.4), not seen
    expect(blindQ).toBe(q(0.4));
  });
});
