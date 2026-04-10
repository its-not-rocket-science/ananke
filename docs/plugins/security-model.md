# Plugin Security Threat Model

This document defines the production threat model for loading Ananke plugins and maps risks to concrete controls.

> **Security posture summary:** `loadPlugin(...)` is a capability-loading API, not a turnkey sandbox.
> For trusted/internal plugins, the default runtime may be acceptable with guardrails.
> For untrusted/third-party plugins, production deployments should use stronger isolation and policy controls than the defaults.

## Scope and assumptions

### In scope

- Plugin loading and execution through `loadPlugin(...)` in `src/plugins/loader.ts`.
- Manifest-declared permissions from `plugin.json`.
- Runtime API capabilities exposed to plugin code (`readWorldState`, `mutateWorld`, `emitTelemetry`, `writeArtifact`).
- Host-side operational controls (timeouts, quotas, process isolation, filesystem layout, incident response).

### Out of scope

- Formal verification of sandbox correctness.
- Side-channel resistance (timing/cache/CPU microarchitectural channels).
- Supply-chain compromise of host dependencies outside the plugin subsystem.

### Security assumptions

- Plugin authors can be buggy, negligent, or malicious.
- Plugin source may come from public registries.
- Host application owns final policy decisions (what to load, where to execute, and with what privileges).

---

## Assets and security objectives

### Assets to protect

- **Simulation integrity:** world-state correctness and expected game/runtime behavior.
- **Host availability:** CPU, memory, I/O capacity, and event-loop responsiveness.
- **Confidentiality of runtime data:** world state, event streams, secrets accidentally present in context, and generated artifacts.
- **Artifact integrity:** downstream consumers should not be misled or compromised by plugin outputs.
- **Operational trust:** telemetry quality, audit trail accuracy, and incident recovery capability.

### Objectives

- Prevent unauthorized access to privileged host capabilities.
- Limit blast radius of malicious/buggy plugin code.
- Detect and contain abuse quickly.
- Preserve ability to disable/revoke problematic plugins without full service outage.

---

## Trust boundaries

1. **Plugin source boundary**
   - Boundary between host-controlled codebase and external plugin package (`plugin.json`, `index.js`).
   - Threat: malicious payloads, deceptive manifests, dependency confusion, tampering in transit.

2. **Manifest-to-policy boundary**
   - Plugin declares permissions; host decides whether to honor them.
   - Threat: over-broad permissions granted without review.

3. **Evaluator boundary**
   - Default evaluator uses `node:vm` minimal CommonJS sandbox.
   - Threat: evaluator escape, context confusion, unsafe API exposure.

4. **Runtime capability boundary**
   - Only methods on `PluginRuntimeApi` should be reachable.
   - Threat: capability abuse once permission is granted.

5. **Hook execution boundary**
   - Plugin handlers execute inside host lifecycle (`runHook`).
   - Threat: unbounded runtime, blocking, starvation, exception abuse.

6. **Artifact storage boundary**
   - Plugin writes data into artifact filesystem namespace.
   - Threat: disk exhaustion, path manipulation, poisoned outputs for downstream tools.

7. **Telemetry boundary**
   - Plugin can emit host-collected telemetry (if permitted).
   - Threat: exfiltration channel, log/metric poisoning, operational blind spots.

---

## Attacker model and capabilities

Assume an attacker can publish and convince operators to load a plugin. Once loaded, attacker-controlled code can:

- Execute arbitrary JavaScript **within the evaluator constraints**.
- Run hook handlers repeatedly at lifecycle trigger points.
- Use all granted runtime capabilities and intentionally stress their edge cases.
- Craft high-entropy payloads, large objects, and malformed outputs.
- Attempt to trigger evaluator/runtime bugs for sandbox escape.
- Abuse expected channels (telemetry/artifacts) for covert exfiltration.

Assume attacker **cannot** directly modify host binaries/config unless another vulnerability exists.

---

## Threat analysis by category

## 1) Sandbox escape

### Risk

The default Node path uses in-process `node:vm` with minimal bindings. This reduces accidental access to host globals but should not be treated as a complete hostile-code isolation boundary.

### Consequences

- Access to host process memory or APIs.
- Filesystem/network/process execution beyond intended plugin API.
- Full compromise of host trust domain.

### Controls

- **Recommended for untrusted plugins:** out-of-process isolation (worker/process/container/VM) with explicit IPC protocol.
- Restrict host OS/container privileges (filesystem, network egress, Linux capabilities, syscall surface where possible).
- Keep evaluator/runtime patched and regression-tested with adversarial test corpus.

## 2) Host capability abuse

### Risk

Even without sandbox escape, allowed API methods can be abused:

