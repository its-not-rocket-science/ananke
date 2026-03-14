# Ananke — Use-Case Validation: Confirm Fit for Purpose

*Integration & Adoption Milestone 1*

---

## Purpose

This document is the **Design Document Addendum** called for in the ROADMAP's
"Confirm Fit for Purpose" milestone. It explicitly maps Ananke's simulation
features to tangible, player-facing game mechanics, identifying where the engine
adds clear value and where its depth would be invisible or counterproductive.

---

## Feature-to-Mechanic Translation

| Simulation feature | Underlying physics | Player-facing mechanic |
|---|---|---|
| Per-region injury model (9 regions) | Damage distributes across torso, limbs, head with tissue-specific thresholds | Hit location matters: a leg wound makes enemies limp (halved speed); an arm wound reduces attack force; a head hit threatens consciousness |
| `shock` and `consciousness` accumulators | Cumulative energy → shock → unconsciousness chain | Enemies don't vanish at 0 HP — they drop unconscious, can be captured, or bleed out over time. Players see visible degradation |
| `fatigue` and `reserveEnergy_J` | Watts-based AMR drain vs. reserve energy | Sustained fighting degrades attack quality. A sprint to close distance costs the same energy as several attacks; armour weight matters |
| `fearQ` and morale routing | Cumulative shock-derived fear vs. `distressTolerance` threshold | Enemies route when sufficiently terrified, even while physically capable. Leaders, banners, and rallying change outcomes without a single swing |
| Q-scaled `controlQuality`, `stability`, `fineControl` | Motor control parameters gating hit quality | Exhausted, injured, or frightened fighters miss more and land weaker hits — not binary, but proportional degradation |
| Fixed-point determinism + `eventSeed` | Identical seed → identical replay | Replays, save-scumming prevention, competitive fairness, and post-mortem debugging are first-class |
| `BodyPlan` variants (humanoid, quadruped, avian, octopoid) | Region maps, reach, stance modifiers per plan | Monster design has physical constraints; a dragon with broken wings cannot fly; an octopus grapples with multiple arms simultaneously |
| Infection, disease, wound aging | Bacterial growth, sepsis threshold, daily healing | Wounds matter beyond the fight. A deep cut that goes untreated becomes life-threatening over days; field medicine is a meaningful choice |
| Sleep debt and circadian rhythm | Two-factor fatigue model, circadian alertness curve | Night operations have real cost. Planning a dawn raid means fighters are at peak alertness; guards on night shift are cognitively impaired |
| Weather modifiers (rain, blizzard, fog) | Traction, vision, thermal deltas | Rain degrades footing and archery. Blizzard reduces vision to near zero and induces cold stress simultaneously |
| Mounted combat and charge energy | ½mv² kinetic energy fraction | Cavalry charges feel physically correct: horse mass + speed = devastating impact. A dismounted rider takes a real fall injury |
| Environmental hazard zones | Linear exposure falloff, per-second effect rates | Stepping into a fire does escalating damage over time. Tactical positioning around poison clouds is a physics problem, not a HP-zone abstraction |

---

## Game Types: Fit Assessment

### Strong fit ✓

**Tactical RPGs and strategy games** (XCOM-style, Warhammer-style)
- Players already think about cover, flanking, and unit positioning
- Per-region injury + shock accumulation creates meaningful targeting decisions
- Morale and routing make small-unit tactics dynamic without scripting

**Survival games with combat**
- Sleep debt, nutrition, disease, and wound aging add depth to every encounter
- Injuries have real downtime cost — players feel the consequence of poor decisions

**Simulation-heavy action RPGs** (Kingdom Come: Deliverance style)
- Physics-first melee makes skill visible in outcomes, not just in UI numbers
- Players who learn the system can exploit fatigue, fear, and reach; those who don't lose predictably

**Tabletop RPG simulation engines / virtual tabletops**
- Deterministic, data-driven, and archetype-based — maps naturally to TTRPG stat blocks
- Narrative layer (Phase 18) and chronicle system (Phase 45) are direct feature parity

---

### Weak fit ✗

**Fast-paced action games** (hack-and-slash, arena shooters)
- Joule-based energy expenditure and per-tick accumulation have no visible output in 0.1-second combat windows
- Fixed-point fixed-rate simulation (20 Hz) adds complexity without payoff when the target is frame-perfect feel

**Casual or narrative-first games**
- The system's depth is invisible unless the UI exposes it — a significant production investment for uncertain player value
- Consider using the Narrative Layer (Phase 18) + Chronicle (Phase 45) alone, with simplified combat

**Mobile games with simple combat loops**
- Q-scaled arithmetic and the Entity data model carry more complexity than a mobile combat session justifies

---

## Decision Gate Criteria

Proceed to onboarding if **all three** apply:

1. **Feature visibility**: The design document shows ≥ 5 simulation features with clear, testable player-facing effects (see table above).
2. **Vertical slice result**: The 1v1 prototype (see `tools/vertical-slice.ts`) produces emergent, varied outcomes across seeds — fights don't all end the same way.
3. **No abstraction overhead**: The team can write `stepWorld` integration code without needing to re-model every simulation detail in an intermediate layer.

---

## Vertical Slice Reference

`tools/vertical-slice.ts` implements a focused 1v1 duel between a trained
knight (mail armour, longsword, `KNIGHT_INFANTRY` archetype) and an unarmoured
brawler (`HUMAN_BASE` archetype, club) to validate these specific claims:

| Claim | Observable evidence |
|---|---|
| Armour changes outcome, not just duration | Knight's injury shock accumulates more slowly despite equal energy hits |
| Fatigue degrades attack quality over time | Hit quality and energy output drop across the latter half of the fight |
| Fear accumulates continuously, not at kill-threshold | Both fighters' `fearQ` rises from zero well before either is near death |
| Fights end via multiple mechanisms | KO (consciousness=0), routing (fear≥threshold), or lethal injury across different seeds |
| Outcome is deterministic per seed | Running the same seed always produces identical tick-by-tick results |

Run the slice with:
```
npm run build && node dist/tools/vertical-slice.js
```

Or vary the seed (pass as first argument):
```
node dist/tools/vertical-slice.js 42
```

---

## Conclusion

Ananke is a strong fit for games where **player agency connects to physical
consequences**: tactical positioning, resource management, morale, and injury
care. It is a poor fit where speed of interaction outweighs depth of outcome.

The vertical slice demonstrates that physics fidelity generates emergent
variety and strategic texture without scripting. Proceed to milestone 2
(Technical Onboarding) if the target game design maps at least 5 simulation
features to visible player mechanics.
