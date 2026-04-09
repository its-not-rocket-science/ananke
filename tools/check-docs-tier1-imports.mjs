#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const DOC_PATHS = ["README.md", "docs", "examples"];
const DOC_EXTENSIONS = new Set([".md", ".ts", ".js", ".mjs", ".html", ".tsx", ".jsx"]);
const PACKAGE_ROOT = "@its-not-rocket-science/ananke";

function walkFiles(inputPath, files = []) {
  const resolved = path.join(REPO_ROOT, inputPath);
  const stat = safeStat(resolved);
  if (!stat) return files;

  if (stat.isFile()) {
    files.push(inputPath);
    return files;
  }

  for (const entry of readdirSync(resolved, { withFileTypes: true })) {
    const rel = path.join(inputPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(rel, files);
      continue;
    }
    if (DOC_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(rel);
    }
  }
  return files;
}

function safeStat(filePath) {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

function extractNamedImports(content) {
  const matches = [];
  const regex = new RegExp(
    `import\\s+(?:type\\s+)?\\{([^}]+)\\}\\s+from\\s+["']${PACKAGE_ROOT}["']`,
    "gms",
  );

  let match;
  while ((match = regex.exec(content)) !== null) {
    const full = match[0];
    const names = match[1]
      .split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean)
      .map((symbol) => symbol.replace(/^type\s+/, "").split(/\s+as\s+/i)[0].trim())
      .filter((symbol) => symbol !== "...");

    const line = content.slice(0, match.index).split("\n").length;
    matches.push({ full, line, names });
  }

  return matches;
}

function main() {
  const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, "docs/stable-api-manifest.json"), "utf8"));
  const tier1 = new Set(manifest.symbols);

  const files = DOC_PATHS.flatMap((p) => walkFiles(p));
  const issues = [];

  for (const relFile of files) {
    const content = readFileSync(path.join(REPO_ROOT, relFile), "utf8");
    const imports = extractNamedImports(content);
    for (const imp of imports) {
      const missing = imp.names.filter((name) => !tier1.has(name));
      if (missing.length > 0) {
        issues.push({
          file: relFile,
          line: imp.line,
          missing,
          importStatement: imp.full.replace(/\s+/g, " ").trim(),
        });
      }
    }
  }

  if (issues.length === 0) {
    console.log("✅ Tier-1 docs import check passed.");
    return;
  }

  console.error(`❌ Found ${issues.length} doc/example import reference(s) not in docs/stable-api-manifest.json:`);
  for (const issue of issues) {
    console.error(`- ${issue.file}:${issue.line}`);
    console.error(`  missing: ${issue.missing.join(", ")}`);
    console.error(`  import: ${issue.importStatement}`);
  }
  process.exit(1);
}

main();
