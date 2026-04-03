# Ananke RL Enablement Plan (3 Weeks)

This plan turns Ananke into an RL-ready environment with a fast WASM core, Python interoperability, and vectorized batch stepping suitable for PPO/A2C-style training loops.

## Scope and success criteria

### Target outcomes by end of Week 3
- Sustained **1000+ ticks/sec** for **1000 entities** on a laptop-class CPU in benchmark mode.
- Python-facing environment that feels like Gymnasium:
  - `reset(seed=None, options=None)`
  - `step(actions)`
  - `observation_space`
  - `action_space`
- Batch inference path for 100+ entities per call.
- Action masking support and invalid command rejection.

### Suggested package strategy
To support both browser and local training workflows:
- `ananke-rl` (PyPI meta package): thin Python API + backend selection.
- Backend A (Week 2 priority): **Pyodide/WASM bridge** for browser + Node portability.
- Backend B (parallel hardening): native extension (PyO3/N-API bridge) for max local throughput.

---

## Week 1 — WASM Performance Core

### Objectives
1. Port hot paths to AssemblyScript:
   - damage calculation
   - position update
   - proximity query
2. Compile to WASM and expose TypeScript bindings.
3. Achieve **>=2x speedup** vs pure TypeScript baseline.
4. Deliver `as/core/` with tests + benchmark comparison.

### Implementation breakdown

#### Day 1: Baseline and profiling contract
- Freeze current TypeScript reference functions for the three hot paths.
- Add deterministic test vectors (seeded inputs + golden outputs).
- Add benchmark harness with fixed entity counts (100, 1000, 5000) and fixed tick counts.

#### Day 2–3: AssemblyScript core module
- Create `as/core/` layout:
  - `as/core/damage.ts`
  - `as/core/position.ts`
  - `as/core/proximity.ts`
  - `as/core/index.ts`
- Use **SoA memory layout** where practical (separate typed arrays per field) to improve linear memory access.
- Define ABI-safe buffer contracts for TS ↔ WASM calls (offset + length semantics).

#### Day 4: TypeScript bindings and fallback
- Add bindings:
  - `src/wasm/core-bindings.ts`
  - runtime feature detection/fallback to TS implementation.
- Guardrails:
  - explicit bounds checks in boundary layer.
  - panic/error code mapping to TS errors.

#### Day 5: Verification and perf gate
- Unit tests: parity between TS and WASM outputs.
- Property tests: random seeds, tolerance checks for numeric drift.
- Benchmark report committed under `docs/benchmarks/rl-week1-wasm.md`.
- CI gate: fail if WASM path regresses below target speedup.

### Week 1 deliverables
- `as/core/` implemented with tests.
- `src/wasm/core-bindings.ts`.
- Benchmark artifact showing >=2x on agreed workloads.

### Acceptance tests
- `npm run test:wasm-core` passes.
- `npm run bench:wasm-core` shows >=2x median speedup on 1000-entity test.

---

## Week 2 — Python Binding (Pyodide First)

### Objectives
1. Expose Ananke as a Pyodide package for browser/Node.
2. Provide Gymnasium-style API.
3. Include runnable 5v5 tactical battle training example.
4. Deliver `bindings/pyodide/ananke.py` and `examples/rl/train-agent.ipynb`.

### Gymnasium API mapping (specific)

#### Python class shape
```python
class AnankeEnv(gym.Env):
    metadata = {"render_modes": ["ansi", "rgb_array"], "render_fps": 30}

    def __init__(self, config: dict):
        self.observation_space = ...
        self.action_space = ...

    def reset(self, *, seed=None, options=None):
        # maps to ananke.reset(seed, scenario_config)
        # returns obs, info
        ...

    def step(self, action):
        # maps to ananke.step(action_batch)
        # returns obs, reward, terminated, truncated, info
        ...
```

#### Proposed observation space
- `spaces.Dict({
    "entities": Box(shape=(N, F), dtype=float32),
    "global": Box(shape=(G,), dtype=float32),
    "action_mask": MultiBinary((N, A))
  })`

#### Proposed action space
- If single-agent control: `spaces.MultiDiscrete([A] * K)` where `K` is number of controlled actors.
- If policy emits parameterized commands: `spaces.Dict({"cmd": MultiDiscrete([A]*K), "target": MultiDiscrete([T]*K)})`.

#### Engine ↔ Gym step mapping
- `reset()`:
  - Engine: instantiate world + seed RNG.
  - Gym: return `(obs, info)`.
- `step(actions)`:
  - validate actions (or mask-assisted sanitize)
  - engine tick(s)
  - compute reward decomposition:
    - tactical objective delta
    - survival bonus
    - invalid action penalty
  - return `(obs, reward, terminated, truncated, info)`.

### Implementation breakdown

#### Day 1: Pyodide packaging skeleton
- Add `bindings/pyodide/`:
  - `ananke.py`
  - `js_bridge.py`
  - `pyproject.toml` (or equivalent package metadata)
- Define JS interop boundary (Pyodide `js` module to call TS/WASM runtime).