- `write:worldState`: integrity compromise and subtle gameplay manipulation.
- `write:telemetry`: spam, poisoning, or covert leakage of sensitive context.
- `write:artifacts`: disk abuse, misleading reports, malicious payload staging.

### Controls

- Permission minimization and explicit approval workflow per plugin.
- Host policy overlays (allow-list metrics, artifact path patterns, hook-level gates).
- Auditing that binds action to plugin ID + hook + timestamp.

## 3) Denial of service (DoS)

### Risk

- Expensive synchronous loops in hooks.
- High-frequency hook abuse causing event-loop starvation.
- Memory blowups via oversized payloads/artifacts.
- Flooding telemetry/artifact outputs.

### Controls

- Per-hook timeout and cancellation policy.
- CPU/memory quotas and isolation boundaries.
- Per-plugin rate/size quotas for telemetry and artifacts.
- Circuit breakers / kill switches for misbehaving plugins.

## 4) Artifact exfiltration and poisoning

### Risk

Artifacts can become a data-exfiltration and downstream-attack channel.

- Sensitive context serialized to files and exported by external systems.
- Filename/content tricks that confuse parsers or operators.
- Excess artifact churn masking malicious outputs.

### Controls

- Canonical path verification under approved root.
- File extension/content-type policy for machine-consumed artifacts.
- Quotas + retention windows + malware/content scanning where appropriate.
- Segregated storage and reduced read access for consumers.

## 5) Telemetry exfiltration and poisoning

### Risk

Telemetry is an intentional output channel and can be abused for covert transfer or operational deception.

### Controls

- Schema validation, size limits, namespace allow-listing.
- Per-plugin event-rate quotas and anomaly detection.
- Separate internal-only metrics from plugin-controlled streams.

---

## Browser vs Node threat differences

## Node hosts

- Default implementation path is in-process `node:vm` evaluation.
- Primary risk: single-process compromise blast radius if evaluator boundary fails.
- Strong recommendation for untrusted code: separate process/container with restricted OS permissions and explicit IPC API.

## Browser hosts

- Preferred model is dedicated Web Worker execution with message-passed runtime API.
- Strength: better separation from UI thread by default.
- Residual risks: message validation bugs, resource exhaustion in worker, data leakage through postMessage channels.

## Shared principle

In both environments, plugin security is primarily achieved by **defense in depth**: strict capability policy + isolation + quotas + monitoring + incident response.

---

## Trusted vs untrusted plugin deployment recommendations

## Trusted/internal plugins (same organization, reviewed source)

Minimum recommended controls:

- Enforce least-privilege permissions.
- CI validation and pinned versions.
- Audit logs for mutations, telemetry, and artifact writes.
- Operational kill switch.

## Untrusted/third-party plugins (public/community source)

Production recommended controls:

- Do not rely on default in-process evaluator alone.
- Run in isolated trust domain (process/container/worker with hardened IPC).
- Apply strict runtime budgets (time, memory, output volume).
- Require policy review before enablement.
- Continuous monitoring + fast revocation/rollback path.

---

## Guaranteed today vs deployment hardening vs future work

## Guaranteed today (based on current implementation)

The following are implemented in `src/plugins/loader.ts` / `src/plugins/types.ts`:

- Plugin evaluation uses minimal CommonJS sandbox with `node:vm` by default.
- Initial module evaluation is constrained with a 100 ms VM timeout.
- Runtime permission checks enforce:
  - `mutateWorld` requires `write:worldState`
  - `emitTelemetry` requires `write:telemetry`
  - `writeArtifact` requires `write:artifacts`
- `readWorldState` returns deep-frozen `structuredClone` data.
- Artifacts are written under `<artifactsRoot>/<pluginId>/<path>`.
- Host can provide custom `evaluator` option.

## Recommended deployment hardening (not guaranteed by default)

- Isolate untrusted plugins out of process.
- Enforce per-hook timeout/cancellation and runtime budgets.
- Enforce memory, telemetry, and artifact quotas.
- Canonicalize and verify artifact paths remain under approved root.
- Restrict telemetry schemas/namespaces.
- Run with least-privilege OS/container identity.
- Implement deny-list/revocation and one-click disable.

## Future work (explicitly not complete today)

- First-class built-in hook timeout/cancellation in core runtime.
- Built-in quota manager for telemetry/artifacts and payload sizes.
- Stronger default path canonicalization and artifact policy controls.
- Optional signed plugin manifests/modules and provenance verification.
- Security event stream spec for standardized audit integrations.

---

## Deployment checklist

A standalone checklist is maintained in:

- `docs/plugins/deployment-checklist.md`

Use that checklist during production readiness and change reviews.

---

## Implementation evidence

- `src/plugins/loader.ts`
- `src/plugins/types.ts`
