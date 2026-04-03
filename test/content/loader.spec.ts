import { describe, it, expect, afterEach } from "vitest";
import { resolve } from "node:path";
import { loadContentPack, clearContentPackCache } from "../../src/content/loader.js";
import { applyContentPack } from "../../src/content/injector.js";
import { createWorld } from "../../src/world-factory.js";
import { stepWorld } from "../../src/sim/kernel.js";
import { q } from "../../src/units.js";
import { clearCatalog } from "../../src/catalog.js";
import { clearWorldExtensions } from "../../src/world-factory.js";

afterEach(() => {
  clearContentPackCache();
  clearCatalog();
  clearWorldExtensions();
});

describe("content loader + injection runtime", () => {
  it("loads fantasy starter and runs a tick", async () => {
    const pack = await loadContentPack(resolve("examples/content-packs/fantasy-starter.json"));
    const world = applyContentPack({ tick: 0, seed: 1337, entities: [] }, pack);
    const simWorld = createWorld(1337, [{ id: 1, teamId: 1, seed: 7, archetype: "fantasy_knight", weaponId: "iron_longsword", armourId: "chainmail" }]);

    stepWorld(simWorld, new Map(), { tractionCoeff: q(1) });

    expect(world.runtimeState?.contentRegistry?.packs.size).toBe(1);
    expect(simWorld.tick).toBe(1);
  });

  it("loads sci-fi and vampire/werewolf packs", async () => {
    const sciFi = await loadContentPack(resolve("examples/content-packs/sci-fi.json"));
    const vampire = await loadContentPack(resolve("examples/content-packs/vampire-werewolf.json"));

    const world = applyContentPack(applyContentPack({ tick: 0, seed: 42, entities: [] }, sciFi), vampire);
    expect(world.runtimeState?.contentRegistry?.terrain.has("vacuum_hull")).toBe(true);
    expect(world.runtimeState?.contentRegistry?.archetypes.has("night_vampire")).toBe(true);
  });
});
