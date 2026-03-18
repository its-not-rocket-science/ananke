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

## Phase 3 — Ranged and Projectile Combat *(core complete; indirect fire → Phase 10; energy weapons → far future)*

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

## Phase 6 — Large-Scale Simulation *(COMPLETE)*

### Formation system expansion *(COMPLETE)*

`src/sim/formation-unit.ts` — pure computation module (no Entity/WorldState imports); 49 tests.

- **Shield walls:** `computeShieldWallCoverage` — highest-coverage bearer contributes fully; each
  additional bearer at `SHIELD_SHARING_FRAC = q(0.60)` efficiency; capped at `q(1.0)`.
- **Rank depth / casualty fill:** `deriveRankSplit` projects entity positions onto the facing direction
  (Q-scaled unit vector); front rank = within `RANK_DEPTH_DEFAULT_m` (2 m) of frontmost entity.
  `stepFormationCasualtyFill` removes dead entities and promotes the front of the rear rank to fill vacancies.
- **Push-of-pike dynamics:** `computeFormationMomentum` — `Σ trunc(mass_Skg × speed_Smps / SCALE.mps)`
  for all entities with speed > 0; divide result by `SCALE.kg` for physical kg·m/s.
- **Formation morale sharing:** `deriveFormationCohesion` — intact when `intactFrac_Q ≥ q(0.60)`;
  grants `FORMATION_MORALE_BONUS = q(0.008)` fear-decay/tick; broken formation applies
  `FORMATION_MORALE_PENALTY = q(0.010)` fear-increment/tick.
- **Formation ally fear decay:** `deriveFormationAllyFearDecay` — `q(0.004)` per alive ally,
  capped at `FORMATION_ALLY_DECAY_CAP = 8` allies.

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

## Phase 8B — Exoskeleton Biology *(COMPLETE)*

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
technology are the same abstraction with different flavour metadata. A fireball and a plasma
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
  tags: string[];            // flavour + suppression: ["magic"], ["tech","fusion"], ["cosmic","void"]
  reserve_J: number;         // current stored energy (joules, fixed-point integer)
  maxReserve_J: number;      // capacity ceiling; Number.MAX_SAFE_INTEGER for boundless sources
  regenModel: RegenModel;
  effects: CapabilityEffect[];
}
```

#### RegenModel — pluggable, flavour-agnostic

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
  tags?: string[];           // effect flavour: ["fire", "healing", "force", "nano"]
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

---

## Phase 18 — Combat Narrative Layer *(COMPLETE)*

**Goal**: a pure translation module (`src/narrative.ts`) that converts `TraceEvent` streams
into human-readable combat text. The companion to Phase 16's character description layer.
No simulation dependencies — safe to import from UI or server code.

### Prior-phase additions (from Phase 17/18 border work)

- `src/sim/kinds.ts` — `MoraleRally: "moraleRally"` added (was missing; routing end had
  erroneously re-used `MoraleRoute`)
- `src/sim/trace.ts` — `weaponId?: string` added to both `Attack` and `ProjectileHit` events
  (optional for back-compat); `MoraleRally` event type added
- `src/sim/kernel.ts` — `weaponId: ev.weaponId` now emitted in `Attack` trace; `weaponId: wpn.id`
  in `ProjectileHit` trace
- `src/sim/step/morale.ts` — routing-start → `MoraleRoute`; routing-end → `MoraleRally`
  (previously both used `MoraleRoute`)

### `src/narrative.ts` — implemented API

```typescript
export interface NarrativeConfig {
  verbosity: "terse" | "normal" | "verbose";
  nameMap?: Map<number, string>;        // entity id → display name; "you" enables 2nd-person verbs
  weaponProfiles?: Map<string, WeaponDamageProfile>;  // weaponId → profile for verb selection
}

export interface CombatantSummary {
  id: number; teamId: number; injury: { dead: boolean; consciousness: Q };
}

// Single event → string | null (null = omit at this verbosity level)
export function narrateEvent(ev: TraceEvent, cfg: NarrativeConfig): string | null;

// Filter + collect log lines from an event array
export function buildCombatLog(events: TraceEvent[], cfg: NarrativeConfig): string[];

// Injury state → short descriptive phrase
export function describeInjuries(injury: InjuryState): string;

// Per-team outcome summary
export function describeCombatOutcome(combatants: CombatantSummary[], tickCount?: number): string;
```

### Verbosity matrix

| Event | terse | normal | verbose |
|-------|-------|--------|---------|
| Attack hit | ✓ | ✓ | ✓ |
| Attack blocked/parried/shield | — | ✓ | ✓ |
| ProjectileHit hit | ✓ | ✓ | ✓ |
| ProjectileHit miss/suppress | — | ✓ | ✓ |
| KO, Death | ✓ | ✓ | ✓ |
| MoraleRoute, MoraleRally | ✓ | ✓ | ✓ |
| Fracture, BlastHit | ✓ | ✓ | ✓ |
| Grapple start/break | — | ✓ | ✓ |
| Grapple tick | — | — | ✓ |
| WeaponBind/Break | — | ✓ | ✓ |
| Treatment | — | — | ✓ |
| Capability events | — | — | ✓ |

### Verb selection

Derived from `WeaponDamageProfile` (supplied via `weaponProfiles` map; falls back to `"strike"`):

| Condition | Melee verb | Ranged verb |
|-----------|-----------|------------|
| `penetrationBias ≥ q(0.65)` | stab | — |
| `penetrationBias ≥ q(0.80)` | — | snipe |
| `structuralFrac ≥ q(0.50)` | bludgeon | — |
| `surfaceFrac ≥ q(0.50)` | slash | — |
| `surfaceFrac ≥ q(0.55)` | — | blast |
| Default | strike | shoot |

Energy qualifiers: `< 10J` → "barely grazes {target}"; `≥ 200J` → "powerfully {verb}";
`≥ 500J` → "devastatingly {verb}".

Second-person support: set `nameMap.get(id) === "you"` for bare-infinitive conjugation
("you strike" instead of "you strikes").

### Files

| File | Description |
|------|-------------|
| `src/narrative.ts` | Pure translation module; no kernel deps |
| `test/narrative.test.ts` | 56 tests: verb selection, severity tiers, region phrasing, all trace event kinds, log assembly, injury description, outcome summary |

### Tests

56 tests across seven groups:
- **Attack blocked/parried/shield (6)**: normal shows phrase, terse returns null for each
- **Attack hit quality (4)**: armoured note, barely/powerfully/devastatingly qualifiers
- **Verb selection (5)**: penetration→stab, structural→bludgeon, surface→slash, no profile→strike, 2nd-person bare infinitive
- **Region phrasing (3)**: head/leg/custom segment
- **ProjectileHit (8)**: name inclusion, distance, region, suppress/miss in terse vs normal, snipe verb
- **KO/Death/Morale (6)**: each event kind + custom names + fallback names
- **Grapple (5)**: start in normal/terse, tick in normal/verbose, break
- **Other events (7)**: WeaponBind terse/normal, BindBreak reason, Fracture, BlastHit, TickStart→null
- **buildCombatLog (4)**: entry count, skip nulls, ordering, terse < normal length
- **describeInjuries (5)**: fatal, healthy, hemorrhage, unconscious, fractured region
- **describeCombatOutcome (4)**: winner named, all down, standing counts, tickCount suffix

890 tests after Phase 17; **946 tests after Phase 18**. All coverage thresholds met
(statements 97.68%, branches 86.54%, functions 95.4%, lines 97.68%).

---

## Phase 19 — Downtime & Recovery Simulation *(COMPLETE)*

**Goal**: a time-scale bridge between the 20 Hz combat kernel and the days-to-weeks timescale
of wound recovery. `stepDowntime` re-uses the existing injury, clotting, substance, and
medical treatment systems at a compressed time scale without running the full kernel loop.

### Design principles

- **No new physics** — all healing rates, clotting curves, infection progression, and substance
  metabolism are the same values already in the kernel. Only the time scale changes.
- **Treatment schedule** — caller specifies what medical actions occur and when; the function
  applies them at the right simulated times.
- **Resource tracking** — each treatment action consumes items from a `MedicalInventory`; the
  function reports what was used and what it cost.
- **Recovery projection** — the report includes a data-driven estimate of time to full
  combat-readiness based on injury state and care level.

### Medical resource model

```typescript
export interface MedicalResource {
  id: string;
  name: string;
  tier: MedicalTier;         // bandage | surgicalKit | autodoc | nanomedicine
  costUnits: number;         // abstract value (host maps to gold/credits/etc.)
  massGrams: number;         // for encumbrance tracking
}

export const MEDICAL_RESOURCES: MedicalResource[] = [
  { id: "bandage",         name: "Field bandage",      tier: "bandage",     costUnits: 1,   massGrams: 50   },
  { id: "suture_kit",      name: "Suture kit",         tier: "bandage",     costUnits: 8,   massGrams: 100  },
  { id: "surgical_kit",    name: "Surgical kit",       tier: "surgicalKit", costUnits: 60,  massGrams: 2000 },
  { id: "antibiotic_dose", name: "Antibiotic dose",    tier: "surgicalKit", costUnits: 15,  massGrams: 50   },
  { id: "iv_fluid_bag",    name: "IV fluid bag",       tier: "autodoc",     costUnits: 25,  massGrams: 500  },
  { id: "autodoc_pack",    name: "Autodoc consumable", tier: "autodoc",     costUnits: 250, massGrams: 500  },
  { id: "nanomed_dose",    name: "Nanomed dose",       tier: "nanomedicine",costUnits: 2000,massGrams: 50   },
];
```

### `src/downtime.ts` — API

```typescript
// Preset care levels: what treatment is available and applied automatically.
export type CareLevel =
  | "none"          // natural clotting only; no intervention
  | "first_aid"     // bandage to each bleeding region as soon as possible
  | "field_medicine"// first_aid + surgical kit for fractures + antibiotics for infection
  | "hospital"      // field_medicine + IV fluid replacement for shock/fluid loss
  | "autodoc"       // all of the above at maximum tier + nanomedicine

export interface TreatmentSchedule {
  careLevel: CareLevel;
  // Optional: override when first treatment can be applied (seconds post-combat; 0 = immediate)
  onsetDelay_s?: number;
  // Optional: explicit item inventory; if omitted, assume unlimited supply
  inventory?: Map<string, number>;  // resourceId → count available
}

export interface DowntimeConfig {
  treatments: Map<number, TreatmentSchedule>;  // entityId → schedule
  ambientTemperature_Q?: Q;
  rest: boolean;                               // entities resting (recovery rate × 1.5)
}

export interface ResourceUsage {
  resourceId: string;
  name: string;
  count: number;
  totalCost: number;
}

export interface EntityRecoveryReport {
  entityId: number;
  elapsedSeconds: number;
  // Injury snapshots
  injuryAtStart: InjurySummary;
  injuryAtEnd: InjurySummary;
  // Outcomes
  died: boolean;
  bleedingStopped: boolean;    // all bleedingRates reached 0
  infectionCleared: boolean;
  fracturesSet: boolean;       // at least partially repaired
  combatReadyAt_s: number | null;  // projected seconds to resume light activity (null if fatal)
  fullRecoveryAt_s: number | null; // projected seconds to full structural recovery
  // Resource cost
  resourcesUsed: ResourceUsage[];
  totalCostUnits: number;
  // Narrative (if narrative module is present)
  log: Array<{ second: number; text: string }>;
}

export function stepDowntime(
  world: WorldState,
  elapsedSeconds: number,
  config: DowntimeConfig,
): EntityRecoveryReport[];
```

### Implementation approach

`stepDowntime` runs a compressed inner loop:

1. Divide `elapsedSeconds` into 1-second slices (not 1/20-second ticks).
2. Each slice: apply natural clotting (`bleedingRate × clotRate`), infection progression,
   substance metabolism — the same rate constants as the kernel but at 1 Hz.
3. Apply scheduled treatments at the appropriate second (bandage on onset, antibiotics on
   second day if infection present, etc.).
4. Track resource consumption from the `inventory` map.
5. Project forward: once all rates are known, estimate remaining time to zero-bleed and
   zero-structural-damage thresholds.

The "1 Hz slice" is the key trade-off: the same physics at 1/20th the resolution is accurate
enough for hour-to-week scale recovery without requiring full kernel passes.

### Real-world calibration targets

These are the ground-truth expectations the function's output should approximate:

| Scenario | Expected outcome |
|---|---|
| Superficial cut, no treatment | Bleeding stops naturally in 5–15 min; healed in 3–7 days |
| Deep laceration, no treatment | Bleeding may not stop; fatal in 30–90 min in 40–60% of cases (historical data) |
| Deep laceration, immediate first aid | Bleeding stops within 5 min; combat-ready in 7–14 days |
| Long bone fracture, no setting | Malunion; −30% mobility permanently in affected limb |
| Long bone fracture, surgical setting | Combat-ready in 6–10 weeks |
| Infection (untreated) | Sepsis onset in 3–7 days; fatal in 7–21 days |
| Infection + antibiotics (within 24 h) | Clears in 5–10 days; no permanent damage |
| Severe fluid loss (> 0.60), no treatment | Fatal within 30–60 min |
| Severe fluid loss, IV fluids | Stabilised in 30–60 min; recovery in 2–4 weeks |

These targets are encoded as `DowntimeExpectation` constants (see Phase 20) and verified by
the arena calibration suite.

### Files

| File | Description |
|------|-------------|
| `src/downtime.ts` | Time-scale bridge; no kernel import beyond types and healing rate constants |
| `test/downtime.test.ts` | ~25 tests: care level outcomes, resource counting, projection accuracy, calibration targets |

### Tests (~25)

- **Care level outcomes (8)**: `none` → bleeding may not stop; `first_aid` → bleeding stops
  within 5 min simulated; `field_medicine` → fractures set; `hospital` → fluid loss recovered;
  `autodoc` → all conditions resolved fastest; treatment delayed by onset_delay_s; inventory
  exhaustion handled gracefully; rest flag accelerates recovery
- **Resource tracking (5)**: bandage consumed per bleeding region; surgical kit consumed once per
  fracture treatment; antibiotics consumed on infection detection; running out of inventory
  degrades to lower care level; total cost sum is correct
- **Recovery projection (5)**: combat-ready estimate within ±20% of actual simulated time for
  moderate wounds; null returned for fatal trajectory; projection consistent across multiple
  calls on same wound state; full-recovery projection > combat-ready projection; fractures
  add weeks to full recovery
- **Calibration anchors (7)**: deep cut + no treatment → ≥40% fatal in 60 min simulated;
  deep cut + immediate first_aid → ≥90% survive 60 min; fracture + field_medicine → combat-ready
  in 6–12 weeks; infection + antibiotics within 24 h → clears in ≤10 days; untreated infection
  → fatal in ≤21 days; severe fluid loss + none → fatal in ≤60 min; severe fluid loss +
  hospital → stabilised in ≤60 min

---

## Phase 20 — Arena Simulation Framework *(COMPLETE)*

**Goal**: a declarative scenario system that makes it easy to define a fight (or a fight +
recovery), run it statistically over many seeds, validate outcomes against expectations, and
produce both machine-readable summaries and human-readable reports. Integrates Phase 18
(narrative) and Phase 19 (downtime) into a single ergonomic tool.

### Design goals

- **Replace boilerplate** — the 50-seed sweep pattern currently repeated manually in
  `test/scenarios.test.ts` becomes a one-call API.
- **Encode real-world calibration** — built-in `ArenaCalibration` constants encode documented
  combat and medical outcomes; host applications can verify their scenario results against
  published data.
- **Full lifecycle** — a scenario covers combat, immediate triage, recovery, and cost in one
  pass.
- **Composable output** — `ArenaResult` is a plain data object; narrative output is a separate
  formatting step.

### `src/arena.ts` — API

```typescript
// ── Scenario definition ──────────────────────────────────────────────────────

export interface ArenaCombatant {
  id: number;
  teamId: number;
  archetype: Archetype;
  seed?: number;             // if omitted, derived from trial seed + id
  loadout: Loadout;
  skills?: SkillMap;
  position_m: Vec3;
  aiPolicy?: AIPolicy;
}

export interface ArenaScenario {
  name: string;
  description?: string;
  combatants: ArenaCombatant[];
  terrain?: {
    terrainGrid?: TerrainGrid;
    obstacleGrid?: ObstacleGrid;
    elevationGrid?: ElevationGrid;
    hazardGrid?: HazardGrid;
    cellSize_m?: number;
  };
  maxTicks?: number;         // per-trial timeout (default: 30 s × TICK_HZ = 600 ticks)
  // Post-combat recovery phase
  recovery?: {
    careLevel: CareLevel;                          // applies to all combatants
    careByTeam?: Map<number, CareLevel>;           // override per team (victors may get better care)
    recoveryHours: number;                         // how many hours of downtime to simulate
    inventory?: Map<string, number>;               // shared item pool across all combatants
  };
  // Statistical expectations — checked against aggregate results
  expectations?: ArenaExpectation[];
}

// ── Expectations ────────────────────────────────────────────────────────────

export interface ArenaExpectation {
  description: string;
  // Receives aggregate result; return true if expectation is met.
  check: (result: ArenaResult) => boolean;
}

// Convenience builders:
export function expectWinRate(teamId: number, min: number, max?: number): ArenaExpectation;
// e.g. expectWinRate(1, 0.55) → "team 1 wins at least 55% of trials"

export function expectSurvivalRate(entityId: number, min: number): ArenaExpectation;
// e.g. expectSurvivalRate(1, 0.80) → "entity 1 alive at end in ≥ 80% of trials"

export function expectMeanDuration(minSeconds: number, maxSeconds: number): ArenaExpectation;
// e.g. expectMeanDuration(5, 30) → "average fight lasts 5–30 s"

export function expectRecovery(entityId: number, maxDays: number, careLevel: CareLevel): ArenaExpectation;
// e.g. expectRecovery(1, 14, "first_aid") → "entity 1 combat-ready within 14 days with first aid"

export function expectResourceCost(teamId: number, maxCostUnits: number): ArenaExpectation;
// e.g. expectResourceCost(2, 100) → "total medical resource cost for team 2 ≤ 100 units"

// ── Per-trial and aggregate results ─────────────────────────────────────────

export interface InjurySummary {
  entityId: number;
  dead: boolean;
  unconscious: boolean;
  consciousness: number;            // 0.0–1.0
  fluidLoss: number;
  shock: number;
  activeBleedingRegions: string[];
  fracturedRegions: string[];
  infectedRegions: string[];
  maxStructuralDamage: number;      // 0.0–1.0 across all regions
}

export interface RecoveryOutcome {
  entityId: number;
  died: boolean;
  combatReadyAt_s: number | null;
  fullRecoveryAt_s: number | null;
  resourcesUsed: ResourceUsage[];
  totalCostUnits: number;
}

export interface ArenaTrialResult {
  trialIndex: number;
  seed: number;
  ticks: number;                    // combat ticks elapsed
  outcome: "team1_wins" | "team2_wins" | "draw" | "timeout";
  survivors: number[];              // entity ids still alive at end of combat
  injuries: InjurySummary[];
  recoveryOutcomes?: RecoveryOutcome[];   // present if scenario.recovery defined
  combatLog?: CombatLogEntry[];          // present if narrative config supplied to runArena
}

export interface ArenaResult {
  scenario: ArenaScenario;
  trials: number;
  // Per-trial data
  trialResults: ArenaTrialResult[];
  // Aggregate statistics
  winRateByTeam: Map<number, number>;
  drawRate: number;
  timeoutRate: number;
  meanCombatDuration_s: number;
  p50CombatDuration_s: number;
  survivalRateByEntity: Map<number, number>;
  meanTTI_s: Map<number, number>;          // mean time to incapacitation per entity
  injuryDistribution: {
    entityId: number;
    meanFluidLoss: number;
    fractureProbability: number;
    deathProbability: number;
  }[];
  // Recovery aggregate (if scenario.recovery defined)
  recoveryStats?: {
    entityId: number;
    survivalRatePostRecovery: number;
    meanCombatReadyDays: number | null;
    meanFullRecoveryDays: number | null;
    meanResourceCostUnits: number;
    p90ResourceCostUnits: number;
  }[];
  // Expectation results
  expectationResults: Array<{
    description: string;
    passed: boolean;
    detail?: string;    // e.g. "actual win rate: 0.72, expected ≥ 0.55"
  }>;
}

// ── Runner ───────────────────────────────────────────────────────────────────

export function runArena(
  scenario: ArenaScenario,
  trials: number,
  options?: {
    narrativeCfg?: NarrativeConfig;  // include combat log in each trial result
    ctx?: KernelContext;
    seedOffset?: number;             // shift seed range (default 0)
  },
): ArenaResult;

// ── Reporting ────────────────────────────────────────────────────────────────

// Machine-readable summary (JSON-safe)
export function summariseArena(result: ArenaResult): object;

// Human-readable statistical report
export function formatArenaReport(result: ArenaResult): string;

