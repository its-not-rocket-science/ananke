// test/succession.test.ts — Phase 77: Dynasty & Succession

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import type { Q } from "../src/units.js";
import {
  CLAIM_OWN_RENOWN_WEIGHT_Q,
  CLAIM_INHERITED_RENOWN_WEIGHT_Q,
  STABILITY_NO_HEIR_Q,
  STABILITY_CONTESTED_Q,
  STABILITY_CLEAN_SUCCESSION_Q,
  findSuccessionCandidates,
  resolveSuccession,
  applySuccessionToPolity,
} from "../src/succession.js";
import {
  createLineageRegistry,
  recordBirth,
  recordPartnership,
} from "../src/kinship.js";
import {
  createRenownRegistry,
  getRenownRecord,
} from "../src/renown.js";
import { createPolity } from "../src/polity.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEED  = 42;
const TICK  = 100;

function makeFamily() {
  // Ruler 1, children 2 & 3, grandchild 4 (child of 2)
  const lineage = createLineageRegistry();
  recordBirth(lineage, 2, 1); // child
  recordBirth(lineage, 3, 1); // child
  recordBirth(lineage, 4, 2); // grandchild
  return lineage;
}

function makeRenown(...pairs: [number, number][]) {
  const renown = createRenownRegistry();
  for (const [id, val] of pairs) {
    getRenownRecord(renown, id).renown_Q = val;
  }
  return renown;
}

// ── findSuccessionCandidates ──────────────────────────────────────────────────

describe("findSuccessionCandidates", () => {
  it("returns empty when deceased has no kin in registry", () => {
    const lineage = createLineageRegistry();
    const renown  = createRenownRegistry();
    expect(findSuccessionCandidates(lineage, 99, renown)).toHaveLength(0);
  });

  it("finds direct children at degree 1", () => {
    const lineage = makeFamily();
    const renown  = createRenownRegistry();
    const candidates = findSuccessionCandidates(lineage, 1, renown, 1);
    const ids = candidates.map(c => c.entityId);
    expect(ids).toContain(2);
    expect(ids).toContain(3);
    for (const c of candidates) expect(c.kinshipDegree).toBe(1);
  });

  it("finds grandchild at degree 2", () => {
    const lineage = makeFamily();
    const renown  = createRenownRegistry();
    const candidates = findSuccessionCandidates(lineage, 1, renown, 2);
    const grandchild = candidates.find(c => c.entityId === 4);
    expect(grandchild).toBeDefined();
    expect(grandchild!.kinshipDegree).toBe(2);
  });

  it("maxDegree=1 excludes grandchild", () => {
    const lineage = makeFamily();
    const renown  = createRenownRegistry();
    const candidates = findSuccessionCandidates(lineage, 1, renown, 1);
    expect(candidates.map(c => c.entityId)).not.toContain(4);
  });

  it("includes renown_Q from renown registry", () => {
    const lineage = makeFamily();
    const renown  = makeRenown([2, q(0.6)]);
    const candidates = findSuccessionCandidates(lineage, 1, renown, 1);
    const c2 = candidates.find(c => c.entityId === 2)!;
    expect(c2.renown_Q).toBe(q(0.6));
  });

  it("includes partner at degree 1", () => {
    const lineage = createLineageRegistry();
    recordPartnership(lineage, 1, 5); // partner 5
    const renown = createRenownRegistry();
    const candidates = findSuccessionCandidates(lineage, 1, renown, 1);
    expect(candidates.map(c => c.entityId)).toContain(5);
  });
});

// ── resolveSuccession — primogeniture ─────────────────────────────────────────

describe("resolveSuccession — primogeniture", () => {
  it("selects lowest entityId direct child", () => {
    const lineage = makeFamily();
    const renown  = createRenownRegistry();
    const result  = resolveSuccession(lineage, 1, renown, { type: "primogeniture" }, SEED, TICK);
    // children are 2 and 3; first-born = 2 (lower entityId)
    expect(result.heirId).toBe(2);
  });

  it("returns null heir when no kin found", () => {
    const lineage = createLineageRegistry();
    const renown  = createRenownRegistry();
    const result  = resolveSuccession(lineage, 99, renown, { type: "primogeniture" }, SEED, TICK);
    expect(result.heirId).toBeNull();
  });

  it("no-heir result has large negative stability impact", () => {
    const lineage = createLineageRegistry();
    const renown  = createRenownRegistry();
    const result  = resolveSuccession(lineage, 99, renown, { type: "primogeniture" }, SEED, TICK);
    expect(result.stabilityImpact_Q).toBe(-STABILITY_NO_HEIR_Q);
  });

  it("sole direct heir has non-negative stability impact", () => {
    const lineage = createLineageRegistry();
    recordBirth(lineage, 2, 1);
    const renown = createRenownRegistry();
    const result = resolveSuccession(lineage, 1, renown, { type: "primogeniture" }, SEED, TICK);
    expect(result.heirId).toBe(2);
    expect(result.stabilityImpact_Q).toBeGreaterThanOrEqual(0);
  });

  it("candidates sorted by claimStrength_Q descending", () => {
    const lineage = makeFamily();
    const renown  = createRenownRegistry();
    const result  = resolveSuccession(lineage, 1, renown, { type: "primogeniture" }, SEED, TICK);
    for (let i = 1; i < result.candidates.length; i++) {
      expect(result.candidates[i - 1]!.claimStrength_Q)
        .toBeGreaterThanOrEqual(result.candidates[i]!.claimStrength_Q);
    }
  });

  it("distant heir (degree 2) has negative stability impact", () => {
    // renown_based: legendary grandchild (degree 2) beats a zero-renown child (degree 1)
    const lineage = createLineageRegistry();
    recordBirth(lineage, 2, 1); // child 2 — no renown
    recordBirth(lineage, 4, 2); // grandchild 4 — legendary renown
    const renown = makeRenown([4, q(1.0)]);
    const result = resolveSuccession(lineage, 1, renown, { type: "renown_based", maxDegree: 2 }, SEED, TICK);
    expect(result.heirId).toBe(4);
    expect(result.stabilityImpact_Q).toBeLessThan(0);
  });
});

