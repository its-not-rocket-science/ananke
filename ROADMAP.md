# Ananke Development Roadmap

---

## Phase 0 — Foundational Vision

Ananke is not a combat simulator.

It is a **physics-grounded simulation substrate** for modelling living and constructed beings,
their capabilities, their injuries, and their environments — across any era from prehistoric to deep space.

The system replaces HP/AC abstractions with SI-based physical modelling. Every meaningful quantity
has a physical interpretation and a physical unit.

---

### Core design goal

Create a deterministic physics-based engine suitable for:

- CRPGs and simulation-heavy RPGs
- Emergent gameplay worlds
- Research-grade physical modelling of injury and survivability
- Realistic 3D character simulation driven by physical parameters
- Deterministic multiplayer or replayable simulation
- Scientific and speculative xenobiology

All mechanics must derive from:

- Physical properties (mass, force, energy, velocity)
- Biology and materials
- Environment and technology level
- Medical capability (including speculative and magical)

NOT from arbitrary hit points, armour classes, or 1–20 ranges.

---

### The SI attribute philosophy

Individual variation between entities is expressed in absolute physical terms, not game-scale numbers.

| What varies | How it is modelled | Unit |
|---|---|---|
| Muscular strength | Peak force output | N (newtons) |
| Explosive power | Peak mechanical power | W (watts) |
| Stamina | Sustainable aerobic power | W (watts) |
| Energy reserves | Total metabolic reserve | J (joules) |
| Reaction speed | Neuromuscular latency | s (seconds) |
| Motor coordination | Control quality, fine control | dimensionless 0–1 |
| Balance and stability | Stability coefficient | dimensionless 0–1 |
| Tissue toughness | Surface, bulk, structural integrity | dimensionless multiplier on baseline |
| Pain tolerance | Distress tolerance | dimensionless 0–1 |
| Thermal resilience | Heat and cold tolerance | dimensionless 0–1 |
| Fatigue rate | Fatigue accumulation rate | dimensionless multiplier |
| Recovery rate | Recovery rate multiplier | dimensionless multiplier |
| Body size | Stature, mass | m (metres), kg (kilograms) |
| Reach | Reach scale | dimensionless multiplier |

A "strong" human is not Strength 18. They have `peakForce_N = 2800` and `peakPower_W = 1800`.
The engine reasons from those numbers directly in kinetic and grapple calculations. There is no
translation layer.

---

### Skill and cognitive attributes

Skills are learned modifications to physical performance, not abstract point tallies.
They are expressed as adjustments to physical outcomes:

| Skill domain | What it affects | Unit |
|---|---|---|
| Weapon technique | Effective strike timing, energy transfer efficiency | s offset, dimensionless multiplier |
| Defensive technique | Parry window, dodge timing | s |
| Medical skill | Wound treatment rate, surgical success probability | Q/s, dimensionless |
| Navigation and tactics | Formation position error, route quality | m, dimensionless |
| Ranged technique | Aim error at range, effective grouping radius | m at distance |

A skilled swordsman does not have "Sword Skill 14". They have a shorter effective reaction time
(e.g. -40 ms on parry timing), higher energy delivery efficiency (x1.15 on strike KE transfer),
and lower hit area dispersion. The numbers are physically grounded and compose naturally with
physical attributes.

Skill architecture is defined in Phase 7 (Skill System).

---

### Cognitive and intelligence attributes

Cognitive capacity is modelled as observable physical outcomes, not abstract intelligence scores.

| Cognitive attribute | What it affects | Unit |
|---|---|---|
| Decision latency | Time to revise tactical plan | s (seconds) |
| Attention depth | Entities simultaneously tracked | integer count |
| Threat horizon | Range at which threats are meaningfully processed | m (metres) |
| Learning rate | Multiplier on skill acquisition speed | dimensionless |

This representation works across all entity types. A wolf has a short decision latency,
wide threat horizon, shallow attention depth, and zero learning rate (instinct-driven).
A veteran soldier has longer deliberation, moderate horizon, deep attention, and positive
learning rate. An insect has near-zero attention depth and purely reactive decision latency.

Cognitive architecture is defined in Phase 4 (Perception and Cognition).

---

### Non-negotiable constraints

Everything must remain:

- **Deterministic** — same seed + same inputs → identical results
- **Fixed-point where required** — no floating-point drift in simulation path
- **Reproducible** — replay-safe at all scales
- **Testable** — every system exercised by unit tests
- **Extensible** — new body plans, hazards, and technologies without engine rewrites

