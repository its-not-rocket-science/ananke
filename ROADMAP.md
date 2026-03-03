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

**Implemented:** momentum carry between strikes — `swingMomentumQ` decays at q(0.95)/tick; clean hits set it to `intensity × q(0.80)`; adds up to +12% energy on next strike (`SWING_MOMENTUM_MAX = q(0.12)`); reset to 0 on miss, block, or parry.

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

### Extensions (complete)

#### Cover and partial occlusion (complete)

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

#### Aiming time (complete)

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

#### Moving target penalty (complete)

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

#### Suppression and AI decision-making (complete)

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

#### Ammunition types (complete)

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

## Phase 8 — Universal Body and Species System (complete)

**Prerequisite for Phases 9 and 10.**

Body plans are fully data-driven. Adding a new species requires authoring a `BodyPlan` data
file and an `Archetype` baseline — no kernel changes needed.

### Implemented

- `src/sim/bodyplan.ts`: `BodyPlan`, `BodySegment`, `LocomotionModel`, `CNSLayout` types
- 8 built-in body plan constants: `HUMANOID_PLAN`, `QUADRUPED_PLAN`, `THEROPOD_PLAN`,
  `SAUROPOD_PLAN`, `AVIAN_PLAN`, `VERMIFORM_PLAN`, `CENTAUR_PLAN`, `OCTOPOID_PLAN`
- Helpers: `resolveHitSegment(plan, r01)`, `getExposureWeight(seg, channel)`, `segmentIds(plan)`
- `Entity.bodyPlan?: BodyPlan` — optional; humanoid backward compat when absent
- `InjuryState.byRegion: Record<string, RegionInjury>` — widened from `Record<BodyRegion, ...>`
- `defaultInjury(segmentIds?)` — optional segment list; defaults to humanoid ALL_REGIONS
- `deriveFunctionalState` — data-driven from segment roles when `e.bodyPlan` is set
- `kernel.ts` — hit region selection, systemic hazard distribution, injury application all
  use body plan when present; fall back to humanoid defaults when `bodyPlan` is absent
- `test/bodyplan.test.ts` — 26 tests

### Original body plan data structure

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

## Phase 8B — Exoskeleton Biology

**Depends on Phase 8 (body plan system) and Phase 9 (injury model). Implement after Phase 9.**

Insects, crustaceans, and analogous alien organisms have structural biologies that differ
fundamentally from endoskeletal vertebrates. Phase 8B extends `BodySegment` with optional
exoskeleton-specific fields and wires them into the injury and locomotion systems.

All new fields are optional. Segments without them behave identically to Phase 8 segments.

### New `BodySegment` fields

```typescript
interface BodySegment {
  // ... existing fields ...

  /** Structural biology of this segment. Absent = endoskeleton default. */
  structureType?: "endoskeleton" | "exoskeleton" | "hydrostatic" | "gelatinous";

  /**
   * For exoskeletons: structural damage level (Q) at which the shell is breached.
   * Below breach: all incoming damage routes to structuralDamage only.
   * At or above breach: normal surface/internal/structural split applies.
   */
  breachThreshold?: Q;

  /**
   * Fluid transport system type.
   * "closed" (vertebrate blood) vs "open" (arthropod hemolymph) vs "none".
   * Determines which fluid-loss model applies when the segment is breached.
   */
  fluidSystem?: "closed" | "open" | "none";

  /**
   * Hemolymph loss rate per tick (Q) when an open-fluid segment is breached.
   * Feeds into a global hemolymphLoss accumulator on InjuryState (parallel to
   * the vertebrate bleeding model). Fatal threshold: same as fluidLoss_L.
   */
  hemolymphLossRate?: Q;

  /**
   * Is this segment a joint (articulation between hardened plates)?
   * Joints take extra structural damage from kinetic impacts.
   */
  isJoint?: boolean;

  /**
   * Damage multiplier applied to structuralDamage increment when isJoint = true.
   * e.g. q(1.5) = joints take 50% more structural damage than adjacent plates.
   */
  jointDamageMultiplier?: Q;

  /**
   * Can this segment regenerate via molting?
   * When true, a molt event (timed by entity.molting) may partially restore
   * structuralDamage on this segment.
   */
  regeneratesViaMolting?: boolean;
}
```

### New `LocomotionModel` fields

```typescript
interface LocomotionModel {
  // ... existing fields ...

  /**
   * Flight capability. Present only for winged body plans.
   * Wings are segments; liftCapacity_kg is total mass the creature can sustain aloft.
   */
  flight?: {
    wingSegments: string[];       // segment IDs used for lift
    liftCapacity_kg: I32;         // maximum liftable mass (SCALE.kg units)
    flightStaminaCost: Q;         // energy cost multiplier relative to ground movement
    wingDamagePenalty: Q;         // mobility reduction per unit of average wing damage
  };
}
```

### New `Entity` state

```typescript
interface Entity {
  // ... existing fields ...

  /** Molting state for arthropod-type entities. */
  molting?: {
    active: boolean;
    ticksRemaining: number;
    /** Segments currently hardening — take reduced kinetic damage. */
    softeningSegments: string[];
  };
}
```

### Kernel changes

**`applyImpactToInjury` (injury.ts / kernel.ts)**

When `seg.structureType === "exoskeleton"` and `breachThreshold` is set:

- Below breach: add all incoming damage (surface + internal + structural increments) to
  `segState.structuralDamage` only; no surface or internal damage until shell fails.
- At or above breach: use the normal three-channel split.

```typescript
if (seg.structureType === "exoskeleton" && seg.breachThreshold !== undefined) {
  if (segState.structuralDamage < seg.breachThreshold) {
    const totalInc = surfInc + intInc + strInc;
    segState.structuralDamage = clampQ(segState.structuralDamage + totalInc, 0, SCALE.Q);
    return; // no internal damage yet
  }
  // fall through to normal split
}
```

**Joint vulnerability**

```typescript
if (seg.isJoint && seg.jointDamageMultiplier) {
  strInc = Math.trunc(strInc * seg.jointDamageMultiplier / SCALE.Q);
}
```

**Hemolymph accumulation (`stepInjuryProgression`)**

For each segment with `fluidSystem === "open"` and `hemolymphLossRate` defined:

```typescript
if (segState.structuralDamage >= (seg.breachThreshold ?? q(0.8))) {
  const loss = qMul(seg.hemolymphLossRate, segState.structuralDamage);
  e.injury.hemolymphLoss = clampQ((e.injury.hemolymphLoss ?? 0) + loss, 0, SCALE.Q);
}
```

`InjuryState.hemolymphLoss?: Q` feeds the same death/incapacitation thresholds as `fluidLoss_L`.

**Molting (`stepInjuryProgression`)**

When `e.molting?.active`:
- Segments in `softeningSegments` take reduced kinetic structural damage (× q(0.70)).
- Each tick decrements `ticksRemaining`; when it reaches 0, `active` is set to false and
  `regeneratesViaMolting` segments receive partial structural repair (−q(0.10) per molt cycle,
  clamped to 0).

**Flight locomotion (`deriveMovementCaps` or equivalent)**

When `e.bodyPlan.locomotion.flight` is present:
1. If `e.attributes.morphology.mass_kg > flight.liftCapacity_kg`, fall back to ground locomotion.
2. Compute average wing damage across `wingSegments`. Apply `flightMul = SCALE.Q − qMul(avgWingDmg, wingDamagePenalty)`.
3. Boost max sprint speed by 1.5× (flight speed), multiply by `flightMul`.
4. Multiply energy cost by `flightStaminaCost`.

### Reference body plan: GRASSHOPPER_PLAN

A new built-in in `src/sim/bodyplan.ts` demonstrating all Phase 8B fields:
head, thorax, forewing, hindwing, 6 legs (foreleg×2, midleg×2, hindleg×2).
Wings have `breachThreshold: q(0.3)`, `isJoint: true`, `jointDamageMultiplier: q(1.5)`.
Thorax has `fluidSystem: "open"`, `hemolymphLossRate: q(0.002)`.
All segments `structureType: "exoskeleton"`. `regeneratesViaMolting: true` on legs.
`locomotion.flight` wired to wing segment IDs.

### Tests

