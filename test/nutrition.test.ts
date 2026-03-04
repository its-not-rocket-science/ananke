/**
 * Phase 30 — Nutrition & Starvation tests
 *
 * Groups:
 *   BMR              (4) — computeBMR accuracy and determinism
 *   Hunger states    (6) — state transitions via stepNutrition
 *   Food consumption (5) — consumeFood inventory, balance, fluidLoss
 *   Mass loss        (5) — fat catabolism, muscle catabolism, thresholds
 *   Modifiers        (3) — deriveHungerModifiers correctness
 *   Misc             (3) — FOOD_ITEMS catalogue, determinism, deep starvation
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SCALE, q, type Q } from "../src/units";
import {
  computeBMR,
  stepNutrition,
  consumeFood,
  deriveHungerModifiers,
  FOOD_ITEMS,
} from "../src/sim/nutrition";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing";

// ── Helpers ───────────────────────────────────────────────────────────────────

function freshEntity(id = 1) {
  const e = mkHumanoidEntity(id, 1, 0, 0);
  // Start with clean nutritional state
  (e.condition as any).caloricBalance_J   = 0;
  (e.condition as any).hydrationBalance_J = 0;
  (e.condition as any).hungerState        = "sated";
  return e;
}

/** Apply stepNutrition for totalSeconds at rest (activity = 0) using large delta chunks. */
function drainForSeconds(entity: ReturnType<typeof freshEntity>, totalSeconds: number): void {
  // Use a single large delta for speed (linear, so equivalent to many small steps)
  stepNutrition(entity, totalSeconds, q(0) as Q);
}

/** BMR for the standard test entity (id=1). */
function entityBMR(entity: ReturnType<typeof freshEntity>): number {
  return computeBMR(entity.attributes.morphology.mass_kg);
}

// ── BMR ───────────────────────────────────────────────────────────────────────

describe("computeBMR", () => {
  it("75 kg entity → 80 W", () => {
    // 75 kg = 75 000 SCALE.kg units
    expect(computeBMR(75_000)).toBe(80);
  });

  it("heavier entity has higher BMR", () => {
    expect(computeBMR(100_000)).toBeGreaterThan(computeBMR(75_000));
  });

  it("lighter entity has lower BMR", () => {
    expect(computeBMR(50_000)).toBeLessThan(computeBMR(75_000));
  });

  it("is deterministic and integer-valued", () => {
    const a = computeBMR(75_000);
    const b = computeBMR(75_000);
    expect(a).toBe(b);
    expect(Number.isInteger(a)).toBe(true);
  });
});

// ── Hunger states ─────────────────────────────────────────────────────────────

describe("hunger states", () => {
  it("fresh entity starts sated", () => {
    const e = freshEntity();
    // balance = 0 → sated
    expect((e.condition as any).hungerState).toBe("sated");
  });

  it("12 h × BMR deficit → hungry", () => {
    const e = freshEntity();
    const bmr = entityBMR(e);
    // drain exactly 12 h × BMR
    drainForSeconds(e, 12 * 3600);
    expect((e.condition as any).hungerState).toBe("hungry");
  });

  it("24 h × BMR deficit → starving", () => {
    const e = freshEntity();
    drainForSeconds(e, 24 * 3600);
    expect((e.condition as any).hungerState).toBe("starving");
  });

  it("72 h × BMR deficit → critical", () => {
    const e = freshEntity();
    drainForSeconds(e, 72 * 3600);
    expect((e.condition as any).hungerState).toBe("critical");
  });

  it("ration_bar from hungry → sated", () => {
    const e = freshEntity();
    drainForSeconds(e, 12 * 3600);  // → hungry
    expect((e.condition as any).hungerState).toBe("hungry");

    // Set unlimited inventory (undefined) so consumeFood succeeds
    (e as any).foodInventory = undefined;
    const ok = consumeFood(e, "ration_bar", 0);
    expect(ok).toBe(true);
    // ration_bar adds 2 000 000 J; deficit was ~12h × BMR ≈ 3 456 000 → now < threshold → sated
    expect((e.condition as any).hungerState).toBe("sated");
  });

  it("ration_bar from severe starvation only partially recovers", () => {
    const e = freshEntity();
    drainForSeconds(e, 48 * 3600);  // deep into starving
    const balanceBefore: number = (e.condition as any).caloricBalance_J;
    expect((e.condition as any).hungerState).toBe("starving");

    (e as any).foodInventory = undefined;
    consumeFood(e, "ration_bar", 0);
    const balanceAfter: number = (e.condition as any).caloricBalance_J;

    // Balance improved, but still in starving range
    expect(balanceAfter).toBeGreaterThan(balanceBefore);
    expect((e.condition as any).hungerState).toBe("starving");
  });
});

