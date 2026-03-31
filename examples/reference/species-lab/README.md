# Species Lab — Reference Build

An interactive xenobiology comparison tool.  Generates individuals from six species
(Elf, Dwarf, Orc, Goblin, Troll, Halfling), prints their attribute profiles, then runs
a round-robin combat tournament across 100 seeds to show how physics differences produce
measurable outcome distributions.

## What it demonstrates

| System | What you see |
|---|---|
| **Species generation** | `generateSpeciesIndividual` — archetype + innate traits → `SpeciesEntitySpec` |
| **Attribute profiles** | `morphology.mass_kg`, `performance.peakForce_N`, `resilience.fatigueRate` |
| **Extended senses** | `dominantSense`, `thermalSignature`, `hasEcholocation`, etc. |
| **Combat outcomes** | 100-seed tournament shows win-rate distributions by matchup |
| **Physics insight** | Mass and peak force differences explain outcome asymmetries |

## Run

```bash
npm run build
npm run ref:species-lab               # full run (100 seeds × 15 matchups = 1500 trials)
npm run ref:species-lab:quick         # quick run (10 seeds, faster)
```

## Architecture

```
examples/reference/species-lab/index.ts
  └─ src/species.ts            ELF_SPECIES, DWARF_SPECIES, ORC_SPECIES, …
  │                            generateSpeciesIndividual → SpeciesEntitySpec
  └─ src/extended-senses.ts    dominantSense, thermalSignature
  │                            hasEcholocation, hasElectroreception, hasThermalVision, hasOlfaction
  └─ src/sim/kernel.ts         stepWorld (combat loop)
  └─ src/sim/ai/               decideCommandsForEntity (lineInfantry policy)
  └─ src/types.ts              IndividualAttributes — morphology, performance, resilience
```

## Package choices

| Package | Why |
|---|---|
| `@ananke/content` | Species definitions — fantasy humanoids with innate traits |
| `@ananke/combat` | Combat resolution, injury model, equipment |
| `extended-senses.ts` | Non-visual sensory capability predicates |
| `@ananke/core` | `stepWorld`, fixed-point units, AI |

## Performance envelope

| Metric | Typical value |
|---|---|
| Species | 6 |
| Matchups | 15 |
| Trials per matchup | 100 |
| Total trials | 1500 |
| Total time | < 8 s |
| Avg per trial | < 5 ms |

Quick mode (`--quick`, 10 seeds) completes in under 1 s.

## Pain points resolved

- **`IndividualAttributes.physical` doesn't exist** — attributes are structured as
  `morphology` (stature, mass), `performance` (force, power, energy), `control`
  (reaction time, stability), `resilience` (fatigue, tolerance, integrity).
  There is no flat `physical` namespace.
- **`muscularStrength_Q` doesn't exist** — use `performance.peakForce_N` as the
  best proxy for striking power.  Raw force in Newtons (SCALE.kg units).
- **`maxSpeed_mps` on attributes** — locomotion modes are in `attrs.locomotionModes?`
  (`LocomotionCapacity[]`).  Find the `"ground"` entry for terrestrial speed.
- **Species with natural weapons** — `spec.naturalWeapons` may be non-empty (Troll
  claws, Goblin daggers).  The factory function uses natural weapons when present,
  falls back to a longsword otherwise.

## Sample output

```
Species Attribute Profiles
──────────────────────────────────────────────────────────────────────────────────────────────────────
Species      Mass(kg)  Strength  Speed(m/s)  Fatigue  Dominant Sense    Senses
──────────────────────────────────────────────────────────────────────────────────────────────────────
Elf          65kg      6850%     7.2m/s       95%      vision            vision  thermal=  30%
Dwarf        90kg      8100%     4.8m/s       80%      vision            vision  thermal=  30%
Orc          120kg     9600%     6.5m/s       85%      vision            vision  thermal=  30%
...

Combat Tournament  (100 seeds, longsword vs longsword or natural weapons)
──────────────────────────────────────────────────────────────────────────
Matchup                    A wins   B wins   Draws  Physics insight
Elf vs Dwarf               41%      55%       4%   Dwarf mass advantage
Elf vs Orc                 22%      76%       2%   Orc mass advantage
Orc vs Troll                8%      91%       1%   Troll mass advantage
Halfling vs Goblin         48%      50%       2%   closely matched
...
```

## Extending this build

Add a sci-fi matchup:

```typescript
import { VULCAN_SPECIES, KLINGON_SPECIES } from "../../../src/species.js";
SPECIES_POOL.push(VULCAN_SPECIES, KLINGON_SPECIES);
```

Generate a custom species:

```typescript
import type { SpeciesDefinition } from "../../../src/species.js";
import { KNIGHT_INFANTRY } from "../../../src/archetypes.js";

const MY_SPECIES: SpeciesDefinition = {
  id: "my_species", name: "My Species", description: "Custom",
  archetype: KNIGHT_INFANTRY,
  innateTraits: ["enhanced_hearing"],
  lore: "A species with acute senses.",
};
```
