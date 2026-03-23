/**
 * CE-10 — Pre-built AI Behavior Tree Library
 *
 * A thin, composable layer over the existing AI decision system.  Each
 * `BehaviorNode` receives the ticking entity, the current world state, and
 * kernel context, and either returns a `Command` (success) or `null` (failure /
 * not applicable).
 *
 * ## Semantics
 * - `null`  — node failed / condition not met
 * - Command — node succeeded; caller should use this command
 *
 * ## Composite nodes
 * - `Sequence`  — run children left-to-right; return first **non-null** result
 *                 (priority / fallback selector pattern)
 * - `Fallback`  — identical semantics to Sequence for this usage:
 *                 try children in order, first non-null wins
 *
 * Note: The ROADMAP spec uses "first success wins" for both Sequence and
 * Fallback (i.e. both are priority-selectors).  A traditional BT Sequence
 * would return the *last* child result; here all composites return the first
 * non-null command for practical game-AI use.
 *
 * ## Determinism constraint
 * All nodes are deterministic.  Any tie-breaking or random sampling uses
 * `eventSeed(world.seed, world.tick, entity.id, salt)` — never `Math.random()`.
 */

import type { Entity } from "../entity.js";
import type { WorldState } from "../world.js";
import type { KernelContext } from "../context.js";
import type { Command } from "../commands.js";
import { CommandKinds, MoveModes, DefenceModes } from "../kinds.js";
import { q, SCALE, type Q } from "../../units.js";
import { eventSeed } from "../seeds.js";

// ── Core interface ────────────────────────────────────────────────────────────

/**
 * A single node in a behavior tree.
 *
 * `tick` is called once per AI frame (typically once per `stepWorld` tick).
 * Returns a `Command` if this node produces an action, or `null` if the node's
 * condition is not satisfied (pass control to the next node in a composite).
 */
export interface BehaviorNode {
  tick(entity: Entity, world: WorldState, ctx: KernelContext): Command | null;
}

// ── Internal geometry helpers ─────────────────────────────────────────────────

/** Squared distance between two entities (position_m, 2-D x/y). */
function distSq2D(a: Entity, b: Entity): number {
  const dx = b.position_m.x - a.position_m.x;
  const dy = b.position_m.y - a.position_m.y;
  return dx * dx + dy * dy;
}

/** Integer square-root approximation via Newton's method (no float dependency). */
function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = Math.round(Math.sqrt(n));
  // One Newton step for accuracy at fixed-point scales
  x = Math.trunc((x + Math.trunc(n / Math.max(1, x))) / 2);
  return Math.max(0, x);
}

/** Signed direction from `from` to `to`, normalised to unit Q vector. */
function dirTo(fromX: number, fromY: number, toX: number, toY: number): { x: Q; y: Q; z: Q } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = isqrt(dx * dx + dy * dy);
  if (len === 0) return { x: 0 as Q, y: 0 as Q, z: 0 as Q };
  return {
    x: Math.round((dx * SCALE.Q) / len) as Q,
    y: Math.round((dy * SCALE.Q) / len) as Q,
    z: 0 as Q,
  };
}

/** Find an entity by id in the world, or undefined. */
function findEntity(world: WorldState, id: number): Entity | undefined {
  return world.entities.find(e => e.id === id);
}

/** True if entity is dead or unconscious. */
function isIncapacitated(e: Entity): boolean {
  return (e.injury?.dead ?? false) || (e.injury?.consciousness ?? SCALE.Q) <= 0;
}

// ── Leaf nodes ────────────────────────────────────────────────────────────────

/**
 * Move toward a target entity and attack when in range.
 *
 * If the target is dead or missing, returns null.
 * Flanks by approaching from the target's perpendicular when `flankOffset > 0`.
 *
 * @param targetId     Id of the entity to flank/attack.
 * @param flankOffset  Lateral offset in SCALE.m units (0 = direct approach).
 */
export function FlankTarget(targetId: number, flankOffset = 0): BehaviorNode {
  return {
    tick(entity, world) {
      const target = findEntity(world, targetId);
      if (!target || isIncapacitated(target)) return null;

      const tx = target.position_m.x + flankOffset;
      const ty = target.position_m.y;
      const threshold = 15_000 * 15_000;  // ~1.5 m in SCALE.m

      if (distSq2D(entity, target) <= threshold) {
        // In melee range — attack
        return { kind: CommandKinds.Attack, targetId, intensity: q(1.0) };
      }

      const dir = dirTo(entity.position_m.x, entity.position_m.y, tx, ty);
      return { kind: CommandKinds.Move, dir, intensity: q(1.0), mode: MoveModes.Run };
    },
  };
}

/**
 * Move to a fixed world position and stop when within `arrivalRadius_m` metres.
 *
 * Returns null when already at the destination (no command needed).
 *
 * @param x_m           Destination x [SCALE.m].
 * @param y_m           Destination y [SCALE.m].
 * @param arrivalRadius_m  Stop radius [SCALE.m]. Default 5 000 (0.5 m).
 */
