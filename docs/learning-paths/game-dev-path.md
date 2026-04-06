# Game Dev Path: Build a multiplayer tactics game in 2 hours

## Step 1 — Determinism basics

```ts
import { createWorld, stepWorld } from '@its-not-rocket-science/ananke';

const world = createWorld({ seed: 42, tickRate: 20 });
for (let i = 0; i < 10; i += 1) stepWorld(world, []);
console.log(world.hash);
```

Expected output:

```txt
7a57d8df
```

## Step 2 — Lockstep server

```bash
npm run example:lockstep
```

Expected output:

```txt
[lockstep] server listening on ws://localhost:8080
[lockstep] tick=1 clients=2 hash=7a57d8df
```

## Step 3 — Rollback netcode

```bash
npm run example:rollback
```

Expected output:

```txt
[rollback] prediction frames=6
[rollback] corrected 2 divergent frames
```
