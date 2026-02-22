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

**Partially implemented:**

- Grappling: command accepted, trace emitted; leverage/grip/throw mechanics TBD (Phase 2)
- Stamina: fatigue accumulates; exhaustion-driven penalties TBD (Phase 2)

---

## Phase 2 — Grappling, Stamina and Weapon Dynamics

### Grappling system

Goal: deterministic close-combat control.

- Grapple attempt resolution (strength + mass + technique)
- Leverage comparison using physical moment arms (N·m)
- Break-grapple attempt mechanics
- Positional locking (prone, pinned, standing)
- Throw and trip: outcome proportional to leverage differential and velocity (kg·m/s)
- Ground fighting states: attack and defence modifiers per position
- Choke and joint-lock: targeted structural or suffocation damage

Determinism requirements: pair-based resolution, stable ordering, no mutation mid-resolution.

### Stamina and energy model

The engine already models `reserveEnergy_J` and `continuousPower_W`. This phase adds:

- Stamina depletion per action type (strike, block, sprint, grapple) in joules
- Regen rate proportional to `continuousPower_W` and recovery state
- Exhaustion threshold: when reserve falls below a fraction of baseline, functional penalties apply
- Collapse when depleted: entity becomes prone and defenceless

### Weapon dynamics expansion

- Momentum carry between strikes (committed swing inertia)
- Recovery time after missed strike (derived from weapon mass and angular momentum)
- Weapon bind states: opposing weapons locked, requiring strength contest to disengage
- Reach dominance: reach differential penalises short weapons in open ground
- Two-handed leverage bonuses: moment arm advantage quantified in N·m

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

## Phase 4 — Perception and Cognition

Goal: entities model their environment, not just react to it.

### Sensory model

Entities have species-appropriate sensory capabilities:

- `visionRange_m`: maximum reliable visual range (metres)
- `visionArcDeg`: field of view (degrees; most species < 360)
- `hearingRange_m`: threat detection by sound (metres)
- Additional modalities (TBD): smell range, vibration sensitivity, electromagnetic sense for alien species

Sensory range modifiers: darkness, cover, smoke, noise environment. Each is a dimensionless
multiplier on base range.

### Cognitive model

Implements the cognitive attributes defined in Phase 0:

- `decisionLatency_s`: minimum time between tactical plan revisions (seconds)
- `attentionDepth`: maximum simultaneously tracked entities (integer)
- `threatHorizon_m`: range at which threats are integrated into decisions (metres)
- `learningRate`: multiplier on skill acquisition (relevant to Phase 7, dimensionless)

### Threat prioritisation

Target selection weighted by proximity (metres), estimated threat level (derived from observed
weapon, relative size, behaviour), and focus stickiness (decays over time, scaled by attentionDepth).

### Surprise mechanics

An entity outside the observer's field of view or sensory range can attack without triggering
defensive response. Full surprise eliminates defensive reaction for one attack. Partial surprise
(peripheral detection) degrades defence intensity proportionally.

---

## Phase 5 — Morale and Psychological State

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

---

## Phase 6 — Large-Scale Simulation

### Formation system expansion

- Shield walls: adjacent shield-bearing entities share block coverage across arc
- Rank depth effects: rear ranks contribute push force and replace front-rank casualties
- Push-of-pike dynamics: formation momentum as a mass × velocity product (kg·m/s)
- Formation morale sharing: cohesion bonus when formation is intact

### Battlefield systems

- Terrain friction: surface type modifies `tractionCoeff` (mud, ice, slopes)
- Elevation: height differential modifies reach, projectile range, and escape routes
- Obstacles: impassable and partial-cover cells (cover reduces effective target area fraction)
- Choke points: frontage cap derived geometrically from map data

### Scenario tools

- Scripted battle setup with entity and formation placement
- Reproducible test scenarios with fixed seed and command sequence
- Performance benchmarking harness (entities per tick at target frame rate)
- Replay recording: deterministic event log sufficient to reconstruct any tick

---

## Phase 7 — Skill System

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

### Skill acquisition (TBD)

Skill levels increase through simulated experience. The accumulation model (repetitions,
time-based decay, training contexts) is not yet designed. The interface is defined to receive
values from the host application; the engine consumes them but does not manage progression
internally.

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