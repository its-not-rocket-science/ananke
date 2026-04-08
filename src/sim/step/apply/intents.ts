import type { Command } from "../../commands.js";
import { deriveFunctionalState, hasAllDisabledFunctions } from "../../impairment.js";
import { SCALE, clampQ, q } from "../../../units.js";
import type { Entity } from "../../entity.js";
import type { SimulationTuning } from "../../tuning.js";

export function applyCommands(e: Entity, commands: readonly Command[]): void {
  e.intent.defence = { mode: "none", intensity: q(0) };

  for (const c of commands) {
    if (c.kind === "setProne") e.condition.prone = c.prone;
    else if (c.kind === "move") e.intent.move = { dir: c.dir, intensity: c.intensity, mode: c.mode };
    else if (c.kind === "defend") e.intent.defence = { mode: c.mode, intensity: clampQ(c.intensity, 0, SCALE.Q) };
  }
}

export function applyFunctionalGating(e: Entity, tuning: SimulationTuning): void {
  const func = deriveFunctionalState(e, tuning);

  if (!func.canAct) {
    e.intent.defence = { mode: "none", intensity: q(0) };
    e.intent.move = { dir: { x: 0, y: 0, z: 0 }, intensity: q(0), mode: "walk" };
    if (tuning.realism !== "arcade") e.condition.prone = true;
    return;
  }

  if (e.condition.pinned && tuning.realism !== "arcade") {
    e.intent.defence = { mode: "none", intensity: q(0) };
    e.condition.prone = true;
  }

  if (e.energy.reserveEnergy_J <= 0 && tuning.realism !== "arcade") {
    e.condition.prone = true;
    e.intent.defence = { mode: "none", intensity: q(0) };
  }

  if (!func.canStand && tuning.realism !== "arcade") e.condition.prone = true;

  if (tuning.realism !== "arcade") {
    const armsOut = hasAllDisabledFunctions(
      func,
      "leftManipulation",
      "rightManipulation",
    );

    if (armsOut && (e.intent.defence.mode === "block" || e.intent.defence.mode === "parry")) {
      e.intent.defence = { mode: "none", intensity: q(0) };
    }

    const legsOut = hasAllDisabledFunctions(
      func,
      "leftLocomotion",
      "rightLocomotion",
    );

    if (legsOut && e.intent.move.mode === "sprint") {
      e.intent.move = { ...e.intent.move, mode: "walk" };
    }
  }
}

export function applyStandAndKO(e: Entity, tuning: SimulationTuning): void {
  const wasUnconscious = e.condition.unconsciousTicks > 0;

  if (e.injury.consciousness <= tuning.unconsciousThreshold) {
    if (!wasUnconscious) {
      e.condition.unconsciousTicks = tuning.unconsciousBaseTicks;
      e.condition.prone = true;
      e.intent.defence = { mode: "none", intensity: q(0) };
      e.intent.move = { dir: { x: 0, y: 0, z: 0 }, intensity: q(0), mode: "walk" };

      if (tuning.dropWeaponsOnUnconscious) {
        e.loadout.items = e.loadout.items.filter(it => it.kind !== "weapon");
      }
    } else {
      e.condition.prone = true;
    }
  }

  if (e.condition.unconsciousTicks > 0) {
    e.intent.defence = { mode: "none", intensity: q(0) };
    e.intent.move = { dir: { x: 0, y: 0, z: 0 }, intensity: q(0), mode: "walk" };
    e.condition.prone = true;
    return;
  }

  if (!e.intent.prone && e.condition.prone) {
    if (tuning.realism === "arcade") {
      e.condition.prone = false;
      return;
    }

    if (e.condition.standBlockedTicks > 0) {
      e.condition.prone = true;
      return;
    }

    const func = deriveFunctionalState(e, tuning);
    const slow = (SCALE.Q - func.mobilityMul);
    const extra = Math.trunc((slow * tuning.standUpMaxExtraTicks) / SCALE.Q);
    const ticks = tuning.standUpBaseTicks + extra;

    e.condition.standBlockedTicks = Math.max(1, ticks);
    e.condition.prone = true;
    e.intent.prone = true;
  }
}
