import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ANANKE_ENGINE_VERSION as runtimeVersion } from "../src/version.js";
import { ANANKE_ENGINE_VERSION as contentPackVersion } from "../src/content-pack.js";

type PackageJson = {
  version: string;
  scripts?: Record<string, string>;
};

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
}

describe("version source-of-truth", () => {
  it("keeps runtime version in sync with package.json version", () => {
    const pkg = readPackageJson();
    expect(runtimeVersion).toBe(pkg.version);
    expect(contentPackVersion).toBe(pkg.version);
  });

  it("wires release/docs tooling through sync-version", () => {
    const pkg = readPackageJson();
    const scripts = pkg.scripts ?? {};

    expect(scripts["sync-version"]).toContain("tools/sync-version.mjs");
    expect(scripts["check-version-sync"]).toContain("tools/sync-version.mjs");
    expect(scripts["build"]).toContain("sync-version");
    expect(scripts["docs:api"]).toContain("sync-version");
  });

  it("uses sync-version in release workflow script", () => {
    const releaseScript = readFileSync("scripts/tag-release.sh", "utf8");
    expect(releaseScript).toContain("npm run sync-version");
  });
});
