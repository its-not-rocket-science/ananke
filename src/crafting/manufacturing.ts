// src/crafting/manufacturing.ts — Phase 61: Manufacturing System
//
// Batch production lines, progress accumulation, quality variance.
// Deterministic batch quality range based on workers, materials, workshop.

import type { Q } from "../units.js";
import { SCALE, q, clampQ, qMul, mulDiv } from "../units.js";
import type { Entity } from "../sim/entity.js";
import type { Recipe } from "./recipes.js";
import type { WorkshopInstance } from "./workshops.js";
import { makeRng } from "../rng.js";
import { eventSeed } from "../sim/seeds.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Production line state for batch manufacturing. */
export interface ProductionLine {
  lineId: string;
  recipeId: string;
  batchSize: number;           // Total items to produce
  itemsProduced: number;       // Already completed items
  progress_Q: Q;               // Progress toward next item (0–SCALE.Q)
  assignedWorkers: number[];   // Entity IDs of workers assigned
  priority: number;            // Higher priority gets more resources
  qualityRange: { min_Q: Q; max_Q: Q; avg_Q: Q }; // Predicted quality range for batch
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
  qualityRange: { min_Q: Q; max_Q: Q; avg_Q: Q }; // Updated quality range
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

/** Default progress per worker per second (Q units). */
const PROGRESS_PER_WORKER_PER_SECOND: Q = q(0.001) as Q;

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
  workers: Entity[],
  seed: number,
): ProductionLine {
  const workerIds = workers.map(w => w.id);
  const qualityRange = calculateBatchQualityRange(workers, order.workshop, seed);

  return {
    lineId: `line_${order.orderId}`,
    recipeId: order.recipeId,
    batchSize: order.quantity,
    itemsProduced: 0,
    progress_Q: q(0),
    assignedWorkers: workerIds,
    priority: 1,
    qualityRange,
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
  workers: Entity[], // Must match assignedWorkers IDs
  workshop: WorkshopInstance,
  seed: number,
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

  // Apply workshop time reduction (not yet implemented)
  const effectiveProgress = totalProgress; // placeholder

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
  const remainingItems = productionLine.batchSize - productionLine.itemsProduced;
  const updatedRange = updateQualityRange(productionLine.qualityRange, workers, remainingItems, seed);

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
  workshop: WorkshopInstance,
  seed: number,
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

  // Workshop quality bonus (placeholder)
  const workshopBonus = q(1.0); // TODO: get from workshop

  // Base average quality = avgSkill × workshopBonus
  const avg_Q = clampQ(qMul(avgSkill, workshopBonus) as Q, q(0), SCALE.Q);

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
function updateQualityRange(
  currentRange: { min_Q: Q; max_Q: Q; avg_Q: Q },
  workers: Entity[],
  remainingItems: number,
  seed: number,
): { min_Q: Q; max_Q: Q; avg_Q: Q } {
  // For simplicity, keep range constant; could adjust based on worker fatigue, etc.
  return currentRange;
}

// ── Multi‑Stage Assembly ──────────────────────────────────────────────────────

/**
 * Create assembly steps for a complex recipe.
 */
export function createAssemblySteps(recipe: Recipe): AssemblyStep[] {
  // Placeholder: generate steps based on recipe complexity
  const steps: AssemblyStep[] = [];
  const stepCount = Math.max(1, Math.round(recipe.complexity_Q / q(0.30)));
  for (let i = 0; i < stepCount; i++) {
    steps.push({
      stepId: `step_${i}`,
      description: `Step ${i + 1}`,
      requiredSkill: i % 2 === 0 ? "bodilyKinesthetic" : "logicalMathematical",
      timeFraction: Math.round(SCALE.Q / stepCount) as Q,
      toolRequirements: i === 0 ? ["forge"] : [],
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
  workshop: WorkshopInstance,
): number {
  if (workers.length === 0) return Infinity;

  let totalSkill = 0;
  for (const worker of workers) {
    totalSkill += worker.attributes.cognition?.bodilyKinesthetic ?? q(0.50);
  }
  const avgSkill = totalSkill / workers.length;

  // Base time per item (placeholder: 1 hour)
  const baseTimePerItem_s = 3600;
  const workshopSpeedFactor = q(1.0); // TODO: get from workshop

  const effectiveTimePerItem = Math.round(baseTimePerItem_s * SCALE.Q / avgSkill / workshopSpeedFactor);
  return effectiveTimePerItem * batchSize / SCALE.Q;
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