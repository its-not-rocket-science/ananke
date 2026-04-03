# Storyteller Example: Hero-Barely-Wins Seed Search

```ts
import { analyzePlausibility } from "../../src/narrative/plausibility.js";

const report = analyzePlausibility(
  {
    winnerTeamId: 1,
    casualtiesByEntityId: { 10: false, 22: true, 31: true },
    eliminationOrder: [31, 22],
    rareEventRolls: [
      { label: "hero critical block", chance: 0.08, happened: true },
      { label: "goblin lucky stab", chance: 0.01, happened: false },
    ],
  },
  {
    expectedWinnerTeamId: 1,
    heroIds: [10],
    desiredBeat: "heroic_near_win",
    dramaticTolerance: 0.35,
  },
);

console.log(report.score);          // 0..100
console.log(report.violations);     // narrative violations (if any)
console.log(report.suggestedSeeds); // candidate seeds for reruns
```

Use `suggestedSeeds` as follow-up simulation seeds until the dramatic beat lands.
