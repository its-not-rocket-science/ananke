# Ananke User Manual

A practical guide to embedding Ananke in your application.

---

## 1. Core concepts

Ananke is a **lockstep simulation kernel**. You call `stepWorld` once per tick (20 Hz by default),
passing a `WorldState` and a command map. The function mutates the world in-place and optionally
emits trace events to a `TraceSink` you provide.

Every quantity is an **SI value stored as a scaled integer**:

```
q(0.5)   → 5000        (dimensionless, SCALE.Q = 10000)
to.m(2)  → 20000       (metres, SCALE.m = 10000)
to.kg(75)→ 75000       (kilograms, SCALE.kg = 1000)
to.N(500)→ 50000       (newtons, SCALE.N = 100)
to.J(200)→ 200         (joules, SCALE.J = 1)
```

Never put floating-point literals or `Math.random()` in simulation code.

---

## 2. Creating entities

### Minimal entity

```typescript pseudocode
import { generateIndividual } from "./src/generate.js";
import { HUMAN_BASE } from "./src/archetypes.js";
import { STARTER_WEAPONS } from "./src/equipment.js";
import { defaultIntent, defaultAction, defaultCondition, defaultInjury } from "...";
import { v3 } from "./src/sim/vec3.js";
import { q, SCALE } from "./src/units.js";

const attrs = generateIndividual(1, HUMAN_BASE);  // seed=1, human baseline

const fighter = {
  id: 1,
  teamId: 1,
  attributes: attrs,
  energy: { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
  loadout: { items: [STARTER_WEAPONS[0]] },  // club
  traits: [],
  position_m: v3(0, 0, 0),
  velocity_mps: v3(0, 0, 0),
  intent: defaultIntent(),
  action: defaultAction(),
  condition: defaultCondition(),
  injury: defaultInjury(),
  grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0) },
};
```

### Using preset factories (Phase 15+)

```typescript pseudocode
import { mkBoxer, mkKnight, mkWrestler, mkOctopus } from "./src/presets.js";

const proBoxer    = mkBoxer(1, 1, 0, 0, "pro");         // team 1 at (0,0)
const amateurBoxer= mkBoxer(2, 2, to.m(1), 0, "amateur");
const knight      = mkKnight(3, 1, 0, 0);
const wrestler    = mkWrestler(4, 2, to.m(1), 0);
const octopus     = mkOctopus(5, 2, to.m(2), 0);
```

### Using the historical weapons database

```typescript pseudocode
import { ALL_HISTORICAL_MELEE, ALL_HISTORICAL_RANGED, MEDIEVAL_RANGED } from "./src/weapons.js";

const rapier    = ALL_HISTORICAL_MELEE.find(w => w.id === "wpn_rapier")!;
const handgun   = ALL_HISTORICAL_RANGED.find(w => w.id === "rng_handgun_9mm")!;
const arquebus  = MEDIEVAL_RANGED.find(w => w.id === "rng_arquebus")!;

// Assign to loadout
fighter.loadout.items = [rapier];
```

---

## 3. Running the simulation

### Minimal loop

```typescript pseudocode
import { stepWorld, TICK_HZ } from "./src/sim/kernel.js";
import { q } from "./src/units.js";

const world = { tick: 0, seed: 42, entities: [fighter, target] };
const cmds = new Map([
  [1, [{ kind: "attack", targetId: 2, weaponId: "wpn_club", intensity: q(1.0), mode: "strike" }]],
]);

for (let i = 0; i < 5 * TICK_HZ; i++) {   // simulate 5 seconds
  stepWorld(world, cmds, { tractionCoeff: q(0.9) });
}
```

### Collecting trace events

```typescript pseudocode
import { CollectingTrace } from "./src/metrics.js";

const tracer = new CollectingTrace();
for (let i = 0; i < 200; i++) {
  stepWorld(world, cmds, { tractionCoeff: q(0.9), trace: tracer });
}

console.log("Events collected:", tracer.events.length);
tracer.clear();  // reset between runs
```

### KernelContext options

```typescript pseudocode
stepWorld(world, cmds, {
  tractionCoeff: q(0.9),           // surface friction (0 = ice, 1 = dry ground)
  trace: tracer,                    // TraceSink for all events
  cellSize_m: Math.trunc(4*SCALE.m),// spatial grid resolution (needed for AI)
  ambientTemperature_Q: q(0.25),    // cold environment (comfort range q(0.35)–q(0.65))
  techCtx: defaultTechContext(TechEra.Medieval), // gates which items are usable
});
```

---

## 4. Commands

Commands are plain objects placed in a `Map<entityId, Command[]>`. Multiple commands per
entity per tick are supported (e.g. attack + intent move).

### Melee attack

