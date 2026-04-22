import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";
import {
  createSession,
  deserializeSession,
  forkSession,
  getSessionSummary,
  loadSessionPack,
  runSession,
  serializeSession,
  stepSession,
} from "../src/session.js";
import { clearPackRegistry, type AnankePackManifest } from "../src/content-pack.js";
import { clearCatalog } from "../src/catalog.js";
import { clearWorldExtensions } from "../src/world-factory.js";
import { WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION } from "../src/world-evolution-backend/index.js";

function createCanonicalSnapshot(seed: number) {
  return {
    schemaVersion: WORLD_EVOLUTION_BACKEND_SCHEMA_VERSION,
    worldSeed: seed,
    tick: 0,
    polities: [],
    pairs: [],
    activeWars: [],
    treaties: [],
    tradeRoutes: [],
    governanceStates: [],
    governanceLawRegistry: [],
    epidemics: [],
    diseases: [],
    climateByPolity: [],
  } as const;
}

function createScenarioJson(seed = 17) {
  return {
    id: `session-scenario-${seed}`,
    seed,
    maxTicks: 30,
    entities: [
      { id: 1, teamId: 1, archetype: "KNIGHT_INFANTRY", weapon: "wpn_longsword" },
      { id: 2, teamId: 2, archetype: "KNIGHT_INFANTRY", weapon: "wpn_longsword" },
    ],
  };
}

function createPackManifest(suffix: string): AnankePackManifest {
  return {
    name: `session-pack-${suffix}`,
    version: "1.0.0",
    scenarios: [createScenarioJson(41)],
  };
}

afterEach(() => {
  clearPackRegistry();
  clearCatalog();
  clearWorldExtensions();
});

describe("session facade tactical mode", () => {
  it("creates a tactical session from explicit WorldState", () => {
    const basis = createSession({
      mode: "tactical",
      worldSeed: 99,
      entities: [{ id: 1, teamId: 1, archetype: "KNIGHT_INFANTRY", seed: 11, weaponId: "wpn_longsword" }],
    });

    const session = createSession({ mode: "tactical", worldState: basis.state.world, enableReplay: true });
    expect(session.mode).toBe("tactical");
    expect(session.state.world).toEqual(basis.state.world);
    expect(session.state.world).not.toBe(basis.state.world);
    expect(getSessionSummary(session)).toEqual({
      mode: "tactical",
      id: session.id,
      tick: basis.state.world.tick,
      entityCount: 1,
      hasReplay: true,
    });
  });

  it("creates a tactical session from scenario JSON", () => {
    const session = createSession({ mode: "tactical", scenarioJson: createScenarioJson(21) });

    expect(session.mode).toBe("tactical");
    expect(session.state.world.seed).toBe(21);
    expect(session.state.world.entities).toHaveLength(2);
  });

  it("advances tactical sessions deterministically with repeated runSession steps", () => {
    const session = createSession({ mode: "tactical", scenarioJson: createScenarioJson(22), enableReplay: true });
    const result = runSession(session, { steps: 3, tacticalCommandFrames: [[], [], []] });

    expect(result.mode).toBe("tactical");
    expect(result.executedSteps).toBe(3);
    expect(result.summary).toEqual(getSessionSummary(session));
    expect(session.state.world.tick).toBe(3);
    expect(session.state.replay?.frames).toHaveLength(3);
  });

  it("stepSession is one-step sugar for tactical sessions", () => {
    const a = createSession({ mode: "tactical", scenarioJson: createScenarioJson(23) });
    const b = createSession({ mode: "tactical", scenarioJson: createScenarioJson(23) });

    const viaStep = stepSession(a);
    const viaRun = runSession(b, { steps: 1 });

    expect(viaStep.executedSteps).toBe(1);
    expect(viaStep).toEqual(viaRun);
    expect(a.state.world).toEqual(b.state.world);
  });

  it("round-trips tactical sessions through serialize/deserialize", () => {
    const session = createSession({ mode: "tactical", scenarioJson: createScenarioJson(24), enableReplay: true });
    runSession(session, { steps: 2, tacticalCommandFrames: [[], []] });

    const restored = deserializeSession(serializeSession(session));

    expect(restored).toEqual(session);
    expect(restored).not.toBe(session);
  });
});

