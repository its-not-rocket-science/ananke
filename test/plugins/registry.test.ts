import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installPluginFromRegistry } from "../../src/plugins/registry.js";

const tmpPaths: string[] = [];
afterEach(() => {
  for (const path of tmpPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("plugin registry installer", () => {
  it("downloads plugin manifest + module from registry index", async () => {
    const pluginsDir = mkdtempSync(join(tmpdir(), "ananke-registry-"));
    tmpPaths.push(pluginsDir);

    const fetchImpl: typeof fetch = async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/index.json")) {
        return new Response(JSON.stringify([
          {
            name: "demo-plugin",
            manifestUrl: "https://registry.test/demo/plugin.json",
            moduleUrl: "https://registry.test/demo/index.js",
          },
        ]), { status: 200 });
      }
      if (url.endsWith("/plugin.json")) {
        return new Response(JSON.stringify({
          id: "demo-plugin",
          version: "1.0.0",
          hooks: ["afterStep"],
          dependencies: {},
          permissions: ["read:worldState"],
        }), { status: 200 });
      }
      if (url.endsWith("/index.js")) {
        return new Response("module.exports={setup(){return {afterStep(){}};}}", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };

    const installedPath = await installPluginFromRegistry("demo-plugin", {
      registryIndexUrl: "https://registry.test/index.json",
      pluginsDir,
      fetchImpl,
    });

    expect(installedPath).toContain("demo-plugin");
    expect(readFileSync(join(pluginsDir, "demo-plugin", "plugin.json"), "utf8")).toContain("demo-plugin");
    expect(readFileSync(join(pluginsDir, "demo-plugin", "index.js"), "utf8")).toContain("module.exports");
  });
});
