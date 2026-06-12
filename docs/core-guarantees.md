# Ananke — Core Guarantees

*Platform Maturity PM-9 — Core Guarantees Technical Paper*

> **Audience:** Technical evaluators, integration architects, and host authors who need to
> understand what Ananke guarantees — and what it explicitly does not — without reading `src/`.
>
> **Label convention:** Each claim in this document carries one of three labels:
> - **Engineering claim** — a property enforced by the implementation and verified by the test suite
> - **Empirical claim** — a property validated against historical or experimental data (see source)
> - **Design principle** — an architectural intention that shapes the API surface and evolution policy

---

## 1 · Fixed-point determinism

### What the guarantee is

> **Engineering claim:** `mkWorld(seed, entities)` followed by an identical sequence of
> `CommandMap` values passed to `stepWorld` produces an identical `WorldState` at every tick,
> on every platform, in every JS engine, across every version in the same major series.

"Identical" means byte-for-byte equal on all fields covered by `hashWorldState` (the FNV-64
hash over `tick`, `seed`, and every entity field except `__`-prefixed internal temporaries).

### How it is enforced

**Fixed-point arithmetic throughout.**  Every simulation value uses the `Q` integer type
(`SCALE.Q = 16384 = 1.0`).  There are no `Math.sin`, `Math.cos`, or other transcendental
calls in the simulation path; square roots use `sqrtQ()` which operates on integers.  SI
unit scales (`SCALE.kg = 1000`, `SCALE.m = 1000`, etc.) let physics formulas stay in integers
while preserving sub-unit precision.

**No `Math.random()`.**  All randomness flows through `makeRng(eventSeed(...))`.
`eventSeed(worldSeed, tick, entityIdA, entityIdB, salt)` is a deterministic integer hash;
`makeRng` produces a deterministic LCG sequence from it.  The prohibition is enforced by
a lint rule (`lint-open.mjs`) that fails if `Math.random` appears in `src/`.

**Insertion-order iteration.**  `world.entities` is a stable array sorted by entity `id`
ascending at world creation.  `stepWorld` iterates it in order; there is no `Set` or `Map`
iteration over entity state in the hot path.

**Corpus hash verification.**  The scenario corpus (`corpus/`) commits the FNV-64 output
hash for five canonical scenarios.  `npm run verify-corpus` re-runs each scenario and fails
if any hash drifts.  CI executes this check on every push.

### What can break it

The determinism guarantee holds only when the host follows these rules:

| Rule | Why |
|------|-----|
| Never use `Math.random()` in commands or AI code that feeds `stepWorld` | Injects platform-dependent randomness |
| Iterate `world.entities` in the order it is given (do not sort or filter in place before re-injecting) | Ordering affects pair-based resolution |
| Keep entity `id` values stable across ticks | IDs are RNG salts — reuse changes all downstream rolls |
| Do not rely on wall-clock time inside the simulation loop | Clock skew between machines breaks replay |
| Rebuild `CommandMap` from scratch each tick (do not carry over stale references) | Stale command objects can alias mutation |

Conformance tests in `conformance/` verify these properties for third-party host
implementations.  See [`docs/host-contract.md`](host-contract.md).

### Scope of the guarantee

The determinism guarantee covers:

- All fields hashed by `hashWorldState`: tick, seed, entity id/team/position/attributes/injury/condition/energy/loadout
- The scenario corpus entries (5 canonical scenarios across all subsystems)
- Replay parity: `replayTo(replay, targetTick, ctx)` produces the same hash as live simulation at that tick

It does **not** cover:

- The `__`-prefixed internal temporaries (excluded from hashing by convention)
- Wall-clock timing (only outcome correctness, not execution time)
- Platform floating-point for display or non-simulation code (bridge interpolation, narrative text)

---

## 2 · API stability tiers

> **Engineering claim:** Tier 1 exports listed in `STABLE_API.md` will not change in a
> breaking way within a major version series.  A breaking change to any Tier 1 export
> requires a major semver bump and a migration guide in `CHANGELOG.md`.

