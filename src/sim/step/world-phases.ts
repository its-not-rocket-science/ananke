import type { WorldStepContext } from "./world-step-context.js";

export interface WorldStepPhase {
  name: string;
  run(stepCtx: WorldStepContext): void;
}

export const WORLD_STEP_PHASE_ORDER = [
  "prepare",
  "cooldowns",
  "input",
  "movement",
  "actions",
  "impacts",
  "systems",
  "finalize",
] as const;

export function runWorldStepPhases(stepCtx: WorldStepContext, phases: readonly WorldStepPhase[]): void {
  for (const phase of phases) {
    phase.run(stepCtx);
  }
}
