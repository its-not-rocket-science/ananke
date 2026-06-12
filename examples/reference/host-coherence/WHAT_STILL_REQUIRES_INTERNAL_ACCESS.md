# What Still Requires Internal Access

This reference app intentionally avoids Tier 2 and internal dependencies.

Areas still likely to require internal or deeper integration work for production hosts:

- authoritative multiplayer transport + rollback netcode wiring
- production-grade telemetry ingestion and long-term storage
- content tooling pipelines (pack authoring UX, schema migration automation)
- hard real-time profiling hooks and custom runtime instrumentation
- platform-specific render/runtime bridges beyond the stable snapshot/hints surface
