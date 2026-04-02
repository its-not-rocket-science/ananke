import { describe, expect, it } from "vitest";
import { q } from "../src/units.js";
import { mkHumanoidEntity, mkWorld } from "../src/sim/testing.js";
import { normalizeWorldInPlace } from "../src/sim/normalization.js";
import { stepWorld } from "../src/sim/kernel.js";
import { deserializeReplay, serializeReplay, replayTo, type Replay } from "../src/replay.js";
import { diffWorldState, applyDiff } from "../src/snapshot.js";

describe("normalization migration boundaries", () => {
  it("normalizes legacy world shape before stepping", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0) as Record<string, unknown>;
    delete (e as { ai?: unknown }).ai;
    delete ((e["attributes"] as Record<string, unknown>)["perception"]);
    delete ((e["grapple"] as Record<string, unknown>)["position"]);
    delete ((e["condition"] as Record<string, unknown>)["suppressedTicks"]);

    const world = mkWorld(1, [e as unknown as ReturnType<typeof mkHumanoidEntity>]);
    normalizeWorldInPlace(world);

    expect((world.entities[0]!.attributes as Record<string, unknown>)["perception"]).toBeDefined();
    expect((world.entities[0]!.grapple as Record<string, unknown>)["position"]).toBe("standing");
    expect((world.entities[0]!.condition as Record<string, unknown>)["suppressedTicks"]).toBe(0);

    expect(() => stepWorld(world, new Map(), { tractionCoeff: q(1.0) })).not.toThrow();
  });

  it("normalizes replay initial state when deserializing legacy replay JSON", () => {
    const e = mkHumanoidEntity(1, 1, 0, 0);
    const legacyInitial = mkWorld(5, [e]) as unknown as Record<string, unknown>;
    delete (((legacyInitial["entities"] as unknown[])[0] as Record<string, unknown>)["ai"]);
    delete ((((legacyInitial["entities"] as unknown[])[0] as Record<string, unknown>)["attributes"] as Record<string, unknown>)["perception"]);

    const replay: Replay = {
      initialState: legacyInitial as unknown as Replay["initialState"],
      frames: [],
    };

    const restored = deserializeReplay(serializeReplay(replay));
    const entity = restored.initialState.entities[0]!;
    expect(entity.attributes.perception).toBeDefined();
    expect(entity.ai).toBeDefined();

    expect(() => replayTo(restored, 0, { tractionCoeff: q(1.0) })).not.toThrow();
  });

  it("normalizes worlds reconstructed by snapshot applyDiff", () => {
    const base = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0)]);
    const next = mkWorld(1, [mkHumanoidEntity(1, 1, 0, 0), mkHumanoidEntity(2, 2, 1, 0)]);
    delete ((next.entities[1]!.attributes as Record<string, unknown>)["perception"]);
    delete ((next.entities[1]!.grapple as Record<string, unknown>)["position"]);

    const diff = diffWorldState(base, next);
    const reconstructed = applyDiff(base, diff);
    const added = reconstructed.entities.find((x) => x.id === 2)!;

    expect(added.attributes.perception).toBeDefined();
    expect(added.grapple.position).toBe("standing");
  });
});