// Full narrative of the median-duration trial (representative fight)
export function narrateRepresentativeTrial(
  result: ArenaResult,
  cfg?: NarrativeConfig,
): string;
```

### Built-in calibration scenarios

Pre-built `ArenaScenario` constants ground the system in real-world data. Running
`runArena(CALIBRATION_X, 50)` should always pass its embedded expectations.

```typescript
export const CALIBRATION_ARMED_VS_UNARMED: ArenaScenario;
// Armed trained human vs. unarmed untrained human.
// Expectations: armed wins ≥ 85% within mean 15 s; unarmed rarely survives uninjured.
// Source: criminal assault literature, self-defence training studies.

export const CALIBRATION_UNTREATED_KNIFE_WOUND: ArenaScenario;
// Simulates a post-combat entity with a severe knife wound (deep torso laceration, bleedingRate
// set to a lethal-trajectory value), no treatment, 60 min downtime.
// Expectations: ≥ 40% fatal within 60 min; ≥ 80% fatal within 3 h.
// Source: Sperry (2013) untreated penetrating abdominal trauma mortality.

export const CALIBRATION_FIRST_AID_SAVES_LIVES: ArenaScenario;
// Same wound, first_aid applied within 2 min.
// Expectations: ≥ 90% survive 60 min; mean combat-ready in 7–14 days.
// Source: TCCC (Tactical Combat Casualty Care) tourniquet outcome data.

export const CALIBRATION_FRACTURE_RECOVERY: ArenaScenario;
// Entity with a fresh long-bone fracture (structural damage q(0.75) to one leg),
// field_medicine care, 12-week downtime.
// Expectations: ≥ 95% full mobility by 12 weeks; < 5% full mobility by 2 weeks.
// Source: orthopaedic rehabilitation literature (femur fracture, surgical fixation).

export const CALIBRATION_INFECTION_UNTREATED: ArenaScenario;
// Moderate internal wound (bleedDuration_ticks already > 100 ticks → infection imminent),
// no antibiotics, 21-day downtime.
// Expectations: ≥ 60% fatal within 14 days.
// Source: pre-antibiotic era wound infection mortality (Ogston, Lister era data).

export const CALIBRATION_PLATE_ARMOUR: ArenaScenario;
// Armoured knight (arm_plate) vs. unarmoured swordsman, matched skill.
// Expectations: knight survives ≥ 2.5× longer; armoured hit trace events present.
// Source: HEMA literature on plate armour effectiveness, Wallace Collection studies.
```

### Resource cost reference values

The `costUnits` field in `MedicalResource` uses an abstract scale. The arena report can render
these as any currency a host chooses. Reference conversion for a pseudo-medieval setting:

| Item | Cost units | ~Medieval equivalent | ~Modern USD |
|---|---|---|---|
| Field bandage | 1 | 1 sp | $5 |
| Suture kit | 8 | 8 sp | $40 |
| Surgical kit | 60 | 6 gp | $300 |
| Antibiotic dose | 15 | 1.5 gp | $75 |
| IV fluid bag | 25 | — | $125 |
| Autodoc pack | 250 | — | $1 250 |
| Nanomed dose | 2 000 | — | $10 000 |

A typical lightly-wounded fighter (one deep cut, no fracture) receiving first aid costs
**1–2 bandages = 1–2 units**. A severely wounded fighter needing surgery and antibiotics
costs **60–80 units** over 2–3 days. Full autodoc resuscitation after near-fatal injuries
costs **500–1 000 units**.

### Files

| File | Description |
|------|-------------|
| `src/arena.ts` | Scenario DSL, batch runner, statistics, calibration constants, report formatter |
| `test/arena.test.ts` | ~35 tests: scenario definition, runner output, expectation framework, all 6 calibration scenarios |

### Tests (~35)

- **Scenario API (8)**: `runArena` with 10 trials produces correct trial count; seeds differ
  per trial; `winRateByTeam` sums to ≤ 1.0; `survivalRateByEntity` in [0, 1]; timeout fires
  at `maxTicks`; draw detected when both teams dead simultaneously; recovery stats present
  when scenario.recovery defined; narrative log present when `narrativeCfg` supplied
- **Expectation builders (6)**: `expectWinRate(1, 0.5)` passes when team 1 wins 60%; fails
  at 40%; `expectMeanDuration` passes/fails at boundaries; `expectRecovery` passes when
  median days within range; `expectResourceCost` passes when mean cost within limit;
  failing expectation includes detail string; passing expectation detail is absent/empty
- **Calibration scenarios (6)**: each of the 6 built-in calibration scenarios passes all
  its embedded expectations over 50 trials (these are integration tests and set the bar
  for physical realism)
- **Report formatting (5)**: `formatArenaReport` output contains scenario name, win rates
  as percentages, mean duration in seconds, expectation pass/fail table, and recovery cost
  table when applicable; `narrateRepresentativeTrial` produces text with weapon names and
  body regions; `summariseArena` is JSON.stringify-safe
- **Recovery stats (5)**: `meanCombatReadyDays` increases with injury severity; `none` care
  produces higher mean cost (death) than `first_aid`; resource inventory exhaustion caps
  care level; care by team applies different resources to each team; p90 cost > mean cost
- **Edge cases (5)**: single-combatant scenario runs without crash; all combatants same team
  → draw or timeout; zero-recovery-hours produces trivial report; missing narrative module
  omits log without error; scenario with no expectations still returns empty expectationResults

---

### Narrative RPG track — summary and sequencing

The three phases above form a coherent stack:

```
Phase 18 — narrative.ts       pure text translation (no physics)
    ↓ feeds
Phase 19 — downtime.ts        time-scale bridge (no new physics)
    ↓ feeds
Phase 20 — arena.ts           scenario runner (uses both above)
```

Each phase is useful independently. A host application that only needs combat logs can stop
at Phase 18. One that only needs recovery simulation can implement Phase 19 alone. Phase 20
brings them together for calibration, testing, and scenario design.

---

## Phase 21 — Character Progression *(COMPLETE)*

### Overview

Entities in Ananke have physical attributes with real SI units. Phase 21 adds the *temporal
axis*: attributes change over time due to training, ageing, injury sequelae, and substance
use. This is the bridge between individual encounters (Phases 1–20) and campaign-length play.

The design principle: a training regimen that raises `peakForce_N` by 200 N per month does
so at a physically plausible rate derived from exercise physiology literature. There is no
"level-up" abstraction — only scheduled attribute drift bounded by genetic ceiling.

---

### Concepts

**Experience and milestones**

A skill domain (Phase 7) accrues *experience points* proportional to contested use:
- Landing a successful parry → `+1 XP` in `weaponTechnique`
- Treating a wound successfully → `+2 XP` in `medicalSkill`
- Missed shot on moving target → `+0.5 XP` in `rangedTechnique`

Milestones are *thresholds* on the XP counter that trigger a discrete skill increment.
Milestone spacing increases geometrically (logarithmic mastery curve), reflecting diminishing
returns on practice at high skill levels.

```
Milestone n threshold = BASE_XP × GROWTH_FACTOR^n
BASE_XP       = 20   (first milestone is quick — novice to competent)
GROWTH_FACTOR = 1.80  (each successive milestone requires 80% more XP)
```

**Physical training**

`TrainingPlan` records scheduled sessions that produce attribute drift:

```typescript
interface TrainingSession {
  attribute:   "peakForce_N" | "peakPower_W" | "reserveEnergy_J" | "continuousPower_W";
  intensity_Q: Q;          // training load: q(0.50)=moderate, q(1.0)=near-maximal
  duration_s:  number;     // session length in seconds
}

interface TrainingPlan {
  sessions:     TrainingSession[];
  frequency_d:  number;    // sessions per day (may be fractional: 0.5 = every other day)
  ceiling_N:    number;    // genetic/pharmacological ceiling (absolute, same unit as attribute)
}
```

Attribute gain per session follows an S-curve with fatigue penalty for overtraining:

```
δForce = baseRate × intensity_Q × (1 − currentForce / ceiling) × (1 − fatiguePenalty)
baseRate ≈ 3 N per session at moderate intensity for a deconditioned human
fatiguePenalty = clamp((sessionsInLast7d − 5) × 0.08, 0, 0.50)
```

**Skill advancement**

`SkillLevel` maps domain → current value. On milestone:

```typescript
function advanceSkill(
  skills: SkillMap,
  domain: SkillDomain,
  delta: SkillDelta,        // e.g. { reactionTimeOffset_s: -0.005 }
): SkillMap
```

Physical effects of skill levels are the same as in Phase 7. Phase 21 adds the *how skills
are acquired* layer on top.

**Ageing**

Age in years drives a slow attribute drift function:
- Peak physical performance: rises until ~25, plateau ~25–35, decline ~0.5%/year after 35
- Cognitive speed (decision latency): stable until ~45, then +2 ms/year
- Resilience (pain/distress tolerance): stable throughout adult life

Ageing is optional; host sets `entity.ageYears?: number`.

**Injury sequelae**

After structural damage events, a permanent `sequela` may be recorded:
- Bone fracture with malunion → permanent −15% peak force in affected limb
- Nerve damage → permanent fine-control penalty in affected region
- Scar tissue → surface bleed threshold lower in scarred region

These feed back into `IndividualAttributes` as additive modifiers.

---

### Interfaces

```typescript
// src/progression.ts

export interface XPLedger {
  entries: Map<SkillDomain, number>;  // domain → cumulative XP
}

export interface MilestoneRecord {
  domain:    SkillDomain;
  milestone: number;   // which milestone (0-indexed)
  tick:      number;   // world tick when achieved
  delta:     SkillDelta;
}

export interface ProgressionState {
  xp:           XPLedger;
  milestones:   MilestoneRecord[];
  trainingLog:  Array<{ tick: number; attribute: string; delta: number }>;
  sequelae:     Array<{ region: string; type: string; penalty: number }>;
}

// Award XP and check for milestone triggers.
export function awardXP(
  state:  ProgressionState,
  domain: SkillDomain,
  amount: number,
  tick:   number,
): MilestoneRecord[];   // newly triggered milestones

// Apply one training session; returns updated attribute value.
export function applyTrainingSession(
  currentValue: number,
  plan:         TrainingPlan,
  session:      TrainingSession,
  sessionsInLast7d: number,
): number;

// Step ageing for one in-world day.
export function stepAgeing(
  attrs: IndividualAttributes,
  ageYears: number,
): Partial<IndividualAttributes>;   // attribute deltas (caller merges)

// Derive permanent sequelae from an injury at region resolution.
export function deriveSequelae(
  regionInjury: RegionInjury,
  bodyPlan:     BodyPlan,
): Array<{ type: string; penalty: number }>;
```

---

### Real-world calibration targets

| Scenario | Expected outcome |
|---|---|
| Novice fighter, 100 combats | `weaponTechnique.reactionTimeOffset_s` reduced by ~80 ms |
| 12-week strength programme (3×/week moderate) | `peakForce_N` rises ~150–300 N |
| Elite athlete 35 → 45 years | `peakPower_W` decreases ~8–12% |
| Femur fracture with malunion | Permanent −10–20% leg force on affected side |

---

### Files

| File | Description |
|------|-------------|
| `src/progression.ts` | XP ledger, milestone triggers, training simulation, ageing drift, sequelae derivation |
| `test/progression.test.ts` | ~30 tests: XP/milestone, training gain curve, ageing, sequelae, integration with `advanceSkill` |

### Tests (~30)

- **XP and milestones (8)**: awarding XP below threshold yields no milestone; crossing threshold yields one; multiple milestones in one call; XP is cumulative across calls; milestone delta applied to SkillMap; growth factor produces geometric spacing; separately tracked per domain; XP ledger serialises cleanly
- **Training gains (8)**: gain decreases as value approaches ceiling; overtraining penalty applies above 5 sessions/week; zero-intensity session produces zero gain; deconditioned entity gains faster than conditioned; moderate-intensity gain ≈ 3 N/session (calibration); gain is deterministic (no RNG); fractional day frequency; ceiling enforced strictly
- **Ageing (6)**: attributes stable under 35; decline rate ≈ 0.5%/year above 35; decision latency increases above 45; ageing step produces only valid physical values; integrating from age 20 to 70 stays above minimum viable; ageYears = undefined → no change
- **Sequelae (5)**: fractured high-structural-damage region → permanent force penalty; surface-dominant damage → scar tissue flag; deriveSequelae returns empty for healthy regions; penalties are additive; sequelae serialise round-trip
- **Integration (3)**: full match + XP award + training → attributes shift in expected direction; arena + progression for 50 rounds shows monotonic skill improvement; progression state is JSON-serialisable

---

## Phase 22 — Campaign & World State *(COMPLETE)*

### Overview

Phase 22 is the persistence layer. Between encounters, the world must remember: which entities
survived, what injuries they carry, which items were consumed, and what time has passed. Phase 22
provides a minimal but complete state container and the functions to advance it between sessions.

This phase does **not** model geopolitics, NPC schedules, or quest tracking — those are host
responsibilities. It provides the *physical substrate* for any such system: time, location,
entity persistence, and downtime integration.

---

### Concepts

**World clock**

`worldTime_s: number` — absolute simulated seconds since campaign epoch.

`stepCampaignTime(campaign, delta_s)` advances the clock and:
- Applies natural healing (delegates to Phase 19 `stepDowntime` at rest).
- Applies environmental exposure (temperature, humidity — if Phase 29 active).
- Drains food stores if Phase 30 is active.

**Location registry**

A location is a named region with environmental parameters:

```typescript
interface Location {
  id:          string;
  name:        string;
  ambientTemp_Q?: Q;      // Phase 29 integration
  elevation_m:  number;
  travelCost:  Map<string, number>;  // locationId → travel time in seconds
}
```

Entities track `locationId?: string`. Travel moves an entity between locations, consuming time
and (if Phase 30 is active) calories.

**Entity registry**

`CampaignState.entities` is a `Map<number, Entity>` — the master record for all persistent
beings. After each `stepWorld` call the host merges updated entity state back into the registry.
Phase 22 provides `mergeEntityState(registry, worldEntities)` to do this cleanly.

**Persistent inventory**

Items consumed in encounters (arrows, bandages) are debited from the entity's campaign
inventory. `debitInventory(entity, itemId, count)` enforces non-negative counts and logs
the transaction.

---

### Interfaces

```typescript
// src/campaign.ts

export interface CampaignState {
  id:          string;
  epoch:       string;          // ISO timestamp of campaign start (display only)
  worldTime_s: number;
  entities:    Map<number, Entity>;
  locations:   Map<string, Location>;
  log:         Array<{ worldTime_s: number; text: string }>;
}

export function createCampaign(id: string, entities: Entity[]): CampaignState;

// Advance world clock; apply rest healing, environmental effects.
export function stepCampaignTime(
  campaign: CampaignState,
  delta_s:  number,
  opts?:    { downtimeConfig?: DowntimeConfig },
): EntityRecoveryReport[];   // reports for entities that changed

// Merge updated entity states from a completed encounter back into the registry.
export function mergeEntityState(
  campaign:      CampaignState,
  worldEntities: Entity[],
): void;

// Move entity to new location; returns travel time consumed.
export function travel(
  campaign:     CampaignState,
  entityId:     number,
  toLocationId: string,
): number;   // seconds elapsed

// Debit item from entity's campaign inventory.
export function debitInventory(
  campaign: CampaignState,
  entityId: number,
  itemId:   string,
  count:    number,
): boolean;  // false if insufficient stock

export function serialiseCampaign(campaign: CampaignState): string;
export function deserialiseCampaign(json: string): CampaignState;
```

---

### Files

| File | Description |
|------|-------------|
| `src/campaign.ts` | Campaign state container, time stepping, entity registry, travel, serialisation |
| `test/campaign.test.ts` | ~28 tests: time advancement, healing integration, travel, inventory, serialisation |

### Tests (~28)

- **State management (6)**: `createCampaign` initialises clock at 0; `mergeEntityState` overwrites entity fields; entities added after creation appear in registry; `stepCampaignTime` advances clock by exact delta; clock is monotone; log entries timestamped correctly
- **Healing integration (6)**: 24h rest with wounds → bleeding reduced; no care → bleeding persists; hospital care over 7 days → structural damage decreased; `stepCampaignTime` calls `stepDowntime` internally; recovery reports returned; multiple entities handled independently
- **Travel (5)**: entity moves to new location; travel time matches travelCost; unknown locationId returns error; travel during starvation (Phase 30) drains more calories; travel time added to worldTime_s
- **Inventory (5)**: debitInventory returns true when stock available; false when insufficient; stock reaches 0 but not negative; multiple item types tracked independently; debits logged
- **Serialisation (6)**: round-trip preserves all fields; Map fields survive; entity injury state preserved; log array preserved; empty campaign round-trips; large campaign (100 entities) round-trips

---

## Phase 23 — Dialogue & Negotiation Layer *(COMPLETE)*

### Overview

Many encounters resolve without physical combat. Phase 23 provides a structured non-combat
resolution system grounded in the same physical and psychological attributes as the combat
engine — the "strong, intimidating fighter" mechanically intimidates because their
`peakForce_N` is genuinely high, not because they have a Charisma stat.

This phase is deliberately minimal. It does **not** model complex social webs or quest
dialogue trees — those are host-side. It provides the *resolution mechanics* for social
challenges, giving hosts probabilistic outcomes that compose with the morale, fear, and
cognition systems already present.

---

### Concepts

**Dialogue actions**

```typescript
type DialogueAction =
  | { kind: "intimidate"; intensity_Q: Q }       // back off or we fight
  | { kind: "persuade";   argument: string }      // reason together
  | { kind: "deceive";    plausibility_Q: Q }     // claim something false
  | { kind: "surrender";  terms?: string }        // lay down arms
  | { kind: "negotiate";  offer: TradeOffer }     // propose exchange
```

**Resolution**

Each action is resolved against the target's psychological state and cognitive attributes:

- **Intimidate**: succeeds with probability `P = clamp(q(source.peakForce_N / 4000) + feardelta − target.distressTolerance, 0, 1)`. Current `fearQ` of target acts as a bonus. Target's leader aura (Phase 5) reduces effectiveness.
- **Persuade**: base chance `q(0.40)`; modified by `learningRate` (proxy for general reasoning); increased by shared faction (Phase 24); decreased by prior failed persuasion attempts.
- **Deceive**: `plausibility_Q` × `(SCALE.Q − target.attentionDepth_Q)` — sharper minds detect deception more readily.
- **Surrender**: always succeeds as an offer; target accepts with `P = clamp(target.fearQ − q(0.40), 0, 1)`. A fearless entity never accepts surrender terms.
- **Negotiate**: trade offer accepted if utility is positive for target; utility is computed from `TradeOffer` item values (Phase 25).

**Outcomes**

```typescript
type DialogueOutcome =
  | { result: "success";  moraleDelta?: Q; fearDelta?: Q }
  | { result: "failure";  cooldown_s: number }       // retry penalty
  | { result: "escalate" }                           // target attacks
```

Escalation occurs when intimidation fails and target's fearQ < q(0.20): they interpret the
attempt as an insult and become hostile.

---

### Interfaces

```typescript
// src/dialogue.ts

export interface DialogueContext {
  initiator: Entity;
  target:    Entity;
  worldSeed: number;
  tick:      number;
}

export function resolveDialogue(
  action:  DialogueAction,
  ctx:     DialogueContext,
): DialogueOutcome;

// Bulk: apply outcome morale/fear deltas back to entities.
export function applyDialogueOutcome(
  outcome: DialogueOutcome,
  target:  Entity,
): void;

