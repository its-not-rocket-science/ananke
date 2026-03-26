// test/kinship.test.ts — Phase 76: Kinship & Lineage

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  MAX_KINSHIP_DEPTH,
  RENOWN_DEPTH_DECAY_Q,
  createLineageRegistry,
  getLineageNode,
  recordBirth,
  recordPartnership,
  getParents,
  getChildren,
  getSiblings,
  findAncestors,
  computeKinshipDegree,
  isKin,
  getKinshipLabel,
  computeInheritedRenown,
} from "../src/kinship.js";
import { createRenownRegistry, getRenownRecord } from "../src/renown.js";

// ── createLineageRegistry ─────────────────────────────────────────────────────

describe("createLineageRegistry", () => {
  it("returns empty nodes map", () => {
    expect(createLineageRegistry().nodes.size).toBe(0);
  });
});

// ── getLineageNode ────────────────────────────────────────────────────────────

describe("getLineageNode", () => {
  it("creates a zero node for unknown entity", () => {
    const r    = createLineageRegistry();
    const node = getLineageNode(r, 1);
    expect(node.entityId).toBe(1);
    expect(node.parentIds).toHaveLength(0);
    expect(node.childIds).toHaveLength(0);
    expect(node.partnerIds).toHaveLength(0);
  });

  it("returns same node on second call", () => {
    const r = createLineageRegistry();
    expect(getLineageNode(r, 1)).toBe(getLineageNode(r, 1));
  });

  it("stores node in registry", () => {
    const r = createLineageRegistry();
    getLineageNode(r, 7);
    expect(r.nodes.has(7)).toBe(true);
  });
});

// ── recordBirth ───────────────────────────────────────────────────────────────

describe("recordBirth", () => {
  it("creates child node with one parent", () => {
    const r = createLineageRegistry();
    recordBirth(r, 3, 1);
    expect(getParents(r, 3)).toEqual([1]);
  });

  it("creates child node with two parents", () => {
    const r = createLineageRegistry();
    recordBirth(r, 3, 1, 2);
    expect(getParents(r, 3)).toContain(1);
    expect(getParents(r, 3)).toContain(2);
    expect(getParents(r, 3)).toHaveLength(2);
  });

  it("parent node includes child in childIds", () => {
    const r = createLineageRegistry();
    recordBirth(r, 3, 1, 2);
    expect(getChildren(r, 1)).toContain(3);
    expect(getChildren(r, 2)).toContain(3);
  });

  it("is idempotent (duplicate call does not double-add)", () => {
    const r = createLineageRegistry();
    recordBirth(r, 3, 1);
    recordBirth(r, 3, 1); // second call — child already exists
    expect(getChildren(r, 1)).toHaveLength(1);
  });
});

// ── recordPartnership ─────────────────────────────────────────────────────────

describe("recordPartnership", () => {
  it("links both entities as partners", () => {
    const r = createLineageRegistry();
    recordPartnership(r, 1, 2);
    expect(getLineageNode(r, 1).partnerIds).toContain(2);
    expect(getLineageNode(r, 2).partnerIds).toContain(1);
  });

  it("is idempotent", () => {
    const r = createLineageRegistry();
    recordPartnership(r, 1, 2);
    recordPartnership(r, 1, 2);
    expect(getLineageNode(r, 1).partnerIds).toHaveLength(1);
  });
});

// ── getSiblings ───────────────────────────────────────────────────────────────

describe("getSiblings", () => {
  it("returns empty for entity with no parents", () => {
    const r = createLineageRegistry();
    expect(getSiblings(r, 1)).toHaveLength(0);
  });

  it("returns sibling who shares same parent", () => {
    const r = createLineageRegistry();
    recordBirth(r, 2, 1); // entity 2, parent 1
    recordBirth(r, 3, 1); // entity 3, parent 1
    expect(getSiblings(r, 2)).toContain(3);
    expect(getSiblings(r, 3)).toContain(2);
  });

  it("does not include self in sibling list", () => {
    const r = createLineageRegistry();
    recordBirth(r, 2, 1);
    expect(getSiblings(r, 2)).not.toContain(2);
  });

  it("deduplicates siblings sharing both parents", () => {
    const r = createLineageRegistry();
    recordBirth(r, 3, 1, 2); // child 3 has parents 1 & 2
    recordBirth(r, 4, 1, 2); // child 4 has parents 1 & 2
    // child 3 sees child 4 once (shared through both parents)
    expect(getSiblings(r, 3)).toHaveLength(1);
    expect(getSiblings(r, 3)).toContain(4);
  });
});

