// test/willpower.test.ts — Phase 38: Willpower Reserve tests

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";
import type { Entity } from "../src/sim/entity.js";
import type { IndividualAttributes } from "../src/types.js";
import {
  computeMaxWillpower,
  initializeWillpower,
  deductWillpower,
  replenishWillpower,
  stepConcentrationWillpower,
  hasSufficientWillpower,
  getWillpowerRatio,
  setWillpower,
  type WillpowerState,
} from "../src/competence/willpower.js";

// Helper to create a minimal entity with specified intrapersonal intelligence
function mkEntity(intrapersonal: number): Entity {
  return {
    id: 1,
    teamId: 1,
    attributes: {
      cognition: { intrapersonal: intrapersonal as Q },
    } as unknown as IndividualAttributes,
    energy: { reserve_J: 10000, reserveMax_J: 10000 },
    loadout: { armour: [], weapons: [], items: [] },
    traits: [],
    position_m: { x: 0, y: 0, z: 0 },
    velocity_mps: { x: 0, y: 0, z: 0 },
    intent: { type: "idle" },
    action: {},
    condition: {},
    injury: { regions: new Map() },
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" },
  };
}

describe("computeMaxWillpower", () => {
  it("returns 25000J for average intrapersonal q(0.50)", () => {
    const e = mkEntity(q(0.50));
    expect(computeMaxWillpower(e)).toBe(25000);
  });

  it("returns 50000J for max intrapersonal q(1.0)", () => {
    const e = mkEntity(SCALE.Q);
    expect(computeMaxWillpower(e)).toBe(50000);
  });

  it("returns 0J for zero intrapersonal", () => {
    const e = mkEntity(0);
    expect(computeMaxWillpower(e)).toBe(0);
  });

  it("scales linearly with intrapersonal", () => {
    const e75 = mkEntity(q(0.75));
    expect(computeMaxWillpower(e75)).toBe(37500);
  });
});

describe("initializeWillpower", () => {
  it("starts at full willpower", () => {
    const e = mkEntity(q(0.60));
    const state = initializeWillpower(e);
    expect(state.max_J).toBe(30000);
    expect(state.current_J).toBe(30000);
  });

  it("calculates correct max for low intrapersonal", () => {
    const e = mkEntity(q(0.20));
    const state = initializeWillpower(e);
    expect(state.max_J).toBe(10000);
    expect(state.current_J).toBe(10000);
  });
});

describe("deductWillpower", () => {
  it("succeeds when sufficient willpower exists", () => {
    const state: WillpowerState = { current_J: 10000, max_J: 10000 };
    const result = deductWillpower(state, 3000);
    expect(result.success).toBe(true);
    expect(result.remaining_J).toBe(7000);
    expect(state.current_J).toBe(7000);
  });

  it("fails when insufficient willpower", () => {
    const state: WillpowerState = { current_J: 1000, max_J: 10000 };
    const result = deductWillpower(state, 3000);
    expect(result.success).toBe(false);
    expect(result.remaining_J).toBe(1000);
    expect(state.current_J).toBe(1000); // unchanged
  });

  it("marks depleted when below concentration threshold", () => {
    const state: WillpowerState = { current_J: 100, max_J: 10000 };
    const result = deductWillpower(state, 51); // 100 - 51 = 49, below threshold of 50
    expect(result.success).toBe(true);
    expect(result.depleted).toBe(true);
  });

  it("does not mark depleted when above concentration threshold", () => {
    const state: WillpowerState = { current_J: 500, max_J: 10000 };
    const result = deductWillpower(state, 100);
    expect(result.success).toBe(true);
    expect(result.depleted).toBe(false);
  });
});

