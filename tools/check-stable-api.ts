import fs from "node:fs";
import path from "node:path";

type StableApiManifest = {
  entrypoint: string;
  symbols: string[];
};

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, "docs", "stable-api-manifest.json");

function readManifest(filePath: string): StableApiManifest {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<StableApiManifest>;

  if (typeof parsed.entrypoint !== "string" || parsed.entrypoint.length === 0) {
    throw new Error("stable-api manifest must include a non-empty \"entrypoint\" string");
  }

  if (!Array.isArray(parsed.symbols) || parsed.symbols.some((s) => typeof s !== "string")) {
    throw new Error("stable-api manifest must include a string[] \"symbols\" field");
  }

  return { entrypoint: parsed.entrypoint, symbols: parsed.symbols };
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "");
}

function parseIndexExports(indexSource: string): string[] {
  const source = stripComments(indexSource);
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
      if (plainMatch) {
        out.add(plainMatch[1]!);
      }
    }
  }

  return [...out].sort();
}

function main(): void {
  const manifest = readManifest(manifestPath);
  const indexPath = path.join(repoRoot, manifest.entrypoint);
  const indexSource = fs.readFileSync(indexPath, "utf8");

  const exported = parseIndexExports(indexSource);
  const expected = [...new Set(manifest.symbols)].sort();

  const expectedSet = new Set(expected);
  const exportedSet = new Set(exported);

  const notInManifest = exported.filter((name) => !expectedSet.has(name));
  const missingFromIndex = expected.filter((name) => !exportedSet.has(name));

  if (notInManifest.length > 0 || missingFromIndex.length > 0) {
    console.error("Stable API check failed.");

    if (notInManifest.length > 0) {
      console.error("\nExports present in src/index.ts but missing from docs/stable-api-manifest.json:");
      for (const name of notInManifest) console.error(`  - ${name}`);
    }

    if (missingFromIndex.length > 0) {
      console.error("\nSymbols listed in docs/stable-api-manifest.json but missing from src/index.ts:");
      for (const name of missingFromIndex) console.error(`  - ${name}`);
    }

    process.exit(1);
  }

  console.log(`Stable API check passed (${exported.length} symbols).`);
}

main();
