// src/kinship.ts — Phase 76: Kinship & Lineage
//
// Tracks parent-child-partner links for entities and provides ancestry queries,
// degree-of-kinship computation, and inherited renown from the Phase 75 system.
//
// Design:
//   - Separate from Entity — the lineage graph lives in a `LineageRegistry`,
//     not in entity fields, so no kernel changes are required.
//   - `computeKinshipDegree` uses BFS over the undirected family graph (parents,
//     children, partners counted at degree 1).
//   - `inheritedRenown` sums ancestor renown_Q with geometric depth-decay so that
//     a mythic grandparent grants a modest but real reputation bonus.
//   - Deterministic: no Math.random(); only pure data queries.

import type { RenownRecord, RenownRegistry } from "./renown.js";
import { q, SCALE, clampQ } from "./units.js";
import type { Q } from "./units.js";

// ── Core types ─────────────────────────────────────────────────────────────────

/** A single entity's family links within the lineage graph. */
export interface LineageNode {
  entityId:   number;
  /** 0, 1, or 2 biological parent IDs. */
  parentIds:  number[];
  /** All children recorded via `recordBirth`. */
  childIds:   number[];
  /** All recorded partners (may grow over time). */
  partnerIds: number[];
}

/** Registry of all lineage nodes, keyed by entityId. */
export interface LineageRegistry {
  nodes: Map<number, LineageNode>;
}

/** Human-readable kinship label derived from `computeKinshipDegree`. */
export type KinshipLabel =
  | "self"            // degree 0
  | "immediate"       // degree 1: parent / child / sibling / partner
  | "close"           // degree 2: grandparent / grandchild / aunt / uncle / half-sibling
  | "extended"        // degree 3: great-grandparent / first cousin
  | "distant"         // degree 4
  | "unrelated";      // no path within MAX_KINSHIP_DEPTH

/** Maximum BFS depth for kinship searches; beyond this entities are "unrelated". */
export const MAX_KINSHIP_DEPTH = 4;

/**
 * Depth-decay factor for inherited renown.
 * Each generation reduces the renown contribution by this fraction:
 *   depth 1 (parent) → q(0.50) × parent renown
 *   depth 2 (grandparent) → q(0.25) × grandparent renown
 */
export const RENOWN_DEPTH_DECAY_Q: Q = q(0.50);

// ── Factory ───────────────────────────────────────────────────────────────────

export function createLineageRegistry(): LineageRegistry {
  return { nodes: new Map() };
}

// ── Node access ───────────────────────────────────────────────────────────────

/**
 * Return the `LineageNode` for `entityId`, creating a root node (no parents,
 * no children, no partners) if one does not yet exist.
 */
export function getLineageNode(
  registry: LineageRegistry,
  entityId:  number,
): LineageNode {
  let node = registry.nodes.get(entityId);
  if (!node) {
    node = { entityId, parentIds: [], childIds: [], partnerIds: [] };
    registry.nodes.set(entityId, node);
  }
  return node;
}

// ── Mutation helpers ──────────────────────────────────────────────────────────

/**
 * Register a birth: create a node for `childId` and link it to up to two parents.
 * Parent nodes are created if they do not already exist.
 * No-op if `childId` already has a node (idempotent).
 */
export function recordBirth(
  registry:   LineageRegistry,
  childId:    number,
  parentAId:  number,
  parentBId?: number,
): void {
  // Ensure child node exists with the given parents
  const existing = registry.nodes.get(childId);
  if (!existing) {
    const parentIds = parentBId != null
      ? [parentAId, parentBId]
      : [parentAId];
    registry.nodes.set(childId, { entityId: childId, parentIds, childIds: [], partnerIds: [] });
  }

  // Ensure parent nodes exist and include childId
  const nodeA = getLineageNode(registry, parentAId);
  if (!nodeA.childIds.includes(childId)) nodeA.childIds.push(childId);

  if (parentBId != null) {
    const nodeB = getLineageNode(registry, parentBId);
    if (!nodeB.childIds.includes(childId)) nodeB.childIds.push(childId);
  }
}

/**
 * Record a partnership between two entities.
 * Partners are considered degree-1 kin (immediate).
 * Idempotent: duplicate calls are safe.
 */
export function recordPartnership(
  registry:  LineageRegistry,
  entityAId: number,
  entityBId: number,
): void {
  const nodeA = getLineageNode(registry, entityAId);
  const nodeB = getLineageNode(registry, entityBId);
  if (!nodeA.partnerIds.includes(entityBId)) nodeA.partnerIds.push(entityBId);
  if (!nodeB.partnerIds.includes(entityAId)) nodeB.partnerIds.push(entityAId);
}

// ── Family queries ────────────────────────────────────────────────────────────

/** Return the parent IDs of `entityId` (0–2 elements). */
export function getParents(registry: LineageRegistry, entityId: number): number[] {
  return registry.nodes.get(entityId)?.parentIds ?? [];
}

/** Return the child IDs of `entityId`. */
export function getChildren(registry: LineageRegistry, entityId: number): number[] {
  return registry.nodes.get(entityId)?.childIds ?? [];
}

/**
 * Return the sibling IDs of `entityId` — entities that share at least one parent,
 * excluding `entityId` itself.
 */
