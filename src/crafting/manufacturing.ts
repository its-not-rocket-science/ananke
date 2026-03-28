// src/crafting/manufacturing.ts — Phase 61: Manufacturing System
//
// Batch production lines, progress accumulation, quality variance.
// Deterministic batch quality range based on workers, materials, workshop.

import type { Q } from "../units.js";
import { SCALE, q, clampQ, qMul, mulDiv } from "../units.js";
import type { Entity } from "../sim/entity.js";
import type { Recipe } from "./recipes.js";
import type { WorkshopInstance } from "./workshops.js";
import { getWorkshopBonus } from "./workshops.js";
import { getRecipeById } from "./recipes.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Production line state for batch manufacturing. */
export type ProductQualityRange = { min_Q: Q; max_Q: Q; avg_Q: Q };

export interface ProductionLine {
  lineId: string;
  recipeId: string;
  batchSize: number;              // Total items to produce
  itemsProduced: number;          // Already completed items
  progress_Q: Q;                  // Progress toward next item (0–SCALE.Q)
  assignedWorkers: number[];      // Entity IDs of workers assigned
  priority: number;               // Higher priority gets more resources
  qualityRange: ProductQualityRange; // Predicted quality range for batch
  workshopTimeReduction_Q?: Q;   // Workshop speed factor (q(0.90) = 10% faster; q(1.0) = no reduction)
  workshopQualityBonus_Q?: Q;    // Workshop quality multiplier (q(1.10) = +10% quality; q(1.0) = none)
}

/** Manufacturing order for starting batch production. */
export interface ManufacturingOrder {
  orderId: string;
  recipeId: string;
  quantity: number;
  workshop: WorkshopInstance;
  deadlineTick?: number;       // Optional deadline
}

/** Result of advancing production. */
export interface ProductionAdvanceResult {
  itemsCompleted: number;      // New items finished this step
  totalItemsProduced: number;  // Cumulative items produced
  progress_Q: Q;               // New progress value
  qualityRange: ProductQualityRange; // Updated quality range
}