No feature may compromise determinism.

---

## Phase 1 — Physical Melee Combat (complete)

Core kinetic combat simulation.

**Implemented:**

- Attack resolution with deterministic RNG and skill-vs-skill contests
- Hit location selection and hit quality scaling
- Block, parry, dodge with defence intensity and cooldowns
- Shield interposition with region coverage
- Armour interaction across all damage channels
- Per-region injury accumulation (surface, internal, structural, bleeding)
- Shock, fluid loss, consciousness, and death tracking
- Functional impairment: damage drives movement, manipulation, and defence penalties
- Movement physics: sprint speed, acceleration, jump height derived from physical attributes
- Encumbrance: mass + bulk affects speed, fatigue, and control
- Push and repulsion: deterministic mass-based entity separation
- Density modelling: crowd slowdown
- Spatial partitioning: grid index with O(1) neighbour queries
- Formation frontage cap: limits engagers per target
- Occlusion: friendly lane blocking
- Fire, corrosive, electrical, radiation, suffocation hazards (tick-based accumulation)

**Completed in Phase 2:** grappling (full mechanics) and stamina (full exhaustion model).

---

## Phase 2 — Grappling, Stamina and Weapon Dynamics (complete)

### Grappling system (complete)

Goal: deterministic close-combat control.

- Grapple attempt resolution (strength + mass + technique contest, seeded RNG)
- Leverage comparison using physical moment arms (N·m)
- Break-grapple attempt mechanics
- Positional locking (prone, pinned, standing)
- Throw and trip: outcome proportional to leverage differential and velocity (kg·m/s)
- Ground fighting states: attack and defence modifiers per position
- Choke and joint-lock: targeted structural or suffocation damage
- Pinned/held impairment penalties in mobility and manipulation multipliers

### Stamina and energy model (complete)

- Stamina depletion per action type (strike, block, sprint, grapple) in joules
- Regen rate proportional to `continuousPower_W` and recovery state
- Exhaustion threshold: when reserve falls below 15% of baseline, functional penalties ramp in
- Collapse when depleted: entity becomes prone and defenceless
- Fatigue accumulation (`energy.fatigue`) affects all four functional multipliers

### Weapon dynamics expansion (complete)

- Recovery time after missed strike: `floor(mass_kg × reach_m × 2)` extra cooldown ticks, scaled by swing intensity
- Weapon bind on parry: probability based on both weapons' moment arms; duration based on average mass; requires seeded strength contest (`breakBind` command) to disengage early
- Reach dominance: reach deficit penalises both attacker and parrying defender (tactical/sim modes)
- Two-handed leverage bonus: 1.12× energy delivery when both arms are functional and no off-hand item
- Bind state traces: `WeaponBind` on lock, `WeaponBindBreak` on timeout or forced break
- Fatigue increases bind probability (tired fighters bind more easily)

**Not implemented** (deferred): momentum carry between strikes (committed swing inertia).

---

## Phase 3 — Ranged and Projectile Combat

Ranged combat is a first-class system, not an extension of melee.

### Projectile physics

Every projectile has:

- Initial velocity (m/s)
- Mass (kg)
- Effective cross-section (m²)
- Drag coefficient (dimensionless)
- Time of flight (s, computed deterministically)

Impact energy at target is computed from velocity at arrival, not muzzle energy. Energy loss over
distance follows a simplified drag curve stored as fixed-point coefficients per projectile class.

Projectile categories:

| Category | Examples | Key physical parameter |
|---|---|---|
| Thrown | Stone, javelin, axe | Launch energy proportional to thrower's peakPower_W |
| Muscle-powered | Arrow, bolt, sling | Stored energy in bow or sling (J, fixed weapon property) |
| Chemical propellant | Firearms, all eras | Muzzle energy (J, weapon property) |
| Energy | Laser, plasma (far future) | Beam power (W), pulse duration (s) |

### Aimed fire and accuracy

Aiming error is modelled as angular dispersion (radians), converting to grouping radius at range
(metres). Influenced by:

- Ranged technique skill (reduces dispersion)
- Reaction time and cognitive latency (affects lead calculation for moving targets)
- Fatigue (increases dispersion when stamina is low)
- Cover and partial occlusion (reduces effective target area)

There is no to-hit roll independent of physics. A shot lands within the target's body profile
or it does not, based on computed dispersion at range.

### Penetration at range

