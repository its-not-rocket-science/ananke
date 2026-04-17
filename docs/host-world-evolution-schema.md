# Host World Evolution Schema

## Purpose

`WorldEvolutionInput` is a host-facing canonical schema for external worldbuilding platforms that want to use Ananke as a deterministic world-evolution backend without adopting internal Ananke state structures directly.

The schema is additive and adapter-based:

- Host systems own canonical source data (`entities`, `relationships`, `resources`, `hostMetadata`).
- Ananke owns derived simulation timeline state (`finalSnapshot`, metrics, timeline, checkpoints).

## Stable import

```ts
import {
  normalizeHostWorldInput,
  validateWorldEvolutionInput,
  toAnankeEvolutionState,
  fromAnankeEvolutionState,
  toWorldEvolutionRunRequest,
  fromWorldEvolutionRunResult,
  type WorldEvolutionInput,
} from "@its-not-rocket-science/ananke/world-evolution-backend";
```

## Canonical host model

`WorldEvolutionInput` contains:

- `entities`: `HostPolity | HostSettlement | HostRegion`
- `relationships`: `border | trade_route | treaty | war`
- `resources`: `HostResourceNode`
- optional epidemiology payloads: `diseases`, `epidemics`
- optional `ruleOverrides`
- optional `hostMetadata` (opaque pass-through)
- optional `simulationState` (seed/restore simulation-owned derived data)

## Validation and normalization

- `validateWorldEvolutionInput(input)` returns deterministic, path-addressed validation errors.
- `normalizeHostWorldInput(input)` validates first, then returns a sorted, deterministic normalized shape.

Normalization guarantees stable ordering across:

- entities
- relationships
- resources
- diseases
- epidemics

## Adapter flow

### Host → Ananke

1. Validate + normalize host data.
2. Map host entities and relationships into `WorldEvolutionSnapshot` via `toAnankeEvolutionState`.
3. Run backend evolution.

```ts
const req = toWorldEvolutionRunRequest(hostInput, 30, {
  includeDeltas: true,
  checkpointInterval: 5,
});
const result = runWorldEvolution(req);
```

### Ananke → Host

Use `fromAnankeEvolutionState(snapshot, context)` or `fromWorldEvolutionRunResult(result, context)`
for host-friendly payloads.

This preserves host metadata and resource nodes through `HostAdapterContext`.

## Mapping notes

- Settlement/region populations can roll up into polity population when polity population is omitted.
- Borders map to polity pairs.
- `trade_route` maps to trade routes.
- `treaty` maps to diplomacy treaties.
- `war` maps to active wars.
- `ruleOverrides` can compile into an inline backend profile for deterministic host control.

## JSON Schema

Machine-readable schema document:

- `schema/world-evolution-input.schema.json`

Use this to validate payloads at host ingress.

## Open world host adapter (OpenWorldBuilder-style)

For procedural/open-world platforms that produce generated world graphs (regions, settlements, factions, resources, trade links, climate and lore), use the additive adapter API:

```ts
import {
  canonicalizeOpenWorldInput,
  mapOpenWorldHostToEvolutionInput,
  toAnankeEvolutionStateFromOpenWorld,
  type OpenWorldHostInput,
} from "@its-not-rocket-science/ananke/world-evolution-backend";
```

### Field classes

The adapter explicitly separates three classes of host data in metadata buckets:

- `simulation`: fields intended to influence simulation mapping.
- `descriptive`: UI/lore-facing fields that may enrich outputs but do not directly drive core evolution.
- `opaque`: host-owned passthrough fields that Ananke preserves without interpreting.

Unknown host fields should be placed in `metadata.opaque` (entity-level) or top-level `metadata.opaque`.

### Minimal required fields

A minimal viable OpenWorld host payload requires:

- `worldSeed`.
- At least one `faction` with `id` + `name`.
- One or more regions/settlements only if you want territorial rollups.

This is enough to run deterministic evolution with default values for omitted optional fields.

### Optional fields that improve fidelity

Simulation fidelity improves when you provide:

- explicit polity-level `population`, `treasury_cu`, `stabilityQ`, `moraleQ`.
- `tradeLinks` with `baseVolume_cu`, `routeQualityQ`, and optional treaty/war flags.
- region and settlement populations for roll-up inference.
- resource nodes with `stock` and ownership anchoring (`factionId`, `regionId`, `settlementId`).
- climate payload in `environment.climateByPolity` for direct continuity into simulation state.

### Deterministic import ordering and canonicalization

Use `canonicalizeOpenWorldInput` prior to persistence or hashing. It sorts entities, links, tags, and metadata keys to guarantee deterministic import order regardless of host emission order.

### Example fixtures and outputs

Sample OpenWorldBuilder-style assets are included under:

- `fixtures/world-evolution-open-worldbuilder/openworld-host-input.sample.json`
- `fixtures/world-evolution-open-worldbuilder/openworld-host-evolution-run.sample.json`
- `fixtures/world-evolution-open-worldbuilder/openworld-host-timeline.sample.json`
- `fixtures/world-evolution-open-worldbuilder/openworld-host-metrics.sample.json`
