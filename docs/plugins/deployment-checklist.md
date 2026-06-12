# Plugin Deployment Security Checklist

Use this checklist before enabling plugins in staging/production, especially when plugin loading is public or third-party.

## 0) Scope and classification

- [ ] Classify each plugin as **trusted/internal** or **untrusted/third-party**.
- [ ] Document plugin owner, source repository, and operational contact.
- [ ] Define allowed environments (dev/staging/prod) per plugin.

## 1) Supply chain and provenance

- [ ] Pin plugin to immutable version + content hash.
- [ ] Verify source/provenance before first enablement.
- [ ] Record manifest/module URLs and review date.
- [ ] Keep a deny-list/revocation mechanism for compromised plugins.

## 2) Permission review

- [ ] Review `plugin.json` permissions for least privilege.
- [ ] Reject plugins requesting write capabilities without clear business need.
- [ ] Record justification for each granted permission.
- [ ] Re-review permissions on every plugin upgrade.

## 3) Isolation strategy

- [ ] For untrusted plugins, use isolated runtime (process/container/worker) instead of default in-process evaluator.
- [ ] Restrict filesystem, process, and network privileges for plugin runtime.
- [ ] Use explicit IPC contract between host and plugin runtime.
- [ ] Ensure one plugin failure cannot crash or stall core host process.

## 4) Runtime resource controls

- [ ] Enforce per-hook execution timeout/cancellation.
- [ ] Apply CPU and memory budgets per plugin.
- [ ] Set concurrency limits for simultaneous plugin executions.
- [ ] Add automatic disable/circuit-breaker on repeated failures/timeouts.

## 5) Telemetry controls

- [ ] Require schema validation for plugin telemetry payloads.
- [ ] Enforce metric namespace allow-list per plugin.
- [ ] Rate-limit telemetry events and payload size.
- [ ] Alert on anomaly spikes and suspicious metric patterns.

## 6) Artifact controls

- [ ] Canonicalize artifact paths and verify they stay under approved root.
- [ ] Enforce artifact count and byte quotas per plugin.
- [ ] Restrict allowed file extensions/content types as needed.
- [ ] Apply retention and cleanup policy to prevent storage exhaustion.
- [ ] Treat plugin artifacts as untrusted input for downstream consumers.

## 7) Auditability and incident response

- [ ] Log plugin lifecycle events (load/unload/version/permission set).
- [ ] Log hook execution outcomes (duration, errors, timeouts).
- [ ] Log side effects (world mutations, telemetry writes, artifact writes).
- [ ] Maintain runbook for emergency plugin disable and rollback.
- [ ] Test incident response at least once per release cycle.

## 8) Environment-specific checks

### Node deployments

- [ ] Do not treat in-process `node:vm` as sufficient isolation for untrusted plugins.
- [ ] Run plugin runtime with least-privilege OS identity and constrained filesystem/network.

### Browser deployments

- [ ] Execute plugins in dedicated Worker when possible.
- [ ] Validate all `postMessage` payloads and enforce strict message schema.
- [ ] Apply worker-level budgets and termination policy on abuse.

## 9) Pre-production go/no-go gate

- [ ] All checklist items above reviewed and signed off.
- [ ] Security caveat is visible in operator/public plugin-loading docs.
- [ ] Rollback path tested in staging with synthetic malicious plugin behavior.

If any critical control is missing, do not enable untrusted plugins in production.
