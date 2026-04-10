# Narrative Stress Test — Plot Armour Analyser

The **Narrative Stress Test** answers a single question:

> *If I run this scene a hundred times with different random seeds, how often does physics produce the story I want?*

The complement is the **Deus Ex score** — a 0–10 integer-scale measure of
authorial effort:

| Score | Label | Meaning |
|-------|-------|---------|
| 0.0–1.0 | None — plausible | Physics delivers it without help |
| 1.0–4.0 | Light | A modest push in setup is enough |
| 4.0–7.0 | Moderate | Deliberate staging required |
| 7.0–9.0 | Heavy | Significant plot armour needed |
| 9.0–10.0 | Extreme | Effectively a miracle |

---

## Quick start

```bash
npm run build && node dist/tools/narrative-stress-test.js [seeds]
npm run build && node dist/tools/narrative-stress-cinema.js [seeds]
```

A minimal scenario:

```typescript pseudocode
import {
  runNarrativeStressTest,
  formatStressTestReport,
  beatEntityDefeated,
  beatEntitySurvives,
  type NarrativeScenario,
} from "./src/narrative-stress.js";

const scenario: NarrativeScenario = {
  name: "Knight defeats Guard",
  setup()    { return mkWorld(1, [mkKnight(1, 1, 0, 0), mkKnight(2, 2, 15000, 0)]); },
  commands:  (world) => buildAICommands(world, buildWorldIndex(world),
                          buildSpatialIndex(world, 40000), () => AI_PRESETS["lineInfantry"]!),
  beats: [
    { tickWindow: [1, 600], predicate: beatEntityDefeated(2),  description: "Guard defeated" },
    { tickWindow: [1, 600], predicate: beatEntitySurvives(1),  description: "Knight survives" },
  ],
};

const seeds  = Array.from({ length: 100 }, (_, i) => i + 1);
const result = runNarrativeStressTest(scenario, seeds);
console.log(formatStressTestReport(result));
```

---

## API

### `NarrativeScenario`

| Field | Type | Purpose |
|-------|------|---------|
| `name` | `string` | Display name |
| `setup` | `() => WorldState` | Returns a fresh world; seed is overridden per trial |
| `commands` | `(world) => CommandMap` | AI or scripted commands, called each tick |
| `beats` | `NarrativeBeat[]` | Ordered list of story outcomes to track |
| `maxTicks?` | `number` | Trial time limit (default: 600 = 30 s at 20 Hz) |

### `NarrativeBeat`

| Field | Type | Purpose |
|-------|------|---------|
| `tickWindow` | `[first, last]` | Inclusive tick range in which the beat is checked |
| `predicate` | `(world) => boolean` | Returns `true` when the beat is satisfied |
| `description` | `string` | Label shown in reports |

### `StressTestResult`

| Field | Type | Meaning |
|-------|------|---------|
| `successRate` | `number` | Fraction of runs where **all** beats passed |
| `narrativePush` | `number` | `1 − successRate`, range 0–1 |
| `deusExScore` | `number` | `narrativePush × 10`, range 0.0–10.0 |
| `beatResults` | `BeatResult[]` | Per-beat breakdown |
| `successSeeds` | `number[]` | Seeds where everything worked (use for replay) |

### `BeatResult`

| Field | Meaning |
|-------|---------|
| `passRate` | Fraction of runs where this beat fired in its window |
| `beatPush` | `1 − passRate` — this beat's individual resistance |

### Beat predicate helpers

```typescript pseudocode
beatEntityDefeated(id)            // dead or consciousness ≤ 10 %
beatEntitySurvives(id)            // alive and conscious
beatTeamDefeated(teamId)          // every entity on team is down
beatEntityShockExceeds(id, q)     // shock accumulator crosses threshold
beatEntityFatigued(id, q)         // fatigue accumulator crosses threshold
```

---

## Reading a report

```
Narrative Stress Test: Knight defeats Guard
────────────────────────────────────────────────────
Runs:            100
Success rate:    36.0%
Narrative push:  0.6400  (moderate)
Deus Ex score:   6.4 / 10         ← headline number

Beat breakdown:
  ✗  36.0%  [push 0.64]  Guard defeated     ← bottleneck: fires only 36 % of the time
  ✓ 100.0%  [push 0.00]  Knight survives    ← no push needed; happens every run
```

The `[push X.XX]` column per beat reveals **which beat is doing the most work**.
A beat with push near `1.00` is the bottleneck; a beat with push near `0.00` is
free. The overall Deus Ex score is the push on the *conjunction* of all beats.

