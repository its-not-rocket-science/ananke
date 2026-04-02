import fs from "node:fs";
import path from "node:path";

type StableApiManifest = {
  entrypoint: string;
  symbols: string[];
};

type ImportAuditHit = {
  file: string;
  specifier: string;
  imported: string[];
  line: number;
};

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, "docs", "stable-api-manifest.json");

function readManifest(filePath: string): StableApiManifest {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<StableApiManifest>;

  if (typeof parsed.entrypoint !== "string" || parsed.entrypoint.length === 0) {
    throw new Error('stable-api manifest must include a non-empty "entrypoint" string');
  }

  if (!Array.isArray(parsed.symbols) || parsed.symbols.some((s) => typeof s !== "string")) {
    throw new Error('stable-api manifest must include a string[] "symbols" field');
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

function listFilesRecursively(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }

  return out;
}

function extractImportedNames(clause: string): string[] {
  const names: string[] = [];

  const namedMatch = /\{([^}]+)\}/.exec(clause);
  if (namedMatch) {
    for (const p of namedMatch[1]!.split(",")) {
      const trimmed = p.trim();
      if (!trimmed) continue;
      const noType = trimmed.replace(/^type\s+/, "");
      const importedName = noType.split(/\s+as\s+/)[0]!.trim();
      if (importedName) names.push(importedName);
    }
  }

  return names;
}

function scanImportAudit(): { internalImports: ImportAuditHit[]; nonTier1RootImports: ImportAuditHit[] } {
  const scopeRoots = [path.join(repoRoot, "docs"), path.join(repoRoot, "examples")];
  const files = scopeRoots.flatMap(listFilesRecursively).filter((file) => /\.(md|ts|tsx|mts|cts|js|mjs|cjs|html)$/.test(file));

  const internalImports: ImportAuditHit[] = [];
  const nonTier1RootImports: ImportAuditHit[] = [];

  const manifest = readManifest(manifestPath);
  const tier1 = new Set(manifest.symbols);
  const rootSpecifier = "@its-not-rocket-science/ananke";
  const importRegex = /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g;

  for (const file of files) {
    const rel = path.relative(repoRoot, file);
    const text = fs.readFileSync(file, "utf8");

    for (const match of text.matchAll(importRegex)) {
      const clause = (match[1] ?? "").trim();
      const specifier = (match[2] ?? "").trim();
      const imported = extractImportedNames(clause);
      const line = text.slice(0, match.index ?? 0).split("\n").length;

      const isInternalSpecifier = specifier.includes("/src/") || specifier.startsWith("../src/") || specifier.startsWith("./src/") || specifier.includes("ananke/src/");
      if (isInternalSpecifier) {
        internalImports.push({ file: rel, specifier, imported, line });
      }

      if (specifier === rootSpecifier && imported.length > 0) {
        const disallowed = imported.filter((name) => !tier1.has(name));
        if (disallowed.length > 0) {
          nonTier1RootImports.push({ file: rel, specifier, imported: disallowed, line });
        }
      }
    }
  }

  return { internalImports, nonTier1RootImports };
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

  const { internalImports, nonTier1RootImports } = scanImportAudit();

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

  if (internalImports.length > 0 || nonTier1RootImports.length > 0) {
    console.warn("\nBoundary audit warnings:");

    if (internalImports.length > 0) {
      console.warn("\nInternal src module imports found in docs/examples:");
      for (const hit of internalImports.slice(0, 40)) {
        const imported = hit.imported.length > 0 ? ` (${hit.imported.join(", ")})` : "";
        console.warn(`  - ${hit.file}:${hit.line} -> ${hit.specifier}${imported}`);
      }
      if (internalImports.length > 40) {
        console.warn(`  ... and ${internalImports.length - 40} more`);
      }
    }

    if (nonTier1RootImports.length > 0) {
      console.warn("\nNon-Tier-1 root imports found in docs/examples:");
      for (const hit of nonTier1RootImports.slice(0, 40)) {
        console.warn(`  - ${hit.file}:${hit.line} -> ${hit.imported.join(", ")}`);
      }
      if (nonTier1RootImports.length > 40) {
        console.warn(`  ... and ${nonTier1RootImports.length - 40} more`);
      }
    }

    if (process.argv.includes("--strict-doc-imports")) {
      console.error("\nStrict docs/examples import audit failed.");
      process.exit(1);
    }
  }
}

main();
