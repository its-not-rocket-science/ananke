// tools/run-demo.ts
import {
  q, SCALE,
  TUNING,
  stepWorld,
  STARTER_WEAPONS,
  STARTER_ARMOUR,
  STARTER_SHIELDS,
  mkWorld,
  mkHumanoidEntity,
  type KernelContext,
  type CommandMap,
  type TraceEvent,
  type TraceSink,
} from "../src/index.js";

class StdoutTrace implements TraceSink {
  onEvent(ev: TraceEvent): void {
    switch (ev.kind) {
      case "tickStart":
        console.log(`\n=== tick ${ev.tick} ===`);
        break;
      case "move":
        console.log(
          `move e${ev.entityId} pos=(${ev.pos.x},${ev.pos.y}) vel=(${ev.vel.x},${ev.vel.y})`
        );
        break;
      case "attack":
        console.log(
          `atk e${ev.attackerId} -> e${ev.targetId} ${ev.region} E=${ev.energy_J} arm=${ev.armoured} blk=${ev.blocked} shd=${ev.shieldBlocked} pry=${ev.parried}`
        );
        break;
      case "injury":
        console.log(
          `inj e${ev.entityId} shock=${ev.shockQ} fluid=${ev.fluidLossQ} conc=${ev.consciousnessQ} dead=${ev.dead}`
        );
        break;
      case "attackAttempt":
        console.log(
          `try e${ev.attackerId} -> e${ev.targetId} hit=${ev.hit} blk=${ev.blocked} pry=${ev.parried} q=${ev.hitQuality} area=${ev.area}`
        );
        break;
    }
  }
}

function main(): void {
  const NUM_TICKS = 80;
  const a = mkHumanoidEntity(1, 1, 0, 0);
  const b = mkHumanoidEntity(2, 2, Math.trunc(0.7 * SCALE.m), 0);

  a.loadout = { items: [STARTER_WEAPONS.find(w => w.id === "wpn_club")!] };
  b.loadout = { items: [STARTER_ARMOUR[1]!, STARTER_SHIELDS[0]!] }; // torso armour for demo

  const world = mkWorld(12345, [a, b]);

  const cmds: CommandMap = new Map();
  cmds.set(1, [{ kind: "attack", targetId: 2, weaponId: "wpn_club", intensity: q(1.0) }]);
  cmds.set(2, [{ kind: "defend", mode: "block", intensity: q(1.0) }]);

  const trace = new StdoutTrace();
  const ctx: KernelContext = { tractionCoeff: q(0.9), tuning: TUNING.tactical, trace };

  for (let i = 0; i < NUM_TICKS; i++) stepWorld(world, cmds, ctx);
}

main();