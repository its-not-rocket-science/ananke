/**
 * Phase 32C — Venom & Chemical Injection tests
 *
 * Groups:
 *   Catalogue       (4) — VENOM_PROFILES completeness, getVenomProfile lookup
 *   Onset delay     (3) — no damage/fear before onset; damage starts after
 *   Damage & fear   (4) — accumulation rates, torso vs shock fallback
 *   Antidote        (3) — clearance by antidoteId, no-op for unknown id
 *   Expiry          (2) — entries removed after duration_s
 *   Integration     (4) — kernel 1 Hz wiring via stepWorld
 */

import { describe, it, expect } from "vitest";
import { q } from "../src/units";
import {
  stepToxicology,
  injectVenom,
  applyAntidote,
  getVenomProfile,
  VENOM_PROFILES,
} from "../src/sim/toxicology";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";
import { segmentIds, OCTOPOID_PLAN } from "../src/sim/bodyplan";
import { defaultInjury } from "../src/sim/injury";
import { stepWorld } from "../src/sim/kernel";

// ── helpers ───────────────────────────────────────────────────────────────────

function freshEntity(id = 1) {
  const e = mkHumanoidEntity(id, 1, 0, 0);
  return e;
}

// ── Catalogue ─────────────────────────────────────────────────────────────────

