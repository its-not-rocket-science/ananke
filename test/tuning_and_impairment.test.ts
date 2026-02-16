import { expect, test } from "vitest";
import { q, SCALE } from "../src/units";
import { STARTER_WEAPONS } from "../src/equipment";
import { stepWorld } from "../src/sim/kernel";
import { v3 } from "../src/sim/vec3";
import type { CommandMap } from "../src/sim/commands";
import { TUNING } from "../src/sim/tuning";

import { mkWorld } from "./helpers/entities";

test("tactical/sim: severe leg damage forces prone; arcade does not", () => {
  const worldTac = mkWorld(10, { items: [] });
  const worldArc = mkWorld(10, { items: [] });

  worldTac.entities[0]!.injury.byRegion.leftLeg.structuralDamage = q(0.95);
  worldTac.entities[0]!.injury.byRegion.rightLeg.structuralDamage = q(0.95);

  worldArc.entities[0]!.injury.byRegion.leftLeg.structuralDamage = q(0.95);
  worldArc.entities[0]!.injury.byRegion.rightLeg.structuralDamage = q(0.95);

  const cmds: CommandMap = new Map();
  cmds.set(1, [{ kind: "move", dir: v3(SCALE.Q, 0, 0), intensity: q(1.0), mode: "walk" }]);

  stepWorld(worldTac, cmds, { tractionCoeff: q(0.9), tuning: TUNING.tactical });
  stepWorld(worldArc, cmds, { tractionCoeff: q(0.9), tuning: TUNING.arcade });

  expect(worldTac.entities[0]!.condition.prone).toBe(true);
  // arcade keeps the option open (no forced prone)
  expect(worldArc.entities[0]!.condition.prone).toBe(false);
});

test("unconscious threshold prevents attacks (tactical)", () => {
  const wpn = STARTER_WEAPONS[0]!;
  const world = mkWorld(20, { items: [wpn] });

  // below tactical unconscious threshold (0.10)
  world.entities[0]!.injury.consciousness = q(0.05);

  const cmds: CommandMap = new Map();
  cmds.set(1, [{ kind: "attack", targetId: 2, weaponId: wpn.id, intensity: q(1.0) }]);

  stepWorld(world, cmds, { tractionCoeff: q(0.9), tuning: TUNING.tactical });

  // target should remain unharmed
  const tgt = world.entities[1]!.injury;
  const total = tgt.byRegion.head.surfaceDamage + tgt.byRegion.torso.surfaceDamage +
    tgt.byRegion.leftArm.surfaceDamage + tgt.byRegion.rightArm.surfaceDamage +
    tgt.byRegion.leftLeg.surfaceDamage + tgt.byRegion.rightLeg.surfaceDamage;
  expect(total).toBe(0);
});
