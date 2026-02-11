# Ananke
![CI](../../actions/workflows/ci.yml/badge.svg)

**Ananke** is a deterministic, lockstep-friendly simulation kernel for physics-first RPGs and combat systems using **SI units** stored as **fixed-point integers**.

It models entities using real physical quantities rather than abstract hit points.

Designed for:
- simulation-first RPGs  
- tactical combat engines  
- scientific / speculative biology modelling  
- deterministic multiplayer  

---

# Core design goals

- Deterministic lockstep safe
- Fixed-point SI units
- Biology-agnostic anatomy
- Physics-derived combat
- Extensible from prehistoric → space age
- Portable TypeScript core

---

# Current capabilities

## Deterministic simulation kernel
- Fixed timestep simulation
- Seeded deterministic RNG
- Lockstep-safe command processing
- Stable entity ordering

## Units & maths
- Fixed-point SI unit system (`src/units.ts`)
- Deterministic integer arithmetic
- No floating-point drift

## Entity modelling
Biology-agnostic attribute system:

- actuation capacity (force/power)
- structural integrity
- energy reserve
- control & coordination
- resilience & recovery

Supports:
- humans
- robots
- exotic/alien morphologies

## Anatomy & injury system
Per-region modelling:

- head
- torso
- left/right arms
- left/right legs

Each region tracks:
- surface damage
- internal damage
- structural damage
- bleeding rate

Global:
- shock
- fluid loss
- consciousness

## Combat physics
- impact energy from mass + velocity
- weapon effective mass
- penetration & armour resistance
- bleeding from trauma
- attack cooldown & timing
- block / parry / hit resolution
- deterministic RNG for outcomes

## Armour system
- per-region coverage
- channel protection (kinetic, thermal, chemical, electrical)
- penetration resistance
- mobility & fatigue penalties

## Systemic hazards
Distributed by region:

- fire (limbs more exposed)
- corrosives
- electrical exposure
- suffocation

Armour reduces systemic dose per region.

## Encumbrance
Mass + bulk:
- affects speed
- acceleration
- energy use
- control

---

# Quick start

```bash
npm i
npm test
npm run build