describe("VENOM_PROFILES catalogue", () => {
  it("has exactly 3 entries", () => {
    expect(VENOM_PROFILES.length).toBe(3);
  });

  it("all entries have unique ids", () => {
    const ids = VENOM_PROFILES.map(v => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getVenomProfile returns correct profile by id", () => {
    const snake = getVenomProfile("venom_snake");
    expect(snake).toBeDefined();
    expect(snake!.name).toMatch(/serpent/i);
  });

  it("getVenomProfile returns undefined for unknown id", () => {
    expect(getVenomProfile("not_a_venom")).toBeUndefined();
  });
});

// ── injectVenom ───────────────────────────────────────────────────────────────

describe("injectVenom", () => {
  it("returns false for unknown venom id", () => {
    const e = freshEntity();
    expect(injectVenom(e, "not_a_venom")).toBe(false);
  });

  it("returns true and adds entry for known id", () => {
    const e = freshEntity();
    expect(injectVenom(e, "venom_insect")).toBe(true);
    expect(e.activeVenoms?.length).toBe(1);
  });

  it("multiple injections stack", () => {
    const e = freshEntity();
    injectVenom(e, "venom_insect");
    injectVenom(e, "venom_snake");
    expect(e.activeVenoms?.length).toBe(2);
  });
});

// ── Onset delay ───────────────────────────────────────────────────────────────

describe("onset delay", () => {
  it("no damage before onset (venom_insect, 29s)", () => {
    const e = freshEntity();
    injectVenom(e, "venom_insect");
    stepToxicology(e, 29); // onset is 30s
    expect(e.injury.shock).toBe(0);
  });

  it("no fear before onset", () => {
    const e = freshEntity();
    injectVenom(e, "venom_insect");
    stepToxicology(e, 29);
    expect((e.condition).fearQ ?? 0).toBe(0);
  });

  it("damage begins after onset", () => {
    const e = freshEntity();
    injectVenom(e, "venom_insect");
    stepToxicology(e, 31); // past 30s onset
    // humanoid defaultInjury includes "torso" region — damage lands there
    expect((e.injury.byRegion)["torso"]!.internalDamage).toBeGreaterThan(0);
  });
});

// ── Damage & fear accumulation ────────────────────────────────────────────────

describe("damage and fear accumulation", () => {
  it("torso internalDamage increases with time after onset", () => {
    const e = freshEntity();
    injectVenom(e, "venom_insect");
    stepToxicology(e, 35); // 5s past onset
    expect((e.injury.byRegion)["torso"]!.internalDamage).toBeGreaterThan(0);
  });

  it("fear increases with time after onset", () => {
    const e = freshEntity();
    injectVenom(e, "venom_insect");
    stepToxicology(e, 35);
    expect((e.condition).fearQ ?? 0).toBeGreaterThan(0);
  });

  it("venom applies to torso.internalDamage when torso region exists", () => {
    const e = freshEntity();
    // Give entity an octopoid plan but ensure a torso-named region by injecting manually
    e.injury = defaultInjury(segmentIds(OCTOPOID_PLAN));
    // Add a synthetic torso region so damage lands there
    (e.injury.byRegion)["torso"] = { internalDamage: q(0), structuralDamage: q(0), bleedingRate: q(0), surfaceDamage: q(0), fractured: false, infectedTick: 0, bleedDuration_ticks: 0, permanentDamage: 0 };
    const shockBefore = e.injury.shock;
    injectVenom(e, "venom_snake");
    stepToxicology(e, 65); // 5s past onset (60s)
    expect((e.injury.byRegion)["torso"].internalDamage).toBeGreaterThan(0);
    expect(e.injury.shock).toBe(shockBefore); // shock unchanged when torso region exists
  });

  it("paralytic venom has faster fear rate than snake venom (same window)", () => {
    const eP = freshEntity();
    const eS = freshEntity(2);
    injectVenom(eP, "venom_paralytic");
    injectVenom(eS, "venom_snake");
    // Both past onset; 20s window
    stepToxicology(eP, 35);
    stepToxicology(eS, 65);
    expect((eP.condition).fearQ).toBeGreaterThan((eS.condition).fearQ ?? 0);
  });
});

// ── Antidote ──────────────────────────────────────────────────────────────────

describe("applyAntidote", () => {
  it("returns false when no active venoms", () => {
    const e = freshEntity();
    expect(applyAntidote(e, "antivenom")).toBe(false);
  });

  it("clears venom_snake by antivenom", () => {
    const e = freshEntity();
    injectVenom(e, "venom_snake");
    expect(applyAntidote(e, "antivenom")).toBe(true);
    expect(e.activeVenoms?.length).toBe(0);
  });

  it("does not clear venom_insect (no antidoteId)", () => {
    const e = freshEntity();
    injectVenom(e, "venom_insect");
    expect(applyAntidote(e, "antivenom")).toBe(false);
    expect(e.activeVenoms?.length).toBe(1);
  });
});

// ── Expiry ────────────────────────────────────────────────────────────────────

describe("venom expiry", () => {
  it("venom_insect expires after 300s", () => {
    const e = freshEntity();
    injectVenom(e, "venom_insect");
    stepToxicology(e, 301);
    expect(e.activeVenoms?.length).toBe(0);
  });

  it("unexpired venom remains after partial duration", () => {
    const e = freshEntity();
    injectVenom(e, "venom_snake"); // 600s duration
    stepToxicology(e, 300);
    expect(e.activeVenoms?.length).toBe(1);
  });
});

// ── Kernel integration (1 Hz accumulator) ─────────────────────────────────────

describe("kernel integration", () => {
  it("no shock added before first 1-Hz tick fires", () => {
    const e = freshEntity();
    // Inject paralytic with 10s onset — after a handful of ticks (<1s), shock = 0
    injectVenom(e, "venom_paralytic");
    const world = mkWorld(1, [e]);
    const cmds = new Map();
    // Run 5 ticks (~0.25s at 20 Hz) — 1Hz gate hasn't fired, and pre-onset anyway
    for (let i = 0; i < 5; i++) stepWorld(world, cmds, { tractionCoeff: q(0.9) });
    expect(e.injury.shock).toBe(0);
  });

  it("shock accumulates via 1 Hz gate over many ticks", () => {
    const e = freshEntity();
    injectVenom(e, "venom_insect"); // 30s onset
    const world = mkWorld(1, [e]);
    const cmds = new Map();
    // Run 800 ticks = 40s > onset; shock should appear via 1Hz stepToxicology
    for (let i = 0; i < 800; i++) stepWorld(world, cmds, { tractionCoeff: q(0.9) });
    expect(e.injury.shock).toBeGreaterThan(0);
  });

  it("dead entities are not ticked for toxicology", () => {
    const e = freshEntity();
    injectVenom(e, "venom_insect");
    e.injury.dead = true;
    const world = mkWorld(1, [e]);
    const cmds = new Map();
    for (let i = 0; i < 800; i++) stepWorld(world, cmds, { tractionCoeff: q(0.9) });
    // Entity marked dead: toxicology should not apply
    expect(e.injury.shock).toBe(0);
  });

  it("entity without activeVenoms is unaffected", () => {
    const e = freshEntity();
    const shockBefore = e.injury.shock;
    const world = mkWorld(1, [e]);
    const cmds = new Map();
    for (let i = 0; i < 400; i++) stepWorld(world, cmds, { tractionCoeff: q(0.9) });
    expect(e.injury.shock).toBe(shockBefore);
  });
});