```typescript pseudocode
{ kind: "attack", targetId: 2, weaponId: "wpn_rapier", intensity: q(1.0), mode: "strike" }
```

### Defence

```typescript pseudocode
{ kind: "defend", mode: "parry",  intensity: q(0.8) }
{ kind: "defend", mode: "block",  intensity: q(1.0) }
{ kind: "defend", mode: "dodge",  intensity: q(0.6) }
```

### Movement

```typescript pseudocode
{ kind: "move", dir: { x: SCALE.m, y: 0, z: 0 }, intensity: q(1.0), mode: "sprint" }
{ kind: "move", dir: { x: SCALE.m, y: 0, z: 0 }, intensity: q(0.5), mode: "walk" }
```

### Ranged (shoot)

```typescript pseudocode
{ kind: "shoot", targetId: 2, weaponId: "rng_handgun_9mm", intensity: q(1.0) }
// optional ammo override:
{ kind: "shoot", targetId: 2, weaponId: "rng_assault_rifle", intensity: q(1.0), ammoId: "ammo_ap" }
```

### Grapple

```typescript pseudocode
{ kind: "grapple", targetId: 2, mode: "grab",  intensity: q(1.0) }  // start hold
{ kind: "grapple", targetId: 2, mode: "throw", intensity: q(1.0) }  // throw while holding
{ kind: "grapple", targetId: 2, mode: "choke", intensity: q(1.0) }  // choke hold
{ kind: "breakGrapple", targetId: 2 }
```

### Medical treatment

```typescript pseudocode
{ kind: "treat", targetId: 3, action: "tourniquet", regionId: "leftArm",
  equipmentId: "bandage", medicalSkill: q(1.0) }
{ kind: "treat", targetId: 3, action: "surgery", regionId: "torso",
  equipmentId: "surgical_kit", medicalSkill: q(1.5) }
```

### Capability activation (magic/tech)

```typescript pseudocode
{ kind: "activate", sourceId: "arcane_mana", effectId: "fireball", targetId: 2 }
{ kind: "activate", sourceId: "fusion_cell",  effectId: "force_shield" }
```

---

## 5. Reading simulation state

### Injury

```typescript pseudocode
const e = world.entities.find(e => e.id === 2)!;

e.injury.dead                    // boolean
e.injury.consciousness           // Q: 0..SCALE.Q (SCALE.Q = full consciousness)
e.injury.fluidLoss               // Q: 0..SCALE.Q (q(0.80) = fatal)
e.injury.shock                   // Q: 0..SCALE.Q

// Per-region (humanoid: head, torso, leftArm, rightArm, leftLeg, rightLeg)
const torso = e.injury.byRegion["torso"];
torso.surfaceDamage    // Q
torso.internalDamage   // Q
torso.structuralDamage // Q
torso.bleedingRate     // Q
torso.fractured        // boolean
torso.infectedTick     // -1 = none; >0 = tick infection started
```

### Kinematics

```typescript pseudocode
e.position_m.x   // fixed-point metres (divide by SCALE.m for real metres)
e.velocity_mps.x // fixed-point m/s (divide by SCALE.mps for real m/s)
```

### Condition / morale

```typescript pseudocode
e.condition.fearQ           // Q: 0..SCALE.Q
e.condition.suppressedTicks // int: ticks of active suppression
e.condition.prone           // boolean
e.condition.pinned          // boolean
```

---

## 6. Combat analytics

```typescript pseudocode
import { collectMetrics, survivalRate, meanTimeToIncapacitation } from "./src/metrics.js";

const m = collectMetrics(tracer.events);

m.damageDealt.get(1)      // total joules delivered by entity 1
m.hitsLanded.get(1)       // melee + projectile hits by entity 1
m.hitsTaken.get(2)        // hits received by entity 2
m.tickOfKO.get(2)         // tick entity 2 went unconscious (or undefined)
m.tickOfDeath.get(2)      // tick entity 2 died (or undefined)

survivalRate(tracer.events, [1, 2, 3, 4])            // fraction never incapacitated
meanTimeToIncapacitation(tracer.events, [1,2], 200)  // mean ticks; survivors → 200
```

---

## 7. Narrative output

Convert trace events to human-readable text with `src/narrative.ts`. No kernel dependency.

