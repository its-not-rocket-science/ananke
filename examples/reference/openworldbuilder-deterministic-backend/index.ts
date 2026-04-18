import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEvolutionBranch,
  diffBranchAgainstBase,
  runEvolutionOnBranch,
  type EvolutionBranch,
} from "../../../src/world-evolution.js";
import {
  type MetadataBuckets,
  mapOpenWorldHostToEvolutionInput,
  mergeWorldEvolutionProfileWithOverrides,
  resolveWorldEvolutionProfile,
  toAnankeEvolutionStateFromOpenWorld,
  type OpenWorldHostInput,
  type WorldEvolutionRulesetProfile,
} from "../../../src/world-evolution-backend/index.js";
import { hashString } from "../../../src/sim/seeds.js";

interface GeneratedWorldFixture {
  schemaVersion: string;
  generator: {
    tool: string;
    version: string;
    runId: string;
  };
  world: {
    seed: number;
    tick?: number;
    name?: string;
    regions: Array<{
      id: string;
      name: string;
      ownerFactionId?: string;
      climateTag?: string;
      population?: number;
      tileCount?: number;
      metadata?: MetadataBuckets;
    }>;
    settlements: Array<{
      id: string;
      name: string;
      regionId: string;
      factionId?: string;
      population?: number;
      metadata?: MetadataBuckets;
    }>;
    factions: OpenWorldHostInput["factions"];
    resources?: Array<{
      id: string;
      resourceType: string;
      regionId?: string;
      settlementId?: string;
      factionId?: string;
      stock?: number;
      metadata?: MetadataBuckets;
    }>;
    tradeLinks?: OpenWorldHostInput["tradeLinks"];
    environment?: OpenWorldHostInput["environment"];
    lore?: OpenWorldHostInput["lore"];
    metadata?: OpenWorldHostInput["metadata"];
  };
}

interface HostDashboardPayload {
  runId: string;
  branch: string;
  summary: {
    finalTick: number;
    totalPopulation: number;
    totalTreasury_cu: number;
    avgStability_Q: number;
    avgMorale_Q: number;
    activeWars: number;
    activeTreaties: number;
    viableTradeRoutes: number;
    activeEpidemics: number;
    activeClimateEvents: number;
    migrationsTotalPopulation: number;
  };
}

const STEPS = 720;
const CHECKPOINT_INTERVAL = 180;

