# Ananke
![CI](../../actions/workflows/ci.yml/badge.svg)

**Ananke** is a deterministic, lockstep-friendly simulation kernel for physics-first RPGs, tactical combat engines, and speculative physiology systems.

It models entities using **real physical quantities** rather than abstract hit points, using **SI units stored as fixed-point integers** for full determinism.

Designed for:

- Simulation-first RPGs  
- Tactical & formation combat engines  
- Scientific / speculative biology modelling  
- Deterministic multiplayer simulation  
- Large-scale combat experiments  

---

# Core design principles

## Deterministic by default
- Lockstep-safe simulation
- No floating-point drift
- Stable ordering and RNG consumption

## Physics-first
- Impact energy → injury
- Mass, velocity, leverage, penetration
- Encumbrance affects movement & fatigue

## Biology-agnostic
- Supports humans, robots, aliens, abstract entities
- Genericised actuation/structure/control systems
- Region-based anatomy adaptable to any morphology

## Scalable
- Single entity → squad → formation → army
- Spatial partitioning & density modelling
- Deterministic large-battle simulation

---

# Current capabilities (Phase 6 complete)

## Deterministic simulation kernel
- Fixed timestep deterministic simulation
- Seeded integer RNG
- Lockstep-safe command application
- Deterministic event ordering
- Impact event batching
- Stable entity sorting

---

# Units & mathematics

- Fixed-point SI unit system (`src/units.ts`)
- Deterministic integer arithmetic
- No floating point usage in simulation path
- Explicit scaling constants

All core physics values use SI:
- metres
- seconds
- kilograms
- newtons
- joules

---

# Entity model

Biology-agnostic attribute system:

### Morphology / structure
- stature / mass
- actuator fraction
- structure scale
- reach scale

### Performance
- peak force
- peak power
- continuous power
- reserve energy
- conversion efficiency

### Control
- control quality
- reaction speed
- stability
- fine control

### Resilience
- surface integrity
- structural tolerance
- fatigue & recovery
- shock tolerance
- environmental tolerance

Supports:
- humans
- robots
- creatures
- exotic morphologies

---

# Anatomy & injury system

Per-region injury modelling:

- head  
- torso  
- left arm / right arm  
- left leg / right leg  

Each region tracks:
- surface damage  
- internal damage  
- structural damage  
- bleeding rate  

Global state:
- shock
- fluid loss
- consciousness
- death state

---

# Functional impairment system

Damage produces functional penalties:

| Damage type | Effects |
|------------|--------|
| Leg structural | movement reduction |
| Arm damage | manipulation/parry reduction |
| Head damage | coordination & consciousness |
| Torso damage | breathing/shock vulnerability |
| Shock | global performance degradation |

Automatically feeds into:
- movement caps
- attack ability
- defence ability
- stamina drain
- KO & collapse logic

---

# Combat system

## Hit resolution
- deterministic RNG
- skill vs defence contest
- geometry influence
- hit location resolution
- hit quality

## Defence mechanics
- block
- parry
- dodge
- defence intensity
- cooldowns

## Impact physics
Impact energy derived from:
- weapon effective mass
- relative velocity
- strike speed scaling
- leverage

Converted into:
- surface/internal/structural injury
- bleeding rate
- shock

---

# Weapons

Each weapon defines:
- mass
- reach
- handling
- strike speed multiplier
- effective mass fraction
- damage profile
- penetration bias

Leverage affects:
- parry strength
- block effectiveness
- strike delivery

---

# Armour system

Per-region armour:

- region coverage
- kinetic resistance (J)
- channel protection:
  - kinetic
  - thermal
  - chemical
  - electrical
- penetration mechanics
- mobility/fatigue penalties

Armour reduces:
- impact energy
- systemic hazard dose
- bleeding from trauma

---

# Systemic hazards

Distributed by region:

- fire
- corrosives
- electrical exposure
- suffocation

Example:
- helmet reduces head thermal dose
- exposed limbs burn faster
- armour reduces per-region damage

---

# Encumbrance system

Mass + bulk based.

Affects:
- speed
- acceleration
- fatigue rate
- control quality
- energy consumption

Deterministic and continuous.

---

# Spatial & formation simulation

## Spatial partition
- grid spatial index
- deterministic neighbour queries
- scalable to large battles

## Density modelling
- entity overlap detection
- crowd density slowdown
- formation pressure

## Push / repulsion
- deterministic separation forces
- prevents entity overlap
- mass-based push response
- stable multi-entity behaviour

## Teams & formations
- teamId support
- friendly filtering
- formation frontage scaffolding
- formation pressure modelling

---

# AI scaffolding (deterministic)

Deterministic AI modules exist:

- perception
- targeting
- decision
- presets
- system integration

Currently smoke-tested and ready for expansion.

---

# Determinism rules

To maintain lockstep safety:

- Never use `Math.random()`
- Avoid floating point
- Iterate in stable order
- Consume RNG in fixed order
- Use deterministic event batching
- Avoid unordered map iteration for gameplay logic

---

# Project layout
