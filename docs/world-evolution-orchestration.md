# World Evolution Orchestration API (Host-facing)

## Purpose

The orchestration API adds a session-oriented host surface on top of existing deterministic world subsystems. It is designed for external tools (for example OpenWorldBuilder) that need both:

- one-shot evolution runs
- stepwise evolution loops with checkpoints/timelines

It is additive and uses the existing world-evolution backend as the deterministic subsystem pipeline.

## Import path

```ts
import {
  createEvolutionSession,
  createEvolutionBranch,
  forkEvolutionBranch,
  runEvolutionOnBranch,
  diffBranchAgainstBase,
  runEvolution,
  stepEvolution,
  getEvolutionSummary,
  resumeEvolutionSessionFromCheckpoint,
  serializeEvolutionCheckpoint,
  deserializeEvolutionCheckpoint,
  serializeEvolutionIntermediateState,
  serializeEvolutionFinalState,
  buildEvolutionCheckpointDiffs,
  serializeEvolutionResult,
  deserializeEvolutionResult,
} from "@its-not-rocket-science/ananke/world-evolution";
```

## Determinism contract

For a fixed:

- canonical input snapshot
- ruleset
- seed
- step count
- engine version (`ananke.world-evolution-backend.v1`)

the API returns deterministic outputs.

## Canonical vs derived state

- `canonicalSnapshot` passed to `createEvolutionSession` is preserved as canonical input.
- mutable simulation progression happens on an internal clone.
- all returned snapshots/results are cloned host-safe copies.
- `createEvolutionBranch(...)` keeps a `baseSnapshotRef` immutable and writes all branch progression to `derivedState`.

## Canonical-vs-sandbox timelines for external platforms

The branching surface is built for host platforms (worldbuilding tools, procedural generators, editor sandboxes) that need “what-if” simulation while preserving canonical truth.

- Canonical world data stays untouched as the source of truth.
- Each sandbox branch stores:
  - `baseSnapshotRef` (immutable branch base checkpoint/snapshot/hash)
  - `derivedState` (mutable branch-local simulation state)
  - `branchMetadata`:
    - `name`
    - `description`
    - `seed`
    - `rulesetProfile`
    - `createdAtStep`
    - optional `parentBranchId`
- Multiple timelines can be created from the same canonical snapshot, each with independent seed/ruleset/step progression.

### Branch lifecycle

1. Start from canonical snapshot:

```ts
import { createEvolutionBranch } from "@its-not-rocket-science/ananke/world-evolution";
import type { WorldEvolutionSnapshot } from "@its-not-rocket-science/ananke/world-evolution-backend";

declare const canonicalSnapshot: WorldEvolutionSnapshot;

const branch = createEvolutionBranch({
  baseSnapshot: canonicalSnapshot,
  metadata: {
    name: "alt-history: no treaty",
    description: "stress-test a no-alliance variant",
    seed: 1337,
    rulesetId: "full_world_evolution",
  },
});
```

2. Run deterministic branch evolution:

```ts
import { createEvolutionBranch, runEvolutionOnBranch } from "@its-not-rocket-science/ananke/world-evolution";
import type { WorldEvolutionSnapshot } from "@its-not-rocket-science/ananke/world-evolution-backend";

declare const canonicalSnapshot: WorldEvolutionSnapshot;

const branch = createEvolutionBranch({
  baseSnapshot: canonicalSnapshot,
  metadata: { name: "alt-history: no treaty", seed: 1337, rulesetId: "full_world_evolution" },
});

runEvolutionOnBranch(branch, { steps: 120, includeDeltas: true });
```

3. Fork additional sandboxes from any branch point:

```ts
import { createEvolutionBranch, forkEvolutionBranch } from "@its-not-rocket-science/ananke/world-evolution";
import type { WorldEvolutionSnapshot } from "@its-not-rocket-science/ananke/world-evolution-backend";

declare const canonicalSnapshot: WorldEvolutionSnapshot;

const branch = createEvolutionBranch({
  baseSnapshot: canonicalSnapshot,
  metadata: { name: "alt-history: no treaty", seed: 1337, rulesetId: "full_world_evolution" },
});

const fork = forkEvolutionBranch(branch, {
  metadata: { name: "alt-history: hard winter", seed: 7331 },
});
```

4. Compute host-friendly canonical-vs-sandbox diffs:

