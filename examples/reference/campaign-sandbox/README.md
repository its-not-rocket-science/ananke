# Campaign Sandbox — Reference Build

Turn-based world simulation: four polities across 180 days of trade, feudal bonds,
military campaigning, plague, migration, and tech diffusion — ending with a
deterministic save/reload round-trip.

## What it demonstrates

| System | What you see |
|---|---|
| **Polity economics** | `stepPolityDay` — treasury, trade income, morale/stability cycles |
| **Military campaigns** | `declareWar`, `makePeace`, `resolveWarOutcome` (auto via `stepPolityDay`) — Rome attacks Carthage on day 30; territory changes hands |
| **Feudal bonds** | `createVassalBond`, `applyDailyTribute`, `stepBondStrength`, `isRebellionRisk` — Sparta as Rome's vassal; loyalty decays from 65% to ~11% with rebellion warnings |
| **Population dynamics** | `stepPolityPopulation` — birth/death rates, carrying capacity |
| **Migration** | `computeMigrationFlow` + `applyMigrationFlows` — people move toward stability |
| **Epidemic** | `createEpidemicState`, `stepEpidemic`, `spreadEpidemic` — plague spreads from Carthage to Athens via trade |
| **Diplomacy** | `signTreaty`, `stepTreatyStrength` — trade pact, military alliance, natural decay |
| **Tech diffusion** | `stepTechDiffusion` — Medieval Rome's tech spreads to Ancient neighbours |
| **Save/reload** | `stampSnapshot` — campaign state round-trip including feudal bond data |

## Run

```bash
npm run build
npm run ref:campaign-sandbox              # seed 42, 180 days
npm run ref:campaign-sandbox -- 7 360    # seed 7, 360 days
```

## Sample output

```
── Day   0 ──────────────────────────────────────────────────────────
  Rome     pop=250.0k trs=8000cu mil=42% stb=70% mor=65%  vassals=[sparta:65%]
  Sparta   pop= 90.0k trs=3000cu mil=32% stb=70% mor=65%  liege=rome(bond:65%)
  ...

*** Day 30: Rome declares war on Carthage!
    Rome mil 53% (incl. Sparta levy 5%) vs Carthage 41% ***

*** Day 70: Peace! Rome 2 territories | Carthage 1 territories ***

*** Day 72: Plague breaks out in Carthage! ***
*** Day 72: Plague spreads to Athens via trade! ***

*** Day 150: Sparta (bond 20%) is at rebellion risk! ***

── Day 180 ──────────────────────────────────────────────────────────
  Rome      pop=255.1k  trs=16327cu  mil=65%  territories=2
  Carthage  pop=  0.0k  trs=9438cu   mil= 0%  (plague)
  Athens    pop=  2.8k  trs=14953cu  mil= 2%  (plague)
  Sparta    pop= 93.2k  trs=5076cu   mil=61%  bond=11% [REBELLION RISK]
```

## Architecture

```
examples/reference/campaign-sandbox/index.ts
  └─ src/polity.ts         createPolity, stepPolityDay, declareWar, makePeace,
  │                        resolveWarOutcome (called by stepPolityDay)
  └─ src/feudal.ts         createFeudalRegistry, createVassalBond, applyDailyTribute,
  │                        computeLevyStrength, stepBondStrength, isRebellionRisk
  └─ src/demography.ts     stepPolityPopulation
  └─ src/migration.ts      computePushPressure, computePullFactor,
  │                        computeMigrationFlow, applyMigrationFlows
  └─ src/epidemic.ts       createEpidemicState, stepEpidemic, spreadEpidemic
  └─ src/sim/disease.ts    getDiseaseProfile (plague_pneumonic)
  └─ src/diplomacy.ts      signTreaty, stepTreatyStrength, createTreatyRegistry
  └─ src/tech-diffusion.ts stepTechDiffusion
  └─ src/schema-migration.ts stampSnapshot
```

## Day-by-day flow

```
Each day:
  1. stepPolityDay(registry, pairs, seed, day)
       └─ trade phase: compute income for non-warring pairs
       └─ war phase:   resolveWarOutcome per active war (auto)
       └─ morale/stability phase
  2. stepTechDiffusion
  3. applyDailyTribute + stepBondStrength (feudal)
  4. stepPolityPopulation (demography)
  5. computeMigrationFlow + applyMigrationFlows
  6. stepTreatyStrength (diplomacy)
  7. stepEpidemic + spreadEpidemic (from day PLAGUE_DAY)
```

## Performance envelope

| Metric | Value |
|---|---|
| Polities | 4 |
| Days simulated | 180 |
| Total time | ~22ms |
| Avg per day | ~0.12ms |

Scales well: 20 polities with full migration, feudal, and epidemic stays under 2 ms/day.

## Pain points resolved

- **`TechEra.Classical` doesn't exist** — sequence is `Prehistoric → Ancient → Medieval → EarlyModern`. Athens and Sparta start at `TechEra.Ancient`.
- **`resolveWarOutcome` is called automatically** by `stepPolityDay` for every entry in `registry.activeWars` — don't call it again manually or outcomes double-apply.
- **War suspends trade** — `stepPolityDay` skips trade income for pairs where both polities are at war. Revenue falls during wartime.
- **`feudalReg` and `registry` are separate** — `FeudalRegistry` is external to `PolityRegistry`; hosts must maintain both and call `applyDailyTribute` + `stepBondStrength` themselves.
- **`stampSnapshot` schema kind** — `SchemaKind = "world" | "replay" | "campaign"`. Use `"campaign"` for polity saves.
- **`spreadEpidemic` needs `DiseaseProfile`** — import `getDiseaseProfile(id)` from `src/sim/disease.ts`; returns `undefined` for unknown IDs.
- **`stepPolityPopulation` signature** — `(polity, elapsedDays, deathPressure_Q?, foodSupply_Q?)`, not the `(registry, pairs, seed, day)` pattern of `stepPolityDay`.

## Extending this build

**Add a famine event:**
```typescript
stepPolityPopulation(polity, 1, undefined, q(0.15)); // food at 15% → famine deaths
```

**Reinforce a weakening bond:**
```typescript
import { reinforceBond } from "../../../src/feudal.js";
reinforceBond(spartaBond, q(0.05)); // shared victory or kinship event
```

**Break a vassal bond:**
```typescript
import { breakVassalBond } from "../../../src/feudal.js";
breakVassalBond(feudalReg, "sparta", "rome"); // rebellion triggered
```
