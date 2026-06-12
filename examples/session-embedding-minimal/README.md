# session-embedding-minimal

Minimal, framework-free embedding template for the session facade package surface.

## What it demonstrates

1. Create a **tactical** session.
2. Run a few tactical steps.
3. Serialize and deserialize the session.
4. Create a **world_evolution** session.
5. Run world evolution.
6. Fork the world evolution session.
7. Print summaries for the main and forked sessions.

## Imports used

- `@its-not-rocket-science/ananke/session`
- `@its-not-rocket-science/ananke` (Tier-1 root import for `q`)

## Run

```bash
npm run build
npm run example:session-embedding-minimal
```

Or directly:

```bash
node dist/examples/session-embedding-minimal/index.js
```