- `test/exoskeleton.test.ts` (new, ~25 tests):
  - Shell breach: damage below `breachThreshold` routes entirely to structuralDamage
  - Shell breach: damage at/above threshold uses normal split
  - Joint vulnerability: joint segment takes more structural damage than adjacent plate
  - Hemolymph accumulation: breached open-fluid segment increases `hemolymphLoss` each tick
  - Hemolymph zero for non-breached segment
  - Molt active: kinetic damage reduced; `ticksRemaining` decrements
  - Molt complete: structural damage reduced on `regeneratesViaMolting` segments
  - Flight: entity below liftCapacity uses boosted sprint speed
  - Flight: entity above liftCapacity falls back to ground locomotion caps
  - Wing damage: high average wing damage reduces effective flight speed
  - GRASSHOPPER_PLAN round-trip: all segment IDs correct, locomotion wired correctly

---

## Phase 8C — Exoskeleton-Specific Armor *(COMPLETE)*

**Depends on Phase 8B.**

Adds per-segment intrinsic armor resistance for exoskeleton segments, distinct from worn
equipment armor. This is a structural property of the shell itself, not a carried item.

### Design

Extend `BodySegment` with:

```typescript
/** Intrinsic structural armor resist — energy absorbed before damage channels are allocated. */
intrinsicArmor_J?: number;
```

### Engine integration

In `applyImpactToInjury`, immediately before the exoskeleton breach check, apply the
intrinsic armor absorption:

```typescript
if (seg?.intrinsicArmor_J !== undefined && seg.intrinsicArmor_J > 0) {
  impactEnergy_J = Math.max(0, impactEnergy_J - seg.intrinsicArmor_J);
  if (impactEnergy_J === 0) return; // fully absorbed
}
```

The remaining energy then flows through the normal breach-routing or three-channel split.

### Implementation

`intrinsicArmor_J` is checked in `applyImpactToInjury` immediately after `armourShift` is computed
and before damage channels are allocated. The check applies to all hit paths (melee, ranged, blast,
fall) since they all call `applyImpactToInjury`. Stacks additively with worn equipment armour
(intrinsic fires first; residual energy then proceeds through the normal channel split or exo breach
routing). `GRASSHOPPER_PLAN` thorax has `intrinsicArmor_J: 40`.

`test/exoskeleton.test.ts` — 5 new tests (40 total): data check, partial absorption, full
absorption, zero-value no-op, full absorption inside exo breach routing path.

---

## Phase 9 — Injury and Medical Simulation (complete)

**Depends on Phase 8 (body plan system).**

### Implemented

**New file:** `src/sim/medical.ts` — `MedicalTier` (`none`/`bandage`/`surgicalKit`/`autodoc`/
`nanomedicine`), `TIER_RANK`, `TIER_MUL`, `MedicalAction`, `ACTION_MIN_TIER`.

**`src/sim/injury.ts`** — `RegionInjury` extended with:
- `fractured: boolean` — set when `structuralDamage ≥ q(0.70)`; persists until surgery
- `permanentDamage: Q` — floor set at `structuralDamage × 0.75` when damage ≥ q(0.90); surgery cannot heal below it
- `bleedDuration_ticks: number` — counter of ticks with active bleeding > q(0.05)
- `infectedTick: number` — tick of infection onset; `-1` = none; requires 100 ticks bleeding + `internalDamage > q(0.10)`

`InjuryState` extended with `hemolymphLoss: Q` (stub for Phase 8B exoskeleton fluid system).

**`src/sim/kernel.ts`** — `applyImpactToInjury`: fracture detection + permanent damage floor.
`stepInjuryProgression(e, tick)`: natural clotting at `(1 − structuralDamage) × q(0.0002)/tick`;
infection onset/progression; permanent damage floor update; fatal fluid loss at `fluidLoss ≥ q(0.80)`.
`resolveTreat()`: proximity gate (2 m), tier rank gate, four action handlers (tourniquet/bandage/
surgery/fluidReplacement), `effectMul = tierMul × treatmentRateMul`.

**`src/sim/impairment.ts`** — `fractureFraction()` helper; fracture penalties:
`mobilityMul` −30% (legs), `manipulationMul` −25% (arms).

**`src/sim/kinds.ts`** — `Treat` command kind; `Fracture` and `TreatmentApplied` trace kinds.

**`src/sim/commands.ts`** — `TreatCommand` interface; added to `Command` union.

**`src/sim/trace.ts`** — `Fracture` and `TreatmentApplied` trace event variants.

**`test/medical.test.ts`** — 37 tests: fracture detection, natural clotting, infection onset/
progression, permanent damage floor, fatal fluid loss, tourniquet/bandage/surgery/fluid
replacement, tier rank ordering.

**`tools/run-demo.ts`** — Scenario 4: field medicine — treated vs untreated soldier showing
tourniquet, surgery progression, infection onset, and fatal fluid loss over 266 ticks.

---

## Phase 10 — Environmental Hazards ✓ COMPLETE

**Implemented**: fall damage, explosion physics (blast + fragmentation), pharmacokinetics,
ambient temperature stress. All 488 tests passing; all coverage thresholds met.

### Physical hazards implemented

- **Falling** (`applyFallDamage`): KE = mass × g × height; 85% absorbed by muscles.
  Remaining 15% distributed to regions (locomotion-primary × 70%, others × 30%).
  Falls ≥ 1 m force prone. Fully body-plan-aware; humanoid fallback distributes to legs/arms/torso.
- **Extreme temperature**: `KernelContext.ambientTemperature_Q` comfort range `[q(0.35), q(0.65)]`.
  Heat → shock + torso surface damage (scaled by `heatTolerance`).
  Cold → shock + fatigue accumulation (scaled by `coldTolerance`).

### Explosions implemented

`applyExplosion(world, origin, spec, tick, trace)` applies a `BlastSpec` (defined in
`src/sim/explosion.ts`) to all entities within radius using quadratic falloff.

- **Blast wave**: delivered as `BLAST_WEAPON` to torso (high internal damage profile)
- **Fragmentation**: stochastic count per entity (fractional part resolved by RNG); each fragment
  delivered as `FRAG_WEAPON` to a randomly chosen region (high penetration bias + bleed factor)
- Emits `BlastHit` trace event per affected entity
- Deterministic: seeds `eventSeed(world.seed, tick, entityId, 0, 0xBEA5)` for fragment count;
  `eventSeed(world.seed, tick, entityId, f, 0xF4A6)` per fragment region selection

### Pharmacokinetics implemented

One-compartment model in `src/sim/substance.ts`. Add `ActiveSubstance` to `entity.substances`.
Each tick (via `stepSubstances`): `concentration += absorptionRate × pendingDose`;
`concentration -= eliminationRate × concentration`. Effects above `effectThreshold`:

| Effect type | Per-tick effect |
|---|---|
| `stimulant` | Reduces `fearQ` + slows fatigue |
| `anaesthetic` | Erodes `consciousness` |
| `poison` | Internal damage to torso + mild shock |
| `haemostatic` | Reduces `bleedingRate` across all regions |

`STARTER_SUBSTANCES` provides `stimulant`, `anaesthetic`, `poison`, `haemostatic`.

### Implemented improvements (10B)

- **Blast direction**: entities facing away from explosion receive 30% less blast energy
  (dot product of `facingDirQ` against outward blast direction; tactical/sim parity — no
  realism flag needed since it applies universally).
- **Blast throw**: entities pushed outward with velocity proportional to `blastDelivered / mass`.
  Formula: `throwVel = clamp(blastDelivered × BLAST_THROW_MUL / mass_kg, 0, 10 m/s)` where
  `BLAST_THROW_MUL = SCALE.mps × SCALE.kg / 10 = 1_000_000`. Zero direction at epicentre is
  handled gracefully (no throw if `distSq = 0`).

### Phase 10C implementations *(COMPLETE)*

#### Substance interactions *(implemented)*

Two or more active substances can modulate each other's effective absorption or elimination.
Implementation pattern — compute `effectiveElimRate` locally in `stepSubstances` rather than
mutating the shared `Substance.eliminationRate`:

```typescript
// In stepSubstances, per active substance:
let effectiveElimRate = sub.eliminationRate;
if (sub.effectType === "haemostatic" && hasSubstanceType(e, "stimulant")) {
  // Stimulant-induced vasoconstriction partially antagonises haemostatic absorption.
  effectiveElimRate = qMul(effectiveElimRate, q(1.30)); // clears 30% faster
}
// Then use effectiveElimRate instead of sub.eliminationRate for elimination step.
```

