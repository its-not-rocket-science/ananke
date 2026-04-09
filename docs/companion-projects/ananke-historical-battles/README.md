# ananke-historical-battles

![Ananke version](https://img.shields.io/badge/ananke-sync%20with%20package.json-6366f1)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-2.x-6e9f18?logo=vitest&logoColor=white)
![Scale](https://img.shields.io/badge/scale-10–200%20entities-blue)
![Status](https://img.shields.io/badge/status-wanted-lightgrey)

Historically-sourced tactical battle scenarios for Ananke, with validated outcome distributions. Agincourt, Thermopylae, Crécy, Hastings, Cannae — each encoded as an `ArenaScenario` plus a `DirectValidationScenario` linked to historical casualty data.

---

## Table of contents

1. [Purpose](#purpose)
2. [Prerequisites](#prerequisites)
3. [Quick start](#quick-start)
4. [Scenario catalogue](#scenario-catalogue)
5. [File layout](#file-layout)
6. [Scenario file structure](#scenario-file-structure)
7. [Validation requirements](#validation-requirements)
8. [Historical sources](#historical-sources)
9. [Equipment accuracy](#equipment-accuracy)
10. [Credibility audit](#credibility-audit)
11. [Contributing](#contributing)

---

## Purpose

Ananke's validation framework (`tools/validation.ts`) tests simulation constants against real-world datasets. Historical battles are the most demanding test: they have documented entity compositions, terrain, weather, and outcome ranges (casualty counts, fight duration, winner).

This package encodes those battles as Ananke `ArenaScenario` objects and verifies that the simulation produces outcomes within ±30% of historical reference ranges across 100 seeds. Scenarios that consistently fail are evidence of a calibration gap in the kernel — valuable feedback for the Ananke maintainers.

The scenarios are also useful as reference implementations for anyone building their own historical or fantasy content.

---

## Prerequisites

| Dependency | Version | Notes |
|-----------|---------|-------|
| Ananke | package.json version range (workspace) | Kernel + arena DSL + validation framework |
| Node.js | 18+ | |

```
workspace/
  ananke/                      ← https://github.com/its-not-rocket-science/ananke
  ananke-historical-battles/   ← this repo
```

---

## Quick start

```bash
# 1. Clone and build Ananke
git clone https://github.com/its-not-rocket-science/ananke.git
cd ananke && npm install && npm run build && cd ..

# 2. Clone this repo
git clone https://github.com/its-not-rocket-science/ananke-historical-battles.git
cd ananke-historical-battles && npm install

# 3. Run all scenario validations
npm run validate
# Prints a pass/fail table for all scenarios across 100 seeds

# 4. Run a single scenario interactively
npm run run -- --scenario agincourt --seeds 10 --verbose
```

---

## Scenario catalogue

### Battle of Agincourt (1415)

- **Scale**: 90 English entities vs 300 French entities (scaled from ~6000 vs ~20000 at 1:~67)
- **English composition**: longbowmen (`ELF_SCOUT_ARCHETYPE` substitute; high ranged accuracy, light armour), dismounted knights (plate armour, longsword)
- **French composition**: dismounted men-at-arms (plate armour, poleaxe), crossbowmen (rear, minimal engagement)
- **Terrain**: narrow field flanked by woods (modelled as forced frontage constraint)
- **Weather**: muddy ground (reduced mobility — `movementPenalty_Q` applied)
- **Historical outcome**: English victory, ~100–300 English casualties vs ~6000–8000 French
- **Validation target**: English win rate ≥ 85% across 100 seeds; French casualty fraction ≥ 3× English

### Battle of Thermopylae (480 BCE)

- **Scale**: 30 Spartan entities vs 120 Persian entities (scaled from ~300 vs ~10000+ at 1:100)
- **Spartan composition**: hoplite (bronze breastplate, xiphos, large shield — high `bulkIntegrity` and `stability`)
- **Persian composition**: light infantry (lower armour), archers (reduced in the pass engagement)
- **Terrain**: narrow pass (severe frontage constraint — 1-wide fighting front)
- **Historical outcome**: Spartan fighting effectiveness very high; Greeks ultimately lose due to flanking (modelled as scenario time limit triggering Persian encirclement)
- **Validation target**: Spartan per-entity survival time ≥ 5× Persian per-entity survival time

### Battle of Crécy (1346)

- **Scale**: 70 English entities vs 180 French entities
- **English composition**: longbowmen (dominant), dismounted knights (reserve)
- **French composition**: Genoese crossbowmen (front, low morale after wet strings), mounted knights (charge)
- **Weather**: evening sun in French eyes (aim penalty applied to French ranged attacks); prior rain (crossbow `reloadPenalty` modifier)
- **Historical outcome**: English victory; Genoese routed quickly; French knights charge into own retreating crossbowmen
- **Validation target**: English win rate ≥ 80%; Genoese units eliminated in first 20% of ticks

### Battle of Hastings (1066)

- **Scale**: 80 Norman entities vs 80 Saxon entities
- **Norman composition**: cavalry (mounted, lance — charge bonus via `computeChargeBonus`), infantry, archers
- **Saxon composition**: housecarls (two-handed axes, chainmail, high stability), fyrd (lighter equipment, lower training)
- **Terrain**: ridge (Saxon defensive bonus — height advantage → `HEIGHT_AIM_BONUS_PER_M`)
- **Historical outcome**: Norman victory after ~8 hours of fighting; Saxon shield wall breaks after repeated cavalry charges
- **Validation target**: scenario duration ≥ 200 ticks before resolution; Norman win rate 55–75% across 100 seeds

### Battle of Cannae (216 BCE)

- **Scale**: 80 Carthaginian entities vs 100 Roman entities
- **Carthaginian composition**: Spanish and Gallic infantry (centre — weaker), Libyan heavy infantry (flanks), Numidian cavalry (flanks)
- **Roman composition**: legionaries (pilum + gladius, chainmail — high discipline/control quality), allied cavalry (weaker)
- **Terrain**: open field
- **Tactic**: Hannibal's double envelopment (modelled as two flanking `ArenaScenario` phases that merge)
- **Historical outcome**: Carthaginian victory; ~70,000 Roman casualties from ~87,000; one of history's highest casualty ratios
- **Validation target**: Roman casualty fraction ≥ 60% in encirclement phase; Carthaginian win rate ≥ 70%

---

## File layout

```
ananke-historical-battles/
├── src/
│   ├── scenarios/
│   │   ├── agincourt.ts            ArenaScenario + DirectValidationScenario
│   │   ├── thermopylae.ts
│   │   ├── crecy.ts
│   │   ├── hastings.ts
│   │   └── cannae.ts
│   ├── archetypes/
│   │   ├── english-longbowman.ts   Period-specific archetype overrides
│   │   ├── french-knight.ts
│   │   ├── spartan-hoplite.ts
│   │   ├── roman-legionary.ts
│   │   └── ...
│   ├── equipment/
│   │   ├── medieval-weapons.ts     Weapons not in STARTER_WEAPONS
│   │   └── ancient-weapons.ts
│   ├── validate-all.ts             CLI: runs all scenarios, prints pass/fail table
│   └── index.ts                    Re-exports all scenarios
│
├── tests/
│   └── scenarios.test.ts           Vitest: checks scenarios parse without error
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## Scenario file structure

Each scenario file exports two objects:

```typescript
// src/scenarios/agincourt.ts
import type { ArenaScenario } from "../../ananke/dist/src/arena.js";
import type { DirectValidationScenario } from "../../ananke/dist/src/tools/validation.js";

export const AGINCOURT_SCENARIO: ArenaScenario = {
  id: "agincourt_1415",
  name: "Battle of Agincourt (1415)",
  teams: [
    {
      id: "english",
      entities: [
        // 70 longbowmen
        ...Array.from({ length: 70 }, (_, i) =>
          ({ seed: i, archetype: ENGLISH_LONGBOWMAN, equipment: LONGBOWMAN_KIT })),
        // 20 dismounted knights
        ...Array.from({ length: 20 }, (_, i) =>
          ({ seed: 70 + i, archetype: DISMOUNTED_KNIGHT, equipment: PLATE_KIT })),
      ],
    },
    {
      id: "french",
      entities: [
        ...Array.from({ length: 300 }, (_, i) =>
          ({ seed: 1000 + i, archetype: FRENCH_MAN_AT_ARMS, equipment: FRENCH_PLATE_KIT })),
      ],
    },
  ],
  terrain: { frontageConstraint: 40, mudPenalty_Q: q(0.30) },
  maxTicks: 500,
};

export const AGINCOURT_VALIDATION: DirectValidationScenario = {
  scenarioId: "agincourt_1415",
  description: "English longbow advantage against armoured French men-at-arms in narrow field",
  expectedOutcomes: {
    winnerTeamId: "english",
    winRateMin: 0.85,
    casualtyRatioMin: 3.0,   // French casualties / English casualties
  },
  historicalSource: {
    citation: "Keegan, J. (1976). The Face of Battle. Viking Press. Chapter 3: Agincourt.",
    doi: null,
    casualtyRange: { english: [100, 300], french: [6000, 8000] },
    scaleFactor: 67,
  },
};
```

---

## Validation requirements

All scenarios must pass `runArenaScenario` over 100 seeds and produce outcomes within ±30% of historical reference ranges. Run the validator:

```bash
npm run validate
```

Expected output:

```
Scenario                     Seeds  Win rate  Casualty ratio  Status
─────────────────────────────────────────────────────────────────────
agincourt_1415               100    91%       4.2×            PASS
thermopylae_480bce           100    0% (time) 5.8× per-unit   PASS
crecy_1346                   100    88%       3.1×            PASS
hastings_1066                100    62%       1.1×            PASS
cannae_216bce                100    74%       2.9×            PASS
```

A scenario that consistently fails indicates either:

1. Missing equipment or archetype data (document the substitution in the scenario file)
2. A physics constant in Ananke that needs calibration (open an issue in the Ananke repository with the validation report)

Scenarios are allowed to `SKIP` with a documented reason if the required equipment or terrain features are not yet in Ananke. Document the skip in the scenario file with `status: "skipped"` and a `skipReason` string.

---

## Historical sources

The following references are used for casualty data, army compositions, and equipment details:

| Reference | Used for |
|-----------|---------|
| Keegan, J. (1976). *The Face of Battle*. Viking Press. | Agincourt, Crécy, Somme (out of scope) |
| Ardant du Picq, C. (1880). *Battle Studies*. | Unit cohesion, morale, ancient combat dynamics |
| Verbruggen, J.F. (1997). *The Art of Warfare in Western Europe during the Middle Ages*. | Equipment weights, formation tactics, cavalry charges |
| DeVries, K. (1992). *Infantry Warfare in the Early Fourteenth Century*. | Crécy equipment, crossbow range and rate of fire |
| Lazenby, J.F. (1978). *Hannibal's War*. | Cannae order of battle, casualty estimates |
| Cartledge, P. (2006). *Thermopylae: The Battle That Changed the World*. | Spartan hoplite equipment, pass geography |

Casualty figures from ancient sources are treated as order-of-magnitude estimates. Scale factors are chosen to keep entity counts in the 10–200 range where Ananke's tactical-scale simulation is most accurate.

---

## Equipment accuracy

Where possible, scenarios use Ananke's built-in `STARTER_WEAPONS` and `STARTER_ARMOUR` constants. Where the required equipment is not yet in Ananke, a substitution is made and documented:

| Historical item | Ananke substitute | Difference | Documented in |
|----------------|-------------------|------------|---------------|
| English war bow (150 lb draw) | `HUNTING_BOW` + `rangeBonus_Q: q(0.40)` | Range and penetration underestimated | `archetypes/english-longbowman.ts` |
| Roman pilum | `JAVELIN` with `throwPenalty: false` | Pilum entanglement not modelled | `archetypes/roman-legionary.ts` |
| Genoese pavise crossbow | `CROSSBOW` + `reloadTime_s: 30` | Correct reload time; penetration approximate | `scenarios/crecy.ts` |
| Spartan large shield (aspis) | Archetype `bulkIntegrity: q(0.90)` | Shield as integral to body plan, not equipment slot | `archetypes/spartan-hoplite.ts` |

If you add a historical weapon that should be in Ananke's core, open an issue in the Ananke repository with the weapon's historical specifications (mass, edge geometry, typical strike energy).

---

## Credibility audit

For a concrete prioritised validation plan (top 5 scenarios, schema proposal, labels, and roadmap), see [credibility-validation-audit.md](./credibility-validation-audit.md).

---

## Contributing

1. Fork this repository and create a feature branch.
2. Every scenario must cite at least one primary or secondary historical source for its casualty data.
3. Scale factors must be documented in the scenario file (e.g., `scaleFactor: 67` means one entity represents 67 historical combatants).
4. Do not fabricate casualty data. If the historical record is uncertain, use the most conservative published estimate and note the uncertainty.
5. Run `npm run validate` before opening a PR. New scenarios may initially `SKIP`; mark them as such with a `skipReason`.
6. Scenarios targeting missing Ananke features (new weapon types, terrain effects) should open a linked issue in the Ananke repository.

To list this project in Ananke's `docs/ecosystem.md`, open a PR to the Ananke repository adding a row to the Scenario Packs table.
