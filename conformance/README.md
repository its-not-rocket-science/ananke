# Ananke — Conformance Fixtures

Test fixtures for verifying host-SDK determinism.  Any implementation that
passes all fixtures is guaranteed to produce the same simulation state as the
reference TypeScript engine.

## Fixture files

| File | Kind | What it tests |
|------|------|---------------|
| `state-hash.json` | `state-hash` | `hashWorldState` output for a canonical idle baseline |
| `state-hash-regression.json` | `state-hash` | Extended hash checkpoints across an AI-driven timeline |
| `phase-order.json` | `phase-order` | Stable kernel phase ordering contract |
| `replay-parity.json` | `replay-parity` | Per-tick hash trace when re-simulating a recorded replay |
| `command-round-trip.json` | `command-round-trip` | CommandMap wire encoding and field semantics |
| `bridge-snapshot.json` | `bridge-snapshot` | `serializeBridgeFrame` output shape and invariants |
| `lockstep-sequence.json` | `lockstep-sequence` | Entity positions and shock at each tick of a 20-tick run |

## Running the suite

```bash
npm run build
npm run conformance-runner          # TypeScript reference implementation
npm run conformance-runner -- --json  # machine-readable output
```

## Integrating from a non-TypeScript host

1. Load the fixture JSON.
2. Reconstruct the initial `WorldState` from the fixture's `input` section.
3. Step the simulation exactly as described.
4. Compare your output against the `expected` / `snapshots` / `hashTrace` fields.
5. A mismatch means your fixed-point arithmetic or RNG seeding diverges.

## Fixture format version

All fixtures carry `"version": "conformance/v1"`.  A breaking change in the
hash algorithm or wire format will bump to `v2` with a migration note.

## Regenerating

```bash
npm run build && npm run generate-conformance-fixtures
```

Re-run after any change to `hashWorldState`, `stepWorld`, or `serializeBridgeFrame`.
