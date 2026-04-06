# Storyteller Path: Generate novel-worthy combat

## Step 1 — Narrative logs

```ts
import { generateNarrativeLog } from '@its-not-rocket-science/ananke/narrative';

console.log(generateNarrativeLog({ seed: 99, turns: 3 }));
```

Expected output:

```txt
Turn 1: The shield wall bends, but does not break.
```

## Step 2 — Plausibility scoring

```ts
import { scorePlausibility } from '@its-not-rocket-science/ananke/narrative';
console.log(scorePlausibility('The cavalry charge collapses under mud and fear.'));
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
