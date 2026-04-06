import { createWorld, q, stepWorld, type CommandMap, type KernelContext } from "../../../src/index.js";

const ctx: KernelContext = { tractionCoeff: q(0.9) };

export interface NarrativeChoice {
  id: string;
  text: string;
  addUnit: "KNIGHT_INFANTRY" | "AMATEUR_BOXER";
}

export const CHOICES: NarrativeChoice[] = [
  { id: "call-guard", text: "Call the city guard", addUnit: "KNIGHT_INFANTRY" },
  { id: "hire-brawler", text: "Hire a pit brawler", addUnit: "AMATEUR_BOXER" },
];

export function resolveCampaignBattle(seed: number, selected: NarrativeChoice[]): { winner: 1 | 2 | 0; combatMarkdown: string } {
  const allies = selected.map((choice, idx) => ({
    id: idx + 1,
    teamId: 1,
    seed: seed + idx,
    archetype: choice.addUnit,
    weaponId: "wpn_club",
    x_m: -1,
    y_m: idx * 0.3,
  }));

  const enemies = [
    { id: 101, teamId: 2, seed: seed + 100, archetype: "AMATEUR_BOXER", weaponId: "wpn_club", x_m: 1, y_m: 0 },
    { id: 102, teamId: 2, seed: seed + 101, archetype: "AMATEUR_BOXER", weaponId: "wpn_club", x_m: 1, y_m: 0.3 },
  ];

  const world = createWorld(seed, [...allies, ...enemies]);
  const lines: string[] = ["# Combat Log", "", `Seed: ${seed}`];

  for (let t = 0; t < 80; t += 1) {
    const commands: CommandMap = new Map();
    for (const entity of world.entities) {
      commands.set(entity.id, [{ kind: "attackNearest", intensity: q(1), mode: "strike" }]);
    }
    stepWorld(world, commands, ctx);
    lines.push(`- Tick ${world.tick}: consciousness=${world.entities.map(e => `${e.id}:${e.injury.consciousness}`).join(", ")}`);
  }

  const allyAlive = world.entities.some(e => e.teamId === 1 && !e.injury.dead);
  const enemyAlive = world.entities.some(e => e.teamId === 2 && !e.injury.dead);

  const winner: 1 | 2 | 0 = allyAlive && !enemyAlive ? 1 : enemyAlive && !allyAlive ? 2 : 0;
  lines.push("", `Winner: ${winner === 0 ? "draw" : `team ${winner}`}`);

  return { winner, combatMarkdown: lines.join("\n") };
}