---

## Cinematic benchmark results

Results from 100 seeds per scenario.  Entity loadout notes are in parentheses.
"Unarmoured" means plate was stripped to approximate period/genre accuracy.

### 1 · Boromir's Last Stand — *The Lord of the Rings*
**Setup:** Boromir (unarmoured) vs. three Uruk-Hai (full plate), 90 s window
**Deus Ex: 9.6 / 10** (extreme — plot armour)

| Beat | Pass rate | Beat push |
|------|-----------|-----------|
| Boromir takes serious shock | 25 % | 0.75 |
| **Boromir fells at least one Uruk** ← bottleneck | 18 % | **0.82** |
| Boromir falls | 100 % | 0.00 |

> Dying is free — physics delivers it without help. Getting the heroic last stand
> (felling an opponent first) is what costs plot armour. The scene earns its
> emotional weight precisely because the physics makes it genuinely hard.

---

### 2 · Rob Roy vs Cunningham — *Rob Roy* (1995)
**Setup:** Both unarmoured; Rob Roy +0.20 fatigue (trail-worn), Cunningham +0.05
**Deus Ex: 10.0 / 10** (extreme — plot armour)

| Beat | Pass rate | Beat push |
|------|-----------|-----------|
| **Rob Roy absorbs near-fatal wound (shock > 40 %)** ← bottleneck | 0 % | **1.00** |
| Cunningham is defeated | 82 % | 0.18 |
| Rob Roy survives | 100 % | 0.00 |

> Cunningham is beaten naturally 82 % of the time — Rob Roy winning is plausible.
> What is impossible is the *specific dramatic staging*: absorbing a near-fatal
> slash and *still* winning. The shock threshold is the sole source of the extreme
> score; the victory itself would cost only ~2.0.

---

### 3 · Final Standoff — *The Good, the Bad and the Ugly* (1966)
**Setup:** All three unarmoured; Tuco starts at q(0.85) fatigue (empty revolver)
**Deus Ex: 10.0 / 10** (extreme — plot armour)

| Beat | Pass rate | Beat push |
|------|-----------|-----------|
| Angel Eyes is shot | 8 % | 0.92 |
| **Tuco is defeated** ← bottleneck | 0 % | **1.00** |
| Blondie walks away | 100 % | 0.00 |

> Even at near-maximum fatigue Tuco is never actually defeated in 100 runs —
> Blondie's attention is split between two opponents and time runs out.
> The simulation insight: a severely fatigued opponent in a multi-target fight
> can remain alive indefinitely if the hero is occupied elsewhere.

---

### 4 · Macbeth's Final Stand — *Macbeth*, Polanski (1971)
**Setup:** Macbeth +0.40 fatigue (battle-worn) vs. Macduff + 2 soldiers at +0.10, 60 s window
**Deus Ex: 8.7 / 10** (heavy)

| Beat | Pass rate | Beat push |
|------|-----------|-----------|
| **Macbeth fells at least one before the end** ← bottleneck | 18 % | **0.82** |
| Macbeth is slain | 88 % | 0.12 |

> Macbeth's death is easy — the physics produces it nearly every time. The
> dramatic cost is the heroic quality of the death: killing even one opponent
> before falling requires heavy authorial pressure.

---

### 5 · Bolivian Finale — *Butch Cassidy and the Sundance Kid* (1969)
**Setup:** Both heroes unarmoured, +0.35 fatigue; 4 cavalry unarmoured, fresh
**Deus Ex: 0.3 / 10** (none — plausible)

| Beat | Pass rate | Beat push |
|------|-----------|-----------|
| Butch falls | 100 % | 0.00 |
| Sundance falls | 97 % | 0.03 |

> The lowest score in the benchmark. Physics says their fate is not tragedy —
> it is simply physics. 2-vs-4, unarmoured, pre-wounded: the outcome is
> almost deterministic. The film's emotional power comes from the *freeze frame*,
> not from the implausibility of dying.

---

### 6 · Sanjuro's Final Duel — *Yojimbo* (1961)
**Setup:** Sanjuro unarmoured, q(0.50) fatigue; Uyesaka + bodyguard unarmoured, fresh
**Deus Ex: 10.0 / 10** (extreme — plot armour)

| Beat | Pass rate | Beat push |
|------|-----------|-----------|
| **Sanjuro defeats both opponents** ← bottleneck | 0 % | **1.00** |
| Sanjuro survives | 100 % | 0.00 |