// Describe outcome in natural language (wraps narrative.ts style).
export function narrateDialogue(
  action:  DialogueAction,
  outcome: DialogueOutcome,
  cfg:     NarrativeConfig,
): string;
```

---

### Files

| File | Description |
|------|-------------|
| `src/dialogue.ts` | Action resolution, outcome generation, narrative helper |
| `test/dialogue.test.ts` | ~24 tests: each action type, boundary cases, escalation, deterministism |

### Tests (~24)

- **Intimidate (5)**: very strong entity vs. fearful target → high success rate; weak entity vs. unfearful → low; current high fearQ increases success; leader aura reduces success; deterministic (same seed = same outcome)
- **Persuade (5)**: base ~40% success; high learningRate boosts; same-faction bonus; repeated failure penalty applied; persuasion log serialises
- **Deceive (4)**: low plausibility → fails against high attentionDepth; high plausibility + low attention → passes; result is deterministic; deception outcome is "success" or "failure" only (no escalate)
- **Surrender (4)**: fearful target accepts; fearless target rejects; accepted surrender sets `surrendered = true`; offer always returns success (own side)
- **Escalation (3)**: intimidate failure + fearQ < q(0.20) → escalate; persuade does not escalate; escalate outcome triggers no morale delta
- **Narrative (3)**: `narrateDialogue` returns non-empty string; includes entity descriptors from describe.ts; terse vs. verbose modes differ in length

---

## Phase 24 — Faction & Reputation System *(COMPLETE)*

### Overview

Entities act on behalf of factions, and factions remember. Phase 24 tracks faction
membership, inter-faction standing, entity reputation within factions, and the witness system
that propagates information about events.

Like Phase 23, this phase is deliberately thin: it provides structured data and resolution
functions rather than complex politics simulations. The host builds narrative faction logic
on top.

---

### Concepts

**Factions**

```typescript
interface Faction {
  id:     string;
  name:   string;
  rivals: Set<string>;    // faction ids with default hostility
  allies: Set<string>;    // faction ids with default friendship
}
```

**Standing**

`Standing` is a `Q`-valued score in `[0, SCALE.Q]`:
- `q(0.0)` = Kill on sight
- `q(0.30)` = Hostile / distrusted
- `q(0.50)` = Neutral
- `q(0.70)` = Friendly
- `q(1.0)` = Exalted

Entities have `reputations: Map<string, Q>` (factionId → standing) stored on the entity.
Default standing for a rival faction is `q(0.20)`; for an ally faction `q(0.70)`.

**Witness system**

When a significant event occurs (kill, robbery, surrender, healing), witnesses (entities
within perception range with `detectionQ ≥ q(0.60)`) propagate a reputation delta to the
relevant factions:

```typescript
interface WitnessEvent {
  actorId:    number;
  eventType:  "kill" | "assault" | "theft" | "aid" | "surrender";
  targetId:   number;
  factionId:  string;     // faction that cares
  delta:      Q;          // positive = reputation increase, negative = decrease
}
```

**AI policy modulation**

The AI decision layer (Phase 4 / `decide.ts`) checks faction standing before choosing
`"attack"` intent. Standing below `q(0.30)` with the target's faction → default hostile.
Standing above `q(0.70)` → will not initiate combat unless attacked. This is opt-in via
`entity.faction?: string`.

---

### Interfaces

```typescript
// src/faction.ts

export interface FactionRegistry {
  factions:    Map<string, Faction>;
  globalStanding: Map<string, Map<string, Q>>;   // factionId → (factionId → Q)
}

export function createFactionRegistry(factions: Faction[]): FactionRegistry;

// Compute effective standing of entity A toward entity B
// (considers entity personal reputation, faction defaults, rival/ally relations).
export function effectiveStanding(
  registry: FactionRegistry,
  a:        Entity,
  b:        Entity,
): Q;

// Apply a witness event: update actor's reputation within the witnessing faction.
export function applyWitnessEvent(
  registry: FactionRegistry,
  event:    WitnessEvent,
): void;

// Collect witness events from a world event stream (e.g., arena trial combatLog).
export function extractWitnessEvents(
  events:    TraceEvent[],
  world:     WorldState,
  factions:  Map<number, string>,   // entityId → factionId
): WitnessEvent[];
```

---

### Files

| File | Description |
|------|-------------|
| `src/faction.ts` | Registry, standing computation, witness event processing |
| `test/faction.test.ts` | ~26 tests: standing computation, rival/ally defaults, witness propagation, AI policy integration |

### Tests (~26)

- **Standing (6)**: default neutral for unknown factions; rival faction default q(0.20); ally default q(0.70); personal reputation overrides faction default; combined standing uses max of entity vs. faction; standing clamped to [0, SCALE.Q]
- **Witness events (7)**: kill of ally member → large negative delta; aid of faction member → positive; theft → negative; multiple witnesses don't stack (deduplication by actor+event type per tick); delta proportional to severity; only entities with detectionQ ≥ q(0.60) witness; events logged
- **AI modulation (5)**: entity with standing < q(0.30) to target faction → hostile intent; standing > q(0.70) → non-hostile; entity without faction set → neutral behaviour unchanged; faction set but no faction in registry → graceful default; hostility overridden by self-defence (attacked first)
- **Registry (5)**: `createFactionRegistry` with rival/ally sets; `effectiveStanding` handles entities from same faction (exalted); faction not in registry → q(0.50) default; registry serialises with Map fields; large registry (20 factions) still O(1) per lookup
- **Integration (3)**: arena trial with two factions → witness events extracted; reputation updated; subsequent encounter AI acts on updated standing

---

## Phase 25 — Loot & Economy *(COMPLETE)*

### Overview

Physical encounters produce physical consequences, including items: weapons dropped by
defeated combatants, armour damaged and salvageable, medical supplies consumed. Phase 25
provides item value, degradation, trade, and drop mechanics that compose with the equipment,
medical, and arena systems.

The economic unit (`costUnits`) already exists in `MedicalResource` (Phase 19). Phase 25
generalises this to all equipment and adds a trade interface.

---

### Concepts

**Item value**

`ItemValue` extends equipment with market pricing:

```typescript
interface ItemValue {
  itemId:       string;
  baseValue:    number;    // cost units (same scale as MEDICAL_RESOURCES)
  condition_Q:  Q;         // q(1.0) = new; q(0) = worthless debris
  sellFraction: number;    // fraction of baseValue a vendor will pay (typically 0.40–0.60)
}
```

**Equipment degradation**

Melee weapons accumulate *use-wear* on each strike (successful or blocked):
- Weapon `wear_Q` starts at 0; increments by `q(0.001)` per strike, scaled by opponent hardness.
- At `wear_Q ≥ q(0.30)`: performance penalty begins (−5% effective mass for damage calculation).
- At `wear_Q ≥ q(0.70)`: weapon becomes unreliable (20% chance per strike of fumble — counts as miss).
- At `wear_Q ≥ q(1.0)`: weapon breaks and is removed from entity inventory.

Armour degrades via `resistRemaining_J` already tracked (Phase 11C). Phase 25 maps this to
`condition_Q` for economic reporting.

**Drop tables**

When an entity is killed or incapacitated:

```typescript
interface DropTable {
  guaranteed:  string[];          // itemIds always dropped
  probabilistic: Array<{ itemId: string; chance_Q: Q }>;
}
```

`resolveDrops(entity, seed)` returns the list of items that drop. Weapons and armour are
guaranteed drops (in degraded condition). Medical supplies have probabilistic yields.

**Trade**

`TradeOffer` is used by Phase 23 (negotiate) and economic simulations:

```typescript
interface TradeOffer {
  give: Array<{ itemId: string; count: number }>;
  want: Array<{ itemId: string; count: number }>;
}

function evaluateTradeOffer(offer: TradeOffer, inventory: ItemInventory): {
  netValue:     number;   // positive = advantageous for accepting party
  feasible:     boolean;  // accepting party has all "want" items
}
```

---

### Interfaces

```typescript
// src/economy.ts

export function computeItemValue(item: Equipment | MedicalResource, wear_Q?: Q): ItemValue;
export function resolveDrops(entity: Entity, seed: number): string[];
export function applyWear(weapon: Weapon, actionIntensity_Q: Q): { wear_Q: Q; broke: boolean };
export function evaluateTradeOffer(offer: TradeOffer, inventory: ItemInventory): TradeEvaluation;
export function totalInventoryValue(inventory: ItemInventory): number;
```

---

### Files

| File | Description |
|------|-------------|
| `src/economy.ts` | Item value, wear mechanics, drop resolution, trade evaluation |
| `test/economy.test.ts` | ~26 tests: value computation, wear accumulation, drop resolution, trade evaluation |

### Tests (~26)

- **Item value (5)**: fresh weapon has condition q(1.0); worn weapon has lower value; armour value scales with resistRemaining_J; MEDICAL_RESOURCES map correctly; total inventory value sums correctly
- **Wear mechanics (7)**: single strike adds q(0.001); hard opponent (plate) adds more than soft; wear ≥ q(0.30) triggers penalty; wear ≥ q(0.70) triggers fumble chance; fumble is deterministic with seed; wear ≥ q(1.0) → broke=true; armour wear updates resistRemaining_J proportionally
- **Drop resolution (6)**: guaranteed items always drop; probabilistic item at q(1.0) always drops; at q(0) never drops; deterministic with seed; dead entity drops all equipped; incapacitated drops nothing by default (configurable)
- **Trade (5)**: positive net value → feasible offer accepted; negative → rejected; infeasible (want item not in inventory) → feasible=false; zero-value exchange still feasible; `evaluateTradeOffer` is deterministic
- **Integration (3)**: arena trial → drops resolved for losers; wear accumulates over multi-round arena; economy report includes total loot value

---

## Phase 26 — Momentum Transfer & Knockback *(COMPLETE)*

### Overview

The current engine correctly models *energy* delivered on impact but ignores *momentum*.
This phase adds the second half of Newtonian mechanics: `p = mv`. When a massive blow lands,
the target recoils. Knockback can cause staggering, prone checks, and is essential for
realistic wrestling throws, artillery concussion, and large-creature vs. small-creature
scenarios.

**Design principle**: knockback is derived purely from classical impulse-momentum. No tunable
knockback multiplier is added. If the numbers feel wrong, the root cause is the energy or
mass inputs, and those should be corrected.

---

### Physics model

**Impulse from a melee strike**

Contact time for a blunt impact ≈ 5–15 ms. For a blade slash ≈ 1–3 ms (higher peak force,
shorter contact). Impulse = force × contact time = 2 × KE / velocity_of_head.

For practical implementation, derive from energy and projectile/weapon head velocity:

```
v_head ≈ sqrt(2 × E_delivered / mass_effective)
impulse_Ns = 2 × E_delivered / v_head       (elastic collision upper bound)
           = mass_effective × v_head         (equivalent)
knockback_Δv = impulse_Ns / target.mass_kg
```

In fixed-point:
```typescript
const v_head_mps  = Math.sqrt((2 * energy_J * SCALE.mps * SCALE.mps) / mass_eff_kg);  // careful: mixed units
const impulse_Ns  = Math.trunc((2 * energy_J * SCALE.mps) / Math.max(1, v_head_mps));
const knockback_v = Math.trunc((impulse_Ns * SCALE.mps) / target.attrs.mass_kg);       // in SCALE.mps units
```

**Projectile momentum**

For ranged impacts, v_projectile is already implied by `launchEnergy_J` and `projectileMass_kg`:
```
v_proj = sqrt(2E / m_proj)
impulse = m_proj × v_proj = sqrt(2 × E × m_proj)
```

A 5.56 mm round (4 g, 1760 J) delivers ~3.8 Ns → knockback on a 75 kg human ≈ 0.05 m/s.
Physically correct: modern rifle rounds cause negligible knockback. A 12.7 mm API round
(45 g, 20 000 J) → 60 Ns → 0.8 m/s knockback on 75 kg — a meaningful stagger.

**Stagger and prone checks**

```typescript
const STAGGER_THRESHOLD_mps = 0.5 * SCALE.mps;   // 0.5 m/s — stumble
const PRONE_THRESHOLD_mps   = 2.0 * SCALE.mps;   // 2.0 m/s — knocked down

// Stability coefficient reduces effective knockback:
const effective_v = Math.trunc(qMul(knockback_v, SCALE.Q - entity.attrs.stabilityQ));
if (effective_v >= PRONE_THRESHOLD_mps)  → setProne(entity)
if (effective_v >= STAGGER_THRESHOLD_mps) → setStagger(entity, 3)  // 3-tick stagger window
```

**Grapple throw integration**

Phase 2A throw already moves the thrown entity. Phase 26 adds velocity continuity:
the throw imparts `knockback_v` in the throw direction, which is then dissipated against
ground-contact damping. This produces realistic slide distances on hard surfaces vs. soft.

---

### Interfaces

```typescript
// src/sim/knockback.ts

export interface KnockbackResult {
  impulse_Ns:  number;   // raw impulse in fixed-point Newton-seconds (SCALE.N × SCALE.s units)
  knockback_v: number;   // SCALE.mps velocity delta applied to target
  staggered:   boolean;
  prone:       boolean;
}

export function computeKnockback(
  energy_J:    number,
  massEff_kg:  number,   // weapon head mass or projectile mass
  target:      Entity,
): KnockbackResult;

export function applyKnockback(
  entity: Entity,
  result: KnockbackResult,
  dir:    { dx: number; dy: number },   // unit vector in SCALE.m coordinates
): void;
```

The kernel calls `computeKnockback` inside `resolveHit` (melee) and `resolveShoot` (ranged),
then calls `applyKnockback` to update entity velocity.

---

### Real-world calibration targets

| Scenario | Expected outcome |
|---|---|
| Punch from 1840 N human (fist mass 0.4 kg) | Knockback Δv ≈ 0.3–0.6 m/s; no prone |
| Zweihander blow (blade mass 0.8 kg, 300 J) | Knockback Δv ≈ 0.9–1.4 m/s; stagger likely |
| 5.56 mm rifle round (4 g, 1760 J) | Knockback < 0.1 m/s; stagger only at point-blank |
| 12-gauge slug (28 g, 2100 J) | Knockback Δv ≈ 0.8–1.2 m/s; stagger near-certain |
| Octopus arm strike (1200 N) | Each arm: moderate knockback; combined: significant displacement |
| Large creature (500 kg) kick | Knockback Δv ≈ 3–6 m/s on human → prone |

---

### Files

| File | Description |
|------|-------------|
| `src/sim/knockback.ts` | Impulse calculation, stagger/prone check, apply function |
| `src/sim/kernel.ts` | Integrate `computeKnockback` / `applyKnockback` into melee and ranged resolution |
| `test/knockback.test.ts` | ~24 tests: impulse formula, stagger/prone thresholds, stability modifier, integration |

### Tests (~24)

- **Impulse calculation (6)**: formula produces correct Ns for known energy/mass pairs; zero mass → graceful (no divide-by-zero); high-mass projectile produces higher impulse than low-mass same energy; calibration: 5.56mm ≈ 3–4 Ns; calibration: zweihander ≈ 8–12 Ns; impulse is deterministic
- **Thresholds (5)**: below STAGGER_THRESHOLD → no stagger; above → stagger=true; above PRONE_THRESHOLD → prone=true; stability q(0.90) prevents prone on borderline hit; stability q(0.10) → prone on moderate hit
- **Apply (5)**: velocity delta added in correct direction; entity velocity bounded by max allowed; prone entity position updated; stagger sets actionState staggerTicks; velocity decays over terrain friction
- **Calibration (4)**: rifle round produces Δv < 0.15 m/s on 75 kg human; shotgun slug produces stagger; large creature kick → prone; punch from human → no prone on stable target
- **Integration (4)**: melee hit in arena produces non-zero knockback; ranged hit from rifle produces small Δv; grapple throw velocity matches knockback formula; backward compatibility: entities with no velocity state still work

---

## Phase 27 — Hydrostatic Shock & Cavitation *(COMPLETE)*

### Overview

High-velocity projectiles (above ~600 m/s) create two wound channels in tissue:

1. **Permanent cavity** — the physical path of the projectile through tissue. Already
   modelled by the current `resolveHit` damage distribution.

2. **Temporary cavity** — a radial stretching wave that propagates outward from the permanent
   cavity and then collapses. In elastic tissue (muscle) this leaves only bruising. In
   inelastic tissue (liver, brain, bone) it causes tearing — modelled as a multiplier on
   `internalFrac` damage.

3. **Cavitation** — in highly fluid-saturated tissue (lungs, vascularised muscle), at extreme
   velocities the pressure wave creates momentary vacuum bubbles. Bubble collapse causes
   additional haemorrhage — modelled as a bleedingRate multiplier.

This phase matters for: sniper rifle vs. armour gaps; high-velocity round vs. helmet; any
scenario comparing subsonic pistol to supersonic rifle lethality.

---

### Physics model

Temporary cavity size ∝ `(v_proj / 600_mps)² × (1 − tissue_compliance)`:

```
tempCavityMul = clamp(
  1 + (v_proj_mps² / (600² × SCALE.mps²)) × (SCALE.Q − tissueCompliance_Q),
  1,
  3    // upper bound: ~3× internal damage at 1000 m/s in inelastic tissue
)
```

Tissue compliance by region (lower = less elastic = more vulnerable to stretch injury):
- `liver`, `spleen`, `brain` → compliance q(0.10) — very inelastic
- `lung` → compliance q(0.30)
- `muscle` (torso, thigh) → compliance q(0.60) — moderately elastic
- `bone` regions → compliance q(0.05) — extremely brittle; cavitation causes shattering

Cavitation bleed multiplier (only applies at v > 900 m/s):
```
cavitationBleedMul = v_proj_mps > 900_mps ? 1 + ((v_proj - 900) / 300) : 1
```

For practical implementation: projectile velocity at impact is derived from `launchEnergy_J`
and `projectileMass_kg` after drag has been applied (already computed in `resolveShoot`):
```
v_impact_mps = sqrt(2 × E_remaining_J / projectileMass_kg)
```

---

### Activation gate

These effects only apply when **all** of:
1. `projectileMass_kg` is defined on the weapon (requires Phase 3 ammo tracking or Phase 17 weapons)
2. `v_impact_mps > HYDROSTATIC_THRESHOLD_mps = 600 * SCALE.mps / 1000` (adjusted for units)
3. Hit region is not heavy armour (armour reflectivity or high resist reduces the effect)

---

### Interfaces

```typescript
// src/sim/hydrostatic.ts

export const TISSUE_COMPLIANCE: Partial<Record<string, Q>>;  // regionId → compliance

export function computeTemporaryCavityMul(
  v_impact: number,    // SCALE.mps units
  region:   string,
): number;             // multiplier on internalFrac damage, ≥ 1.0

