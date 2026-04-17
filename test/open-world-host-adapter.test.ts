import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runWorldEvolution } from "../src/world-evolution-backend/engine.js";
import {
  canonicalizeOpenWorldInput,
  mapOpenWorldHostToEvolutionInput,
  toAnankeEvolutionStateFromOpenWorld,
  type OpenWorldHostInput,
} from "../src/world-evolution-backend/open-world-host-adapter.js";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/world-evolution-open-worldbuilder/", import.meta.url));

function readJson<T>(name: string): T {
  const raw = readFileSync(`${FIXTURE_DIR}${name}`, "utf8");
  return JSON.parse(raw) as T;
}

describe("open-world host adapter", () => {
  it("canonicalizes host input deterministically", () => {
    const input = readJson<OpenWorldHostInput>("openworld-host-input.sample.json");
    const shuffled: OpenWorldHostInput = {
      ...input,
      regions: [...input.regions].reverse(),
      settlements: [...input.settlements].reverse(),
      factions: [...input.factions].reverse(),
      resources: [...(input.resources ?? [])].reverse(),
      tradeLinks: [...(input.tradeLinks ?? [])].reverse(),
    };

    expect(canonicalizeOpenWorldInput(shuffled)).toEqual(canonicalizeOpenWorldInput(input));
  });

  it("maps open-world payload into deterministic host evolution input with metadata passthrough", () => {
    const input = readJson<OpenWorldHostInput>("openworld-host-input.sample.json");
    const mapped = mapOpenWorldHostToEvolutionInput(input);

    expect(mapped.input.entities.find((entity) => entity.kind === "polity" && entity.id === "p.guild")).toMatchObject({
      name: "River Guild Confederacy",
      metadata: {
        simulation: { taxCapacityQ: 740 },
        descriptive: { banner: "azure-knot" },
        opaque: { internalHash: "g-194" },
      },
    });

    expect(mapped.input.hostMetadata).toMatchObject({
      openWorld: {
        lore: {
          summary: "The river cities and steppe riders balance trade with rivalry.",
        },
      },
    });

    const { snapshot } = toAnankeEvolutionStateFromOpenWorld(input);
    expect(snapshot.polities).toHaveLength(2);
    expect(snapshot.tradeRoutes).toHaveLength(1);
    expect(snapshot.treaties).toHaveLength(1);
  });

  it("matches committed sample timeline and metrics output", () => {
    const input = readJson<OpenWorldHostInput>("openworld-host-input.sample.json");
    const mapped = mapOpenWorldHostToEvolutionInput(input);

    const result = runWorldEvolution({
      snapshot: toAnankeEvolutionStateFromOpenWorld(input).snapshot,
      steps: 6,
      checkpointInterval: 3,
      includeDeltas: true,
    });

    const timelineSample = readJson("openworld-host-timeline.sample.json");
    const metricsSample = readJson("openworld-host-metrics.sample.json");
    const runSample = readJson("openworld-host-evolution-run.sample.json");

    expect(mapped.input.worldSeed).toBe(runSample.worldSeed);
    expect(result.timeline.map((event) => ({
      step: event.step,
      tick: event.tick,
      tradeCount: event.trade.length,
      warCount: event.wars.length,
      migrationCount: event.migrations.length,
      climateEventCount: event.climateEventIds.length,
      epidemicPopulationDelta: event.epidemicPopulationDelta,
    }))).toEqual(timelineSample);

    expect(result.metrics).toEqual(metricsSample);
  });
});