export function RetreatTo(x_m: number, y_m: number, arrivalRadius_m = 5_000): BehaviorNode {
  return {
    tick(entity) {
      const dx = x_m - entity.position_m.x;
      const dy = y_m - entity.position_m.y;
      const r = arrivalRadius_m;
      if (dx * dx + dy * dy <= r * r) return null;  // already there

      const dir = dirTo(entity.position_m.x, entity.position_m.y, x_m, y_m);
      return { kind: CommandKinds.Move, dir, intensity: q(1.0), mode: MoveModes.Run };
    },
  };
}

/**
 * Move toward an allied entity and interpose between it and the nearest threat.
 *
 * - If ally is missing or dead, returns null.
 * - If no threats (other entities) are present, returns null.
 * - Otherwise moves toward the ally.
 *
 * @param allyId   Id of the entity to protect.
 */
export function ProtectAlly(allyId: number): BehaviorNode {
  return {
    tick(entity, world) {
      const ally = findEntity(world, allyId);
      if (!ally || isIncapacitated(ally)) return null;

      // Require at least one other living entity to protect against
      const threats = world.entities.filter(
        e => e.id !== entity.id && e.id !== allyId && !isIncapacitated(e),
      );
      if (threats.length === 0) return null;

      const threshold = 20_000 * 20_000;  // 2 m
      if (distSq2D(entity, ally) <= threshold) {
        // Close enough — defend
        return { kind: CommandKinds.Defend, mode: DefenceModes.Block, intensity: q(1.0) };
      }

      const dir = dirTo(
        entity.position_m.x, entity.position_m.y,
        ally.position_m.x, ally.position_m.y,
      );
      return { kind: CommandKinds.Move, dir, intensity: q(1.0), mode: MoveModes.Run };
    },
  };
}

/**
 * Hold a position: move toward the guard point if outside `radius_m`, defend
 * if inside.  Returns null when the entity is already inside the radius and
 * there are no threats to defend against.
 *
 * @param x_m       Guard point x [SCALE.m].
 * @param y_m       Guard point y [SCALE.m].
 * @param radius_m  Patrol radius [SCALE.m].
 */
export function GuardPosition(x_m: number, y_m: number, radius_m: number): BehaviorNode {
  return {
    tick(entity, world) {
      const dx = x_m - entity.position_m.x;
      const dy = y_m - entity.position_m.y;
      const rSq = radius_m * radius_m;
      const insideRadius = dx * dx + dy * dy <= rSq;

      if (!insideRadius) {
        const dir = dirTo(entity.position_m.x, entity.position_m.y, x_m, y_m);
        return { kind: CommandKinds.Move, dir, intensity: q(1.0), mode: MoveModes.Walk };
      }

      // Inside radius — defend if threats present
      const threats = world.entities.filter(
        e => e.id !== entity.id && !isIncapacitated(e),
      );
      if (threats.length === 0) return null;

      return { kind: CommandKinds.Defend, mode: DefenceModes.Block, intensity: q(0.5) };
    },
  };
}

/**
 * Move toward a target entity and issue a Treat command when in range.
 *
 * - Returns null if target is missing, already dead, or has no injuries.
 * - Healing uses the first injured region found (deterministic iteration order).
 *
 * @param targetId   Id of the entity to heal.
 */
export function HealTarget(targetId: number): BehaviorNode {
  return {
    tick(entity, world) {
      const target = findEntity(world, targetId);
      if (!target || target.injury?.dead) return null;

      // Find an injured region with surface or internal damage
      const byRegion = target.injury?.byRegion;
      if (!byRegion) return null;

      let injuredRegionId: string | undefined;
      for (const [regionId, region] of Object.entries(byRegion)) {
        if ((region.surfaceDamage ?? 0) > 0 || (region.internalDamage ?? 0) > 0) {
          injuredRegionId = regionId;
          break;
        }
      }
      if (!injuredRegionId) return null;

      const threshold = 10_000 * 10_000;  // 1 m
      if (distSq2D(entity, target) > threshold) {
        const dir = dirTo(
          entity.position_m.x, entity.position_m.y,
          target.position_m.x, target.position_m.y,
        );
        return { kind: CommandKinds.Move, dir, intensity: q(0.5), mode: MoveModes.Walk };
      }

      return {
        kind: CommandKinds.Treat,
        targetId,
        action: "bandage",
        tier: "bandage",
        regionId: injuredRegionId,
      };
    },
  };
}

// ── Composite nodes ───────────────────────────────────────────────────────────

/**
 * Priority selector: tries each child node in order and returns the first
 * non-null command.  If all children return null, returns null.
 *
 * This is the most commonly used composite.  Place higher-priority behaviours
 * earlier in the list.
 *
 * @param nodes  Child nodes to evaluate in order.
 */
