# Ananke

![CI](../../actions/workflows/ci.yml/badge.svg)
![Determinism](https://img.shields.io/badge/Determinism-%E2%9C%85%2010%2C000%2F10%2C000%20seeds%20passed%20(last%20run%3A%202026--04--03)-brightgreen)

> **Package:** `@its-not-rocket-science/ananke`  
> **Stable API contract:** [`STABLE_API.md`](STABLE_API.md)

Ananke is a deterministic simulation engine for combat and world-state replay.
Given the same seed and command stream, it produces bit-for-bit reproducible results.

---

## What it is

Ananke provides a fixed-point simulation kernel with:

- deterministic stepping (`stepWorld`)
- reproducible world creation and scenario loading
- replay capture and playback
- host/renderer bridge snapshots for downstream visualization

It is designed for lockstep networking, replay-heavy workflows, and integrations where reproducibility is non-negotiable.

---

## Golden path

For first-time adopters, use this path and stay on Tier 1 root exports.

1. Install and build:

   ```bash
   npm install
   npm run build
   ```

2. Run the guided first-hour example:

   ```bash
   npm run example:first-hour
   ```

3. Run it again to confirm deterministic output:

   ```bash
   npm run example:first-hour
   ```

4. Follow the full walkthrough:

   - [`docs/first-hour-adopter-path.md`](docs/first-hour-adopter-path.md)

Minimal Tier 1 host loop:

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

---

## Stable API

Import Tier 1 only from the package root:

```ts
import { ... } from "@its-not-rocket-science/ananke";
```

Tier 1 includes:

- fixed-point utilities (`q`, `SCALE`, conversion helpers)
- host types (`Entity`, `WorldState`, `Command`, `CommandMap`, `KernelContext`)
- creation/loading (`createWorld`, `loadScenario`, `validateScenario`)
- stepping (`stepWorld`)
- replay and serialization (`ReplayRecorder`, `replayTo`, `serializeReplay`, `deserializeReplay`)
- bridge extraction (`extractRigSnapshots`, `deriveAnimationHints`)

Stability tiers:

| Tier | Guarantee | Import style |
|---|---|---|
| **Tier 1 — Stable** | Semver-protected (breaking changes require major bump) | `@its-not-rocket-science/ananke` |
| **Tier 2 — Experimental** | May change in minor releases | `@its-not-rocket-science/ananke/tier2` or domain subpaths |
| **Tier 3 — Internal** | No stability guarantee | `@its-not-rocket-science/ananke/tier3` and internal subpaths |

Source of truth:

- [`STABLE_API.md`](STABLE_API.md)
- [`docs/stable-api-manifest.json`](docs/stable-api-manifest.json)

---

## When to use it

Use Ananke when you need:

- deterministic simulation across machines/runs
- replayability for debugging, analytics, or adjudication
- physics-grounded combat/state progression instead of ad hoc rules
- a kernel that can be integrated into Unity, Godot, web, or custom hosts

Ananke is likely the wrong fit if non-deterministic behavior is acceptable and reproducibility is not a requirement.

---

## Further reading

- [`docs/onboarding.md`](docs/onboarding.md)
- [`docs/programmers-guide.md`](docs/programmers-guide.md)
- [`docs/project-overview.md`](docs/project-overview.md)
- [`docs/versioning.md`](docs/versioning.md)
- [`docs/performance.md`](docs/performance.md)
- [`docs/emergent-validation-report.md`](docs/emergent-validation-report.md)
- [`docs/host-contract.md`](docs/host-contract.md)
- [`docs/bridge-contract.md`](docs/bridge-contract.md)
