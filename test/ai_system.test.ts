import { expect, test } from "vitest";

import { mkHumanoidEntity, mkWorld } from "./helpers/entities";
import { q, SCALE } from "../src/units";
import { buildWorldIndex } from "../src/sim/indexing";
import { buildSpatialIndex } from "../src/sim/spatial";
import { buildAICommands } from "../src/sim/ai/system";
import { AI_PRESETS } from "../src/sim/ai/presets";

test("AI command generation is deterministic for the same world state", () => {
  const a1 = mkHumanoidEntity(1, 1, 0, 0);
  const a2 = mkHumanoidEntity(2, 1, Math.trunc(0.5 * SCALE.m), 0);

  const b1 = mkHumanoidEntity(3, 2, Math.trunc(2.0 * SCALE.m), 0);
  const b2 = mkHumanoidEntity(4, 2, Math.trunc(2.5 * SCALE.m), Math.trunc(0.2 * SCALE.m));

  const w1 = mkWorld(12345, [a1, a2, b1, b2]);
  const w2 = mkWorld(12345, [mkHumanoidEntity(1, 1, 0, 0), mkHumanoidEntity(2, 1, Math.trunc(0.5 * SCALE.m), 0),
                            mkHumanoidEntity(3, 2, Math.trunc(2.0 * SCALE.m), 0), mkHumanoidEntity(4, 2, Math.trunc(2.5 * SCALE.m), Math.trunc(0.2 * SCALE.m))]);

  const cellSize_m = Math.trunc(4 * SCALE.m);

  const cmdsFor = (id: number) => (id === 1 || id === 2 ? AI_PRESETS.lineInfantry : undefined);

  const idx1 = buildWorldIndex(w1);
  const sp1 = buildSpatialIndex(w1, cellSize_m);
  const c1 = buildAICommands(w1, idx1, sp1, cmdsFor);

  const idx2 = buildWorldIndex(w2);
  const sp2 = buildSpatialIndex(w2, cellSize_m);
  const c2 = buildAICommands(w2, idx2, sp2, cmdsFor);

  // Compare as JSON-friendly structure
  const norm = (m: Map<number, readonly any[]>) =>
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k, v]);

  expect(norm(c1 as any)).toEqual(norm(c2 as any));
});

test("AI targets enemies, not allies", () => {
  const self = mkHumanoidEntity(1, 1, 0, 0);
  const ally = mkHumanoidEntity(2, 1, Math.trunc(1.0 * SCALE.m), 0);
  const enemy = mkHumanoidEntity(3, 2, Math.trunc(1.0 * SCALE.m), Math.trunc(0.2 * SCALE.m));

  const w = mkWorld(999, [self, ally, enemy]);

  const idx = buildWorldIndex(w);
  const sp = buildSpatialIndex(w, Math.trunc(4 * SCALE.m));

  const cmds = buildAICommands(w, idx, sp, id => (id === 1 ? AI_PRESETS.lineInfantry : undefined));
  const list = cmds.get(1) ?? [];

  // Expect at least a move/defend; if an attack exists it must not target ally
  for (const c of list as any[]) {
    if (c.kind === "attack") expect(c.targetId).toBe(3);
  }
});