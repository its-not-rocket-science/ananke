import fs from "node:fs";
import path from "node:path";

type StableApiManifest = {
  entrypoint: string;
  symbols: string[];
};

const repoRoot = process.cwd();

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8")) as T;
}

function parseIndexExports(indexSource: string): string[] {
  const source = indexSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "");

  const out = new Set<string>();
  const namedExportRegex = /export\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["'][^"']+["'];/g;

  for (const match of source.matchAll(namedExportRegex)) {
    const body = match[1] ?? "";
    for (const rawPart of body.split(",")) {
      const part = rawPart.trim();
      if (!part) continue;

      const asMatch = /^(?:type\s+)?([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(part);
      if (asMatch) {
        out.add(asMatch[2]!);
        continue;
      }

      const plainMatch = /^(?:type\s+)?([A-Za-z_$][\w$]*)$/.exec(part);
      if (plainMatch) out.add(plainMatch[1]!);
    }
  }

  return [...out].sort();
}

function extractMarkedJsonArray(docPath: string, marker: string): string[] {
  const text = fs.readFileSync(path.join(repoRoot, docPath), "utf8");
  const start = `<!-- ${marker}:start -->`;
  const end = `<!-- ${marker}:end -->`;
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);

  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error(`${docPath} is missing marker block ${marker}`);
  }

  const slice = text.slice(startIndex + start.length, endIndex);
  const match = /```json\s*([\s\S]*?)```/.exec(slice);
  if (!match) throw new Error(`${docPath} marker ${marker} must contain a json code block`);

  const parsed = JSON.parse(match[1] ?? "[]") as unknown;
  if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== "string")) {
    throw new Error(`${docPath} marker ${marker} must be a string[]`);
  }

  return [...parsed].sort();
}

function diff(a: string[], b: string[]): { onlyA: string[]; onlyB: string[] } {
  const setA = new Set(a);
  const setB = new Set(b);
  return {
    onlyA: a.filter((x) => !setB.has(x)),
    onlyB: b.filter((x) => !setA.has(x)),
  };
}

function failDiff(label: string, d: { onlyA: string[]; onlyB: string[] }, aName: string, bName: string): void {
  if (d.onlyA.length === 0 && d.onlyB.length === 0) return;

  console.error(`\n${label} drift detected:`);
  if (d.onlyA.length > 0) {
    console.error(`  Present in ${aName} only:`);
    for (const item of d.onlyA) console.error(`    - ${item}`);
  }
  if (d.onlyB.length > 0) {
    console.error(`  Present in ${bName} only:`);
    for (const item of d.onlyB) console.error(`    - ${item}`);
  }

  process.exitCode = 1;
}

function main(): void {
  const manifest = readJson<StableApiManifest>("docs/stable-api-manifest.json");
  const indexText = fs.readFileSync(path.join(repoRoot, manifest.entrypoint), "utf8");

  const indexSymbols = parseIndexExports(indexText);
  const manifestSymbols = [...new Set(manifest.symbols)].sort();

  failDiff(
    "Tier-1 symbol set",
    diff(indexSymbols, manifestSymbols),
    manifest.entrypoint,
    "docs/stable-api-manifest.json",
  );

  const stableApiSymbols = extractMarkedJsonArray("STABLE_API.md", "CONTRACT:TIER1_SYMBOLS");
  failDiff(
    "STABLE_API tier-1 block",
    diff(stableApiSymbols, manifestSymbols),
    "STABLE_API.md#CONTRACT:TIER1_SYMBOLS",
    "docs/stable-api-manifest.json",
  );

  const pkg = readJson<{ exports: Record<string, unknown> }>("package.json");
  const packageSubpaths = Object.keys(pkg.exports).filter((k) => k !== ".").sort();
  const moduleIndexSubpaths = extractMarkedJsonArray("docs/module-index.md", "CONTRACT:SUBPATH_EXPORTS");
  failDiff(
    "Module index subpath exports",
    diff(moduleIndexSubpaths, packageSubpaths),
    "docs/module-index.md#CONTRACT:SUBPATH_EXPORTS",
    "package.json#exports",
  );

  if (pkg.exports["."] === undefined) {
    console.error('package.json exports must include "." root entrypoint');
    process.exitCode = 1;
  }

  if (process.exitCode && process.exitCode !== 0) {
    throw new Error("Public contract check failed");
  }

  console.log("Public contract check passed.");
}

main();
