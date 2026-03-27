// test/acoustic.test.ts — Phase 39: Acoustic Systems tests

import { describe, it, expect } from "vitest";
import type { Q } from "../src/units.js";
import { q, SCALE } from "../src/units.js";
import type { Entity } from "../src/sim/entity.js";
import type { IndividualAttributes } from "../src/types.js";
import {
  deriveAcousticSignature,
  detectAcousticSignature,
  resolveFormationSignal,
  canUseFormationSignals,
  calculateSignalRange,
  type FormationSignal,
} from "../src/competence/acoustic.js";

// Helper to create a minimal entity with specified musical intelligence
function mkEntity(musical: number, velocity: number = 0): Entity {
  return {
    id: 1,
    teamId: 1,
    attributes: {
      cognition: {
        musical: musical as Q,
      },
    } as unknown as IndividualAttributes,
    energy: { reserve_J: 10000, reserveMax_J: 10000 },
    loadout: { armour: [], weapons: [], items: [] },
    traits: [],
    position_m: { x: 0, y: 0, z: 0 },
    velocity_mps: { x: velocity * SCALE.mps, y: 0, z: 0 },
    intent: { type: "idle" },
    action: {},
    condition: {},
    injury: { regions: new Map() },
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" },
  };
}

function mkEntityWithArmour(musical: number, armour: Record<string, unknown>[]): Entity {
  // Convert armour to items with kind="armour"
  const armourItems = armour.map(a => ({ ...a, kind: "armour" }));
  return {
    id: 1,
    teamId: 1,
    attributes: {
      cognition: {
        musical: musical as Q,
      },
    } as unknown as IndividualAttributes,
    energy: { reserve_J: 10000, reserveMax_J: 10000 },
    loadout: { items: armourItems },
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

describe("deriveAcousticSignature", () => {
  it("returns base noise for stationary entity", () => {
    const e = mkEntity(q(0.50), 0);
    const sig = deriveAcousticSignature(e);
    expect(sig.baseNoise).toBeGreaterThan(0);
    expect(sig.movementNoise).toBe(0);
  });

  it("increases noise with velocity", () => {
    const stationary = mkEntity(q(0.50), 0);
    const moving = mkEntity(q(0.50), 5); // 5 m/s
    const stationarySig = deriveAcousticSignature(stationary);
    const movingSig = deriveAcousticSignature(moving);
    expect(movingSig.totalNoise).toBeGreaterThan(stationarySig.totalNoise);
    expect(movingSig.movementNoise).toBeGreaterThan(0);
  });

  it("metal armour increases noise", () => {
    const quiet = mkEntityWithArmour(q(0.50), []);
    const metalArmour = mkEntityWithArmour(q(0.50), [
      { id: "plate", slot: "chest", coverage_Q: q(0.8), material: "metal" },
    ]);
    const quietSig = deriveAcousticSignature(quiet);
    const metalSig = deriveAcousticSignature(metalArmour);
    expect(metalSig.equipmentNoise).toBeGreaterThan(quietSig.equipmentNoise);
  });

  it("total noise never exceeds max", () => {
    const loud = mkEntityWithArmour(q(0.50), [
      { id: "plate1", slot: "chest", coverage_Q: q(0.8), material: "metal" },
      { id: "plate2", slot: "legs", coverage_Q: q(0.8), material: "metal" },
    ]);
    loud.velocity_mps = { x: 10 * SCALE.mps, y: 0, z: 0 };
    const sig = deriveAcousticSignature(loud);
    expect(sig.totalNoise).toBeLessThanOrEqual(100);
  });
});

describe("detectAcousticSignature", () => {
  it("detects loud entities at close range", () => {
    const listener = mkEntity(q(0.50));
    const source = mkEntityWithArmour(q(0.50), [
      { id: "plate", slot: "chest", coverage_Q: q(0.8), material: "metal" },
    ]);
    const result = detectAcousticSignature(listener, source, 10);
    expect(result.detected).toBe(true);
    expect(result.confidence_Q).toBeGreaterThan(q(0.30));
  });

  it("returns valid detection confidence in range", () => {
    const listener = mkEntity(q(0.70));
    const source = mkEntityWithArmour(q(0.50), [
      { id: "plate", slot: "chest", coverage_Q: q(0.8), material: "metal" },
    ]);

    const result = detectAcousticSignature(listener, source, 50);

    expect(result.confidence_Q).toBeGreaterThanOrEqual(0);
    expect(result.confidence_Q).toBeLessThanOrEqual(SCALE.Q);
  });

  it("higher musical intelligence improves detection", () => {
    const lowSkill = mkEntity(q(0.30));
    const highSkill = mkEntity(q(0.90));
    // Use a louder source (moving entity with armour) for clearer differentiation
    const source = mkEntityWithArmour(q(0.50), [
      { id: "plate", slot: "chest", coverage_Q: q(0.8), material: "metal" },
    ]);
    source.velocity_mps = { x: 5 * SCALE.mps, y: 0, z: 0 };

    const lowResult = detectAcousticSignature(lowSkill, source, 30);
    const highResult = detectAcousticSignature(highSkill, source, 30);

    expect(highResult.confidence_Q).toBeGreaterThanOrEqual(lowResult.confidence_Q);
  });

  it("estimates distance when confidence is sufficient", () => {
    const listener = mkEntity(q(0.80));
    const source = mkEntityWithArmour(q(0.50), [
      { id: "plate", slot: "chest", coverage_Q: q(0.8), material: "metal" },
    ]);
    const result = detectAcousticSignature(listener, source, 20);
    if (result.confidence_Q >= q(0.50)) {
      expect(result.estimatedDistance_m).toBeGreaterThan(0);
    }
  });

  it("does not estimate direction at low confidence", () => {
    const listener = mkEntity(q(0.50));
    const source = mkEntity(q(0.50), 0);
    const result = detectAcousticSignature(listener, source, 100);
    if (result.confidence_Q < q(0.70)) {
      expect(result.estimatedDirection_deg).toBe(-1);
    }
  });
});

describe("resolveFormationSignal", () => {
  const signals: FormationSignal[] = [
    "advance", "retreat", "hold", "flank_left", "flank_right", "rally",
  ];

  signals.forEach((signal) => {
    it(`can transmit "${signal}" signal at close range`, () => {
      const signaller = mkEntity(q(0.70));
      const listener = mkEntity(q(0.70));
      const result = resolveFormationSignal(signaller, signal, listener, 10);
      expect(result.received).toBe(true);
      expect(result.clarity_Q).toBeGreaterThanOrEqual(q(0.40));
    });
  });

  it("satyr to elf has excellent reception", () => {
    const satyr = mkEntity(q(0.95)); // High musical
    const elf = mkEntity(q(0.85));   // High musical
    const result = resolveFormationSignal(satyr, "advance", elf, 50);
    expect(result.received).toBe(true);
    expect(result.clarity_Q).toBeGreaterThan(q(0.60));
  });

  it("troll to troll has poor reception at range", () => {
    const troll1 = mkEntity(q(0.25)); // Low musical
    const troll2 = mkEntity(q(0.25));
    const result = resolveFormationSignal(troll1, "rally", troll2, 30);
    expect(result.clarity_Q).toBeLessThan(q(0.50));
  });

  it("signal degrades with distance", () => {
    const signaller = mkEntity(q(0.70));
    const listener = mkEntity(q(0.70));

    const close = resolveFormationSignal(signaller, "hold", listener, 10);
    const far = resolveFormationSignal(signaller, "hold", listener, 100);

    expect(close.clarity_Q).toBeGreaterThan(far.clarity_Q);
  });

  it("high musical reduces latency", () => {
    const lowSkill = mkEntity(q(0.30));
    const highSkill = mkEntity(q(0.90));
    const listener = mkEntity(q(0.50));

    const lowResult = resolveFormationSignal(lowSkill, "advance", listener, 10);
    const highResult = resolveFormationSignal(highSkill, "advance", listener, 10);

    expect(highResult.latency_ms).toBeLessThan(lowResult.latency_ms);
  });

  it("requires minimum clarity for reception", () => {
    const signaller = mkEntity(q(0.40));
    const listener = mkEntity(q(0.40));
    const result = resolveFormationSignal(signaller, "advance", listener, 150);
    expect(result.received).toBe(false);
  });
});

describe("canUseFormationSignals", () => {
  it("returns true for high musical intelligence", () => {
    const e = mkEntity(q(0.70));
    expect(canUseFormationSignals(e)).toBe(true);
  });

  it("returns true for average musical intelligence", () => {
    const e = mkEntity(q(0.50));
    expect(canUseFormationSignals(e)).toBe(true);
  });

  it("returns false for low musical intelligence", () => {
    const e = mkEntity(q(0.20));
    expect(canUseFormationSignals(e, q(0.40))).toBe(false);
  });

  it("respects custom minimum threshold", () => {
    const e = mkEntity(q(0.60));
    expect(canUseFormationSignals(e, q(0.70))).toBe(false);
    expect(canUseFormationSignals(e, q(0.50))).toBe(true);
  });
});

describe("calculateSignalRange", () => {
  it("returns higher range for high musical signaller", () => {
    const highSkill = mkEntity(q(0.95));
    const midSkill = mkEntity(q(0.85));
    const highRange = calculateSignalRange(highSkill);
    const midRange = calculateSignalRange(midSkill);
    // Both should have meaningful range with q(0.95) and q(0.85) signallers
    expect(highRange).toBeGreaterThan(0);
    expect(midRange).toBeGreaterThan(0);
    expect(highRange).toBeGreaterThan(midRange);
  });

  it("returns zero for insufficient musical skill", () => {
    // q(0.50) * 0.50 (avg listener) = 0.25 max clarity, below q(0.40) threshold
    const e = mkEntity(q(0.50));
    const range = calculateSignalRange(e);
    expect(range).toBe(0);
  });

  it("returns positive range for expert skill with standard clarity", () => {
    // q(0.90) * 0.50 = 0.45 max clarity, above q(0.40) threshold
    const e = mkEntity(q(0.90));
    const range = calculateSignalRange(e, q(0.40));
    expect(range).toBeGreaterThan(0);
  });

  it("caps at maximum detection range", () => {
    const e = mkEntity(SCALE.Q); // Perfect musical
    const range = calculateSignalRange(e);
    expect(range).toBeLessThanOrEqual(500);
  });
});