### Tier definitions

| Tier | Label | Guarantee |
|------|-------|-----------|
| **1** | Stable | No breaking changes without major bump + migration guide |
| **2** | Experimental | May change between minor versions; `CHANGELOG.md` entry required |
| **3** | Internal | No stability guarantee; may change at any time |

The full symbol table is in [`STABLE_API.md`](../STABLE_API.md).

### What "breaking" means for Tier 1

> **Engineering claim:** The following changes are always breaking for Tier 1:

| Change | Example |
|--------|---------|
| Rename or remove a field | `entity.injury` → `entity.wounds` |
| Change a field's unit or scale | `position_m` stored at a different `SCALE` |
| Remove or rename a Tier 1 function | `stepWorld` signature change |
| Change the interpretation of a constant | `SCALE.Q` value changed |
| Change determinism — same seed, different outcome | Any RNG, ordering, or arithmetic change |

### What is not breaking

- Adding new optional fields to interfaces (with `exactOptionalPropertyTypes`-safe defaults)
- Adding new exported functions or types
- Adding new built-in archetypes, weapons, or body plans
- Fixing bugs where the previous behaviour was demonstrably wrong

### Pre-1.0 note

> **Design principle:** The project is currently in the pre-1.0 (`0.x`) line.  Tier 1 exports behave as Stable
> within the `0.x` line — they will not break without a minor-version bump and a migration
> guide.  The `1.0` release will lock the Tier 1 surface under full semver guarantees.