Kinetic projectiles retain penetration proportional to residual KE. Armour resistance is
expressed in J; if residual KE exceeds the armour threshold, the round penetrates and transfers
residual energy as injury. Identical to the melee kinetic channel, with velocity-dependent input.

### Suppression

Incoming fire within a threat radius (m) causes stress accumulation even on near-misses,
feeding the morale and fear system (Phase 5).

### Planned extensions

#### Cover and partial occlusion

Obstacles occupy a fraction of the target's apparent cross-section from the shooter's vantage
point. This fraction reduces the effective body half-width used in hit determination:

```
effectiveHalfWidth_m = bodyHalfWidth_m × (1 - coverFraction)
```

`coverFraction` is a Q value (0 = no cover, q(1.0) = full hard cover) derived from the
obstacle's geometry and its position relative to the shooter–target line. Full hard cover
(`coverFraction = q(1.0)`) makes the target un-hittable directly; indirect fire or flanking
required. Partial cover (e.g., q(0.50)) roughly halves effective target area and thus doubles
the range at which accurate fire is possible.

Cover cells are introduced in Phase 6 (battlefield systems). The ranged hit formula already
has the insertion point (`bodyHalfWidth_m`) ready to receive the modifier.

#### Aiming time (multi-tick hold)

Sustained aim across multiple ticks before firing reduces dispersion multiplicatively. An
entity accumulates an `aimTicks` counter while issuing consecutive `shoot` commands against
the same target without firing (or via a new `aim` command). Dispersion is reduced by an
`aimMul` that converges from 1.0 toward a weapon-specific minimum (e.g., q(0.50) at full
aim for a longbow):

```
aimMul = max(wpn.minAimMul, q(1.0) - qMul(aimTicks × aimDecayRate, q(1.0)))
adjustedDisp = qMul(adjustedDispersionQ(...), aimMul)
```

`aimTicks` resets on movement, taking a hit, or firing. `aimDecayRate` and `minAimMul` are
per-weapon properties. A crossbow can hold full aim indefinitely (low decay, stable rest);
a drawn longbow accumulates fatigue and degrades aim after ~3 seconds.

#### Moving target penalty

Target angular velocity (rad/s) contributes to effective dispersion as a lead-calculation
error proportional to the shooter's `reactionTime_s`. If the shooter's lead estimate is
wrong by more than the residual grouping radius, the shot misses even if dispersion is low:

```
leadError_m = mulDiv(target.velocity_mps, reactionTime_s, SCALE.s)
effectiveGroupRadius_m = groupingRadius_m + leadError_m
```

The penalty is largest for fast-moving targets at close range (counter-intuitively difficult
to hit) and small for distant slow targets where grouping radius already dominates. No new
state is required; `target.velocity_mps` and `reactionTime_s` are already on the entity.

#### Suppression and AI decision-making

The existing `suppressedTicks` counter (Phase 3) feeds a `suppressionQ` value to `deriveFunctionalState`
as a −10% `coordinationMul` penalty. Planned AI integration (Phase 4 and Phase 5):

- `decideCommandsForEntity` checks `suppressedTicks > 0` and biases toward `setProne` or
  `move` (retreat) over `attack` or `shoot`, weighted by the entity's `distressTolerance`
- Fear accumulation (Phase 5): each suppression tick contributes a fear increment
  proportional to `(1 - distressTolerance) × suppressionStrength_J`, where
  `suppressionStrength_J` is a per-weapon property (near-miss by a cannon contributes more
  fear than a sling stone)
- Suppression duration scales with incoming fire intensity; sustained fire resets the
  counter, preventing recovery until the source is neutralised

#### Ammunition types

A `RangedWeapon` can carry an `ammo?: AmmoType[]` array. When present, a `shoot` command
may specify an `ammoId` to select a loaded round. `AmmoType` overrides the weapon's base
properties for that shot only:

```typescript
interface AmmoType {
  id: string;
  name: string;
  projectileMass_kg: I32;    // heavier = more KE at cost of drag
  dragCoeff_perM: Q;          // streamlined vs blunt rounds
  damage: WeaponDamageProfile; // hollow-point vs AP vs incendiary
  launchEnergyMul?: Q;        // e.g., q(0.85) for subsonic round
}
```

Examples: bodkin arrow (high structuralFrac, low dragCoeff) vs broadhead (high bleedFactor,
higher drag); standard ball vs explosive shell (damage deferred to Phase 10 blast model);
armour-piercing vs hollow-point for firearms. The base weapon's `launchEnergy_J` is
multiplied by `launchEnergyMul` if present. No engine change is needed beyond reading the
override in `resolveShoot()`.

