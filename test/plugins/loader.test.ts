import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPlugin } from "../../src/plugins/loader.js";

const pathsToDelete: string[] = [];

afterEach(() => {
  for (const path of pathsToDelete.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("plugin loader", () => {
  it("prevents world mutation without write permission", async () => {
    const plugin = loadPlugin("plugins/ananke-plugin-visualizer");
    const state = { counter: 1, entities: [] };

    await expect(plugin.runHook("afterStep", { worldState: state, tick: 1 })).resolves.toBeUndefined();
    expect(state.counter).toBe(1);
  });

  it("allows plugin artifacts and telemetry when permitted", async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "ananke-artifacts-"));
    pathsToDelete.push(artifactRoot);

    const telemetry: Array<{ pluginId: string; metric: string; payload: unknown }> = [];
    const plugin = loadPlugin("plugins/ananke-plugin-logger", {
      artifactsRoot: artifactRoot,
      onTelemetry: (pluginId, metric, payload) => telemetry.push({ pluginId, metric, payload }),
    });

    await plugin.runHook("beforeStep", { worldState: { entities: [] }, tick: 3 });
    await plugin.runHook("afterDamage", { worldState: { entities: [] }, amount: 10, targetId: "u1" });
    await plugin.runHook("afterStep", { worldState: { entities: [{ id: 1 }] }, tick: 3 });

    const jsonReport = readFileSync(join(artifactRoot, "ananke-plugin-logger", "logs.json"), "utf8");
    expect(jsonReport).toContain("afterDamage");
    expect(telemetry.some(entry => entry.metric === "logger.flush")).toBe(true);
  });
});
