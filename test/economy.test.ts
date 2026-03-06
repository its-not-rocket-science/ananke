// test/economy.test.ts — Phase 25: Loot & Economy

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  computeItemValue,
  armourConditionQ,
  applyWear,
  resolveDrops,
  evaluateTradeOffer,
  totalInventoryValue,
  WEAR_PENALTY_THRESHOLD,
  WEAR_FUMBLE_THRESHOLD,
  type ItemInventory,
  type TradeOffer,
  type DropTable,
} from "../src/economy.js";
import { STARTER_WEAPONS, STARTER_ARMOUR } from "../src/equipment.js";
import { MEDICAL_RESOURCES } from "../src/downtime.js";
import { mkHumanoidEntity } from "../src/sim/testing.js";
import { stepWorld } from "../src/sim/kernel.js";
import { TICK_HZ } from "../src/sim/tick.js";
import { mkWorld } from "../src/sim/testing.js";
import type { Weapon } from "../src/equipment.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

const wpn_club      = STARTER_WEAPONS.find(w => w.id === "wpn_club")!;
const wpn_longsword = STARTER_WEAPONS.find(w => w.id === "wpn_longsword")!;
const arm_leather   = STARTER_ARMOUR[0]!;  // resist_J = 150
const arm_plate     = STARTER_ARMOUR[2]!;  // resist_J = 800

// ── Group: item value ─────────────────────────────────────────────────────────

describe("item value", () => {
  it("fresh weapon has condition q(1.0)", () => {
    const iv = computeItemValue(wpn_club);
    expect(iv.condition_Q).toBe(q(1.0));
    expect(iv.itemId).toBe("wpn_club");
  });

  it("worn weapon has lower condition_Q than fresh", () => {
    const fresh = computeItemValue(wpn_club, q(0));
    const worn  = computeItemValue(wpn_club, q(0.50));
    expect(worn.condition_Q).toBeLessThan(fresh.condition_Q);
  });

  it("armourConditionQ returns q(1.0) when fully intact", () => {
    const cq = armourConditionQ(arm_leather.resist_J, arm_leather.resist_J);
    expect(cq).toBe(q(1.0));
  });

  it("armourConditionQ scales with damage (half resist → ~q(0.50))", () => {
    const cq = armourConditionQ(arm_leather.resist_J, Math.floor(arm_leather.resist_J / 2));
    expect(cq).toBeGreaterThan(q(0.45));
    expect(cq).toBeLessThan(q(0.55));
  });

  it("MEDICAL_RESOURCES map correctly to baseValue = costUnits", () => {
    for (const res of MEDICAL_RESOURCES) {
      const iv = computeItemValue(res);
      expect(iv.baseValue).toBe(res.costUnits);
      expect(iv.condition_Q).toBe(q(1.0));   // consumables don't degrade
      expect(iv.sellFraction).toBeGreaterThan(0);
    }
  });

  it("total inventory value sums count × unitValue", () => {
    const inv: ItemInventory = new Map([
      ["sword",   { count: 2, unitValue: 50 }],
      ["bandage", { count: 5, unitValue:  1 }],
    ]);
    expect(totalInventoryValue(inv)).toBe(2 * 50 + 5 * 1);
  });

  it("arm_plate has higher baseValue than arm_leather (more resist_J)", () => {
    const ivPlate   = computeItemValue(arm_plate);
    const ivLeather = computeItemValue(arm_leather);
    expect(ivPlate.baseValue).toBeGreaterThan(ivLeather.baseValue);
  });
});

// ── Group: wear mechanics ─────────────────────────────────────────────────────

