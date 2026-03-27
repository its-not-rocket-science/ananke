// test/crafting/manufacturing.test.ts — Phase 61: Manufacturing System Tests

import { describe, it, expect } from "vitest";
import { q, SCALE } from "../../src/units";
import {
  setupProductionLine,
  advanceProduction,
  calculateBatchQualityRange,
  createAssemblySteps,
  advanceAssemblyStep,
  estimateBatchCompletionTime,
  isProductionLineComplete,
  getProductionLineProgress,
  type ProductionLine,
  type ManufacturingOrder,
} from "../../src/crafting/manufacturing";
import { SAMPLE_RECIPES } from "../../src/crafting/recipes";
import { createWorkshop } from "../../src/crafting/workshops";
import { mkHumanoidEntity } from "../../src/sim/testing";
import type { Entity } from "../../src/sim/entity";
import type { WorkshopInstance } from "../../src/crafting/workshops";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkWorker(bk = 0.70, lm = 0.60, id = 1): Entity {
  const e = mkHumanoidEntity(id, 1, 0, 0);
  return {
    ...e,
    id,
    attributes: {
      ...e.attributes,
      cognition: {
        linguistic: q(0.60),
        logicalMathematical: q(lm),
        spatial: q(0.60),
        bodilyKinesthetic: q(bk),
        musical: q(0.50),
        interpersonal: q(0.60),
        intrapersonal: q(0.60),
        naturalist: q(0.55),
        interSpecies: q(0.30),
      },
    },
  };
}

function mkForgeWorkshop(): WorkshopInstance {
  const tools = new Map<string, number>([
    ["forge", q(0.70)],
    ["bladed", q(0.60)],
  ]);
  return createWorkshop("forge", "factory_1", "basic", tools)!;
}

function mkOrder(quantity = 5, recipeId = "recipe_shortsword"): ManufacturingOrder {
  return {
    orderId: `order_${recipeId}_${quantity}`,
    recipeId,
    quantity,
    workshop: mkForgeWorkshop(),
  };
}

function mkProductionLine(
  batchSize = 5,
  itemsProduced = 0,
  progress_Q = q(0),
): ProductionLine {
  return {
    lineId: "line_test",
    recipeId: "recipe_shortsword",
    batchSize,
    itemsProduced,
    progress_Q,
    assignedWorkers: [1],
    priority: 1,
    qualityRange: { min_Q: q(0.30), max_Q: q(0.90), avg_Q: q(0.60) },
  };
}

// ── setupProductionLine ───────────────────────────────────────────────────────

describe("setupProductionLine", () => {
  it("creates a production line with correct lineId", () => {
    const order = mkOrder(10);
    const workers = [mkWorker()];
    const line = setupProductionLine(order, workers);
    expect(line.lineId).toBe(`line_${order.orderId}`);
    expect(line.recipeId).toBe(order.recipeId);
    expect(line.batchSize).toBe(10);
    expect(line.itemsProduced).toBe(0);
    expect(line.progress_Q).toBe(q(0));
  });

  it("stores worker IDs correctly", () => {
    const w1 = mkWorker(0.7, 0.6, 11);
    const w2 = mkWorker(0.8, 0.7, 22);
    const line = setupProductionLine(mkOrder(3), [w1, w2]);
    expect(line.assignedWorkers).toContain(11);
    expect(line.assignedWorkers).toContain(22);
    expect(line.assignedWorkers).toHaveLength(2);
  });

  it("calculates quality range based on workers", () => {
    const workers = [mkWorker(0.8, 0.6)];
    const line = setupProductionLine(mkOrder(5), workers);
    expect(line.qualityRange.avg_Q).toBeGreaterThan(0);
    expect(line.qualityRange.max_Q).toBeGreaterThanOrEqual(line.qualityRange.avg_Q);
    expect(line.qualityRange.min_Q).toBeLessThanOrEqual(line.qualityRange.avg_Q);
  });

  it("is deterministic for same inputs", () => {
    const order = mkOrder(5);
    const workers = [mkWorker()];
    const l1 = setupProductionLine(order, workers);
    const l2 = setupProductionLine(order, workers);
    expect(l1.qualityRange.avg_Q).toBe(l2.qualityRange.avg_Q);
    expect(l1.qualityRange.min_Q).toBe(l2.qualityRange.min_Q);
    expect(l1.qualityRange.max_Q).toBe(l2.qualityRange.max_Q);
  });

  it("sets priority to 1 by default", () => {
    const line = setupProductionLine(mkOrder(2), [mkWorker()]);
    expect(line.priority).toBe(1);
  });
});

