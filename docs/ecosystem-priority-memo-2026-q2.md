# Ecosystem Priority Memo (Next 3 Months)

Date: 2026-04-08  
Scope: `ananke` + nine companion/adjacent repositories

## Decision frame

This prioritisation applies five criteria (weighted toward adoption and coherence):

1. Adoption leverage
2. Proof-of-use value
3. Maintenance burden
4. Dependency risk
5. Duplication risk

Priority labels:

- **Must push now**
- **Maintain steadily**
- **Hold / deprioritise**

## Ranked portfolio

| Rank | Repo | Priority class | Why now (3-month lens) |
|---:|---|---|---|
| 1 | `ananke` | **Must push now** | Platform source-of-truth; all companion hooks depend on stable Tier 1/2 APIs and hardening progress. |
| 2 | `ananke-world-ui` | **Must push now** | Main adoption surface for non-TypeScript users; already positioned as product layer over stable APIs. |
| 3 | `ananke-threejs-bridge` | **Must push now** | Lowest-friction demo path (URL-only browser experience), and it reduces engine-install friction for first contact. |
| 4 | `ananke-historical-battles` | **Maintain steadily** | Strong proof-of-use and calibration feedback loop; high credibility value but narrower adoption funnel than UI/bridge. |
| 5 | `ananke-godot-reference` | **Maintain steadily** | M1–M4 complete and strategically useful for engine adopters; keep compatibility and docs healthy, avoid big new scope. |
| 6 | `ananke-unity-reference` | **Maintain steadily** | Same as Godot: useful proof for game teams, but sidecar/channel complexity makes it less immediate than browser/UI funnel. |
| 7 | `ananke-archive` | **Maintain steadily** | Important for reproducibility/discoverability, but depends on sustained ingest and scenario supply; optimize reliability over feature breadth. |
| 8 | `ananke-fantasy-species` | **Hold / deprioritise** | Valuable content, but pure data package with low platform risk; defer expansion until ingestion/UX funnels are stronger. |
| 9 | `ananke-language-forge` | **Hold / deprioritise** | Explicitly non-deterministic and outside physics-first kernel scope; high dependency volatility (LLM providers) for lower core-coherence return. |
| 10 | `atropos` | **Hold / deprioritise** | No clear contract linkage in current Ananke docs; treat as downstream experiment until explicit integration and adoption metrics are defined. |

## Rationale by criterion

### Adoption leverage

Highest leverage in the next quarter comes from the repos that reduce first-run friction the most:

- `ananke-world-ui` makes Ananke usable by designers/writers without kernel coding.
- `ananke-threejs-bridge` offers “share URL, run in browser” onboarding.
- `ananke` remains the required backbone for every other path.

### Proof-of-use value

- `ananke-historical-battles` is the strongest “does this model reality?” signal and should continue generating calibration pressure.
- Engine references (`godot`, `unity`) are excellent proof for real-time runtime integration, but are no longer greenfield (M1–M4 complete), so should emphasize polish and compatibility.

### Maintenance burden & dependency risk

- Core + UI + browser bridge are comparatively controllable and directly aligned.
- Godot/Unity references carry engine + sidecar integration burden.
- `ananke-language-forge` has external-model/provider dependency risk and stochastic-output mismatch with deterministic-core messaging.

### Duplication risk

- Avoid parallel heavy investment in both engine references *and* browser bridge for net-new rendering features this quarter.
- Keep one primary “fast path” demo surface (`world-ui` + `threejs-bridge`) and treat engine references as contract conformance exemplars.

## Top-3 execution contracts

### 1) `ananke` (core)

- **Concrete milestone (90 days):** publish a pinned “Platform Contracts 1.0” release cut with golden fixtures for Tier 1/2 APIs and replay serialization.
- **Integration contract to stabilise:** `BridgeFrame` / rig snapshot + animation hints payload semantics across ticked outputs.
- **Do not build yet:** new simulation phases or additional emergent systems.

### 2) `ananke-world-ui`

- **Concrete milestone (90 days):** ship an end-to-end “world → run → replay → export” workflow usable without touching TypeScript.
- **Integration contract to stabilise:** strict consumption of Tier 1/2 stable APIs + `ReplayRecorder` import/export compatibility.
- **Do not build yet:** deep multiplayer/live-ops feature set.

### 3) `ananke-threejs-bridge`

- **Concrete milestone (90 days):** publish a production-grade demo template (single-command run + deploy recipe) that stays in lockstep with current bridge schema.
- **Integration contract to stabilise:** `stepWorld` loop + interpolation frame contract (snapshot cadence and field naming) shared with UI preview use.
- **Do not build yet:** worker/WASM rewrite for high-entity optimization beyond current onboarding scenarios.

## Portfolio guardrails (next quarter)

1. **Adoption-first sequencing:** core contracts → world UI path → browser demo path.
2. **No exploratory sprawl:** language/content expansion only after contract/UX reliability metrics are green.
3. **One canonical narrative:** deterministic core, coherent toolchain, reproducible outputs.
4. **Companion repos stay companion-scoped:** demonstrate integration quality, avoid becoming parallel platform forks.

