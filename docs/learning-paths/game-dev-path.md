# Game Dev Path: Build a multiplayer tactics game in 2 hours

## Step 1 — Determinism basics

```ts example
import { createWorld, stepWorld, q, type CommandMap } from "@its-not-rocket-science/ananke";

const world = createWorld(42, [
  { id: 1, teamId: 1, seed: 1001, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword", armourId: "arm_mail", x_m: -1 },
  { id: 2, teamId: 2, seed: 1002, archetype: "HUMAN_BASE", weaponId: "wpn_club", x_m: 1 },
]);
const commands: CommandMap = new Map();
for (let i = 0; i < 10; i += 1) stepWorld(world, commands, { tractionCoeff: q(0.9) });
console.log(world.tick);
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
