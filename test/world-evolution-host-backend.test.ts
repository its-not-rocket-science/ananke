import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createHostEvolutionBranch,
  createHostEvolutionSession,
  resumeHostEvolutionSessionFromCheckpoint,
  runHostDeterministicEvolution,
  runHostEvolutionBranch,
  runHostEvolutionSession,
} from "../src/world-evolution-host-backend.js";
import type { OpenWorldHostInput } from "../src/world-evolution-backend/index.js";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/world-evolution-open-worldbuilder/", import.meta.url));

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}${name}`, "utf8")) as T;
}

describe("world-evolution-host-backend facade", () => {
  it("runs deterministic host input evolution with stable history projection", () => {
    const input = readJson<OpenWorldHostInput>("openworld-host-input.sample.json");

    const first = runHostDeterministicEvolution({
      input,
      steps: 18,
      checkpointInterval: 6,
      includeDeltas: true,
      includeSummaryText: true,
    });

    const second = runHostDeterministicEvolution({
      input,
      steps: 18,
      checkpointInterval: 6,
      includeDeltas: true,
      includeSummaryText: true,
    });

    expect(first.run).toEqual(second.run);
    expect(first.history).toEqual(second.history);
    expect(first.run.timeline).toHaveLength(18);
    expect(first.run.checkpoints).toHaveLength(3);
    expect(first.history.length).toBeGreaterThan(0);
  });

  it("resumes from checkpoint and matches uninterrupted session evolution", () => {
    const input = readJson<OpenWorldHostInput>("openworld-host-input.sample.json");

    const uninterruptedSession = createHostEvolutionSession({ input, rulesetId: "full_world_evolution" });
    const uninterrupted = runHostEvolutionSession(uninterruptedSession, {
      steps: 30,
      checkpointInterval: 10,
      includeDeltas: true,
    });

    const firstLegSession = createHostEvolutionSession({ input, rulesetId: "full_world_evolution" });
    const firstLeg = runHostEvolutionSession(firstLegSession, {
      steps: 10,
      checkpointInterval: 10,
      includeDeltas: true,
      includeCheckpointDiffs: true,
    });

    const checkpoint = firstLeg.result.checkpoints?.[0];
    if (!checkpoint) throw new Error("expected first checkpoint");

    const resumed = resumeHostEvolutionSessionFromCheckpoint(checkpoint, {
      steps: 20,
      checkpointInterval: 10,
      includeDeltas: true,
      includeCheckpointDiffs: true,
    }, {
      checkpointInterval: 10,
      includeDeltas: true,
    });

    expect(resumed.result.finalSnapshot).toEqual(uninterrupted.result.finalSnapshot);
    expect(resumed.result.timeline.map(({ step: _step, ...rest }) => rest))
      .toEqual(uninterrupted.result.timeline.slice(10).map(({ step: _step, ...rest }) => rest));
  });

  it("supports deterministic branch what-if runs isolated from canonical host state", () => {
    const input = readJson<OpenWorldHostInput>("openworld-host-input.sample.json");

    const baselineBranch = createHostEvolutionBranch({
      input,
      metadata: {
        name: "baseline",
        seed: input.worldSeed,
        rulesetId: "full_world_evolution",
      },
    });

    const whatIfBranch = createHostEvolutionBranch({
      input,
      metadata: {
        name: "what-if-trade-off",
        seed: input.worldSeed,
        rulesetProfile: {
          ...baselineBranch.branchMetadata.rulesetProfile,
          id: "full_world_evolution",
          name: "full_world_evolution.trade_disabled",
          description: "branch with no trade",
          tradeEnabled: false,
        },
      },
    });

    const baseline = runHostEvolutionBranch(baselineBranch, { steps: 16, includeDeltas: true });
    const whatIf = runHostEvolutionBranch(whatIfBranch, { steps: 16, includeDeltas: true });

    expect(baseline.finalSnapshot).not.toEqual(whatIf.finalSnapshot);

    const rerun = runHostEvolutionBranch(createHostEvolutionBranch({
      input,
      metadata: {
        name: "baseline-rerun",
        seed: input.worldSeed,
        rulesetId: "full_world_evolution",
      },
    }), { steps: 16, includeDeltas: true });

    expect(rerun.finalSnapshot).toEqual(baseline.finalSnapshot);
  });
});
