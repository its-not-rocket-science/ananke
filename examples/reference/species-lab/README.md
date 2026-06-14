# Species Lab — Reference Build

Generates individuals from six fantasy species, profiles their attributes and
senses, benchmarks cognitive competence, demonstrates character progression
(XP + strength training), validates a custom content pack, and runs a
round-robin combat tournament to show physics-grounded outcome distributions.

## What it demonstrates

| System | What you see |
|---|---|
| **Species generation** | `generateSpeciesIndividual` — archetype + innate traits → `SpeciesEntitySpec` |
| **Attribute profiles** | `morphology.stature_m/mass_kg`, `performance.peakForce_N`, `resilience.fatigueRate` |
| **Extended senses** | `dominantSense`, `thermalSignature`, `hasEcholocation`, `hasThermalVision`, `hasOlfaction` |
| **Competence** | `resolveCompetence` — 4 tasks (forage herbs, navigate wilds, craft sword, signal alien) across all species; quality_Q and descriptor per species |
| **Character progression** | `awardXP` — 25 meleeCombat encounters trigger milestone 0 @20 XP and milestone 1 @36 XP; `applyTrainingSession` — 28-day strength plan shows diminishing returns per species |
| **Content pack** | `validatePack` + `loadPack` — custom xenobiology scenario pack; also validates a malformed pack to show error detection |
| **Combat outcomes** | 100-seed round-robin tournament; win-rate distributions by matchup with physics insight |

## Run

```bash
npm run build
npm run ref:species-lab               # full run (100 seeds × 15 matchups = 1500 trials)
npm run ref:species-lab:quick         # quick run (10 seeds, faster)
```

## Architecture

```
examples/reference/species-lab/index.ts
  └─ src/species.ts            ELF/DWARF/ORC/GOBLIN/TROLL/HALFLING species definitions
  │                            generateSpeciesIndividual → SpeciesEntitySpec
  └─ src/extended-senses.ts    dominantSense, thermalSignature
  │                            hasEcholocation, hasElectroreception, hasThermalVision, hasOlfaction
  └─ src/competence/           resolveCompetence (routes to domain-specific resolver)
  │  framework.ts              CompetenceAction, CompetenceOutcome
  │  catalogue.ts              task definitions (forage_herbs, navigate_wilderness, …)
  └─ src/progression.ts        createProgressionState, awardXP, applyTrainingSession
  │                            (re-exported via src/character.ts)
  └─ src/content-pack.ts       AnankePackManifest, validatePack, loadPack, clearPackRegistry
  └─ src/sim/kernel.ts         stepWorld (combat loop)
  └─ src/sim/ai/               decideCommandsForEntity (lineInfantry policy)
```

## Sample output

```
1. Species Attribute Profiles
─────────────────────────────────────────────────────────────────────
Species     Stature  Mass    Force    Fatigue  Dominant Sense    ...
Elf         1.83m    62kg    150kN     78%     vision
Dwarf       1.39m    78kg    205kN     89%     vision
Orc         1.93m   105kg    240kN    107%     vision
Troll       2.46m   180kg    457kN     97%     vision

2. Competence Profiles  (resolveCompetence, 300s task, seed 42)
─────────────────────────────────────────────────────────────────────
Species     Forage herbs        Navigate wilds    Craft sword     Signal alien
Elf          84% exceptional      61% adequate      56% adequate     9% poor
Dwarf        48% adequate         50% adequate      62% adequate     4% poor
Goblin       64% good             54% adequate      53% adequate     6% poor

3. Character Progression
  XP progression — meleeCombat — 25 encounters @ 2 XP:
    Elf   XP=50  milestones=[0,1] hit at encounters 10,18
  Strength training — 28 days, 3×/week, moderate:
    Elf   force 150kN → 160kN  (+10kN)   [farther from ceiling → bigger gain]
    Orc   force 240kN → 246kN  (+6kN)    [closer to ceiling → smaller gain]

4. Content Pack
  ✓  validatePack: 0 errors
  ✓  loadPack: id="xenobiology-alpha@0.1.0"  scenarios=1  errors=0
  ✓  Invalid pack detected: 1 error(s)

5. Combat Tournament  (100 seeds)
  Orc vs Troll     A wins 30%  B wins 70%  Troll mass advantage
  Goblin vs Troll  A wins  0%  B wins 100% Troll mass advantage
```

## Performance envelope

| Metric | Typical value |
|---|---|
| Species | 6 |
| Matchups | 15 |
| Trials per matchup | 100 |
| Total trials | 1500 |
| Tournament time | ~8 s |
| Avg per trial | ~5 ms |
| Max ticks/trial | 400 |

Quick mode (`--quick`, 10 seeds) completes in under 1 s.

## Pain points resolved

- **`locomotionModes` not set on fantasy species** — species definitions use archetype performance fields (`peakForce_N`, `mass_kg`, `stature_m`) but don't define explicit `locomotionModes`. Display stature as the primary morphological column instead.
- **`IndividualAttributes.physical` doesn't exist** — attributes are structured as `morphology`, `performance`, `control`, `resilience`. No flat `physical` namespace.
- **`muscularStrength_Q` doesn't exist** — use `performance.peakForce_N` as the best proxy. Raw force in Newtons (SCALE.kg units).
- **`awardXP` thresholds** — milestone 0 requires `BASE_XP = 20` XP (`milestoneThreshold(0) = 20`). Award ≥20 XP total to see a milestone fire.
- **Species with natural weapons** — `spec.naturalWeapons` may be non-empty (Troll claws, Goblin daggers). The factory uses natural weapons when present, falls back to a longsword otherwise.
- **Pack scenario schema** — `validatePack` delegates to `validateScenario`, which requires `seed` (positive int), `maxTicks` (positive int), and each entity must have `weapon` (string). Missing any of these produces validation errors.
- **`LoadPackResult` fields** — the result has `packId`, `registeredIds`, `scenarioIds`, `fingerprint`, `errors`. No `warnings` field.

## Competence domain → species cognition

Each species archetype defines `cognition` scores that `resolveCompetence` uses via
`getDomainIntelligence(entity, domain)`:

| Domain | Field | Elf | Dwarf | Goblin |
|---|---|---|---|---|
| naturalist | `cognition.naturalist` | 0.78 | 0.45 | 0.60 |
| spatial | `cognition.spatial` | 0.80 | 0.65 | 0.55 |
| bodilyKinesthetic | `cognition.bodilyKinesthetic` | 0.75 | 0.90 | 0.55 |
| interSpecies | `cognition.interSpecies` | 0.60 | 0.25 | 0.45 |

Higher cognition → higher `quality_Q` → better descriptor.

## Extending this build

Add a custom species:
```typescript
import type { SpeciesDefinition } from "../../../src/species.js";
import { to, q } from "../../../src/units.js";

const DEEP_ELF: SpeciesDefinition = {
  id: "deep_elf", name: "Deep Elf", description: "Subterranean elf with echolocation.",
  archetype: {
    stature_m: to.m(1.80), mass_kg: to.kg(55),
    // ... full archetype
  },
  innateTraits: ["echolocation"],
};
SPECIES_POOL.push(DEEP_ELF);
```

Add a sci-fi matchup from a content pack:
```typescript
import { loadPack } from "../../../src/content-pack.js";
import MY_PACK from "./my-pack.json" assert { type: "json" };
const result = loadPack(MY_PACK);
// retrieve scenario and instantiate:
const world = instantiatePackScenario(result.packId, "my-scenario-id");
```
