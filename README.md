# Ananke

![CI](../../actions/workflows/ci.yml/badge.svg)
![Determinism](https://img.shields.io/badge/Determinism-%E2%9C%85%2010%2C000%2F10%2C000%20seeds%20passed%20(last%20run%3A%202026--04--03)-brightgreen)

> **Package:** `@its-not-rocket-science/ananke`  
> **Stable API contract:** [`STABLE_API.md`](STABLE_API.md)

## What it is

Ananke is a deterministic simulation kernel for host applications.

Core contract:

- same initial world state
- same command stream
- same tick count
- same engine version

=> same outcome.

The package is designed so you can keep rendering, networking, persistence, and tooling in your own stack while delegating deterministic simulation to Ananke.

## Why you would use it

Use Ananke when you need deterministic simulation you can reproduce and verify:

- lockstep or replayable simulation loops
- authoritative host control over commands and timing
- repeatable test fixtures for simulation behavior
- strict root-import API for long-lived integrations

Do **not** adopt it if you want a full game engine, visual editor, or turnkey networking/runtime platform.

## 10-minute success path

1. Install and build.

   ```bash
   npm install
   npm run build
   ```

2. Run the guided first-hour example (prints deterministic markers).

   ```bash
   npm run example:first-hour
   ```

3. Run the measurable smoke verification.

   ```bash
   npm run test:first-hour-smoke
   ```

4. Follow the first-hour funnel: [`docs/first-hour-adopter-path.md`](docs/first-hour-adopter-path.md).

Minimal deterministic loop:

```ts example
import { createWorld, q, stepWorld, type CommandMap } from "@its-not-rocket-science/ananke";

const world = createWorld(1337, [
  { id: 1, teamId: 1, seed: 10, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword", armourId: "arm_mail", x_m: -1.2 },
  { id: 2, teamId: 2, seed: 11, archetype: "HUMAN_BASE", weaponId: "wpn_club", x_m: 1.2 },
]);

const commands: CommandMap = new Map([
  [1, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
  [2, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
]);

stepWorld(world, commands, { tractionCoeff: q(0.9) });
```

## Stable API promise

For semver stability, import from the package root only:

```ts
import { createWorld, stepWorld, q, type CommandMap } from "@its-not-rocket-science/ananke";
```

Tier-1 root exports are the stability boundary documented in:

- [`STABLE_API.md`](STABLE_API.md)
- [`docs/public-contract.md`](docs/public-contract.md)
- [`docs/stable-api-manifest.json`](docs/stable-api-manifest.json)

Subpath modules are shipped and supported, but are **not** part of the Tier-1 semver contract unless explicitly called out as stable.

## What is actually stable today

Stable today means Tier-1 root exports from `@its-not-rocket-science/ananke`:

- fixed-point primitives and helpers (`q`, `SCALE`, related conversion/math utilities)
- host-facing types (`Entity`, `WorldState`, `Command`, `CommandMap`, `KernelContext`)
- deterministic world/scenario entry points (`createWorld`, `loadScenario`, `validateScenario`)
- deterministic stepping (`stepWorld`)
- replay helpers (`ReplayRecorder`, `replayTo`, `serializeReplay`, `deserializeReplay`)
- bridge snapshot extraction (`extractRigSnapshots`, `deriveAnimationHints`)

If you need long-term compatibility, keep production integrations on this root Tier-1 surface.

## What is shipped but not semver-stable

These are available exports but outside the Tier-1 semver promise (unless separately documented):

- most subpath modules in `package.json#exports` (for example `./combat`, `./character`, `./tier2`, `./tier3`, `./netcode`, `./host-loop`)
- emerging or advanced modules that may change shape between minor releases
- exploratory integration helpers and higher-order systems

Treat these surfaces as adopt-with-version-pinning.

## Next steps after the first hour

- Game/server integrator: [`docs/host-contract.md`](docs/host-contract.md)
- Renderer integrator: [`docs/bridge-contract.md`](docs/bridge-contract.md)

## What this project is not

Ananke is not:

- a rendering engine or scene graph
- a complete networking stack
- a content-authoring GUI
- a no-code simulation builder
- a guarantee that every shipped subpath export is semver-stable

If you need deterministic simulation as a kernel inside a host-owned stack, it is likely a fit.
