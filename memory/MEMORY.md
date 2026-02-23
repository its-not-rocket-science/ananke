# Ananke Project Memory

## Project Overview
Physics-first deterministic combat/simulation engine. TypeScript, Vitest tests.
Phase 1 complete. Phase 2A complete (grappling). Phase 2B/C next (stamina + weapon dynamics).

## Key Rules (from CLAUDE.md)
- Never Math.random() — use makeRng() and eventSeed()
- No floats in sim path — fixed-point only
- Run `npm run test:coverage` before done
- Coverage thresholds: statements 90%, branches 80%, functions 85%, lines 90%

## Unit System (units.ts)
- SCALE.Q = 10000 (q(1.0) = 10000)
- SCALE.m = 10000, SCALE.s = 10000, SCALE.kg = 1000, SCALE.N = 100, SCALE.W = 1, SCALE.J = 1
- `to.N(1840)` = 184000, `to.kg(75)` = 75000, `to.m(1.75)` = 17500
- Arithmetic: qMul(a,b) = trunc(a*b/SCALE.Q), mulDiv uses BigInt for safety

## Fixed-Point Reference Values (human)
- peakForce_N = to.N(1840) = 184000
- mass_kg = to.kg(75) = 75000
- stature_m = to.m(1.75) = 17500
- reserveEnergy_J = 20000 (J, SCALE.J=1)
- continuousPower_W = 200 (W, SCALE.W=1)

## Phase 2A: Grappling (COMPLETE)

### New/Modified Files
- `src/sim/entity.ts` — GrapplePosition type + `position` field in GrappleState
- `src/sim/action.ts` — `grappleCooldownTicks: I32`
- `src/sim/condition.ts` — `pinned: boolean`
- `src/sim/commands.ts` — GrappleMode type + `mode?: GrappleMode` on GrappleCommand
- `src/sim/grapple.ts` — NEW: full grapple resolution (7 exported functions + 2 weapon consts)
- `src/sim/impairment.ts` — pinnedQ/heldQ terms in mobilityMul/manipulationMul
- `src/sim/kernel.ts` — replaced stub, added resolveGrappleCommand(), stepGrappleTick loop, breakGrapple handler, new field initialization, grappleCooldownTicks decrement
- `src/sim/testing.ts` — `position: "standing" as const` added to default grapple state
- `test/grapple.test.ts` — NEW: 37 tests

### Grapple Score Formula
Average human ≈ q(0.47). Combines: 50% peakForce, 30% technique(ctrl×stab), 20% mass.
Normalized to [q(0.05), q(0.95)] via linear map [q(0.02), q(1.80)] → [q(0.05), q(0.95)].

### Key Constants (grapple.ts)
- GRAPPLE_ATTEMPT_ENERGY_J = 80 J per attempt
- GRAPPLE_PER_TICK_ENERGY_J = 10 J per tick (200 J/s ÷ 20 Hz)
- GRAPPLE_THROW_ENERGY_J = 120 J
- GRAPPLE_LOCK_ENERGY_J = 60 J
- GRAPPLE_REACH_M = to.m(1.8)
- GRIP_DECAY_PER_TICK = 50 (= q(0.005))
- Throw energy = targetMass_kg × 2 × levAdv × intensity

### Grapple Lifecycle
1. `grapple` command → resolveGrappleAttempt (new) or tick trace (existing)
2. `breakGrapple` command → resolveBreakGrapple
3. Per-tick: stepGrappleTick (drain stamina, decay grip, auto-release)
4. Modes: "grapple" | "throw" | "choke" | "jointLock"

### Backwards Compatibility
kernel.ts initializes grapple/pinned fields for old entities at tick start.

## Phase 2B/C: COMPLETE
Phases 2A/B/C, 3, 4, 5, 6 all complete. See ROADMAP for details.

## Demo Tool: tools/run-demo.ts (WORKING)
Two scenarios: Melee brawl (2v2), Ranged engagement (archer vs infantry through mud).
AI-driven commands via decideCommandsForEntity each tick.

## Combat Bug Fixes Applied
- `resolveAttack` velocity cap: body relative velocity capped at 2 m/s (APPROACH_CAP)
  to prevent sprint-speed body collisions from dominating weapon strike energy.
  Without cap, two sprinting entities at knife range would produce 864J strikes.
- `stepMoraleForEntity` outnumbered fix: changed `nearbyEnemyCount > nearbyAllyCount`
  to `nearbyEnemyCount > nearbyAllyCount + 1` (include self in friendly count).
  Without fix, every entity in a 2v2 was "outnumbered" → fear accumulated to routing threshold in 150+ ticks.
- Added `wpn_longsword` to STARTER_WEAPONS (id="wpn_longsword", reach=0.9m, twoHand, 1.5kg)

## Architecture Patterns
- Pair-based determinism: eventSeed(worldSeed, tick, idA, idB, salt)
- ImpactEvent queue → frontage cap → sortEventsDeterministic → apply
- Grapple impacts use synthetic Weapon objects (GRAPPLE_THROW_WPN, GRAPPLE_JOINTLOCK_WPN)
- deriveFunctionalState() called per-entity per-operation (not cached)
- All entity factories: mkHumanoidEntity(), mkWorld() in src/sim/testing.ts

## Test Patterns
- Import from "../src/..." (no .js extension in test files)
- Use mkHumanoidEntity(id, teamId, x_m, y_m) + mkWorld(seed, entities[])
- Brute-force seed loops (1..500) to find probabilistic outcomes
- buildWorldIndex(world) needed for functions requiring WorldIndex
