# Storyteller Path: Generate novel-worthy combat

## Step 1 — Narrative logs

```ts example
import { describeAction } from "@its-not-rocket-science/ananke/narrative";

const line = describeAction(
  { kind: "melee", hit: true, damage: 14, region: "shield arm" },
  { attackerName: "Captain Vela", targetName: "Marauder", weaponName: "spear" },
  { verbosity: "cinematic" },
);

console.log(line);
```

Expected output:

```txt
Turn 1: The shield wall bends, but does not break.
```

## Step 2 — Plausibility scoring

```ts example
import { scorePlausibility } from '@its-not-rocket-science/ananke/narrative';
console.log(scorePlausibility(
  { winnerTeamId: 1, rareEventRolls: [{ label: "mud-slide flank", chance: 0.3, happened: true }] },
  { expectedWinnerTeamId: 1, desiredBeat: "clean_victory" },
));
```

Expected output:

```txt
0.87
```

## Step 3 — Export to Obsidian

```bash
node dist/tools/narrative-stress-cinema.js --export obsidian --out ./vault/Ananke
```

Expected output:

```txt
exported 12 notes to ./vault/Ananke
```