/** Assembly step for multi-stage crafting. */
export interface AssemblyStep {
  stepId: string;
  description: string;
  requiredSkill: string;       // e.g., "bodilyKinesthetic"
  timeFraction: Q;             // Fraction of total base time
  toolRequirements: string[];  // tool categories needed
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Quality variance factor based on number of workers (more workers → less variance). */
const WORKER_VARIANCE_REDUCTION: Q = q(0.10) as Q;

/** Minimum quality variance per batch. */
const MIN_QUALITY_VARIANCE: Q = q(0.05) as Q;

// ── Production Line Management ────────────────────────────────────────────────

/**
 * Initialize a production line for batch manufacturing.
 */
export function setupProductionLine(
  order: ManufacturingOrder,
  workers: Entity[]
): ProductionLine {
  const recipe = getRecipeById(order.recipeId);
  const workshopBonus = recipe
    ? getWorkshopBonus(order.workshop, recipe)
    : { toolBonus_Q: q(0) as Q, timeReduction_Q: q(1.0) as Q, qualityBonus_Q: q(1.0) as Q };

  const workerIds = workers.map(w => w.id);
  const qualityRange = calculateBatchQualityRange(workers, workshopBonus.qualityBonus_Q);

  return {
    lineId: `line_${order.orderId}`,
    recipeId: order.recipeId,
    batchSize: order.quantity,
    itemsProduced: 0,
    progress_Q: q(0),
    assignedWorkers: workerIds,
    priority: 1,
    qualityRange,
    workshopTimeReduction_Q: workshopBonus.timeReduction_Q,
    workshopQualityBonus_Q: workshopBonus.qualityBonus_Q,
  };
}

/**
 * Advance production line by deltaTime seconds.
 * Progress accumulates based on number of workers and their skills.
 * Returns new items completed and updated progress.
 */
export function advanceProduction(
  productionLine: ProductionLine,
  deltaTime_s: number,
  workers: Entity[],
): ProductionAdvanceResult {
  if (productionLine.itemsProduced >= productionLine.batchSize) {
    return {
      itemsCompleted: 0,
      totalItemsProduced: productionLine.itemsProduced,
      progress_Q: productionLine.progress_Q,
      qualityRange: productionLine.qualityRange,
    };
  }

  // Calculate total progress contribution from workers
  let totalProgress = 0;
  for (const worker of workers) {
    const skill = worker.attributes.cognition?.bodilyKinesthetic ?? q(0.50);
    // Progress = skill × time × base rate
    const workerProgress = mulDiv(skill, deltaTime_s * SCALE.Q, 3600) as Q;
    totalProgress += workerProgress;
  }

  // Apply workshop time reduction: timeReduction_Q < SCALE.Q means faster production
  const timeReduction = productionLine.workshopTimeReduction_Q ?? SCALE.Q;
  const effectiveProgress = timeReduction > 0
    ? Math.round(totalProgress * SCALE.Q / timeReduction)
    : totalProgress;

  // Advance progress
  let newProgress = productionLine.progress_Q + effectiveProgress;
  let itemsCompleted = 0;

  // Each item requires SCALE.Q progress
  while (newProgress >= SCALE.Q && productionLine.itemsProduced < productionLine.batchSize) {
    newProgress -= SCALE.Q;
    itemsCompleted++;
    productionLine.itemsProduced++;
  }

  productionLine.progress_Q = clampQ(newProgress as Q, q(0), SCALE.Q);

  // Update quality range based on remaining workers (variance reduces as more items produced)
  const updatedRange = updateQualityRange(productionLine.qualityRange);

  return {
    itemsCompleted,
    totalItemsProduced: productionLine.itemsProduced,
    progress_Q: productionLine.progress_Q,
    qualityRange: updatedRange,
  };
}

/**
 * Calculate predicted quality range for a batch based on workers, materials, workshop.
 * Returns min, max, and average expected quality.
 */
export function calculateBatchQualityRange(
  workers: Entity[],
  workshopQualityBonus_Q: Q = q(1.0) as Q,
): { min_Q: Q; max_Q: Q; avg_Q: Q } {
  if (workers.length === 0) {
    return { min_Q: q(0), max_Q: q(0), avg_Q: q(0) };
  }

  // Average worker skill (bodilyKinesthetic)
  let totalSkill = 0;
  for (const worker of workers) {
    totalSkill += worker.attributes.cognition?.bodilyKinesthetic ?? q(0.50);
  }
  const avgSkill = totalSkill / workers.length;

  // Base average quality = avgSkill × workshopQualityBonus
  const avg_Q = clampQ(qMul(avgSkill, workshopQualityBonus_Q) as Q, q(0), SCALE.Q);

  // Variance decreases with more workers
  const variance = Math.max(
    MIN_QUALITY_VARIANCE,
    q(0.20) - mulDiv(WORKER_VARIANCE_REDUCTION, workers.length, 1),
  );

  const min_Q = clampQ((avg_Q - variance) as Q, q(0), SCALE.Q);
  const max_Q = clampQ((avg_Q + variance) as Q, q(0), SCALE.Q);

  return { min_Q, max_Q, avg_Q };
}

/** Update quality range as production progresses (variance may change). */
function updateQualityRange(currentRange: ProductQualityRange): ProductQualityRange {
  // For simplicity, keep range constant; could adjust based on worker fatigue, etc.
  return currentRange;
}

// ── Multi‑Stage Assembly ──────────────────────────────────────────────────────

/**
 * Create assembly steps for a complex recipe.
 */
export function createAssemblySteps(recipe: Recipe): AssemblyStep[] {
  const steps: AssemblyStep[] = [];
  const stepCount = Math.max(1, Math.round(recipe.complexity_Q / q(0.30)));

  // Derive skills and tools from recipe requirements
  const skillTypes = recipe.skillRequirements.length > 0
    ? recipe.skillRequirements.map(sr => sr.skillType)
    : ["bodilyKinesthetic", "logicalMathematical"];
  const toolCategories = recipe.toolRequirements.map(tr => tr.toolCategory);

  for (let i = 0; i < stepCount; i++) {
    steps.push({
      stepId: `step_${i}`,
      description: `Step ${i + 1}`,
      requiredSkill: skillTypes[i % skillTypes.length]!,
      timeFraction: Math.round(SCALE.Q / stepCount) as Q,
      toolRequirements: i === 0 && toolCategories.length > 0 ? [toolCategories[0]!] : [],
    });
  }
  return steps;
}

/**
 * Advance a single assembly step.
 */
export function advanceAssemblyStep(
  step: AssemblyStep,
  worker: Entity,
  deltaTime_s: number,
  availableTools: Map<string, Q>,
): { progress_Q: Q; completed: boolean } {
  const skill = (worker.attributes.cognition?.[step.requiredSkill as keyof typeof worker.attributes.cognition] ?? q(0.50)) as Q;
  const toolBonus = step.toolRequirements.length > 0
    ? Math.max(...step.toolRequirements.map(t => availableTools.get(t) ?? q(0))) as Q
    : q(1.0);

  const progress = mulDiv(skill, deltaTime_s * SCALE.Q, 3600) as Q;
  const effectiveProgress = qMul(progress, toolBonus);

  // Step requires timeFraction of total time to complete
  const requiredProgress = step.timeFraction;
  const newProgress = effectiveProgress; // accumulate across calls (needs state)
  const completed = newProgress >= requiredProgress;

  return { progress_Q: effectiveProgress, completed };
}

// ── Utility Functions ────────────────────────────────────────────────────────

/** Estimate time to complete a batch given workers and workshop. */
export function estimateBatchCompletionTime(
  batchSize: number,
  workers: Entity[],
  workshopTimeReduction_Q: Q = q(1.0) as Q,
): number {
  if (workers.length === 0) return Infinity;
  if (batchSize === 0) return 0;

  let totalSkill = 0;
  for (const worker of workers) {
    totalSkill += worker.attributes.cognition?.bodilyKinesthetic ?? q(0.50);
  }
  const avgSkill = totalSkill / workers.length;
  if (avgSkill <= 0) return Infinity;

  // At skill q(1.0), one item takes baseTimePerItem_s seconds.
  // With time reduction q(0.90), items take 90% as long (10% faster).
  const baseTimePerItem_s = 3600;
  const timePerItem_s = Math.round(baseTimePerItem_s * workshopTimeReduction_Q / avgSkill);
  return timePerItem_s * batchSize;
}

/** Check if production line is complete. */
export function isProductionLineComplete(line: ProductionLine): boolean {
  return line.itemsProduced >= line.batchSize;
}

/** Get progress percentage (0–1). */
export function getProductionLineProgress(line: ProductionLine): Q {
  const totalProgress = line.itemsProduced * SCALE.Q + line.progress_Q;
  const totalRequired = line.batchSize * SCALE.Q;
  return clampQ(Math.round(totalProgress * SCALE.Q / totalRequired) as Q, q(0), SCALE.Q);
}