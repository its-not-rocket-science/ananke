import type { ScenarioDefinition } from "../scenarios/common.js";

export interface AdapterResult {
  ticksPerSec: number;
  tickMs: number;
  heapDeltaMB?: number;
  notes?: string;
}

export interface BaselineAdapter {
  id: string;
  label: string;
  run: (scenario: ScenarioDefinition) => Promise<AdapterResult | null>;
}
