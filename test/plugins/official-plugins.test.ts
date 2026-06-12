import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPlugin } from "../../src/plugins/loader.js";

const tempPaths: string[] = [];
afterEach(() => {
  for (const path of tempPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("official plugins", () => {
  it("visualizer emits frame telemetry", async () => {
    const telemetry: Array<{ metric: string; payload: unknown }> = [];
    const rendered: unknown[] = [];
    const plugin = loadPlugin("plugins/ananke-plugin-visualizer", {
      onTelemetry: (_pluginId, metric, payload) => telemetry.push({ metric, payload }),
    });

    await plugin.runHook("afterStep", {
      tick: 9,
      worldState: { entities: [{ id: "a", pos: { x: 1, y: 2 }, hp: 5 }] },
      render: (frame: unknown) => rendered.push(frame),
    });

    expect(rendered).toHaveLength(1);
    expect(telemetry.find(row => row.metric === "visualizer.frame")).toBeTruthy();
  });

  it("balance analyzer writes win-rate report", async () => {
    const root = mkdtempSync(join(tmpdir(), "ananke-balance-"));
    tempPaths.push(root);
    const plugin = loadPlugin("plugins/ananke-plugin-balance-analyzer", { artifactsRoot: root });

    await plugin.runHook("matchEnd", {
      worldState: {},
      summary: [
        { unitType: "infantry", didWin: true },
        { unitType: "infantry", didWin: false },
        { unitType: "archer", didWin: true },
      ],
    });

    const report = readFileSync(join(root, "ananke-plugin-balance-analyzer", "win-rates.json"), "utf8");
    expect(report).toContain("infantry");
    expect(report).toContain("winRate");
  });

  it("achievements detects first blood and flawless victory", async () => {
    const root = mkdtempSync(join(tmpdir(), "ananke-achievements-"));
    tempPaths.push(root);
    const plugin = loadPlugin("plugins/ananke-plugin-achievements", { artifactsRoot: root });

    await plugin.runHook("afterDamage", {
      worldState: {},
      tick: 2,
      attackerId: "p1",
      targetId: "p2",
      killed: true,
    });

    await plugin.runHook("matchEnd", {
      worldState: {},
      winnerTeamId: "alpha",
      teamDamageTaken: [
        { teamId: "alpha", totalDamage: 0 },
        { teamId: "beta", totalDamage: 100 },
      ],
    });

    const payload = readFileSync(join(root, "ananke-plugin-achievements", "achievements.json"), "utf8");
    expect(payload).toContain("first_blood");
    expect(payload).toContain("flawless_victory");
  });
});
