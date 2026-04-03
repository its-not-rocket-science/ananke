# Ananke — Programmer's Guide

![CI](../../actions/workflows/ci.yml/badge.svg)
[![Mod of the Week](https://img.shields.io/badge/Mod%20of%20the%20Week-Submit%20Yours-blueviolet)](docs/mod-of-the-week.md)
[![Determinism](https://img.shields.io/badge/Determinism-%E2%9C%85%2010%2C000%2F10%2C000%20seeds%20passed%20(last%20run%3A%202026--04--03)-brightgreen)](https://its-not-rocket-science.github.io/ananke/determinism-report/)

> **Package:** `@its-not-rocket-science/ananke`  
> **Stable API contract:** [`STABLE_API.md`](STABLE_API.md)

Ananke is a deterministic, fixed-point simulation engine for combat and world-state replay.  
Given the same seed and command stream, results are bit-for-bit reproducible.

---

## Golden path (new adopters, first 60 minutes)

This is the **only recommended onboarding path** for first-time users. It uses **Tier 1 stable root exports only**.

1. Install dependencies and build:

   ```bash
   npm install
   npm run build
   ```

2. Run the guided first-hour example:

   ```bash
   npm run example:first-hour
   ```

3. Re-run once to confirm determinism:

   ```bash
   npm run example:first-hour
   ```

4. Follow the full walkthrough:

   - [`docs/first-hour-adopter-path.md`](docs/first-hour-adopter-path.md)

### Minimal host loop (Tier 1 only)

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

## Stable API quick reference (Tier 1)

Import only from the package root:

```ts
import { ... } from "@its-not-rocket-science/ananke";
```

Tier 1 includes:

- Fixed-point utilities (`q`, `SCALE`, conversion helpers)
- Host types (`Entity`, `WorldState`, `Command`, `CommandMap`, `KernelContext`)
- World/scenario creation (`createWorld`, `loadScenario`, `validateScenario`)
- Stepping (`stepWorld`)
- Replay/serialization (`ReplayRecorder`, `replayTo`, `serializeReplay`, `deserializeReplay`)
- Bridge extraction (`extractRigSnapshots`, `deriveAnimationHints`)

See [`STABLE_API.md`](STABLE_API.md) and [`docs/stable-api-manifest.json`](docs/stable-api-manifest.json) for the source of truth.

---

## Advanced and internal paths (not first-hour)

These are intentionally separated from onboarding because they may use Tier 2/Tier 3 or internal file-level imports.

### Advanced examples

- `examples/quickstart-combat.ts`
- `examples/quickstart-campaign.ts`
- `examples/quickstart-species.ts`
- `examples/lockstep-server.ts`
- `examples/rollback-client.ts`
- `examples/reference/**`

### Advanced docs

- [`docs/integration-primer.md`](docs/integration-primer.md)
- [`docs/cookbook.md`](docs/cookbook.md)
- [`docs/recipes-matrix.md`](docs/recipes-matrix.md)
- [`docs/host-contract.md`](docs/host-contract.md)
- [`docs/bridge-contract.md`](docs/bridge-contract.md)

---

## API stability tiers

| Tier | Guarantee | Import style |
|---|---|---|
| **Tier 1 — Stable** | Semver-protected (breaking changes require major bump) | `@its-not-rocket-science/ananke` |
| **Tier 2 — Experimental** | May change in minor releases | `@its-not-rocket-science/ananke/tier2` or domain subpaths |
| **Tier 3 — Internal** | No stability guarantee | `@its-not-rocket-science/ananke/tier3` and internal subpaths |

---

## Further reading

- [`docs/project-overview.md`](docs/project-overview.md)
- [`docs/versioning.md`](docs/versioning.md)
- [`docs/performance.md`](docs/performance.md)
- [`docs/emergent-validation-report.md`](docs/emergent-validation-report.md)
- [`docs/golden-path-improvement-plan.md`](docs/golden-path-improvement-plan.md)
- [`docs/mod-of-the-week.md`](docs/mod-of-the-week.md)