// ── advanceProduction ─────────────────────────────────────────────────────────

describe("advanceProduction", () => {
  it("returns zero items completed when batch is already complete", () => {
    const line = mkProductionLine(5, 5); // fully produced
    const workers = [mkWorker()];
    const result = advanceProduction(line, 3600, workers);
    expect(result.itemsCompleted).toBe(0);
    expect(result.totalItemsProduced).toBe(5);
  });

  it("accumulates progress proportional to elapsed time", () => {
    const line = mkProductionLine(100, 0);
    const workers = [mkWorker()];
    const result = advanceProduction(line, 3600, workers);
    // Some progress should be made
    expect(result.progress_Q + result.totalItemsProduced * SCALE.Q).toBeGreaterThan(0);
  });

  it("completes items when enough progress accumulates", () => {
    // Batch size 1, progress already near SCALE.Q
    const line: ProductionLine = {
      ...mkProductionLine(10, 0),
      // Start with high progress so one item completes immediately
      progress_Q: (SCALE.Q - 1) as ReturnType<typeof q>,
    };
    const workers = [mkWorker(1.0, 1.0)];
    const result = advanceProduction(line, 3600, workers);
    expect(result.itemsCompleted).toBeGreaterThanOrEqual(1);
    expect(result.totalItemsProduced).toBeGreaterThanOrEqual(1);
  });

  it("does not exceed batchSize in items produced", () => {
    const line = mkProductionLine(2, 0);
    const workers = [mkWorker(), mkWorker(0.9, 0.9, 2), mkWorker(0.9, 0.9, 3)];
    // Large delta to potentially over-produce
    const result = advanceProduction(line, 100_000, workers);
    expect(result.totalItemsProduced).toBeLessThanOrEqual(2);
  });

  it("progress_Q is clamped to [0, SCALE.Q]", () => {
    const line = mkProductionLine(100, 0);
    const workers = [mkWorker()];
    const result = advanceProduction(line, 7200, workers);
    expect(result.progress_Q).toBeGreaterThanOrEqual(q(0));
    expect(result.progress_Q).toBeLessThanOrEqual(SCALE.Q);
  });

  it("returns qualityRange in result", () => {
    const line = mkProductionLine(5, 0);
    const workers = [mkWorker()];
    const result = advanceProduction(line, 3600, workers);
    expect(result.qualityRange).toBeDefined();
    expect(result.qualityRange).toHaveProperty("min_Q");
    expect(result.qualityRange).toHaveProperty("max_Q");
    expect(result.qualityRange).toHaveProperty("avg_Q");
  });

  it("two workers complete more items than one worker same time", () => {
    const line1 = mkProductionLine(50, 0);
    const line2 = mkProductionLine(50, 0);
    const oneWorker  = [mkWorker(0.70, 0.60, 1)];
    const twoWorkers = [mkWorker(0.70, 0.60, 1), mkWorker(0.70, 0.60, 2)];
    const r1 = advanceProduction(line1, 3600, oneWorker);
    const r2 = advanceProduction(line2, 3600, twoWorkers);
    const progress1 = r1.totalItemsProduced * SCALE.Q + r1.progress_Q;
    const progress2 = r2.totalItemsProduced * SCALE.Q + r2.progress_Q;
    expect(progress2).toBeGreaterThanOrEqual(progress1);
  });
});

// ── calculateBatchQualityRange ────────────────────────────────────────────────

