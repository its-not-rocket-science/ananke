import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

const BANNED_RUNTIME_FIELDS = [
  "__sensoryEnv",
  "__factionRegistry",
  "__partyRegistry",
  "__relationshipGraph",
  "__nutritionAccum",
] as const;

describe("runtime state contract", () => {
  it("world type defines explicit runtimeState structure", () => {
    const worldSource = readFileSync(join(ROOT, "src/sim/world.ts"), "utf8");
    expect(worldSource).toContain("export interface WorldRuntimeState");
    expect(worldSource).toContain("runtimeState?: WorldRuntimeState;");
  });

  it("legacy hidden __* runtime fields are not present in source", () => {
    const sourceFiles = [
      "src/sim/world.ts",
      "src/sim/kernel.ts",
      "src/sim/team.ts",
      "src/sim/ai/decide.ts",
      "src/sim/ai/personality.ts",
      "src/snapshot.ts",
    ];

    const combined = sourceFiles
      .map((file) => readFileSync(join(ROOT, file), "utf8"))
      .join("\n");

    for (const banned of BANNED_RUNTIME_FIELDS) {
      expect(combined).not.toContain(banned);
    }
  });
});