// ── Food consumption ──────────────────────────────────────────────────────────

describe("consumeFood", () => {
  it("unknown food id → false", () => {
    const e = freshEntity();
    expect(consumeFood(e, "unknown_food_xyz", 0)).toBe(false);
  });

  it("food in inventory → true, inventory decremented", () => {
    const e = freshEntity();
    (e as any).foodInventory = new Map([["ration_bar", 2]]);
    const ok = consumeFood(e, "ration_bar", 10);
    expect(ok).toBe(true);
    expect((e as any).foodInventory.get("ration_bar")).toBe(1);
  });

  it("food NOT in inventory → false", () => {
    const e = freshEntity();
    (e as any).foodInventory = new Map([["ration_bar", 0]]);
    expect(consumeFood(e, "ration_bar", 0)).toBe(false);
  });

  it("energy_J added to caloricBalance_J correctly", () => {
    const e = freshEntity();
    (e as any).foodInventory = undefined;
    const balBefore: number = (e.condition as any).caloricBalance_J;
    consumeFood(e, "ration_bar", 0);
    const balAfter: number = (e.condition as any).caloricBalance_J;
    expect(balAfter - balBefore).toBe(2_000_000);
  });

  it("water_flask reduces fluidLoss and increases hydrationBalance_J", () => {
    const e = freshEntity();
    // Give entity some fluid loss and dehydration
    e.injury.fluidLoss = q(0.20) as Q;  // 20% fluid loss
    (e.condition as any).hydrationBalance_J = -500_000;  // dehydrated

    (e as any).foodInventory = undefined;
    consumeFood(e, "water_flask", 5);

    // Fluid loss should decrease
    expect(e.injury.fluidLoss).toBeLessThan(q(0.20));
    // Hydration balance should increase (less negative)
    const hydBal: number = (e.condition as any).hydrationBalance_J;
    expect(hydBal).toBeGreaterThan(-500_000);
  });
});

// ── Mass loss ─────────────────────────────────────────────────────────────────