describe("session facade world_evolution mode", () => {
  it("creates world_evolution sessions", () => {
    const session = createSession({
      mode: "world_evolution",
      canonicalSnapshot: createCanonicalSnapshot(301),
      rulesetId: "full_world_evolution",
      id: "world-evo-session",
    });

    expect(session.mode).toBe("world_evolution");
    expect(session.id).toBe("world-evo-session");
    expect(session.state.evolution.seed).toBe(301);
  });

  it("runs world_evolution sessions through runSession", () => {
    const session = createSession({ mode: "world_evolution", canonicalSnapshot: createCanonicalSnapshot(302) });

    const result = runSession(session, { steps: 4 });
    expect(result.mode).toBe("world_evolution");
    expect(result.executedSteps).toBe(4);
    expect(result.summary).toEqual(getSessionSummary(session));
    expect(result.summary.mode).toBe("world_evolution");
    expect(result.summary.summary.totalSteps).toBe(4);
  });

  it("forks world_evolution sessions as independent branches", () => {
    const base = createSession({ mode: "world_evolution", canonicalSnapshot: createCanonicalSnapshot(303) });
    runSession(base, { steps: 2 });

    const forked = forkSession(base, { id: "forked-session", label: "Forked Session", seed: 404 });
    expect(forked.mode).toBe("world_evolution");
    expect(forked.id).toBe("forked-session");
    expect(forked.state.evolution.seed).toBe(404);
    expect(forked.state.evolution.state.totalSteps).toBe(0);

    runSession(forked, { steps: 1 });
    expect(base.state.evolution.state.totalSteps).toBe(2);
    expect(forked.state.evolution.state.totalSteps).toBe(1);
  });

  it("round-trips world_evolution sessions through serialize/deserialize", () => {
    const session = createSession({ mode: "world_evolution", canonicalSnapshot: createCanonicalSnapshot(304) });
    runSession(session, { steps: 3 });

    const restored = deserializeSession(serializeSession(session));

    expect(restored).not.toBe(session);
    expect(getSessionSummary(restored)).toMatchObject({
      mode: "world_evolution",
      summary: {
        totalSteps: 3,
        currentSnapshot: getSessionSummary(session).summary.currentSnapshot,
      },
    });

    runSession(session, { steps: 2 });
    runSession(restored, { steps: 2 });
    expect(getSessionSummary(restored)).toMatchObject({
      mode: "world_evolution",
      summary: {
        totalSteps: 5,
        currentSnapshot: getSessionSummary(session).summary.currentSnapshot,
      },
    });
  });
});

describe("session facade pack loading and summary metadata", () => {
  it("loads session packs and instantiates scenarios on success", () => {
    const manifest = createPackManifest("ok");
    const result = loadSessionPack({
      manifest,
      scenarioId: manifest.scenarios?.[0]?.id,
      instantiateScenario: true,
    });

    expect(result.validationErrors).toEqual([]);
    expect(result.pack.errors).toEqual([]);
    expect(result.pack.packId).toBe(`${manifest.name}@${manifest.version}`);
    expect(result.scenarioJson).toEqual(manifest.scenarios?.[0]);
    expect(result.worldState?.entities).toHaveLength(2);
  });

  it("returns validation errors for invalid pack manifests", () => {
    const invalid = { name: "", version: "1.0.0" } as unknown as AnankePackManifest;
    const result = loadSessionPack({ manifest: invalid });

    expect(result.validationErrors.length).toBeGreaterThan(0);
    expect(result.pack.errors.length).toBeGreaterThan(0);
  });

  it("getSessionSummary has stable shape and deterministic metadata", () => {
    const tacticalA = createSession({ mode: "tactical", scenarioJson: createScenarioJson(55) });
    const tacticalB = createSession({ mode: "tactical", scenarioJson: createScenarioJson(55) });

    runSession(tacticalA, { steps: 2 });
    runSession(tacticalB, { steps: 2 });

    expect(getSessionSummary(tacticalA)).toEqual(getSessionSummary(tacticalB));
    expect(getSessionSummary(tacticalA)).toMatchObject({
      mode: "tactical",
      tick: 2,
      entityCount: 2,
      hasReplay: false,
    });

    const evoA = createSession({ mode: "world_evolution", canonicalSnapshot: createCanonicalSnapshot(909) });
    const evoB = createSession({ mode: "world_evolution", canonicalSnapshot: createCanonicalSnapshot(909) });
    runSession(evoA, { steps: 5 });
    runSession(evoB, { steps: 5 });

    expect(getSessionSummary(evoA)).toEqual(getSessionSummary(evoB));
    expect(getSessionSummary(evoA)).toMatchObject({
      mode: "world_evolution",
      summary: { totalSteps: 5, seed: 909 },
    });
  });

  it("exposes session facade from the public package subpath", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      exports?: Record<string, { import?: string; types?: string }>;
    };
    const sessionSubpath = packageJson.exports?.["./session"];

    expect(sessionSubpath).toBeDefined();
    expect(sessionSubpath?.import).toBe("./dist/src/session.js");
    expect(sessionSubpath?.types).toBe("./dist/src/session.d.ts");
  });
});
