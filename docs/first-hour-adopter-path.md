# First-Hour Adopter Path (Stable API Only)

This path is for teams who want a **working deterministic loop in under 60 minutes** using only Tier 1 APIs from:

```ts
import { ... } from "@its-not-rocket-science/ananke";
```

If you are new, start here before the deep docs.

## Success checklist

By the end of this hour you will:

1. Install and build the project.
2. Run one guided duel example.
3. Verify deterministic replay with the same seed and commands.
4. Know where to go next for advanced integration.

---

## Step 1 (10 min): Install and build

```bash
npm install
npm run build
```

## Step 2 (15 min): Run the guided first-hour example

```bash
node dist/examples/guided-first-hour.js
```

What this example proves:

- You can create a world from simple `EntitySpec` records.
- You can step the world with explicit commands.
- You can record + replay deterministic frames.

## Step 3 (15 min): Validate deterministic output

Run the same command twice:

```bash
node dist/examples/guided-first-hour.js
node dist/examples/guided-first-hour.js
```

You should see the same final tick, same casualty state, and identical replay frame count.

## Step 4 (20 min): Integrate the minimal host loop

Use this exact host shape in your game/server process:

```ts
import { createWorld, stepWorld, q, type CommandMap } from "@its-not-rocket-science/ananke";

const world = createWorld(7, [
  { id: 1, teamId: 1, seed: 7001, archetype: "KNIGHT_INFANTRY", weaponId: "wpn_longsword", armourId: "arm_mail", x_m: -1.2 },
  { id: 2, teamId: 2, seed: 7002, archetype: "HUMAN_BASE", weaponId: "wpn_club", x_m: 1.2 },
]);

for (let tick = 0; tick < 180; tick++) {
  const commands: CommandMap = new Map([
    [1, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
    [2, [{ kind: "attackNearest", mode: "strike", intensity: q(1.0) }]],
  ]);
  stepWorld(world, commands, { tractionCoeff: q(0.9) });
}
```

---

## What to read next (advanced docs preserved)

- Stable contract: [`STABLE_API.md`](../STABLE_API.md)
- Full host integration details: [`docs/host-contract.md`](host-contract.md)
- Architecture and deep technical notes: [`docs/integration-primer.md`](integration-primer.md)
- Recipes catalog: [`docs/recipes-matrix.md`](recipes-matrix.md)
- Cookbook walkthroughs: [`docs/cookbook.md`](cookbook.md)