Planned interactions:
- `stimulant` + `haemostatic`: haemostatic eliminated 30% faster (sympathomimetic competition)
- `anaesthetic` + `stimulant`: anaesthetic onset delayed; effectStrength reduced by 25%
- `poison` + `haemostatic`: haemostatic partially counteracts poison-induced bleeding

Requires `hasSubstanceType(e, type)` helper checking `e.substances` for active concentration
above `effectThreshold`.

#### Temperature-dependent drug metabolism *(implemented)*

Cold conditions slow hepatic metabolism, extending substance duration. Requires mapping
`ctx.ambientTemperature_Q` to a per-tick elimination rate modifier. Two options:

Option A — pass `ambientTemperature_Q` into `stepSubstances`:
```typescript
function stepSubstances(e: Entity, ambientTemperature_Q?: Q): void {
  for (const active of e.substances) {
    let elimRate = active.substance.eliminationRate;
    if (ambientTemperature_Q !== undefined && ambientTemperature_Q < q(0.35)) {
      // Cold: elimination rate scaled by max(q(0.50), ambientTemperature_Q / q(0.35))
      const coldFrac = Math.max(q(0.50), mulDiv(ambientTemperature_Q, SCALE.Q, q(0.35)));
      elimRate = qMul(elimRate, coldFrac);
    }
    // ... use elimRate instead of active.substance.eliminationRate
  }
}
```

Option B — add `effectiveEliminationRate: Q` field to `ActiveSubstance` and update it
each tick based on temperature before running the absorption/elimination step.

Recommendation: Option A (no interface change, consistent with the substance-interaction
pattern above).

#### Explosive flash/blindness *(implemented)*

Entities within a threshold distance of a detonation can be temporarily blinded by the
flash. Implementation via a new `ConditionState` field:

```typescript
// condition.ts
blindTicks: number;   // > 0 = temporarily blinded; decremented each tick
```

In `applyExplosion`, after blast processing:
```typescript
const FLASH_RADIUS_FRAC = q(0.40); // flash effective within inner 40% of blast radius
const flashRadiusSq = mulDiv(spec.radius_m * spec.radius_m, FLASH_RADIUS_FRAC, SCALE.Q);
if (distSq < flashRadiusSq) {
  const blindDuration = Math.max(10, Math.trunc(20 * (1 - distSq / flashRadiusSq)));
  e.condition.blindTicks = Math.max(e.condition.blindTicks, blindDuration);
}
```

In `sensory.ts`, `canDetect()` reads `blindTicks > 0` to set `visionRange_m = 0`
(or drastically reduced) for the blind entity. Armour with a sealed visor trait could
provide immunity.

The condition decrement belongs in the same cooldown loop as `suppressedTicks` in `stepWorld`.

---

## Phase 11 — Technology Spectrum *(COMPLETE)*

### What was implemented

`src/sim/tech.ts` — `TechEra` const object (0–8), `TechCapability` union, `TechContext` interface,
`defaultTechContext(era)` (cumulative capability sets), `isCapabilityAvailable()`.

`src/equipment.ts` additions:
- `requiredCapabilities?: readonly TechCapability[]` on `ItemBase`
- `Exoskeleton` item kind (`speedMultiplier`, `forceMultiplier`, `powerDrain_W`)
- `findExoskeleton(loadout): Exoskeleton | null`
- `validateLoadout(loadout, ctx): string[]` — returns error messages for era-unavailable items
- `STARTER_EXOSKELETONS`: `exo_combat` (+25% speed, +40% force, 200 W drain), `exo_heavy` (+10% speed, +80% force, 400 W drain)
- `arm_plate` (heavy plate armour, requires `MetallicArmour`)
- `rng_plasma_rifle` (2000 J, requires `EnergyWeapons`)
- `arm_mail`, `rng_pistol`, `rng_musket` retroactively tagged with `requiredCapabilities`

`src/sim/kernel.ts` — `techCtx?` in `KernelContext`; exo speed in `stepMovement` baseMul;
exo force in `resolveAttack` after `energy_J`; exo powerDrain_W added to demand in `stepEnergy`.

`test/tech.test.ts` — 27 tests.

### Era→capability mapping

| Era | Capabilities |
|---|---|
| Prehistoric | (none) |
| Ancient | MetallicArmour |
| Medieval | MetallicArmour |
| EarlyModern | + FirearmsPropellant |
| Industrial | + ExplosiveMunitions |
| Modern | + BallisticArmour |
| NearFuture | + PoweredExoskeleton |
| FarFuture | + EnergyWeapons, ReactivePlating |
| DeepSpace | + NanomedicalRepair |

### Technology effects by domain (planned extensions)

| Domain | How technology era changes it |
|---|---|
| Weapons | Available types; muzzle energy (J) for firearms; beam power (W) for energy weapons |
| Armour | `resist_J` ranges; channel protections; `reflectivity` for energy weapon resistance |
| Medicine | Medical tier gates which treatment actions are available and at what rates |
| Sensors | `visionRange_m` boost from optics; electronic threat detection range (m) |
| Mobility | Powered exoskeleton multipliers on sprint speed and strike force |
| Survivability | Vacuum suit (suffocation immunity), radiation hardening, pressure equalisation |

---

## Phase 11C — Tech Spectrum Extensions *(COMPLETE)*

### Implemented

- **Energy weapon channel**: `energyType?: "plasma" | "laser" | "sonic"` on `Weapon`/`RangedWeapon`.
  Energy weapons route through `DamageChannel.Energy` in `applyImpactToInjury`.
- **Reflective armour**: `reflectivity?: Q` on `Armour`; energy hits receive
  `mulDiv(mitigated, SCALE.Q − reflectivity, SCALE.Q)` before penetration.
- **Ablative armour**: `ablative?: boolean` on `Armour`; remaining resist tracked per entity in
  `entity.armourState: Map<ItemId, { resistRemaining_J: number }>`. Depleted items provide no
  further resist. `deriveArmourProfile` accepts optional `armourState`.
- **Sensor items**: `Sensor` item kind (`visionRangeMul: Q`, `hearingRangeMul: Q`,
  `requiredCapabilities?`). `canDetect()` accepts optional `sensorBoost` and scales ranges.
  Sensor profile derived from loadout in the AI perception pass.

Starter items: `arm_reflective` (50% reflectivity), `arm_reactive` (ablative, 1500 J),
`sensor_optical` (2× vision), `sensor_tactical` (4× vision, requires `AdvancedSensors`).

`test/tech.test.ts` — extended to ~42 tests. All 660 tests pass.

### Tech Tree Visualization (tools/)

```typescript
// tools/tech-tree.ts
import { TechEra, ERA_DEFAULTS } from "../src/sim/tech.js";
// Output DOT graph: each node = era, edges show added capabilities.
// Run: npx tsx tools/tech-tree.ts > tech-tree.dot && dot -Tsvg tech-tree.dot > tech-tree.svg
```

### Tech-Specific Damage Channels

Add `energyType?: "plasma" | "laser" | "sonic"` to `Weapon`/`RangedWeapon`. In `applyImpactToInjury`, route energy weapon hits through a new `DamageChannel.Energy` channel. Armour gains optional `reflectivity?: Q` — energy weapons receive `mulDiv(mitigated, SCALE.Q - reflectivity, SCALE.Q)` before armour penetration.

Implementation outline:
```typescript
// equipment.ts
export interface Armour extends ItemBase {
  // ... existing fields ...
  reflectivity?: Q;      // fraction of energy damage reflected (0..1)
  ablative?: boolean;    // loses resist_J on each hit (tracked in entity.loadoutState)
}
// channels.ts: add DamageChannel.Energy = 8
// kernel.ts: if (wpn.energyType && armour.reflectivity) apply reflectivity gate
```

### Tech-Based Perception Bonuses (per-entity sensors)

Add a `Sensor` item kind to equipment.ts:
```typescript
export interface Sensor extends ItemBase {
  kind: "sensor";
  visionRangeMul: Q;    // e.g. q(2.0) = double vision range
  hearingRangeMul: Q;
  requiredCapabilities?: readonly TechCapability[];
}
```
In `canDetect()` (sensory.ts), accept an optional `sensorBoost?: { visionRangeMul: Q; hearingRangeMul: Q }` and scale ranges accordingly. In kernel.ts (or AI layer), derive sensor profile from entity's loadout before calling perceiveLocal.

### Ablative Armour State

