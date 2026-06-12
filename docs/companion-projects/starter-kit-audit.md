# Companion Starter Kit Audit (Godot + Unity)

Date: 2026-04-08

## Scope audited

- Root onboarding framing in `README.md`
- Companion docs:
  - `docs/companion-projects/ananke-godot-reference/README.md`
  - `docs/companion-projects/ananke-unity-reference/README.md`
- Fit against stable bridge/host contracts:
  - `docs/bridge-contract.md`
  - `docs/host-contract.md`
  - `STABLE_API.md`

## Findings (before)

1. Companion docs read as broad "reference implementation" narratives.
2. First-run path existed but was buried in architecture-heavy sections.
3. Starter scene expectations were implied, not operationalized as a single acceptance path.
4. Stable API dependency intent was stated but not enforced as an explicit integration policy.
5. Known limitations were not collected in one predictable section.

## Minimum new-user path (now explicit)

1. **Install dependencies**
   - Build Ananke root package.
   - Install sidecar dependencies in companion repo.
2. **Run simulated encounter**
   - Start sidecar and verify expected startup signatures.
3. **See rendered result**
   - Open starter scene (`StarterArena`) and run.
4. **Inspect replay/bridge data**
   - Check live frame endpoint/stream.
   - Open saved replay artifact.
   - Use in-engine scrub control.

## Demo value target (starter scene)

Starter scene criteria now documented for both engine variants:

- Locomotion before contact.
- Combat transitions with deterministic command stream.
- Injury/condition visibility through animation/UI.
- Replay/scrub capability with tick seeking.

## Stable contract tightening (documented policy)

Companion starter kits now require:

- Tier 1/root export usage only for host + bridge flow.
- No `src/**` internal imports.
- Sidecar as simulation authority; engine runtime as renderer/interpolator.
- Determinism assumptions tied to seed + command stream stability.

## Known limitations (now explicit)

Both companion starter kit READMEs include a dedicated limitations section covering:

- IPC sidecar boundary tradeoffs.
- Two-entity duel scope.
- Tick-granularity scrub constraints.
- Placeholder asset scope.