### Indirect fire (planned Phase 10)

Mortars, artillery, grenades: explosion physics handled in Phase 10 (Environmental Hazards).

### Energy weapons (far future)

Energy weapons deliver damage via the Thermal or Radiation channel:

- Beam power (W) or pulse energy (J)
- Effective range before beam degrades below armour threshold (m)
- Spot size at range (m²) determines localisation of thermal dose
- Armour interaction: thermal channel resistance applies; reflective coatings are a new armour
  property (reflectivity coefficient, dimensionless)

---

## Phase 4 — Perception and Cognition (complete)

Goal: entities model their environment, not just react to it.

**Implemented:**

### Sensory model

Entities have species-appropriate sensory capabilities stored in `IndividualAttributes.perception`:

- `visionRange_m`: maximum reliable visual range (metres)
- `visionArcDeg`: field of view (degrees; 120° human, 360° robot)
- `halfArcCosQ`: pre-computed cos(arc/2) for O(1) sim-path arc checks
- `hearingRange_m`: omnidirectional acoustic detection range (metres)

Sensory range modifiers in `SensoryEnvironment` (default: daylight/clear/quiet):
- `lightMul`: vision multiplier (darkness, dim light)
- `smokeMul`: vision multiplier (fog, smoke, dust)
- `noiseMul`: hearing range multiplier

`canDetect(observer, subject, env)` returns Q: `q(1.0)` = fully seen, `q(0.4)` = heard only, `q(0)` = undetected.

### Cognitive model

Implements the cognitive attributes defined in Phase 0:

- `decisionLatency_s`: minimum time between tactical plan revisions (500ms human, 50ms robot)
- `attentionDepth`: maximum simultaneously tracked threats (4 human, 16 robot)
- `threatHorizon_m`: perception and targeting radius (40m human, 150m robot)

`decisionCooldownTicks` in `AIState` enforces the latency: `decideCommandsForEntity` returns
`[]` while cooling, allowing the previous intent to persist unchanged.

### Threat prioritisation

`perceiveLocal` filters by both `threatHorizon_m` (spatial radius) and `canDetect` (sensory
quality). `pickTarget` uses the entity's own horizon instead of a hardcoded 6m radius.
`attentionDepth` caps the number of simultaneously tracked entities.

### Surprise mechanics

`resolveAttack` calls `canDetect(target, attacker, env)`:
- `≥ q(0.8)` — no surprise; full defensive intensity
- `< q(0.8)` — partial surprise; `defenceIntensityEffective` scaled by detection quality
- `= q(0)` — full surprise; defence eliminated for that attack

`sensoryEnv` is passed into `stepWorld` via `KernelContext.sensoryEnv` (defaults to daylight/clear).

---

## Phase 5 — Morale and Psychological State (complete)

### Fear accumulation

Fear is a physical accumulator, dimensionless 0–1, driven by aversive stimulus rate. Sources:

- Incoming projectiles (suppression, from Phase 3)
- Nearby deaths of allies
- Injury to self
- Outnumbering
- Surprise

Fear decays at a rate proportional to `distressTolerance` and proximity of allies (cohesion effect).

### Morale and routing

When fear exceeds an entity-specific threshold, the entity transitions to retreat behaviour.
Threshold is an entity property (dimensionless, varies by individual and species).

Routing cascade: if a threshold fraction of a team routes, fear propagates to remaining members
(dimensionless contagion factor, calibration TBD).

### Pain and suppression of action

Pain intensity (derived from injury type and `distressTolerance`) creates an action suppression
probability. High pain can prevent attack initiation even when the entity is physically capable.
Resolved deterministically via seeded RNG.

### Phase 5 enhancements (deferred)

**Caliber-based suppression fear** — `FEAR_PER_SUPPRESSION_TICK` is currently constant.
Add `suppressionFearMul: Q` to `RangedWeapon` (q(1.0) for sling, q(3.0) for musket).
Store as `condition.suppressionFearMul: Q` alongside `suppressedTicks`; multiply in
`stepMoraleForEntity`. Requires a weapon data pass to assign caliber-appropriate values.

**Fear memory and diminishing returns** — repeated ally deaths in quick succession lose
psychological impact. Add `condition.recentAllyDeaths: number` and `lastAllyDeathTick: number`.
Apply a diminishing multiplier: first death = full weight, subsequent deaths in the same 5 s
window scale by `max(0.4, 1.0 - 0.15 × priorDeaths)`. Requires two new condition fields.