#### Day 2–3: Env contract + action validation
- Implement `AnankeEnv` and wrappers for vectorized action calls.
- Add strict invalid-action rejection mode:
  - `invalid_action_mode = "reject" | "clip" | "mask_only"`
- Emit diagnostics in `info`:
  - `invalid_action_count`
  - `invalid_action_ids`

#### Day 4: Example training notebook
- Add `examples/rl/train-agent.ipynb`:
  - 5v5 tactical scenario setup
  - baseline PPO run (stable-baselines3 style pseudocode where Pyodide constraints apply)
  - plotting reward/tick throughput
- Include deterministic seed cell and expected learning curve notes.

#### Day 5: Integration + docs
- End-to-end smoke tests in browser + Node-hosted Pyodide.
- Add usage guide `docs/rl-pyodide-quickstart.md` with install/run instructions.

### Week 2 deliverables
- `bindings/pyodide/ananke.py` with Gymnasium API.
- `examples/rl/train-agent.ipynb` (5v5 training example).
- Quickstart docs and smoke tests.

### Acceptance tests
- `python -c "from ananke import AnankeEnv; print('ok')"` in Pyodide runtime.
- `reset()`/`step()` loop runs 1k steps without crashes.

---

## Week 3 — Batch Processing & Vector Ops

### Objectives
1. Introduce `Vec2q` / `Vec3q` types with WASM SIMD-aware layout.
2. Add batch updates for 100+ entities/call.
3. Add action mask API `getValidActions(entityId)`.
4. Deliver `src/math/vector-q.ts` and `examples/rl/batch-inference.ts`.

### Implementation breakdown

#### Day 1–2: Vector math types
- Implement `src/math/vector-q.ts`:
  - quantized or packed vector representations (`Vec2q`, `Vec3q`)
  - conversion helpers to/from float vectors.
- Align memory layout for SIMD-friendly loads/stores.
- Add microbenchmarks for vector transform/update kernels.

#### Day 3: Batch stepping API
- Add engine API (TS layer):
  - `stepBatch(actionTensor, batchMeta)` for 100+ entities.
- Optimize for contiguous action buffers and reduced JS↔WASM crossings.
- Include partial-update mode for sparse action sets.

#### Day 4: Action masking and legal action queries
- Add `getValidActions(entityId)` and batched variant:
  - `getValidActionsBatch(entityIds)`.
- Integrate mask into observations and pre-step validator.
- Enforce invalid command rejection in engine core when `reject` mode enabled.

#### Day 5: End-to-end RL throughput validation
- Add `examples/rl/batch-inference.ts` demonstrating:
  - model logits → mask application → sampled legal actions → batch step.
- Benchmark with 100/500/1000 entities and publish in `docs/benchmarks/rl-week3-batch.md`.

### Week 3 deliverables
- `src/math/vector-q.ts`.
- `examples/rl/batch-inference.ts`.
- Action masking APIs and throughput benchmarks.

### Acceptance tests
- `npm run test:rl-batch` passes.
- Throughput benchmark reaches or exceeds 1000 ticks/sec target on reference laptop profile.

---

## Bonus — Leaderboard via GitHub Actions

### Goal
Run automatic agent tournaments on PRs and maintain a simple leaderboard.

### Proposed workflow
- Workflow file: `.github/workflows/rl-tournament.yml`
- Trigger: pull_request + nightly schedule.
- Steps:
  1. Build Ananke core (WASM + bindings).
  2. Run round-robin tournament between baseline agents and PR candidate.
  3. Upload artifacts (replays, score tables).
  4. Comment PR with Elo delta and win-rate summary.
- Persist ratings in a versioned JSON file:
  - `benchmarks/leaderboard/elo.json`.

### Anti-gaming checks
- Fixed seeds + rotating seed set.
- Time budget caps per decision.
- Sanity rejection for invalid-action exploit strategies.

---

## Cross-cutting engineering details

### Performance budget and instrumentation
- Add per-tick metrics:
  - `tick_ms`, `sim_ms`, `bridge_ms`, `mask_ms`
- Add counters:
  - invalid actions, clipped actions, rejected actions
- Emit Prometheus-like structured logs or JSON traces for notebook ingestion.

### RL usability checklist
- Determinism with seed control.
- Fast reset path for episode-heavy workloads.
- Configurable reward shaping profiles.
- Clear termination vs truncation semantics.
- Stable observation schema versioning.

### Risk register and mitigations
- **Pyodide overhead too high** → keep native backend track in parallel.
- **WASM↔JS bridge bottleneck** → use batched APIs + shared typed arrays.
- **Action mask mismatch with engine legality** → single source of truth legality function in core.

---

## Milestone checklist (for project tracking)

- [ ] Week 1 complete: WASM hot-path parity + 2x benchmark
- [ ] Week 2 complete: Pyodide Gym env + 5v5 notebook
- [ ] Week 3 complete: batch stepping + vector-q + action masks
- [ ] Bonus complete: PR tournament leaderboard workflow

---

## Colab notebook link (starter)

Use this link format once the notebook is pushed to the default branch:

- **Colab**: `https://colab.research.google.com/github/<org>/<repo>/blob/main/examples/rl/train-agent.ipynb`

For this repository, replace placeholders with the actual GitHub org/repo when published.