export function Sequence(...nodes: BehaviorNode[]): BehaviorNode {
  return {
    tick(entity, world, ctx) {
      for (const node of nodes) {
        const result = node.tick(entity, world, ctx);
        if (result !== null) return result;
      }
      return null;
    },
  };
}

/**
 * Fallback: identical to `Sequence` — tries children in order, returns first
 * non-null result.  Provided as a semantic alias for callers who prefer the
 * standard BT naming convention (Sequence = AND-chain; Fallback = OR-chain).
 *
 * @param nodes  Child nodes to evaluate in order.
 */
export function Fallback(...nodes: BehaviorNode[]): BehaviorNode {
  return Sequence(...nodes);
}

// ── Condition-gate nodes ──────────────────────────────────────────────────────

/**
 * Gate: return `inner.tick()` only if the entity's shock is below `maxShockQ`.
 * When the entity is in severe shock it cannot act — returns null instead.
 *
 * Useful for wrapping aggressive nodes: "attack only if not badly shocked."
 *
 * @param maxShockQ  Q threshold; entity.injury.shock must be below this.
 * @param inner      Wrapped node.
 */
export function IfNotShocked(maxShockQ: Q, inner: BehaviorNode): BehaviorNode {
  return {
    tick(entity, world, ctx) {
      if ((entity.injury?.shock ?? 0) >= maxShockQ) return null;
      return inner.tick(entity, world, ctx);
    },
  };
}

/**
 * Gate: return `inner.tick()` only when `entity.energy.fatigue` is below
 * `maxFatigueQ`.  Prevents exhausted entities from taking high-intensity actions.
 *
 * @param maxFatigueQ  Q threshold; fatigue must be below this.
 * @param inner        Wrapped node.
 */
export function IfNotExhausted(maxFatigueQ: Q, inner: BehaviorNode): BehaviorNode {
  return {
    tick(entity, world, ctx) {
      if ((entity.energy?.fatigue ?? 0) >= maxFatigueQ) return null;
      return inner.tick(entity, world, ctx);
    },
  };
}

/**
 * Probabilistic gate: run `inner` only when
 * `eventSeed(world.seed, world.tick, entity.id, salt) % SCALE.Q < probability_Q`.
 *
 * Allows stochastic variation without `Math.random()`.
 *
 * @param probability_Q  Q probability [0..SCALE.Q]; q(1.0) = always, q(0) = never.
 * @param salt           Arbitrary integer to distinguish independent rolls on the
 *                       same entity+tick (default 0).
 * @param inner          Wrapped node.
 */
export function WithProbability(probability_Q: Q, inner: BehaviorNode, salt = 0): BehaviorNode {
  return {
    tick(entity, world, ctx) {
      const roll = eventSeed(world.seed, world.tick, entity.id, 0, salt) % SCALE.Q;
      if (roll >= probability_Q) return null;
      return inner.tick(entity, world, ctx);
    },
  };
}

// ── Pre-built behavior tree presets ──────────────────────────────────────────

/**
 * Standard aggressive attacker: attack `targetId` at full intensity.
 * Falls back to retreat if badly shocked (shock ≥ q(0.70)).
 *
 * @param targetId   Primary attack target.
 * @param retreatX   Fallback retreat x [SCALE.m].
 * @param retreatY   Fallback retreat y [SCALE.m].
 */
export function aggressorTree(targetId: number, retreatX: number, retreatY: number): BehaviorNode {
  return Sequence(
    IfNotShocked(q(0.70), FlankTarget(targetId)),
    RetreatTo(retreatX, retreatY),
  );
}

/**
 * Standard defender: hold position, heal allies when in range, defend otherwise.
 *
 * @param guardX     Guard point x [SCALE.m].
 * @param guardY     Guard point y [SCALE.m].
 * @param radius_m   Guard radius [SCALE.m].
 * @param allyIds    Ally ids to heal (checked in order; first injured ally wins).
 */
export function defenderTree(
  guardX: number,
  guardY: number,
  radius_m: number,
  allyIds: number[],
): BehaviorNode {
  const healNodes = allyIds.map(id => HealTarget(id));
  return Sequence(
    ...healNodes,
    GuardPosition(guardX, guardY, radius_m),
  );
}

/**
 * Medic tree: prioritise healing each ally in the given list (first injured wins),
 * then retreat to a safe point if badly shocked.
 *
 * @param allyIds    Allies to heal in priority order.
 * @param safeX      Retreat x [SCALE.m].
 * @param safeY      Retreat y [SCALE.m].
 */
export function medicTree(allyIds: number[], safeX: number, safeY: number): BehaviorNode {
  const healNodes = allyIds.map(id => HealTarget(id));
  return Sequence(
    IfNotShocked(q(0.80), Sequence(...healNodes)),
    RetreatTo(safeX, safeY),
  );
}