> Sanjuro at half capacity never defeats two fresh opponents in 100 runs.
> The simulation confirms this is the archetype of the stylised-action miracle:
> surviving alone is free, but winning is impossible without authorial override.
> A Deus Ex score of 10 means the scene genuinely requires the author to decide
> the outcome — physics will not cooperate.

---

### 7 · William vs Adhemar — *A Knight's Tale* (2001)
**Setup:** Both in full plate; William +0.15 fatigue (tournament-worn), Adhemar +0.05
**Deus Ex: 6.4 / 10** (moderate)

| Beat | Pass rate | Beat push |
|------|-----------|-----------|
| **Adhemar is defeated** ← bottleneck | 36 % | **0.64** |
| William survives | 100 % | 0.00 |

> The quintessential underdog tournament arc: the champion wins most of the
> time, but the underdog has a genuine 36 % chance — enough to make the
> outcome feel earned rather than arbitrary. Moderate push is precisely
> the right weight for a sports drama.

---

### 8 · Darth Maul vs Obi-Wan & Qui-Gon — *The Phantom Menace* (1999)
**Setup:** All three unarmoured (robes); Jedi +0.10 fatigue (boarding action)
**Deus Ex: 2.0 / 10** (light)

| Beat | Pass rate | Beat push |
|------|-----------|-----------|
| Qui-Gon is defeated | 80 % | 0.20 |
| Maul is defeated | 100 % | 0.00 |
| Obi-Wan survives | 100 % | 0.00 |

> Counterintuitively, this scene has the *second-lowest* Deus Ex score in the
> benchmark. Physics naturally produces the canonical outcome 80 % of the time:
> a 1-vs-2 fight usually eliminates one target first, and Maul then faces a
> fresh opponent alone. The film's dramatic staging (the laser gates, the
> walkway) is window-dressing — the physics needed almost no help.

---

### 9 · Inigo Montoya vs Count Rugen — *The Princess Bride* (1987)
**Setup:** Both unarmoured; Inigo q(0.65) fatigue (stabbed twice), Rugen +0.10
**Deus Ex: 2.6 / 10** (light)

| Beat | Pass rate | Beat push |
|------|-----------|-----------|
| Rugen is slain | 74 % | 0.26 |
| Inigo survives | 100 % | 0.00 |

> The most revealing result in the benchmark. Despite Inigo being at 65 %
> fatigue — near the simulation's incapacitation threshold — he still wins
> 74 % of the time. The scene *feels* like extreme plot armour but the physics
> disagrees: **at this skill level, fatigue is not the dominant factor**.
> Rugen simply is not a better fighter; he is merely less exhausted.
> The Deus Ex score of 2.6 means the scene needs only a light authorial touch,
> not a miracle.

---

### 10 · Achilles vs Hector — *The Iliad*
**Setup:** Both unarmoured (bronze age); Hector q(0.45) fatigue (defending the city all day), Achilles fresh
**Deus Ex: 0.2 / 10** (none — plausible)

| Beat | Pass rate | Beat push |
|------|-----------|-----------|
| Hector falls | 98 % | 0.02 |
| Achilles survives | 100 % | 0.00 |

> Near-deterministic. The fresh-vs-fatigued asymmetry is sufficient — physics
> requires almost no help to deliver Homer's outcome. The duel was never really
> in doubt; its drama lies in its meaning, not its suspense.

---

### 11 · Maximus vs Commodus — *Gladiator* (2000)
**Setup:** Both unarmoured (Roman arena gear); Maximus q(0.55) fatigue (pre-stabbed), Commodus +0.05
**Deus Ex: 10.0 / 10** (extreme — plot armour)

| Beat | Pass rate | Beat push |
|------|-----------|-----------|
| **Maximus registers near-fatal shock** ← bottleneck | 0 % | **1.00** |
| Commodus is defeated | 79 % | 0.21 |

> Commodus is defeated naturally in 79 % of runs — Maximus is still the better
> fighter despite his wound. But the *staging* of the scene (Maximus visibly
> dying while fighting) is impossible: the shock threshold never fires.
> The movie earns its extreme score not from the victory but from the theatrical
> insistence on showing Maximus dying at the same moment he wins.

---

### 12 · Leonidas' Last Stand — *300* (2006)
**Setup:** 2 Spartans unarmoured, +0.45 fatigue (three days of battle); 5 Persians unarmoured, fresh
**Deus Ex: 10.0 / 10** (extreme — plot armour)

