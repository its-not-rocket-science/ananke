// tools/generate-fixtures.ts — Generate golden fixture files for CI determinism checks
//
// Re-run this script only when you intentionally want to update the fixtures
// (e.g. after a physics-altering change that has been reviewed and accepted).
//
// Run:  npm run build && node dist/tools/generate-fixtures.js
//
// Produces:
//   fixtures/replay-knight-brawler.json  — serialised Replay + expected final state
//   fixtures/campaign-save-v1.json       — minimal CampaignState round-trip fixture

import { writeFileSync, mkdirSync } from "node:fs";
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
import { ReplayRecorder, serializeReplay } from "../src/replay.js";
import { createCampaign, addLocation, serialiseCampaign } from "../src/campaign.js";
import type { Entity }                 from "../src/sim/entity.js";
import type { KernelContext }          from "../src/sim/context.js";

const M    = SCALE.m;
const SEED = 1;

// ── Replay fixture ────────────────────────────────────────────────────────────

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
const recorder = new ReplayRecorder(world);

for (let t = 0; t < 400 && !world.entities.every(e => e.injury.dead || !e.injury.consciousness); t++) {
  const index   = buildWorldIndex(world);
  const spatial = buildSpatialIndex(world, Math.trunc(4 * M));
  const cmds    = new Map();
  for (const e of world.entities)
    if (!e.injury.dead) cmds.set(e.id, decideCommandsForEntity(world, index, spatial, e, AI_PRESETS.lineInfantry!));
  recorder.record(world.tick, cmds);
  stepWorld(world, cmds, ctx);
}

const knight  = world.entities[0]!;
const brawler = world.entities[1]!;

const replayFixture = {
  version:  "0.1.0",
  scenario: "knight-vs-brawler",
  seed:     SEED,
  // Expected final state — used by the test to verify determinism
  expected: {
    finalTick:         world.tick,
    knightDead:        knight.injury.dead,
    knightShock:       knight.injury.shock,
    knightConsciousness: knight.injury.consciousness,
    brawlerDead:       brawler.injury.dead,
    brawlerShock:      brawler.injury.shock,
    brawlerConsciousness: brawler.injury.consciousness,
  },
  replay: JSON.parse(serializeReplay(recorder.toReplay())),
};

// ── Campaign save fixture ─────────────────────────────────────────────────────

const campaign = createCampaign("test-campaign", [
  makeEntity(1, 1, SEED, KNIGHT_INFANTRY, "wpn_longsword", "arm_mail"),
], "2000-01-01T00:00:00.000Z");

addLocation(campaign, {
  id: "loc_keep", name: "The Keep", elevation_m: 100,
  travelCost: new Map([["loc_village", 3600]]),
});
addLocation(campaign, {
  id: "loc_village", name: "The Village", elevation_m: 50,
  travelCost: new Map([["loc_keep", 3600]]),
});

const campaignFixture = {
  version: "0.1.0",
  note:    "Minimal campaign save: 1 entity, 2 locations, worldTime_s=0",
  save:    JSON.parse(serialiseCampaign(campaign)),
};

// ── Write files ───────────────────────────────────────────────────────────────

mkdirSync("fixtures", { recursive: true });

writeFileSync("fixtures/replay-knight-brawler.json",
  JSON.stringify(replayFixture, null, 2));
console.log(`✓ fixtures/replay-knight-brawler.json  (finalTick=${world.tick}, brawlerDead=${brawler.injury.dead})`);

writeFileSync("fixtures/campaign-save-v1.json",
  JSON.stringify(campaignFixture, null, 2));
console.log(`✓ fixtures/campaign-save-v1.json  (locations=${campaign.locations.size})`);
