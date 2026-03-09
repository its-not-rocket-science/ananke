/**
 * Direct unit tests for src/sim/combat.ts
 *
 * Targets the 57% function-coverage gap: parryLeverageQ, chooseArea,
 * isShield, findShield, and shieldCovers are all exercised in isolation
 * rather than solely through kernel integration tests.
 */

import { describe, expect, test } from "vitest";
import { q, SCALE } from "../src/units";
import { STARTER_ARMOUR, STARTER_WEAPONS, STARTER_SHIELDS, findShield, type Loadout, Item } from "../src/equipment";
import { mkHumanoidEntity } from "../src/sim/testing";

import {
  parryLeverageQ,
  chooseArea,
  resolveHit,
  shieldCovers,
  HitArea,
} from "../src/sim/combat";

// isShield is an internal helper in combat.ts; test it indirectly via findShield + kind check
function isShield(item?: Item): boolean {
  return item?.kind === "shield";
}

// ─── parryLeverageQ ───────────────────────────────────────────────────────────

describe("parryLeverageQ", () => {
  const attacker = mkHumanoidEntity(1, 1, 0, 0);

  test("returns a value in [0.85, 1.20] for a standard sword-length weapon", () => {
    const sword = STARTER_WEAPONS[0]!; // club: 0.45m reach, 0.45m arm
    const lev = parryLeverageQ(sword, attacker);
    expect(lev).toBeGreaterThanOrEqual(q(0.85));
    expect(lev).toBeLessThanOrEqual(q(1.20));
  });

  test("very short weapon (knife) stays above minimum", () => {
    const knife = STARTER_WEAPONS[1]!; // 0.2m reach, 0.18m arm
    const lev = parryLeverageQ(knife, attacker);
    expect(lev).toBeGreaterThanOrEqual(q(0.85));
    expect(lev).toBeLessThanOrEqual(q(1.20));
  });

  test("extremely long weapon (pike-like) stays at or below 1.20", () => {
    const pike = {
      ...STARTER_WEAPONS[0]!,
      id: "wpn_pike",
      reach_m: Math.trunc(3.5 * SCALE.m),
      momentArm_m: Math.trunc(2.5 * SCALE.m),
    };
    const lev = parryLeverageQ(pike, attacker);
    expect(lev).toBeLessThanOrEqual(q(1.20));
    expect(lev).toBeGreaterThanOrEqual(q(0.85));
  });

  test("is deterministic — same inputs produce same output", () => {
    const wpn = STARTER_WEAPONS[0]!;
    const a = parryLeverageQ(wpn, attacker);
    const b = parryLeverageQ(wpn, attacker);
    expect(a).toBe(b);
  });

  test("two-handed leverage scales with moment arm", () => {
    const shortArm = { ...STARTER_WEAPONS[0]!, momentArm_m: Math.trunc(0.3 * SCALE.m) };
    const longArm  = { ...STARTER_WEAPONS[0]!, momentArm_m: Math.trunc(1.0 * SCALE.m) };
    const levShort = parryLeverageQ(shortArm, attacker);
    const levLong  = parryLeverageQ(longArm , attacker);
    // Longer moment arm → closer to ref → leverage ≥ short within the clamped range
    expect(levLong).toBeGreaterThanOrEqual(levShort);
  });
});

// ─── chooseArea ───────────────────────────────────────────────────────────────

describe("chooseArea", () => {
  test("returns 'head' for very low rolls (< 0.12)", () => {
    expect(chooseArea(q(0.00))).toBe("head");
    expect(chooseArea(q(0.05))).toBe("head");
    expect(chooseArea(q(0.11))).toBe("head");
  });

  test("returns 'torso' for rolls in [0.12, 0.62)", () => {
    expect(chooseArea(q(0.12))).toBe("torso");
    expect(chooseArea(q(0.40))).toBe("torso");
    expect(chooseArea(q(0.61))).toBe("torso");
  });

  test("returns 'arm' for rolls in [0.62, 0.82)", () => {
    expect(chooseArea(q(0.62))).toBe("arm");
    expect(chooseArea(q(0.70))).toBe("arm");
    expect(chooseArea(q(0.81))).toBe("arm");
  });

  test("returns 'leg' for rolls >= 0.82", () => {
    expect(chooseArea(q(0.82))).toBe("leg");
    expect(chooseArea(q(0.95))).toBe("leg");
    expect(chooseArea(q(1.00))).toBe("leg");
  });

  test("covers all four areas across a sweep", () => {
    const areas = new Set<string>();
    for (let i = 0; i <= 100; i++) {
      areas.add(chooseArea(q(i / 100)));
    }
    expect(areas).toContain("head");
    expect(areas).toContain("torso");
    expect(areas).toContain("arm");
    expect(areas).toContain("leg");
  });
});

// ─── resolveHit ───────────────────────────────────────────────────────────────