**Leader and standard-bearer auras** — entities with `TRAIT_LEADER` or `TRAIT_STANDARD_BEARER`
traits reduce fear accumulation for nearby allies each tick (fear reduced as additional decay term,
~q(0.015) per leader, ~q(0.010) per banner within 20 m radius). Requires trait constants and
an extra `queryNearbyIds` pass in `stepMoraleForEntity`.

**Panic action variety** — instead of always fleeing, routing entities may freeze (return `[]`)
or surrender (drop weapons, go prone) based on a seeded roll weighted by `distressTolerance`.
Requires a "captive/surrendered" state flag in `ConditionState`.

**Rally mechanic** — when fear drops below the routing threshold after routing, add a short
`condition.rallyCooldownTicks` that suppresses attacks (similar to hesitant state but
post-route recovery). Prevents instant aggression flips after brief respite.

**Formation cohesion bonus** — when Phase 6 formation system exists, allies in the same
formation unit provide a higher cohesion bonus than unaffiliated allies. Extend
`fearDecayPerTick` to accept a `formationAllyCount` argument with a separate coefficient
(e.g., q(0.004) per formation ally vs q(0.002) for non-formation).

**Entity archetype fear response** — add `fearResponse: "flight" | "freeze" | "berserk"` to
`IndividualAttributes` (or archetype). Undead/automata use "berserk" (ignore fear entirely);
animals use "flight" (faster onset). Requires archetype expansion and a fear-response switch
in `decideCommandsForEntity`.

---

## Phase 6 — Large-Scale Simulation

### Formation system expansion

- Shield walls: adjacent shield-bearing entities share block coverage across arc
- Rank depth effects: rear ranks contribute push force and replace front-rank casualties
- Push-of-pike dynamics: formation momentum as a mass × velocity product (kg·m/s)
- Formation morale sharing: cohesion bonus when formation is intact

### Battlefield systems

- **Terrain friction (complete):** `src/sim/terrain.ts` — `TerrainGrid` (sparse map of cell → SurfaceType),
  `SURFACE_TRACTION`, `SURFACE_SPEED_MUL`, `tractionAtPosition`, `speedMulAtPosition`, `buildTerrainGrid`.
  `KernelContext.terrainGrid?: TerrainGrid`. `stepMovement` looks up per-cell traction and speed multiplier.
  Surface types: `normal | mud | ice | slope_up | slope_down`. Speed muls: mud=0.60×, ice=0.45×, slope_up=0.75×, slope_down=1.10×.
- **Obstacles and cover (complete):** `ObstacleGrid` (sparse map of cell → Q cover fraction). Full cover (q(1.0))
  blocks movement; partial cover reduces effective target half-width in hit determination (`effectiveHalfWidth_m =
  bodyHalfWidth_m × (1 − coverFraction)`). `coverFractionAtPosition`, `buildObstacleGrid`.
- **Elevation (complete):** `ElevationGrid` (sparse map of cell → height in fixed-point metres). Elevation
  differential added to 3D reach check in melee; 3D range used for projectile drag calculation.
  `elevationAtPosition`, `buildElevationGrid`. `KernelContext.elevationGrid?: ElevationGrid`.
- **Slope direction (complete):** `SlopeGrid` (sparse map of cell → `SlopeInfo { type: "uphill"|"downhill"; grade: Q }`).
  Speed multiplier: uphill → `clampQ(1 − grade × 0.25, 0.50, 0.95)`; downhill → `clampQ(1 + grade × 0.10, 1.0, 1.20)`.
  `slopeAtPosition`, `buildSlopeGrid`. `KernelContext.slopeGrid?: SlopeGrid`.
- **Dynamic terrain hazards (complete):** `HazardGrid` (sparse `Map<string, HazardCell>` where
  `HazardCell = { type: "fire"|"radiation"|"poison_gas"; intensity: Q; duration_ticks: number }`).
  Fire → torso surface damage + shock; radiation → torso internal damage; poison gas → torso internal + consciousness loss.
  Cells with `duration_ticks > 0` burn down each tick and are removed at zero; `duration_ticks = 0` is permanent.
  `stepHazardEffects` called after movement each tick. `buildHazardGrid`. `KernelContext.hazardGrid?: HazardGrid`.
- **Cover morale bonus (complete):** `stepMoraleForEntity` applies −q(0.01) fear/tick when entity occupies
  a cell with cover fraction > q(0.5). Requires `KernelContext.obstacleGrid`.
