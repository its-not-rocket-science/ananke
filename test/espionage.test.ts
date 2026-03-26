// test/espionage.test.ts — Phase 82: Espionage & Intelligence Networks

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../src/units.js";
import {
  OPERATION_BASE_SUCCESS_Q,
  OPERATION_DETECTION_RISK_Q,
  OPERATION_EFFECT_Q,
  COVER_DECAY_PER_DAY,
  COUNTER_INTEL_PER_AGENT,
  createEspionageRegistry,
  deployAgent,
  recallAgent,
  getAgentsByOwner,
  getAgentsByTarget,
  resolveOperation,
  stepAgentCover,
  computeCounterIntelligence,
} from "../src/espionage.js";

// ── createEspionageRegistry ────────────────────────────────────────────────────

describe("createEspionageRegistry", () => {
  it("creates empty agent map", () => {
    expect(createEspionageRegistry().agents.size).toBe(0);
  });
});

// ── deployAgent ────────────────────────────────────────────────────────────────

describe("deployAgent", () => {
  it("adds agent to registry", () => {
    const r = createEspionageRegistry();
    deployAgent(r, 1, "A", "B", "intelligence_gather", q(0.60) as any);
    expect(r.agents.size).toBe(1);
  });

  it("sets all fields correctly", () => {
    const r = createEspionageRegistry();
    const a = deployAgent(r, 42, "X", "Y", "treaty_sabotage", q(0.75) as any, 100);
    expect(a.agentId).toBe(42);
    expect(a.ownerPolityId).toBe("X");
    expect(a.targetPolityId).toBe("Y");
    expect(a.operation).toBe("treaty_sabotage");
    expect(a.status).toBe("active");
    expect(a.deployedTick).toBe(100);
    expect(a.skill_Q).toBe(q(0.75));
  });

  it("replaces existing agent with same ID", () => {
    const r = createEspionageRegistry();
    deployAgent(r, 1, "A", "B", "intelligence_gather", q(0.50) as any);
    deployAgent(r, 1, "A", "C", "treasury_theft",      q(0.80) as any);
    expect(r.agents.size).toBe(1);
    expect(r.agents.get(1)!.targetPolityId).toBe("C");
  });
});

// ── recallAgent ────────────────────────────────────────────────────────────────

describe("recallAgent", () => {
  it("removes the agent", () => {
    const r = createEspionageRegistry();
    deployAgent(r, 1, "A", "B", "intelligence_gather", q(0.60) as any);
    expect(recallAgent(r, 1)).toBe(true);
    expect(r.agents.size).toBe(0);
  });

  it("returns false for unknown agent", () => {
    const r = createEspionageRegistry();
    expect(recallAgent(r, 999)).toBe(false);
  });
});

// ── getAgentsByOwner / getAgentsByTarget ───────────────────────────────────────

describe("getAgentsByOwner", () => {
  it("returns agents for owner", () => {
    const r = createEspionageRegistry();
    deployAgent(r, 1, "A", "B", "intelligence_gather", q(0.60) as any);
    deployAgent(r, 2, "A", "C", "treasury_theft",      q(0.50) as any);
    deployAgent(r, 3, "B", "A", "bond_subversion",     q(0.70) as any);
    expect(getAgentsByOwner(r, "A")).toHaveLength(2);
    expect(getAgentsByOwner(r, "B")).toHaveLength(1);
    expect(getAgentsByOwner(r, "C")).toHaveLength(0);
  });
});

describe("getAgentsByTarget", () => {
  it("returns agents targeting a polity", () => {
    const r = createEspionageRegistry();
    deployAgent(r, 1, "A", "B", "intelligence_gather", q(0.60) as any);
    deployAgent(r, 2, "C", "B", "bond_subversion",     q(0.50) as any);
    deployAgent(r, 3, "A", "C", "treaty_sabotage",     q(0.70) as any);
    expect(getAgentsByTarget(r, "B")).toHaveLength(2);
    expect(getAgentsByTarget(r, "C")).toHaveLength(1);
    expect(getAgentsByTarget(r, "A")).toHaveLength(0);
  });
});

// ── resolveOperation ───────────────────────────────────────────────────────────