`ablative: true` armour degrades on each hit: track per-entity remaining resist in a new `entity.armourState?: Map<ItemId, { resistRemaining_J: number }>`. On hit: decrement by `mitigated_J`; when depleted, item provides no further resist. `deriveArmourProfile` accepts optional armourState.

### Tech Tree Visualization (tools/)

```typescript
// tools/tech-tree.ts
import { TechEra, ERA_DEFAULTS } from "../src/sim/tech.js";
// Output DOT graph: each node = era, edges show added capabilities.
// Run: npx tsx tools/tech-tree.ts > tech-tree.dot && dot -Tsvg tech-tree.dot > tech-tree.svg
```

---

## Phase 12 — Capability Sources and Effects *(COMPLETE)*

**Design principle — Clarke's Third Law**: "Any sufficiently advanced technology is
indistinguishable from magic." The engine implements this literally: magic and advanced
technology are the same abstraction with different flavor metadata. A fireball and a plasma
grenade, a healing spell and a nanobot swarm, a mana pool and a fusion reactor — all resolve
through identical engine primitives. The engine cannot tell them apart. Only the tags differ.

---

### 12.1 — Core abstractions

#### CapabilitySource

A `CapabilitySource` is an energy reservoir attached to an entity. It replaces "mana pool",
"fuel cell", "divine favour", or any other limited resource. Energy is always in joules — the
same unit as `reserveEnergy_J` — regardless of the physical or metaphysical source.

```typescript
// src/sim/capability.ts

export interface CapabilitySource {
  id: string;
  label: string;             // human-readable: "Arcane mana", "Fusion cell", "Void tap"
  tags: string[];            // flavor + suppression: ["magic"], ["tech","fusion"], ["cosmic","void"]
  reserve_J: number;         // current stored energy (joules, fixed-point integer)
  maxReserve_J: number;      // capacity ceiling; Number.MAX_SAFE_INTEGER for boundless sources
  regenModel: RegenModel;
  effects: CapabilityEffect[];
}
```

#### RegenModel — pluggable, flavor-agnostic

```typescript
export type RegenModel =
  | { type: "rest";      regenRate_W: number }
    // Regen only when entity is not moving and not in combat.
    // Use for: meditation, sleep-charging, prayer.

  | { type: "constant";  regenRate_W: number }
    // Regen every tick regardless of activity.
    // Use for: fusion reactor, enchanted gem, passive divine blessing.

  | { type: "ambient";   maxRate_W: number }
    // Regen scales with ambient energy at entity's current cell.
    // Rate = maxRate_W × (ambientGrid cell value ÷ SCALE.Q).
    // KernelContext gains optional `ambientGrid?: Map<string, Q>`.
    // Use for: ley lines, geothermal vents, solar collectors, background radiation.

  | { type: "event";     triggers: RegenTrigger[] }
    // Regen fires on specific engine events.
    // Use for: kill-triggered blood magic, prayer-answered divine grants.

  | { type: "boundless" }
    // No regen tracking needed — reserve never depletes.
    // resolveActivation skips cost deduction entirely.
    // Use for: black hole harvester, deity, reality-warper, environmental anchor.
```

```typescript
export type RegenTrigger =
  | { on: "kill";    amount_J: number }   // entity kills another entity
  | { on: "tick";    every_n: number; amount_J: number }  // every N ticks
  | { on: "terrain"; tag: string; amount_J: number };     // enters terrain with this tag
```

#### CapabilityEffect

```typescript
export interface CapabilityEffect {
  id: string;
  cost_J: number;            // drawn from source reserve on activation
  castTime_ticks: number;    // 0 = instant; >0 = charge / concentration / invocation
  range_m?: number;          // undefined = self-only
  aoeRadius_m?: number;      // if set, payload applied to all entities within radius
  payload: EffectPayload | EffectPayload[];  // multiple payloads allowed per effect
  tags?: string[];           // effect flavor: ["fire", "healing", "force", "nano"]
}
```

#### EffectPayload — maps to existing engine primitives

```typescript
export type EffectPayload =
  | { kind: "impact";         spec: ImpactSpec }
    // Kinetic, thermal, internal, or penetrating damage.
    // Same path as applyImpactToInjury — armour interacts normally.
    // Fireball = thermal ImpactSpec. Plasma bolt = energy ImpactSpec.
    // Gravity crush = kinetic ImpactSpec. Nanobot disassembly = internal ImpactSpec.

  | { kind: "treatment";      tier: MedicalTier; rateMul: Q }
    // Healing at elevated rate. May be gated by TechCapability (nanomedicine).
    // Magical heal = surgicalKit tier, rateMul q(3.0).
    // Nanorepair = autodoc tier, rateMul q(5.0).

  | { kind: "armourLayer";    resist_J: number; channels: DamageChannel[]; duration_ticks: number }
    // Temporary armour applied over entity's loadout. Stacks with worn armour.
    // Ward/shield spell, force field, reactive plating burst.

  | { kind: "velocity";       delta_mps: Vec3 }
    // Direct velocity change (fixed-point m/s). Telekinesis, jump jet, repulsion.
    // Same physics as blast throw — subject to mass, limited by terrain.

  | { kind: "substance";      substance: ActiveSubstance }
    // Injects a pharmacokinetic substance. Magical poison, healing draught, nano-agent.
    // Resolves through the Phase 10 substance pipeline.

  | { kind: "structuralRepair"; region: string; amount: Q }
    // Writes back structural damage — normally write-once after injury.
    // Only magical healing, advanced nanomedicine, or equivalent can do this.
    // Respects permanentDamage floor.

  | { kind: "fieldEffect";    spec: FieldEffectSpec }
    // Places a suppression zone or terrain-altering field in the world.
    // See §12.4 Field Effects.
```

---

### 12.2 — Entity and world integration

```typescript
// entity.ts — one new optional field
capabilitySources?: CapabilitySource[];

// commands.ts — one new command type
export interface ActivateCommand {
  kind: "activate";
  sourceId: string;     // which CapabilitySource
  effectId: string;     // which CapabilityEffect within that source
  targetId?: number;    // entity target (omit for self or ground-targeted AoE)
  targetPos?: Vec3;     // position target for ground-targeted AoE
}

// WorldState — one new optional field
activeFieldEffects?: FieldEffect[];
```

---

### 12.3 — Kernel integration

#### `resolveActivation(actor, cmd, world, ctx, tick, trace)`

Called from `stepWorld` in the command-processing phase (same position as `resolveAttack`).

1. Look up `source` and `effect` by id; return if not found.
2. **Suppression check**: if any `FieldEffect` in `world.activeFieldEffects` covers
   `actor.position_m` and its `suppressesTags` overlaps `source.tags`, the activation fails.
   Emit a `CapabilitySuppressed` trace event.
3. **Range check**: if `effect.range_m` defined and target distance exceeds it, return.
4. **Cost check**: if `regenModel.type !== "boundless"` and `source.reserve_J < effect.cost_J`,
   return (insufficient reserve).
5. **Cast time**:
   - `castTime_ticks === 0`: resolve payloads immediately.
   - `castTime_ticks > 0`: store as `actor.action.pendingActivation`; resolve when
     `world.tick >= pendingActivation.resolveAtTick`. Damage above a threshold during cast
     clears `pendingActivation` (concentration broken — emit `CastInterrupted`).
6. **Deduct cost**: `source.reserve_J -= effect.cost_J` (skip for boundless).
7. **Resolve each payload** in `effect.payload` array using existing helpers:
   - `"impact"` → build `ImpactEvent`, push to tick queue, apply via `applyImpactToInjury`.
   - `"treatment"` → call `resolveTreat`.
   - `"armourLayer"` → push to `actor.condition.temporaryArmour` (new field, list drained each tick).
   - `"velocity"` → add `delta_mps` to `actor.velocity_mps` (same integration as blast throw).
   - `"substance"` → push to `actor.substances`.
   - `"structuralRepair"` → clamp write-back respecting `permanentDamage`.
   - `"fieldEffect"` → push to `world.activeFieldEffects`.
8. Emit `CapabilityActivated` trace event (sourceId, effectId, targetId, tick).

**Determinism**: AoE target selection uses `sortEntityDeterministic` (existing helper).
Hit-chance effects within AoE use `eventSeed(worldSeed, tick, actorId, targetId, 0xCAB1)`.

#### `stepCapabilitySources(e, world, ctx, tick)`

