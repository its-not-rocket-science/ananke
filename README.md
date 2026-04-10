# Ananke

![CI](../../actions/workflows/ci.yml/badge.svg)
![Determinism](https://img.shields.io/badge/Determinism-%E2%9C%85%2010%2C000%2F10%2C000%20seeds%20passed%20(last%20run%3A%202026--04--03)-brightgreen)

> **Package:** `@its-not-rocket-science/ananke`  
> **Stable API contract:** [`STABLE_API.md`](STABLE_API.md)

Ananke is a **deterministic combat simulation kernel**.

If you run the same seed + same command stream, you get the same outcome. That is the core promise.

## Start here (first 10 minutes)

Use only Tier-1 root exports for your first integration.

1. Install dependencies.

   ```bash
   npm install
   ```

2. Build once.

   ```bash
   npm run build
   ```

3. Run the guided adopter example.

   ```bash
   npm run example:first-hour
   ```

4. Run it again (same output = deterministic behavior confirmed).

   ```bash
   npm run example:first-hour
   ```

5. If you want the full walkthrough, continue with [`docs/first-hour-adopter-path.md`](docs/first-hour-adopter-path.md).

## Golden path (Tier-1 only)

```ts
import { createWorld, stepWorld, q, type CommandMap } from "@its-not-rocket-science/ananke";

const world = createWorld(7, [
  { id: 1, teamId: 1, seed: 7001, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword", armourId: "arm_mail", x_m: -1.2 },
  { id: 2, teamId: 2, seed: 7002, archetype: "HUMAN_BASE", weaponId: "wpn_club", x_m: 1.2 },
]);

for (let tick = 0; tick < 180; tick++) {
  const commands: CommandMap = new Map([
    [1, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
    [2, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
  ]);
  stepWorld(world, commands, { tractionCoeff: q(0.9) });
}
```

That loop is the integration baseline: create world, issue commands, step deterministically.

## Tier-1 API surface (stable)

Import Tier-1 from root only:

```ts
import { ... } from "@its-not-rocket-science/ananke";
```

Tier-1 is intentionally small:

- fixed-point utilities (`q`, `SCALE`, conversion helpers)
- host types (`Entity`, `WorldState`, `Command`, `CommandMap`, `KernelContext`)
- world creation/scenario loading (`createWorld`, `loadScenario`, `validateScenario`)
- stepping (`stepWorld`)
- replay serialization (`ReplayRecorder`, `replayTo`, `serializeReplay`, `deserializeReplay`)
- bridge extraction (`extractRigSnapshots`, `deriveAnimationHints`)

Source of truth:

- [`docs/public-contract.md`](docs/public-contract.md)
- [`STABLE_API.md`](STABLE_API.md)
- [`docs/stable-api-manifest.json`](docs/stable-api-manifest.json)

All subpath exports are shipped-but-not-Tier-1 unless explicitly documented as subpath-stable.

## What this project is not

Ananke is **not**:

- a game engine (rendering, scene graphs, input systems)
- a complete networking stack
- a batteries-included content pipeline
- a no-code world builder
- a guarantee that Tier-2/Tier-3 symbols will stay stable

If you need deterministic kernel behavior with host-controlled integration, it is a fit.

## Beyond the first integration

After your first deterministic loop succeeds, then explore broader modules and ecosystem docs:

- [`docs/host-contract.md`](docs/host-contract.md)
- [`docs/bridge-contract.md`](docs/bridge-contract.md)
- [`docs/wire-protocol.md`](docs/wire-protocol.md)
- [`docs/module-index.md`](docs/module-index.md)
- [`docs/project-overview.md`](docs/project-overview.md)
- [`docs/recipes-matrix.md`](docs/recipes-matrix.md)

## Clean map

- **Use Tier-1 if you are integrating.**
- **Use Tier-2 if you are experimenting.**
- **Read `project-overview` only after the first successful integration.**
