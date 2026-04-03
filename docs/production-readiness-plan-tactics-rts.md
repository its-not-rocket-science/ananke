# 4-Week Production-Credibility Plan for Turn-Based Tactics + RTS

## Goal
Make Ananke credible to production game teams by proving:
1. deterministic simulation across Windows/macOS/Linux/browser runtimes,
2. repeatable performance under load,
3. robust save/load for long-running campaigns, and
4. practical observability for desync triage.

## Success Metric (End of Week 4)
A developer can:
- clone the repo,
- run `npm run benchmark`,
- observe **>1000 ticks/sec at 500 entities** on a documented baseline machine,
- integrate save/load in **<=30 minutes** using a typed API and example.

---

## Week 1 — Determinism Test Harness

### Outcomes
- Introduce property-based determinism tests that execute 10,000+ random command sequences.
- Run determinism tests in CI on Windows, Ubuntu, and macOS.
- Assert bitwise equality on snapshot hashes with seed fuzzing and reproducibility metadata.

### Deliverables
- `test/determinism/property.spec.ts`
- GitHub Actions CI matrix update (`.github/workflows/ci.yml` or equivalent)

### Work Breakdown
1. **Build deterministic command generator**
   - Use `fast-check` arbitraries for commands used in tactics/RTS loops:
     - move, attack, gather, ability cast, formation toggle, build order.
   - Constrain command generation so each command is semantically valid for generated world state.

2. **Replay runner and hash strategy**
   - Execute each command sequence twice in-process and once in a second worker/runtime.
   - Hash canonical world snapshot bytes every N ticks (e.g., every 8 ticks).
   - Fail immediately on first mismatch with a compact divergence report.

3. **Cross-platform CI matrix**
   - `ubuntu-latest`, `windows-latest`, `macos-latest`.
   - Upload mismatch artifacts: seed, command log, pre/post snapshots, hash timeline.

4. **Browser determinism lane (headless)**
   - Run same seed corpus in browser runtime (Playwright + Chromium).
   - Compare canonical hash stream against Node reference run.

### Suggested test skeleton
```ts
import fc from 'fast-check';
import { createWorld, applyCommand, exportCanonicalBytes } from '../helpers';

describe('determinism properties', () => {
  it('is bitwise deterministic across replay', async () => {
    await fc.assert(
      fc.asyncProperty(commandSequenceArb, fc.integer(), async (commands, seed) => {
        const a = createWorld(seed);
        const b = createWorld(seed);

        for (const cmd of commands) {
          applyCommand(a, cmd);
          applyCommand(b, cmd);
        }

        const hashA = xxhash64(exportCanonicalBytes(a));
        const hashB = xxhash64(exportCanonicalBytes(b));
        expect(hashA).toBe(hashB);
      }),
      { numRuns: 10_000, seed: Date.now() & 0x7fffffff }
    );
  });
});
```

### Skeptical-engineer-grade failure output
```text
DeterminismMismatchError: hash divergence at tick=184
seed=192847123
platformA=windows-latest node=22.11.0 hash=0x8ac291f5f498f1c2
platformB=ubuntu-latest node=22.11.0 hash=0x8ac291f5f498f1bf
entityDiff: [id=441 hp:43->42, id=992 pos:(31,12)->(32,12)]
commandIndex=733 command={type:"Attack", actor:441, target:992}
repro: npm run test:determinism -- --seed 192847123 --case 733
```

### Exit Criteria
- 10,000-run property test in CI passes on all OS lanes.
- Browser lane passes deterministic hash equivalence against Node lane.
- Failure reports provide seed + command index + direct repro command.

---

## Week 2 — Benchmark Suite & Dashboard

### Outcomes
- Add benchmark scenarios for empty world and 100/500/1000 entities.
- Capture ticks/sec, memory footprint, and determinism-check overhead.
- Publish CI-generated benchmark JSON and GitHub Pages dashboard.

### Deliverables
- `benchmarks/results.json`
- `docs/performance-dashboard.md`

### Work Breakdown
1. **Benchmark harness standardization**
   - Fixed tick budget (e.g., 20,000 warm tick + 50,000 measured tick).
   - Fixed seed set (e.g., 10 seeds) to reduce variance.
   - Controlled process settings (`NODE_ENV=production`, explicit V8 flags where needed).

2. **Scenario definitions**
   - `empty-world`
   - `battle-100`
   - `battle-500`
   - `battle-1000`

3. **Metrics collection**
   - `ticksPerSecond` median/p95 across seeds.
   - `rssMb`, `heapUsedMb`, optional GC pause summaries.
   - `determinismOverheadPct` comparing hashing-enabled vs hashing-disabled runs.

4. **Dashboard generation**
   - CI writes versioned `benchmarks/results.json` artifact.
   - GitHub Pages renders historical trend table + sparkline for each scenario.
   - Add pass/fail guardrails (e.g., 500 entities must stay above threshold).

### Example benchmark result schema
```json
{
  "commit": "abc1234",
  "timestamp": "2026-04-03T12:00:00Z",
  "runtime": { "node": "22.11.0", "os": "ubuntu-latest" },
  "scenarios": [
    {
      "name": "battle-500",
      "ticksPerSecond": { "median": 1287, "p95": 1211 },
      "memory": { "rssMb": 212, "heapUsedMb": 148 },
      "determinismOverheadPct": 6.4
    }
  ]
}
```

### Skeptical-engineer-grade failure output
```text
BenchmarkRegressionError: scenario=battle-500
baseline median=1314 tps, current median=987 tps, drop=-24.9%
threshold=-10.0% exceeded
top hotpath delta:
  SimulateProjectileStep +18.2ms (per 1000 ticks)
  ResolveFormationCollisions +9.6ms (per 1000 ticks)
repro: npm run benchmark -- --scenario battle-500 --seed 4441 --profile
```

