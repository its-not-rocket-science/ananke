# 2-Week Golden Path Improvement Plan (Hobbyists + Tinkerers)

This plan optimizes for **first-hour success** and **creative experimentation**.  
Goal: a new hobbyist can run a deterministic 1v1 replay instantly, tweak content safely, and share outcomes without deep documentation.

## North Star

By end of Week 2, a new user should be able to:

1. Open a live demo in browser (no clone, no install).
2. Click **Random Seed** and run a 1v1 battle replay.
3. Export replay as JSON/GIF and share.
4. Add a custom unit via a content pack in under 10 minutes.

---

## Milestone 1 — Week 1, Day 1-2: Live Demo Deployment

### Deliverable

- Ship `demo/index.html` and publish to:
  - `https://its-not-rocket-science.github.io/ananke/`

### Scope

- Browser-based deterministic 1v1 replay with:
  - Play/Pause
  - Step
  - Speed slider (0.25x/0.5x/1x/2x/4x)
  - Random seed button
- WebAssembly-first path with JS fallback:
  - If WASM fails to load, fallback path must still run a replay loop with clear non-fatal notice.

### Implementation tasks

1. Add `demo/index.html` shell and controls panel.
2. Add a tiny `demo/main.ts` boot file:
   - Parse query string seed (if present).
   - Generate a default 1v1 scenario.
   - Drive replay loop and render basic state.
3. Add a deterministic seed randomizer:
   - 32-bit integer seed.
   - Seed reflected in URL for sharing (`?seed=...`).
4. Add GitHub Pages deployment workflow:
   - Build demo artifacts.
   - Publish from `gh-pages` or Pages artifact flow.
5. Add smoke check script:
   - Validate generated site includes control labels and replay canvas.

### Acceptance criteria

- Cold-load to first rendered frame in < 3 seconds on typical broadband.
- Seeded run is deterministic across reloads.
- Demo link works without repository clone.

---

## Milestone 2 — Week 1, Day 3-4: Error Message Audit

### Deliverables

- `src/errors.ts`
- `docs/errors.md`

### Scope

- Wrap all user-facing `throw new Error(...)` points with structured codes `E001–E099`.
- Every code has:
  - Summary
  - Trigger condition
  - Fix suggestion
  - Example message

### Proposed error shape

```ts pseudocode
export type AnankeErrorCode = `E${number}`;

export class AnankeError extends Error {
  constructor(
    public readonly code: AnankeErrorCode,
    message: string,
    public readonly hint?: string,
  ) {
    super(`${code}: ${message}${hint ? ` — ${hint}` : ""}`);
    this.name = "AnankeError";
  }
}
```

### Example mapping

- `E012: Invalid teamId (expected 1-16, got 0)`  
  Hint: `Did you forget that teamId is 1-indexed?`

### Implementation tasks

1. Inventory all `throw new Error` usage.
2. Create `src/errors.ts` helpers:
   - Code registry object for consistency.
   - `raise(code, message, hint?)` helper.
3. Refactor throw sites in high-traffic onboarding flows first:
   - Scenario loading
   - World creation
   - Step command validation
4. Create `docs/errors.md` table for all assigned codes.
5. Add CI guard:
   - Prevent uncoded `throw new Error` in `src/` (except tests/internal-only strict exclusions).

### Acceptance criteria

- 100% of user-facing throws in `src/` have codes.
- `docs/errors.md` includes fix guidance for each used code.

---

## Milestone 3 — Week 1, Day 5 to Week 2, Day 2: Content Pack System

### Deliverables

- `src/content/loader.ts`
- `examples/custom-content/vampire-pack.json`

### Scope

- Add `loadContentPack(path: string): ContentPack` with JSON schema validation.
- Support custom extension of:
  - Archetypes
  - Weapons
  - Armour
  - Terrain types

### Content pack contract (v1)

- `id`, `name`, `version`
- `extends` (optional base pack id)
- `archetypes[]`
- `weapons[]`
- `armour[]`
- `terrainTypes[]`
- Validation:
  - Required fields
  - ID uniqueness
  - Numeric bounds
  - Reference integrity (e.g., archetype references valid weapon IDs)