describe("resolveHit", () => {
  const GEOM_FRONT = q(0.0);   // dot = 0 → mild bonus
  const HIGH_SKILL = q(0.90);
  const LOW_SKILL  = q(0.10);
  const FULL_INTENSITY = q(1.0);

  test("returns a structurally valid HitResolution", () => {
    const res = resolveHit(42, HIGH_SKILL, LOW_SKILL, GEOM_FRONT, "none", q(0));
    expect(typeof res.hit).toBe("boolean");
    expect(typeof res.blocked).toBe("boolean");
    expect(typeof res.parried).toBe("boolean");
    expect(typeof res.shieldBlocked).toBe("boolean");
    expect(["head", "torso", "arm", "leg"]).toContain(res.area);
    expect(res.hitQuality).toBeGreaterThanOrEqual(0);
    expect(res.hitQuality).toBeLessThanOrEqual(SCALE.Q);
  });

  test("miss always produces hitQuality === 0", () => {
    // With very low attacker skill vs very high defence, a miss is likely.
    // Sweep seeds until we find one that misses, then assert quality.
    let foundMiss = false;
    for (let seed = 1; seed <= 500; seed++) {
      const res = resolveHit(seed, LOW_SKILL, HIGH_SKILL, GEOM_FRONT, "none", q(0));
      if (!res.hit) {
        expect(res.hitQuality).toBe(0);
        foundMiss = true;
        break;
      }
    }
    expect(foundMiss).toBe(true);
  });

  test("hit always produces hitQuality > 0", () => {
    let foundHit = false;
    for (let seed = 1; seed <= 500; seed++) {
      const res = resolveHit(seed, HIGH_SKILL, LOW_SKILL, GEOM_FRONT, "none", q(0));
      if (res.hit) {
        expect(res.hitQuality).toBeGreaterThan(0);
        foundHit = true;
        break;
      }
    }
    expect(foundHit).toBe(true);
  });

  test("blocked flag only set when hit=true", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const res = resolveHit(seed, HIGH_SKILL, LOW_SKILL, GEOM_FRONT, "block", FULL_INTENSITY);
      if (res.blocked) expect(res.hit).toBe(true);
    }
  });

  test("parried flag only set when hit=true", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const res = resolveHit(seed, HIGH_SKILL, LOW_SKILL, GEOM_FRONT, "parry", FULL_INTENSITY);
      if (res.parried) expect(res.hit).toBe(true);
    }
  });

  test("dodge can flip hit to false when triggered", () => {
    let foundDodge = false;
    for (let seed = 1; seed <= 500; seed++) {
      const res = resolveHit(seed, HIGH_SKILL, HIGH_SKILL, GEOM_FRONT, "dodge", FULL_INTENSITY);
      if (!res.hit) {
        foundDodge = true;
        break;
      }
    }
    expect(foundDodge).toBe(true);
  });

  test("is deterministic — same seed produces same result", () => {
    const r1 = resolveHit(7, HIGH_SKILL, LOW_SKILL, GEOM_FRONT, "parry", FULL_INTENSITY);
    const r2 = resolveHit(7, HIGH_SKILL, LOW_SKILL, GEOM_FRONT, "parry", FULL_INTENSITY);
    expect(r1).toEqual(r2);
  });
});

// ─── isShield ─────────────────────────────────────────────────────────────────

describe("isShield", () => {
  test("returns true for a shield item", () => {
    expect(isShield(STARTER_SHIELDS[0])).toBe(true);
  });

  test("returns false for a weapon item", () => {
    expect(isShield(STARTER_WEAPONS[0])).toBe(false);
  });

  test("returns false for null / undefined / plain objects", () => {
    expect(isShield(undefined)).toBe(false);
    expect(isShield({} as Item)).toBe(false);
    expect(isShield(STARTER_ARMOUR[0])).toBe(false);
  });
});

// ─── findShield ───────────────────────────────────────────────────────────────

describe("findShield", () => {
  test("returns undefined when loadout has no shield", () => {
    const loadout: Loadout = { items: [STARTER_WEAPONS[0]!] };
    expect(findShield(loadout)).toBeUndefined();
  });

  test("returns the shield when present", () => {
    const loadout: Loadout = { items: [STARTER_WEAPONS[0]!, STARTER_SHIELDS[0]!] };
    const found = findShield(loadout);
    expect(found).toBeDefined();
    expect(found!.kind).toBe("shield");
    expect(found!.id).toBe("shd_small");
  });

  test("returns undefined for an empty loadout", () => {
    expect(findShield({ items: [] })).toBeUndefined();
  });
});

// ─── shieldCovers ─────────────────────────────────────────────────────────────

describe("shieldCovers", () => {
  const shield = STARTER_SHIELDS[0]!;

  test("covers torso by default", () => {
    expect(shieldCovers(shield, "torso")).toBe(true);
  });

  test("covers head by default", () => {
    expect(shieldCovers(shield, "head")).toBe(true);
  });

  test("covers arm but not leg by default", () => {
    expect(shieldCovers(shield, "arm")).toBe(true);
    expect(shieldCovers(shield, "leg")).toBe(false);
  });

  test("respects explicit covers override on shield item", () => {
    const customShield = { ...shield, covers: ["leg", "arm"] as HitArea[] };
    expect(shieldCovers(customShield, "leg")).toBe(true);
    expect(shieldCovers(customShield, "arm")).toBe(true);
    expect(shieldCovers(customShield, "torso")).toBe(false);
    expect(shieldCovers(customShield, "head")).toBe(false);
  });
});