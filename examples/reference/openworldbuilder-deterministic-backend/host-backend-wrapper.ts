import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import {
  createHostEvolutionBranch,
  resumeHostEvolutionSessionFromCheckpoint,
  runHostDeterministicEvolution,
  runHostEvolutionBranch,
  type HostDeterministicRunRequest,
} from "../../../src/world-evolution-host-backend.js";
import { type OpenWorldHostInput } from "../../../src/world-evolution-backend/index.js";

const fixturePath = resolvePath(process.cwd(), "fixtures/world-evolution-open-worldbuilder/openworld-host-input.sample.json");
const hostInput = JSON.parse(readFileSync(fixturePath, "utf8")) as OpenWorldHostInput;

const baseRequest: HostDeterministicRunRequest = {
  input: hostInput,
  steps: 24,
  checkpointInterval: 8,
  includeDeltas: true,
  includeSummaryText: true,
  profileId: "full_world_evolution",
};

const baseline = runHostDeterministicEvolution(baseRequest);
const firstCheckpoint = baseline.run.checkpoints?.[0];

if (!firstCheckpoint) {
  throw new Error("Expected checkpoint at interval=8");
}

const resumed = resumeHostEvolutionSessionFromCheckpoint(
  {
    step: firstCheckpoint.step,
    tick: firstCheckpoint.tick,
    summary: `checkpoint@${firstCheckpoint.step}`,
    snapshot: firstCheckpoint.snapshot,
    metadata: {
      engineVersion: "facade-example",
      seed: hostInput.worldSeed,
      rulesetProfile: baseline.run.profile,
      step: firstCheckpoint.step,
      schemaVersion: firstCheckpoint.snapshot.schemaVersion,
    },
  },
  { steps: 16, includeDeltas: true, checkpointInterval: 8 },
  { includeDeltas: true, checkpointInterval: 8 },
);

const sandbox = createHostEvolutionBranch({
  input: hostInput,
  metadata: {
    name: "host-wrapper-what-if",
    description: "what-if branch from host backend wrapper example",
    seed: hostInput.worldSeed + 1,
    rulesetProfile: {
      ...baseline.run.profile,
      id: "full_world_evolution",
      name: "full_world_evolution.what_if_trade_off",
      description: "trade disabled for branch comparison",
      tradeEnabled: false,
    },
  },
});

const sandboxResult = runHostEvolutionBranch(sandbox, { steps: 24, includeDeltas: true });

console.log("Host backend wrapper demo");
console.log(`Fixture: ${fixturePath}`);
console.log(`Baseline final tick: ${baseline.run.finalSnapshot.tick}`);
console.log(`History events: ${baseline.history.length}`);
console.log(`Resumed final tick: ${resumed.result.finalSnapshot.tick}`);
console.log(`Sandbox branch final tick: ${sandboxResult.finalSnapshot.tick}`);
