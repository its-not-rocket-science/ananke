# ananke-historical-battles credibility + validation audit

Date: 2026-04-08  
Scope: Position `ananke-historical-battles` as a high-trust validation + showcase companion to `ananke`, with first-class interoperability with `ananke-world-ui` and `ananke-archive`.

## 1) Priority scenario shortlist (top 5)

These five scenarios are selected for maximum signal on Ananke's strengths: formation dynamics, terrain/weather coupling, morale collapse, armour/weapon asymmetry, and deterministic/reproducible scenario packaging.

### P0-1) Cannae (216 BCE) — double envelopment under command pressure

- **Why it matters**
  - Canonical test for formation-level manoeuvre and failure to adapt under encirclement.
  - Strongly demonstrates that local tactical behaviour can produce globally catastrophic collapse.
- **Subsystem mix exercised**
  - Formation cohesion / frontage constraints.
  - Command/control latency and flank timing.
  - Morale contagion once rear pressure rises.
  - Weapon asymmetry: Roman heavy infantry density vs mobile flank cavalry.
- **Expected outputs to capture**
  - Tick of first flank closure and full encirclement.
  - Spatial heatmap of unit density (centre compression over time).
  - Casualty curve inflection after encirclement.
  - Morale histogram by formation segment (centre vs flanks).
  - Seeded win-rate + casualty-ratio distribution.
- **Label**: **Empirical validation** (with **showcase** value).

### P0-2) Agincourt (1415) — ranged dominance + mud-constrained shock combat

- **Why it matters**
  - Tests combined effects rather than single-factor balancing: terrain friction, projectile lethality, and armoured advance fatigue.
  - A high-credibility “physics + morale + doctrine” scenario for external audiences.
- **Subsystem mix exercised**
  - Terrain mobility penalties (mud, frontage compression).
  - Ranged projectile effectiveness vs advancing armour.
  - Stamina/shock accumulation and rout threshold crossing.
  - Formation clogging / friendly interference in narrow approach.
- **Expected outputs to capture**
  - Time-to-contact distribution across seeds.
  - French advance speed decay by terrain zone.
  - Arrow hit efficacy by armour tier over battle phases.
  - Rout onset tick and post-rout loss acceleration.
  - Outcome confidence intervals vs historical casualty bands.
- **Label**: **Empirical validation**.

### P0-3) Crécy (1346) — weather-induced weapon asymmetry + morale break

- **Why it matters**
  - Best stress test for context-sensitive combat effectiveness (wet strings, visibility, disrupted command sequence).
  - Demonstrates non-linear morale collapse triggered by tactical mis-ordering.
- **Subsystem mix exercised**
  - Weather modifiers to reload/accuracy.
  - Mixed-arms sequencing (missile troops, then cavalry).
  - Morale contagion from retreating front line into rear charging elements.
  - Armour/weapon mismatch in staggered phases.
- **Expected outputs to capture**
  - Weapon performance deltas with and without weather modifiers.
  - Genoese retreat trigger conditions and timing.
  - Friendly collision/interference events.
  - Phase-level win probability shifts.
  - Counterfactual run set (identical seeds, weather disabled).
- **Label**: **Plausibility validation** (with **showcase** value).

### P1-4) Thermopylae (480 BCE) — extreme chokepoint formation combat

- **Why it matters**
  - Purest benchmark for frontage-limited attrition where force-size advantage is intentionally suppressed.
  - Useful to validate stability against “narrow pass exploitation” pathologies.
- **Subsystem mix exercised**
  - Frontage and collision resolution at chokepoints.
  - Shield/armour survivability under dense melee turnover.
  - Morale resilience under prolonged pressure.
  - Scripted operational event injection (encirclement/end-condition trigger).
- **Expected outputs to capture**
  - Effective engaged combatants per tick (frontline occupancy).
  - Per-entity survival time distributions.
  - Shield-wall integrity metric over time.
  - Sensitivity sweep for pass width and reinforcement cadence.
- **Label**: **Plausibility validation**.

### P1-5) Hastings (1066) — repeated charge cycles and delayed morale collapse

- **Why it matters**
  - Important for proving that morale failure can be delayed, phase-dependent, and recoverable until tipping point.
  - Strong bridge scenario for world-ui storytelling because it has clear tactical phases.
- **Subsystem mix exercised**
  - Combined arms coordination (archers/infantry/cavalry).
  - Elevation advantage and downhill charge trade-offs.
  - Feigned retreat dynamics and discipline checks.
  - Progressive morale erosion with intermittent regroup.
- **Expected outputs to capture**
  - Charge cycle count before shield-wall fracture.
  - Slope-adjusted lethality / hit-rate split.
  - Morale recovery vs irreversible collapse windows.
  - Duration envelope and winner distribution across seeds.
- **Label**: **Showcase** + **plausibility validation**.

---

## 2) Standard scenario package format proposal

Goal: one portable package that can be authored in `ananke-historical-battles`, previewed in `ananke-world-ui`, and ingested directly by `ananke-archive`.

## 2.1 Package structure

