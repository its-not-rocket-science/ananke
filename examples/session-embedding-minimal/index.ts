import { q } from "@its-not-rocket-science/ananke";
import {
  createSession,
  deserializeSession,
  forkSession,
  getSessionSummary,
  runSession,
  serializeSession,
  type SessionHandle,
} from "@its-not-rocket-science/ananke/session";
import { pathToFileURL } from "node:url";

export interface SessionEmbeddingSummary {
  tactical: ReturnType<typeof getSessionSummary>;
  tacticalRestored: ReturnType<typeof getSessionSummary>;
  worldEvolution: ReturnType<typeof getSessionSummary>;
  worldEvolutionFork: ReturnType<typeof getSessionSummary>;
}

function printSummary(label: string, session: SessionHandle, log: (line: string) => void): void {
  log(`${label}: ${JSON.stringify(getSessionSummary(session), null, 2)}`);
}

export function runMinimalSessionEmbeddingDemo(log: (line: string) => void = (line) => console.log(line)): SessionEmbeddingSummary {
  // 1) create tactical session
  const tactical = createSession({
    mode: "tactical",
    worldSeed: 7,
    entities: [
      { id: 1, teamId: 1, seed: 101, archetype: "HUMAN_BASE", weaponId: "wpn_longsword" },
      { id: 2, teamId: 2, seed: 202, archetype: "HUMAN_BASE", weaponId: "wpn_club" },
    ],
    enableReplay: true,
    id: "tactical-main",
  });

  // 2) run a few steps
  runSession(tactical, {
    steps: 3,
    tacticalContext: { tractionCoeff: q(0.9) },
  });
  printSummary("tactical after 3 steps", tactical, log);

  // 3) serialize / deserialize
  const tacticalJson = serializeSession(tactical);
  const tacticalRestored = deserializeSession(tacticalJson);
  printSummary("tactical restored", tacticalRestored, log);

  // 4) create a world_evolution session
  const worldEvolution = createSession({
    mode: "world_evolution",
    id: "world-evolution-main",
    canonicalSnapshot: {
      schemaVersion: "ananke.world-evolution-backend.v1",
      worldSeed: 123,
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
    },
    rulesetId: "full_world_evolution",
  });

  // 5) run it
  runSession(worldEvolution, { steps: 5 });
  printSummary("world_evolution after 5 steps", worldEvolution, log);

  // 6) fork it
  const worldEvolutionFork = forkSession(worldEvolution, { id: "world-evolution-fork", label: "what-if" });
  runSession(worldEvolutionFork, { steps: 2 });

  // 7) print summaries
  printSummary("world_evolution main", worldEvolution, log);
  printSummary("world_evolution fork", worldEvolutionFork, log);

  return {
    tactical: getSessionSummary(tactical),
    tacticalRestored: getSessionSummary(tacticalRestored),
    worldEvolution: getSessionSummary(worldEvolution),
    worldEvolutionFork: getSessionSummary(worldEvolutionFork),
  };
}

const launchedAsScript =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (launchedAsScript) {
  runMinimalSessionEmbeddingDemo();
}