- **Elevation melee advantage (complete):** When attacker elevation exceeds target elevation by > 0.5 m,
  `attackSkill` receives a bonus `clampQ((elevDiff − 0.5 m) × 0.05 / 1 m, 0, q(0.10))`. Active in
  tactical and sim realism modes only.
- **AI cover-seeking (complete):** `decideCommandsForEntity` accepts `obstacleGrid?` and `cellSize_m?`.
  When self cover < q(0.3) and enemies are nearby, `findBestCoverDir` scans 8 adjacent cells and directs
  entity toward the highest non-impassable cover cell at "run" mode.
- Choke points: frontage cap derived geometrically from map data (planned)

### Scenario tools

- Scripted battle setup with entity and formation placement
- Reproducible test scenarios with fixed seed and command sequence
- Performance benchmarking harness (entities per tick at target frame rate)
- Replay recording: deterministic event log sufficient to reconstruct any tick

---

## Phase 7 — Skill System (complete)

Skills are separate from physical attributes. They represent learned technique applied to
physical capability.

### Architecture

Each entity carries a `skills` map: `SkillId -> SkillLevel`. SkillLevel is not a 1–20 integer.
It is a set of physical outcome modifiers:

```typescript
interface SkillLevel {
  hitTimingOffset_s: I32;     // negative = faster (e.g. -40 ms parry window)
  energyTransferMul: Q;       // KE delivery efficiency multiplier
  dispersionMul: Q;           // aimed fire dispersion multiplier (ranged)
  treatmentRateMul: Q;        // healing/clotting rate multiplier (medical)
  fatigueRateMul: Q;          // energy cost per action multiplier
  // additional domain-specific fields per skill type
}
```

### Skill domains

| SkillId | Domain | Key modifiers |
|---|---|---|
| `meleeCombat` | Melee striking and footwork | Hit timing offset (s), energy transfer efficiency |
| `meleeDefence` | Parry and dodge technique | Parry window (s), dodge distance (m) |
| `grappling` | Grapple and ground fighting | Leverage multiplier, grip quality (Q) |
| `rangedCombat` | Aimed projectile fire | Dispersion radius at range (m) |
| `throwingWeapons` | Thrown weapon technique | Launch energy as fraction of peakPower_W |
| `shieldCraft` | Shield use technique | Coverage arc extension (degrees), block timing (s) |
| `medical` | Wound treatment | Bleed clotting rate multiplier, shock reduction rate |
| `athleticism` | General physical performance | Fatigue rate multiplier, recovery speed |
| `tactics` | Tactical decision quality | Decision latency reduction (s), threat horizon extension (m) |
| `stealth` | Concealment and movement noise | Effective acoustic signature radius (m) |

### Implemented (Phase 7 complete)

The core skill system is implemented. See `src/sim/skills.ts`:

- `SkillId` (10 domains), `SkillLevel`, `SkillMap`
- `buildSkillMap`, `getSkill` (neutral defaults when skill absent)
- `combineSkillLevels(a, b)` — utility for host-side composition

Wiring points in the engine: meleeCombat (attack timing + energy), meleeDefence, shieldCraft,
grappling, rangedCombat, throwingWeapons, medical, athleticism, tactics, stealth.

### Skill synergies (host-side, no engine change needed)

The engine does not implement synergy logic. Instead, the host composes `SkillLevel` values
before building the `SkillMap` using `combineSkillLevels`:

```typescript
// Example: meleeCombat + athleticism synergy: faster swings also drain less fatigue
const meleeSynergy = combineSkillLevels(baseMelee, { ...defaultSkillLevel(), fatigueRateMul: q(0.90) });
entity.skills = buildSkillMap({ meleeCombat: meleeSynergy });
```

`combineSkillLevels` adds timing offsets and multiplies Q fields, composing arbitrary bonuses.
Synergy definitions stay in the host application where game design belongs.

### Skill requirements for actions (host-side, no engine change needed)

Complex technique gates (e.g. "only allow jointlock if grappling skill is above threshold")
are handled by the host before issuing commands. The engine always executes commands as
instructed; an unskilled entity's neutral `energyTransferMul` means the technique executes
but delivers poor results — physical degradation without binary blocking.

If hard action gating is needed in the engine (e.g. prevent throw attempt below a minimum
contest score), the right mechanism is a per-command `minSkillQ?: Q` field on `GrappleCommand`
that `resolveGrappleCommand` checks before resolving. This keeps the gate data-driven without
hardcoding thresholds per skill domain.