describe("mass loss", () => {
  it("no mass loss in sated / hungry state", () => {
    const e = freshEntity();
    const massBefore = e.attributes.morphology.mass_kg;
    // 12 h → hungry; no starving yet, no fat catabolism
    drainForSeconds(e, 12 * 3600);
    expect(e.attributes.morphology.mass_kg).toBe(massBefore);
  });

  it("fat catabolism starts on entering starving state", () => {
    const e = freshEntity();
    const massBefore = e.attributes.morphology.mass_kg;
    // 24 h → starving; mass loss begins
    drainForSeconds(e, 24 * 3600);
    expect((e.condition as any).hungerState).toBe("starving");
    // Just started starving — no loss yet from the 24h call (starving kicked in at the end)
    // Now advance further into starvation
    drainForSeconds(e, 86400);   // 1 full day of starvation
    expect(e.attributes.morphology.mass_kg).toBeLessThan(massBefore);
  });

  it("fat loss rate ≈ 300 SCALE.kg per day in starvation", () => {
    const e = freshEntity();
    // First reach starving state
    drainForSeconds(e, 24 * 3600);
    const massAtStarvingOnset = e.attributes.morphology.mass_kg;

    // 1 full day of starvation (86400 s)
    drainForSeconds(e, 86400);
    const massAfter = e.attributes.morphology.mass_kg;

    // Expected fat loss: 300 SCALE.kg (0.3 kg) per day
    const massLoss = massAtStarvingOnset - massAfter;
    expect(massLoss).toBeGreaterThan(250);  // ≥ 0.25 kg
    expect(massLoss).toBeLessThan(350);     // ≤ 0.35 kg
  });

  it("muscle catabolism in critical state reduces peakForce_N", () => {
    const e = freshEntity();
    const forceBefore = e.attributes.performance.peakForce_N;

    // Reach critical state (72h) then continue 24h more
    drainForSeconds(e, 72 * 3600);  // → critical
    drainForSeconds(e, 24 * 3600);  // 24 h of critical → muscle loss
    expect((e.condition as any).hungerState).toBe("critical");
    expect(e.attributes.performance.peakForce_N).toBeLessThan(forceBefore);
  });

  it("no muscle catabolism in starving state (only fat loss)", () => {
    const e = freshEntity();
    const forceBefore = e.attributes.performance.peakForce_N;

    // 48 h → stays in starving (not yet critical)
    drainForSeconds(e, 24 * 3600);  // reach starving
    drainForSeconds(e, 24 * 3600);  // 24 h in starving
    expect((e.condition as any).hungerState).toBe("starving");

    // Force should be unchanged (only critical triggers muscle catabolism)
    expect(e.attributes.performance.peakForce_N).toBe(forceBefore);
  });
});

// ── Modifiers ─────────────────────────────────────────────────────────────────

describe("deriveHungerModifiers", () => {
  it("sated → identity modifiers", () => {
    const m = deriveHungerModifiers("sated");
    expect(m.staminaMul).toBe(SCALE.Q);   // q(1.0) = 10000
    expect(m.forceMul).toBe(SCALE.Q);
    expect(m.latencyMul).toBe(SCALE.Q);
    expect(m.moraleDecay).toBe(0);
  });

  it("starving → staminaMul and forceMul reduced below SCALE.Q", () => {
    const m = deriveHungerModifiers("starving");
    expect(m.staminaMul).toBeLessThan(SCALE.Q);
    expect(m.forceMul).toBeLessThan(SCALE.Q);
  });

  it("hungry → staminaMul reduced, forceMul and latencyMul at 1.0", () => {
    const m = deriveHungerModifiers("hungry");
    expect(m.staminaMul).toBeLessThan(SCALE.Q);
    expect(m.forceMul).toBe(SCALE.Q);
    expect(m.latencyMul).toBe(SCALE.Q);
    expect(m.moraleDecay).toBe(0);
  });

  it("critical → moraleDecay > 0 and latencyMul > SCALE.Q", () => {
    const m = deriveHungerModifiers("critical");
    expect(m.moraleDecay).toBeGreaterThan(0);
    expect(m.latencyMul).toBeGreaterThan(SCALE.Q);
  });
});

// ── Misc ──────────────────────────────────────────────────────────────────────

describe("FOOD_ITEMS catalogue", () => {
  it("has exactly 6 items", () => {
    expect(FOOD_ITEMS.length).toBe(6);
  });

  it("contains required item IDs", () => {
    const ids = new Set(FOOD_ITEMS.map(f => f.id));
    expect(ids.has("ration_bar")).toBe(true);
    expect(ids.has("water_flask")).toBe(true);
    expect(ids.has("hardtack")).toBe(true);
  });

  it("ration_bar has highest caloric energy, water_flask has zero", () => {
    const bar   = FOOD_ITEMS.find(f => f.id === "ration_bar")!;
    const flask = FOOD_ITEMS.find(f => f.id === "water_flask")!;
    const berry = FOOD_ITEMS.find(f => f.id === "berry_handful")!;
    expect(bar.energy_J).toBeGreaterThan(berry.energy_J);
    expect(flask.energy_J).toBe(0);
    expect(flask.hydration_J).toBeGreaterThan(0);
  });
});
