# Ananke — Dataset Contribution Pipeline

This guide explains how to add an empirical dataset and a matching validation scenario
to Ananke's validation framework.  No kernel knowledge is required: contribution is a
two-step process of authoring a CSV file and authoring a TypeScript scenario block.

---

## Who should contribute?

- **Biomechanics researchers** with access to human or animal performance data
- **Historians / military historians** with access to casualty or logistics data
- **Medical professionals** with access to injury outcome statistics
- **Game designers** who have tuned constants against reference sources

If you have peer-reviewed data (or equivalent) that covers a physical quantity
already modelled by Ananke, your dataset can close a gap in the validation inventory
(`docs/external-dataset-validation-inventory.md`).

---

## Step 1 — Author the dataset CSV

Create a new file under `datasets/` named after the physical quantity, e.g.
`datasets/example-sprint-speed.csv`.  See the existing file for a live example.

### Required columns

| Column | Type | Description |
|--------|------|-------------|
| `entity_id` | integer | Unique row identifier (1, 2, 3 …) |
| `metric_name` | string | Snake-case name of the measured quantity (e.g. `peak_anaerobic_power_W`) |
| `value` | number | Measured value in SI units |
| `unit` | string | SI unit string (e.g. `W`, `N`, `s`, `kg`, `m/s`) |
| `source_doi` | string | DOI of the source publication (or `isbn:…` / `pmid:…`) |
| `notes` | string | Free-text description of subject/condition |

### Optional covariate columns

Name any additional covariate columns with a `condition_` prefix:

```
condition_sex               — "male" / "female" / "mixed"
condition_age_group         — "adult" / "elder" / "child"
condition_training_level    — "untrained" / "active" / "trained" / "elite"
condition_injury_status     — "healthy" / "fatigued" / "injured"
```

Covariate columns are for documentation; they are not parsed by the runner.

### Required header metadata (comment lines starting with `#`)

```
# Source: <full citation>
# DOI: <doi>
# Licence: <licence of original data>
# n: <total subject count across all rows>
# Collection method: <brief description>
# Units: <SI unit and SCALE mapping>
# Population note: <which archetype/cohort the data represents>
```

### Review criteria

A dataset will be accepted if it meets all of the following:

1. **Peer-reviewed source** (or military/clinical database with documented protocol)
2. **≥ 10 observations** (rows, after filtering to the relevant condition stratum)
3. **SI units** — values must be in the same unit as the corresponding Ananke constant
4. **Documented collection method** (enough detail to assess systematic error)
5. **Population is mappable** to an Ananke archetype or entity-generation cohort

---

## Step 2 — Author a `DirectValidationScenario`

Open `tools/validation.ts` and add a new entry to the `directValidationScenarios`
array (immediately before the closing `];`).

### Minimal template

```typescript
{
  name: "My New Scenario",
  description:
    "One-sentence summary. Reference: Author Year doi:…",
  empiricalDataset: {
    name: "Dataset display name",
    description: "Longer description of source and conditions.",
    dataPoints: [
      { value: 1234, unit: "W", source: "Author 2020", notes: "condition description" },
      // … one entry per CSV row
    ],
    mean: 1234,                    // arithmetic mean of dataPoints[].value
    confidenceIntervalHalf: 200,   // half-width of 95% CI, or largest SEM×2 in the set
  },
  setup: (seed: number) => {
    // Create an entity matching the experimental conditions.
    // Use seed as entity ID to sample the archetype's variance distribution.
    const entity = mkHumanoidEntity((seed % 200) + 1, 1, 0, 0);
    // Configure the entity's loadout / state to match experimental conditions.
    const world  = mkWorld(seed, [entity]);
    const ctx: KernelContext = { tractionCoeff: q(1.0) };
    return { world, ctx, steps: 0 };  // steps=0 if no ticks needed
  },
  extractOutcome: (world: WorldState) => {
    const entity = world.entities[0]!;
    // Return the simulation's equivalent of your measured quantity.
    // Use the same SI unit and scale as your CSV.
    return entity.attributes.performance.peakPower_W;  // example
  },
  unit: "W",
  tolerancePercent: 25,   // typically 20–30%; wider for inherently noisy quantities
  minSeeds: 50,           // ensure statistical stability across archetype variance
},
```

### Common `setup` patterns

**0-tick attribute read** — measure a physical constant directly from entity attributes
(no simulation loop needed):
```typescript
setup: (seed) => {
  const entity = mkHumanoidEntity((seed % 200) + 1, 1, 0, 0);
  return { world: mkWorld(seed, [entity]), ctx: { tractionCoeff: q(1.0) }, steps: 0 };
},
```

**Short combat tick** — run N ticks and read an accumulated value:
```typescript
setup: (seed) => {
  const attacker = mkHumanoidEntity(1, 1,    0,                    0);
  const defender = mkHumanoidEntity(2, 2, Math.round(2 * SCALE.m), 0);
  attacker.loadout = { items: [STARTER_WEAPONS[2]!, STARTER_ARMOUR[0]!] };
  const world = mkWorld(seed, [attacker, defender]);
  return { world, ctx: { tractionCoeff: q(0.85) }, steps: 200 };
},
```

**Downtime scenario** — run a disease/recovery loop using `stepDiseaseForEntity`:
```typescript
setup: (seed) => {
  const entity = mkHumanoidEntity(1, 1, 0, 0);
  exposeToDisease(entity, "wound_fever");
  // caller will step with steps=200 empty-command ticks for downtime
  return { world: mkWorld(seed, [entity]), ctx: { tractionCoeff: q(1.0) }, steps: 200 };
},
```

### Choosing `tolerancePercent`

| Quantity type | Recommended tolerance |
|---|---|
| Physical constant (mass, length, time) | 10–15% |
| Physiological parameter (force, power) | 20–25% |
| Statistical outcome (mortality, win rate) | 25–35% |
| Emergent aggregate (casualty count, duration) | 30–40% |

---

## Step 3 — Run and verify

```bash
npm run build
node dist/tools/validation.js "My New Scenario"
```

Confirm `✓ PASS` before submitting. If it fails, check:
- Is `empiricalDataset.mean` computed from the same cohort as `setup`'s entity archetype?
- Is `extractOutcome` returning the correct unit (check `SCALE.*` for conversions)?
- Does `setup` accurately reproduce the experimental conditions (training level, injury state)?

---

## Step 4 — Submit

Open a pull request with:
1. Your new `datasets/your-dataset.csv` file
2. The new `DirectValidationScenario` block in `tools/validation.ts`
3. A one-line entry in `docs/external-dataset-validation-inventory.md` updating the
   status of the relevant row from "pending" to "integrated"

---

## Full working example

`datasets/example-sprint-speed.csv` + the "Human Peak Anaerobic Power" scenario
at the bottom of `directValidationScenarios` in `tools/validation.ts` demonstrate
all three contribution steps end-to-end:

```
node dist/tools/validation.js "Human Peak Anaerobic"
```

Expected output:
```
Simulated mean: ~2339 W
Empirical mean: 2135 W
Within tolerance (25%): ✓ PASS
```