### Skill acquisition and decay (host-side concern)

Skill progression (experience accumulation, decay from disuse, training) operates on
campaign or long-form time scales (days to months), not at the 20 Hz combat tick rate.
This belongs in the host application, not the engine. The engine's role is to consume
whatever `SkillMap` the host provides — it does not write back to skill values.

Host applications may use `combineSkillLevels` to composite base skill levels with
experience or decay modifiers before passing them to the simulation.

---

## Phase 8 — Universal Body and Species System

**Prerequisite for Phases 9 and 10.**

The current implementation hard-codes six humanoid body regions. This phase makes body plans
fully data-driven.

### Body plan data structure

```typescript
interface BodyPlan {
  id: string;
  segments: BodySegment[];
  locomotion: LocomotionModel;
  cnsLayout: CNSLayout;
}

interface BodySegment {
  id: string;
  parent: string | null;
  mass_kg: I32;
  exposureWeight: Record<DamageChannel, Q>;
  locomotionRole?: "primary" | "secondary" | "none";
  manipulationRole?: "primary" | "secondary" | "none";
  cnsRole?: "central" | "ganglionic" | "none";
}
```

### Body plans to support

| Type | Example | Key structural difference |
|---|---|---|
| Humanoid | Human, elf, robot | Bilateral upright, 4 limbs |
| Quadruped | Dog, horse, bear | 4 locomotion limbs, lower COG |
| Theropod | Large predator, fantasy drake | Bipedal, heavy tail counterbalance |
| Sauropod | Brachiosaurus-type | Long neck and tail, 4 locomotion limbs |
| Avian | Bird, winged creature | Hollow bones, wings as forelimbs |
| Vermiform | Snake, worm | No discrete limbs, lateral undulation |
| Centaur | Combined horse and humanoid | 4 locomotion + 2 manipulation segments |
| Octopoid | Octopus-type | Distributed manipulation, no dedicated locomotion |
| Custom alien | Arbitrary | Data-driven, no engine changes required |

Each body plan is a data file. Adding a new species requires authoring a BodyPlan and an
Archetype baseline, not modifying the simulation kernel.

---

## Phase 9 — Injury and Medical Simulation

**Depends on Phase 8 (body plan system).**

### Extended injury types

Building on the current per-region model:

- Fracture: structural damage with persistent locomotion or manipulation penalty
- Organ damage: region-specific internal damage with systemic consequence
- CNS damage: incapacitation or death proportional to CNS layout (Phase 8)
- Infection: onset delay (s), progression rate, treatment dependency (TBD model)
- Long-term disability: permanent attribute reduction after severe injury (TBD)

### Bleeding and survival

- Natural clotting: rate proportional to `structureIntegrity`, reducing bleed over time
- Fatal bleed threshold: total fluid loss beyond which death is irreversible
- Tourniquet and pressure: treatment action that zeroes regional bleeding immediately

### Medical capability

Treatment outcomes depend on:

- Medical skill level of practitioner (SkillId: `medical`)
- Tools available, parameterised by capability tier (bandages, surgical kit, autodoc, nanomedicine)
- Time since injury (infection window, shock progression)
- Technology level (Phase 11)
- Optional: magical healing (Phase 12)

Treatment is modelled as a rate process. A medic applies treatment actions that modify bleed
rate, clotting rate, shock level, and fluid replacement at physically plausible rates.
There is no instant heal.

---

## Phase 10 — Environmental Hazards

**Fire, corrosive, electrical, radiation, suffocation: partially implemented.**

### Physical hazards

- **Falling**: impact energy = 0.5mv²; v derived from fall height. Kinetic channel.
- **Crushing**: sustained compressive force (N) applied to structural regions.
- **Drowning**: suffocation + thermal (cold water) + pressure at depth.
- **Decompression**: internal damage from pressure differential (model TBD).
- **Extreme temperature**: thermal channel dose from ambient environment, not fire.

### Explosions

Blast overpressure (Pa) attenuating with distance by inverse square law. Fragmentation as
kinetic projectiles with a mass and velocity distribution. Area of effect applies to all
entities within radius.

### Biological and chemical hazards

**Pharmacokinetics model**: all substances (poisons, toxins, drugs, stimulants) follow a
simplified one-compartment model:

```
d[concentration]/dt = absorptionRate - eliminationRate × [concentration]
```

