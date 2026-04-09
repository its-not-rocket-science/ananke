# Small-Feeling Package Strategy (April 9, 2026)

This plan keeps **all existing features and exports** while reducing first-contact cognitive load.

## 1) Layered discovery model

Use one intentional progression with explicit “stop points.”

### Layer A — First hour (prove value fast)

**Goal:** run deterministic loop and replay in <60 min.

- Primary imports: `.` only
- Primary docs:
  - `README.md` (golden path)
  - `docs/first-hour-adopter-path.md`
  - `STABLE_API.md`

**Exit criteria:** user can create a world, tick simulation, and replay deterministically.

---

### Layer B — Host app (ship integration)

**Goal:** production host loop and platform integration.

- Primary imports: `.`, `./host-loop`, `./netcode`, `./schema`, `./wasm-kernel`, `./terrain-bridge`
- Primary docs:
  - `docs/host-contract.md`
  - `docs/bridge-contract.md`
  - `docs/wire-protocol.md`
  - `docs/quickstart-web.md`, `docs/quickstart-unity.md`, `docs/quickstart-godot.md`

**Exit criteria:** stable host runtime with deterministic sync + save/load boundary.

---

### Layer C — Campaign builder (compose game systems)

**Goal:** add simulation breadth without entering specialist modules too early.

- Primary imports: `./campaign`, `./polity`, plus campaign extensions grouped by theme
- Recommended sequence:
  1. Core campaign: `./campaign`, `./polity`
  2. Society/story: `./social`, `./narrative`, `./renown`, `./kinship`, `./succession`
  3. Economy/governance: `./trade-routes`, `./taxation`, `./governance`, `./resources`, `./monetary`
  4. Pressure systems: `./climate`, `./famine`, `./epidemic`, `./unrest`, `./containment`
- Primary docs:
  - `docs/module-index.md`
  - `docs/project-overview.md`
  - `docs/recipes-matrix.md`

**Exit criteria:** team can pick a campaign “bundle” instead of browsing a flat export list.

---

### Layer D — Advanced research / content-pack / bridge

**Goal:** specialist workflows (content pipelines, conformance, deep internals).

- Primary imports: `./content`, `./content-pack`, `./conformance`, `./tier2`, `./tier3`, `./data-governance`
- Primary docs:
  - `docs/content-pack-threat-model.md`
  - `docs/content-registry.md`
  - `docs/conformance/README.md`
  - `docs/package-boundary-report.md`
  - `docs/api-surface-*.md`

**Exit criteria:** specialist users can find deep surfaces without polluting early onboarding.

---

## 2) Mapping current exports onto the model

| Layer | Exports |
|---|---|
| First hour | `.`, *(optional reference only: `./combat` for tactical samples)* |
| Host app | `./host-loop`, `./netcode`, `./schema`, `./schema-migration`, `./wasm-kernel`, `./terrain-bridge`, `./atmosphere` |
| Campaign builder | `./campaign`, `./campaign-layer`, `./polity`, `./species`, `./catalog`, `./character`, `./combat`, `./social`, `./narrative`, `./narrative-prose`, `./renown`, `./anatomy`, `./crafting`, `./competence`, plus campaign extensions (`./kinship` … `./monetary`) |
| Advanced research/content/bridge | `./content`, `./content-pack`, `./conformance`, `./extended-senses`, `./tier2`, `./tier3`, `./data-governance` |

Notes:

- Keep all exports intact; change **how they are introduced**, not whether they exist.
- Continue surfacing alias subpaths (`./campaign-layer`, `./narrative-layer`, `./schema-migration`) as “same module, naming helper.”

## 3) Mapping current docs onto the model

| Layer | Existing docs to foreground | Existing docs to de-emphasize in first-contact nav |
|---|---|---|
| First hour | `README.md`, `docs/first-hour-adopter-path.md`, `STABLE_API.md` | `docs/onboarding.md` (week-by-week depth), broad API surface docs |
| Host app | `docs/host-contract.md`, `docs/bridge-contract.md`, platform quickstarts | maturity dashboards, architecture deep dives |
| Campaign builder | `docs/module-index.md`, `docs/project-overview.md`, `docs/recipes-matrix.md`, `docs/cookbook.md` | validation corpus and internal audits |
| Advanced research/content/bridge | `docs/content-pack-threat-model.md`, `docs/content-registry.md`, `docs/conformance/README.md`, `docs/package-boundary-report.md` | n/a (this is already the deep zone) |

## 4) Doc flow rewrite (proposed IA)

### New top-level doc flow

1. **Start here (First hour)**
   - “Run in 5 minutes”
   - “Determinism proof in 15 minutes”
2. **Integrate host app**
   - Host loop, netcode, schema, bridge
3. **Build campaign systems**
   - Curated module bundles by outcome
4. **Advanced / research / content pipeline**
   - Content-pack, conformance, tier2/3, governance

### Rewrite principles

- Replace giant “all docs” lists with **task verbs**: Run, Integrate, Expand, Specialize.
- Each page starts with:
  - “Who this is for”
  - “Imports you need”
  - “Time to first success”
- Add a “You probably don’t need this yet” callout on advanced pages.

## 5) Package + doc navigation recommendations

1. **Keep one canonical chooser page:** `docs/module-index.md` becomes the main discovery hub; all other index-like pages link back to it.
2. **Add layer tags in tables:** `[First hour]`, `[Host app]`, `[Campaign builder]`, `[Advanced]` for every export row.
3. **Collapse long module lists behind bundles:** users pick “Campaign economy bundle” rather than 8 separate exports first.
4. **Preserve flat exports for experts:** no runtime/API removals, only curated presentation.
5. **Add “next best step” links at each doc footer:** linear progression through layers.
6. **De-duplicate overlapping onboarding pages:** keep `docs/first-hour-adopter-path.md` as quickstart truth, keep `docs/onboarding.md` as deep/internal contributor path.
7. **Expose aliases clearly once:** show alias equivalence table in one place; avoid repeating across many docs.
8. **Add a docs landing card for “I only need deterministic combat.”** Route to `.` + `./combat` + first-hour sample.

## 6) Concrete non-breaking changes to implement next

1. Add `docs/discovery-map.md` as the permanent landing page using the four layers above.
2. Update `README.md` “Further reading” into the same four-layer order.
3. Update `docs/module-index.md` header with a compact 4-layer chooser before tier tables.
4. Generate module index metadata with a `layer` field from `tools/generate-module-index.ts`.
5. Add one command to CI that checks each export has: tier, layer, and one doc link.

This keeps the package technically broad while making it *feel* narrow at the moment a new team touches it.