| Beat | Pass rate | Beat push |
|------|-----------|-----------|
| **Leonidas takes serious wounds** ← bottleneck | 0 % | **1.00** |
| Spartans take at least one Persian with them | 100 % | 0.00 |
| The Spartan last stand ends — both fall | 100 % | 0.00 |

> The heroic sacrifice itself is entirely plausible — physics delivers it every
> time (0.00 push on both "takes a Persian" and "both fall"). Only the theatrical
> staging of Leonidas visibly suffering serious wounds requires authorial input.
> The scene's message — that they chose to die, and did so heroically — is one
> the simulation endorses without hesitation.

---

## Simulation insights from the benchmark

These results reveal properties of the physics engine that are not obvious from
reading the code:

**1. Shock thresholds above ~0.35 are rare in unarmoured melee.**
Scenarios with shock beats set above 0.40 (Rob Roy, Maximus, Leonidas) all
return `0 %` pass rate. Ananke's damage model accumulates shock gradually;
single-blow incapacitation is calibrated around armoured combat. Writers
wanting "visibly wounded but still fighting" scenes should either lower the
threshold (≤ 0.25) or add a mechanism that concentrates damage into fewer hits.

**2. Fatigue is the dominant asymmetry in 1-vs-1, but skill dominates fatigue.**
Achilles at `q(0.45)` fatigued Hector is nearly deterministic (0.2 push).
Yet Inigo at `q(0.65)` fatigue against a less-fatigued but otherwise equal
opponent still wins 74 % — because the opponents are intrinsically equal in
skill, and skill slightly outweighs fatigue in that range.

**3. Multi-target fight dynamics diverge from intuition.**
In the Phantom Menace scenario, Maul fighting 1-vs-2 eliminates one Jedi 80 %
of the time and is then always defeated alone — giving the scene a 2.0 push,
lower than a 1-vs-1 underdog fight. In the GBU scenario, a q(0.85)-fatigue
Tuco is never defeated across 100 runs because Blondie never reaches him
before time expires.

**4. The *quality* of a heroic death costs far more than the death itself.**
Boromir dying is free (100 % pass rate). Boromir dying *having first felled an
Uruk* costs 0.82 push per beat. The simulation agrees with the audience:
it is the heroic detail, not the dying, that demands narrative effort.

**5. Many "extreme" cinematic moments are staging costs, not outcome costs.**
Rob Roy winning costs ~2.0 push. Rob Roy winning *while visibly absorbing a
near-fatal slash* costs 10.0. Commodus losing costs ~2.1. Commodus losing
*while Maximus visibly dies at the same moment* costs 10.0. The physics delivers
the outcome; the author pays only for the choreography.

---

## Writing your own scenarios

**Step 1 — identify the story beats.**
Write down what *must* happen for the scene to work, in plain English.
Each clause becomes a `NarrativeBeat`.

**Step 2 — choose a tick window.**
Beats must fire within `[firstTick, lastTick]`. Use:
- `[1, 600]` for a 30-second fight (default)
- `[1, 1200]` for a 60-second extended battle
- `[minDelay, maxTick]` if the beat should not trigger too early

**Step 3 — strip armour for non-plate characters.**
Knights default to full plate. For rangers, samurai, gunslingers, gladiators,
and most historical warriors, remove plate before returning the entity:

```typescript pseudocode
const hero = mkKnight(1, 1, 0, 0);
hero.loadout.items = hero.loadout.items.filter(i => i.kind !== "armour");
```

**Step 4 — set fatigue for battle-worn characters.**
`entity.energy.fatigue = q(X)` where:
- `q(0.15–0.25)` — lightly tired (tournament fatigue, minor wounds)
- `q(0.35–0.45)` — significantly worn (extended battle, multiple wounds)
- `q(0.55–0.70)` — near the limit (stabbed, long retreat, exhausted)
- `q(0.85+)` — effectively incapacitated (note: still survives, just rarely wins)

**Step 5 — run with ≥ 50 seeds for stable results.**
With 30 seeds the standard error on a 50 % event is ±9 percentage points;
with 100 seeds it drops to ±5. Use `SEEDS_100 = Array.from({length:100}, (_,i) => i+1)`.

**Step 6 — interpret the bottleneck beat.**
The beat with the highest `beatPush` is the scene's constraint.  A Deus Ex score
of 10.0 driven by a single beat at push 1.00 means *that specific beat* never
fires — reconsider whether it is testable with the current simulation primitives.
