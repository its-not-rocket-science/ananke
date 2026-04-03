export interface ScenarioMeasurement {
  scenarioId: string;
  scenarioLabel: string;
  adapterId: string;
  adapterLabel: string;
  tickMs: number;
  ticksPerSec: number;
  heapDeltaMB?: number;
  notes?: string;
}

export interface BenchmarkRun {
  generatedAt: string;
  commit: string;
  branch: string;
  machine: string;
  measurements: ScenarioMeasurement[];
}