Hosts that require byte-for-byte replay determinism across patch releases should also pin to
a specific commit hash.  See [`docs/versioning.md`](versioning.md#commit-hash-pinning-supplementary).

### Deprecation lifecycle

When a Tier 1 symbol must eventually be removed, it passes through three phases:

1. **Mark** — add a structured `@deprecated` JSDoc tag with `since`, `replacement`, and `Removes at` fields
2. **Migration window** — one or more minor versions where both old and new API coexist
3. **Remove** — at the declared `removeAfter` version (always a major bump for Tier 1)

`npm run audit-deprecations -- --check` fails if any symbol's `removeAfter` version ≤
the current engine version.  This check runs in `prepublishOnly` to prevent accidental
publication of overdue symbols.

---

## 3 · Schema and wire contracts

> **Engineering claim:** The JSON serialization of `WorldState` and `Replay` objects follows
> the schemas in `schema/world.schema.json` and `schema/replay.schema.json`.  These schemas
> are stable within a major version series.

### World-state hash

`hashWorldState(world): bigint` computes an FNV-64 hash over the canonical JSON serialization
of the world.  The serialization is stable: keys are alphabetically sorted at every level,
numeric values are deterministic integers.  The hash excludes `__`-prefixed fields.

You can use the hash to:
- Detect desync between two simulation instances at the same tick
- Verify a replay fixture against a known-good baseline
- Implement lockstep netcode (send/receive hash each tick; pause if they diverge)

### Replay format

> **Engineering claim:** A `Replay` serialized by `serializeReplay()` can be deserialized
> and replayed with `deserializeReplay()` + `replayTo()` and will produce identical
> world-state hashes at every tick, given the same `KernelContext`.

The replay format records:
- The initial `WorldState` snapshot (tick 0 entity state)
- The `CommandMap` at every recorded tick

Replays are forward-only: `replayTo(replay, targetTick, ctx)` steps from tick 0 to `targetTick`.
There is no seek-backwards operation.

### Content-pack schema

> **Engineering claim:** A content pack validated by `validatePack(manifest)` against the
> current engine version will load without error.  The pack schema is in `schema/pack.schema.json`.

The `registry.compatRange` field uses npm-compatible semver range syntax.  The engine evaluates
`semverSatisfies(ANANKE_ENGINE_VERSION, pack.registry.compatRange)` at load time and rejects
packs whose range does not include the running engine version.

Packs include a SHA-256 checksum in `registry.checksum`.  The checksum is computed with the
field itself set to `""` (placeholder), then re-embedded.  Any modification to the pack JSON
after bundling will invalidate the checksum.

---

## 4 · Validation philosophy

Ananke makes claims at three distinct confidence levels.  Mixing them up leads to
miscalibrated trust.

### 4.1 Empirical claims

> **Empirical claim:** An empirical claim is bounded by a specific historical or experimental
> source.  If the simulation output falls outside the stated tolerance band, the scenario
> fails — regardless of internal consistency.

Examples (from `docs/emergent-validation-report.md`):

| Claim | Source | Criterion |
|-------|--------|-----------|
| 10v10 skirmish: losing side retains < 50% strength | du Picq, *Battle Studies* (1880) | ✅ 41.3% retention (threshold ≤ 50%) |
| Rain+fog extends combat duration by ≥ 10% | Military historical analysis | ✅ 1.54× ratio (threshold ≥ 1.10) |
| Siege disease deaths ≥ 5% of besieged population | Raudzens (1990) | ✅ 56.1% (threshold ≥ 5%) |

Run `npm run run:emergent-validation` to reproduce these results.  CI runs a 20-seed
fast subset in `test/validation/emergent-validation.test.ts`.

### 4.2 Plausibility claims

> **Design principle:** A plausibility claim tests that outcomes are physically reasonable.
> No single empirical source constrains the exact value — the criterion is set from first
> principles or expert judgement.

Examples:

| Claim | Criterion |
|-------|-----------|
| Lanchester's Laws: 5 vs 10 — casualty ratio ≥ 2.0× | Square law lower bound |
| OLST balance duration within ±25–30% of reference (age-stratified) | Springer 2007 ranges |
| Punch force from 2 m/s hand speed ≈ 1900–2100 N | Biomechanics literature range |

Plausibility checks are part of the validation suite (`npm run run:validation`) but are
not committed as pinned baselines.

### 4.3 Content-layer claims

> **Design principle:** Content-layer claims (e.g. "this sword has reach 1.2 m") are
> definitional, not empirical.  They are as accurate as the content author made them.
> The engine enforces only physical consistency (units, ranges), not historical accuracy
> of specific item parameters.

The distinction matters when evaluating Ananke for a specific use case: the physics engine
is empirically grounded; the starter content is representative but not authoritative.

---

## 5 · Benchmark methodology

> **Design principle:** The benchmark numbers in `docs/performance.md` describe throughput
> on specific reference hardware under specific conditions.  They are reproducible, but
> not universal.

### What the numbers mean

| Metric | Meaning |
|--------|---------|
| Median tick time | 50th-percentile wall-clock time for one `stepWorld` call across 5 000 ticks |
| p99 tick time | 99th-percentile; GC and JIT spikes visible here |
| Throughput (ticks/s) | 1000 / median tick time |
| Tick budget used | median tick time / target tick period (e.g. 50 ms at 20 Hz) |

Reference hardware: Intel i7-12700, Node.js 22 LTS, Windows 10, TypeScript compiled to ES2022.

### What the numbers do not mean

- **They are not portable.** Node.js version, OS, CPU architecture, and JIT warmup all
  affect absolute numbers.  Expect ±30–50% on different hardware.
- **They do not include host overhead.** Rendering, networking, and command-building are
  outside `stepWorld` and not included.
- **They assume no subsystem disabling.** The full kernel path runs all enabled subsystems.
  Disabling expensive optional subsystems (disease O(n²) spread, thermoregulation) at high
  entity counts can recover 20–40% throughput.

### How to detect regressions

Use `npm run verify-corpus` for correctness regression detection (hash drift = changed physics).

For performance regressions, `npm run benchmark-check` compares median tick time against a
pinned baseline in `docs/performance.md`.  `benchmark-check:strict` tightens the threshold
to ±10%.

---

## 6 · Known limits

### 6.1 Floating-point interop

> **Engineering claim:** The simulation path — everything inside `stepWorld` — uses only
> integer arithmetic.  **No guarantee is made** about floating-point results produced
> outside the simulation path (narrative text, bridge interpolation, display helpers).

If your host converts a `Q` value to `number` for display, rounds it, and injects the
rounded value back into simulation state, you have introduced float-to-int rounding that
may differ by 1 ULP between platforms.  Keep the simulation ↔ display boundary clean:
read `Q` values for display only; never write them back.

### 6.2 JS engine version portability

> **Engineering claim:** Ananke is tested on Node.js ≥ 18 LTS.

The FNV-64 hash uses `BigInt`, which is available in all supported environments.  No
platform-specific builtins are used in `src/`.  However, the test suite is not run on
Bun, Deno, or browser runtimes — those are not officially supported.  Community reports
suggest Bun and Deno work in practice; browser usage requires bundling and lacks `node:fs`
(tools only, not `src/`).

### 6.3 Host clock independence

> **Engineering claim:** `stepWorld` is stateless with respect to wall-clock time.  It
> does not read `Date.now()` or `performance.now()`.

The host is responsible for calling `stepWorld` at the correct rate.  If a host skips ticks
to catch up after a lag spike, the simulation advances correctly — there is no "catch-up
physics" divergence.  If a host calls `stepWorld` at variable intervals, it must pass the
correct `elapsedSeconds` in any per-subsystem accumulator calls (e.g. `stepAging`,
`stepSleep`, `stepWoundAging`) to avoid simulating incorrect amounts of elapsed time.

### 6.4 Entity count scalability

> **Engineering claim:** There is no hard entity limit.  Throughput degrades as O(n) for
> most subsystems and O(n²) for airborne disease spread.

At 1 000 entities, median tick time (64.5 ms) exceeds the 20 Hz budget (50 ms).  Reduce
update rate to 10 Hz, disable O(n²) subsystems, or use spatial partitioning to limit
interaction pairs.  See `docs/performance.md` for the full operational guide.

### 6.5 Numerical overflow

> **Engineering claim:** All fixed-point arithmetic uses `mulDiv(a, b, div)` for
> intermediate products that could overflow 32-bit integers.  Overflow in `mulDiv` is
> detected and clamped to `Number.MAX_SAFE_INTEGER`.

In practice, simulation values are bounded by physical plausibility (forces in N, energies
in J, masses in kg) and never approach overflow thresholds.  The protection exists for
adversarial or degenerate inputs.

---

## Summary table

| Guarantee | Type | Verified by |
|-----------|------|-------------|
| Same seed + same commands → same output | Engineering | `npm run verify-corpus` |
| FNV-64 hash covers all observable entity state | Engineering | `test/netcode.test.ts` |
| Tier 1 API will not break within major version | Engineering | `STABLE_API.md` + semver policy |
| Schema-valid packs load without error | Engineering | `test/content-pack.test.ts` |
| Replay parity at every tick | Engineering | `corpus/lockstep-replay` fixture |
| 10v10 skirmish loser retains < 50% strength | Empirical | `npm run run:emergent-validation` |
| Environmental friction extends combat ≥ 10% | Empirical | `npm run run:emergent-validation` |
| Siege disease deaths ≥ 5% of population | Empirical | `npm run run:emergent-validation` |
| No `Math.random()` in simulation path | Engineering | `tools/lint-open.mjs` |
| Benchmark regression detection | Engineering | `npm run benchmark-check` |

---

## Further reading

| Document | What's in it |
|---|---|
| [`STABLE_API.md`](../STABLE_API.md) | Full tier table for every export |
| [`docs/versioning.md`](versioning.md) | Semver policy, commit-hash pinning, breaking-change tiers |
| [`docs/host-contract.md`](host-contract.md) | Stable integration surface — host rules for preserving determinism |
| [`docs/emergent-validation-report.md`](emergent-validation-report.md) | Pinned empirical validation results |
| [`docs/performance.md`](performance.md) | Benchmark results and operational guide |
| [`corpus/README.md`](../corpus/README.md) | Canonical scenario corpus — run `npm run verify-corpus` |
| [`conformance/`](../conformance/) | Third-party host conformance test suite |
