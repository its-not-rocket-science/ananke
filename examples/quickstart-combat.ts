// examples/quickstart-combat.ts — Path A: Deterministic combat kernel
//
// Two fighters — a mailed Knight vs an unarmoured Brawler — resolve a duel
// using physics-grounded impact, injury, and stamina mechanics.
//
// Run:  npm run build && node dist/examples/quickstart-combat.js [seed]
//       Try seeds 1, 7, 42 to see the range of outcomes.

import { q, SCALE, type Q }          from "../src/units.js";
import { KNIGHT_INFANTRY, HUMAN_BASE } from "../src/archetypes.js";
import { generateIndividual }          from "../src/generate.js";
import { defaultIntent }               from "../src/sim/intent.js";
import { defaultAction }               from "../src/sim/action.js";
import { defaultCondition }            from "../src/sim/condition.js";
import { defaultInjury }               from "../src/sim/injury.js";
import { v3 }                          from "../src/sim/vec3.js";
import { stepWorld }                   from "../src/sim/kernel.js";
import { buildWorldIndex }             from "../src/sim/indexing.js";
import { buildSpatialIndex }           from "../src/sim/spatial.js";
import { decideCommandsForEntity }     from "../src/sim/ai/decide.js";
import { AI_PRESETS }                  from "../src/sim/ai/presets.js";
import { STARTER_WEAPONS, STARTER_ARMOUR } from "../src/equipment.js";
import type { Entity }                 from "../src/sim/entity.js";
import type { KernelContext }          from "../src/sim/context.js";

declare const process: { argv?: string[] } | undefined;
const SEED = parseInt(typeof process !== "undefined" ? (process.argv?.[2] ?? "1") : "1", 10);
const M    = SCALE.m;

function makeEntity(id: number, teamId: number, seed: number, arch: typeof KNIGHT_INFANTRY,
                    weaponId: string, armourId?: string): Entity {
  const attrs = generateIndividual(seed, arch);
  const items = [STARTER_WEAPONS.find(w => w.id === weaponId)!,
                 ...(armourId ? [STARTER_ARMOUR.find(a => a.id === armourId)!] : [])];
  return {
    id, teamId, attributes: attrs,
    energy:   { reserveEnergy_J: attrs.performance.reserveEnergy_J, fatigue: q(0) },
    loadout:  { items }, traits: [],
    position_m:   v3(id === 1 ? 0 : Math.trunc(0.6 * M), 0, 0),
    velocity_mps: v3(0, 0, 0),
    intent: defaultIntent(), action: defaultAction(),
    condition: defaultCondition(), injury: defaultInjury(),
    grapple: { holdingTargetId: 0, heldByIds: [], gripQ: q(0), position: "standing" as const },
  };
}

const world = {
  tick: 0, seed: SEED,
  entities: [
    makeEntity(1, 1, SEED,     KNIGHT_INFANTRY, "wpn_longsword", "arm_mail"),
    makeEntity(2, 2, SEED + 1, HUMAN_BASE,      "wpn_club"),
  ],
};
const ctx: KernelContext = { tractionCoeff: q(0.90) as Q };

for (let t = 0; t < 400 && !world.entities.every(e => e.injury.dead || !e.injury.consciousness); t++) {
  const index   = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * M));
  const cmds    = new Map();
  for (const e of world.entities)
    if (!e.injury.dead) cmds.set(e.id, decideCommandsForEntity(world, index, spatial, e, AI_PRESETS.lineInfantry!));
  stepWorld(world, cmds, ctx);
}

const knight  = world.entities[0]!;
const brawler = world.entities[1]!;
const pct     = (v: number) => ((v / SCALE.Q) * 100).toFixed(0).padStart(3) + "%";
const alive   = (e: Entity) => !e.injury.dead && e.injury.consciousness > 0;
const winner  = alive(knight) && !alive(brawler) ? "Knight" :
                alive(brawler) && !alive(knight) ? "Brawler" : "Draw";

console.log(`\nSeed ${SEED} — ${winner} wins at tick ${world.tick}`);
console.log(`  Knight:  shock=${pct(knight.injury.shock)}  consciousness=${pct(knight.injury.consciousness)}  fatigue=${pct(knight.energy.fatigue)}  dead=${knight.injury.dead}`);
console.log(`  Brawler: shock=${pct(brawler.injury.shock)}  consciousness=${pct(brawler.injury.consciousness)}  fatigue=${pct(brawler.energy.fatigue)}  dead=${brawler.injury.dead}`);
console.log(`\n  Physics: mail absorbs kinetic energy → Knight survives more hits despite lower mass`);
console.log(`           Try seeds 1–20 to see how outcome distribution emerges from physics`);
