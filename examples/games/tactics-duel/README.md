# Tactics Duel

A shippable 2-player hot-seat tactical duel on a 5x5 grid.

## Features

- Knight / Archer / Mage custom content pack (`tactics-pack.json`)
- Deterministic turn resolution via Ananke
- Save/load via localStorage JSON
- Replay export and replay-based determinism verification
- Web playable build + desktop packaging instructions (Windows/Mac)

## Run (success metric path)

```bash
cd examples/games/tactics-duel
npm start
```

Then open `http://localhost:4173` and play a full match.

## Determinism verification

1. Start with seed `2026`.
2. Play any sequence of turns.
3. Click **Save**.
4. Click **Check Determinism**.
5. It should report pass because replay reconstruction equals live state.

## Deploy

### GitHub Pages

- Build repo: `npm run build` (from repo root)
- Publish `examples/games/tactics-duel/web` and `dist/` folder to Pages artifact.
- Set Pages root to generated artifact.

### Windows/Mac downloadable

Use Electron/Tauri wrapper around `http://localhost:4173` assets:

- Bundle `examples/games/tactics-duel/web`
- Bundle `dist/examples/games/tactics-duel/game-core.js`
- Ship as `.exe` and `.app`

## Files

- `game-core.ts`: deterministic game rules, save/load, replay validation
- `web/`: playable front-end
- `server.mjs`: local static host