Damage or benefit is proportional to concentration above threshold. This supports poisons,
venoms, anaesthetics, stimulants, and disease toxins within the same framework.

Disease: infection probability on exposure, incubation period (s), symptom progression rate,
recovery rate. Modelled as a slow-acting internal damage channel.

---

## Phase 11 — Technology Spectrum

### Parameterisation mechanism

Each world state carries a `TechContext`:

```typescript
interface TechContext {
  era: TechEra;
  medicalTier: MedicalTier;
  available: Set<TechCapability>;
}

enum TechEra {
  Prehistoric = 0,
  Ancient = 1,
  Medieval = 2,
  EarlyModern = 3,
  Industrial = 4,
  Modern = 5,
  NearFuture = 6,
  FarFuture = 7,
  DeepSpace = 8,
}
```

`TechCapability` examples: `FirearmsPropellant`, `MetallicArmour`, `ExplosiveMunitions`,
`BallisticArmour`, `PoweredExoskeleton`, `EnergyWeapons`, `NanomedicalRepair`, `ReactivePlating`.

Items are not statically era-locked. `TechContext` validates which items are reachable for a
given scenario. A bronze sword is valid in any era; a plasma rifle requires `FarFuture` or
`EnergyWeapons` capability.

### Technology effects by domain

| Domain | How technology era changes it |
|---|---|
| Weapons | Available types; muzzle energy (J) for firearms; beam power (W) for energy weapons |
| Armour | `resist_J` ranges; channel protections; `reflectivity` for energy weapon resistance |
| Medicine | Medical tier gates which treatment actions are available and at what rates |
| Sensors | `visionRange_m` boost from optics; electronic threat detection range (m) |
| Mobility | Powered exoskeleton multipliers on `peakForce_N` and sprint speed |
| Survivability | Vacuum suit (suffocation immunity), radiation hardening, pressure equalisation |

---

## Phase 12 — Magic and Speculative Systems

Magic is treated as an additional physical layer with non-standard but internally consistent
rules. It does not bypass the SI framework; it extends it.

**Core principle**: every magical effect maps to a physical outcome the engine already
understands. Magic is the source or mechanism; the engine handles downstream mechanics
identically regardless of origin.

| Magical effect | Engine interpretation |
|---|---|
| Magical healing | Treatment action at elevated rate; may restore structural damage (normally permanent) |
| Magical fire | Thermal channel dose; same armour interaction as mundane fire |
| Magical shield or ward | Additional armour layer with configurable channel mask and resist_J |
| Telekinetic force | Force vector applied to entity (N); same physics as impact event |
| Magical poison | Pharmacokinetics model with custom absorption and elimination rates |
| Anti-magic field | Suppresses `MagicSource` trait; entities lose magical attribute contributions |
| Regeneration | Recovery rate multiplier applied to all injury types per tick |
| Structural repair | Writes back to structural damage fields (normally write-once after injury) |

### Magic as a capability tier

Magic availability is a `TechCapability` entry in `TechContext`. In a mundane scenario, magic
capabilities are absent and the system behaves exactly as without them.

### Mana and magical reserve (TBD)

The mechanism by which magical energy is limited is not yet designed. Options include: a
separate reserve analogous to `reserveEnergy_J`; ritual cost modelled as time (s); physical
drain modelled as increased `fatigueRate`. To be decided based on target use cases.

---

## Phase 13 — Replay, Research and Tooling

### Replay system

- Deterministic replays from seed + initial state + command log
- Event log playback with time scrubbing (seek to any tick by replaying from start)
- Trace event serialisation: JSON or binary format TBD

### Metrics and analytics

- Combat effectiveness: damage per tick, action success rates, time-to-incapacitation
- Survival curves: distributions across entity populations with varying attributes
- AI performance: targeting accuracy, formation coherence, morale cascade timing

### Visual debug layer (optional)

- Force vector visualisation
- Hit trace display: resolved hit regions and energy values per tick
- Condition heatmaps: per-entity condition state at any tick

---

## Phase 14 — 3D Model Integration

Enable Ananke as a physics realism layer for 3D characters.

- Mass distribution and centre of gravity from body plan segment masses
- Leverage and inertia tensors for procedural animation
- Injury visualisation: per-region damage drives deformation and motion quality
- Procedural animation driven by physical state (limping, guarding, collapse)
- Grapple state drives pose constraints
- Compatible with external animation rigs via a defined interface contract

Engine outputs physical state per tick. Interpretation as visual motion is the responsibility
of the host engine or renderer.