describe("resolveOperation", () => {
  it("is deterministic — same inputs yield same result", () => {
    const r = createEspionageRegistry();
    const a = deployAgent(r, 1, "A", "B", "intelligence_gather", q(0.80) as any);
    const r1 = resolveOperation(a, 42, 100);
    const r2 = resolveOperation(a, 42, 100);
    expect(r1.success).toBe(r2.success);
    expect(r1.detected).toBe(r2.detected);
    expect(r1.effectDelta_Q).toBe(r2.effectDelta_Q);
  });

  it("different ticks can yield different results", () => {
    const r = createEspionageRegistry();
    const a = deployAgent(r, 1, "A", "B", "treasury_theft", q(0.50) as any);
    const results = new Set<boolean>();
    for (let tick = 0; tick < 20; tick++) {
      results.add(resolveOperation(a, 1, tick).success);
    }
    // Over 20 ticks with 50% skill on 35% base, we should see both outcomes
    expect(results.size).toBeGreaterThan(1);
  });

  it("returns no-op for compromised agent", () => {
    const r = createEspionageRegistry();
    const a = deployAgent(r, 1, "A", "B", "bond_subversion", q(0.90) as any);
    a.status = "compromised";
    const result = resolveOperation(a, 1, 1);
    expect(result.success).toBe(false);
    expect(result.detected).toBe(false);
    expect(result.effectDelta_Q).toBe(0);
  });

  it("returns no-op for captured agent", () => {
    const r = createEspionageRegistry();
    const a = deployAgent(r, 1, "A", "B", "treaty_sabotage", q(0.90) as any);
    a.status = "captured";
    expect(resolveOperation(a, 1, 1).success).toBe(false);
  });

  it("effectDelta_Q is 0 for intelligence_gather", () => {
    const r = createEspionageRegistry();
    const a = deployAgent(r, 1, "A", "B", "intelligence_gather", q(1.0) as any);
    // Force skill to max to maximise success probability
    // Run several ticks and confirm effectDelta always 0
    for (let tick = 0; tick < 10; tick++) {
      expect(resolveOperation(a, 1, tick).effectDelta_Q).toBe(0);
    }
  });

  it("higher skill → higher success rate across many ticks", () => {
    const r = createEspionageRegistry();
    const aLow  = deployAgent(r, 1, "A", "B", "bond_subversion", q(0.20) as any);
    const aHigh = deployAgent(r, 2, "A", "B", "bond_subversion", q(0.90) as any);
    let lowSucc = 0, highSucc = 0;
    for (let tick = 0; tick < 50; tick++) {
      if (resolveOperation(aLow,  1, tick).success) lowSucc++;
      if (resolveOperation(aHigh, 1, tick).success) highSucc++;
    }
    expect(highSucc).toBeGreaterThan(lowSucc);
  });

  it("effectDelta_Q scales with skill on success", () => {
    const r  = createEspionageRegistry();
    const aH = deployAgent(r, 1, "A", "B", "treaty_sabotage", q(0.90) as any);
    const aL = deployAgent(r, 2, "A", "B", "treaty_sabotage", q(0.30) as any);
    // Find a tick where both succeed, then compare effectDelta
    for (let tick = 0; tick < 100; tick++) {
      const rH = resolveOperation(aH, 1, tick);
      const rL = resolveOperation(aL, 1, tick);
      if (rH.success && rL.success) {
        expect(rH.effectDelta_Q).toBeGreaterThan(rL.effectDelta_Q);
        return;
      }
    }
    // If no shared success tick found in 100, just assert high-skill can succeed
    const anyHighSucc = Array.from({ length: 100 }, (_, t) => resolveOperation(aH, 1, t)).some(r => r.success);
    expect(anyHighSucc).toBe(true);
  });

  it("detection only fires on failure", () => {
    const r = createEspionageRegistry();
    const a = deployAgent(r, 1, "A", "B", "treasury_theft", q(0.50) as any);
    for (let tick = 0; tick < 50; tick++) {
      const result = resolveOperation(a, 1, tick);
      if (result.success) {
        expect(result.detected).toBe(false);
      }
    }
  });

  it("effectDelta_Q is clamped to [0, SCALE.Q]", () => {
    const r = createEspionageRegistry();
    const a = deployAgent(r, 1, "A", "B", "incite_migration", q(1.0) as any);
    for (let tick = 0; tick < 20; tick++) {
      const result = resolveOperation(a, 1, tick);
      expect(result.effectDelta_Q).toBeGreaterThanOrEqual(0);
      expect(result.effectDelta_Q).toBeLessThanOrEqual(SCALE.Q);
    }
  });
});

// ── stepAgentCover ─────────────────────────────────────────────────────────────