export function getSiblings(registry: LineageRegistry, entityId: number): number[] {
  const parents = getParents(registry, entityId);
  const result  = new Set<number>();
  for (const pid of parents) {
    for (const sibId of getChildren(registry, pid)) {
      if (sibId !== entityId) result.add(sibId);
    }
  }
  return [...result];
}

/**
 * Return all ancestors of `entityId` within `maxDepth` generations.
 * Uses BFS upward through parent links only.
 */
export function findAncestors(
  registry: LineageRegistry,
  entityId:  number,
  maxDepth:  number = MAX_KINSHIP_DEPTH,
): Set<number> {
  const ancestors = new Set<number>();
  const queue: Array<{ id: number; depth: number }> = [{ id: entityId, depth: 0 }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth >= maxDepth) continue;
    for (const pid of getParents(registry, item.id)) {
      if (!ancestors.has(pid)) {
        ancestors.add(pid);
        queue.push({ id: pid, depth: item.depth + 1 });
      }
    }
  }
  return ancestors;
}

/**
 * Compute the degree of kinship between two entities via BFS on the undirected
 * family graph (parents, children, and partners are all degree-1 neighbours).
 *
 * Returns:
 *   - `0` if `entityA === entityB`
 *   - `1`–`MAX_KINSHIP_DEPTH` for kin within range
 *   - `null` if no path exists within `MAX_KINSHIP_DEPTH`
 */
export function computeKinshipDegree(
  registry: LineageRegistry,
  entityA:   number,
  entityB:   number,
): number | null {
  if (entityA === entityB) return 0;

  const visited = new Set<number>([entityA]);
  const queue: Array<{ id: number; depth: number }> = [{ id: entityA, depth: 0 }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth >= MAX_KINSHIP_DEPTH) continue;

    const node = registry.nodes.get(item.id);
    if (!node) continue;

    // BFS over parents + children + partners (undirected)
    const neighbours = [
      ...node.parentIds,
      ...node.childIds,
      ...node.partnerIds,
    ];

    for (const nbr of neighbours) {
      if (nbr === entityB) return item.depth + 1;
      if (!visited.has(nbr)) {
        visited.add(nbr);
        queue.push({ id: nbr, depth: item.depth + 1 });
      }
    }
  }

  return null; // unrelated within MAX_KINSHIP_DEPTH
}

/** Whether two entities are kin within `maxDegree` (default `MAX_KINSHIP_DEPTH`). */
export function isKin(
  registry:  LineageRegistry,
  entityA:   number,
  entityB:   number,
  maxDegree: number = MAX_KINSHIP_DEPTH,
): boolean {
  const degree = computeKinshipDegree(registry, entityA, entityB);
  return degree !== null && degree <= maxDegree;
}

// ── Label ─────────────────────────────────────────────────────────────────────

/**
 * Map a numeric kinship degree (or `null`) to a `KinshipLabel`.
 *
 * @param degree  Result of `computeKinshipDegree`; pass `null` for unrelated.
 */
export function getKinshipLabel(degree: number | null): KinshipLabel {
  if (degree === null) return "unrelated";
  if (degree === 0)    return "self";
  if (degree === 1)    return "immediate";
  if (degree === 2)    return "close";
  if (degree === 3)    return "extended";
  if (degree <= MAX_KINSHIP_DEPTH) return "distant";
  return "unrelated";
}

// ── Inherited renown ──────────────────────────────────────────────────────────

/**
 * Compute the renown bonus an entity inherits from their ancestors.
 *
 * For each ancestor at depth d, contribution = `ancestor.renown_Q × decay^d`
 * where `decay = RENOWN_DEPTH_DECAY_Q / SCALE.Q` (default 0.5 per generation).
 * The sum is clamped to `[0, SCALE.Q]`.
 *
 * Entities with no renown records or no ancestors return 0.
 *
 * @param registry       Lineage registry.
 * @param entityId       Entity whose ancestors are being summed.
 * @param renownRegistry Phase 75 renown registry.
 * @param maxDepth       How many generations to look back (default 3).
 */
export function computeInheritedRenown(
  lineage:         LineageRegistry,
  entityId:        number,
  renownRegistry:  RenownRegistry,
  maxDepth:        number = 3,
): Q {
  // BFS upward through parent links only (not children/partners)
  let total = 0;
  const visited = new Set<number>([entityId]);
  const queue: Array<{ id: number; depth: number }> = [];

  for (const pid of getParents(lineage, entityId)) {
    if (!visited.has(pid)) {
      visited.add(pid);
      queue.push({ id: pid, depth: 1 });
    }
  }

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth > maxDepth) continue;

    const record = renownRegistry.records.get(item.id);
    if (record && record.renown_Q > 0) {
      // decay^depth applied via repeated integer multiplication
      let contribution = record.renown_Q;
      for (let i = 0; i < item.depth; i++) {
        contribution = Math.round(contribution * RENOWN_DEPTH_DECAY_Q / SCALE.Q);
      }
      total += contribution;
    }

    for (const pid of getParents(lineage, item.id)) {
      if (!visited.has(pid)) {
        visited.add(pid);
        queue.push({ id: pid, depth: item.depth + 1 });
      }
    }
  }

  return clampQ(total, 0, SCALE.Q);
}
