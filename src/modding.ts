/**
 * CE-16 — Modding Support
 *
 * Three-layer modding contract built on CE-12 (data-driven catalog) and the stable API:
 *
 * **Layer 1 — Data mod fingerprinting**
 *   `hashMod(json)` produces a deterministic 8-char hex fingerprint of any parsed JSON
 *   mod file.  The network replication layer (CE-11) compares fingerprints across clients
 *   to guarantee all participants use identical mod definitions.
 *
 * **Layer 2 — Post-tick behavior hooks**
 *   `registerPostTickHook(id, fn)` registers an observer callback that the host fires
 *   after each `stepWorld` call via `runPostTickHooks(world)`.  Hooks are purely
 *   observational — they MUST NOT mutate `WorldState` during the call.  Because they run
 *   outside the kernel path they cannot break determinism.
 *
 * **Layer 3 — AI behavior node overrides**
 *   `registerBehaviorNode(id, factory)` installs a named factory for custom
 *   `BehaviorNode` implementations.  `loadScenario` (CE-3) can reference them by id in
 *   scenario JSON.  AI overrides require explicit host opt-in.
 *
 * **Session fingerprint**
 *   `computeModManifest()` returns a single fingerprint covering all three registries,
 *   suitable for multiplayer session validation.
 */

import type { WorldState } from "./sim/world.js";
import type { BehaviorNode } from "./sim/ai/behavior-trees.js";

// ── Internal: FNV-1a 32-bit hash ──────────────────────────────────────────────