describe("replenishWillpower", () => {
  it("replenishes by 10% per hour at rest", () => {
    const state: WillpowerState = { current_J: 5000, max_J: 10000 };
    const replenished = replenishWillpower(state, 1);
    expect(replenished).toBe(1000); // 10% of max
    expect(state.current_J).toBe(6000);
  });

  it("replenishes proportionally for partial hours", () => {
    const state: WillpowerState = { current_J: 5000, max_J: 10000 };
    const replenished = replenishWillpower(state, 0.5);
    expect(replenished).toBe(500); // 5% of max
    expect(state.current_J).toBe(5500);
  });

  it("caps at max willpower", () => {
    const state: WillpowerState = { current_J: 9500, max_J: 10000 };
    const replenished = replenishWillpower(state, 1);
    expect(replenished).toBe(500); // only what was needed to reach max
    expect(state.current_J).toBe(10000);
  });

  it("replenishes nothing when already at max", () => {
    const state: WillpowerState = { current_J: 10000, max_J: 10000 };
    const replenished = replenishWillpower(state, 1);
    expect(replenished).toBe(0);
    expect(state.current_J).toBe(10000);
  });
});

describe("stepConcentrationWillpower", () => {
  it("deducts concentration cost and returns true when sufficient", () => {
    const state: WillpowerState = { current_J: 1000, max_J: 10000 };
    const canMaintain = stepConcentrationWillpower(state);
    expect(canMaintain).toBe(true);
    expect(state.current_J).toBe(900); // 100 deducted
  });

  it("returns false when insufficient for concentration", () => {
    const state: WillpowerState = { current_J: 50, max_J: 10000 };
    const canMaintain = stepConcentrationWillpower(state);
    expect(canMaintain).toBe(false);
    expect(state.current_J).toBe(50); // unchanged - not enough to deduct
  });

  it("returns false when exactly at drain amount", () => {
    const state: WillpowerState = { current_J: 100, max_J: 10000 };
    const canMaintain = stepConcentrationWillpower(state);
    expect(canMaintain).toBe(false); // 100 - 100 = 0, which is < 50 threshold
    expect(state.current_J).toBe(0);
  });
});

describe("hasSufficientWillpower", () => {
  it("returns true when current >= cost", () => {
    const state: WillpowerState = { current_J: 5000, max_J: 10000 };
    expect(hasSufficientWillpower(state, 3000)).toBe(true);
  });

  it("returns false when current < cost", () => {
    const state: WillpowerState = { current_J: 1000, max_J: 10000 };
    expect(hasSufficientWillpower(state, 3000)).toBe(false);
  });

  it("returns true when current exactly equals cost", () => {
    const state: WillpowerState = { current_J: 3000, max_J: 10000 };
    expect(hasSufficientWillpower(state, 3000)).toBe(true);
  });
});

describe("getWillpowerRatio", () => {
  it("returns q(1.0) at full willpower", () => {
    const state: WillpowerState = { current_J: 10000, max_J: 10000 };
    expect(getWillpowerRatio(state)).toBe(SCALE.Q);
  });

  it("returns q(0.50) at half willpower", () => {
    const state: WillpowerState = { current_J: 5000, max_J: 10000 };
    expect(getWillpowerRatio(state)).toBe(q(0.50));
  });

  it("returns q(0) at empty willpower", () => {
    const state: WillpowerState = { current_J: 0, max_J: 10000 };
    expect(getWillpowerRatio(state)).toBe(0);
  });
});

describe("setWillpower", () => {
  it("sets willpower to specified value", () => {
    const state: WillpowerState = { current_J: 5000, max_J: 10000 };
    setWillpower(state, 8000);
    expect(state.current_J).toBe(8000);
  });

  it("clamps to max when value exceeds max", () => {
    const state: WillpowerState = { current_J: 5000, max_J: 10000 };
    setWillpower(state, 15000);
    expect(state.current_J).toBe(10000);
  });

  it("clamps to 0 when value negative", () => {
    const state: WillpowerState = { current_J: 5000, max_J: 10000 };
    setWillpower(state, -1000);
    expect(state.current_J).toBe(0);
  });
});
