/**
 * Phase 15: entity factory functions for named real-world archetypes.
 *
 * Each factory returns a fully-initialised Entity ready for use in WorldState.
 * No dependency on src/sim/testing.ts — safe to import from production code.
 */

import { generateIndividual } from "./generate.js";
import {
  AMATEUR_BOXER,
  PRO_BOXER,
  GRECO_WRESTLER,
  KNIGHT_INFANTRY,
  LARGE_PACIFIC_OCTOPUS,
  HUMAN_BASE,
} from "./archetypes.js";
import { STARTER_WEAPONS, STARTER_ARMOUR } from "./equipment.js";
import { defaultIntent } from "./sim/intent.js";
import { defaultAction } from "./sim/action.js";
import { defaultCondition } from "./sim/condition.js";
import { defaultInjury } from "./sim/injury.js";
import { segmentIds, HUMANOID_PLAN, OCTOPOID_PLAN } from "./sim/bodyplan.js";
import { buildSkillMap } from "./sim/skills.js";
import { v3 } from "./sim/vec3.js";
import { q } from "./units.js";
import type { Entity } from "./sim/entity.js";

// ── internal helpers ──────────────────────────────────────────────────────────

function findWeapon(id: string) {
  const w = STARTER_WEAPONS.find(w => w.id === id);
  if (!w) throw new Error(`weapon ${id} not found in STARTER_WEAPONS`);
  return w;
}

// ── factories ─────────────────────────────────────────────────────────────────

/**
 * Create an amateur or pro boxer at the given position.
 *
 * Loadout: boxing gloves.
 * Skills: meleeCombat, meleeDefence, athleticism — scaled by level.
 */
export function mkBoxer(
  id: number,
  teamId: number,
  x: number,
  y: number,
  level: "amateur" | "pro" = "amateur",
): Entity {
  const arch = level === "pro" ? PRO_BOXER : AMATEUR_BOXER;
  const attrs = generateIndividual(id, arch);
  const gloves = findWeapon("wpn_boxing_gloves");

  return {
    id,
    teamId,
    attributes: attrs,
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items: [gloves] },
    traits: [],
    bodyPlan: HUMANOID_PLAN,
    skills: buildSkillMap({
      meleeCombat: { energyTransferMul: level === "pro" ? q(1.15) : q(1.05) },
      meleeDefence: { energyTransferMul: level === "pro" ? q(1.15) : q(1.05) },
      athleticism:  { fatigueRateMul:    level === "pro" ? q(0.82) : q(0.90) },
    }),
    position_m: v3(x, y, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(),
    action: defaultAction(),
    condition: defaultCondition(),
    injury: defaultInjury(segmentIds(HUMANOID_PLAN)),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}

/**
 * Create a Greco-Roman wrestler at the given position.
 *
 * Loadout: none (grapple only).
 * Skills: grappling q(1.50), athleticism fatigueRateMul q(0.85).
 */
export function mkWrestler(
  id: number,
  teamId: number,
  x: number,
  y: number,
): Entity {
  const attrs = generateIndividual(id, GRECO_WRESTLER);

  return {
    id,
    teamId,
    attributes: attrs,
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items: [] },
    traits: [],
    bodyPlan: HUMANOID_PLAN,
    skills: buildSkillMap({
      grappling:   { energyTransferMul: q(1.50) },
      athleticism: { fatigueRateMul:    q(0.85) },
    }),
    position_m: v3(x, y, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(),
    action: defaultAction(),
    condition: defaultCondition(),
    injury: defaultInjury(segmentIds(HUMANOID_PLAN)),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}

/**
 * Create a medieval knight at the given position.
 *
 * Loadout: longsword + plate armour (heaviest available, resist_J=800).
 * Skills: meleeCombat q(1.25), meleeDefence q(1.25).
 */
export function mkKnight(
  id: number,
  teamId: number,
  x: number,
  y: number,
): Entity {
  const attrs = generateIndividual(id, KNIGHT_INFANTRY);
  const longsword   = findWeapon("wpn_longsword");
  const plateArmour = STARTER_ARMOUR[2]!;  // arm_plate — heaviest, resist_J = 800

  return {
    id,
    teamId,
    attributes: attrs,
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items: [longsword, plateArmour] },
    traits: [],
    bodyPlan: HUMANOID_PLAN,
    skills: buildSkillMap({
      meleeCombat:  { energyTransferMul: q(1.25) },
      meleeDefence: { energyTransferMul: q(1.25) },
    }),
    position_m: v3(x, y, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(),
    action: defaultAction(),
    condition: defaultCondition(),
    injury: defaultInjury(segmentIds(HUMANOID_PLAN)),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}

/**
 * Create a large Pacific octopus at the given position.
 *
 * Loadout: none (grapple only via arms).
 * Body plan: OCTOPOID_PLAN (mantle + 8 arms).
 * Skills: grappling q(1.60) — 8 arm-suckers provide extreme leverage bonus.
 */
export function mkOctopus(
  id: number,
  teamId: number,
  x: number,
  y: number,
): Entity {
  const attrs = generateIndividual(id, LARGE_PACIFIC_OCTOPUS);

  return {
    id,
    teamId,
    attributes: attrs,
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items: [] },
    traits: [],
    bodyPlan: OCTOPOID_PLAN,
    skills: buildSkillMap({
      grappling: { energyTransferMul: q(1.60) },
    }),
    position_m: v3(x, y, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(),
    action: defaultAction(),
    condition: defaultCondition(),
    injury: defaultInjury(segmentIds(OCTOPOID_PLAN)),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}

/**
 * Create a baseline scuba diver (unarmed, no special skills) at the given position.
 *
 * Used as a reference opponent for octopus scenarios.
 */
export function mkScubaDiver(
  id: number,
  teamId: number,
  x: number,
  y: number,
): Entity {
  const attrs = generateIndividual(id, HUMAN_BASE);

  return {
    id,
    teamId,
    attributes: attrs,
    energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout: { items: [] },
    traits: [],
    bodyPlan: HUMANOID_PLAN,
    position_m: v3(x, y, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(),
    action: defaultAction(),
    condition: defaultCondition(),
    injury: defaultInjury(segmentIds(HUMANOID_PLAN)),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}
