# World Evolution Backend Trust Artifact

This artifact captures what the backend is expected to guarantee, and what it intentionally does **not** guarantee.

## Guarantees

- **Deterministic replay for identical inputs**: the same normalized snapshot + profile yields byte-equivalent run results.
- **Checkpoint/resume parity**: resuming from emitted checkpoints must converge to the same final snapshot as a single uninterrupted run.
- **Branch isolation**: running alternate profiles from the same seed snapshot must not mutate canonical input state or contaminate sibling profile branches.
- **Schema round-trip stability**: host-schema adapters (`host input -> snapshot -> host output`) preserve canonical data semantics.
- **Adapter canonicalization**: Open World host payload normalization is order-insensitive for collections and metadata maps.
- **Timeline ordering discipline**: emitted timeline events remain chronological, deterministic, and sequence-stable.
- **Tier-1 export boundary safety**: backend symbols remain outside Tier-1 root exports unless explicitly promoted through stable API policy.

## Limits

- The backend is deterministic only for supported runtime assumptions (integer/fixed-point domain and deterministic call order); nondeterministic host hooks are out of scope.
- Checkpoint parity assumes checkpoints are used as emitted snapshots, without out-of-band mutation.
- Adapter canonicalization normalizes structure/order, but does not infer missing domain entities beyond current schema rules.
- Timeline significance sorting is deterministic but still a heuristic ranking, not a causal proof.

## Operational Expectation

When backend features evolve, CI should keep these safeguards green so the backend continues to behave as a disciplined platform extension rather than an experimental side path.
