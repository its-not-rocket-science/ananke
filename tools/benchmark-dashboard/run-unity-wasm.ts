// Placeholder executor. Wire this to your actual DOTS/WASM harness when available.
const scenarioId = process.argv[2] ?? "unknown";

const synthetic: Record<string, number> = {
  "empty-world": 0.03,
  "small-skirmish": 0.35,
  "large-battle": 2.1,
  "spawn-storm": 1.8,
  "memory-stress": 0.95,
};

const tickMs = synthetic[scenarioId] ?? 1.0;
process.stdout.write(JSON.stringify({ tickMs, notes: "Synthetic DOTS placeholder; replace with real wasm runner." }));