Called from `stepWorld` after `stepMovement`, once per living entity.

For each `CapabilitySource` in `e.capabilitySources`:
- `"rest"`: regen only if `e.velocity_mps` ≈ 0 and no `attackCooldownTicks` active.
- `"constant"`: always regen.
- `"ambient"`: look up `terrainKey(cellSize, e.position_m.x, e.position_m.y)` in
  `ctx.ambientGrid`; scale `maxRate_W` by the cell value.
- `"event"`: tick-based triggers checked here; kill/terrain triggers injected from stepWorld
  event dispatch.
- `"boundless"`: no-op.
- Apply regen: `reserve_J = min(maxReserve_J, reserve_J + floor(regenRate_W × DT_S / SCALE.s))`.

#### `stepFieldEffects(world, tick)`

Called once per `stepWorld` after all entity processing:
- Decrement `duration_ticks` for all timed field effects.
- Remove effects where `duration_ticks === 0`.
- Permanent effects (`duration_ticks < 0`) never removed by this step.

---

### 12.4 — Field Effects (suppression zones)

```typescript
export interface FieldEffectSpec {
  radius_m: number;
  suppressesTags: string[];   // blocks CapabilitySources whose tags overlap
  duration_ticks: number;     // -1 = permanent; >0 = auto-expires
}

export interface FieldEffect extends FieldEffectSpec {
  id: string;
  origin: Vec3;
  placedByEntityId: number;
}
```

Examples:
- Anti-magic ward: `suppressesTags: ["magic","psionic"]`, radius 20m, permanent.
- EMP pulse: `suppressesTags: ["tech","fusion","nano"]`, radius 50m, 300 ticks.
- Dead zone: `suppressesTags: ["magic","tech","divine","cosmic"]`, full suppression.
- Ley-line anchor: `suppressesTags: []` — no suppression; used only as `ambient` regen source
  (placed in `ambientGrid`, not `activeFieldEffects`).

---

### 12.5 — Example CapabilitySources

#### Medieval arcane mage
```typescript
{
  id: "arcane_mana", label: "Arcane mana",
  tags: ["magic", "arcane"],
  reserve_J: 500_000, maxReserve_J: 500_000,
  regenModel: { type: "rest", regenRate_W: 50 },
  effects: [
    { id: "fireball",   cost_J: 80_000, castTime_ticks: 20, range_m: 30, aoeRadius_m: 5,
      payload: { kind: "impact", spec: { energy_J: 5_000, channel: DamageChannel.Thermal } } },
    { id: "stone_ward", cost_J: 20_000, castTime_ticks: 5,
      payload: { kind: "armourLayer", resist_J: 500, channels: [DamageChannel.Kinetic], duration_ticks: 200 } },
    { id: "heal",       cost_J: 30_000, castTime_ticks: 10,
      payload: { kind: "treatment", tier: "surgicalKit", rateMul: q(3.0) } },
    { id: "mend_bone",  cost_J: 120_000, castTime_ticks: 60,
      payload: { kind: "structuralRepair", region: "torso", amount: q(0.20) } },
  ],
}
```

#### Near-future powered armour (fusion cell)
```typescript
{
  id: "fusion_cell", label: "Compact fusion cell",
  tags: ["tech", "fusion"],
  reserve_J: 100_000_000, maxReserve_J: 100_000_000,
  regenModel: { type: "constant", regenRate_W: 2_000 },
  effects: [
    { id: "force_shield", cost_J: 500, castTime_ticks: 0,
      payload: { kind: "armourLayer", resist_J: 200, channels: [DamageChannel.Kinetic], duration_ticks: 1 } },
    { id: "jump_jet",     cost_J: 10_000, castTime_ticks: 0,
      payload: { kind: "velocity", delta_mps: { x: 0, y: 0, z: to.mps(8) } } },
    { id: "plasma_lance", cost_J: 25_000, castTime_ticks: 2, range_m: 50,
      payload: { kind: "impact", spec: { energy_J: 3_000, channel: DamageChannel.Thermal } } },
  ],
}
```

#### Deep-space nanobot colony
```typescript
{
  id: "nanobot_reserve", label: "Medical nanobot colony",
  tags: ["tech", "nano", "bio"],
  reserve_J: 50_000, maxReserve_J: 50_000,
  regenModel: { type: "constant", regenRate_W: 20 },
  effects: [
    { id: "nano_repair",      cost_J: 1_000, castTime_ticks: 0,
      payload: { kind: "structuralRepair", region: "torso", amount: q(0.05) } },
    { id: "nano_disassemble", cost_J: 5_000, castTime_ticks: 5, range_m: 2,
      payload: { kind: "impact", spec: { energy_J: 200, channel: DamageChannel.Internal } } },
    { id: "nano_clot",        cost_J: 500, castTime_ticks: 0,
      payload: { kind: "substance", substance: { id: "haemostatic", concentration: q(1.0), ... } } },
  ],
}
```

#### Geomancer (ambient/ley-line harvest)
```typescript
{
  id: "geothermal_tap", label: "Geothermal ley tap",
  tags: ["magic", "earth"],
  reserve_J: 0, maxReserve_J: Number.MAX_SAFE_INTEGER,
  regenModel: { type: "ambient", maxRate_W: 500_000 },
  effects: [
    { id: "lava_jet",   cost_J: 200_000, castTime_ticks: 5, range_m: 20,
      payload: { kind: "impact", spec: { energy_J: 20_000, channel: DamageChannel.Thermal } } },
    { id: "stone_skin", cost_J: 100_000, castTime_ticks: 10,
      payload: { kind: "armourLayer", resist_J: 2_000, channels: [DamageChannel.Kinetic, DamageChannel.Penetrating], duration_ticks: 600 } },
  ],
}
```

#### Cosmic entity (black hole accretion tap)
```typescript
{
  id: "singularity_tap", label: "Hawking radiation harvester",
  tags: ["cosmic", "void"],
  reserve_J: Number.MAX_SAFE_INTEGER, maxReserve_J: Number.MAX_SAFE_INTEGER,
  regenModel: { type: "boundless" },
  effects: [
    { id: "gravity_crush",  cost_J: 0, castTime_ticks: 0, aoeRadius_m: 100,
      payload: { kind: "impact", spec: { energy_J: 1_000_000, channel: DamageChannel.Kinetic } } },
    { id: "void_suppress",  cost_J: 0, castTime_ticks: 0, range_m: 500,
      payload: { kind: "fieldEffect",
        spec: { radius_m: 200, suppressesTags: ["magic","tech","divine"], duration_ticks: -1 } } },
  ],
}
```

---

### 12.6 — What the engine cannot distinguish

| "Magic" source | "Tech" equivalent | Resolved as |
|---|---|---|
| Fireball | Plasma grenade | thermal `ImpactEvent` |
| Healing spell | Nanobot repair swarm | `TreatmentAction` or `structuralRepair` |
| Magic shield / ward | Force field projector | temporary `armourLayer` |
| Telekinesis | Gravity gun | `velocity` delta |
| Magical poison | Nano-toxin injection | `SubstanceDose` |
| Anti-magic field | EMP zone | `FieldEffect` with `suppressesTags` |
| Mana pool | Fusion cell | `CapabilitySource` with `reserve_J` |
| Meditation regen | Solar charging | `RestRegen` vs `ConstantRegen` |
| Ley-line harvest | Geothermal tap | `AmbientHarvest` from `ambientGrid` |
| Divine miracle | Replicator matter feed | `EventTriggered` with kill/terrain trigger |
| God-tier power | Black hole tap | `BoundlessSource` |

The column that varies is only `tags`. The engine path is identical.

---

### 12.7 — Files

| File | Change |
|---|---|
| `src/sim/capability.ts` | New — `CapabilitySource`, `CapabilityEffect` (+`cooldown_ticks?`, +`requiredCapability?`), `RegenModel`, `EffectPayload`, `FieldEffect`, `FieldEffectSpec` |
| `src/sim/entity.ts` | +`capabilitySources?: CapabilitySource[]` |
| `src/sim/kernel.ts` | `resolveActivation` (cooldown gate, tech gate, set cooldown on success), `stepCapabilitySources`, `stepFieldEffects`, `applyCapabilityEffect` (magic resist roll); call sites in `stepWorld`; `KernelContext` gains `ambientGrid?: Map<string, Q>` |
| `src/sim/commands.ts` | +`ActivateCommand` |
| `src/sim/world.ts` | +`activeFieldEffects?: FieldEffect[]` |
| `src/sim/action.ts` | +`capabilityCooldowns?: Map<string, number>` (key = `"sourceId:effectId"`) |
| `src/types.ts` | +`magicResist?: Q` on `Resilience` |
| `src/sim/tech.ts` | +`"ArcaneMagic" | "DivineMagic" | "Psionics" | "Nanotech"` to `TechCapability` |
| `test/capability.test.ts` | New — 35 tests |