const fixturePath = resolvePath(process.cwd(), "fixtures/world-evolution-open-worldbuilder/openworldbuilder-generated-world.fixture.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as GeneratedWorldFixture;

const hostInput = adaptGeneratedWorldToHostInput(fixture);
const mapped = mapOpenWorldHostToEvolutionInput(hostInput);
const initialState = toAnankeEvolutionStateFromOpenWorld(hostInput);

const baselineRuleset = resolveWorldEvolutionProfile("full_world_evolution");
const alteredRuleset = mergeWorldEvolutionProfileWithOverrides("full_world_evolution", {
  name: "Trade Shock What-If",
  description: "What-if branch with trade disabled, weaker treaty reinforcement, and stronger epidemic pressure.",
  tradeEnabled: false,
  treatyStrengthBoost_Q: 0,
  epidemicHealthBuffer_Q: -80,
});

const baselineBranch = createBranch("baseline", initialState.snapshot, hostInput.worldSeed, baselineRuleset);
const alteredBranch = createBranch("trade-shock", initialState.snapshot, hostInput.worldSeed + 17, alteredRuleset);

const baselineRun = runEvolutionOnBranch(baselineBranch, {
  steps: STEPS,
  includeDeltas: true,
  checkpointInterval: CHECKPOINT_INTERVAL,
  includeCheckpointDiffs: true,
});

const alteredRun = runEvolutionOnBranch(alteredBranch, {
  steps: STEPS,
  includeDeltas: true,
  checkpointInterval: CHECKPOINT_INTERVAL,
  includeCheckpointDiffs: true,
});

const baselineDiffFromStart = diffBranchAgainstBase(baselineBranch);
const alteredDiffFromStart = diffBranchAgainstBase(alteredBranch);

const comparison = {
  worldSeed: hostInput.worldSeed,
  startTick: hostInput.tick ?? 0,
  baselineBranchId: baselineBranch.branchId,
  alteredBranchId: alteredBranch.branchId,
  baselineSnapshotHash: computeSnapshotHash(baselineRun.finalSnapshot),
  alteredSnapshotHash: computeSnapshotHash(alteredRun.finalSnapshot),
  diverged: computeSnapshotHash(baselineRun.finalSnapshot) !== computeSnapshotHash(alteredRun.finalSnapshot),
  metricDelta: {
    totalPopulation: alteredRun.metrics.totalPopulation - baselineRun.metrics.totalPopulation,
    totalTreasury_cu: alteredRun.metrics.totalTreasury_cu - baselineRun.metrics.totalTreasury_cu,
    avgStability_Q: alteredRun.metrics.avgStability_Q - baselineRun.metrics.avgStability_Q,
    avgMorale_Q: alteredRun.metrics.avgMorale_Q - baselineRun.metrics.avgMorale_Q,
    activeWars: alteredRun.metrics.activeWars - baselineRun.metrics.activeWars,
    viableTradeRoutes: alteredRun.metrics.viableTradeRoutes - baselineRun.metrics.viableTradeRoutes,
    activeClimateEvents: alteredRun.metrics.activeClimateEvents - baselineRun.metrics.activeClimateEvents,
  },
  polityDeltaFromStart: {
    baseline: baselineDiffFromStart.polityDeltas,
    altered: alteredDiffFromStart.polityDeltas,
  },
  timelineDelta: {
    baselineTradeEvents: baselineRun.timeline.reduce((sum, event) => sum + event.tradeCount, 0),
    alteredTradeEvents: alteredRun.timeline.reduce((sum, event) => sum + event.tradeCount, 0),
    baselineMigrations: baselineRun.timeline.reduce((sum, event) => sum + event.metrics.migrationsTotalPopulation, 0),
    alteredMigrations: alteredRun.timeline.reduce((sum, event) => sum + event.metrics.migrationsTotalPopulation, 0),
  },
};

const hostPayload = {
  fixture: {
    schemaVersion: fixture.schemaVersion,
    generator: fixture.generator,
    worldName: fixture.world.metadata?.descriptive?.worldName ?? fixture.world.metadata?.descriptive?.hostWorldId ?? "unknown",
  },
  adapter: {
    schemaVersion: mapped.context.schemaVersion,
    worldEvolutionSchemaVersion: mapped.input.schemaVersion,
    factionsMappedToPolities: mapped.context.factionByPolityId,
    passthroughKeys: Object.keys(mapped.context.metadataPassthrough),
  },
  runs: {
    baseline: toRunPayload("baseline", baselineRun),
    altered: toRunPayload("trade-shock", alteredRun),
  },
  comparison,
};

const outputDir = fileURLToPath(new URL("./artifacts", import.meta.url));
mkdirSync(outputDir, { recursive: true });
writeJson(`${outputDir}/baseline.final-world-state.json`, baselineRun.finalSnapshot);
writeJson(`${outputDir}/baseline.timeline.json`, baselineRun.timeline);
writeJson(`${outputDir}/baseline.metrics-dashboard.json`, toDashboardPayload(fixture.generator.runId, "baseline", baselineRun.finalSnapshot.tick, baselineRun.metrics));
writeJson(`${outputDir}/baseline.checkpoint-metadata.json`, baselineRun.checkpoints?.map((checkpoint) => checkpoint.metadata) ?? []);

writeJson(`${outputDir}/altered.final-world-state.json`, alteredRun.finalSnapshot);
writeJson(`${outputDir}/altered.timeline.json`, alteredRun.timeline);
writeJson(`${outputDir}/altered.metrics-dashboard.json`, toDashboardPayload(fixture.generator.runId, "trade-shock", alteredRun.finalSnapshot.tick, alteredRun.metrics));
writeJson(`${outputDir}/altered.checkpoint-metadata.json`, alteredRun.checkpoints?.map((checkpoint) => checkpoint.metadata) ?? []);

writeJson(`${outputDir}/branch-divergence-comparison.json`, comparison);
writeJson(`${outputDir}/host-platform-payload.json`, hostPayload);

console.log("OpenWorldBuilder -> Ananke deterministic backend reference demo");
console.log(`Fixture: ${fixturePath}`);
console.log(`Mapped input schema: ${mapped.input.schemaVersion}`);
console.log(`Baseline final tick: ${baselineRun.finalSnapshot.tick} population=${baselineRun.metrics.totalPopulation} treasury=${baselineRun.metrics.totalTreasury_cu}`);
console.log(`Altered final tick: ${alteredRun.finalSnapshot.tick} population=${alteredRun.metrics.totalPopulation} treasury=${alteredRun.metrics.totalTreasury_cu}`);
console.log(`Branch divergence: ${comparison.diverged} (baseline=${comparison.baselineSnapshotHash} altered=${comparison.alteredSnapshotHash})`);
console.log(`Artifacts written to: ${outputDir}`);

function createBranch(
  name: string,
  snapshot: typeof initialState.snapshot,
  seed: number,
  rulesetProfile: WorldEvolutionRulesetProfile,
): EvolutionBranch {
  return createEvolutionBranch({
    baseSnapshot: snapshot,
    metadata: {
      name,
      description: `${name} branch from generated world fixture`,
      seed,
      rulesetProfile,
      createdAtStep: 0,
    },
  });
}

function adaptGeneratedWorldToHostInput(fixtureInput: GeneratedWorldFixture): OpenWorldHostInput {
  const factionToPolity = new Map(fixtureInput.world.factions.map((faction) => [faction.id, faction.polityId ?? `p.${faction.id}`]));
  return {
    schemaVersion: "ananke.open-world-host-adapter.v1",
    worldSeed: Math.floor(fixtureInput.world.seed),
    tick: Math.max(0, Math.floor(fixtureInput.world.tick ?? 0)),
    regions: fixtureInput.world.regions.map((region) => {
      const polityId = region.ownerFactionId == null ? undefined : factionToPolity.get(region.ownerFactionId);
      return {
        id: region.id,
        name: region.name,
        ...(region.climateTag != null ? { climateTag: region.climateTag } : {}),
        ...(region.population != null ? { population: region.population } : {}),
        ...(region.tileCount != null ? { tileCount: region.tileCount } : {}),
        ...(polityId != null ? { polityId } : {}),
        ...(region.metadata != null ? { metadata: region.metadata } : {}),
      };
    }),
    settlements: fixtureInput.world.settlements.map((settlement) => {
      const polityId = settlement.factionId == null ? undefined : factionToPolity.get(settlement.factionId);
      return {
        id: settlement.id,
        name: settlement.name,
        regionId: settlement.regionId,
        ...(polityId != null ? { polityId } : {}),
        ...(settlement.population != null ? { population: settlement.population } : {}),
        ...(settlement.metadata != null ? { metadata: settlement.metadata } : {}),
      };
    }),
    factions: fixtureInput.world.factions,
    ...(fixtureInput.world.resources != null ? { resources: fixtureInput.world.resources } : {}),
    ...(fixtureInput.world.tradeLinks != null ? { tradeLinks: fixtureInput.world.tradeLinks } : {}),
    ...(fixtureInput.world.environment != null ? { environment: fixtureInput.world.environment } : {}),
    ...(fixtureInput.world.lore != null ? { lore: fixtureInput.world.lore } : {}),
    ...(fixtureInput.world.metadata != null ? { metadata: fixtureInput.world.metadata } : {}),
  };
}

function toDashboardPayload(runId: string, branch: string, finalTick: number, metrics: typeof baselineRun.metrics): HostDashboardPayload {
  return {
    runId,
    branch,
    summary: {
      finalTick,
      totalPopulation: metrics.totalPopulation,
      totalTreasury_cu: metrics.totalTreasury_cu,
      avgStability_Q: metrics.avgStability_Q,
      avgMorale_Q: metrics.avgMorale_Q,
      activeWars: metrics.activeWars,
      activeTreaties: metrics.activeTreaties,
      viableTradeRoutes: metrics.viableTradeRoutes,
      activeEpidemics: metrics.activeEpidemics,
      activeClimateEvents: metrics.activeClimateEvents,
      migrationsTotalPopulation: metrics.migrationsTotalPopulation,
    },
  };
}

function toRunPayload(branch: string, run: typeof baselineRun) {
  return {
    branch,
    request: run.request,
    ruleset: run.ruleset,
    finalTick: run.finalSnapshot.tick,
    finalWorldState: run.finalSnapshot,
    timeline: run.timeline,
    metricsDashboard: toDashboardPayload(fixture.generator.runId, branch, run.finalSnapshot.tick, run.metrics),
    checkpointMetadata: run.checkpoints?.map((checkpoint) => checkpoint.metadata) ?? [],
  };
}

function computeSnapshotHash(snapshot: unknown): string {
  return hashString(JSON.stringify(snapshot)).toString(16);
}

function writeJson(path: string, payload: unknown): void {
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
