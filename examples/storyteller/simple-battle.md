# Storyteller Example: Narrative Combat Log

```ts
import { describeAction } from "../../src/narrative/combat-logger.js";

const line = describeAction(
  { kind: "melee", hit: false, damage: 12, shieldBlocked: true },
  {
    attackerName: "Sir Marcus",
    targetName: "the orc",
    weaponName: "longsword",
    terrain: "muddy",
  },
  { verbosity: "cinematic" },
);

// "Sir Marcus's longsword clangs against the orc's shield — a near miss because of muddy terrain!"
```

## Tactical Mode

- `Sir Marcus misses the orc with longsword because of muddy terrain.`
- `Alina lands a shot on the raider (torso) at 28.0m.`

## Cinematic Mode

- `Sir Marcus's longsword clangs against the orc's shield — a near miss because of muddy terrain!`
- `Alina's arrow finds the raider's torso, shifting the momentum of the fight.`