// ── resolveSuccession — renown_based ──────────────────────────────────────────

describe("resolveSuccession — renown_based", () => {
  it("selects candidate with highest renown", () => {
    const lineage = makeFamily();
    const renown  = makeRenown([2, q(0.2)], [3, q(0.8)]);
    const result  = resolveSuccession(lineage, 1, renown, { type: "renown_based" }, SEED, TICK);
    // child 3 has much higher renown
    expect(result.heirId).toBe(3);
  });

  it("claim strength is weighted combination of own + inherited renown", () => {
    const lineage = makeFamily();
    const renown  = makeRenown([2, q(0.5)]);
    // inherited renown for child 2 = 0 (parent 1 has no renown)
    const candidates = findSuccessionCandidates(lineage, 1, renown);
    const c2 = candidates.find(c => c.entityId === 2)!;
    // fill claim strength manually for verification
    const expectedClaim = Math.round(
      q(0.5) * CLAIM_OWN_RENOWN_WEIGHT_Q / SCALE.Q +
      c2.inheritedRenown_Q * CLAIM_INHERITED_RENOWN_WEIGHT_Q / SCALE.Q,
    );
    // Note: resolveSuccession fills it
    const result = resolveSuccession(lineage, 1, renown, { type: "renown_based" }, SEED, TICK);
    const winnerCandidate = result.candidates.find(c => c.entityId === 2);
    expect(winnerCandidate?.claimStrength_Q).toBe(expectedClaim);
  });

  it("contested succession (close claim strengths) adds extra penalty", () => {
    const lineage = makeFamily();
    // Equal renown → equal claims → contested
    const renown  = makeRenown([2, q(0.5)], [3, q(0.5)]);
    const result  = resolveSuccession(lineage, 1, renown, { type: "renown_based" }, SEED, TICK);
    expect(result.stabilityImpact_Q).toBeLessThanOrEqual(-STABILITY_CONTESTED_Q);
  });
});

// ── resolveSuccession — election ──────────────────────────────────────────────

describe("resolveSuccession — election", () => {
  it("returns a valid heir from candidate pool", () => {
    const lineage = makeFamily();
    const renown  = makeRenown([2, q(0.5)], [3, q(0.3)]);
    const result  = resolveSuccession(lineage, 1, renown, { type: "election" }, SEED, TICK);
    expect([2, 3, 4]).toContain(result.heirId);
  });

  it("is deterministic for same seed + tick", () => {
    const lineage = makeFamily();
    const renown  = makeRenown([2, q(0.4)], [3, q(0.6)]);
    const r1 = resolveSuccession(lineage, 1, renown, { type: "election" }, SEED, TICK);
    const r2 = resolveSuccession(lineage, 1, renown, { type: "election" }, SEED, TICK);
    expect(r1.heirId).toBe(r2.heirId);
  });

  it("different seeds can produce different heirs", () => {
    const lineage = makeFamily();
    // Equal renown so either child is possible
    const renown = makeRenown([2, q(0.5)], [3, q(0.5)]);
    const results = new Set<number | null>();
    for (let s = 0; s < 50; s++) {
      const r = resolveSuccession(lineage, 1, renown, { type: "election" }, s, TICK);
      if (r.heirId !== null) results.add(r.heirId);
    }
    // With equal claims, both candidates should win sometimes across 50 seeds
    expect(results.size).toBeGreaterThan(1);
  });
});

// ── applySuccessionToPolity ───────────────────────────────────────────────────

describe("applySuccessionToPolity", () => {
  it("adds positive stability impact to polity", () => {
    const polity = createPolity("p1", "Rome", "f1", [], 100_000, 5_000, "Medieval");
    const before = polity.stabilityQ;
    applySuccessionToPolity(polity, {
      heirId: 2,
      candidates: [],
      rule: "primogeniture",
      stabilityImpact_Q: STABILITY_CLEAN_SUCCESSION_Q,
    });
    expect(polity.stabilityQ).toBeGreaterThan(before);
  });

  it("adds negative stability impact to polity", () => {
    const polity = createPolity("p1", "Rome", "f1", [], 100_000, 5_000, "Medieval");
    const before = polity.stabilityQ;
    applySuccessionToPolity(polity, {
      heirId: null,
      candidates: [],
      rule: "primogeniture",
      stabilityImpact_Q: -STABILITY_NO_HEIR_Q as unknown as Q,
    });
    expect(polity.stabilityQ).toBeLessThan(before);
  });

  it("clamps stabilityQ to [0, SCALE.Q]", () => {
    const polity = createPolity("p1", "Rome", "f1", [], 100_000, 5_000, "Medieval");
    polity.stabilityQ = q(0.01); // very low
    applySuccessionToPolity(polity, {
      heirId: null,
      candidates: [],
      rule: "primogeniture",
      stabilityImpact_Q: -SCALE.Q as unknown as Q,
    });
    expect(polity.stabilityQ).toBeGreaterThanOrEqual(0);
  });
});