---

### 12.8 — Tests

`test/capability.test.ts` — 35 tests:

**Phase 12 core (27 tests):**
- `ConstantRegen` increases `reserve_J` every tick; clamped to `maxReserve_J`
- `RestRegen` only regens when entity velocity ≈ 0 and no cooldown active
- `BoundlessSource` activation does not reduce `reserve_J`
- `AmbientHarvest` scales with `ambientGrid` cell value; zero at empty cell
- `EventTriggered` (tick variant) fires on schedule; fires kill reward after entity death
- Activation deducts `cost_J` from `reserve_J`
- Activation fails (silently) when `reserve_J < cost_J`
- `impact` payload: target takes damage via normal injury pipeline; armour interacts
- `treatment` payload: target injury state improves
- `armourLayer` payload: temporary layer reduces damage in specified channels for `duration_ticks`
- `velocity` payload: entity velocity changes by `delta_mps`
- `substance` payload: substance appears in `entity.substances`
- `structuralRepair` payload: structural damage decreases; respects `permanentDamage` floor
- `fieldEffect` payload: `FieldEffect` appears in `world.activeFieldEffects`
- Suppression: activation fails inside field whose `suppressesTags` overlaps source tags
- Suppression: activation succeeds when tags do not overlap (anti-magic does not block fusion)
- AoE: payload applied to all entities within `aoeRadius_m`; outside entities unaffected
- `castTime_ticks > 0`: effect not applied until delay elapses
- Concentration break: pending activation cleared when entity takes damage during cast
- `stepFieldEffects` decrements `duration_ticks`; removes expired effects; leaves permanent (-1)
- `"mend_bone"` vs `"nano_repair"`: both increase structural integrity; engine path identical

**Phase 12B extensions (8 tests):**
- Tech gating: activation fires when `techCtx` has required capability
- Tech gating: activation is blocked when `techCtx` lacks required capability
- Tech gating: activation fires when no `techCtx` set (unrestricted)
- Cooldown: activation fires once, then blocked for `cooldown_ticks` ticks, then fires again
- Magic resist q(1.0): non-self target always resists effect
- Magic resist q(0): non-self target never resists effect
- Magic resist: self-cast bypasses resistance entirely
- Magic resist q(0.5): probabilistic — some seeds resist, some do not (brute-force verification)

---

## Phase 12B — Capability Extensions *(COMPLETE)*

*Requires Phase 12 core.*

### Implemented

- **TechCapability magic gates**: `requiredCapability?: TechCapability` on `CapabilityEffect`;
  checked in `resolveActivation` against `ctx.techCtx` (absent = unrestricted). New types:
  `"ArcaneMagic" | "DivineMagic" | "Psionics" | "Nanotech"` — not in any `ERA_DEFAULTS`.
- **Per-capability cooldowns**: `cooldown_ticks?: number` on `CapabilityEffect`; key
  `"sourceId:effectId"` in `action.capabilityCooldowns`; decremented at tick start in `stepWorld`;
  set on instant activation and at cast-start for timed effects.
- **Magic resistance**: `magicResist?: Q` on `Resilience`; seeded roll per non-self target
  (salt `0x5E515`) in `applyCapabilityEffect`; q(1.0) = always resist; self-cast bypasses.
- **Kill-triggered regen**: `{ on: "kill", amount_J }` trigger in `EventRegen.triggers`;
  dispatched inside entity loop at death detection; killer included, dead entities excluded.
- **Terrain-entry triggers**: `{ on: "terrain", tag, amount_J }` regen fires exactly once per
  cell-boundary crossing; `action.lastCellKey` tracks previous cell; `KernelContext.terrainTagGrid`
  maps cell keys to tag arrays; `KernelContext.cellSize_m` configures grid resolution.
- **Concentration auras**: `castTime_ticks = -1` sentinel marks ongoing per-tick effects;
  `entity.activeConcentration` tracks active aura; cost deducted each tick; breaks on reserve
  depletion (non-boundless) or shock ≥ q(0.30); emits `CastInterrupted` on break.
- **Linked sources**: `CapabilitySource.linkedFallbackId` draws activation cost from a secondary
  source when primary is depleted; fallback can be boundless for unlimited overflow.
- **Effect chains**: `FieldEffectSpec.chainPayload?: EffectPayload | EffectPayload[]` —
  payload applied to every living entity within the field's radius each tick while the field
  is active; fires before expiry (final tick still fires); placer entity is the actor for
  attribution. Implemented in `stepChainEffects` called just before `stepFieldEffects`.

---

## Phase 13 — Replay, Research and Tooling *(COMPLETE)*

### Replay system *(complete)*

`src/replay.ts`:

- `ReplayRecorder` — deep-clones initial `WorldState` via `structuredClone` (handles Maps);
  `record(tick, cmds)` called once per tick; `toReplay()` returns an independent copy.
- `replayTo(replay, targetTick, ctx)` — reconstructs `WorldState` at any tick by restoring
  the snapshot and re-applying recorded command frames; does not mutate the `Replay` object.
- `serializeReplay` / `deserializeReplay` — JSON round-trip with `__ananke_map__` marker-based
  replacer/reviver; handles `entity.armourState` and `action.capabilityCooldowns` Maps.

`test/replay.test.ts` — 13 tests: snapshot isolation, frame recording, command capture,
independent `toReplay` copies, position/damage replay determinism, tick semantics (`replayTo(N)`
→ `world.tick = N+1`), JSON round-trip including Map fields.

### Metrics and analytics *(complete)*

`src/metrics.ts`:

- `CollectingTrace` — `TraceSink` implementation that accumulates all events for offline analysis;
  `clear()` resets between runs.
- `collectMetrics(events)` — derives `CombatMetrics` from any flat `TraceEvent[]`:
  `damageDealt`, `hitsLanded`, `hitsTaken` (melee `Attack` + ranged `ProjectileHit`),
  `tickOfKO`, `tickOfDeath`, `tickToIncapacitation` (min of KO and death).
- `survivalRate(events, entityIds)` — fraction of entities never incapacitated.
- `meanTimeToIncapacitation(events, entityIds, totalTicks)` — mean TTI; survivors contribute
  `totalTicks` (capped at scenario duration).

`src/sim/kernel.ts` — `Death` and `KO` trace events emitted from the injury progression loop.
Both event kinds existed in `TraceKinds` but were previously never emitted anywhere; Phase 13
analytics and survival tests require them.

`test/metrics.test.ts` — 21 tests: event accumulation, damage/hit tallies, KO/death recording,
projectile hit attribution, survival rate, mean TTI, live simulation integration.

710 tests passing after metrics; all coverage thresholds met.

### Visual debug layer *(complete)*

`src/debug.ts` — three pure extraction functions; no kernel changes:

- `extractMotionVectors(world)` → `MotionVector[]` — per-entity position, velocity, and
  facing direction; includes dead entities (last-known position).
- `extractHitTraces(events)` → `{ meleeHits, projectileHits }` — filters `TraceKinds.Attack`
  and confirmed `TraceKinds.ProjectileHit` (hit=true) events; preserves blocked/parried/
  shieldBlocked/armoured flags and region/energy values.
- `extractConditionSamples(world)` → `ConditionSample[]` — per-entity fearQ, shock,
  consciousness, fluidLoss, and dead flag; pass `replayTo(tick)` output to sample any past tick.

`test/debug.test.ts` — 22 tests; `src/debug.ts` at 100% coverage.

---

## Phase 14 — 3D Model Integration *(COMPLETE)*

Enable Ananke as a physics realism layer for 3D characters.
Engine outputs physical state per tick; interpretation as visual motion is the host's responsibility.

`src/model3d.ts` — six pure extraction functions; no kernel changes:

- `deriveMassDistribution(entity)` → `MassDistribution` — per-segment mass fractions and
  estimated centre of gravity in real metres. Segment positions derived from ID keyword
  matching (head/torso/arm/leg/tail/wing patterns); falls back to geometric midpoint for
  unknown IDs. Single "body" segment returned when no body plan is present.