export function computeCavitationBleed(
  v_impact:      number,
  currentBleed:  number,
): number;             // new bleedingRate
```

Kernel integration: inside `resolveShoot`, after computing `internalInc`, multiply by
`computeTemporaryCavityMul` when projectile velocity exceeds threshold.

---

### Real-world calibration targets

| Scenario | Expected outcome |
|---|---|
| 9mm (370 m/s, 8 g) hitting torso muscle | No temp cavity multiplier (below threshold) |
| 5.56mm (960 m/s, 4 g) hitting liver | tempCavityMul ≈ 2.5–3.0× internal damage |
| .338 Lapua (900 m/s, 9.7 g) hitting thigh | tempCavityMul ≈ 1.8–2.2× + cavitation bleed |
| Subsonic .45 ACP (270 m/s) vs. M193 5.56 | M193 → ≥ 2× more internal damage in soft tissue |

---

### Files

| File | Description |
|------|-------------|
| `src/sim/hydrostatic.ts` | Tissue compliance table, temp cavity multiplier, cavitation bleed |
| `src/sim/kernel.ts` | Integrate into resolveShoot (post-drag, pre-damage application) |
| `test/hydrostatic.test.ts` | ~20 tests: compliance table, multiplier formula, cavitation, calibration comparisons |

### Tests (~20)

- **Tissue compliance (4)**: brain has lower compliance than muscle; bone lowest of all; lung intermediate; unknown region defaults to muscle-level
- **Temporary cavity (6)**: below 600 m/s → multiplier = 1.0; at 960 m/s in liver → ≈ 2.5–3.0; bounded at 3.0; inelastic region always greater than elastic at same velocity; zero-mass projectile → no effect; compliant tissue (muscle) multiplier stays near 1.0 at 600 m/s
- **Cavitation bleed (4)**: below 900 m/s → no added bleed; at 1000 m/s → bleed multiplier applies; not applied to non-fluid tissue (bone); deterministic
- **Calibration (6)**: 9mm subsonic → same internal as pre-phase; 5.56mm → ≥ 2× internal in liver vs. 9mm; subsonic .45 < M193 5.56 internal damage; .338 Lapua produces highest internal of modern rifles; sniper round to brain is more lethal than same energy to thigh; armour full-stop prevents all temporary cavity

---

## Phase 28 — Cone AoE: Breath Weapons, Fire, Gas *(COMPLETE)*

### Overview

The existing AoE system (Phase 10) uses spherical explosions. Many real and fictional
effects are *directional*: a dragon exhales fire in a cone, a flamethrower projects a
narrow stream, a gas dispenser releases a cloud in the wind direction.

Phase 28 adds **cone geometry** to the capability system (Phase 12), enabling breath
weapons, cones of gas, blinding flashes forward of a weapon, and sonic disorientation
blasts — all using the existing `CapabilitySource` infrastructure.

---

### Geometry

A cone is defined by:
```typescript
interface Cone {
  origin:    { x: number; y: number };   // SCALE.m
  dir:       { dx: number; dy: number }; // unit vector (normalised in SCALE.m space)
  halfAngle_rad: number;                 // radians; π/6 = 30° = typical breath
  range_m:   number;                     // SCALE.m; max length of cone
}
```

**Entity in cone check**:
```typescript
function entityInCone(entity: Entity, cone: Cone): boolean {
  const ex = entity.pos.x - cone.origin.x;
  const ey = entity.pos.y - cone.origin.y;
  const dist = Math.sqrt(ex*ex + ey*ey);           // SCALE.m
  if (dist > cone.range_m) return false;
  // dot product with direction
  const dotNorm = (ex * cone.dir.dx + ey * cone.dir.dy) / (dist || 1);
  return dotNorm >= Math.cos(cone.halfAngle_rad);
}
```

**Fixed-point note**: The `dir` vector and `halfAngle_rad` live outside the fixed-point
domain (they are configuration constants, not per-tick simulation values). The `dist`
computation uses SCALE.m integers; the cosine comparison uses pre-computed integer threshold:
`cosThreshold = Math.round(Math.cos(halfAngle_rad) * SCALE.Q)` then compare
`dotNorm_Q = mulDiv(dot, SCALE.Q, dist)` against `cosThreshold`.

---

### Capability integration

`CapabilitySource` gains two new optional fields:

```typescript
// Appended to CapabilitySource (src/sim/capability.ts)
coneHalfAngle_rad?: number;     // if set, AoE is a cone rather than sphere
coneDir?: "facing" | "fixed";   // "facing" = entity facing direction; "fixed" = fixed dir
coneDirFixed?: { dx: number; dy: number };  // used when coneDir = "fixed"
```

When a capability with `coneHalfAngle_rad` fires, the kernel replaces the spherical AoE
loop with the cone loop, applying the payload to each entity within the cone.

**Sustained emission**

A breath weapon is not instantaneous. Phase 28 adds `sustainedTicks?: number` to
`CapabilitySource`. When active:
- Capability activates normally (cast time, cooldown apply).
- `sustainedTicks` counts down each tick the capability fires, applying the payload each tick.
- If the entity takes damage during sustained emission, there is a concentration break check
  (same mechanism as Phase 12B concentration aura, `castTime = -1`).

**Fuel tracking**

`CapabilitySource` already has regen models (Phase 12). A flame-breath uses `ambient` regen
(zero — no regeneration) and a finite resource pool (`regenModel.type = "boundless"` is
wrong here; use `"rest"` with `totalCharge_J`). The existing regen infrastructure handles
depletion naturally.

---

### Dragon scenario: knight vs. fire-breathing dragon

```typescript
// DRAGON_FIRE_BREATH: CapabilitySource
const DRAGON_FIRE_BREATH: CapabilitySource = {
  id:              "dragon_fire_breath",
  name:            "Fire Breath",
  payload:         {
    kind:         "impact",
    damage: {
      surfaceFrac:    q(0.60),   // fire burns surface heavily
      internalFrac:   q(0.30),   // convective heat reaches internal tissue
      structuralFrac: q(0.10),   // flash heating can crack bone
      bleedFactor:    q(0.05),   // little bleeding from fire
      penetrationBias: q(0.05),
    },
    energyPerTick_J: 800,        // 800 J/tick = 16 kJ/s — empirically hot fire
  },
  range_m:         10 * SCALE.m,
  coneHalfAngle_rad: Math.PI / 6,   // 60° cone
  sustainedTicks:  20,              // 1-second burst
  castTime_ticks:  5,
  cooldown_ticks:  100,
  regenModel: { type: "rest", restorePerTick: 0, maxCharge_J: 32_000 },
  energyType:      "thermal",       // uses existing Energy damage channel
};
```

A plated knight facing this breath:
- Plate armour (arm_plate) has resist_J = 800 and no `reflectivity` for thermal.
- Phase 11C Energy channel: thermal damage bypasses reflectivity (only configured for energy beams).
- `surfaceFrac` damage applies over 20 ticks → surface injury accumulates; `internalFrac`
  passes through metal (heat conduction) as full damage.
- Net effect: a sustained full-breath attack against a plate-armoured knight will cause
  significant internal heat injury within ~0.5 seconds. This is physically plausible
  (metal conducts heat rapidly).

To model heat resistance, armour or entities can have a `thermalResist_Q` modifier checked
by the kernel against the `"thermal"` energyType tag.

---

### Files

| File | Description |
|------|-------------|
| `src/sim/cone.ts` | Cone geometry, `entityInCone`, cone AoE loop |
| `src/sim/capability.ts` | Add `coneHalfAngle_rad`, `coneDir`, `sustainedTicks` fields |
| `src/sim/kernel.ts` | Route capability AoE through cone loop when configured |
| `test/cone.test.ts` | ~22 tests: geometry, sustained emission, fuel depletion, dragon calibration |

### Tests (~22)

- **Geometry (7)**: entity at origin+dir within range → in cone; entity behind → not in cone; entity at exact half-angle → in cone; entity past range → not in cone; entity at right angles → not in cone (for 30° half-angle); large half-angle (π/2) captures hemisphere; zero range → nothing in cone
- **Sustained emission (5)**: sustainedTicks = 20 → damage applied 20 consecutive ticks; damage interrupt on shock ≥ q(0.30); each tick deducts from charge; cone rotates with entity facing on "facing" mode; fixed dir stays constant
- **Integration (5)**: DRAGON_FIRE_BREATH applied to knight in cone → surface injury accumulates; knight outside cone (90° off) → no damage; breath weapon depletes after 40 ticks (2 × sustainedTicks); cooldown prevents immediate re-use; non-cone (spherical) capability unaffected
- **Dragon scenario (5)**: knight + PLATE_ARMOUR in 10m cone → internal damage > 0 within 20 ticks; knight outside cone → no damage; unarmoured entity → higher surface damage than knight; knight retreats beyond range → damage stops; dragon vs. octopus (soft tissue) → octopus takes more surface damage than knight

---

## Phase 29 — Environmental Stress: Staged Hypothermia & Hyperthermia *(COMPLETE)*

### Overview

The existing temperature system (Phase 10C) applies direct damage from extreme heat and cold.
Phase 29 replaces this with a physiologically accurate core-temperature model. Instead of
instant damage, temperature stress follows a staged progression over minutes to hours, with
reversible early-stage impairment and irreversible late-stage injury.

This enables realistic scenarios: a soldier surviving a blizzard for hours before incapacitation;
a desert march causing heat exhaustion before sundown; a diver in 4°C water having 30–90
minutes before incapacitation (and this varying realistically with insulation).

---

### Physics model

**Core temperature tracking**

```typescript
// Added to ConditionState
coreTemp_Q: Q;   // q(0.5) = 37°C; linear map: 0=10°C, SCALE.Q=64°C
                 // so 1°C = 185.2 Q units; 37°C = q(0.5)