describe("calculateBatchQualityRange", () => {
  it("returns all-zero range when no workers", () => {
    const range = calculateBatchQualityRange([]);
    expect(range.min_Q).toBe(q(0));
    expect(range.max_Q).toBe(q(0));
    expect(range.avg_Q).toBe(q(0));
  });

  it("returns valid range for a single worker", () => {
    const worker = mkWorker(0.70);
    const range = calculateBatchQualityRange([worker]);
    expect(range.min_Q).toBeGreaterThanOrEqual(q(0));
    expect(range.max_Q).toBeLessThanOrEqual(SCALE.Q);
    expect(range.max_Q).toBeGreaterThanOrEqual(range.min_Q);
    expect(range.avg_Q).toBeGreaterThan(q(0));
  });

  it("min_Q <= avg_Q <= max_Q for multiple workers", () => {
    const workers = [mkWorker(0.6, 0.5, 1), mkWorker(0.8, 0.7, 2), mkWorker(0.7, 0.6, 3)];
    const range = calculateBatchQualityRange(workers);
    expect(range.min_Q).toBeLessThanOrEqual(range.avg_Q);
    expect(range.avg_Q).toBeLessThanOrEqual(range.max_Q);
  });

  it("higher skill worker gives higher avg_Q", () => {
    const lowWorker  = mkWorker(0.30);
    const highWorker = mkWorker(0.90);
    const rangeLow  = calculateBatchQualityRange([lowWorker]);
    const rangeHigh = calculateBatchQualityRange([highWorker]);
    expect(rangeHigh.avg_Q).toBeGreaterThan(rangeLow.avg_Q);
  });

  it("variance reduces as more workers are added", () => {
    const w = (id: number) => mkWorker(0.70, 0.60, id);
    const r1 = calculateBatchQualityRange([w(1)]);
    const r3 = calculateBatchQualityRange([w(1), w(2), w(3)]);
    const spread1 = r1.max_Q - r1.min_Q;
    const spread3 = r3.max_Q - r3.min_Q;
    expect(spread3).toBeLessThanOrEqual(spread1);
  });

  it("is deterministic for same seed and workers", () => {
    const workers = [mkWorker()];
    const r1 = calculateBatchQualityRange(workers);
    const r2 = calculateBatchQualityRange(workers);
    expect(r1.avg_Q).toBe(r2.avg_Q);
    expect(r1.min_Q).toBe(r2.min_Q);
    expect(r1.max_Q).toBe(r2.max_Q);
  });
});

// ── createAssemblySteps ───────────────────────────────────────────────────────

describe("createAssemblySteps", () => {
  it("creates at least one step for any recipe", () => {
    const recipe = SAMPLE_RECIPES[0]!; // shortsword, complexity_Q = q(0.60)
    const steps = createAssemblySteps(recipe);
    expect(steps.length).toBeGreaterThanOrEqual(1);
  });

  it("each step has required properties", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const steps = createAssemblySteps(recipe);
    for (const step of steps) {
      expect(step).toHaveProperty("stepId");
      expect(step).toHaveProperty("description");
      expect(step).toHaveProperty("requiredSkill");
      expect(step).toHaveProperty("timeFraction");
      expect(step).toHaveProperty("toolRequirements");
      expect(typeof step.stepId).toBe("string");
      expect(Array.isArray(step.toolRequirements)).toBe(true);
    }
  });

  it("step 0 always has forge tool requirement", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const steps = createAssemblySteps(recipe);
    expect(steps[0]!.toolRequirements).toContain("forge");
  });

  it("alternates skill type between bodilyKinesthetic and logicalMathematical", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const steps = createAssemblySteps(recipe);
    if (steps.length >= 2) {
      expect(steps[0]!.requiredSkill).toBe("bodilyKinesthetic");
      expect(steps[1]!.requiredSkill).toBe("logicalMathematical");
    }
  });

  it("higher complexity produces more steps", () => {
    const lowComplexRecipe = { ...SAMPLE_RECIPES[0]!, complexity_Q: q(0.20) };
    const highComplexRecipe = { ...SAMPLE_RECIPES[0]!, complexity_Q: q(0.90) };
    const stepsLow  = createAssemblySteps(lowComplexRecipe);
    const stepsHigh = createAssemblySteps(highComplexRecipe);
    expect(stepsHigh.length).toBeGreaterThanOrEqual(stepsLow.length);
  });

  it("works for leather armour recipe", () => {
    const recipe = SAMPLE_RECIPES[1]!; // leather armour
    const steps = createAssemblySteps(recipe);
    expect(steps.length).toBeGreaterThanOrEqual(1);
  });
});