- `deriveInertiaTensor(entity)` → `InertiaTensor` — simplified diagonal tensor (yaw, pitch,
  roll in kg·m²) from segment masses and canonical offsets. Solid-sphere approximation used
  when no body plan is present.
- `deriveAnimationHints(entity)` → `AnimationHints` — mutually exclusive locomotion blend
  weights (idle/walk/run/sprint/crawl), defence blend weight from `intent.defence.intensity`,
  attack weight from `action.attackCooldownTicks`, plus shockQ, fearQ, prone, unconscious,
  dead flags.
- `derivePoseModifiers(entity)` → `PoseModifier[]` — per-region structural and surface damage
  as deformation blend weights; `impairmentQ = max(structuralQ, surfaceQ)`.
- `deriveGrappleConstraint(entity)` → `GrapplePoseConstraint` — isHolder/isHeld/heldByIds/
  position/gripQ for pose-constraint solving between grappling entities.
- `extractRigSnapshots(world)` → `RigSnapshot[]` — aggregates all of the above per entity for
  a single-call per-tick visualisation feed.

`test/model3d.test.ts` — 42 tests; `src/model3d.ts` at 99% statement coverage.
752 tests total; all coverage thresholds met.

---

## Phase 15 — Named Archetypes and Scenario Validation *(COMPLETE)*

**Goal**: ground Ananke's SI unit system in published sports-science and biomechanics data;
provide ready-made entity factories for common real-world archetypes; validate statistically
plausible outcomes for named matchups (boxing, wrestling, human vs cephalopod, armoured knight).

### New archetypes (`src/archetypes.ts`)

Five new `Archetype` constants calibrated to published literature:

| Archetype | Source | Key parameters |
|---|---|---|
| `AMATEUR_BOXER` | Walilko et al., BJSM (2500–4000 N punch) | peakForce 2800 N, concussionTolerance q(0.55) |
| `PRO_BOXER` | Elite boxing biomechanics (4000–7000 N) | peakForce 5000 N, reserveEnergy 40 kJ |
| `GRECO_WRESTLER` | Olympic grappling literature | stability q(0.85), peakForce 2000 N |
| `KNIGHT_INFANTRY` | Medieval warrior physiology | distressTolerance q(0.72), worn armour via loadout |
| `LARGE_PACIFIC_OCTOPUS` | *Enteroctopus dofleini* biomechanics | controlQuality q(0.95), concussionTolerance q(0.90), visionArcDeg 300, OCTOPOID_PLAN |

### New weapon (`src/equipment.ts`)

`wpn_boxing_gloves` added to `STARTER_WEAPONS`:
- mass 0.28 kg (10 oz), reach 0.32 m
- `internalFrac q(0.60)` — concussive profile dominates
- `bleedFactor q(0.04)` — near-zero laceration (padding)
- `strikeSpeedMul q(1.20)` — fast punches

### Entity factory module (`src/presets.ts`)

New production module (no dependency on `src/sim/testing.ts`). Five factories:

```
mkBoxer(id, teamId, x, y, level: "amateur"|"pro"): Entity
  - PRO_BOXER or AMATEUR_BOXER archetype
  - loadout: [wpn_boxing_gloves]
  - skills: meleeCombat, meleeDefence, athleticism scaled by level

mkWrestler(id, teamId, x, y): Entity
  - GRECO_WRESTLER archetype
  - loadout: [] (grapple only)
  - skills: { grappling: q(1.50), athleticism fatigueRateMul q(0.85) }

mkKnight(id, teamId, x, y): Entity
  - KNIGHT_INFANTRY archetype
  - loadout: [wpn_longsword, arm_plate (resist_J=800)]
  - skills: { meleeCombat q(1.25), meleeDefence q(1.25) }

mkOctopus(id, teamId, x, y): Entity
  - LARGE_PACIFIC_OCTOPUS archetype
  - bodyPlan: OCTOPOID_PLAN (mantle + 8 arms)
  - skills: { grappling: q(1.60) }

mkScubaDiver(id, teamId, x, y): Entity
  - HUMAN_BASE archetype, no weapon, no skills
  - baseline reference opponent for octopus scenarios
```

### Scenario test suite (`test/scenarios.test.ts`)

22 tests across 6 describe blocks, validated by 50-seed statistical sweeps:

- **Archetype & weapon sanity** (4): pure data ordering checks
  (PRO_BOXER > AMATEUR_BOXER peakForce; octopus controlQuality > human; boxing gloves bleedFactor < knife)
- **Grapple score comparisons** (3): nominal attribute overrides confirm ordering
  (wrestler > octopus > untrained human; all pure maths, no RNG variance)
- **Boxing match** (4): kernel integration — pro boxer wins > 60% vs amateur; gloves produce
  near-zero bleeding; determinism check (same seed → identical outcome)
- **Wrestling bout** (3): wrestler holds target in > 70% of 50-seed sweep; achieves prone in
  > 50%; wrestler vs wrestler hold rate < wrestler vs untrained
- **Human vs Octopus** (5): octopus wins grapple vs diver in > 55% of sweeps; octopus arm
  injury appears in byRegion; single-arm damage does not kill octopus (distributed CNS);
  wrestler beats octopus in > 65% of sweeps
- **Knight vs Swordsman** (3): knight with plate armour survives > 2× longer than unarmoured
  equivalent; longsword knight defeats club-armed unarmoured in > 65% of sweeps;
  armoured-hit trace events (armoured=true) visible in combat log

836 tests after Phase 15; 858 tests after Phase 16. All coverage thresholds met (statements 97%, branches 87%, functions 95%, lines 97%).

---

## Phase 16 — Character Description Layer *(COMPLETE)*

**Goal**: translate Ananke's SI fixed-point attributes into human-readable summaries grounded
in real-world benchmarks, providing the narrative layer that RPG and game host applications need.

### Design principles

- **No simulation dependency** — `src/describe.ts` imports only `src/units.ts` and `src/types.ts`.
  Safe to use from UI code, server-side generators, or CLI tools without pulling in the kernel.
- **Tier system** — every quantitative attribute is rated 1–6 using breakpoints derived from
  sports-science literature; tier 3 anchors to the documented `HUMAN_BASE` nominal values.
- **Inverted tiers for latency** — reaction time and decision latency use an inverted scale
  (lower value = better = higher tier).

### Tier breakpoints

| Attribute | T1 | T2 | T3 | T4 | T5 | T6 |
|-----------|----|----|----|----|----|----|
| Strength (N) | <500 | 500–1100 | 1100–2000 | 2000–3500 | 3500–5500 | >5500 |
| Peak power (W) | <400 | 400–800 | 800–1400 | 1400–2000 | 2000–3000 | >3000 |
| Endurance (W) | <80 | 80–150 | 150–260 | 260–380 | 380–600 | >600 |
| Stamina (kJ) | <8 | 8–15 | 15–23 | 23–38 | 38–58 | >58 |
| Reaction (ms, inv.) | >450 | 300–450 | 220–300 | 170–220 | 120–170 | <120 |
| Coordination/Q (0–1) | <0.35 | 0.35–0.58 | 0.58–0.78 | 0.78–0.87 | 0.87–0.93 | >0.93 |
| Resilience/Q (0–1) | <0.25 | 0.25–0.45 | 0.45–0.62 | 0.62–0.75 | 0.75–0.88 | >0.88 |
| Decision (ms, inv.) | >800 | 560–800 | 460–560 | 300–460 | 80–300 | <80 |

**Anchors**: `HUMAN_BASE` nominal values (1840 N / 1200 W / 200 W / 20 kJ / 200 ms / Q=0.75 /
res=0.50 / 500 ms) all map to tier 3. `PRO_BOXER` strength (5000 N) → tier 5 "excellent".
`SERVICE_ROBOT` reaction (80 ms) → tier 6 "instant". `LARGE_PACIFIC_OCTOPUS` concussion
tolerance (0.90, no enclosed skull) → tier 6 "ironclad".

### API

```typescript
// src/describe.ts
export function describeCharacter(attrs: IndividualAttributes): CharacterDescription;
export function formatCharacterSheet(desc: CharacterDescription): string;
export function formatOneLine(desc: CharacterDescription): string;
```

`CharacterDescription` contains:

