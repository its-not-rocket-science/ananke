/**
 * CE-16 — Modding Support tests
 *
 * Covers all three layers:
 *  Layer 1 — hashMod() data fingerprinting
 *  Layer 2 — registerPostTickHook / runPostTickHooks
 *  Layer 3 — registerBehaviorNode / getBehaviorNode
 *  Session — computeModManifest()
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  hashMod,
  registerPostTickHook,
  unregisterPostTickHook,
  runPostTickHooks,
  listPostTickHooks,
  clearPostTickHooks,
  registerBehaviorNode,
  unregisterBehaviorNode,
  getBehaviorNode,
  listBehaviorNodes,
  clearBehaviorNodes,
  computeModManifest,
  clearAllMods,
} from "../src/modding.js";
import type { WorldState } from "../src/sim/world.js";
import type { Entity }     from "../src/sim/entity.js";
import type { KernelContext } from "../src/sim/context.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function mockWorld(): WorldState {
  return { tick: 0, seed: 1, entities: [] } as unknown as WorldState;
}

// ── Layer 1: hashMod ──────────────────────────────────────────────────────────

describe("hashMod", () => {
  it("returns an 8-character hex string", () => {
    const h = hashMod({ type: "archetype", id: "orc_warrior" });
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic — same input, same output", () => {
    const obj = { type: "weapon", id: "iron_sword", damage: 42 };
    expect(hashMod(obj)).toBe(hashMod(obj));
  });

  it("is key-order independent (canonical)", () => {
    const a = { b: 2, a: 1 };
    const b = { a: 1, b: 2 };
    expect(hashMod(a)).toBe(hashMod(b));
  });

  it("differs for different content", () => {
    expect(hashMod({ id: "orc" })).not.toBe(hashMod({ id: "elf" }));
  });

  it("handles nested objects canonically", () => {
    const a = { overrides: { z: 9, a: 1 } };
    const b = { overrides: { a: 1, z: 9 } };
    expect(hashMod(a)).toBe(hashMod(b));
  });

  it("handles arrays (order-sensitive)", () => {
    expect(hashMod([1, 2, 3])).not.toBe(hashMod([3, 2, 1]));
  });

  it("handles null", () => {
    expect(hashMod(null)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("handles primitive number", () => {
    expect(hashMod(42)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("handles empty object", () => {
    expect(hashMod({})).toMatch(/^[0-9a-f]{8}$/);
  });

  it("different values for number vs string", () => {
    expect(hashMod(1)).not.toBe(hashMod("1"));
  });
});

// ── Layer 2: post-tick hooks ──────────────────────────────────────────────────

describe("registerPostTickHook", () => {
  beforeEach(() => clearPostTickHooks());

  it("registers a hook that runs via runPostTickHooks", () => {
    let called = false;
    registerPostTickHook("test", () => { called = true; });
    runPostTickHooks(mockWorld());
    expect(called).toBe(true);
  });

  it("passes world to the hook", () => {
    let received: WorldState | null = null;
    registerPostTickHook("test", w => { received = w; });
    const world = mockWorld();
    runPostTickHooks(world);
    expect(received).toBe(world);
  });

  it("overwrites a hook with the same id", () => {
    let count = 0;
    registerPostTickHook("test", () => { count += 1; });
    registerPostTickHook("test", () => { count += 10; });
    runPostTickHooks(mockWorld());
    expect(count).toBe(10);
  });

  it("throws for empty id", () => {
    expect(() => registerPostTickHook("", () => {})).toThrow();
  });

  it("runs multiple hooks in registration order", () => {
    const order: string[] = [];
    registerPostTickHook("a", () => { order.push("a"); });
    registerPostTickHook("b", () => { order.push("b"); });
    registerPostTickHook("c", () => { order.push("c"); });
    runPostTickHooks(mockWorld());
    expect(order).toEqual(["a", "b", "c"]);
  });
});

describe("unregisterPostTickHook", () => {
  beforeEach(() => clearPostTickHooks());

  it("returns true when hook existed", () => {
    registerPostTickHook("x", () => {});
    expect(unregisterPostTickHook("x")).toBe(true);
  });

  it("returns false when hook did not exist", () => {
    expect(unregisterPostTickHook("nonexistent")).toBe(false);
  });

  it("removed hook no longer runs", () => {
    let called = false;
    registerPostTickHook("x", () => { called = true; });
    unregisterPostTickHook("x");
    runPostTickHooks(mockWorld());
    expect(called).toBe(false);
  });
});

describe("runPostTickHooks", () => {
  beforeEach(() => clearPostTickHooks());

  it("does nothing when no hooks are registered", () => {
    expect(() => runPostTickHooks(mockWorld())).not.toThrow();
  });

  it("re-throws the first hook error after running all hooks", () => {
    let secondRan = false;
    registerPostTickHook("fail", () => { throw new Error("boom"); });
    registerPostTickHook("ok",   () => { secondRan = true; });
    expect(() => runPostTickHooks(mockWorld())).toThrow("boom");
    expect(secondRan).toBe(true);
  });
});

describe("listPostTickHooks", () => {
  beforeEach(() => clearPostTickHooks());

  it("returns empty array when none registered", () => {
    expect(listPostTickHooks()).toEqual([]);
  });

  it("returns registered ids in insertion order", () => {
    registerPostTickHook("b", () => {});
    registerPostTickHook("a", () => {});
    expect(listPostTickHooks()).toEqual(["b", "a"]);
  });

  it("reflects unregistrations", () => {
    registerPostTickHook("x", () => {});
    registerPostTickHook("y", () => {});
    unregisterPostTickHook("x");
    expect(listPostTickHooks()).toEqual(["y"]);
  });
});

// ── Layer 3: behavior node registry ──────────────────────────────────────────

describe("registerBehaviorNode", () => {
  beforeEach(() => clearBehaviorNodes());

  it("registers a factory retrievable via getBehaviorNode", () => {
    const factory = () => ({ tick: () => null });
    registerBehaviorNode("patrol", factory);
    expect(getBehaviorNode("patrol")).toBe(factory);
  });

  it("overwrites a factory with the same id", () => {
    const a = () => ({ tick: () => null });
    const b = () => ({ tick: () => null });
    registerBehaviorNode("patrol", a);
    registerBehaviorNode("patrol", b);
    expect(getBehaviorNode("patrol")).toBe(b);
  });

  it("throws for empty id", () => {
    expect(() => registerBehaviorNode("", () => ({ tick: () => null }))).toThrow();
  });

  it("factory receives and forwards arguments", () => {
    registerBehaviorNode("move_to", (x, y) => ({
      tick: (entity: Entity, world: WorldState, ctx: KernelContext) => {
        void entity; void world; void ctx;
        return { kind: "move", x, y } as unknown as import("../src/sim/commands.js").Command;
      },
    }));
    const factory = getBehaviorNode("move_to")!;
    const node = factory(100, 200);
    const cmd = node.tick({} as Entity, {} as WorldState, {} as KernelContext);
    expect((cmd as Record<string, unknown>)?.x).toBe(100);
  });
});

describe("unregisterBehaviorNode", () => {
  beforeEach(() => clearBehaviorNodes());

  it("returns true when factory existed", () => {
    registerBehaviorNode("n", () => ({ tick: () => null }));
    expect(unregisterBehaviorNode("n")).toBe(true);
  });

  it("returns false when factory did not exist", () => {
    expect(unregisterBehaviorNode("none")).toBe(false);
  });

  it("removed factory not returned by getBehaviorNode", () => {
    registerBehaviorNode("n", () => ({ tick: () => null }));
    unregisterBehaviorNode("n");
    expect(getBehaviorNode("n")).toBeUndefined();
  });
});

describe("listBehaviorNodes", () => {
  beforeEach(() => clearBehaviorNodes());

  it("returns empty array when none registered", () => {
    expect(listBehaviorNodes()).toEqual([]);
  });

  it("returns registered ids in insertion order", () => {
    registerBehaviorNode("z", () => ({ tick: () => null }));
    registerBehaviorNode("a", () => ({ tick: () => null }));
    expect(listBehaviorNodes()).toEqual(["z", "a"]);
  });
});

// ── computeModManifest ────────────────────────────────────────────────────────

describe("computeModManifest", () => {
  beforeEach(() => clearAllMods());

  it("returns sorted empty lists and a fingerprint when nothing registered", () => {
    const m = computeModManifest([]);
    expect(m.dataIds).toEqual([]);
    expect(m.hookIds).toEqual([]);
    expect(m.behaviorIds).toEqual([]);
    expect(m.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it("fingerprint is deterministic", () => {
    registerPostTickHook("h1", () => {});
    registerBehaviorNode("b1", () => ({ tick: () => null }));
    const a = computeModManifest(["cat_a"]);
    const b = computeModManifest(["cat_a"]);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("fingerprint differs when hook set differs", () => {
    const base = computeModManifest([]);
    registerPostTickHook("extra", () => {});
    const withHook = computeModManifest([]);
    expect(base.fingerprint).not.toBe(withHook.fingerprint);
  });

  it("fingerprint differs when behavior node set differs", () => {
    const base = computeModManifest([]);
    registerBehaviorNode("patrol", () => ({ tick: () => null }));
    const withNode = computeModManifest([]);
    expect(base.fingerprint).not.toBe(withNode.fingerprint);
  });

  it("fingerprint differs when catalog ids differ", () => {
    const a = computeModManifest(["orc"]);
    const b = computeModManifest(["elf"]);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("dataIds are sorted regardless of input order", () => {
    const m = computeModManifest(["z_mod", "a_mod", "m_mod"]);
    expect(m.dataIds).toEqual(["a_mod", "m_mod", "z_mod"]);
  });

  it("hookIds are sorted regardless of registration order", () => {
    registerPostTickHook("z_hook", () => {});
    registerPostTickHook("a_hook", () => {});
    const m = computeModManifest([]);
    expect(m.hookIds).toEqual(["a_hook", "z_hook"]);
  });

  it("behaviorIds are sorted regardless of registration order", () => {
    registerBehaviorNode("z_node", () => ({ tick: () => null }));
    registerBehaviorNode("a_node", () => ({ tick: () => null }));
    const m = computeModManifest([]);
    expect(m.behaviorIds).toEqual(["a_node", "z_node"]);
  });

  it("two clients with identical mods produce matching fingerprints", () => {
    // Simulate client A
    registerPostTickHook("analytics", () => {});
    registerBehaviorNode("patrol_guard", () => ({ tick: () => null }));
    const clientA = computeModManifest(["orc_warrior", "ice_sword"]);

    // Simulate client B (same mods, different registration order)
    clearAllMods();
    registerBehaviorNode("patrol_guard", () => ({ tick: () => null }));
    registerPostTickHook("analytics", () => {});
    const clientB = computeModManifest(["ice_sword", "orc_warrior"]);

    expect(clientA.fingerprint).toBe(clientB.fingerprint);
  });
});

// ── clearAllMods ─────────────────────────────────────────────────────────────

describe("clearAllMods", () => {
  it("removes all hooks and behavior nodes", () => {
    registerPostTickHook("h", () => {});
    registerBehaviorNode("b", () => ({ tick: () => null }));
    clearAllMods();
    expect(listPostTickHooks()).toEqual([]);
    expect(listBehaviorNodes()).toEqual([]);
  });
});
