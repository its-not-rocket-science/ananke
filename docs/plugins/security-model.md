# Plugin security model

This document describes the **current** security posture of the Ananke plugin runtime and a conservative threat model for production deployers.

## Scope and assumptions

- Scope: plugins loaded through `loadPlugin(...)` from `src/plugins/loader.ts`.
- Host model: host application controls where plugin files come from, what permissions are declared in `plugin.json`, and what loader options are used.
- Threat model: third-party plugin authors may be buggy or malicious.
- Non-goals: this document does not claim formal isolation or side-channel resistance.

## What is guaranteed today vs best practice

### Guaranteed by the current implementation

The following statements are grounded in the current loader/runtime code:

- Plugin code is evaluated with a minimal CommonJS sandbox (`module`, `exports`) using `node:vm` by default.
- The default evaluator runs with a 100 ms VM execution timeout for initial module evaluation.
- Runtime API methods enforce permission checks for:
  - `mutateWorld` → requires `write:worldState`
  - `emitTelemetry` → requires `write:telemetry`
  - `writeArtifact` → requires `write:artifacts`
- `readWorldState` returns a deep-frozen structured clone of input.
- `writeArtifact` writes under `<artifactsRoot>/<pluginId>/<path>` (default root `.ananke-artifacts`).
- Hosts can inject a custom `evaluator` (for example hardened Node sandbox adapters or browser worker evaluators).

### Recommended best practice (not guaranteed by default)

The following are operational recommendations, not built-in hard guarantees:

- Treat `node:vm` as a convenience boundary, not a complete security boundary for hostile code.
- For untrusted plugins, run them in stronger isolation (e.g., process/worker/container isolation with explicit IPC contracts and resource quotas).
- Curate plugin supply chain (pin versions/hashes, review manifests/modules, and sign provenance where possible).
- Add runtime controls missing from default loader path (CPU budgets beyond setup evaluation, memory limits, hook timeouts, telemetry/artifact rate limits).
- Run high-risk deployments with least privilege OS/container permissions and separate service identities.

## Trust boundaries

Primary boundaries in the current architecture:

1. **Plugin source boundary**
   - Input: `plugin.json` and `index.js` loaded from disk.
   - Risk: malicious code or mismatched permission claims from plugin package source.

2. **Evaluator boundary**
   - Default: `node:vm` new context with minimal bindings.
   - Optional: caller-supplied evaluator.
   - Risk: escape/bypass potential depends on evaluator implementation quality.

3. **Capability boundary (runtime API)**
   - The host only exposes methods on `PluginRuntimeApi`.
   - Risk: once a capability is granted in manifest, plugin can use it arbitrarily unless host adds additional policy checks.

4. **Host state boundary**
   - Plugins receive hook context objects and can mutate them through normal JavaScript semantics.
   - `readWorldState` protects cloned reads, but does not prevent plugin CPU abuse or logic abuse.

5. **Artifact filesystem boundary**
   - `writeArtifact` restricts base directory by plugin id, but caller-controlled path segments still need operational controls.

## Attacker goals

A realistic malicious plugin may try to:

- Change simulation outcomes (integrity attack) through permitted hooks or world mutation permissions.
- Exfiltrate sensitive data through telemetry, artifacts, or covert channels.
- Deny service by heavy computation, unbounded loops in hook handlers, or excessive output generation.
- Pivot to host-level capabilities (sandbox escape) to access filesystem/network/process APIs beyond intended runtime API.
- Poison downstream consumers with malformed or misleading artifacts.

## Sandbox escape risks

Conservative position:

- The default `node:vm` sandbox reduces accidental access to Node globals but should **not** be treated as a complete adversarial-code isolation mechanism.
- The initial 100 ms timeout applies to module evaluation; it is not a full lifecycle execution governor for async/plugin hook behavior.
- Any evaluator bug or unsafe host integration can reintroduce powerful primitives.

Implications:

- For untrusted plugins, isolation should be upgraded beyond in-process `node:vm` usage (separate process/worker/container, constrained IPC surface, and defense-in-depth at OS/runtime level).

