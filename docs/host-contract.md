# Ananke — Host Integration Contract

This document covers **Tier 1 only**.

- Stable path: `@its-not-rocket-science/ananke`
- Tier 1 symbol manifest: `docs/stable-api-manifest.json`
- Stability table: `STABLE_API.md`

Anything not in Tier 1 must be imported from explicit Tier 2 / Tier 3 subpaths.

---

## 1) World creation

```ts
import { createWorld } from "@its-not-rocket-science/ananke";
import type { EntitySpec } from "@its-not-rocket-science/ananke";

const specs: EntitySpec[] = [
  { id: 1, teamId: 1, seed: 11, archetype: "AMATEUR_BOXER", weaponId: "fists" },
  { id: 2, teamId: 2, seed: 22, archetype: "AMATEUR_BOXER", weaponId: "fists" },
];

const world = createWorld(42, specs);
```

## 2) Scenario loading

```ts no-check-example
import { loadScenario, validateScenario } from "@its-not-rocket-science/ananke";

const errors = validateScenario(jsonScenario);
if (errors.length) throw new Error(errors.join("\n"));

const world = loadScenario(jsonScenario);
```

## 3) Step contract

```ts no-check-example
import { stepWorld, q } from "@its-not-rocket-science/ananke";
import type { CommandMap, KernelContext } from "@its-not-rocket-science/ananke";

const cmds: CommandMap = new Map();
const ctx: KernelContext = { tractionCoeff: q(0.80) };

stepWorld(world, cmds, ctx); // mutates world, increments world.tick by 1
```

## 4) Replay / serialization

```ts no-check-example
import {
  ReplayRecorder,
  replayTo,
  serializeReplay,
  deserializeReplay,
} from "@its-not-rocket-science/ananke";

const rec = new ReplayRecorder(world);
rec.record(world.tick, cmds);
stepWorld(world, cmds, ctx);

const replay = rec.toReplay();
const json = serializeReplay(replay);
const replay2 = deserializeReplay(json);
const worldAtTick = replayTo(replay2, 1, ctx);
```

## 5) Bridge extraction

```ts no-check-example
import { extractRigSnapshots, deriveAnimationHints } from "@its-not-rocket-science/ananke";

const snapshots = extractRigSnapshots(world);
const hints = deriveAnimationHints(world.entities[0]!);
```

## 6) Non-tier-1 imports

Use explicit subpaths for non-stable APIs:

```ts
import { BridgeEngine } from "@its-not-rocket-science/ananke/tier2";
import { resolveTacticalEngagement } from "@its-not-rocket-science/ananke/tier3";
```
