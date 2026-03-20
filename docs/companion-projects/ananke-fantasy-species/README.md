# ananke-fantasy-species

![Ananke version](https://img.shields.io/badge/ananke-0.1.0-6366f1)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![Data only](https://img.shields.io/badge/simulation%20code-none-brightgreen)
![Status](https://img.shields.io/badge/status-wanted-lightgrey)

Physically-grounded `BodyPlan` and `Archetype` data for common fantasy species: Elf, Dwarf, Orc, Halfling, Troll, Goblin, Giant. Drop-in companion to Ananke — no kernel changes required.

This is also the **template repository** for all Ananke body-plan packs. See [Related packs](#related-packs) for the full family.

---

## Table of contents

1. [Purpose](#purpose)
2. [Prerequisites](#prerequisites)
3. [How to use](#how-to-use)
4. [Physical grounding](#physical-grounding)
5. [Species catalogue](#species-catalogue)
6. [File layout](#file-layout)
7. [Adding a new species](#adding-a-new-species)
8. [Non-humanoid body plans](#non-humanoid-body-plans)
9. [Testing requirements](#testing-requirements)
10. [Related packs](#related-packs)
11. [Contributing](#contributing)

---

## Purpose

Ananke's `generateIndividual` function accepts any `Archetype` + `BodyPlan` — it is species-agnostic by design. This package provides ready-made data for the most commonly requested fantasy species so that world-builders do not have to author their own from scratch.

This is a **pure data package**. It contains no simulation code, no kernel modifications, and no new APIs. Every species file is a set of TypeScript constants that you import and pass directly to Ananke's existing functions.

---

## Prerequisites

| Dependency | Version | Notes |
|-----------|---------|-------|
| Ananke | 0.1.0+ | Kernel + type definitions |
| Node.js | 18+ | Only needed if you run the tests |

Install alongside Ananke:

```bash
# If Ananke is on npm (future):
npm install ananke ananke-fantasy-species

# Until then, clone both:
git clone https://github.com/its-not-rocket-science/ananke.git
git clone https://github.com/its-not-rocket-science/ananke-fantasy-species.git
```

---

## How to use

```typescript
import { generateIndividual } from "../ananke/dist/src/generate.js";
import { ELF_BODY_PLAN, ELF_WARRIOR_ARCHETYPE } from "../ananke-fantasy-species/dist/src/elf/index.js";

// Generate a single elf warrior with seed 42
const elf = generateIndividual(42, ELF_WARRIOR_ARCHETYPE, ELF_BODY_PLAN);

console.log(`Elf mass: ${elf.mass_kg / 10000} kg`);          // ~60.0 kg
console.log(`Peak force: ${elf.actuator.peakForce_N / 10} N`); // ~1600 N
```

All archetype field values are in Ananke's fixed-point SI units. See `SCALE` in `ananke/src/units.ts` for conversion factors.

---

## Physical grounding

Every species is modelled on a real-world biological analogue. Fantasy conventions (elves are swift, dwarves are dense) are expressed as deviations from the human baseline, not as magic numbers.

| Species | Analogue | Key deviation |
|---------|----------|---------------|
| Elf | Gracile *Homo sapiens* (long-distance runner morphology) | Lower mass, longer limbs, higher continuous-power-to-weight, faster reaction time |
| Dwarf | Robust *Homo sapiens* (wrestler/powerlifter morphology + high bone mineral density) | Higher mass fraction in skeleton, higher peakForce_N, lower centre of mass → higher stability |
| Orc | Large *Homo sapiens* (strongman morphology) | Mass ~120 kg, high peakForce_N, lower control quality, higher distress tolerance |
| Halfling | Small-statured *Homo sapiens* (jockey/gymnast morphology) | Stature ~1.1 m, low mass, very high stability and control quality |
| Troll | Scaled up from gorilla (*Gorilla gorilla*) musculoskeletal proportions | Mass ~300 kg, high surface integrity, slow reaction time, high cold tolerance |
| Goblin | Scaled down from chimpanzee (*Pan troglodytes*) + human fine motor control | Mass ~35 kg, high fine control, high fear sensitivity |
| Giant | Scaling extrapolation from human (square-cube law applied to bone loading) | Mass ~500 kg, peakForce_N from allometric scaling (F ∝ m^0.67), structural integrity reduced to reflect bone stress limits |

Citations for allometric scaling constants and bone mineral density data are in each species' `sources.md` file.

---

## Species catalogue

### Elf

- Stature: 1.85 m — tall, gracile build
- Mass: 62 kg
- Physical analogue: elite long-distance runner (East African morphology extended to fantasy height)
- Archetypes provided: `ELF_WARRIOR_ARCHETYPE`, `ELF_SCOUT_ARCHETYPE`, `ELF_ELDER_ARCHETYPE`
- Notable attributes: high `continuousPower_W`, fast `reactionTime_s` (150 ms), high `visionRange_m`

### Dwarf

- Stature: 1.35 m
- Mass: 80 kg — dense bone, high muscle-to-fat ratio
- Physical analogue: elite wrestler/powerlifter with high bone mineral density (bone loading studies from strength training literature)
- Archetypes provided: `DWARF_WARRIOR_ARCHETYPE`, `DWARF_SMITH_ARCHETYPE`, `DWARF_ELDER_ARCHETYPE`
- Notable attributes: high `peakForce_N`, high `stability`, high `structureIntegrity`, low centre of mass (modelled via high `bulkIntegrity`)

### Orc

- Stature: 2.0 m
- Mass: 120 kg
- Physical analogue: strongman competitor (top decile human mass + strength)
- Archetypes provided: `ORC_WARRIOR_ARCHETYPE`, `ORC_BERSERKER_ARCHETYPE`, `ORC_CHIEFTAIN_ARCHETYPE`
- Notable attributes: very high `peakForce_N` (2400 N), high `distressTolerance`, moderate `controlQuality`

### Halfling

- Stature: 1.1 m
- Mass: 28 kg
- Physical analogue: jockey / artistic gymnast morphology
- Archetypes provided: `HALFLING_ROGUE_ARCHETYPE`, `HALFLING_FARMER_ARCHETYPE`
- Notable attributes: high `stability`, high `fineControl`, low `peakForce_N`, fast `reactionTime_s` (170 ms)

### Troll

- Stature: 2.4 m
- Mass: 300 kg
- Physical analogue: gorilla musculoskeletal structure scaled to bipedal posture
- Archetypes provided: `TROLL_ARCHETYPE`
- Notable attributes: very high `peakForce_N` (4500 N), high `surfaceIntegrity`, slow `reactionTime_s` (350 ms), high `coldTolerance`, low `cognition` fields (no linguistics)
- Body plan: `TROLL_BODY_PLAN` — humanoid topology but heavier torso mass share (0.55 vs 0.43)

### Goblin

- Stature: 1.2 m
- Mass: 35 kg
- Physical analogue: chimpanzee grip strength adapted to near-human fine motor control
- Archetypes provided: `GOBLIN_SCOUT_ARCHETYPE`, `GOBLIN_SHAMAN_ARCHETYPE`
- Notable attributes: high `fineControl`, high fear sensitivity (low `distressTolerance`), high `hearingRange_m`

### Giant

- Stature: 4.5 m
- Mass: 500 kg
- Physical analogue: square-cube law extrapolation from human, with bone loading adjustments
- Archetypes provided: `GIANT_ARCHETYPE`
- Notable attributes: `peakForce_N` derived from allometric scaling (F = 1840 × (500/75)^0.67 ≈ 6200 N), reduced `structureIntegrity` to model elevated bone stress, very slow `reactionTime_s` (500 ms)
- Body plan: `GIANT_BODY_PLAN` — longer limb segments, increased `length_m` for all segments

---

## File layout

```
ananke-fantasy-species/
├── src/
│   ├── elf/
│   │   ├── bodyplan.ts        ELF_BODY_PLAN
│   │   ├── archetype.ts       ELF_WARRIOR_ARCHETYPE, ELF_SCOUT_ARCHETYPE, ELF_ELDER_ARCHETYPE
│   │   ├── weapons.ts         ELF_LONGBOW (species-specific item; uses Ananke WeaponProfile type)
│   │   ├── index.ts           Re-exports all elf exports
│   │   └── sources.md         Physical grounding citations
│   ├── dwarf/
│   │   └── ...                (same structure)
│   ├── orc/
│   │   └── ...
│   ├── halfling/
│   │   └── ...
│   ├── troll/
│   │   └── ...
│   ├── goblin/
│   │   └── ...
│   └── giant/
│       └── ...
│
├── tests/
│   ├── elf.test.ts
│   ├── dwarf.test.ts
│   └── ...                    One test file per species
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## Adding a new species

1. Create `src/{species}/` with `bodyplan.ts`, `archetype.ts`, `weapons.ts`, `index.ts`, and `sources.md`.
2. In `bodyplan.ts`: define segment topology. For humanoid variants, copy `HUMANOID_PLAN` from Ananke and adjust `massShare_Q` and `length_m` per segment.
3. In `archetype.ts`: set all fields in SI fixed-point units. Start from the human baseline (`HUMAN_BASELINE` in Ananke's `src/archetypes.ts`) and deviate according to the physical analogue. Document every non-baseline value with a comment citing the analogue.
4. In `sources.md`: cite the real-world study or allometric equation for each deviation.
5. Add a test file (see [Testing requirements](#testing-requirements)).

---

## Non-humanoid body plans

Humanoid-variant species (Elf, Dwarf, Orc, Halfling) only need a different `Archetype` — the standard `HUMANOID_PLAN` body plan works. Species with non-standard topology need a custom `BodyPlan`:

- **Troll** and **Giant**: humanoid topology, but with different `massShare_Q` values per segment. Use `HUMANOID_PLAN` as a base and spread-override the segments array.
- **Centaur** (not in this pack; see `ananke-sf-species` for the pattern): six locomotion segments (four legs + two arms). Requires a fully custom `BodyPlan`.

For truly non-humanoid species, refer to the quadruped and octopoid examples in `docs/ecosystem.md`.

---

## Testing requirements

Every species must pass these two checks. The test runner is Vitest (same as Ananke).

```typescript
// tests/elf.test.ts
import { describe, it, expect } from "vitest";
import { generateIndividual } from "../../ananke/dist/src/generate.js";
import { stepWorld } from "../../ananke/dist/src/sim/world.js";
import { ELF_BODY_PLAN, ELF_WARRIOR_ARCHETYPE } from "../src/elf/index.js";

describe("Elf", () => {
  it("generates without throwing", () => {
    expect(() => generateIndividual(42, ELF_WARRIOR_ARCHETYPE, ELF_BODY_PLAN)).not.toThrow();
  });

  it("survives 200 ticks of stepWorld without panic", () => {
    const entity = generateIndividual(42, ELF_WARRIOR_ARCHETYPE, ELF_BODY_PLAN);
    const world = createMinimalWorld([entity]);
    expect(() => {
      for (let i = 0; i < 200; i++) stepWorld(world, {}, { worldSeed: 1, tick: i });
    }).not.toThrow();
  });
});
```

All species tests must pass before any PR is merged.

---

## Related packs

This repository is the template for all Ananke body-plan packs:

| Pack | Content | Status |
|------|---------|--------|
| `ananke-fantasy-species` | Elf, Dwarf, Orc, Halfling, Troll, Goblin, Giant | This repo |
| `ananke-sf-species` | Grey alien, android, uplift-chimp, centaur | Wanted |
| `ananke-historical-fauna` | Aurochs, Pleistocene megafauna, warhorse variants | Wanted |
| `ananke-insect-pack` | Ant (scaled), giant beetle, mantis | Wanted |

---

## Contributing

1. Fork this repository and create a feature branch.
2. Every numeric value in an archetype must have a comment citing either the human baseline or a specific study/equation.
3. Do not add simulation logic — only data files and their tests.
4. Run `npm test` (all species tests) before opening a PR.
5. Keep `sources.md` up to date in each species folder; it is the audit trail for physical plausibility.

To list this project in Ananke's `docs/ecosystem.md`, open a PR to the Ananke repository.
