import * as fs from "node:fs";

interface Param {
  name: string;
  type: string;
}

interface ExportEntry {
  name: string;
  kind: string;
  params: Param[];
  returnType: string | null;
}

interface ApiSurface {
  exports: ExportEntry[];
  tsconfig: string;
}

function getArg(name: string): string | undefined {
  const eqArg = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eqArg) return eqArg.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

function parseVersion(version: string): [number, number, number] {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Invalid semver: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function computeBump(base: string, head: string): "none" | "patch" | "minor" | "major" {
  if (base === head) return "none";

  const [bMaj, bMin, bPatch] = parseVersion(base);
  const [hMaj, hMin, hPatch] = parseVersion(head);

  if (hMaj > bMaj) return "major";
  if (hMaj === bMaj && hMin > bMin) return "minor";
  if (hMaj === bMaj && hMin === bMin && hPatch > bPatch) return "patch";
  return "none";
}

function paramsEqual(a: Param[], b: Param[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((param, idx) => param.name === b[idx]?.name && param.type === b[idx]?.type);
}

function requiredBump(baseSurface: ApiSurface, headSurface: ApiSurface): "patch" | "minor" | "major" {
  const baseMap = new Map(baseSurface.exports.map((exp) => [exp.name, exp]));
  const headMap = new Map(headSurface.exports.map((exp) => [exp.name, exp]));
  const names = new Set([...baseMap.keys(), ...headMap.keys()]);

  let hasNewExport = false;

  for (const name of names) {
    const before = baseMap.get(name);
    const after = headMap.get(name);

    if (!before && after) {
      hasNewExport = true;
      continue;
    }

    if (before && !after) return "major";
    if (!before || !after) continue;

    if (before.kind !== after.kind) return "major";
    if (!paramsEqual(before.params, after.params)) return "major";
    if ((before.returnType ?? "") !== (after.returnType ?? "")) return "major";
  }

  return hasNewExport ? "minor" : "patch";
}

function main(): void {
  const baseVersion = getArg("--base-version");
  const headVersion = getArg("--head-version");
  const baseSurfacePath = getArg("--base-surface");
  const headSurfacePath = getArg("--head-surface");

  if (!baseVersion || !headVersion || !baseSurfacePath || !headSurfacePath) {
    throw new Error(
      "Usage: node dist/tools/semver-check.js --base-version x --head-version y --base-surface file --head-surface file",
    );
  }

  const baseSurface = JSON.parse(fs.readFileSync(baseSurfacePath, "utf8")) as ApiSurface;
  const headSurface = JSON.parse(fs.readFileSync(headSurfacePath, "utf8")) as ApiSurface;

  const required = requiredBump(baseSurface, headSurface);
  const actual = computeBump(baseVersion, headVersion);
  const ok = (required === "major" && actual === "major")
    || (required === "minor" && (actual === "minor" || actual === "major"))
    || (required === "patch" && (actual === "patch" || actual === "minor" || actual === "major"));

  const output = {
    required,
    actual,
    baseVersion,
    headVersion,
    ok,
  };

  const outputPath = getArg("--out");
  if (outputPath) {
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  }

  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (!ok) {
    process.exitCode = 1;
  }
}

main();