describe("stepAgentCover", () => {
  it("active agent may lose cover over many days", () => {
    const r = createEspionageRegistry();
    const a = deployAgent(r, 1, "A", "B", "bond_subversion", q(0.10) as any); // low skill = less mitigation
    let blown = false;
    for (let tick = 0; tick < 500; tick++) {
      stepAgentCover(a, 1, tick);
      if (a.status !== "active") { blown = true; break; }
    }
    expect(blown).toBe(true);
  });

  it("high-skill agent survives longer than low-skill agent", () => {
    const r  = createEspionageRegistry();
    const aH = deployAgent(r, 1, "A", "B", "bond_subversion", q(1.0) as any);
    const aL = deployAgent(r, 2, "A", "B", "bond_subversion", q(0.01) as any);
    let highBlownAt = Infinity, lowBlownAt = Infinity;
    for (let tick = 1; tick <= 2000; tick++) {
      if (aH.status === "active") stepAgentCover(aH, 1, tick);
      else if (highBlownAt === Infinity) highBlownAt = tick;
      if (aL.status === "active") stepAgentCover(aL, 1, tick);
      else if (lowBlownAt === Infinity) lowBlownAt = tick;
    }
    // Low-skill should blow cover earlier on average
    expect(lowBlownAt).toBeLessThanOrEqual(highBlownAt);
  });

  it("no-op for already compromised agent", () => {
    const r = createEspionageRegistry();
    const a = deployAgent(r, 1, "A", "B", "intelligence_gather", q(0.50) as any);
    a.status = "compromised";
    stepAgentCover(a, 1, 1);
    expect(a.status).toBe("compromised");
  });

  it("no-op for captured agent", () => {
    const r = createEspionageRegistry();
    const a = deployAgent(r, 1, "A", "B", "intelligence_gather", q(0.50) as any);
    a.status = "captured";
    stepAgentCover(a, 1, 1);
    expect(a.status).toBe("captured");
  });

  it("blown status is compromised or captured", () => {
    const r = createEspionageRegistry();
    let sawCompromised = false, sawCaptured = false;
    for (let seed = 1; seed <= 100; seed++) {
      const a = deployAgent(r, seed, "A", "B", "treasury_theft", q(0.01) as any);
      for (let tick = 0; tick < 1000 && a.status === "active"; tick++) {
        stepAgentCover(a, seed, tick);
      }
      if (a.status === "compromised") sawCompromised = true;
      if (a.status === "captured")    sawCaptured    = true;
      if (sawCompromised && sawCaptured) break;
    }
    expect(sawCompromised).toBe(true);
    expect(sawCaptured).toBe(true);
  });
});

// ── computeCounterIntelligence ─────────────────────────────────────────────────

describe("computeCounterIntelligence", () => {
  it("returns 0 when no agents target the polity", () => {
    const r = createEspionageRegistry();
    expect(computeCounterIntelligence(r, "B")).toBe(0);
  });

  it("returns 0 for active agents (not yet known)", () => {
    const r = createEspionageRegistry();
    deployAgent(r, 1, "A", "B", "intelligence_gather", q(0.60) as any);
    expect(computeCounterIntelligence(r, "B")).toBe(0);
  });

  it("increases for each compromised agent", () => {
    const r = createEspionageRegistry();
    const a1 = deployAgent(r, 1, "A", "B", "bond_subversion", q(0.50) as any);
    const a2 = deployAgent(r, 2, "C", "B", "treaty_sabotage", q(0.50) as any);
    a1.status = "compromised";
    a2.status = "compromised";
    expect(computeCounterIntelligence(r, "B")).toBe(2 * COUNTER_INTEL_PER_AGENT);
  });

  it("captured agents do not count (already neutralised)", () => {
    const r = createEspionageRegistry();
    const a = deployAgent(r, 1, "A", "B", "treasury_theft", q(0.50) as any);
    a.status = "captured";
    expect(computeCounterIntelligence(r, "B")).toBe(0);
  });

  it("clamps to SCALE.Q with many compromised agents", () => {
    const r = createEspionageRegistry();
    for (let i = 1; i <= 300; i++) {
      const a = deployAgent(r, i, "A", "B", "intelligence_gather", q(0.50) as any);
      a.status = "compromised";
    }
    expect(computeCounterIntelligence(r, "B")).toBeLessThanOrEqual(SCALE.Q);
  });
});

// ── constants sanity ───────────────────────────────────────────────────────────

describe("constants", () => {
  it("treasury_theft has highest detection risk", () => {
    const risks = Object.values(OPERATION_DETECTION_RISK_Q);
    expect(OPERATION_DETECTION_RISK_Q["treasury_theft"]).toBe(Math.max(...risks));
  });

  it("intelligence_gather has lowest detection risk", () => {
    const risks = Object.values(OPERATION_DETECTION_RISK_Q);
    expect(OPERATION_DETECTION_RISK_Q["intelligence_gather"]).toBe(Math.min(...risks));
  });

  it("intelligence_gather has highest base success rate", () => {
    const rates = Object.values(OPERATION_BASE_SUCCESS_Q);
    expect(OPERATION_BASE_SUCCESS_Q["intelligence_gather"]).toBe(Math.max(...rates));
  });

  it("treasury_theft has lowest base success rate", () => {
    const rates = Object.values(OPERATION_BASE_SUCCESS_Q);
    expect(OPERATION_BASE_SUCCESS_Q["treasury_theft"]).toBe(Math.min(...rates));
  });

  it("intelligence_gather effect is 0", () => {
    expect(OPERATION_EFFECT_Q["intelligence_gather"]).toBe(0);
  });

  it("incite_migration has highest effect", () => {
    const effects = Object.values(OPERATION_EFFECT_Q);
    expect(OPERATION_EFFECT_Q["incite_migration"]).toBe(Math.max(...effects));
  });

  it("COVER_DECAY_PER_DAY is small (< q(0.01))", () => {
    expect(COVER_DECAY_PER_DAY).toBeGreaterThan(0);
    expect(COVER_DECAY_PER_DAY).toBeLessThan(q(0.01));
  });
});
