import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  runHostDeterministicEvolutionWithReplayProof,
} from "../src/world-evolution-host-backend.js";
import type { OpenWorldHostInput } from "../src/world-evolution-backend/public.js";

const fixturePath = fileURLToPath(
  new URL("../fixtures/world-evolution-open-worldbuilder/openworld-host-input.sample.json", import.meta.url),
);

const hostInput = JSON.parse(readFileSync(fixturePath, "utf8")) as OpenWorldHostInput;

const result = runHostDeterministicEvolutionWithReplayProof({
  input: hostInput,
  steps: 24,
  includeDeltas: true,
  checkpointInterval: 6,
  includeSummaryText: true,
});

console.log("Replay proof:", result.reproducibility);
console.log("Final tick:", result.run.finalSnapshot.tick);
console.log("Timeline events:", result.history.length);
