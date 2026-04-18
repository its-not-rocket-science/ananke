# World Evolution Backend Trust Artifact

This artifact records the non-regression guarantees expected from the world evolution backend layer.

## Guarantees

- **Deterministic execution:** identical snapshot + seed + ruleset + steps yields identical outputs.
- **Checkpoint parity:** resume-from-checkpoint execution must match uninterrupted execution for equivalent remaining steps.
- **Branch isolation:** branch evolution must not mutate canonical snapshots or sibling branch state.
- **Schema adapter stability:** host/open-world adapters must preserve canonical ordering and support round-trip reconstruction of meaningful simulation state.
- **Timeline canonical ordering:** generated timeline events are expected to stay chronologically and categorically ordered with stable IDs/sequences.
- **Tier-1 export boundary safety:** backend additions must remain additive subpath surfaces and not alter Tier-1 root export guarantees.

## Explicit Limits

- Backend and world-evolution-engine subpath APIs are shipped integration surfaces, but are **not** Tier-1 root guarantees.
- Determinism guarantees apply to canonicalized inputs and supported schema versions; malformed/unsupported payloads are rejected.
- Checkpoint compatibility is version-gated by checkpoint metadata and engine/schema version checks.

## Verification Signals

- Non-regression test suites under `test/world-evolution-*.test.ts`, `test/open-world-host-adapter.test.ts`, and `test/world-evolution-engine-subpath.test.ts`.
- Public-contract/Tier-1 boundary checks via `npm run check-public-contract`.
