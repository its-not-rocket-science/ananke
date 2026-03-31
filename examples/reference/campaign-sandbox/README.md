# Campaign Sandbox — Reference Build

A turn-based world simulation demonstrating Ananke's campaign layer end-to-end.  Four
polities — Rome, Carthage, Athens, Sparta — develop through trade, alliances, population
dynamics, and a mid-game plague.  The simulation ends with a save/reload round-trip.

## What it demonstrates

| System | What you see |
|---|---|
| **Polity economics** | `stepPolityDay` — treasury accumulation, trade income, morale/stability |
| **Population dynamics** | `stepPolityPopulation` — birth/death rates, carrying capacity |
| **Migration** | `computeMigrationFlow` + `applyMigrationFlows` — people move toward stability |
| **Epidemic** | `createEpidemicState`, `stepEpidemic`, `spreadEpidemic` — plague spreads via trade |
| **Diplomacy** | `signTreaty`, `stepTreatyStrength` — trade pact, military alliance |
| **Tech diffusion** | `stepTechDiffusion` — Medieval Rome's technology spreads to Ancient neighbours |
| **Save/reload** | `stampSnapshot` + `validateSnapshot` — campaign state round-trip |

## Run

```bash
npm run build
npm run ref:campaign-sandbox              # seed 42, 180 days
npm run ref:campaign-sandbox -- 7 360    # seed 7, 360 days
```

## Architecture

```
examples/reference/campaign-sandbox/index.ts
  └─ src/polity.ts            createPolity, createPolityRegistry, stepPolityDay
  └─ src/demography.ts        stepPolityPopulation
  └─ src/migration.ts         computePushPressure, computePullFactor,
  │                           computeMigrationFlow, applyMigrationFlows
  └─ src/epidemic.ts          createEpidemicState, stepEpidemic, spreadEpidemic
  └─ src/sim/disease.ts       getDiseaseProfile (plague_pneumonic)
  └─ src/diplomacy.ts         signTreaty, stepTreatyStrength, createTreatyRegistry
  └─ src/tech-diffusion.ts    stepTechDiffusion
  └─ src/schema-migration.ts  stampSnapshot, validateSnapshot
```

## Package choices

| Package | Why |
|---|---|
| `@ananke/campaign` | Polity, demography, migration, epidemic — the core campaign layer |
| `diplomacy.ts` | Treaty lifecycle — separate from polity to allow granular import |
| `tech-diffusion.ts` | Technology spread along trade routes |
| `schema-migration.ts` | Save format — compatible across Ananke minor versions |

## Performance envelope

| Metric | Typical value |
|---|---|
| Polities | 4 |
| Days simulated | 180 |
| Total time | < 50 ms |
| Avg per day | < 0.3 ms |

Scales well: 20 polities with full migration and epidemic steps stays under 5 ms/day on
modern hardware.

## Pain points resolved

- **`TechEra.Classical` doesn't exist** — `TechEra` skips "Classical"; the sequence is
  `Prehistoric → Ancient → Medieval → EarlyModern → ...`.  Athens and Sparta both start at
  `TechEra.Ancient`.
- **`stepPolityPopulation` signature** — takes `(polity, elapsedDays, deathPressure_Q?,
  foodSupply_Q?)`, not the `(polity, pairs, seed, day)` pattern used by `stepPolityDay`.
- **`stepTreatyStrength` signature** — takes `(treaty, boostDelta_Q?)`, not a context
  object.  Pass no second argument for natural daily decay.
- **`TreatyRegistry.treaties` is a Map, not an array** — use `.values()` to iterate.
- **`stampSnapshot` schema kind** — `SchemaKind` is `"world" | "replay" | "campaign"`;
  use `"campaign"` for polity saves, not a version string like `"0.1"`.
- **`spreadEpidemic` needs a `DiseaseProfile`** — import `getDiseaseProfile(id)` from
  `src/sim/disease.ts`; it returns `undefined` for unknown ids (check before use).

## Extending this build

To add warfare, import from `src/polity.ts`:
```typescript
import { declareWar, stepSiege } from "../../../src/polity.js";
declareWar(registry, "rome", "carthage", SEED, 30);
```

To add a famine event, pass `foodSupply_Q` to `stepPolityPopulation`:
```typescript
stepPolityPopulation(polity, 1, undefined, q(0.15)); // food at 15% → famine
```