// ── findAncestors ─────────────────────────────────────────────────────────────

describe("findAncestors", () => {
  it("returns empty set for entity with no parents", () => {
    const r = createLineageRegistry();
    expect(findAncestors(r, 1).size).toBe(0);
  });

  it("returns parent at depth 1", () => {
    const r = createLineageRegistry();
    recordBirth(r, 2, 1);
    expect(findAncestors(r, 2)).toContain(1);
  });

  it("returns grandparent at depth 2", () => {
    const r = createLineageRegistry();
    recordBirth(r, 2, 1);
    recordBirth(r, 3, 2);
    expect(findAncestors(r, 3)).toContain(1);
  });

  it("respects maxDepth: does not include ancestor beyond limit", () => {
    const r = createLineageRegistry();
    // great-grandparent chain: 1→2→3→4
    recordBirth(r, 2, 1);
    recordBirth(r, 3, 2);
    recordBirth(r, 4, 3);
    expect(findAncestors(r, 4, 1)).not.toContain(1); // depth 1 → only parent 3
    expect(findAncestors(r, 4, 2)).not.toContain(1); // depth 2 → only 3,2
    expect(findAncestors(r, 4, 3)).toContain(1);     // depth 3 → includes 1
  });
});

// ── computeKinshipDegree ──────────────────────────────────────────────────────

describe("computeKinshipDegree", () => {
  it("same entity → 0", () => {
    const r = createLineageRegistry();
    expect(computeKinshipDegree(r, 1, 1)).toBe(0);
  });

  it("parent → child = degree 1", () => {
    const r = createLineageRegistry();
    recordBirth(r, 2, 1);
    expect(computeKinshipDegree(r, 1, 2)).toBe(1);
    expect(computeKinshipDegree(r, 2, 1)).toBe(1); // symmetric
  });

  it("siblings = degree 2", () => {
    const r = createLineageRegistry();
    recordBirth(r, 2, 1);
    recordBirth(r, 3, 1);
    expect(computeKinshipDegree(r, 2, 3)).toBe(2);
  });

  it("grandparent → grandchild = degree 2", () => {
    const r = createLineageRegistry();
    recordBirth(r, 2, 1);
    recordBirth(r, 3, 2);
    expect(computeKinshipDegree(r, 1, 3)).toBe(2);
  });

  it("first cousin = degree 4 (via shared grandparent)", () => {
    // grandparent 1 → parent 2 → child 4
    //                → parent 3 → child 5
    const r = createLineageRegistry();
    recordBirth(r, 2, 1);
    recordBirth(r, 3, 1);
    recordBirth(r, 4, 2);
    recordBirth(r, 5, 3);
    // 4→2→1→3→5 = path length 4
    expect(computeKinshipDegree(r, 4, 5)).toBe(4);
  });

  it("unrelated entities → null", () => {
    const r = createLineageRegistry();
    getLineageNode(r, 10);
    getLineageNode(r, 20);
    expect(computeKinshipDegree(r, 10, 20)).toBeNull();
  });

  it("partner → degree 1", () => {
    const r = createLineageRegistry();
    recordPartnership(r, 1, 2);
    expect(computeKinshipDegree(r, 1, 2)).toBe(1);
  });

  it("beyond MAX_KINSHIP_DEPTH → null", () => {
    // Chain 1→2→3→4→5→6, degree 5 exceeds MAX=4
    const r = createLineageRegistry();
    for (let i = 2; i <= 6; i++) recordBirth(r, i, i - 1);
    expect(computeKinshipDegree(r, 1, 6)).toBeNull();
  });
});

// ── isKin ─────────────────────────────────────────────────────────────────────

describe("isKin", () => {
  it("parent-child → kin at maxDegree=1", () => {
    const r = createLineageRegistry();
    recordBirth(r, 2, 1);
    expect(isKin(r, 1, 2, 1)).toBe(true);
  });

  it("grandparent-grandchild not kin at maxDegree=1", () => {
    const r = createLineageRegistry();
    recordBirth(r, 2, 1);
    recordBirth(r, 3, 2);
    expect(isKin(r, 1, 3, 1)).toBe(false);
  });

  it("unrelated → not kin", () => {
    const r = createLineageRegistry();
    expect(isKin(r, 1, 99)).toBe(false);
  });
});

