# Planned Protocol Work

This page contains roadmap/proposed protocol details that are **not** current shipped contracts.

## Planned canonical lockstep message envelope

Proposed message kinds (not shipped as a canonical module yet):

- `cmd` (client → host/server): tick + command payload
- `ack` (host/server → client): tick + deterministic state hash
- `resync` (host/server → client): authoritative snapshot payload
- `hash_mismatch` (host/server → client): mismatch diagnostics

## Planned transport encodings

Candidate transport encodings for production optimization (not shipped as core helpers):

- CBOR
- MessagePack

## Scope note

Until these land as exported modules/helpers, host applications should treat protocol envelopes and transport encoding as host-defined integration code.
