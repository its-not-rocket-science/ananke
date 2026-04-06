# Hook reference

## Core lifecycle hooks

- `beforeStep(context)` — called before simulation step execution.
- `afterStep(context)` — called after a simulation step has completed.
- `afterDamage(context)` — called after a damage event resolves.
- `matchEnd(context)` — called once at end-of-match with summary fields.

## Plugin runtime API

- `hasPermission(permission)`
- `readWorldState(value)`
- `mutateWorld(worldState, mutator)` (requires `write:worldState`)
- `emitTelemetry(metric, payload)` (requires `write:telemetry`)
- `writeArtifact(path, contents)` (requires `write:artifacts`)

## Permission examples

- Read-only observer plugin: `permissions: ["read:worldState"]`
- Analytics plugin with reports: `permissions: ["read:events", "write:artifacts"]`
- Full gameplay mutator: `permissions: ["read:worldState", "write:worldState"]`