## Denial-of-service risks

Current risks include:

- Hook handlers are awaited by `runHook` with no built-in per-hook timeout/cancellation in loader.
- No built-in memory quotas for plugin objects/payloads.
- No built-in rate limiting for telemetry or artifact writes.
- A plugin can perform expensive computation during hook execution even without elevated permissions.

Mitigations (operational):

- Enforce per-hook wall-clock budgets and cancellation at the host scheduler layer.
- Apply quotas: max artifacts, max bytes, max telemetry events, max payload sizes.
- Isolate execution domains so one plugin cannot starve core simulation threads.

## Host capability abuse risks

Even without sandbox escape, granted capabilities can be abused:

- `write:worldState`: silent manipulation of simulation semantics.
- `write:telemetry`: high-volume spam, data exfiltration, or metric poisoning.
- `write:artifacts`: disk pressure, deceptive outputs, and potential path-manipulation attempts.

Mitigations (operational):

- Principle of least privilege on manifest permissions.
- Per-plugin policy overlays (allow/deny by hook, metric namespace, artifact path patterns, byte quotas).
- Auditable logs correlating plugin id, hook name, and side effects.

## Artifact-writing risks

`writeArtifact` currently resolves paths relative to `<artifactsRoot>/<pluginId>/...`. This gives useful namespacing, but deployers should assume additional risk until hardened by deployment policy:

- Unbounded artifact volume can exhaust disk.
- Attacker-controlled filenames/content may confuse downstream parsers.
- Path resolution semantics should be monitored to ensure output remains under intended root in all edge cases.

Recommended hardening:

- Canonicalize and verify resolved artifact paths remain under approved root.
- Enforce extension and content-type policies for machine-consumed artifacts.
- Store artifacts on dedicated volumes with quotas and retention policies.

## Browser vs Node differences

### Node hosts (default loader path)

- Default is in-process `node:vm` evaluation.
- Strong isolation is not automatic; host must provide hardened evaluator and/or out-of-process architecture for untrusted code.

### Browser hosts

- Recommended model is dedicated Web Worker evaluation with proxied runtime API.
- Browser workers can improve isolation from UI thread/state, but still require strict message validation, quota controls, and capability minimization.

### Shared principle

Across both environments, security depends more on **deployment isolation + explicit policy controls** than on API shape alone.

## Operational guidance: trusted vs untrusted plugins

### Trusted/internal plugins

Minimum posture:

- Keep permission lists minimal.
- Keep audit logs for world mutations/telemetry/artifacts.
- Run standard CI checks and version pinning.

### Untrusted/third-party plugins

Recommended posture:

- Do not run with default in-process evaluator alone.
- Execute in separate trust domain (worker/process/container) with constrained IPC API.
- Require pre-publication review and policy gates (permissions, artifact behavior, telemetry behavior).
- Apply strict runtime quotas and kill-switch controls.
- Maintain revocation/deny-list and rapid rollback path.

## Production deployer checklist

Use this checklist before enabling third-party plugins in production:

- [ ] Plugin source is pinned (immutable version + hash) and provenance reviewed.
- [ ] Plugin permissions are least-privilege and justified per plugin.
- [ ] Untrusted plugins are isolated beyond default `node:vm` (process/worker/container).
- [ ] Per-hook timeout/cancellation policy is enforced by host runtime.
- [ ] CPU/memory/throughput quotas are configured per plugin.
- [ ] Telemetry writes are rate-limited and schema-validated.
- [ ] Artifact writes are quota-limited and path-canonicalized under approved root.
- [ ] Plugin activity is audit-logged (hook calls, mutations, telemetry, artifact writes, failures).
- [ ] Incident controls exist (disable plugin, revoke package, rollback deployment).
- [ ] Security review is repeated for evaluator/runtime upgrades.

## Implementation evidence references

- Loader/evaluator and runtime API enforcement: `src/plugins/loader.ts`
- Permission model/types: `src/plugins/types.ts`