```typescript pseudocode
import { narrateEvent, buildCombatLog, describeInjuries, describeCombatOutcome }
  from "./src/narrative.js";
import { ALL_HISTORICAL_MELEE, ALL_HISTORICAL_RANGED } from "./src/weapons.js";

// Build weapon profile lookup (enables verb selection)
const allWeapons = [...ALL_HISTORICAL_MELEE, ...ALL_HISTORICAL_RANGED];
const profiles = new Map(allWeapons.map(w => [w.id, w.damage]));

const cfg = {
  verbosity: "normal" as const,
  nameMap: new Map([[1, "you"], [2, "the guard"]]),
  weaponProfiles: profiles,
};

// Single event
const line = narrateEvent(ev, cfg);
// → "you stab the guard in the torso"
// → "the guard attacks you — parried"
// → "the guard dies"

// Full log
const log = buildCombatLog(tracer.events, cfg);
log.forEach(line => console.log(line));

// Injury summary
console.log(describeInjuries(world.entities[1].injury));
// → "Significant blood loss; rightArm fractured"

// Outcome
const combatants = world.entities.map(e => ({
  id: e.id, teamId: e.teamId, injury: e.injury
}));
console.log(describeCombatOutcome(combatants, world.tick));
// → "Team 1 wins — Team 2 defeated (147 ticks)"
```

**Verbosity guide**

| `terse` | Only: hits, KO, death, route/rally, fractures, blasts |
| `normal` | Adds: blocked/parried, misses, grapple start/break, weapon bind |
| `verbose` | Adds: grapple ticks, capability events, treatment |

---

## 8. Character descriptions

Translate SI attributes into readable summaries (no sim dependency):

```typescript pseudocode
import { describeCharacter, formatCharacterSheet, formatOneLine } from "./src/describe.js";
import { generateIndividual } from "./src/generate.js";
import { PRO_BOXER } from "./src/archetypes.js";

const attrs = generateIndividual(7, PRO_BOXER);
const desc  = describeCharacter(attrs);

formatOneLine(desc);
// → "Tall (1.83 m), 86 kg; strength excellent (4982 N), reaction quick (180 ms), resilience tough."

formatCharacterSheet(desc);
// Multi-line output with section headers, tier labels, and comparison phrases.
```

Tier 3 anchors to `HUMAN_BASE` nominal values. Tier 6 is superhuman/mechanical/distributed.

---

## 9. Deterministic replay

Record any simulation and seek to any past tick:

```typescript pseudocode
import { ReplayRecorder, replayTo, serializeReplay, deserializeReplay } from "./src/replay.js";

const recorder = new ReplayRecorder(world);
for (let i = 0; i < 300; i++) {
  recorder.record(world.tick, cmds);
  stepWorld(world, cmds, ctx);
}

// Seek back
const worldAt100 = replayTo(recorder.toReplay(), 100, ctx);

// Persist and restore
const json     = serializeReplay(recorder.toReplay());
const restored = deserializeReplay(json);
const same     = replayTo(restored, 100, ctx);  // identical to worldAt100
```

---

## 10. AI

The built-in AI system uses the same perception and decision pipeline as player-controlled
entities, but driven by `AIPolicy` presets.

```typescript pseudocode
import { buildAICommands } from "./src/sim/ai/system.js";
import { AI_PRESETS } from "./src/sim/ai/presets.js";
import { buildSpatialIndex } from "./src/sim/spatial.js";

// Attach policies before the loop
world.entities.forEach(e => { e.ai = { policy: AI_PRESETS.lineInfantry }; });

// In the loop, build AI commands first then pass to stepWorld
const aiCmds = buildAICommands(world, { cellSize_m: Math.trunc(4 * SCALE.m) });
// Merge with any player commands…
stepWorld(world, aiCmds, ctx);
```

Available presets: `lineInfantry` (advances, attacks, seeks cover when suppressed),
`skirmisher` (ranged harassment, retreats when pressured).

---

## 11. Technology eras and capability gating

```typescript pseudocode
import { TechEra, defaultTechContext } from "./src/sim/tech.js";
import { validateLoadout } from "./src/equipment.js";

// Medieval scenario: no firearms, no energy weapons
const ctx = { ...baseCtx, techCtx: defaultTechContext(TechEra.Medieval) };

// Near-future: powered exoskeletons available
const nearFuture = { ...baseCtx, techCtx: defaultTechContext(TechEra.NearFuture) };

// Validate before equipping
const errors = validateLoadout(entity.loadout, ctx.techCtx);
if (errors.length) console.warn("Invalid loadout:", errors);
```

Eras (cumulative): Prehistoric → Classical → Medieval → EarlyModern → Industrial →
Contemporary → NearFuture → DeepSpace.

Magic systems (`ArcaneMagic`, `DivineMagic`, `Psionics`, `Nanotech`) are not assigned to
any era — opt in explicitly:

```typescript pseudocode
const ctx = defaultTechContext(TechEra.Medieval);
ctx.available.add("ArcaneMagic");
ctx.available.add("DivineMagic");
```

---

## 12. Clarke's Third Law (capabilities)