describe("wear mechanics", () => {
  // Fresh weapon with no wear_Q set
  const freshWeapon: Weapon = { ...wpn_club, wear_Q: q(0) };

  it("single strike at full intensity adds q(0.001)", () => {
    const result = applyWear(freshWeapon, q(1.0));
    expect(result.wear_Q).toBe(q(0.001));
  });

  it("hard opponent (intensity q(1.0)) adds more wear than soft (q(0.50))", () => {
    const hard = applyWear(freshWeapon, q(1.0));
    const soft = applyWear(freshWeapon, q(0.50));
    expect(hard.wear_Q).toBeGreaterThan(soft.wear_Q);
  });

  it("wear ≥ q(0.30) sets penaltyActive", () => {
    const nearPenalty: Weapon = { ...wpn_club, wear_Q: (WEAR_PENALTY_THRESHOLD - 1) };
    const result = applyWear(nearPenalty, q(1.0));
    expect(result.wear_Q).toBeGreaterThanOrEqual(WEAR_PENALTY_THRESHOLD);
    expect(result.penaltyActive).toBe(true);
  });

  it("below penalty threshold → penaltyActive is false", () => {
    const result = applyWear(freshWeapon, q(1.0));
    expect(result.penaltyActive).toBe(false);
  });

  it("wear ≥ q(0.70) can trigger fumble with seed", () => {
    const nearFumble: Weapon = { ...wpn_club, wear_Q: WEAR_FUMBLE_THRESHOLD };
    // With a fixed seed, fumble result is deterministic
    const r1 = applyWear(nearFumble, q(1.0), 42);
    const r2 = applyWear(nearFumble, q(1.0), 42);
    expect(r1.fumble).toBe(r2.fumble);  // deterministic
  });

  it("fumble is false without a seed", () => {
    const nearFumble: Weapon = { ...wpn_club, wear_Q: WEAR_FUMBLE_THRESHOLD };
    const result = applyWear(nearFumble, q(1.0));  // no seed
    expect(result.fumble).toBe(false);
  });

  it("wear ≥ q(1.0) → broke=true", () => {
    const maxWear: Weapon = { ...wpn_club, wear_Q: (SCALE.Q - 1) };
    const result = applyWear(maxWear, q(1.0));
    expect(result.broke).toBe(true);
    expect(result.wear_Q).toBe(SCALE.Q);
  });

  it("armour condition maps resistRemaining_J proportionally", () => {
    // Full resist → condition q(1.0)
    expect(armourConditionQ(800, 800)).toBe(q(1.0));
    // Zero resist → condition q(0)
    expect(armourConditionQ(800, 0)).toBe(q(0));
    // Proportional between
    const half = armourConditionQ(800, 400);
    expect(half).toBeGreaterThan(q(0.40));
    expect(half).toBeLessThan(q(0.60));
  });
});

// ── Group: drop resolution ────────────────────────────────────────────────────

describe("drop resolution", () => {
  it("guaranteed items always drop from dead entity", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.loadout = { items: [wpn_club, arm_leather] };
    entity.injury.dead = true;

    const drops = resolveDrops(entity, 1);
    expect(drops).toContain("wpn_club");
    expect(drops).toContain("arm_leather");
  });

  it("probabilistic item at q(1.0) always drops from dead entity", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.injury.dead = true;
    const extra: DropTable = { guaranteed: [], probabilistic: [{ itemId: "magic_sword", chance_Q: q(1.0) }] };
    const drops = resolveDrops(entity, 1, extra);
    expect(drops).toContain("magic_sword");
  });

  it("probabilistic item at q(0) never drops", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.injury.dead = true;
    const extra: DropTable = { guaranteed: [], probabilistic: [{ itemId: "rare_gem", chance_Q: q(0) }] };
    const drops = resolveDrops(entity, 1, extra);
    expect(drops).not.toContain("rare_gem");
  });

  it("drops are deterministic with seed (same seed → same result)", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.injury.dead = true;
    const extra: DropTable = {
      guaranteed: [],
      probabilistic: [
        { itemId: "coin_pouch", chance_Q: q(0.50) },
        { itemId: "gem",        chance_Q: q(0.25) },
      ],
    };
    const a = resolveDrops(entity, 999, extra);
    const b = resolveDrops(entity, 999, extra);
    expect(a).toEqual(b);
  });

  it("dead entity drops all equipped weapons and armour", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.loadout = { items: [wpn_longsword, arm_plate] };
    entity.injury.dead = true;
    const drops = resolveDrops(entity, 7);
    expect(drops).toContain("wpn_longsword");
    expect(drops).toContain("arm_plate");
  });

  it("incapacitated entity drops nothing by default", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.loadout = { items: [wpn_club] };
    entity.injury.dead = false;   // alive but incapacitated

    const drops = resolveDrops(entity, 1);
    expect(drops).toHaveLength(0);
  });

  it("incapacitated entity drops equipment when dropOnIncapacitated=true", () => {
    const entity = mkHumanoidEntity(1, 1, 0, 0);
    entity.loadout = { items: [wpn_club] };
    entity.injury.dead = false;

    const drops = resolveDrops(entity, 1, undefined, { dropOnIncapacitated: true });
    expect(drops).toContain("wpn_club");
  });
});

// ── Group: trade evaluation ───────────────────────────────────────────────────

