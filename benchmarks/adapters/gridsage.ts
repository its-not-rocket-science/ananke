import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { BaselineAdapter } from "./types.js";

const SNAPSHOT = "benchmarks/adapters/vendor/gridsage-baseline.json";

export const gridSageAdapter: BaselineAdapter = {
  id: "gridsage",
  label: "GridSage (public snapshot)",
  async run(scenario) {
    if (!existsSync(SNAPSHOT)) {
      return {
        tickMs: 0,
        ticksPerSec: 0,
        notes: "No public GridSage snapshot configured; add benchmarks/adapters/vendor/gridsage-baseline.json.",
      };
    }

    const payload = JSON.parse(await readFile(SNAPSHOT, "utf8")) as Record<string, { tickMs: number; notes?: string }>;
    const entry = payload[scenario.id];
    if (!entry) return null;
    return {
      tickMs: entry.tickMs,
      ticksPerSec: entry.tickMs > 0 ? 1000 / entry.tickMs : 0,
      notes: entry.notes ?? "Imported from public GridSage snapshot.",
    };
  },
};