Magic and advanced technology resolve through the same engine primitives.
A mana pool and a fusion reactor are both `CapabilitySource` with `reserve_J`.
A fireball and a plasma grenade are both `impact` payloads with `DamageChannel.Thermal`.

```typescript pseudocode
import type { CapabilitySource } from "./src/sim/capability.js";
import { DamageChannel } from "./src/channels.js";
import { to, q } from "./src/units.js";

const arcane: CapabilitySource = {
  id: "arcane_mana",
  label: "Arcane mana",
  tags: ["magic", "arcane"],
  reserve_J: 500_000,
  maxReserve_J: 500_000,
  regenModel: { type: "rest", regenRate_W: 50 },
  effects: [
    {
      id: "fireball",
      cost_J: 80_000,
      castTime_ticks: 20,
      range_m: to.m(30),
      aoeRadius_m: to.m(5),
      payload: { kind: "impact", spec: { energy_J: 5_000, channel: DamageChannel.Thermal } },
    },
  ],
};

entity.capabilitySources = [arcane];

// Activate via command
cmds.set(entity.id, [{ kind: "activate", sourceId: "arcane_mana", effectId: "fireball", targetId: 2 }]);
```

---

## 13. Common patterns

### Statistical sweep (50 seeds)

```typescript pseudocode
let wins = 0;
for (let seed = 0; seed < 50; seed++) {
  const w = buildFreshWorld(seed);
  for (let t = 0; t < 600; t++) stepWorld(w, aiCmds, ctx);
  if (w.entities.find(e => e.id === 1 && !e.injury.dead)) wins++;
}
console.log(`Win rate: ${(wins / 50 * 100).toFixed(0)}%`);
```

### Checking if a fight is over

```typescript pseudocode
function fightOver(world: WorldState): boolean {
  const teamsAlive = new Set(
    world.entities
      .filter(e => !e.injury.dead && e.injury.consciousness > q(0.20))
      .map(e => e.teamId)
  );
  return teamsAlive.size <= 1;
}
```

### Applying a one-shot explosion

```typescript pseudocode
import { applyExplosion } from "./src/sim/kernel.js";
import { v3 } from "./src/sim/vec3.js";
import { to, SCALE } from "./src/units.js";

applyExplosion(world, v3(to.m(5), to.m(5), 0), {
  radius_m:      to.m(8),
  blastEnergy_J: 20_000,
  fragCount:     40,
  fragEnergy_J:  500,
}, world.tick, tracer);
```

### Fall damage

```typescript pseudocode
import { applyFallDamage } from "./src/sim/kernel.js";

applyFallDamage(world, entityId, to.m(4), world.tick, tracer);  // 4-metre fall
```

---

## 14. Test helpers

`src/sim/testing.ts` provides `mkHumanoidEntity` and `mkWorld` for writing tests:

```typescript pseudocode
import { mkHumanoidEntity, mkWorld } from "./src/sim/testing.js";

const attacker = mkHumanoidEntity(1, 1, 0, 0);      // id=1, team=1, at (0,0)
const target   = mkHumanoidEntity(2, 2, to.m(0.8), 0);
const world    = mkWorld(99, [attacker, target]);    // seed=99

// Assign weapon
attacker.loadout.items = [ALL_HISTORICAL_MELEE.find(w => w.id === "wpn_rapier")!];
```

---

## 15. Quick-reference: key files

| File | Purpose |
|------|---------|
| `src/sim/kernel.ts` | `stepWorld`, `applyExplosion`, `applyFallDamage` |
| `src/equipment.ts` | All item types and starter catalogues |
| `src/weapons.ts` | ~70 historical weapons across 6 eras |
| `src/archetypes.ts` | Reference archetype baselines |
| `src/presets.ts` | Entity factory functions (`mkBoxer`, `mkKnight`, etc.) |
| `src/generate.ts` | `generateIndividual` — procedural entity generation |
| `src/describe.ts` | `describeCharacter`, `formatCharacterSheet`, `formatOneLine` |
| `src/narrative.ts` | `narrateEvent`, `buildCombatLog`, `describeInjuries`, `describeCombatOutcome` |
| `src/metrics.ts` | `CollectingTrace`, `collectMetrics`, `survivalRate`, `meanTimeToIncapacitation` |
| `src/replay.ts` | `ReplayRecorder`, `replayTo`, `serializeReplay`, `deserializeReplay` |
| `src/debug.ts` | `extractMotionVectors`, `extractHitTraces`, `extractConditionSamples` |
| `src/model3d.ts` | `extractRigSnapshots` — 3D rig integration |
| `src/sim/ai/system.ts` | `buildAICommands` |
| `src/units.ts` | `q`, `to`, `SCALE`, `qMul`, `mulDiv` — all fixed-point helpers |