```text
scenario-package/
  package.json                     # package metadata (schemaVersion, ids, labels)
  scenario.json                    # ArenaScenario-compatible normalized scenario payload
  validation.json                  # expected outcomes, source windows, tolerance bands
  world-ui.json                    # camera, overlays, labels, timeline annotations
  archive.json                     # ingest metadata, tags, citation/export fields
  references/
    sources.bib                    # structured citations (BibTeX or CSL JSON)
    source-notes.md                # assumptions + uncertainty notes
  runs/
    seed-manifest.json             # canonical seed list + intended batch sizes
    baseline-summary.json          # aggregate metrics for canonical seed set
  assets/
    map.png                        # optional terrain backdrop for world-ui
    overlays.geojson               # optional formation zones, terrain polygons
```

## 2.2 Core metadata schema (minimum interoperable fields)

```json
{
  "$schema": "https://ananke.dev/schema/scenario-package.schema.json",
  "schemaVersion": "1.0.0",
  "packageId": "historical.cannae.216bce.v1",
  "title": "Battle of Cannae (216 BCE)",
  "scenarioType": "historical-battle",
  "labels": ["empirical-validation", "formation-combat", "morale-collapse"],
  "classification": {
    "validationMode": "empirical",
    "showcasePriority": "high",
    "maturity": "calibrated"
  },
  "engine": {
    "anankeVersion": ">=<current-ananke-version>",
    "determinismMode": "lockstep",
    "tickRate": 20
  },
  "provenance": {
    "author": "ananke-historical-battles",
    "createdAt": "2026-04-08",
    "sourceCitations": [
      {
        "id": "keegan-face-of-battle",
        "type": "book",
        "confidence": "medium"
      }
    ]
  },
  "scenario": {
    "entryFile": "scenario.json",
    "canonicalSeeds": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "scaleModel": {
      "historicalToSimFactor": 67,
      "rationale": "Frontage-preserving downscale"
    }
  },
  "expectedOutcomes": {
    "winner": ["carthage"],
    "winRate": { "min": 0.70, "max": 0.95 },
    "casualtyFraction": {
      "roman": { "min": 0.60, "max": 0.95 },
      "carthage": { "min": 0.05, "max": 0.35 }
    },
    "durationTicks": { "min": 150, "max": 500 }
  },
  "artifacts": {
    "worldUi": "world-ui.json",
    "archive": "archive.json",
    "validation": "validation.json"
  }
}
```

## 2.3 Cross-tool compatibility rules

- **For `ananke-world-ui`**
  - `world-ui.json` should include camera presets, named phases, annotated POIs (frontage line, choke, flank route), and recommended chart set.
- **For `ananke-archive`**
  - `archive.json` should include scenario tags, citation metadata, canonical seed manifest hash, and output artifact checksums.
- **For deterministic reproducibility**
  - Package must pin: scenario hash, engine version/range, seed list, and validation tolerance profile.

---

## 3) Validation/showcase label system

Use explicit labels in package metadata and CI to separate scientific claims from illustrative demos.

- `empirical-validation`
  - Historical source windows + quantitative pass criteria are defined.
  - CI must run canonical seed set and enforce tolerances.
- `plausibility-validation`
  - Mechanistic plausibility is evaluated, but source bounds may be wide/contested.
  - CI checks directional expectations and invariants (not strict casualty windows).
- `showcase`
  - Prioritizes clarity and pedagogy (phase overlays, narrative annotations).
  - Can include non-historical “teaching mode” variants, clearly marked.

Recommended secondary tags:

- Dynamics: `formation-combat`, `terrain-weather`, `morale-collapse`, `asymmetry-armour-weapon`.
- Data quality: `source-confidence-high|medium|low`, `assumption-heavy`.
- Lifecycle: `candidate`, `calibrating`, `calibrated`, `regression-watch`.

---

## 4) Roadmap: evolve from scenario dump to validation product

### Phase A (P0, 1-2 weeks): Normalize and classify

1. Add `scenario-package` manifest to every existing scenario.
2. Assign one primary label (`empirical-validation`, `plausibility-validation`, or `showcase`) + required secondary tags.
3. Define canonical seed sets (e.g., 100-seed validation set + 10-seed smoke set).

### Phase B (P0/P1, 2-4 weeks): CI-grade reproducibility

1. Add deterministic replay/hash checks to ensure identical outputs for canonical seeds.
2. Emit machine-readable summaries (`baseline-summary.json`) and trend deltas per commit.
3. Fail CI on schema drift, missing citations, or absent tolerance windows (for empirical scenarios).

### Phase C (P1, 3-6 weeks): World-UI and Archive integration

1. Add `world-ui.json` phase annotations and default visual overlays.
2. Add one-click export to `ananke-archive` ingest bundle (scenario + runs + metrics + provenance).
3. Publish stable scenario IDs/versions with changelog semantics (`major` for expectation changes, `minor` for metadata/UI changes).

### Phase D (P2, ongoing): Credibility scaling

1. Add uncertainty documentation template (assumptions, contested numbers, alternative historiography ranges).
2. Introduce counterfactual pairs for key scenarios (e.g., weather on/off at Crécy) to expose model sensitivity.
3. Build a public benchmark board: pass/fail history, drift alerts, and comparative snapshots across engine versions.

---

## 5) Recommended first implementation backlog

1. `schema/scenario-package.schema.json` in main `ananke` repo, versioned and referenced by companions.
2. `tools/package-lint.ts` to validate required files/labels/citations.
3. `tools/validate-matrix.ts` to run scenario × seed sets and emit archive-ready summaries.
4. Example conversion PR for **Cannae** + **Agincourt** as reference packages.

These four items create an immediate path from "interesting scenario files" to "auditable, citable, replayable validation assets".