```ts
import { createEvolutionBranch, diffBranchAgainstBase } from "@its-not-rocket-science/ananke/world-evolution";
import type { WorldEvolutionSnapshot } from "@its-not-rocket-science/ananke/world-evolution-backend";

declare const canonicalSnapshot: WorldEvolutionSnapshot;

const branch = createEvolutionBranch({
  baseSnapshot: canonicalSnapshot,
  metadata: { name: "alt-history: no treaty", seed: 1337, rulesetId: "full_world_evolution" },
});

const diff = diffBranchAgainstBase(branch);
// worldChanges + polityDeltas for dashboards/tools/review UIs
```

### Determinism and isolation guarantees

- Same base snapshot + same seed + same ruleset + same step inputs => same branch result.
- Branch state cannot mutate its `baseSnapshotRef`.
- Branch execution does not mutate canonical host state.
- Sibling branches remain isolated from each other.

## Explicit pipeline ordering

Each step uses the deterministic backend pipeline in this order:

1. polity day (trade/war baseline)
2. governance progression and tax effects
3. diplomacy treaty updates
4. trade route efficiency + trade application
5. migration resolution + flow application
6. climate event generation/aggregation/lifecycle
7. epidemic progression and death pressure

The ordering is fixed, iteration is sorted where needed, and no random host clock/source is used.

## Host integration flow

1. `createEvolutionSession(config)`
2. evolve either with:
   - `runEvolution(session, { steps })`, or
   - repeated `stepEvolution(session)`
3. call `getEvolutionSummary(session)` at any point
4. archive run artifacts via `serializeEvolutionResult(result)` / `deserializeEvolutionResult(json)`

## Checkpointing and resume for long-running jobs

- Set `checkpointInterval` in `createEvolutionSession` and/or `runEvolution`.
- Each checkpoint now includes deterministic metadata:
  - `engineVersion`
  - `seed`
  - `rulesetProfile`
  - `step`
  - backend `schemaVersion`
- Resume from a checkpoint with `resumeEvolutionSessionFromCheckpoint(checkpoint)`.
- Compatibility validation is enforced on deserialize/resume:
  - engine mismatch -> reject
  - backend schema mismatch -> reject
  - seed mismatch between metadata and snapshot -> reject

### 1000-step host pattern (background worker)

```ts
import { runEvolution, serializeEvolutionCheckpoint } from "@its-not-rocket-science/ananke/world-evolution";
import type { EvolutionSession } from "@its-not-rocket-science/ananke/world-evolution";

declare const session: EvolutionSession;
declare const hostStorage: { put(path: string, content: string): Promise<void> };
declare const jobId: string;

const result = runEvolution(session, {
  steps: 1000,
  checkpointInterval: 100,
  includeCheckpointDiffs: true, // optional
});

const cp = result.checkpoints?.at(-1);
if (cp) {
  await hostStorage.put(`jobs/${jobId}/checkpoint.json`, serializeEvolutionCheckpoint(cp));
}
```

On restart:

```ts
import {
  deserializeEvolutionCheckpoint,
  resumeEvolutionSessionFromCheckpoint,
  runEvolution,
} from "@its-not-rocket-science/ananke/world-evolution";

declare const hostStorage: { get(path: string): Promise<string> };
declare const jobId: string;
declare const remainingSteps: number;

const raw = await hostStorage.get(`jobs/${jobId}/checkpoint.json`);
const checkpoint = deserializeEvolutionCheckpoint(raw);
const resumed = resumeEvolutionSessionFromCheckpoint(checkpoint);
runEvolution(resumed, { steps: remainingSteps, checkpointInterval: 100 });
```

### User-saveable sandbox branches

For “save branch” UX in a sandbox/editor host:

1. Persist `serializeEvolutionIntermediateState(session)` as the branch point.
2. Resume branch sessions with `resumeEvolutionSessionFromCheckpoint(...)`.
3. Optionally compare branch progression via `buildEvolutionCheckpointDiffs(...)`.
4. Persist final branch states with `serializeEvolutionFinalState(...)`.

## Types

- `EvolutionSessionConfig`
- `EvolutionRequest`
- `EvolutionRuleset`
- `EvolutionRunResult`
- `EvolutionCheckpoint`
- `EvolutionCheckpointMetadata`
- `EvolutionCheckpointDiff`
- `EvolutionTimelineEvent`
- `EvolutionMetrics` (re-export of world metrics)