| Field | Type | Content |
|-------|------|---------|
| `stature` | string | `"1.75 m — average height"` |
| `mass` | string | `"75.0 kg — average build"` |
| `strength` … `concussionResistance` | `AttributeRating` | tier (1–6), label, comparison string, formatted value |
| `visionRange` | string | `"200 m, 120° arc"` |
| `hearingRange` | string | `"50 m"` |
| `decisionSpeed` | `AttributeRating` | inverted tier for `decisionLatency_s` |

`AttributeRating`:
```typescript
{ tier: Tier; label: string; comparison: string; value: string }
// e.g. { tier: 5, label: "excellent", comparison: "elite level — professional fighter strength", value: "4982 N" }
```

Body tier labels — stature: very short (<1.40m) / short (≤1.60m) / average height (<1.80m) /
tall (<1.95m) / very tall. Mass: slight (<50kg) / lean (<65kg) / average (<90kg) / heavy
(<115kg) / very heavy.

### Files

| File | Description |
|------|-------------|
| `src/describe.ts` | Pure translation module — no sim dependencies |
| `test/describe.test.ts` | 22 tests using `nominalAttrs` helper for absolute tier assertions |

### Tests

22 tests in four groups:

- **Tier ordering (8)**: PRO_BOXER strength > HUMAN_BASE; SERVICE_ROBOT reaction > HUMAN_BASE;
  OCTOPUS concussion > HUMAN_BASE; OCTOPUS stamina < HUMAN_BASE; etc.
- **Label and value content (6)**: nominal HUMAN_BASE strength tier 3 / label "average";
  SERVICE_ROBOT reaction "instant"; PRO_BOXER strength "excellent" or "exceptional"
- **Formatting (5)**: sheet contains section headers and numeric values; one-liner has no newlines
- **Body description (3)**: nominal HUMAN_BASE shows "1.75 m" and "average height"; OCTOPUS
  mass contains "15" and "slight"; SERVICE_ROBOT (1.60 m) does not show "average height"

**Implementation note**: absolute tier/label tests use a `nominalAttrs(arch)` helper that
constructs `IndividualAttributes` directly from archetype nominal values (no RNG variance),
because `generateIndividual(1, HUMAN_BASE)` with force-coupling factors produces a strength
value above the 2000 N tier-3 ceiling. Ordering tests continue to use generated individuals.

---

## Phase 17 — Historical Weapons Database + Combat Extensions *(COMPLETE)*

**Goal**: provide a comprehensive, physically calibrated weapons catalogue spanning six historical
eras and close two combat gaps the new weapons expose: flexible/chain weapons bypassing shields,
and magazine firearms with per-shot vs reload cooldowns.

### New file: `src/weapons.ts`

~70 historical weapons organised into 12 period arrays (6 melee + 6 ranged) plus two aggregate
exports (`ALL_HISTORICAL_MELEE`, `ALL_HISTORICAL_RANGED`). All units follow the project SI
fixed-point conventions; values calibrated against archaeological and biomechanics literature.

#### Melee eras and counts

| Era | Array | Count | Example weapons |
|-----|-------|-------|-----------------|
| Prehistoric | `PREHISTORIC_MELEE` | 5 | hand axe, war club, flint knife, flint spear, bone dagger |
| Classical | `CLASSICAL_MELEE` | 8 | pugio, gladius, xiphos, kopis, spatha, dory, sarissa, pilum |
| Medieval | `MEDIEVAL_MELEE` | 12 | arming sword, dane axe, flanged mace, war flail, morning star, military pick, warhammer, halberd, glaive, bastard sword, zweihänder |
| Renaissance | `RENAISSANCE_MELEE` | 6 | rapier, sidesword, estoc, main gauche, infantry pike, poleaxe |
| Early Modern | `EARLY_MODERN_MELEE` | 4 | cavalry saber, smallsword, socket bayonet, entrenching tool |
| Contemporary | `CONTEMPORARY_MELEE` | 3 | combat knife, tactical tomahawk, riot baton |

#### Ranged eras and counts

| Era | Array | Count | Example weapons |
|-----|-------|-------|-----------------|
| Prehistoric | `PREHISTORIC_RANGED` | 2 | atlatl dart, simple selfbow |
| Classical | `CLASSICAL_RANGED` | 4 | light javelin, pilum (thrown), composite bow, English warbow |
| Medieval | `MEDIEVAL_RANGED` | 3 | arbalest, hand cannon, arquebus |
| Renaissance | `RENAISSANCE_RANGED` | 2 | wheellock pistol, flintlock rifle |
| Early Modern | `EARLY_MODERN_RANGED` | 4 | percussion rifle, early revolver, breech rifle, handgun 9mm |
| Contemporary | `CONTEMPORARY_RANGED` | 6 | assault rifle, battle rifle, sniper rifle, shotgun 12g, submachine gun |

### Combat extension A — Shield bypass (`shieldBypassQ`)

New optional field on `Weapon`. Flexible/chain weapons loop around shield edges, reducing the
shield's effective `coverageQ` in both melee and ranged interposition rolls:

```
effectiveIntensity = qMul(defenceIntensity, SCALE.Q − bypassQ)   // melee block
effectiveCoverage  = qMul(shield.coverageQ,  SCALE.Q − bypassQ)  // ranged shield roll
```

Values: `wpn_war_flail` = q(0.55), `wpn_morning_star` = q(0.40). All other weapons omit the
field (treated as 0 — no bypass). Standard swords, axes, and spears are unaffected.

### Combat extension B — Magazine cooldown (`magCapacity` / `shotInterval_s`)

New optional fields on `RangedWeapon` and `roundsInMag` on `ActionState`. Behaviour:

- `magCapacity` undefined → muzzle-loader; existing `recycleTicks` logic unchanged.
- `magCapacity` defined → `roundsInMag` tracks rounds remaining (initialised to full on first shot).
- Between shots within a magazine: cooldown = `Math.ceil(shotInterval_s × TICK_HZ / SCALE.s)`.
- When the last round fires: reload to full; cooldown = `recycleTicks(wpn, TICK_HZ)`.

| Weapon | magCapacity | shotInterval_s | Reload |
|--------|-------------|----------------|--------|
| Early revolver | 6 | 0.8 s | 20.0 s |
| Handgun 9mm | 15 | 0.2 s | 2.5 s |
| Assault rifle | 30 | 0.1 s | 3.0 s |
| Battle rifle | 20 | 0.2 s | 3.5 s |
| Sniper rifle | 10 | 2.5 s | 8.0 s |
| Shotgun 12g | 6 | 0.5 s | 8.0 s |
| Submachine gun | 30 | 0.1 s | 2.5 s |

### Files

| File | Change |
|------|--------|
| `src/weapons.ts` | New — historical weapons database |
| `src/equipment.ts` | `shieldBypassQ?: Q` on `Weapon`; `magCapacity?: number` + `shotInterval_s?: I32` on `RangedWeapon` |
| `src/sim/action.ts` | `roundsInMag?: number` on `ActionState` |
| `src/sim/kernel.ts` | Shield bypass (melee + ranged) + magazine cooldown logic (~25 lines) |
| `test/weapons.test.ts` | New — 32 tests (data integrity, damage ordering, shield bypass, magazine mechanics, energy ordering) |

### Tests

32 new tests in five groups:

- **Data integrity (8)**: mass/id/damage present for all weapons; fracs in [0, SCALE.Q]; period
  arrays non-empty; magazine weapons have both fields; reach/mass/recycle orderings
- **Damage profile ordering (6)**: military pick strF > flanged mace; estoc penBias > rapier >
  arming sword; warbow penBias > composite bow; shotgun surfF > sniper; sniper penBias > shotgun
- **Shield bypass mechanics (4)**: war flail bypassQ > morning star > 0; standard weapons have
  none; direct unit test of qMul reduction formula; zero bypass leaves intensity unchanged
- **Magazine mechanics (6)**: magCapacity values; arquebus undefined; after 14 shots roundsInMag=1;
  15th shot reloads to 15 with recycleTicks cooldown; shotInterval ordering; arquebus unchanged
- **Energy ordering (6)**: assault > handgun; sniper ≥ battle rifle; arbalest > warbow > composite;
  arbalest > arquebus; shotgun drag > sniper; assault dispersion < shotgun

858 tests after Phase 16; **890 tests after Phase 17**. All coverage thresholds met
(statements 97.78%, branches 86.53%, functions 95.18%, lines 97.78%).