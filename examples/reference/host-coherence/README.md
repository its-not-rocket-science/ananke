# Reference Host Coherence App

A first-party reference host app that demonstrates a minimal but complete host flow:

1. scenario load
2. deterministic step loop
3. replay capture/export
4. bridge extraction
5. inspection UI
6. save/load

## Run

```bash
npm run build
npm run ref:host-coherence
npm run ref:host-coherence:web
```

Then open `http://localhost:4186`.

## Stable/Tier notes

- **Tier 1 stable imports only**: all engine calls in `index.ts` are imported from the root package entrypoint (`src/index.ts` in-repo).
- **Tier 2/internal dependencies used by this app**: none.

## Deliverables in this folder

- Runnable app:
  - `index.ts` (headless/CLI host loop)
  - `web/index.html` + `web/main.js` (inspection UI)
  - `server.mjs` (local static server)
- Architecture note: `ARCHITECTURE.md`
- What this proves note: `WHAT_THIS_PROVES.md`
- Internal access gap note: `WHAT_STILL_REQUIRES_INTERNAL_ACCESS.md`