// ── advanceAssemblyStep ───────────────────────────────────────────────────────

describe("advanceAssemblyStep", () => {
  it("returns progress_Q and completed fields", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const steps = createAssemblySteps(recipe);
    const step = steps[0]!;
    const worker = mkWorker();
    const tools = new Map<string, number>([["forge", q(0.70)]]);
    const result = advanceAssemblyStep(step, worker, 3600, tools);
    expect(result).toHaveProperty("progress_Q");
    expect(result).toHaveProperty("completed");
    expect(typeof result.completed).toBe("boolean");
    expect(result.progress_Q).toBeGreaterThanOrEqual(q(0));
  });

  it("uses q(1.0) tool bonus when no tool requirements", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const steps = createAssemblySteps(recipe);
    // Find a step without tool requirements (later steps have none)
    const stepNoTools = steps.find(s => s.toolRequirements.length === 0);
    if (stepNoTools) {
      const worker = mkWorker();
      const emptyTools = new Map<string, number>();
      const resultNoTool = advanceAssemblyStep(stepNoTools, worker, 3600, emptyTools);
      expect(resultNoTool.progress_Q).toBeGreaterThan(q(0));
    }
  });

  it("higher skill worker makes more progress in same time", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const steps = createAssemblySteps(recipe);
    const step = steps[0]!;
    const tools = new Map<string, number>([["forge", q(0.70)]]);
    const lowWorker  = mkWorker(0.30, 0.30, 1);
    const highWorker = mkWorker(0.90, 0.90, 2);
    const rLow  = advanceAssemblyStep(step, lowWorker,  3600, tools);
    const rHigh = advanceAssemblyStep(step, highWorker, 3600, tools);
    expect(rHigh.progress_Q).toBeGreaterThan(rLow.progress_Q);
  });

  it("step completes when enough time passes and skill is high", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const steps = createAssemblySteps(recipe);
    const step = steps[0]!;
    const worker = mkWorker(1.0, 1.0);
    const tools = new Map<string, number>([["forge", q(1.0)]]);
    // Large delta so progress >= timeFraction
    const result = advanceAssemblyStep(step, worker, 36_000, tools);
    expect(result.completed).toBe(true);
  });

  it("better tool quality increases progress", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const steps = createAssemblySteps(recipe);
    const step = steps[0]!;
    const worker = mkWorker(0.70, 0.60);
    const poorTools   = new Map<string, number>([["forge", q(0.20)]]);
    const goodTools   = new Map<string, number>([["forge", q(0.90)]]);
    const rPoor = advanceAssemblyStep(step, worker, 3600, poorTools);
    const rGood = advanceAssemblyStep(step, worker, 3600, goodTools);
    expect(rGood.progress_Q).toBeGreaterThanOrEqual(rPoor.progress_Q);
  });

  it("falls back to q(0.50) skill when worker has no cognition", () => {
    const recipe = SAMPLE_RECIPES[0]!;
    const steps = createAssemblySteps(recipe);
    const step = steps[0]!;
    const bareEntity = mkHumanoidEntity(99, 1, 0, 0);
    // Remove cognition
    const { cognition: _cognition, ...attributesWithoutCognition } = bareEntity.attributes;
    const noCognitionWorker: Entity = {
      ...bareEntity,
      attributes: attributesWithoutCognition as Entity["attributes"],
    };
    const tools = new Map<string, number>([["forge", q(0.70)]]);
    const result = advanceAssemblyStep(step, noCognitionWorker, 3600, tools);
    expect(result.progress_Q).toBeGreaterThan(q(0));
  });
});

// ── estimateBatchCompletionTime ───────────────────────────────────────────────

