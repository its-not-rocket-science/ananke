import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runOpenWorldBuilderReferenceDemo, type OpenWorldHostInput } from "../src/world-evolution-backend/index.js";

const FIXTURE_PATH = fileURLToPath(new URL("../fixtures/world-evolution-open-worldbuilder/generated-world-host-fixture.json", import.meta.url));

function loadFixture(): OpenWorldHostInput {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as OpenWorldHostInput;
}

describe("open-worldbuilder reference demo", () => {
  it("produces deterministic baseline run artifacts", () => {
    const fixture = loadFixture();

    const first = runOpenWorldBuilderReferenceDemo(
      fixture,
      { label: "baseline", steps: 360, checkpointInterval: 60, profileId: "full_world_evolution" },
      {
        label: "policy_shift",
        steps: 360,
        checkpointInterval: 60,
        profileId: "full_world_evolution",
        profileTweaks: { routeEfficiencyBoost_Q: 24, treatyStrengthBoost_Q: -10, epidemicHealthBuffer_Q: 30 },
      },
    );

    const second = runOpenWorldBuilderReferenceDemo(
      fixture,
      { label: "baseline", steps: 360, checkpointInterval: 60, profileId: "full_world_evolution" },
      {
        label: "policy_shift",
        steps: 360,
        checkpointInterval: 60,
        profileId: "full_world_evolution",
        profileTweaks: { routeEfficiencyBoost_Q: 24, treatyStrengthBoost_Q: -10, epidemicHealthBuffer_Q: 30 },
      },
    );

    expect(first.baseline.metricsDashboard).toEqual(second.baseline.metricsDashboard);
    expect(first.baseline.checkpointMetadata).toEqual(second.baseline.checkpointMetadata);
  });

  it("shows divergence between baseline and altered runs", () => {
    const fixture = loadFixture();

    const output = runOpenWorldBuilderReferenceDemo(
      fixture,
      { label: "baseline", steps: 540, checkpointInterval: 90, profileId: "full_world_evolution" },
      {
        label: "altered_policy_shock",
        steps: 540,
        checkpointInterval: 90,
        profileId: "full_world_evolution",
        profileTweaks: { routeEfficiencyBoost_Q: 22, treatyStrengthBoost_Q: -14, epidemicHealthBuffer_Q: 40 },
      },
    );

    expect(output.adapterSummary.integrationNote).toContain("deterministically");
    expect(output.baseline.timelineEvents.length).toBeGreaterThan(0);
    expect(output.altered.timelineEvents.length).toBeGreaterThan(0);

    const divergenceMagnitude = Math.abs(output.divergence.totalPopulationDelta)
      + Math.abs(output.divergence.totalTreasuryDelta_cu)
      + Math.abs(output.divergence.avgStabilityDelta_Q)
      + Math.abs(output.divergence.avgMoraleDelta_Q)
      + Math.abs(output.divergence.activeTreatiesDelta);

    expect(divergenceMagnitude).toBeGreaterThan(0);
    expect(output.divergence.strongestDivergenceSignals.length).toBeGreaterThan(0);
  });
});