```

Initial value: `q(0.50)` (37.0 °C) for all warm-blooded entities.

**Heat balance equation (per second, at 1 Hz)**

```
ΔT = (metabolicHeat − conductiveLoss − evaporativeLoss) / thermalMass
metabolicHeat  = entity.peakPower_W × activityFraction × (1 − efficiency)  [W]
conductiveLoss = (coreTemp_C − ambientTemp_C) / thermalResistance            [W]
thermalMass    = entity.mass_kg × 3500                                       [J/°C; specific heat of tissue]
thermalResistance = 0.09 + armourInsulation                                  [°C/W; ≈ 0.09 for unclothed human]
armourInsulation  = (sum of armour pieces' insulation_m2KW rating)
```

**Staged effects**

| Core temp (°C) | Stage | Effect |
|---|---|---|
| 37.0–38.0 | Normal | None |
| 38.0–39.0 | Mild hyperthermia | −5% peakPower_W effective; sweat penalty on desert terrain |
| 39.0–40.0 | Heat exhaustion | −15% peakPower_W; fine-control penalty q(0.10) |
| 40.0–41.0 | Heat stroke | −40% peakPower_W; decision latency ×2; possible collapse |
| > 41.0 | Critical | Death trajectory (injury.fluidLoss accelerates) |
| 36.0–37.0 | Mild hypothermia | Shivering: +10% metabolic load, −5% fine control |
| 34.0–36.0 | Moderate hypothermia | −20% peakPower_W; −15% fine control; reaction time +20% |
| 32.0–34.0 | Severe hypothermia | −50% peakPower_W; decision latency ×3; confusion |
| < 32.0 | Critical | Cardiac arrest risk; death trajectory |

**Entity property extensions**

```typescript
// Added to Weapon / Armour type (equipment.ts)
insulation_m2KW?: number;   // thermal insulation for armour pieces (0 = none; 0.20 = heavy wool)
```

Plate armour with no liner: insulation ≈ 0.02 m²K/W (metal conducts heat rapidly — bad in extreme cold and heat).
Heavy fur cloak: insulation ≈ 0.25 m²K/W.

---

### Interfaces

```typescript
// src/sim/thermoregulation.ts

export const CORE_TEMP_NORMAL_Q:    Q;   // q(0.500) = 37.0°C
export const CORE_TEMP_HEAT_MILD:   Q;   // q(0.515)
export const CORE_TEMP_HEAT_EXHAUS: Q;   // q(0.529)
export const CORE_TEMP_HEAT_STROKE: Q;   // q(0.544)
export const CORE_TEMP_HYPOTHERMIA_MILD:   Q;  // q(0.485) = 36.0°C
export const CORE_TEMP_HYPOTHERMIA_MOD:    Q;  // q(0.456) = 34.0°C
export const CORE_TEMP_HYPOTHERMIA_SEVERE: Q;  // q(0.426) = 32.0°C

export function stepCoreTemp(
  entity:      Entity,
  ambientTemp: Q,         // same Q-coded temperature
  delta_s:     number,    // seconds (downtime) or 1/TICK_HZ (kernel)
): Q;                     // new coreTemp_Q

export function deriveTempModifiers(coreTemp_Q: Q): {
  powerMul:       Q;    // effective multiplier on peakPower_W
  fineControlPen: Q;    // subtracted from controlQuality
  latencyMul:     Q;    // multiplied against decision latency
  dead:           boolean;
};
```

The kernel calls `stepCoreTemp` once per tick (at 1/20 Hz accuracy; acceptable for a
minutes-scale process). `stepDowntime` calls at 1 Hz for recovery simulation.

---

### Real-world calibration targets

| Scenario | Expected outcome |
|---|---|
| Unclothed human, 0°C ambient, resting | Core temp reaches 34°C (severe hypothermia) in ~60–90 min |
| Unclothed human, 0°C ambient, marching | Core temp stabilises ~35–36°C (mild hypothermia) |
| Desert soldier (30°C ambient), full exertion | Core temp reaches 40°C (heat exhaustion) in ~30–60 min |
| Diver in 4°C water (wetsuit insulation 0.05) | Severe hypothermia in 30–45 min |
| Knight in plate (metal, 0.02 insulation), blizzard | Moderate hypothermia in 20–40 min |
| Knight in plate with wool liner (0.15 insulation), blizzard | Mild hypothermia only after 2+ h |

---

### Files

| File | Description |
|------|-------------|
| `src/sim/thermoregulation.ts` | Core temperature model, staged thresholds, modifier derivation |
| `src/sim/kernel.ts` | Call `stepCoreTemp` per tick; apply `deriveTempModifiers` to action resolution |
| `src/downtime.ts` | Call `stepCoreTemp` at 1 Hz during recovery simulation |
| `test/thermoregulation.test.ts` | ~26 tests: heat balance, stage thresholds, armour insulation, calibration |

### Tests (~26)

- **Heat balance (5)**: resting human in 37°C ambient → stable core temp; resting human in 0°C → core cools; exerting human in cold → core stabilises higher than resting; plate armour (low insulation) cools faster than fur cloak; entity with zero mass graceful (no divide)
- **Stage thresholds (6)**: at normal temp → all modifiers = identity; mild hyperthermia → powerMul reduced; heat exhaustion → fineControlPen > 0; heat stroke → latencyMul > 1; critical hyperthermia → dead=true; critical hypothermia → dead=true
- **Armour insulation (5)**: plate armour produces faster cooling than no armour (metal conduction); fur cloak produces slower cooling; stacked insulation values sum correctly; insulation never makes cooling negative (can't overheat from insulation in cold); insulation values are physically plausible
- **Calibration (7)**: unclothed rest 0°C → severe hypothermia in 3600–5400 s; unclothed marching 0°C → mild only; desert soldier exertion → heat exhaustion in 1800–3600 s; diver 4°C → severe in 1800–2700 s; knight plate blizzard → moderate in 1200–2400 s; knight plate+wool → mild only after 7200 s; all calibrations deterministic
- **Integration (3)**: downtime with cold environment → core temp decreases; kernel integration → powerMul affects strike energy; thermoregulation interacts with existing temperature-damage channel without double-counting

---

## Phase 30 — Nutrition & Starvation ✓ COMPLETE

### Overview

All energy in the simulation ultimately comes from metabolism. The existing stamina system
(Phase 2B) models short-term energy reserves (`reserveEnergy_J`) but treats them as instantly
replenished. Phase 30 adds the long-term layer: food stores, basal metabolic demand, and
the staged consequences of caloric deprivation across hours to weeks.

This phase completes the survivability stack: entities can now die from dehydration (fluid
loss), blood loss (injury), infection (Phase 9), temperature (Phase 29), *or* starvation.
Each operates on a different time scale and requires different intervention — which is the
design goal.

---

### Physics model

**Metabolic demand**

Basal metabolic rate (BMR) for a warm-blooded entity:

```
BMR_W ≈ 80 × (mass_kg / 75)^0.75    [Kleiber's law]
```

In fixed-point: `BMR_W = mulDiv(80, (mass_kg)^0.75_approx, (75000)^0.75_approx)`
(pre-tabulated for common masses to avoid floating-point in the sim path).

Active metabolic rate during combat: `AMR_W = BMR_W + peakPower_W × intensity × 0.15`

Over a day at rest: `dailyCalories_J = BMR_W × 86400` ≈ 6.9 MJ/day for 75 kg human.

**Food items**

```typescript
interface FoodItem {
  id:           string;
  name:         string;
  energy_J:     number;   // caloric energy; 1 ration bar ≈ 2 MJ
  massGrams:    number;
}

const FOOD_ITEMS: FoodItem[] = [
  { id: "ration_bar",   name: "Ration bar",   energy_J: 2_000_000, massGrams: 500 },
  { id: "dried_meat",   name: "Dried meat",   energy_J: 1_500_000, massGrams: 300 },
  { id: "hardtack",     name: "Hardtack",     energy_J:   800_000, massGrams: 200 },
  { id: "fresh_bread",  name: "Fresh bread",  energy_J:   700_000, massGrams: 250 },
  { id: "berry_handful",name: "Berries",      energy_J:   150_000, massGrams:  50 },
  { id: "water_flask",  name: "Water flask",  energy_J:         0, massGrams: 500,
    hydration_J: 500_000 },   // rehydration prevents fluid loss accumulation
];
```

**Hunger state**

```typescript
type HungerState = "sated" | "hungry" | "starving" | "critical";
```

| State | Onset | Combat effect |
|---|---|---|
| `sated` | Caloric surplus ≥ 0 | None |
| `hungry` | 12–24 h caloric deficit | −10% effective stamina power |
| `starving` | 24–72 h deficit | −25% stamina; −10% peakForce_N effective; morale penalty q(0.030)/tick |
| `critical` | > 72 h deficit | −50% stamina; −20% peakForce_N; decision latency ×1.5; collapse risk |

**Mass loss**

During starvation:
- First 24h: glycogen depletion (negligible mass loss ~100 g)
- 24–72h: fat catabolism ~300 g/day at BMR; higher with activity
- 72h+: muscle catabolism → permanent reduction in `peakForce_N` at rate ≈ 0.5 N/hour

Mass loss is tracked and reduces `entity.attrs.mass_kg` accordingly.

**Nutrition state tracking**

```typescript
// Added to ConditionState
caloricBalance_J:  number;  // accumulated surplus/deficit in joules; negative = deficit
hydrationBalance_J: number; // accumulated water balance
lastMealTick:       number;
hungerState:        HungerState;
```

---

### Interfaces

```typescript
// src/sim/nutrition.ts

export const FOOD_ITEMS: FoodItem[];

export function computeBMR(mass_kg: number): number;   // watts (fixed-point W)

export function stepNutrition(
  entity:    Entity,
  delta_s:   number,   // seconds elapsed (1 Hz in downtime, 0.05s in kernel)
  activity:  Q,        // current activity intensity (for AMR calculation)
): void;               // mutates entity.condition.caloricBalance_J, hungerState

export function consumeFood(
  entity:    Entity,
  foodId:    string,
  tick:      number,
): boolean;            // false if food not in inventory

export function deriveHungerModifiers(hungerState: HungerState): {
  staminaMul:     Q;
  forceMul:       Q;
  latencyMul:     Q;
  moraleDecay:    Q;
};
```

---

### Real-world calibration targets

| Scenario | Expected outcome |
|---|---|
| 75 kg human, BMR only | BMR ≈ 80 W ≈ 6.9 MJ/day |
| 75 kg human, 24h without food | `hungry` state; −10% stamina |
| 75 kg human, 72h without food | `starving` state; mass −0.6–1.0 kg |
| 75 kg human, 7 days without food | `critical` → collapse; mass −2–3 kg |
| Warrior in full combat, 4h | caloric demand ≈ 3× BMR; food reserve depletes ~3× faster |
| Ration bar consumption | Restores `sated` state from `hungry` for ~1 day at rest |

---

### Files

| File | Description |
|------|-------------|
| `src/sim/nutrition.ts` | BMR computation, hunger state machine, food items, modifier derivation |
| `src/sim/kernel.ts` | Call `stepNutrition` per tick (at reduced resolution: 1 Hz via accumulator) |
| `src/downtime.ts` | Call `stepNutrition` during recovery simulation |
| `test/nutrition.test.ts` | ~26 tests: BMR, hunger states, food consumption, mass loss, calibration |

### Tests (~26)

- **BMR (4)**: 75 kg entity → BMR ≈ 80 W; heavier entity has higher BMR; lighter entity has lower; BMR is deterministic and integer-valued
- **Hunger states (6)**: fresh entity starts sated; 12h deficit → hungry; 24h → starving; 72h → critical; food consumption from hungry → sated; food consumption from starving only partially recovers if severe deficit
- **Food consumption (5)**: consuming unknown food returns false; consuming food in inventory succeeds; energy_J added to caloricBalance_J correctly; ration bar from hungry → sated; water flask reduces hydrationBalance and fluidLoss
- **Mass loss (5)**: no loss in first 24h; fat loss at expected rate 24–72h; muscle loss after 72h; mass_kg decreases in attrs; mass loss reduces effective peakForce_N (muscle catabolism)
- **Modifiers (3)**: sated → identity modifiers; starving → staminaMul < SCALE.Q; critical → moraleDecay > 0
- **Calibration (3)**: warrior 4h combat → 3× BMR; 7-day starvation → critical + mass loss ≈ 2–3 kg; ration bar + 1 day rest → sated

---

## Physics Realism Summary (Post-Phase 30)

Phases 1–30 are complete. Ananke now handles the following real-world physics scenarios:

### Man wrestling an octopus (Phase 2A + Phase 8B + Phase 26)
- Octopus: LARGE_PACIFIC_OCTOPUS archetype, 8 arms, controlQuality q(0.95), stability q(0.98)
- `grappleScore` accounts for force (1200 N × 8 arms), suction friction (modelled as stability bonus)
- Phase 26 knockback: each arm strike displaces human ≈ 0.2–0.5 m/s; combined pressure overwhelming
- Physically realistic: a 40 kg octopus can overpower a 75 kg human in water (reduced human stability)
- Gap remaining: individual arm tracking (all 8 arms treated as one force pool)

### Boxer versus giant insect (Phase 8B + Phase 26 + Phase 27)
- Giant insect modelled via GRASSHOPPER_PLAN body plan; exoskeleton `structureType`
- Boxer: PRO_BOXER archetype (5000 N force); punch targets shell segments
- Shell breach threshold gate (Phase 8B): boxer must exceed breachThreshold to cause internal damage
- After breach: internal fluid → hemolymphLoss → death (Phase 8B)
- Hydrostatic shock (Phase 27): irrelevant (punches are low-velocity vs. threshold); knockback pushes insect
- Gap remaining: insect venom, chemical defence not modelled

### Knight versus fire-breathing dragon (Phase 17 + Phase 28 + Phase 29)
- Knight: KNIGHT_INFANTRY archetype + arm_plate armour (resist_J = 800)
- Dragon: custom entity with DRAGON_FIRE_BREATH capability (Phase 28)
- Fire cone: 60° half-angle, 10m range, 800 J/tick × 20 ticks = 16 kJ per breath
- Plate armour absorbs 800 J (Phase 11C energy channel); remaining heat causes internal damage
- Phase 29 thermoregulation: metal plate provides insulation_m2KW ≈ 0.02 → rapid core heating
- Knight counter: longsword (Phase 17 MEDIEVAL_MELEE) at reach 0.85m; dragon must be at melee range to use breath
- Physically plausible: sustained fire breath would overheat a plated knight in ~30–60 s
- Gap remaining: dragon flight (locomotion), tail sweep, claw attacks need standard archetype definition

### Hunger and starvation (Phase 30)
- Full metabolic demand model with Kleiber's law BMR
- Staged hunger: sated → hungry (12h) → starving (24h) → critical (72h)
- Mass loss, strength loss, morale decay all physics-derived

### Hypothermia and hyperthermia (Phase 29)
- Core temperature modelled via heat balance equation
- Staged impairment: mild → moderate → severe → critical
- Armour insulation values determine survival time in cold/heat
- Diver in 4°C water: ~30–45 min (matches empirical dive medicine data)
- Knight in blizzard without insulation: ~20–40 min (matches historical cases)

**Test suite**: 1,343 tests passing. Coverage: statements 97.15%, branches 85.99%, functions 96.07%, lines 97.15%.

---

## Phase 31 — Species & Race System *(COMPLETE)*

### Overview

Data-driven species registry. `SpeciesDefinition` bundles every species-specific property
(archetype, body plan, innate traits, capabilities, natural weapons, physiological overrides,
skill aptitudes) into one declarative record. `generateSpeciesIndividual` produces a
ready-to-use entity spec from it. Three existing simulation modules gained optional overrides
(`coldBlooded`, `bmrMultiplier`, `naturalInsulation_m2KW`) that affect thermoregulation and
nutrition for non-human physiology.

### Files

| File | Description |
|------|-------------|
| `src/species.ts` | Types + 14 species + `generateSpeciesIndividual` |
| `src/sim/entity.ts` | `physiology?: SpeciesPhysiology` field on Entity |
| `src/sim/thermoregulation.ts` | `naturalInsulation_m2KW` added to insulation sum |
| `src/sim/nutrition.ts` | `bmrMultiplier` applied to computed BMR |
| `src/sim/kernel.ts` | Skip thermoregulation for `coldBlooded` entities |
| `test/species.test.ts` | 30 tests |

### 14 species

| Group | Species |
|-------|---------|
| Fantasy humanoids (7) | elf, dwarf, halfling, orc, ogre, goblin, troll |
| Sci-fi humanoids (3) | vulcan, klingon, romulan |
| Mythological (3) | dragon (AVIAN_PLAN, fire breath), centaur (CENTAUR_PLAN), satyr |
| Fictional (1) | heechee |

---

## Phase 32 — Deferred Systems: Gap Resolution *(COMPLETE)*

### Overview

Collects deferred items from earlier phases that were explicitly noted as out-of-scope at the
time. Implementing them together closes the most significant simulation realism gaps without
retroactively bloating earlier phases.

---

### 32A — Locomotion Modes (flight, swimming, climbing)

**Gap addressed:** dragon flight (Phase 28), aquatic combat (Phase 2A).

Every entity currently moves on a 2D ground plane with optional elevation. Phase 32A adds
first-class locomotion *modes* with distinct physics.

```typescript
type LocomotionMode = "ground" | "flight" | "swim" | "climb";

interface LocomotionCapacity {
  mode:         LocomotionMode;
  maxSpeed_mps: number;   // [SCALE.mps]
  costMul:      Q;        // peakPower cost multiplier per unit distance
  cruiseAlt_m?: number;   // flight altitude maintained [SCALE.m]
}
```

`IndividualAttributes` gains `locomotionModes?: LocomotionCapacity[]`; absent = ground-only
(backward-compatible). `stepMovement` checks `entity.intent.locomotionMode` against declared
capacities. Aerially mobile entities are exempt from traction lookup; an altitude-dependent
wind-drag penalty applies. Flying entities cannot be melee-targeted unless the attacker also
flies or has reach ≥ altitude differential. Aquatic entities use hydrodynamic drag instead of
traction; entities without `"swim"` capacity lose `canAct` when depth exceeds stature.

**Tests (~20):** flight max speed respected; non-flier cannot select flight mode; dragon at
10 m altitude out of human melee reach; aquatic entity stamina drain matches hydrodynamic load.

---

### 32B — Multi-Limb Granularity

**Gap addressed:** octopus 8 arms treated as one force pool (Phase 2A + Phase 8B).

```typescript
interface LimbState {
  segmentId:   string;  // references BodySegment
  gripQ:       Q;
  engagedWith: number;  // entity id (0 = free)
  fatigueJ:    number;
}
```

`Entity.limbStates?: LimbState[]` populated for body plans with `limbGroup: true` segments.
Grapple resolution distributes force across active limbs; severed or highly damaged limbs are
excluded. Limb fatigue accumulates independently at `peakForce_N / limbCount` per active limb.

**Tests (~16):** octopus with 2 severed arms → reduced grapple score; fatigue isolated per limb;
entity without limbStates unchanged (backward-compatible).

---

### 32C — Venom & Chemical Injection

**Gap addressed:** insect venom, chemical defence (Phase 8B).

```typescript
interface VenomProfile {
  id:           string;
  onsetDelay_s: number;  // seconds before first damage tick
  damageRate_Q: Q;       // per-second internal damage as Q of max internal health
  fearRate_Q:   Q;       // per-second fear increment while symptomatic
  duration_s:   number;  // total duration without antidote
  antidoteId?:  string;  // consumable item id
}
```

`Entity.activeVenoms?: { profile: VenomProfile; elapsedSeconds: number }[]`

`stepToxicology` ticks active venoms each second (1 Hz, same cadence as nutrition), applies
internal damage and fear, removes entries past `duration_s`. Antidote consumption clears the
matching entry.

**Tests (~14):** onset delay respected; damage accumulates correctly; antidote clears entry;
entity with no active venoms unaffected; fear increment during symptomatic period.

---

### 32D — Phase 5 Deferred Enhancements

All items from the **Phase 5 enhancements (deferred)** section, implemented together:

1. **Caliber-based suppression fear** — `suppressionFearMul: Q` on `RangedWeapon`; stored on
   `condition` and multiplied in `stepMoraleForEntity`.
2. **Fear memory / diminishing returns** — `condition.recentAllyDeaths` + `lastAllyDeathTick`;
   subsequent deaths in the same 5-second window scale by `max(0.4, 1.0 − 0.15 × priorDeaths)`.
3. **Leader / standard-bearer auras** — `TRAIT_LEADER` and `TRAIT_STANDARD_BEARER` apply
   per-tick fear decay (~q(0.015) / q(0.010)) for allies within 20 m.
4. **Panic action variety** — routing entities may freeze or surrender based on seeded roll
   weighted by `distressTolerance`; `captive` flag added to `ConditionState`.
5. **Rally mechanic** — `condition.rallyCooldownTicks` suppresses aggression briefly after
   fear drops below routing threshold.
6. **Archetype fear response** — `fearResponse: "flight" | "freeze" | "berserk"` on
   `IndividualAttributes`; undead/automata → "berserk"; animals → "flight".

**Tests (~22):** one test per enhancement + boundary cases + determinism.

---

### 32E — Phase 6 Remaining Items

- **Choke points** — frontage cap: maximum entity count through a corridor derived from
  `ObstacleGrid` geometry; excess entities queue.
- **Formation cohesion bonus** — `formationAllyCount` argument to `fearDecayPerTick`.
- **Replay recording** — deterministic event log sufficient to reconstruct any tick;
  `ReplayRecorder` and `replayFromLog`.
- **Performance benchmarking harness** — entities-per-tick at 20 Hz wall-clock budget.

---

## Phase 33 — Multiple Intelligences: Attribute Architecture *(COMPLETE)*

### Overview

Howard Gardner's theory of Multiple Intelligences (1983, revised 2011) identifies nine
relatively independent cognitive domains. Ananke adopts these as first-class attributes,
extended with a tenth — **inter-species intelligence** — relevant to the system's xenobiology
and cross-species modelling goals.

Each intelligence is Q-coded (0–1 scale). Like all Ananke attributes they derive from
physiology and experience — not game-design abstractions. A gorilla has extreme bodily-
kinesthetic and naturalist intelligence but near-zero linguistic. A Vulcan has extreme
logical-mathematical and intrapersonal. A dragon has extreme spatial and intrapersonal. A
heechee has extreme logical-mathematical and inter-species.

Intelligences **multiply and modulate** existing physical outcomes. They do not replace them.
A strong, dexterous entity with low bodily-kinesthetic intelligence is clumsy with precision
tasks despite raw physical capability.

---

### New type: `CognitiveProfile`

```typescript
/** Phase 33: Gardner's multiple intelligences + inter-species, all Q-coded. */
export interface CognitiveProfile {
  /** Language, argument complexity, written/spoken command clarity. */
  linguistic:          Q;
  /** Deductive reasoning, planning horizon, pattern abstraction. */
  logicalMathematical: Q;
  /** 3D world modelling, navigation, cover identification, targeting lead. */
  spatial:             Q;
  /** Proprioception, fine motor precision, tool mastery. */
  bodilyKinesthetic:   Q;
  /** Rhythm, acoustic pattern recognition, sound cue detection. */
  musical:             Q;
  /** Social reading, empathy, leadership radius, teaching quality. */
  interpersonal:       Q;
  /** Self-regulation, focus maintenance, willpower, fear resistance. */
  intrapersonal:       Q;
  /** Pattern recognition in living systems, tracking, herbalism, taming. */
  naturalist:          Q;
  /** Empathy across species boundaries; reading non-human intent. */
  interSpecies:        Q;
}
```

`IndividualAttributes` gains `cognition: CognitiveProfile`. The existing `attentionDepth_Q`
and `learningRate` become aliases for `logicalMathematical` and
`(logicalMathematical + intrapersonal) / 2` respectively (backward-compatible).

---

### Default cognitive profiles by species

| Species / archetype | Ling | Log | Spat | BK  | Mus | IPerso | Intra | Nat | IS  |
|---------------------|------|-----|------|-----|-----|--------|-------|-----|-----|
| HUMAN_BASE          | 0.65 | 0.60| 0.60 |0.60 |0.50 | 0.60   | 0.55  |0.50 |0.35 |
| ELF                 | 0.80 | 0.72| 0.80 |0.75 |0.85 | 0.70   | 0.75  |0.78 |0.60 |
| DWARF               | 0.55 | 0.75| 0.65 |0.90 |0.55 | 0.50   | 0.65  |0.45 |0.25 |
| HALFLING            | 0.70 | 0.55| 0.65 |0.80 |0.70 | 0.82   | 0.60  |0.65 |0.55 |
| ORC                 | 0.45 | 0.45| 0.55 |0.75 |0.55 | 0.50   | 0.40  |0.50 |0.30 |
| GOBLIN              | 0.50 | 0.60| 0.70 |0.75 |0.40 | 0.55   | 0.35  |0.60 |0.40 |
| TROLL               | 0.20 | 0.20| 0.35 |0.60 |0.15 | 0.25   | 0.20  |0.55 |0.20 |
| VULCAN              | 0.80 | 0.95| 0.85 |0.70 |0.65 | 0.50   | 0.95  |0.70 |0.65 |
| KLINGON             | 0.60 | 0.55| 0.65 |0.80 |0.70 | 0.65   | 0.50  |0.60 |0.30 |
| ROMULAN             | 0.75 | 0.80| 0.75 |0.65 |0.55 | 0.75   | 0.80  |0.55 |0.45 |
| DRAGON              | 0.50 | 0.75| 0.95 |0.80 |0.40 | 0.40   | 0.90  |0.80 |0.55 |
| CENTAUR             | 0.55 | 0.60| 0.80 |0.85 |0.65 | 0.65   | 0.60  |0.85 |0.55 |
| SATYR               | 0.60 | 0.50| 0.60 |0.80 |0.95 | 0.75   | 0.55  |0.72 |0.60 |
| HEECHEE             | 0.40 | 0.95| 0.90 |0.55 |0.30 | 0.45   | 0.85  |0.65 |0.90 |
| LARGE_PACIFIC_OCT.  | 0.05 | 0.70| 0.90 |0.95 |0.25 | 0.40   | 0.65  |0.80 |0.50 |
| SERVICE_ROBOT       | 0.60 | 0.90| 0.80 |0.85 |0.10 | 0.10   | 0.30  |0.10 |0.15 |

---

### Engine wiring (Phase 33)

| Intelligence | Existing attribute / system | Effect |
|---|---|---|
| `spatial` | Phase 4 threat horizon (`attentionDepth_Q`) | Horizon scales with spatial |
| `bodilyKinesthetic` | `fineControl` | `fineControl = max(rawFineControl, BK × q(0.80))` |
| `interpersonal` | Phase 5 leader aura radius | Aura radius scales with interpersonal |
| `intrapersonal` | `distressTolerance` | Adds `intrapersonal × q(0.30)` to fear resistance |
| `linguistic` | Phase 23 persuade base | Base `q(0.40)` → `q(0.20 + 0.30 × linguistic)` |
| `logicalMathematical` | Phase 4 decision latency | `latency × (1.20 − 0.40 × logicalMath)` |
| `musical` | Phase 5 suppression (Phase 39) | Acoustic clarity reduces panic from unfamiliar sounds |
| `naturalist` | Tracking / foraging (Phase 35) | Direct multiplier on quality |
| `interSpecies` | Phase 23 dialogue vs non-humans (Phase 36) | New modifier |

---

### Files

| File | Change |
|------|--------|
| `src/types.ts` | Add `CognitiveProfile`; add `cognition?: CognitiveProfile` to `IndividualAttributes` |
| `src/archetypes.ts` | Add default `cognition` block to each archetype |
| `src/species.ts` | Override `cognition` in species definitions |
| `src/sim/kernel.ts` | Wire spatial → attention, logicalMath → latency, interpersonal → aura |
| `test/cognition.test.ts` | ~24 tests |

### Tests (~24)

- **Type integrity (4):** all 9+1 fields present; values in [0, SCALE.Q]; archetype blocks
  non-null; species override merges with archetype default correctly.
- **Spatial wiring (4):** spatial q(0.90) → larger threat horizon than q(0.40); spatial q(0)
  → minimum horizon; deterministic; backward-compatible when `cognition` absent.
- **Logical-Mathematical wiring (4):** high value reduces decision latency; low increases it;
  clamped to sensible bounds; deterministic.
- **Interpersonal wiring (4):** high value extends leader aura radius; entity without
  TRAIT_LEADER unaffected; deterministic.
- **Intrapersonal wiring (4):** high value adds to fear resistance; clamped to [0, SCALE.Q];
  deterministic.
- **Linguistic wiring (4):** persuade success rate shifts with linguistic; troll has much
  lower persuade chance than vulcan; deterministic; backward-compatible.

---

## Phase 34 — Bodily-Kinesthetic & Spatial Intelligence (Non-Combat Applications) *(COMPLETE)*

### Overview

Bodily-kinesthetic intelligence governs *physical precision in directed tasks*: crafting,
surgery, instrument building, acrobatics. In combat `fineControl` already captures most of
this; Phase 34 extends it into non-combat outputs. Spatial intelligence governs *mental
modelling of 3D space* and extends into navigation, pathfinding quality, and architectural
planning.

---

### Crafting quality model

```typescript
export interface CraftingSpec {
  outputId:       string;
  toolCategory?:  "bladed" | "blunt" | "needlework" | "forge" | "precision";
  baseTime_s:     number;  // base seconds for BK q(0.50) entity
  materialQ:      Q;       // raw material quality 0–1
  minBKQ:         Q;       // minimum BK to attempt
}

export interface CraftingOutcome {
  quality_Q:      Q;
  timeTaken_s:    number;
  success:        boolean;
  descriptor:     "masterwork" | "fine" | "adequate" | "poor" | "ruined";
}

export function resolveCrafting(entity: Entity, spec: CraftingSpec, seed: number): CraftingOutcome;
```

`quality_Q = materialQ × bodilyKinesthetic × skillBonus × toolBonus`
`timeTaken_s = baseTime_s / bodilyKinesthetic`

---

### Surgical precision extension

`medical` skill already applies `treatmentRateMul`. Phase 34 adds a second multiplier:
`surgicalPrecisionMul = lerp(q(0.70), q(1.30), bodilyKinesthetic)` applied to complication
probability in downtime surgical procedures.

---

### Navigation and pathfinding

```typescript
export interface NavigationOutcome {
  routeEfficiency: Q;     // 1.0 = optimal; lower = detours taken
  timeLost_s:      number;
}

export function resolveNavigation(entity: Entity, spec: NavigationSpec, seed: number): NavigationOutcome;
```

`routeEfficiency = clamp(spatial × mapBonus, q(0.50), q(1.0))`

---

### Files

| File | Description |
|------|-------------|
| `src/competence/crafting.ts` | `CraftingSpec`, `CraftingOutcome`, `resolveCrafting` |
| `src/competence/navigation.ts` | `NavigationSpec`, `NavigationOutcome`, `resolveNavigation` |
| `src/competence/index.ts` | Re-exports all competence modules |
| `test/crafting.test.ts` | ~18 tests |
| `test/navigation.test.ts` | ~12 tests |

---

## Phase 35 — Naturalist Intelligence & Animal Handling *(COMPLETE)*

### Overview

Naturalist intelligence ("the ability to recognise patterns in living organisms and the
natural world") grounds tracking, foraging, herbalism, and animal taming into the same
Q-based resolution model used for crafting and navigation.

---

### Tracking

```typescript
export interface TrackingSpec {
  trackAge_s:    number;   // seconds since quarry passed
  terrain:       "ideal" | "rain" | "urban" | "deep_water";
  quarrySpecies: string;
}

export interface TrackingOutcome {
  confidence_Q:  Q;        // above q(0.60) = reliable direction
  trackRange_m:  number;   // max range at which entity can follow this track
}
```

`confidence_Q = naturalist × ageMul × terrainMul × speciesMul`

Entities with `speciesAffinity` containing the quarry species gain +q(0.15) confidence.

---

### Foraging and herbalism

```typescript
export interface ForagingOutcome {
  itemsFound:      number;  // items per hour of searching
  herbQuality_Q:   Q;       // quality of medicinal plants found
  misidentified:   boolean; // poisonous plant mistaken for edible
}
```

`P_misidentified = max(0, 0.30 − naturalist × 0.40)` — troll misidentifies ~30%; Elf with
naturalist 0.78 → ~1%.

---

### Animal handling and taming

```typescript
export interface TamingOutcome {
  trust_Q:   Q;       // 0 = hostile → 1 = fully tamed
  attacked:  boolean; // animal attacked handler this session
}
```

`trust_Q = clamp(naturalist × interSpecies × effortFactor − animalFearQ × 0.50, 0, 1)`

Full taming (trust_Q ≥ q(0.90)) makes the animal available as an ally entity in the kernel.

---

### Files

| File | Description |
|------|-------------|
| `src/competence/naturalist.ts` | Tracking, foraging, taming resolvers |
| `test/naturalist.test.ts` | 25 tests |

---

## Phase 36 — Inter-Species Intelligence & Xenodiplomacy *(COMPLETE)*

### Overview

Inter-species intelligence is Ananke's addition to Gardner's original eight. It models the
ability of an entity to understand, read, and communicate with minds operating on
fundamentally different cognitive and sensory substrates.

Relevant contexts: fantasy druids and rangers; sci-fi first contact; war elephant mahouts;
horse archers reading mount intent mid-gallop; xenobiology research.

---

### Species affinity

```typescript
export interface InterSpeciesProfile {
  empathy_Q:       Q;
  speciesAffinity: string[];       // species ids with deep familiarity
  signalVocab:     Map<string, Q>; // species id → comprehension quality
}
```

---

### Cross-species dialogue extension

Phase 23's `DialogueAction` gains:

```typescript
| { kind: "signal"; targetSpecies: string; intent: "calm" | "submit" | "ally" | "territory" }
```

`P_success = empathy_Q × signalVocab.get(targetSpecies) × (1 − animalFearQ × 0.60)`

---

### Unfamiliar-species latency penalty

When deciding against an opponent whose species is not in `speciesAffinity`:

```
latencyPenalty_s = (1.0 − interSpecies) × 0.080  // up to +80 ms
```

A human fighter facing a dragon for the first time reacts measurably slower than one who
has studied dragon physiology.

---

### Files

| File | Description |
|------|-------------|
| `src/competence/interspecies.ts` | `InterSpeciesProfile`, signal resolution, latency modifier |
| `src/dialogue.ts` | Add `signal` action variant |
| `src/types.ts` | Add `speciesAffinity` and `signalVocab` to `CognitiveProfile` |
| `test/interspecies.test.ts` | 23 tests |

---

## Phase 37 — Linguistic & Interpersonal Intelligence *(COMPLETE)*

### Overview

Linguistic intelligence governs command clarity, multilingual competence, persuasive argument
structure, and written record quality. Interpersonal intelligence governs social reading:
detecting deception, understanding emotional state, teaching effectively, and wielding
authority at range.

---

### Language capacity

```typescript
export interface LanguageCapacity {
  languageId: string;  // e.g. "common", "elvish", "klingonese", "dolphin_click"
  fluency_Q:  Q;       // q(1.0) = native; q(0.50) = conversational; q(0.20) = survival
}
```

`Entity.languages?: LanguageCapacity[]`

When entities with different native languages interact in Phase 23 dialogue, success rates
are multiplied by `min(initiator.fluency(targetLang), target.fluency(initiatorLang))`. A
troll (linguistic 0.20) arguing a complex treaty in Elvish at conversational fluency q(0.30)
suffers a compounded penalty.

---

### Battle command clarity

```typescript
export interface CommandTransmission {
  receptionRate_Q:         Q;   // fraction of formation receiving correctly
  transmissionDelay_ticks: number;
}

export function resolveCommandTransmission(
  commander:     Entity,
  formationSize: number,
): CommandTransmission;
```

`receptionRate_Q = linguistic × formationBonus(formationSize)`
`transmissionDelay_ticks = ceil(formationSize / (linguistic × 20))`

Troll warlord (0.20) + 40 troops → ~30% reception. Vulcan captain (0.80) → ~90%, faster.

---

### Teaching and skill transfer (extends Phase 21)

```typescript
export function resolveTeaching(
  teacher: Entity,
  learner: Entity,
  domain:  SkillId,
  hours:   number,
): { xpGained: number; teacherFatigueJ: number };
```

`xpGained = hours × BASE_XP_RATE × interpersonal(teacher) × learningRate(learner)`

---

### Deception detection (extends Phase 23)

```
P_detect = clamp(
  target.attentionDepth_Q × 0.50 + target.interpersonal_Q × 0.50 − source.plausibility_Q,
  0, 1)
```

---

### Files

| File | Description |
|------|-------------|
| `src/competence/language.ts` | `LanguageCapacity`, `resolveCommandTransmission`, `computeCommandRange_m` |
| `src/competence/teaching.ts` | `resolveTeaching`, `computeDeceptionDetectionProbability` |
| `src/types.ts` | Add `LanguageCapacity` interface, `languages` to `IndividualAttributes` |
| `src/dialogue.ts` | Update `deceive` with interpersonal defence factor |
| `test/language.test.ts` | 16 tests |
| `test/teaching.test.ts` | 14 tests |

---

## Phase 38 — Logical-Mathematical & Intrapersonal Intelligence *(COMPLETE)*

### Overview

Logical-mathematical intelligence governs systematic reasoning applied to complex external
problems: tactical analysis, engineering, research, resource planning. Intrapersonal
intelligence governs internal management: willpower, sustained focus, emotional self-
regulation, and the mental stamina required for cognitively demanding tasks.

---

### Willpower reserve

Analogous to Phase 2B's `reserveEnergy_J` for physical stamina.

```typescript
export interface WillpowerState {
  current_J: number;  // same unit as energy_J
  max_J:     number;  // intrapersonal × SCALE_WILLPOWER_J (= 50_000)
}
```

`Entity.willpower?: WillpowerState`

Phase 12B concentration auras deduct from `willpower.current_J`; when depleted the aura
collapses. Replenishment: q(0.10) of max per hour of rest.

---

### Engineering quality

```typescript
export interface EngineeringSpec {
  category:     "fortification" | "mechanism" | "weapon" | "vessel";
  complexity_Q: Q;
  timeBudget_h: number;
}

export interface EngineeringOutcome {
  qualityMul: Q;       // multiplier on structural integrity / resist_J
  latentFlaw: boolean; // probability inversely scales with logicalMath
}
```

`qualityMul = logicalMath × (1 − complexity_Q × 0.30) × timeFactor`
`P_latentFlaw = max(0, complexity_Q − logicalMath) × 0.40`

Troll building complex siege engine → 48% chance of latent flaw. Heechee → 0%.

---

### Files

| File | Description |
|------|-------------|
| `src/competence/willpower.ts` | `WillpowerState`, `stepWillpower`, drain/replenishment |
| `src/competence/engineering.ts` | `EngineeringSpec/Outcome`, `resolveEngineering` |
| `src/sim/kernel.ts` | Deduct willpower on concentration aura ticks |
| `src/downtime.ts` | Replenish willpower during rest |
| `test/willpower.test.ts` | ~16 tests |
| `test/engineering.test.ts` | ~14 tests |

---

## Phase 39 — Musical Intelligence & Acoustic Systems *(COMPLETE)*

### Overview

Musical intelligence in Ananke is primarily about *cognition in the time-acoustic domain*:
recognition of rhythmic patterns, sound cue detection, formation signal interpretation, and
the use of sound as a vector for morale and coordination. Every historical army marched to
drums; every naval tradition used signal horns; every ambush relied on listening.

---

### Acoustic signature and detection

```typescript
export function deriveAcousticSignature(entity: Entity): AcousticSignature;

export function detectAcousticSignature(
  listener: Entity,
  source:   Entity,
  dist_m:   number,
): Q;  // detection confidence 0–1
```

`detection_Q = clamp(sourceNoise / dist_m × listener.musical × SCALE_ACOUSTIC, 0, 1)`

Extends the existing `stealth` skill: stealth reduces `sourceNoise`; musical intelligence
increases receiver sensitivity. Both matter.

---

### Formation signals: drums and horns

```typescript
export type FormationSignal =
  | "advance" | "retreat" | "hold" | "flank_left" | "flank_right" | "rally";

export function resolveFormationSignal(
  signaller: Entity,
  signal:    FormationSignal,
  listener:  Entity,
  dist_m:    number,
): { clarity_Q: Q; received: boolean };
```

`clarity_Q = musical(signaller) × musical(listener) × rangeFactor(dist_m)`

Satyr signaller (0.95) → Elf listeners (0.85) → near-perfect reception at long range.
Troll → Troll → commands degrade rapidly beyond a few metres.

---

### Musical performance as morale vector

Performance generates a sustained morale aura scaled by `musical`, draining willpower
(Phase 38):

```typescript
export function resolvePerformance(
  performer: Entity,
  duration_s: number,
  allies:    Entity[],
): { fearDecayBonus: Q; willpowerDrained: number };
```

`fearDecayBonus = musical × q(0.020)` per tick per ally in range. Satyr bard
(`fearDecayBonus ≈ q(0.019)`) nearly matches a standard leader aura and stacks with it.

---

### Files

| File | Description |
|------|-------------|
| `src/competence/acoustic.ts` | Acoustic signature, detection, formation signal |
| `src/competence/performance.ts` | `resolvePerformance`, morale vector |
| `test/acoustic.test.ts` | ~16 tests |
| `test/performance.test.ts` | ~12 tests |

---

## Phase 40 — Non-Combat Competence Framework (COMPLETE)

### Overview

Phases 34–39 each introduce domain-specific competence resolvers. Phase 40 provides the
**unified framework** that:

1. Defines canonical `CompetenceAction` / `CompetenceOutcome` types
2. Routes to the correct resolver based on `CompetenceDomain`
3. Integrates with Phase 21 progression (XP gain per competence use)
4. Provides a competence catalogue parallel to the weapons and food catalogues
5. Enables host applications to declare competence challenges the same way Phase 20 Arena
   declares combat scenarios

---

### Core types

```typescript
export type CompetenceDomain =
  | "linguistic" | "logicalMathematical" | "spatial" | "bodilyKinesthetic"
  | "musical"    | "interpersonal"       | "intrapersonal"
  | "naturalist" | "interSpecies";

export interface CompetenceAction {
  domain:          CompetenceDomain;
  taskId:          string;           // references CompetenceCatalogue
  targetEntityId?: number;           // for interpersonal / inter-species tasks
  toolId?:         string;           // equipment item used
  timeAvailable_s: number;
  seed:            number;
}

export interface CompetenceOutcome {
  domain:          CompetenceDomain;
  quality_Q:       Q;
  timeTaken_s:     number;
  success:         boolean;
  descriptor:      "exceptional" | "good" | "adequate" | "poor" | "failure";
  xpGained:        number;           // fed into Phase 21 awardXP
  narrativeLine?:  string;
}

export function resolveCompetence(
  actor:  Entity,
  action: CompetenceAction,
  world:  WorldState,
): CompetenceOutcome;
```

---

### Competence catalogue (sample)

| taskId | domain | difficulty_Q | timeBase_s | notes |
|--------|--------|--------------|------------|-------|
| `craft_sword_basic` | bodilyKinesthetic | q(0.40) | 14 400 | 4 h, forge required |
| `craft_sword_master` | bodilyKinesthetic | q(0.85) | 28 800 | 8 h |
| `navigate_wilderness` | spatial | q(0.50) | — | per-hour efficiency |
| `track_quarry_fresh` | naturalist | q(0.30) | — | confidence output |
| `tame_horse` | naturalist + interSpecies | q(0.40) | 7 200 | trust accumulation |
| `treat_wound_field` | bodilyKinesthetic | q(0.50) | 300 | extends Phase 19 |
| `teach_swordsmanship` | interpersonal | q(0.45) | 3 600 | XP multiplier for learner |
| `negotiate_treaty` | linguistic + interpersonal | q(0.70) | 1 800 | Phase 23 extension |
| `design_fortification` | logicalMathematical | q(0.60) | 86 400 | 1-day planning |
| `compose_march` | musical | q(0.35) | 1 800 | morale aura enabler |
| `identify_herb` | naturalist | q(0.25) | 60 | herbalism yield |
| `signal_alien_species` | interSpecies | q(0.60) | — | first-contact attempt |

---

### Integration with Phase 21

`resolveCompetence` returns `xpGained`; the host calls
`awardXP(state, domain, xpGained, tick)`. Domain names map directly (e.g. `"naturalist"` XP
improves naturalist progression, which on milestone increases `cognition.naturalist`).

---

### Files

| File | Description |
|------|-------------|
| `src/competence/index.ts` | Unified `resolveCompetence` router |
| `src/competence/catalogue.ts` | `COMPETENCE_CATALOGUE: readonly CompetenceTask[]` |
| `test/competence.test.ts` | ~24 tests |

### Tests (~24)

- **Routing (9):** each domain routes to correct resolver; unknown taskId → failure; missing
  required tool degrades quality.
- **XP integration (5):** xpGained > 0 on success; = 0 on failure; exceptional > adequate
  XP; deterministic; feeds Phase 21 milestone correctly.
- **Catalogue integrity (5):** all entries have valid domain and difficulty in range; taskId
  unique; no undefined fields.
- **Narrative (5):** exceptional → "exceptional" descriptor; failure → "failure"; narrativeLine
  present when requested; terse vs. verbose mode differs in length.

---

## Outstanding Gaps & Research Items

Acknowledged gaps not yet assigned to a phase, collected from simulation calibration notes
and Physics Realism Summary entries.

### Sensory systems beyond vision and hearing

- Current: `visionRange_m`, `hearingRange_m` as scalar attributes.
- Missing: field-of-view arc limits (beyond `visionArcDeg` stub), twilight/darkness penalties,
  olfaction (scent-based tracking without the Naturalist system), echolocation (bats, cetaceans,
  shrews), electroreception (sharks, eels, platypus).
- Stealth is currently only acoustic; visual stealth is binary (in-range / out-of-range).

### Systemic toxicology (beyond Phase 32C wound-injection venom)

- Ingested systemic toxins: alcohol, sedatives, plant alkaloids — differing onset and
  duration from injected venom.
- Cumulative exposure: heavy metals, radiation beyond Phase 10 single-event hazard.
- Withdrawal states modifying performance attributes over days.

### Entity-level social network

- Phase 24 models faction-to-faction standing; missing: individual-to-individual relationship
  graph (friendship, rivalry, debt, family bonds).
- These would modify morale, teaching rate, betrayal probability, and Phase 23 dialogue.
  Relevant for long-form campaign simulation.

### Weather and atmospheric environment

- Wind: vector field affecting projectile dispersion (Phase 3), acoustic signal propagation
  (Phase 39), and flame cone shape (Phase 28).
- Precipitation: traction reduction compounding on terrain, visibility reduction, acoustic
  noise masking stealth.
- Fog: hard visual range cap.
- All interact with existing Phase 10, 27, 28, 29, 37, and 39 systems.

### Wound aging and long-term sequelae (extends Phase 21)

- Current: `fracture_malunion`, `nerve_damage`, `scar_tissue` derived at injury time.
- Missing: sequelae emerging over weeks/months — chronic fatigue, altered fear response
  (PTSD-equivalent), phantom pain, recurring infection risk.
- Relevant for multi-year campaign simulation.

### Collective non-combat activities — **RESOLVED in Phase 55**

See Phase 55 entry in the phase log above.

**Test suite**: 2,646 tests passing. Coverage: statements 95.57%, branches 84.64%, functions 92.35%, lines 95.57%.

---

## Phase 41 — Quest & Mission System (COMPLETE)

### Overview

Building on Phase 22 (Campaign) and Phase 40 (Competence), Phase 41 introduces a structured quest system that tracks objectives, progression states, and branching outcomes. This transforms the simulation from pure sandbox into an RPG-like experience with meaningful goals.

### Core concepts

**Quest as state machine**: Each quest is a directed graph of objectives with entry conditions, completion criteria, and exit transitions.

```typescript
export interface Quest {
  questId: string;
  title: string;
  description: string;
  giverId?: number;              // NPC who gave the quest
  objectives: QuestObjective[];
  state: "inactive" | "active" | "completed" | "failed";
  priority: number;              // For sorting/selection when multiple available
}

export interface QuestObjective {
  objectiveId: string;
  description: string;
  type: QuestObjectiveType;
  target?: {                     // What to interact with
    entityId?: number;
    location?: { x: number; y: number; radius_m: number };
    itemId?: string;
  };
  count?: number;                // For "collect X" or "defeat Y"
  progress: number;              // Current count
  state: "locked" | "available" | "in_progress" | "completed" | "failed";
  hidden: boolean;               // Reveal only when previous objectives complete
}

export type QuestObjectiveType =
  | "reach_location"
  | "defeat_entity"
  | "collect_item"
  | "use_competence"             // Phase 40 integration
  | "deliver_item"
  | "escort_entity"
  | "dialogue_choice"
  | "wait_duration";             // Time-gated objectives
```

**Quest hooks from simulation events**: The quest system listens to kernel events and updates quest progress automatically.

```typescript
export interface QuestUpdateEvent {
  questId: string;
  objectiveId: string;
  oldState: ObjectiveState;
  newState: ObjectiveState;
  trigger: SimulationEvent;      // What caused the update
}
```

### Integration points

**Phase 40 Competence**: Objectives can require specific competence checks ("craft a masterwork sword", "negotiate peaceful resolution").

**Phase 24 Factions**: Quest availability depends on faction standing. Completing quests modifies reputation.

**Phase 23 Dialogue**: Quest-related dialogue options appear based on active quests. Choices can advance/fail objectives.

**Phase 22 Campaign**: Quests are the primary mechanism for campaign progression. World state stores active/completed quests per entity.

### Files

- `src/quest.ts` — Core quest definitions, state machine, and update logic
- `src/quest-generators.ts` — Procedural quest generation from world state
- `test/quest.test.ts` — Quest state transitions, integration with simulation events

---

## Phase 42 — Personal Relationship Graph (COMPLETE)

### Overview

Phase 24 provides faction-level reputation. Phase 42 adds individual-to-individual relationships — the social fabric that makes RPGs feel alive. Relationships affect morale, teaching effectiveness, betrayal probability, and dialogue options.

### Core types

```typescript
export interface Relationship {
  entityA: number;
  entityB: number;
  affinity_Q: Q;                 // -1.0 (hatred) to +1.0 (love)
  trust_Q: Q;                    // 0.0 to 1.0, separate from affinity
  history: RelationshipEvent[];  // Chronicle of interactions
}

export interface RelationshipEvent {
  tick: number;
  type: "met" | "fought_alongside" | "betrayed" | "saved" | "deceived" |
        "gift_given" | "insult" | "bonded" | "separated";
  magnitude_Q: Q;                // How much this affected the relationship
}

export type SocialBond =
  | "none"
  | "acquaintance"
  | "friend"
  | "close_friend"
  | "rival"
  | "enemy"
  | "mentor"
  | "student"
  | "family"
  | "romantic_partner";
```

### Relationship mechanics

**Affinity evolution**: Based on interaction history and personality compatibility (Phase 33 intrapersonal attributes).

**Trust vs affinity**: High affinity + low trust = friendly but won't watch your back in combat. High trust + low affinity = professional respect, works together but doesn't socialize.

**Betrayal detection**: When entity A harms entity B, check relationship. If affinity_Q > q(0.50), this is "betrayal" — larger relationship penalty and potential morale collapse for witnesses.

**Teaching effectiveness** (Phase 37): `resolveTeaching()` multiplier based on relationship affinity between teacher and learner.

**Morale effects** (Phase 5/33): Seeing a friend injured causes distress penalty proportional to affinity. Seeing an enemy fall provides morale bonus.

### Files

- `src/relationships.ts` — Relationship graph storage, affinity calculations, event logging
- `src/relationships-effects.ts` — Integration with morale, teaching, combat decisions
- `test/relationships.test.ts` — Relationship evolution, betrayal mechanics, morale integration

---

## Phase 43 — Deep Inventory & Encumbrance (COMPLETE)

### Overview

Equipment exists (Phase 8), but inventory management is currently shallow. Phase 43 provides a complete item system with containers, durability, weight-based encumbrance, and item interactions.

### Core types

```typescript
export interface Inventory {
  ownerId: number;
  containers: Container[];       // Multiple bags, pouches, etc.
  equipped: EquippedItems;
  encumbrance_Kg: number;
  maxEncumbrance_Kg: number;
}

export interface Container {
  containerId: string;
  name: string;
  capacity_Kg: number;
  volume_L: number;              // Optional: volume-based limits
  items: ItemInstance[];
}

export interface ItemInstance {
  instanceId: string;
  templateId: string;            // References equipment catalogue
  quantity: number;
  durability_Q?: Q;              // 1.0 = pristine, 0.0 = broken
  modifications?: ItemMod[];
  containerPath: string[];       // Which container(s) it's in
}

export interface ItemMod {
  type: "sharpened" | "reinforced" | "enchanted" | "damaged";
  effects: Partial<Weapon> | Partial<Armour>;
}
```

### Encumbrance system

**Weight categories**:
- Unencumbered: < 30% max — no penalties
- Light: 30-50% — fineControl penalty q(0.05)
- Medium: 50-75% — dodge/parry latency +20%, movement speed -10%
- Heavy: 75-100% — combat penalties, cannot sprint
- Overloaded: > 100% — cannot move without dropping items

**Max encumbrance**: Derived from `peakForce_N` — stronger characters carry more.

### Item durability

Weapons and armour accumulate wear:
- Parried heavy strikes: small durability loss
- Blocked with weapon: durability loss based on impact energy
- Armour penetration: durability loss proportional to absorbed damage

Broken items: Weapons deal reduced damage (qMul(quality, durability_Q)). Broken armour provides no protection.

### Integration

**Phase 40 Competence**: Repairing items requires crafting competence. Quality of repair restores durability proportionally.

**Phase 25 Economy**: Item durability affects value. Damaged goods sell for less. Repair services available at settlements.

### Files

- `src/inventory.ts` — Container management, encumbrance calculations
- `src/item-durability.ts` — Wear tracking, repair mechanics
- `test/inventory.test.ts` — Encumbrance penalties, container nesting, durability

---

## Phase 44 — Settlement & Base Building (COMPLETE)

### Overview

Persistent locations that can be constructed, upgraded, and populated. Settlements provide services (repair, medical, training), storage, and serve as quest hubs.

### Core types

```typescript
export interface Settlement {
  settlementId: string;
  name: string;
  position: { x: number; y: number };
  tier: 0 | 1 | 2 | 3 | 4;      // Camp → Hamlet → Village → Town → City

  // Facilities determine available services
  facilities: {
    forge: FacilityLevel;        // Item repair, crafting quality bonus
    medical: FacilityLevel;      // Max care level (Phase 19)
    market: FacilityLevel;       // Economy integration (Phase 25)
    barracks: FacilityLevel;     // Population cap, training speed
    temple: FacilityLevel;       // Morale restoration, ritual (Phase 40 collective)
  };

  population: number;
  populationCap: number;
  factionId?: number;            // Who controls this settlement

  // Storage
  sharedStorage?: Inventory;     // Guild/faction shared storage

  // Construction progress
  activeProjects: ConstructionProject[];
}

export interface ConstructionProject {
  projectId: string;
  targetFacility: string;
  targetLevel: number;
  requiredResources: Record<string, number>;  // material → quantity
  progress_Q: Q;                 // 0.0 to 1.0
  contributors: number[];        // Entity IDs contributing
}
```

### Settlement mechanics

**Population growth**: Based on food surplus (Phase 30), medical facility tier, and safety (no recent raids).

**Collective crafting** (from Outstanding Gaps): Multiple entities contribute to construction projects. Progress = Σ(competenceQuality × hoursWorked) / totalRequired.

**Services scaling**: Higher tier facilities unlock better equipment, higher-tier medical care, more quest variety.

**Siege vulnerability**: Settlements can be attacked. Defensive structures (walls, towers) modify combat terrain.

### Integration

**Phase 41 Quests**: Settlements generate procedural quests based on their needs ("bandits attacking our farms", "need ore for forge upgrade").

**Phase 42 Relationships**: Settlements serve as meeting points where relationships form.

**Phase 40 Competence**: Entities can "work" at settlement facilities, converting time + competence into facility progress.

### Files

- `src/settlement.ts` — Settlement state, population dynamics, construction
- `src/settlement-services.ts` — Service availability, pricing, quest generation
- `test/settlement.test.ts` — Population growth, construction progress, siege mechanics

---

## Phase 45 — Emergent Story Generation (COMPLETE)

### Overview

The simulation generates events. Phase 45 transforms those events into coherent narratives — chronicles, histories, and emergent stories that give meaning to the chaos of simulation.

### Core concepts

**Event significance scoring**: Not every punch matters. The system identifies significant events:
- Entity death (always significant)
- Relationship state changes (friend → enemy)
- Quest completion/failure
- Settlement tier upgrades
- First contact with new species
- Exceptional competence outcomes (masterwork crafting)

**Narrative templates**: Significant events are rendered through templates into prose.

```typescript
export interface ChronicleEntry {
  entryId: string;
  tick: number;
  significance: number;          // For filtering/summarizing
  eventType: string;
  actors: number[];              // Entity IDs involved
  template: string;              // Template key
  variables: Record<string, string | number>;
  rendered: string;              // Generated prose
}

export interface Chronicle {
  chronicleId: string;
  scope: "world" | "faction" | "settlement" | "entity";
  ownerId?: number;              // For entity/faction-specific chronicles
  entries: ChronicleEntry[];
}
```

**Emergent story arcs**: The system detects patterns across multiple events:
- "Rise of a hero": Entity survives multiple impossible odds, gains reputation
- "Tragic fall": Entity with high reputation commits betrayal
- "Rivalry": Two entities repeatedly fight, neither dying
- "Great migration": Population movement across regions

### Procedural narrative techniques

**Context-aware descriptions**: Use entity relationship data (Phase 42) to generate richer text:
- "Entity 5 killed Entity 3" → "Gorath slew his former friend Durnik in a fit of rage"

**Branching histories**: Major events create "story branches" where the narrative could have gone differently. For replay/debugging, show "what if" alternatives.

**Summarization**: Long chronicles can be summarized at different granularities:
- Full: Every significant event
- Chapter: Major arcs only
- Synopsis: One paragraph per major phase

### Integration

**Phase 41 Quests**: Quest completion generates chronicle entries. Quest givers reference past player deeds from chronicle.

**Phase 42 Relationships**: Relationship changes generate entries with emotional context.

**Phase 22 Campaign**: Campaign exports include world chronicle for persistence across sessions.

### Files

- `src/chronicle.ts` — Chronicle storage, significance scoring, templates
- `src/story-arcs.ts` — Pattern detection for emergent narratives
- `src/narrative-render.ts` — Template rendering, prose generation
- `test/chronicle.test.ts` — Significance scoring, arc detection, rendering

---

## Phase 46+ — Future Directions

Potential future phases building on the RPG foundation:

**Phase 46: Procedural World Generation (COMPLETE)** — Generate settlements, factions, and starting relationships procedurally from seed.

**Phase 47: Advanced AI Personalities *(COMPLETE)*** — `PersonalityTraits` (aggression/caution/loyalty/opportunism) modulate `decide.ts` on top of `AIPolicy` presets; 5 named presets; `derivePersonalityFromCognition()`; 27 tests.

**Phase 48: Multi-Party Dynamics (COMPLETE)** — Managing multiple adventuring parties, companion loyalty, inter-party conflict.

**Phase 49: Legacy & Inheritance (COMPLETE)** — Character death not ending campaign; heir inherits equipment, relationships partially transfer.

**Phase 50: Mythology & Legend (COMPLETE)** — Stories from chronicles become "legends" that NPCs reference, affecting their expectations and behaviour.

**Phase 51: Weather & Atmospheric Environment (COMPLETE)** — `WeatherState` (wind, precipitation, fog) flows through `KernelContext.weather`; `deriveWeatherModifiers` produces traction, vision, and thermal deltas applied each tick; `computeWindAimError` adds crosswind drift to ranged aim; `adjustConeRange` modulates breath weapons; 32 tests.

**Phase 52: Extended Sensory Systems (COMPLETE)** — `ExtendedSenses` on `Entity` enables echolocation (darkness-independent, noise-degraded), electroreception (bioelectric short-range, fails on dead targets), and olfaction (wind/precipitation-aware scent detection). `computeDaylightMul(hourOfDay)` → Q for time-of-day lighting. `canDetectExtended` wraps Phase 4 `canDetect` with all modalities. 30 tests.
**Phase 53: Systemic Toxicology — Ingested / Cumulative (COMPLETE)** — Extends Phase 32C (injection venom) and Phase 10 (pharmacokinetics) with ingested toxins (alcohol, sedative alkaloid, plant poison, heavy lead, radiation dose). Metabolic half-life decay, long-onset symptom timing (minutes vs. seconds for injected venom), motor/cognitive impairment modelled as fatigue and consciousness drain, signed fear modifiers (disinhibition vs. panic), cumulative irreversible dose accumulation for heavy metals and radiation (`CumulativeExposureRecord`), withdrawal states after sustained addictive use. `deriveCumulativeToxicity(entity)` sums chronic exposure for AI/combat queries. Stepped at 1 Hz alongside nutrition and Phase 32C venom. 33 tests.

**Phase 54: Wound Aging & Long-Term Sequelae (COMPLETE)** — Extends Phase 21 (injury) and Phase 9 (infection) with time-based wound progression for downtime / campaign simulation. `stepWoundAging(entity, elapsedSeconds)` → `WoundAgingResult`: uninfected regions heal surface (1%/day) and internal (0.5%/day) damage clamped to permanentDamage floor; infected regions worsen at 1.5%/day with sepsis detection at q(0.85) internalDamage; fractured regions with permanentDamage ≥ q(0.30) inject phantom-pain shock; sustained permanent damage above threshold drains chronic fatigue. `recordTraumaEvent` / `deriveFearThresholdMul` implement PTSD-like trauma with natural decay. `deriveSepsisRisk` aggregates infection severity for the medical AI. `TraumaState` added to `Entity`. 35 tests; 100% coverage.

**Phase 55: Collective Non-Combat Activities (COMPLETE)** — Three group-scale systems for downtime and logistics. **Siege Engineering**: `createCollectiveProject` / `contributeToCollectiveProject` maintain a shared `progress_Q` pool accumulating Σ(competence × hoursWorked / requiredWorkHours); `deriveEngineeringCompetence` averages `logicalMathematical + bodilyKinesthetic`; `isProjectComplete` detects crossing the threshold; `completedAtTick` stamped once. **Ritual & Ceremony**: `stepRitual(participants, elapsedSeconds)` → `{ moraleBonus_Q, fearReduction_Q }` using average `(intrapersonal + musical) / 2` per participant with sqrt(N) collective scaling (diminishing returns) and linear time ramp over `RITUAL_DURATION_s = 3600 s`; moraleBonus capped at `RITUAL_MAX_BONUS = q(0.30)`; fear reduction = 60% of morale bonus. **Trade Caravan Logistics**: `planCaravanRoute(waypoints, participants, inventory)` → `CaravanPlan`; route quality from best `logicalMathematical`; negotiation bonus from best `interpersonal`; speed factor ∈ [q(0.80), q(1.00)] shortens travel time; `supplySufficiency_Q` from ration count vs. travel-day demand. 35 tests; 100% statement/function/line coverage.

**Phase 56: Disease & Epidemic Simulation (COMPLETE)** — Entity-to-entity disease transmission layered above Phase 9 wound infection. `src/sim/disease.ts`: 6 disease profiles (common_fever, wound_fever, plague_pneumonic, dysentery, marsh_fever, wasting_sickness) with `transmissionRoute` ("airborne" | "contact" | "vector" | "waterborne"), daily fatigue drain, incubation/symptomatic phase timers, mortality roll via `eventSeed`, and graduated immunity (permanent / temporary / none). `exposeToDisease(entity, id)` adds incubating state if not immune; `stepDiseaseForEntity(entity, delta_s, worldSeed, tick)` → `EntityDiseaseResult` advances phase timers, drains fatigue, rolls mortality, grants immunity; `computeTransmissionRisk(carrier, target, dist_Sm, profile)` → Q — airborne: linear falloff to zero at `airborneRange_Sm`; contact/vector/waterborne: flat within `CONTACT_RANGE_Sm = 2 m`; returns q(0) for incubating carriers and immune/already-infected targets; `spreadDisease(entityMap, pairs, worldSeed, tick)` — deterministic batch transmission from host-supplied spatial pairs. `DiseaseState` and `ImmunityRecord` added to `Entity`. 37 tests; 100% statement/function/line coverage.

**Phase 57: Aging & Lifespan (COMPLETE)** — Species-agnostic attribute curves parameterized by normalized age fraction (`ageFrac = ageYears / lifespanYears`). `src/sim/aging.ts`: seven piecewise-linear Q multiplier dimensions — `muscularStrength` (peakForce/peakPower/continuousPower; peaks ageFrac ≈ 0.28), `reactionTime` (multiplier >q(1.0) = slower; best at ageFrac ≈ 0.28), `motorControl` (controlQuality/stability/fineControl), `stature` (stable adult, slight elder compression), `cognitionFluid` (logical/spatial/kinesthetic/musical; peaks ageFrac ≈ 0.28), `cognitionCrystal` (linguistic/interpersonal/intrapersonal; peaks ageFrac ≈ 0.55 — wisdom outlasts speed), `distressTolerance` (peaks middle age). `computeAgeFrac(ageYears, lifespanYears?)` → Q; `getAgePhase` → 7-stage string ("infant" through "ancient"); `deriveAgeMultipliers` → `AgeMultipliers`; `applyAgingToAttributes(base, ageYears, ...)` → new `IndividualAttributes` (immutable); `stepAging(entity, elapsedSeconds)` → increments `entity.age.ageSeconds`; `entityAgeYears` convenience helper. `AgeState` added to `Entity`. 38 tests; 100% coverage.

**Phase 58: Sleep & Circadian Rhythm (COMPLETE)** — Two-factor sleep model: `awakeSeconds` (continuous wake duration) and `sleepDebt_s` (cumulative shortfall, ½ s/s accrual beyond 16 h, capped at 72 h). `src/sim/sleep.ts`: `circadianAlertness(hourOfDay)` → Q piecewise-linear curve peaking at 17:00 (q(1.0)), nadir at 03:00 (q(0.30)); `deriveSleepDeprivationMuls(state)` → `SleepDeprivationMuls` — four multipliers linear from baseline to max at 72 h (`cognitionFluid` −45%, `reactionTime` +45% slower, `stability` −25%, `distressTolerance` −35%); impairment threshold at 17 h; effective driver = max(awakeSeconds, sleepDebt_s) so prior-night debt persists even after short sleep. `stepSleep(entity, elapsedSeconds, isSleeping)` — awake: accumulates both counters; sleep onset resets `awakeSeconds`, enters "light" phase, repays debt 1:1; NREM/REM cycle: light (45 min) → deep (25 min) → rem (20 min) → light. `applySleepToAttributes(base, state)` → new `IndividualAttributes` (immutable; same pattern as Phase 57). `entitySleepDebt_h(entity)` convenience helper. `SleepState` added to `Entity`. 39 tests; 96% statement coverage.

**Phase 59: Mounted Combat & Riding (COMPLETE)** — Physics-grounded rider/mount pair model. `src/sim/mount.ts`: 5 mount profiles (pony, horse, warhorse, camel, war_elephant) with mass, rider seat height, gait speeds (walk/trot/gallop/charge), stability, and fear threshold. `computeChargeBonus(profile, speed_Smps)` → `ChargeBonus { bonusEnergy_J, strikeMass_kg }` — `bonusEnergy_J = ½ × (mass × CHARGE_MASS_FRAC/8%) × v²` (horse at gallop ≈ 3500 J; elephant charge ≈ 7700 J). `deriveRiderHeightBonus(profile)` → Q — aim/accuracy bonus from elevation (q(0.12)/m, capped at q(0.30)). `deriveRiderStabilityBonus(profile)` → Q — 15% of mount stability transfers to rider. `computeFallEnergy_J(profile, riderMass_Skg)` → J — fall injury energy = m×g×h. `deriveMountFearPressure(mountShockQ, fearThreshold_Q)` → Q — 40% of excess shock propagates to rider when mount panics. `checkMountStep(riderShockQ, mountShockQ, mountDead, profile, riderMass_Skg)` → `MountStepResult { shouldDismount, dismountCause, fallEnergy_J, fearPressure_Q }` — evaluates rider_shock/mount_dead/mount_bolt triggers in priority order. `entityIsMounted` / `entityIsMount` convenience helpers. `MountState { mountId, riderId, gait }` added to `Entity`. 42 tests; clean build.

**Phase 60: Environmental Hazard Zones (COMPLETE)** — Persistent 2-D circular hazard zones that inflict per-second effects on entities within their radius. `src/sim/hazard.ts`: 5 hazard types (fire, radiation, toxic_gas, acid, extreme_cold) with base-effect profiles; 5 sample zones (CAMPFIRE 3 m/1 h, RADIATION_ZONE 50 m/permanent, MUSTARD_GAS 20 m/30 min, ACID_POOL 2 m/2 h, BLIZZARD_ZONE 100 m/6 h). Linear exposure falloff: `exposureQ = (radius − dist) × intensity / radius`. `computeDistToHazard` — Euclidean float√ truncated to integer. `isInsideHazard` — integer squared-distance comparison (no float). `computeHazardExposure(dist_Sm, hazard)` → Q ∈ [0, intensity_Q]. `deriveHazardEffect(hazard, exposureQ)` → `HazardEffect { fatigueInc_Q, thermalDelta_Q, radiationDose_Q, surfaceDamageInc_Q, diseaseExposureId? }` — each rate scaled by exposureQ/SCALE.Q; toxic_gas sets diseaseExposureId "marsh_fever"; extreme_cold produces negative thermalDelta (cooling). `stepHazardZone(hazard, elapsedSeconds)` — decrements duration, clamps to 0; permanent (-1) is a no-op. `isHazardExpired(hazard)` — duration ≥ 0 && duration === 0. No Entity field needed — hazards are world-level objects. 56 tests; clean build.

---

## Integration & Adoption Roadmap

The following items are not simulation phases but pre-production milestones for teams
evaluating or adopting Ananke as a game-engine foundation. They should be addressed
in the order below before committing to full-scale production.

---

### 1 · Confirm Fit for Purpose: Use-Case Validation **COMPLETE** (see Integration Milestone 1)

**Rigorously validate that a physics-first, deterministic simulation is the right
foundation for the intended player experience.**

Ananke's extreme depth is its defining feature, but it is overkill for many game types.
An action RPG or story-driven adventure likely does not need to simulate joule-based energy
expenditure or cavitation from high-velocity rounds. To validate the fit:

- **Create a Design Document Addendum.** Explicitly outline how Ananke's specific features
  (per-region injuries, stamina in watts, fear accumulation, Q-scaled attributes) will
  translate into tangible, fun player mechanics. If the translation is opaque or laboured,
  the fit may be wrong.

- **Build a "Vertical Slice" Prototype.** Implement a small-scale core gameplay loop
  (e.g., a 1v1 melee encounter) using the actual Ananke kernel. This is the ultimate
  test of whether simulation depth creates engaging gameplay or merely adds complexity
  without payoff. If the prototype feels bogged down, or the depth is invisible to the
  player, reconsider the architecture before sinking further resource.

**Decision gate:** Proceed to onboarding only if the vertical slice demonstrates that
physics fidelity meaningfully enhances the target experience.

---

### 2 · Deep Integration & Technical Onboarding **COMPLETE** (see Integration Milestone 2)

**Acknowledge the learning curve and commit to a structured evaluation spike.**

Integrating Ananke is not a plug-and-play endeavor. It requires a significant time
investment to understand its core systems, data structures (`Entity`, `BodyPlan`,
`InjuryState`, Q-scaled fixed-point arithmetic), and its deterministic, event-driven
output model. Before committing to full-scale development, conduct a 2–4 week spike:

- Trace the data flow of a simple melee attack from `Command` input through the kernel
  to injury output — including tick accumulation, `resolveHit`, and region selection.
- Build a minimal "observer" that reads `WorldState` after each `stepWorld` call and
  prints entity positions, condition, and injury summaries to a console or debug overlay.
- Experiment with saving and loading a complete `WorldState` to understand the
  serialisation format and any Map/BigInt round-trip concerns.

The goal is not to build a game, but to map the terrain and identify the steepest
learning curves before they impact production timelines.

**Deliverable:** An internal "Ananke Integration Primer" document capturing data-flow
diagrams, type glossaries, and gotchas discovered during the spike.

---

### 3 · Asset Pipeline & Renderer Bridge **COMPLETE** (see Integration Milestone 3)

**Delivered:** Bridge module (`src/bridge/`) with double‑buffered interpolation, segment‑to‑bone mapping, deterministic tick‑rate conversion, and full API documentation (`docs/bridge‑api.md`). Working example in `tools/bridge‑demo.ts`.

**Design and implement a translation layer between Ananke's simulation state and the
target game engine's visual representation.**

Ananke provides data (positions, velocities, pose modifiers, animation hints, grapple
constraints) but renders nothing. A dedicated engineering task is required to build a
"bridge" that:

- **Consumes simulation output.** Reads `PoseModifier` data, `GrapplePoseConstraint`
  information, and `AnimationHints` from the kernel after each tick.
- **Translates to engine primitives.** Maps Ananke's abstract segments (e.g., `"torso"`,
  `"leftArm"`) to specific bones in the target engine's 3D skeleton and converts blend
  weights into engine-specific animation parameters (blend tree values, IK targets,
  procedural lean, ragdoll blending).
- **Handles multiple body plans.** The bridge must accommodate all body plans Ananke
  supports — humanoid, quadruped, octopoid, avian — which may require entirely different
  rigging and animation strategies per plan type.
- **Manages tick-rate mismatch.** The sim runs at `TICK_HZ` (20 Hz by default); the
  renderer typically runs at 60–120 Hz. The bridge must interpolate or extrapolate
  transforms between simulation ticks without introducing temporal artefacts.

**Deliverable:** A documented bridge API with at least one working example (humanoid
body plan connected to a reference renderer).

---

### 4 · Systematic Validation Against Real-World Data **COMPLETE** (2026-03-14)

**Delivered:** Validation framework (`tools/validation.ts`) with CLI, statistical comparison, calibration scenario validation, and report generation. All six `CALIBRATION_*` scenarios pass expectations. Reports saved to `docs/validation-*.md`. Constants update mechanism ready for low‑level physical constants. The framework now includes direct validation against three external real‑world datasets (AddBiomechanics walking metabolic cost, BVR Air Combat projectile drag, sports‑science jump height) and a comprehensive inventory of validated and potential future datasets (`docs/external-dataset-validation-inventory.md`).

**Treat the simulation as a scientific model and establish a process for empirical
validation against real-world datasets.**

To move beyond "calibrated" to "validated," a formal assessment framework is needed.
This involves iteratively testing sub-systems against real-world data to build
confidence in the simulation's outputs.

#### Step 1 — Isolate a sub-system
Break the complex simulation into testable components: impact force, bleeding rate,
sprint speed, fear-response latency, fatigue-under-load curves.

#### Step 2 — Run parallel experiments
Configure Ananke to replicate the conditions of a real-world experiment, matching
virtual entity attributes (mass, anthropometry, `peakForce_N`, `reactionTime_s`)
to subjects in the target study.

#### Step 3 — Compare outputs statistically
Run the simulation across a range of deterministic seeds and compare the distribution
of outcomes against the real-world dataset. Flag sub-systems where the simulated
distribution falls outside the empirical confidence interval and adjust tuning constants.

**Example datasets for comparison:**

| Sub-system | Potential datasets |
|:---|:---|
| Impact force / injury | AFRL Biodynamics Data Bank (6,000+ human/dummy impact tests); CAVEMAN Human Body Model validation methodology against cadaveric data |
| Athletic performance | Kaggle martial-arts sensor datasets (accelerometer/pressure from punches and kicks); EMG Physical Action Dataset (muscle-activation timing for aggressive vs. normal motion) |
| Biomechanical benchmarks | SPHERIC benchmark cases (standardised numerical-model validation); sports-science literature on sprint speeds, jump heights, and strike forces |
| Muscle mechanics & tissue deformation | OpenArm Multisensor 2.0 (ultrasound muscle deformation + sEMG + force); OpenArm 1.0/2.0 volumetric arm scans |
| Ground reaction forces & injury biomechanics | One‑Legged Stand Test Dataset (32 participants, force plates); Runner Injury GRF Dataset (534 runners, 2025); Tibial Stress Injury GRF Dataset (66 runners, 2025) |
| Blast & hypervelocity impact | Confined Blast Loading Dataset (C‑4 detonations in steel cylinders); pyBLOSSUM Hypervelocity Impact Database (>1700 hypervelocity‑impact data points) |
| Cognitive & physiological state | NASA SOTERIA Flight Simulation Dataset (24 pilots, EEG/ECG/eye‑tracking); RealPDEBench (real‑world measurements + paired numerical simulations) |
| Melee combat & weapon dynamics | 5 Master Long Sword Strikes Database (5MUDM); Martial Arts, Dancing and Sports Dataset (stereo multi‑view for 3D pose estimation) |
| Supporting resources | Forensic Biomechanics textbook; FOROST Osteological Database; Neural Network Classification of Master Cuts (Klempous et al., 2021); Response Timing and Muscular Coordination in Fencing (Williams & Walmsley, 2000) |

**Deliverable:** A validation report for each major sub-system documenting methodology,
dataset source, comparison metric, and residual error. Update `TUNING` constants where
deviations exceed ±20 % of the empirical mean.

---

### 5 · Community & Ecosystem Development **COMPLETE** (2026-03-18)

**Acknowledge the project's current single-maintainer nature and build a support and
contribution strategy.**

Ananke is a highly ambitious effort currently without a large public community, extensive
tutorials, or pre-made integration asset packs. Adopting it means committing to its
specific vision and architecture largely independently. To mitigate this risk:

- **Plan for internal forks and extensions.** Accept that you may need to develop and
  maintain internal extensions to the kernel for project-specific needs (custom body
  plans, non-standard damage channels, proprietary AI layers). Contribute these back
  upstream where the licence and architecture permit.
- **Allocate time for documentation.** Budget dedicated developer time for internal
  team documentation — wikis, practical guides, onboarding tutorials — that go beyond
  the inline JSDoc. A new engineer should be able to ship a working prototype within
  their first two weeks using internal docs alone.
- **Establish a versioning contract.** Pin to a specific Ananke commit hash in your
  dependency manifest. Breaking changes to the `Entity` interface or kernel contract
  have historically landed without semver-style signalling; track the changelog
  manually and audit impacts on each upgrade.
- **Seed community resources.** Consider publishing worked examples, body-plan
  definitions for common species, and renderer-bridge boilerplate as open-source
  companion repositories. Community tooling reduces the bus-factor risk of a
  single-maintainer core library.

**Deliverable:** A living "Ananke Ecosystem" internal wiki, a contribution guide
for upstream PRs, and a pinned dependency with a defined upgrade-review cadence.

**Delivered:** Four documentation files covering all milestone deliverables:
- `docs/onboarding.md` — two-week new-engineer onboarding guide with day-by-day plan
- `docs/contributing.md` — contribution guide: engine vs. external boundaries, code conventions, PR checklist, module skeleton
- `docs/versioning.md` — versioning contract: commit-hash pinning, breaking-change tiers, changelog format, upgrade cadence, fork guidance
- `docs/ecosystem.md` — ecosystem index: worked examples, body-plan authoring templates, renderer bridge boilerplate (Unity/Godot sketches), suggested companion repositories

---

## Next Priorities

The five integration milestones are complete.  The following items represent the critical path
for raising adoption and scientific credibility.  They are sequenced: items 6–8 lower the
integration barrier; items 9–11 deepen validation and infrastructure.

---

### 6 · Reference Renderer Implementation

**The gap:** `src/model3d.ts` / `src/bridge/` provide pure data-extraction functions and
documented output formats, but every adopter must independently solve the mapping of Ananke's
abstract segment IDs to a specific engine's skeleton, the 20 Hz → 60+ Hz interpolation, and
the animation state machine wiring.  The bridge sketches in `docs/ecosystem.md` are
pseudocode, not runnable code.

**What is needed:** A minimal, runnable plugin in a real engine — Godot 4 or Unity 6 — living
in a separate companion repository.  The scope is deliberately narrow:

- A single humanoid character rig driven by `extractRigSnapshots` each tick
- Tick-rate interpolation (20 Hz sim → renderer frame rate) handled by the plugin
- `AnimationHints` mapped to a simple animation state machine (idle / walk / attack / prone / dead)
- `GrapplePoseConstraint` used to lock relative pose for a two-character grapple pair
- A self-contained demo scene: Knight vs. Brawler, same as `tools/vertical-slice.ts`, but visual

**Deliverable:** A tagged companion repository (`ananke-godot-reference` or
`ananke-unity-reference`) with a README explaining how to connect it to any Ananke build.

**Why this matters:** Until this exists, the integration barrier is high.  A working plugin
makes the project credible to engine integrators within minutes rather than weeks.

---

### 7 · Emergent Behaviour Validation Suite *(COMPLETE)*

**Deliverable:** `tools/emergent-validation.ts` — four historical combat scenarios validated
across 100 seeds each, comparing outcome distributions against historical reference ranges.

| Scenario | Metric | Reference | Result |
|----------|--------|-----------|--------|
| 10 vs. 10 skirmish, open ground | Winner ≥ 20% survivors, loser ≤ 50%, p90 ≤ 2000 ticks | Ardant du Picq, *Battle Studies* | ✓ PASS |
| 10 vs. 10 skirmish, rain + fog | Fight duration ≥ 1.10× clear-weather baseline | Keegan, *The Face of Battle* | ✓ PASS (1.54× ratio) |
| Lanchester's Laws: 5 vs. 10 | Large force wins ≥ 80%, casualty ratio ≥ 2× | Lanchester, *Aircraft in Warfare* | ✓ PASS (85.7× ratio, 100% wins) |
| Siege attrition (garrison 20, attacker 60, 30 days) | Disease kills ≥ combat kills, ≥ 5% population | Raudzens, *Firepower* | ✓ PASS (56.1% from disease) |

**Verdict:** 4/4 scenarios validated — emergent system behaviour matches historical reference
ranges. Run with `npm run run:emergent-validation`.

---

### 8 · Visual Editors for Non-Developers *(COMPLETE)*

**Deliverable:** Two standalone HTML/JS tools in `docs/editors/` (no build step, no TypeScript
required). Serve locally or via GitHub Pages.

**Body Plan Editor** (`docs/editors/body-plan-editor.html`):
- Species name, locomotion type, CNS layout, total body mass
- Segment table: ID, parent, mass-share %, hit-exposure %, locomotion/manipulation/CNS roles
- Live validation: mass shares must sum to 100%, flags missing CNS central and locomotion segments
- Pre-loaded templates: humanoid (7 segments) and quadruped (8 segments)
- Generates a complete `BodyPlan` TypeScript literal (SCALE-corrected mass_kg and exposureWeight)

**Validation Scenario Builder** (`docs/editors/scenario-builder.html`):
- Up to 4 configurable entities (team, archetype, weapon, armour, position)
- Simulation parameters: tick count, traction coefficient, weather preset
- Metric dropdown: peak power, force, reaction time, shock, fatigue, fluid loss, consciousness,
  region damage, survivor fraction, ticks-to-end, or custom expression
- Empirical reference: dataset name, mean, CI half-width, tolerance %, source citation
- Generates a complete `DirectValidationScenario` block ready to paste into `tools/validation.ts`

Landing page: `docs/editors/index.html` links both tools and the validation dashboard.

---

### 9 · Performance & Scalability Benchmarks *(COMPLETE)*

**Deliverable:** `tools/benchmark.ts` + `docs/performance.md`. Run with `npm run run:benchmark`.

| Scenario | Entities | Median tick | Throughput |
|----------|----------|-------------|------------|
| Melee skirmish | 10 | 0.19 ms | 5.3k ticks/s |
| Mixed ranged/melee | 100 | 4.68 ms | 214 ticks/s |
| Formation combat | 500 | 31 ms | 32 ticks/s |
| Weather + disease | 1 000 | 64 ms | 16 ticks/s |

**Key findings:**
- `stepWorld` (kernel physics) consumes ≥ 95% of tick budget at all entity counts; AI command
  generation is negligible (< 1% at 500 entities).
- SpatialIndex with 4 m cells provides no throughput benefit vs. naïve O(n²) at ≤ 500 entities
  in dense close-formation scenarios; benefit appears only in sparse large-area engagements.
- At 20 Hz real-time rate, 500 entities is within budget (62%); 1 000 entities exceeds it (129%).
- `docs/performance.md` documents full results, AI-budget breakdown, spatial-index comparison,
  memory footprint estimates, and a tuning guide with recommended entity caps per use case.

---

### 10 · Public Validation Dashboard *(COMPLETE)*

**Deliverable:** `docs/dashboard/index.html` + `docs/dashboard/validation-dashboard.json`
+ `.github/workflows/validation-dashboard.yml`.

Run with `npm run run:validation-dashboard` (runs all 43 scenarios and writes the JSON).
Serve `docs/dashboard/` on GitHub Pages or `python -m http.server` to view the dashboard.

**Dashboard features:**
- Table of all 43 scenarios (6 calibration + 37 direct) with pass/fail badges, type filter, and search
- Simulated-vs-empirical bar with ±tolerance band rendered inline for direct validation scenarios
- Calibration scenarios show expectation pass count (e.g. "2/2 expectations passed")
- Current status: **43/43 passing (100%)**

**CI:** `.github/workflows/validation-dashboard.yml` runs `npm run run:validation-dashboard`
on every push to `master` and commits the updated JSON automatically (no manual step).

---

### 11 · Formalised Dataset Contribution Pipeline *(COMPLETE)*

**Deliverable:** `docs/dataset-contribution.md` + `datasets/example-sprint-speed.csv` +
working `DirectValidationScenario` for human peak anaerobic power wired into `tools/validation.ts`.

The guide covers:
- **Dataset format:** required CSV columns (`entity_id`, `metric_name`, `value`, `unit`,
  `condition_*` covariates), mandatory header metadata (DOI, licence, n, collection method)
- **Validation test format:** four `DirectValidationScenario` code templates (0-tick attribute
  read, short combat tick, downtime scenario) with `setup` / `extractOutcome` patterns
- **Tolerance selection table:** 10–40% guidance by quantity type
- **Review criteria:** peer-reviewed source, ≥ 10 observations, SI units, documented protocol,
  archetype-mappable population
- **End-to-end example:** `datasets/example-sprint-speed.csv` (Wingate test, elite/military
  cohort) + "Human Peak Anaerobic Power" scenario → simulated 2339 W vs. empirical 2135 W → ✓ PASS
- **PR checklist:** dataset CSV + scenario block + inventory status update

---

## New Simulation Phases

The following phases extend the simulation kernel itself — as opposed to the tooling and
infrastructure items above.  Each builds directly on existing Ananke infrastructure.

---

### Phase 61 — Polity & World-State System (Layer 6) *(COMPLETE)*

**Concept:** Introduce a `Polity` entity (city, nation, empire) as a first-class simulation
object operating at a lower tick rate than individual combat (1 per simulated day rather than
20 Hz).  This extends the existing Campaign layer (Phase 22), Faction system (Phase 36),
Economy layer (Phase 25), and TechContext (Phase 11C) to geopolitical scale.

**Core types:**

```typescript
interface Polity {
  id: string;
  name: string;
  factionId: string;           // ties into existing Faction system
  locationIds: string[];       // locations it controls (Campaign layer)
  population: number;          // headcount (integer)
  treasury_cu: number;         // cost-unit wealth (Economy layer scale)
  techEra: TechEra;            // current tech level (Phase 11C)
  militaryStrength_Q: Q;       // 0–1 fraction of theoretical max force
  stabilityQ: Q;               // internal cohesion; below threshold → unrest
  moraleQ: Q;                  // population morale; feeds into militaryStrength
}
```

**Mechanics:**

- **Trade:** polities with connected locations (Phase 22 `travelCost`) exchange goods each
  day tick; route quality scales with the best `logicalMathematical` navigator available
- **War:** military conflict resolved as a scaled formation engagement using
  `computeFormationMomentum` with aggregated `militaryStrength_Q` rather than individual
  entity stats; outcome feeds back into `stabilityQ`
- **Diplomacy:** uses Phase 37 (linguistic intelligence) and Phase 36 (inter-species
  communication) constants to derive negotiation success probability; standing adjustments
  mirror Phase 24 faction standing changes
- **Technological progression:** `techEra` can advance when `treasury_cu` crosses a
  threshold and a research project (`CollectiveProject` from Phase 55) completes
- **Epidemic spread:** Phase 56 disease transmission operates at polity level for airborne
  diseases when `population` density exceeds a threshold

**Tick rate:** 1 polity tick = 1 simulated day = `86 400 × TICK_HZ` individual ticks.
The host decides how many individual ticks to run between each polity tick.

**Depends on:** Phases 22, 24, 25, 36, 37, 51, 55, 56.

---

### Phase 62 — Narrative Bias Parameter for `generateIndividual` *(COMPLETE)*

**Concept:** Add an optional `NarrativeBias` parameter to `generateIndividual` that skews
the RNG sampling toward a requested profile while preserving physical plausibility.  A designer
can say "I want a strong but slow-witted character" without overriding constants or writing
custom generation code.

**Interface:**

```typescript
interface NarrativeBias {
  /** Signed bias [-1, 1] applied to the triangular distribution for each variance field.
   *  0 = no bias (default); +1 = strongly skewed toward high end; -1 = toward low end. */
  strength?: number;     // biases peakForce_N, peakPower_W, continuousPower_W
  speed?: number;        // biases reactionTime_s (negative bias = faster)
  intellect?: number;    // biases logicalMathematical, spatial cognition
  resilience?: number;   // biases distressTolerance, shockTolerance
  agility?: number;      // biases controlQuality, fineControl, stability
  size?: number;         // biases stature_m, mass_kg
}
```

**Implementation:** `triSym(rng)` currently returns a value in [-1, 1] from the symmetric
triangular distribution.  With a bias *b*, the output is `clamp(triSym(rng) + b * 0.5, -1, 1)`
before being passed to `mulFromVariation`.  This shifts the mean without collapsing the
distribution — a biased character is still drawn from the population, just from a different
part of the tail.

**Constraint:** Bias does not permit values outside the archetype's existing `clampQ` bounds.
A heavily biased character is extreme but not physically impossible.

**Depends on:** Phase 33 (Multiple Intelligences), `src/generate.ts`.

---

### Phase 63 — Narrative Stress Test ("Plot Armour Analyser") *(COMPLETE)*

**Concept:** Given a narrative scene described as a sequence of expected outcomes (e.g., "the
hero defeats the guard and escapes"), run the simulation thousands of times with perturbed
initial conditions and measure how probable that sequence of outcomes is.  The inverse of the
probability is the **narrative push** — the amount of authorial intervention required to make
the story beat happen.

This is a unique capability that no other simulation engine offers.  It turns Ananke into
a tool for writers, game designers, and historians: *is this story plausible, or is it
pure plot armour?*

**Core types:**

```typescript
interface NarrativeBeat {
  /** Tick range within which this beat must occur. */
  tickWindow: [number, number];
  /** Predicate on WorldState that must be true to pass this beat. */
  predicate: (world: WorldState) => boolean;
  description: string;
}

interface NarrativeScenario {
  name: string;
  setup: () => WorldState;     // deterministic world factory
  commands: CommandProvider;   // supplies commands each tick
  beats: NarrativeBeat[];
}

interface StressTestResult {
  scenarioName: string;
  runsTotal: number;
  /** Fraction of runs where ALL beats were satisfied. */
  successRate: number;
  /** 1 - successRate.  0 = no push needed; 1 = miracle required. */
  narrativePush: number;
  /** Per-beat failure rates, so designers can identify which beat is the bottleneck. */
  beatResults: Array<{ description: string; passRate: number }>;
  /** Seeds that produced successful runs — can be replayed for inspection. */
  successSeeds: number[];
}
```

**Implementation:** Uses the existing `ReplayRecorder` and `makeRng` infrastructure.
The runner perturbs `world.seed` across `runsTotal` independent runs.  Each run is
deterministic; only the seed differs.  No floating-point randomness is introduced.

**Example use cases:**

| Scenario | Narrative push | Interpretation |
|----------|---------------|----------------|
| Trained knight defeats single lightly armoured guard | 0.03 | Plausible; almost no authorial push needed |
| Outnumbered hero (1v5) escapes without injury | 0.94 | Heavy plot armour required |
| Historical: Henry V survives Agincourt | 0.41 | Plausible but not guaranteed — fortune played a role |
| "Sneak attack from behind, target never reacts" | 0.85 | Requires specific reaction-time conditions |

**Tool:** `tools/narrative-stress-test.ts` — a CLI that accepts a scenario file and
`--runs N` flag, prints a report showing `narrativePush` per beat and overall, and
optionally saves a successful replay for visual inspection.

**Depends on:** `ReplayRecorder` (Phase 13), `makeRng`, `eventSeed`.

---

## Long-Term Vision

The following ideas are directionally sound and build naturally on existing Ananke systems,
but require substantial design work before they become concrete phases.  They are recorded
here so the architectural decisions made in near-term phases account for them.

---

### "What If?" / Alternate History Engine

**Concept:** Combine Phase 61 (Polity system) with the Narrative Stress Test (Phase 63) at
geopolitical scale.  A user defines a historical or fictional world state and a single
divergence point ("What if the Mongol fleet reached Japan?").  The simulation runs forward
at campaign-tick rate across hundreds of seeds, tracking polity rise and fall, technological
progression, and major events.  The output is a distribution of possible timelines with a
probability-weighted summary.

**Ananke hooks:** Phase 61 (Polity), Phase 22 (Campaign), Phase 24 (Faction standing),
Phase 25 (Economy), Phase 50 (Legend system for recording events), Phase 63 (seed-based
divergence runs).

**Prerequisite:** Phase 61.

---

### Emotional Contagion at Polity Scale

**Concept:** Extend the morale and fear systems upward from the individual entity to the
polity.  A military defeat reduces `polity.moraleQ`; a charismatic leader's address (using
Phase 39 musical/performance intelligence) can trigger a morale wave across a city; panic
spreads between adjacent entities using the same transmission model as Phase 56 disease
spread but with `fear_Q` as the "pathogen".

This is structurally identical to epidemic modelling — `fear` and `hope` propagate through
a social network the same way a respiratory illness does through a physical one.

**Ananke hooks:** Phase 61 (Polity morale), Phase 39 (Performance intelligence), Phase 56
(transmission model reused for emotional state), Phase 32D (morale system constants).

**Prerequisite:** Phase 61.

---

### Generative Mythology

**Concept:** As a long-running simulation accumulates significant events — a volcanic eruption
that kills hundreds, a plague that halves a city's population, a single warrior who defeats
an army — the Legend system (Phase 50) records them.  A second pass over the legend log
applies narrative compression: recurring patterns become myths, exceptional individuals
become folk heroes or demons, natural disasters become divine acts.  The output is a set of
in-world cultural beliefs held by each faction that influence their AI decision-making.

**Ananke hooks:** Phase 50 (Legend system), Phase 56 (disease as plague myth trigger),
Phase 60 (hazard zones as disaster myth triggers), Phase 24 (faction culture), Phase 47
(personality traits of legendary individuals).

**Prerequisite:** Phase 61 (to run at the timescale where myths form).

---

### Artificial Life Validation ("Blade Runner" Test) *(COMPLETE)*

**Concept:** Run a city-scale simulation (1 000+ entities, Phase 61 Polity providing the
economic and social frame) for months of simulated time without intervention.  Then analyse
the emergent population:

- Do stable social hierarchies form based on faction standing and economic inequality?
- Does disease (Phase 56) create mortality spikes that match historical epidemic curves?
- Do morale waves (Phase 32D) correlate with economic downturns (Phase 25)?
- Do skilled characters (Phase 21) accumulate more wealth and faction standing over time?

This is not a new simulation phase — it is a validation methodology that uses *all* existing
phases simultaneously.  It is the ultimate integration test and the most compelling
demonstration of the system's depth.

**Ananke hooks:** All phases — this is a scenario, not new code.

**Implementation:** `tools/blade-runner.ts` — run via `npm run run:blade-runner`.
198 named NPCs across 9 settlements, 3 polities with 100k abstract population each.
365-day simulation seeding plague_pneumonic on day 30 and war days 180–270.

**Validated claims (4/4 PASS, seed 1):**
1. Social Hierarchy — rich/poor treasury spread reaches 4.88× (threshold 2×) ✓
2. Disease Mortality — plague kills 8.08% of population in peak week (threshold 0.5%) ✓
3. Morale–Economy — war polity morale drops 0.115 during 90-day conflict ✓
4. Skill Hierarchy — top-quartile NPCs earn 1.08× more milestones than bottom-quartile ✓

---

### Visual Tooling — Species Forge

*Extends ROADMAP item 8 (Visual Editors for Non-Developers)*

The Body Plan Editor described in item 8 should be extended into a full **Species Forge**:
a visual tool for mixing body plans, adjusting archetype variance distributions, and applying
`NarrativeBias` presets (Phase 62).  The output is a `BodyPlan` + `Archetype` pair in the
kernel's JSON format, ready to load without writing TypeScript.

Species Forge would allow a biologist to model a real animal, a game designer to create a
fantasy species, or a writer to design an alien — all without touching the kernel.  This
directly addresses the tooling gap for non-developers and makes the species-building
capability accessible to domain experts.

---

*Ideas not included:*

- **Procedural Language Generation** — While Phase 37 (linguistic intelligence) provides
  a numeric proxy for language capability, generating a plausible evolving pidgin/creole
  requires a natural-language model that is outside Ananke's physics-first scope.  This is
  better addressed by an external language model layer that reads Ananke's faction/contact
  history as input.

- **Full standalone UI** — A complete application (world creation, entity editing, command
  input, simulation playback, data visualisation) is a separate product, not a kernel
  extension.  The kernel's clean API is designed precisely so that such a UI can be built
  on top of it independently.  See ROADMAP item 6 (Reference Renderer) as the first step.