### Exit Criteria
- `npm run benchmark` produces deterministic JSON output shape.
- Dashboard auto-publishes from CI and highlights regressions.
- 500-entity median exceeds 1000 ticks/sec on reference machine.

---

## Week 3 — World Serialization (Save/Load)

### Outcomes
- Implement binary snapshot export/import with versioning and checksum.
- Support crash recovery and periodic autosaves.
- Ensure snapshot round-trip determinism and compatibility checks.

### Deliverables
- `src/serialization/world-snapshot.ts`
- `examples/save-load-campaign.ts`

### Work Breakdown
1. **Snapshot format design**
   - Header:
     - magic bytes (`ANKE`)
     - format version (`u16`)
     - engine version hash (`u32`)
     - payload length (`u32`)
     - checksum (`u64`, xxhash64)
   - Payload: canonical, ordered entity/component encoding.

2. **Core API**
   - `exportWorldState(world): Uint8Array`
   - `importWorldState(snapshot): WorldState`
   - Throw typed errors on malformed headers, checksum mismatch, unsupported version.

3. **Round-trip + determinism tests**
   - Export at tick T, import, continue simulation, compare hash stream to uninterrupted run.
   - Test across randomized world topologies and command queues.

4. **Crash recovery demo**
   - Example script saving every 100 ticks and resuming from latest snapshot.
   - Demonstrate rolling save strategy (`slot-0..slot-2`) to avoid corruption risk.

### Example API usage
```ts
if (world.tick % 100 === 0) {
  const snapshot = exportWorldState(world);
  fs.writeFileSync(`./saves/campaign-${world.tick}.ank`, snapshot);
}

const bytes = fs.readFileSync('./saves/campaign-1200.ank');
const restored = importWorldState(bytes);
runSimulation(restored, 600);
```

### Skeptical-engineer-grade errors
```text
SnapshotVersionError: unsupported snapshot version=5 (supported: 3..4)
hint: run migration tool `npm run migrate:snapshot -- --from 5 --to 4`
```

```text
SnapshotChecksumError: payload checksum mismatch
expected=0x129fe02aa4d91e10 actual=0x129fe02aa4d91e02
file=./saves/campaign-1200.ank likely truncated (len=91832 expected=91904)
```

### Exit Criteria
- Save/load round-trip passes deterministic equivalence tests.
- Crash-recovery example runs end-to-end.
- Save/load integration path is documented and executable within 30 minutes.

---

## Week 4 — Observability & Debugging

### Outcomes
- Add structured observability hooks at each simulation step.
- Provide desync detection and differential logging.
- Publish practical debugging guide including Chrome DevTools workflow.

### Deliverables
- `src/observability/hooks.ts`
- `docs/debugging-desyncs.md`

### Work Breakdown
1. **Hook surface**
   - `onStep({ tick, commandCounts, entityDeaths, hash, frameTimeUs })`
   - Hook registration in engine bootstrap with negligible overhead when disabled.

2. **Structured logging adapters**
   - Thin adapter API compatible with `pino` and `winston`.
   - Include `sessionId`, `seed`, `tick`, `hash`, `scenario`, `platform` fields.

3. **Desync detector**
   - Compare local hash stream to authority/reference stream.
   - Emit first divergence event with contextual diff bundle.

4. **Debugging guide**
   - Breakpoint strategy for command application vs system update phases.
   - How to load source maps and inspect deterministic state in Chrome DevTools.
   - “first bad tick” workflow and triage checklist.

### Example hook registration
```ts
engine.observe.onStep((evt) => {
  logger.info({
    tick: evt.tick,
    commandCounts: evt.commandCounts,
    entityDeaths: evt.entityDeaths,
    hash: evt.hash
  }, 'sim.step');

  if (authorityHashAt(evt.tick) !== evt.hash) {
    logger.error({ tick: evt.tick, expected: authorityHashAt(evt.tick), got: evt.hash }, 'sim.desync');
  }
});
```

### Skeptical-engineer-grade desync event
```json
{
  "level": "error",
  "msg": "sim.desync",
  "tick": 904,
  "seed": 441991,
  "expectedHash": "0xa3189f4a22d0cb10",
  "actualHash": "0xa3189f4a22d0cafe",
  "firstDiff": {
    "entityId": 77,
    "component": "Velocity",
    "expected": { "x": 0, "y": -2 },
    "actual": { "x": 0, "y": -1 }
  },
  "repro": "npm run sim:repro -- --seed 441991 --tick 904"
}
```

### Exit Criteria
- Hook API documented and benchmarked for overhead.
- Desync events include enough context for one-pass reproduction.
- Debugging guide validated by at least one engineer unfamiliar with internals.

---

## Project Operating Rhythm (Across All Weeks)

### CI Gates
- Determinism tests are required checks.
- Benchmark regression gate blocks merges above threshold.
- Snapshot compatibility and observability tests run on PR.

### Risk Register + Mitigations
1. **Flaky perf numbers due to host variance**
   - Mitigation: fixed runners, repeated runs, median/p95 tracking.
2. **False determinism confidence (missing browser drift)**
   - Mitigation: explicit browser runtime lane and canonical byte encoder tests.
3. **Snapshot format lock-in too early**
   - Mitigation: versioned header + migration scaffolding from day one.
4. **Observability too expensive in production**
   - Mitigation: compile-time feature flags + sampled logging.

### Definition of Done (Production-Credible)
- Determinism proven by high-volume property tests across targeted platforms.
- Performance published continuously with trend visibility and regressions blocked.
- Save/load proven by round-trip deterministic continuation and recovery demo.
- Desync debugging workflow reproducible from logs alone.
