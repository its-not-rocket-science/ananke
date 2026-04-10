# Ananke — Netcode Host Checklist

A reference for implementing deterministic multiplayer on top of Ananke.
Ananke guarantees that `stepWorld(world, cmds, ctx)` is a pure function: same
inputs always produce the same output.  The host's job is to ensure that every
participant applies exactly the same inputs at every tick.

---

## 1. Fixed tick rate

| Requirement | Why it matters |
|---|---|
| All peers must agree on a single `tickHz` value before the session starts. | Tick numbers are used as RNG seeds (`eventSeed(worldSeed, tick, ...)`).  A peer that runs at a different rate will diverge immediately. |
| Use `DEFAULT_TICK_HZ = 20` from `@its-not-rocket-science/ananke/host-loop` unless you have a specific reason to change it. | Empirically validated in the integration test suite. |
| Never skip ticks to "catch up".  If a peer falls behind, buffer and process each tick in order. | Skipping changes the tick counter and therefore every downstream RNG call. |

---

## 2. No wall-clock reads in the simulation path

| Requirement | Why it matters |
|---|---|
| Never call `Date.now()`, `performance.now()`, or any OS-clock function inside `stepWorld` or any function it calls. | These calls return different values on different machines and at different times, breaking determinism. |
| Time passed to simulation functions (e.g., `elapsedSeconds` in `stepAging`, `stepSleep`) must be derived from `tick / tickHz`, not from wall time. | Wall time drifts; tick-derived time is identical on every peer. |
| KernelContext is the only legitimate way to pass external state into `stepWorld`. | It is pure data — the same struct must be sent to every peer each tick. |

---

## 3. Input serialisation format

All inputs must be serialised into a `CommandMap` before being applied.
A `CommandMap` is `Map<entityId: number, Command[]>`.

```typescript pseudocode
// The canonical command type
import type { Command } from "@its-not-rocket-science/ananke";

// Example: encode an attack command as a plain object ready for JSON
const encoded = {
  entityId: 1,
  commands: [
    { kind: "attack", targetId: 2, weaponId: "wpn_longsword", intensity: 10000 },
  ],
};
```

| Rule | Details |
|---|---|
| All `intensity` values are fixed-point Q (integer).  `q(1.0) = 10000`. | Never use floating-point for command parameters — different float-to-int rounding can desync peers. |
| Absent commands and empty `[]` are equivalent to "no input".  Both result in the entity running its default idle behaviour. | |
| The server is the authority on which commands are accepted each tick.  Clients send their intent; the server decides the canonical `CommandMap`. | This prevents cheating and input-injection attacks. |
| Include the tick number with every input message. | Out-of-order or late messages can be discarded or buffered correctly. |

---

## 4. Desync detection with `hashWorldState`

```typescript pseudocode
import { hashWorldState } from "@its-not-rocket-science/ananke/netcode";

// After each tick on each peer:
const hash = hashWorldState(world);

// Send to server (or compare peer-to-peer):
sendToServer({ tick: world.tick, hash: hash.toString() });

// On the server:
if (serverHash !== BigInt(receivedHash)) {
  // Desync detected — initiate resync
}
```

The hash covers `tick`, `seed`, and all entity state sorted by `id`.  Subsystem
state (`runtimeState.sensoryEnv`, `runtimeState.factionRegistry`, etc. within `runtimeState`) is excluded — it is not part
of the deterministic simulation core.

---

## 5. State resync (full snapshot transfer)

When a desync is detected, the authoritative server sends a full world snapshot:

```typescript pseudocode
// Server
import { serializeReplay } from "@its-not-rocket-science/ananke";

// Quick snapshot (not full replay): just send the current WorldState
const snapshot = JSON.stringify(world);
sendToDesyncedClient(snapshot);

// Client
world = JSON.parse(snapshotJson);
```

> **Note:** `WorldState` contains `Map` fields (`armourState`, `foodInventory`,
> `reputations`).  If you use `JSON.stringify` directly, Maps will be serialised
> as `{}`.  Use `serializeReplay` / `deserializeReplay` for reliable round-trips,
> or implement your own Map-aware serialiser.

---

## 6. Replay recording and diff

Record replays from both clients to diagnose persistent desyncs:

```typescript pseudocode
// Both peers record their replay
import { ReplayRecorder, serializeReplay } from "@its-not-rocket-science/ananke";

const recorder = new ReplayRecorder(world);
for each tick:
  recorder.record(world.tick, cmds);
  stepWorld(world, cmds, ctx);

// Write to disk
fs.writeFileSync("client-a.json", serializeReplay(recorder.toReplay()));
```

Then diff them from the CLI:

```bash
npx ananke replay diff client-a.json client-b.json
```

Output:
- `✓  Replays are identical` — no divergence in the compared ticks
- `✗  Divergence at tick N` — shows the first tick where hashes differed and the hex values

---

## 7. Rollback implementation outline

For games requiring low-latency feel (fast inputs, high RTT tolerance):

1. **Snapshot** `structuredClone(world)` before each predicted tick.
2. **Predict**: apply the client's own inputs speculatively.
3. **Reconcile** when server ACK arrives:
   - If `hashWorldState(predictedWorld) === serverHash` → discard snapshot.
   - Otherwise → restore snapshot, re-apply all unacknowledged inputs using the server's authoritative command sequence.

See `examples/rollback-client.ts` for a self-contained implementation.

---

## 8. KernelContext consistency

Every peer must use an identical `KernelContext` each tick.  Differences in
optional fields will cause silent divergence:

| Field | Guidance |
|---|---|
| `tractionCoeff` | Broadcast from server or derive from agreed terrain. |
| `terrainGrid`, `obstacleGrid` | Load from the same immutable map file; do not mutate after session start. |
| `weather` | Authoritative server generates weather; broadcast `WeatherState` each tick. |
| `ambientTemperature_Q`, `thermalAmbient_Q` | Derive from weather or broadcast. |
| `trace` | Never include in networked context — trace sinks are local-only. |

---

## Quick reference

```
tickHz            — agreed at session start, never changes mid-session
stepWorld         — call once per tick, same (world, cmds, ctx) on all peers
hashWorldState    — compare after every step; mismatch = resync
serializeReplay   — record both sides of a session for post-mortem diff
ananke replay diff — CLI: find the first divergence tick between two replays
```