### Implementation tasks

1. Create schema (`JSON Schema draft-07` or `zod`-based runtime schema).
2. Implement loader in `src/content/loader.ts`:
   - Read file
   - Parse JSON
   - Validate schema
   - Normalize defaults
   - Return `ContentPack`
3. Add merge strategy:
   - Pack overrides by ID with explicit warning hooks.
4. Add example pack:
   - `examples/custom-content/vampire-pack.json` with concise ~50 lines.
5. Add example command:
   - Run default duel with custom pack and deterministic seed.

### Acceptance criteria

- Invalid pack yields coded error with precise JSON path.
- Vampire vs Werewolf pack loads successfully and runs in demo/debug tools.

---

## Milestone 4 — Week 2, Day 3-5: Visual Debugger (Timeline)

### Deliverables

- `tools/debugger/index.html` (standalone)
- Integration guide (add section to docs)

### Scope

- Extract tick-level state with `extractRigSnapshots`.
- Timeline visualization with scrubber:
  - Position
  - Health
  - Events (damage, KO, etc.)
- Export options:
  - Replay JSON
  - GIF (if encoding dependency available; otherwise graceful fallback)

### Implementation tasks

1. Build standalone debugger page in `tools/debugger/index.html`.
2. Add replay loader:
   - Drop file / paste JSON / URL query param.
3. Add timeline renderer (Canvas or SVG).
4. Add scrubber controls:
   - Play/Pause
   - Tick slider
   - Jump ±1/±10 ticks
5. Add export button(s):
   - Always JSON
   - GIF optional, feature-detected
6. Write integration guide:
   - How to feed snapshots from host loop.
   - How to embed debugger in custom projects.

### Acceptance criteria

- User can scrub any replay deterministically.
- Exported JSON can be re-imported into debugger and replayed identically.

---

## Cross-cutting DX work (throughout both weeks)

1. **“Try online” discoverability**
   - Add prominent README link to demo.
2. **Guardrails + hints**
   - Every onboarding-critical failure includes “what to do next”.
3. **Seed shareability**
   - URL-stored seed and one-click copy link in demo.
4. **Feedback loop**
   - Add issue template: “First-hour friction report”.

---

## Day-by-day execution plan

| Day | Focus | Output |
|---|---|---|
| W1D1 | Demo scaffold + controls UI | `demo/index.html` initial |
| W1D2 | WASM fallback + GH Pages deploy + QA | Live URL + smoke checks |
| W1D3 | Throw-site inventory + error primitives | `src/errors.ts` draft |
| W1D4 | Migrate onboarding errors + docs table | `docs/errors.md` complete |
| W1D5 | Content schema + loader scaffolding | `src/content/loader.ts` v0 |
| W2D1 | Merge strategy + reference integrity checks | loader v1 |
| W2D2 | Vampire/Werewolf sample pack + sample run | `examples/custom-content/vampire-pack.json` |
| W2D3 | Debugger shell + replay loader | `tools/debugger/index.html` base |
| W2D4 | Timeline scrubber + event overlays | interactive debugger |
| W2D5 | Export JSON/GIF + integration guide + polish | release-ready debugger |

---

## Definition of done (for this 2-week cycle)

- Live demo is public and stable on GitHub Pages.
- Error messages are coded and actionable for first-hour workflows.
- Content packs are validated, documented, and demonstrated with a themed sample.
- Debugger timeline is usable standalone and export-capable.
- README surfaces both “Try online” and community “Mod of the Week”.

---

## Success metric

> A hobbyist opens the live demo, clicks **Random Seed**, sees a battle, clicks **Export**, shares the link, and creates a custom unit in under 10 minutes without reading docs.

### Instrumentation recommendations

- Demo events:
  - `demo_loaded`
  - `seed_randomized`
  - `replay_exported`
  - `share_link_copied`
- Content pack events:
  - `content_pack_loaded`
  - `content_pack_validation_failed` (with code)
- Track median time from first load → first successful export.
