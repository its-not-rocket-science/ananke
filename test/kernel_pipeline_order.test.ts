import { describe, expect, test } from "vitest";
import { generateIndividual } from "../src/generate";
import { HUMAN_BASE } from "../src/archetypes";
import { q, SCALE } from "../src/units";
import { stepWorld } from "../src/sim/kernel";
import { defaultCondition } from "../src/sim/condition";
import { defaultInjury } from "../src/sim/injury";
import { defaultIntent } from "../src/sim/intent";
import { defaultAction } from "../src/sim/action";
import { v3 } from "../src/sim/vec3";
import type { WorldState } from "../src/sim/world";
import { GrappleState } from "../src";
import { STARTER_WEAPONS, type Loadout } from "../src/equipment";
import { STEP_PHASE_ORDER } from "../src/sim/step/pipeline";

describe("kernel pipeline ordering", () => {
  test("phase order contract remains explicit", () => {
    expect(STEP_PHASE_ORDER).toEqual([
      "prepare",
      "cooldowns",
      "capabilityLifecycle",
      "intent",
      "movement",
      "hazardsAndPush",
      "actions",
      "grappleMaintenance",
      "impactResolution",
      "effects",
      "physiology",
      "morale",
      "finalize",
    ]);
  });

  test("trace ordering keeps attack resolution before injury emission", () => {
    const aAttrs = generateIndividual(123, HUMAN_BASE);
    const bAttrs = generateIndividual(456, HUMAN_BASE);

    const world: WorldState = {
      tick: 0,
      seed: 7,
      entities: [
        {
          id: 1,
          teamId: 1,
          attributes: aAttrs,
          energy: { reserveEnergy_J: aAttrs.performance.reserveEnergy_J, fatigue: q(0) },
          loadout: { items: [STARTER_WEAPONS[0]!] } as Loadout,
          traits: [],
          position_m: v3(0, 0, 0),
          velocity_mps: v3(0, 0, 0),
          intent: defaultIntent(),
          action: defaultAction(),
          condition: defaultCondition(),
          injury: defaultInjury(),
          grapple: {} as GrappleState,
        },
        {
          id: 2,
          teamId: 2,
          attributes: bAttrs,
          energy: { reserveEnergy_J: bAttrs.performance.reserveEnergy_J, fatigue: q(0) },
          loadout: { items: [] },
          traits: [],
          position_m: v3(Math.trunc(0.6 * SCALE.m), 0, 0),
          velocity_mps: v3(0, 0, 0),
          intent: defaultIntent(),
          action: defaultAction(),
          condition: defaultCondition(),
          injury: defaultInjury(),
          grapple: {} as GrappleState,
        },
      ],
    };

    const events: Array<{ kind: string; entityId?: number; targetId?: number }> = [];

    stepWorld(
      world,
      new Map([[1, [{ kind: "attack", targetId: 2, weaponId: "wpn_club", intensity: q(1.0), mode: "strike" }]]]),
      { tractionCoeff: q(0.9), trace: { onEvent: (ev) => events.push(ev as never) } },
    );

    const attackIdx = events.findIndex((e) => e.kind === "attack");
    const targetInjuryIdx = events.findIndex((e) => e.kind === "injury" && e.entityId === 2);
    const tickEndIdx = events.findIndex((e) => e.kind === "tickEnd");

    expect(attackIdx).toBeGreaterThanOrEqual(0);
    expect(targetInjuryIdx).toBeGreaterThanOrEqual(0);
    expect(tickEndIdx).toBeGreaterThan(targetInjuryIdx);
    expect(attackIdx).toBeLessThan(targetInjuryIdx);
  });
});