describe("estimateBatchCompletionTime", () => {
  it("returns Infinity when no workers", () => {
    const time = estimateBatchCompletionTime(10, []);
    expect(time).toBe(Infinity);
  });

  it("returns finite positive number for normal case", () => {
    const workers = [mkWorker()];
    const time = estimateBatchCompletionTime(5, workers);
    expect(isFinite(time)).toBe(true);
    expect(time).toBeGreaterThan(0);
  });

  it("scales linearly with batch size", () => {
    const workers = [mkWorker()];
    const t5  = estimateBatchCompletionTime(5,  workers);
    const t10 = estimateBatchCompletionTime(10, workers);
    expect(t10).toBeCloseTo(t5 * 2, 0);
  });

  it("higher average skill among two workers reduces batch time vs one low-skill worker", () => {
    // One low-skill worker; adding a high-skill worker raises the average,
    // reducing effectiveTimePerItem (implementation uses avgSkill).
    const oneWorker  = [mkWorker(0.20, 0.20, 1)];
    const twoWorkers = [mkWorker(0.20, 0.20, 1), mkWorker(0.90, 0.90, 2)];
    const t1 = estimateBatchCompletionTime(10, oneWorker);
    const t2 = estimateBatchCompletionTime(10, twoWorkers);
    expect(t2).toBeLessThan(t1);
  });

  it("higher skill reduces estimated time", () => {
    const lowSkill  = [mkWorker(0.30)];
    const highSkill = [mkWorker(0.90)];
    const tLow  = estimateBatchCompletionTime(5, lowSkill);
    const tHigh = estimateBatchCompletionTime(5, highSkill);
    expect(tHigh).toBeLessThan(tLow);
  });

  it("returns 0 for batch size 0", () => {
    const workers = [mkWorker()];
    const time = estimateBatchCompletionTime(0, workers);
    expect(time).toBe(0);
  });
});

// ── isProductionLineComplete ──────────────────────────────────────────────────

describe("isProductionLineComplete", () => {
  it("returns false when itemsProduced < batchSize", () => {
    const line = mkProductionLine(5, 3);
    expect(isProductionLineComplete(line)).toBe(false);
  });

  it("returns true when itemsProduced === batchSize", () => {
    const line = mkProductionLine(5, 5);
    expect(isProductionLineComplete(line)).toBe(true);
  });

  it("returns true when itemsProduced > batchSize", () => {
    const line = mkProductionLine(5, 6); // edge: over-produced
    expect(isProductionLineComplete(line)).toBe(true);
  });

  it("returns false on brand-new line", () => {
    const line = mkProductionLine(10, 0);
    expect(isProductionLineComplete(line)).toBe(false);
  });
});

// ── getProductionLineProgress ─────────────────────────────────────────────────

describe("getProductionLineProgress", () => {
  it("returns q(0) for new line with no progress", () => {
    const line = mkProductionLine(5, 0, q(0));
    const progress = getProductionLineProgress(line);
    expect(progress).toBe(q(0));
  });

  it("returns SCALE.Q for fully completed line", () => {
    const line = mkProductionLine(5, 5, q(0));
    const progress = getProductionLineProgress(line);
    expect(progress).toBe(SCALE.Q);
  });

  it("returns value in [0, SCALE.Q]", () => {
    const line = mkProductionLine(10, 3, q(0.50));
    const progress = getProductionLineProgress(line);
    expect(progress).toBeGreaterThanOrEqual(q(0));
    expect(progress).toBeLessThanOrEqual(SCALE.Q);
  });

  it("is monotonically increasing as itemsProduced increases", () => {
    const p0 = getProductionLineProgress(mkProductionLine(10, 0, q(0)));
    const p3 = getProductionLineProgress(mkProductionLine(10, 3, q(0)));
    const p7 = getProductionLineProgress(mkProductionLine(10, 7, q(0)));
    const p10 = getProductionLineProgress(mkProductionLine(10, 10, q(0)));
    expect(p3).toBeGreaterThan(p0);
    expect(p7).toBeGreaterThan(p3);
    expect(p10).toBeGreaterThanOrEqual(p7);
  });

  it("partial progress within item is reflected", () => {
    const lineNoProgress   = mkProductionLine(10, 5, q(0));
    const lineWithProgress = mkProductionLine(10, 5, q(0.50));
    expect(getProductionLineProgress(lineWithProgress)).toBeGreaterThan(
      getProductionLineProgress(lineNoProgress),
    );
  });
});