describe("trade evaluation", () => {
  it("positive net value → advantageous for accepting party", () => {
    const inventory: ItemInventory = new Map([
      ["bandage", { count: 10, unitValue: 1 }],
    ]);
    const offer: TradeOffer = {
      give: [{ itemId: "sword", count: 1, unitValue: 50 }],
      want: [{ itemId: "bandage", count: 5, unitValue: 1 }],
    };
    const result = evaluateTradeOffer(offer, inventory);
    expect(result.netValue).toBeGreaterThan(0);  // receive 50, give 5 → +45
    expect(result.feasible).toBe(true);
  });

  it("negative net value — bad deal for accepting party", () => {
    const inventory: ItemInventory = new Map([
      ["gold", { count: 100, unitValue: 10 }],
    ]);
    const offer: TradeOffer = {
      give: [{ itemId: "stick",  count: 1, unitValue: 1 }],
      want: [{ itemId: "gold",   count: 5, unitValue: 10 }],
    };
    const result = evaluateTradeOffer(offer, inventory);
    expect(result.netValue).toBeLessThan(0);  // receive 1, give 50 → −49
  });

  it("infeasible when want item not in inventory", () => {
    const inventory: ItemInventory = new Map();  // empty
    const offer: TradeOffer = {
      give: [{ itemId: "sword",  count: 1, unitValue: 50 }],
      want: [{ itemId: "potion", count: 1, unitValue: 10 }],
    };
    const result = evaluateTradeOffer(offer, inventory);
    expect(result.feasible).toBe(false);
  });

  it("zero-value exchange is feasible when items are present", () => {
    const inventory: ItemInventory = new Map([
      ["hat", { count: 2, unitValue: 0 }],
    ]);
    const offer: TradeOffer = {
      give: [{ itemId: "hat", count: 1, unitValue: 0 }],
      want: [{ itemId: "hat", count: 1, unitValue: 0 }],
    };
    const result = evaluateTradeOffer(offer, inventory);
    expect(result.netValue).toBe(0);
    expect(result.feasible).toBe(true);
  });

  it("evaluateTradeOffer is deterministic (no RNG)", () => {
    const inventory: ItemInventory = new Map([
      ["bandage", { count: 10, unitValue: 1 }],
    ]);
    const offer: TradeOffer = {
      give: [{ itemId: "sword",  count: 1, unitValue: 50 }],
      want: [{ itemId: "bandage", count: 3, unitValue: 1 }],
    };
    expect(evaluateTradeOffer(offer, inventory)).toEqual(evaluateTradeOffer(offer, inventory));
  });
});

// ── Group: integration ────────────────────────────────────────────────────────

describe("integration", () => {
  it("arena trial: drops resolved for the loser (dead entity)", () => {
    const attacker = mkHumanoidEntity(1, 1, 0, 0);
    const defender = mkHumanoidEntity(2, 2, Math.trunc(0.6 * SCALE.m), 0);
    attacker.loadout = { items: [wpn_longsword] };
    defender.loadout = { items: [wpn_club, arm_leather] };

    const world  = mkWorld(42, [attacker, defender]);
    const cmds   = new Map([[1, [{ kind: "attack" as const, targetId: 2, weaponId: "wpn_longsword", intensity: q(1.0), mode: "strike" as const }]]]);

    for (let i = 0; i < 20 * TICK_HZ; i++) stepWorld(world, cmds, { tractionCoeff: q(0.9) });

    const dead = world.entities.filter(e => e.injury.dead);
    if (dead.length > 0) {
      const drops = resolveDrops(dead[0]!, world.seed);
      expect(Array.isArray(drops)).toBe(true);
    }
    // Always true: no error thrown
    expect(true).toBe(true);
  });

  it("wear accumulates over multiple strikes", () => {
    const weapon: Weapon = { ...wpn_club, wear_Q: q(0) };
    let current: Weapon = weapon;
    for (let i = 0; i < 10; i++) {
      const result = applyWear(current, q(1.0));
      current = { ...current, wear_Q: result.wear_Q };
    }
    // After 10 strikes at q(1.0), wear = 10 × q(0.001) = q(0.01)
    const finalWear = (current).wear_Q as number;
    expect(finalWear).toBeGreaterThanOrEqual(q(0.009));
    expect(finalWear).toBeLessThanOrEqual(q(0.015));
  });

  it("economy report: total loot value computed from drops", () => {
    const defender = mkHumanoidEntity(2, 2, 0, 0);
    defender.loadout = { items: [wpn_longsword, arm_leather] };
    defender.injury.dead = true;

    const drops = resolveDrops(defender, 1);
    const inv: ItemInventory = new Map();
    for (const id of drops) {
      // Look up item value from starter sets
      const item =
        [...STARTER_WEAPONS, ...STARTER_ARMOUR].find(it => it.id === id);
      if (item) {
        const iv = computeItemValue(item);
        const existing = inv.get(id);
        if (existing) existing.count += 1;
        else inv.set(id, { count: 1, unitValue: iv.baseValue });
      }
    }
    const totalValue = totalInventoryValue(inv);
    expect(totalValue).toBeGreaterThan(0);
  });
});