// ── getKinshipLabel ───────────────────────────────────────────────────────────

describe("getKinshipLabel", () => {
  it("null → unrelated", () => expect(getKinshipLabel(null)).toBe("unrelated"));
  it("0 → self",         () => expect(getKinshipLabel(0)).toBe("self"));
  it("1 → immediate",    () => expect(getKinshipLabel(1)).toBe("immediate"));
  it("2 → close",        () => expect(getKinshipLabel(2)).toBe("close"));
  it("3 → extended",     () => expect(getKinshipLabel(3)).toBe("extended"));
  it("4 → distant",      () => expect(getKinshipLabel(4)).toBe("distant"));
  it("5 → unrelated",    () => expect(getKinshipLabel(5)).toBe("unrelated"));
});

// ── computeInheritedRenown ────────────────────────────────────────────────────

describe("computeInheritedRenown", () => {
  it("returns 0 when entity has no ancestors", () => {
    const lineage = createLineageRegistry();
    const renown  = createRenownRegistry();
    expect(computeInheritedRenown(lineage, 1, renown)).toBe(0);
  });

  it("inherits half of parent's renown at depth 1", () => {
    const lineage = createLineageRegistry();
    const renown  = createRenownRegistry();
    recordBirth(lineage, 2, 1);

    const parentRecord = getRenownRecord(renown, 1);
    parentRecord.renown_Q = q(1.0); // max renown

    const inherited = computeInheritedRenown(lineage, 2, renown);
    // depth 1: q(1.0) × q(0.5) / SCALE.Q = q(0.5)
    expect(inherited).toBe(Math.round(q(1.0) * RENOWN_DEPTH_DECAY_Q / SCALE.Q));
  });

  it("grandparent renown decays by decay² at depth 2", () => {
    const lineage = createLineageRegistry();
    const renown  = createRenownRegistry();
    recordBirth(lineage, 2, 1);
    recordBirth(lineage, 3, 2);

    const grandRecord = getRenownRecord(renown, 1);
    grandRecord.renown_Q = q(1.0);

    const inherited = computeInheritedRenown(lineage, 3, renown);
    // depth 2: q(1.0) × (0.5)^2 = q(0.25)
    const expected = Math.round(
      Math.round(q(1.0) * RENOWN_DEPTH_DECAY_Q / SCALE.Q) * RENOWN_DEPTH_DECAY_Q / SCALE.Q,
    );
    expect(inherited).toBe(expected);
  });

  it("multiple ancestors accumulate", () => {
    const lineage = createLineageRegistry();
    const renown  = createRenownRegistry();
    // child 3 has two parents 1 & 2, both with renown
    recordBirth(lineage, 3, 1, 2);
    getRenownRecord(renown, 1).renown_Q = q(0.5);
    getRenownRecord(renown, 2).renown_Q = q(0.5);

    const singleParent = Math.round(q(0.5) * RENOWN_DEPTH_DECAY_Q / SCALE.Q);
    expect(computeInheritedRenown(lineage, 3, renown)).toBe(singleParent * 2);
  });

  it("respects maxDepth parameter", () => {
    const lineage = createLineageRegistry();
    const renown  = createRenownRegistry();
    // great-grandparent 1 → grandparent 2 → parent 3 → child 4
    recordBirth(lineage, 2, 1);
    recordBirth(lineage, 3, 2);
    recordBirth(lineage, 4, 3);
    getRenownRecord(renown, 1).renown_Q = q(1.0);

    // maxDepth=2 — great-grandparent (depth 3) excluded
    const d2 = computeInheritedRenown(lineage, 4, renown, 2);
    // maxDepth=3 — great-grandparent (depth 3) included
    const d3 = computeInheritedRenown(lineage, 4, renown, 3);
    expect(d2).toBe(0);      // ggp at depth 3, excluded
    expect(d3).toBeGreaterThan(0);
  });

  it("result clamped to SCALE.Q", () => {
    const lineage = createLineageRegistry();
    const renown  = createRenownRegistry();
    // Many parents each with max renown
    for (let i = 1; i <= 10; i++) {
      recordBirth(lineage, 0, i);
      getRenownRecord(renown, i).renown_Q = q(1.0);
    }
    expect(computeInheritedRenown(lineage, 0, renown)).toBeLessThanOrEqual(SCALE.Q);
  });
});
