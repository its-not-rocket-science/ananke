# Plugin security model

- Plugins are evaluated in a restricted CommonJS VM context with no Node globals.
- Host functions are capability-gated by manifest permissions.
- `readWorldState` returns a deep-frozen clone to prevent mutation.
- `mutateWorld`, `emitTelemetry`, and `writeArtifact` enforce explicit grants.

For production deployments handling untrusted code, inject a hardened evaluator (`vm2` / `isolated-vm`) via `loadPlugin(..., { evaluator })`, or use a Worker-based runtime in browsers.