/** FNV-1a 32-bit hash over a UTF-16 code-unit string. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) | 0;
  }
  return h >>> 0;
}

/** Serialize any JSON-compatible value in canonical (key-sorted) form. */
function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + (v as unknown[]).map(canonicalJson).join(",") + "]";
  const obj = v as Record<string, unknown>;
  return "{" + Object.keys(obj).sort().map(k => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

// ── Layer 1: Data mod fingerprinting ─────────────────────────────────────────

/**
 * Produce a deterministic 8-character hex fingerprint for a parsed JSON mod
 * object (archetype, weapon, armour, or any CE-12 catalog entry).
 *
 * Keys are sorted before hashing so `{ a:1, b:2 }` and `{ b:2, a:1 }` produce
 * the same fingerprint.  The result is stable across JS engines and Node versions
 * as long as the JSON content is identical.
 *
 * Use `computeModManifest()` to fingerprint the full active mod set for session
 * validation.
 */
export function hashMod(json: unknown): string {
  return fnv1a32(canonicalJson(json)).toString(16).padStart(8, "0");
}

// ── Layer 2: Post-tick behavior hooks ─────────────────────────────────────────

export type PostTickHook = (world: WorldState) => void;

const _hooks = new Map<string, PostTickHook>();

/**
 * Register an observational callback that fires after each `stepWorld` tick.
 *
 * The host is responsible for calling `runPostTickHooks(world)` immediately after
 * `stepWorld(world, cmds, ctx)`.  Hooks MUST NOT mutate `WorldState`; they are
 * intended for analytics, logging, renderer updates, and network broadcast.
 *
 * Re-registering an existing id overwrites the previous hook.
 */
export function registerPostTickHook(id: string, fn: PostTickHook): void {
  if (!id) throw new Error("Hook id must be a non-empty string");
  _hooks.set(id, fn);
}

/**
 * Remove a previously registered post-tick hook.
 * Returns `true` if the hook existed and was removed.
 */
export function unregisterPostTickHook(id: string): boolean {
  return _hooks.delete(id);
}

/**
 * Invoke all registered post-tick hooks in registration order.
 *
 * Call this immediately after `stepWorld`:
 * ```typescript
 * stepWorld(world, cmds, ctx);
 * runPostTickHooks(world);
 * ```
 *
 * Errors thrown by individual hooks are caught and re-thrown after all hooks
 * have been attempted, to avoid silently dropping subsequent hooks.
 */
export function runPostTickHooks(world: WorldState): void {
  const errors: unknown[] = [];
  for (const fn of _hooks.values()) {
    try { fn(world); } catch (e) { errors.push(e); }
  }
  if (errors.length > 0) throw errors[0];
}

/** Return the ids of all registered post-tick hooks in registration order. */
export function listPostTickHooks(): string[] {
  return [..._hooks.keys()];
}

/** Remove all post-tick hooks (useful for testing and hot-reload scenarios). */
export function clearPostTickHooks(): void {
  _hooks.clear();
}

// ── Layer 3: AI behavior node overrides ──────────────────────────────────────

export type BehaviorNodeFactory = (...args: unknown[]) => BehaviorNode;

const _behaviorNodes = new Map<string, BehaviorNodeFactory>();

/**
 * Register a named factory for a custom `BehaviorNode` implementation.
 *
 * The factory will be looked up by id when `loadScenario` (CE-3) encounters an
 * `"aiOverride"` reference in scenario JSON, or when a host builds a behavior
 * tree programmatically:
 *
 * ```typescript
 * registerBehaviorNode("patrol_guard", (waypointX, waypointY) =>
 *   PatrolGuard(Number(waypointX), Number(waypointY))
 * );
 * const factory = getBehaviorNode("patrol_guard");
 * const node = factory?.(1000, 2000);
 * ```
 *
 * **Deterministic multiplayer**: AI overrides affect simulation output.  All
 * clients must register the same behavior nodes (verified via `computeModManifest`)
 * before joining a session.
 *
 * Re-registering an existing id overwrites the previous factory.
 */
export function registerBehaviorNode(id: string, factory: BehaviorNodeFactory): void {
  if (!id) throw new Error("Behavior node id must be a non-empty string");
  _behaviorNodes.set(id, factory);
}

/**
 * Remove a previously registered behavior node factory.
 * Returns `true` if the factory existed and was removed.
 */
export function unregisterBehaviorNode(id: string): boolean {
  return _behaviorNodes.delete(id);
}

/**
 * Look up a registered behavior node factory by id.
 * Returns `undefined` if not found.
 */
export function getBehaviorNode(id: string): BehaviorNodeFactory | undefined {
  return _behaviorNodes.get(id);
}

/** Return the ids of all registered behavior node factories in registration order. */
export function listBehaviorNodes(): string[] {
  return [..._behaviorNodes.keys()];
}

/** Remove all behavior node factories (useful for testing and hot-reload scenarios). */
export function clearBehaviorNodes(): void {
  _behaviorNodes.clear();
}

// ── Session manifest ──────────────────────────────────────────────────────────

export interface ModManifest {
  /** Sorted list of all data mod ids currently in the CE-12 catalog. */
  dataIds:     string[];
  /** Sorted list of all registered post-tick hook ids. */
  hookIds:     string[];
  /** Sorted list of all registered behavior node ids. */
  behaviorIds: string[];
  /**
   * Single fingerprint covering all three id lists.
   * Two clients are mod-compatible iff their `fingerprint` values match.
   */
  fingerprint: string;
}

/**
 * Compute a session manifest covering all active mods (CE-12 catalog entries,
 * post-tick hooks, and AI behavior node overrides).
 *
 * The `fingerprint` is a deterministic 8-char hex string suitable for
 * multiplayer session comparison.  Clients are considered mod-compatible iff
 * their fingerprints match.
 *
 * @param catalogIds Sorted list of CE-12 catalog entry ids (pass `listCatalog()`).
 *   Provided as a parameter to keep this module free of a circular dependency
 *   on `catalog.ts`.
 */
export function computeModManifest(catalogIds: string[] = []): ModManifest {
  const dataIds     = [...catalogIds].sort();
  const hookIds     = listPostTickHooks().slice().sort();
  const behaviorIds = listBehaviorNodes().slice().sort();
  const combined    = JSON.stringify({ dataIds, hookIds, behaviorIds });
  const fingerprint = fnv1a32(combined).toString(16).padStart(8, "0");
  return { dataIds, hookIds, behaviorIds, fingerprint };
}

/** Remove all hooks and behavior node factories. Does not affect the CE-12 catalog. */
export function clearAllMods(): void {
  _hooks.clear();
  _behaviorNodes.clear();
}
