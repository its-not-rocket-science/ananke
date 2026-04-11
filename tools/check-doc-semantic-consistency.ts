#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

type CanonicalStability = "tier1" | "experimental" | "internal" | "subpath-stable" | "shipped" | "unknown";

interface ImportClaim {
  file: string;
  line: number;
  specifier: string;
  symbols: string[];
  claimedStability: CanonicalStability;
  snippet: string;
}

interface Issue {
  kind:
    | "missing-export-path"
    | "missing-symbol-on-path"
    | "tier1-symbol-not-in-manifest"
    | "stability-contradiction"
    | "manifest-tier1-mismatch";
  file: string;
  line: number;
  message: string;
}

const REPO_ROOT = process.cwd();
const PACKAGE_ROOT = "@its-not-rocket-science/ananke";
const DOC_ROOTS = ["README.md", "docs", "examples"];
const DOC_EXTENSIONS = new Set([".md", ".mdx"]);
const IGNORE_SEGMENTS = new Set(["node_modules", ".git", "dist", "build", ".docusaurus"]);
const REPORT_PATH = path.join(REPO_ROOT, "docs", "doc-consistency-report.json");

function safeStat(filePath: string): ReturnType<typeof statSync> | null {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

function walkDocs(inputPath: string, files: string[] = []): string[] {
  const abs = path.join(REPO_ROOT, inputPath);
  const stat = safeStat(abs);
  if (!stat) return files;

  if (stat.isFile()) {
    if (DOC_EXTENSIONS.has(path.extname(inputPath).toLowerCase())) {
      files.push(inputPath);
    }
    return files;
  }

  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORE_SEGMENTS.has(entry.name)) continue;
    const rel = path.join(inputPath, entry.name);
    if (entry.isDirectory()) {
      walkDocs(rel, files);
    } else if (DOC_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(rel);
    }
  }
  return files;
}

function canonicalizeStabilityLabel(raw: string): CanonicalStability {
  const text = raw.toLowerCase();
  if (/non[-\s]*tier[-\s]*1|not part of tier[-\s]*1|not tier[-\s]*1/.test(text)) {
    return text.includes("shipped") ? "shipped" : "unknown";
  }
  if (/tier\s*-?\s*1|root-stable|stable root|tier 1 stable/.test(text)) return "tier1";
  if (/subpath-stable/.test(text)) return "subpath-stable";
  if (/internal|tier\s*-?\s*3/.test(text)) return "internal";
  if (/experimental|tier\s*-?\s*2/.test(text)) return "experimental";
  if (/shipped but undocumented|shipped/.test(text)) return "shipped";
  return "unknown";
}

function lineAt(content: string, index: number): number {
  return content.slice(0, Math.max(index, 0)).split("\n").length;
}

function inferClaimedStability(content: string, index: number): CanonicalStability {
  const lines = content.split("\n");
  const current = lineAt(content, index) - 1;
  const start = Math.max(0, current - 8);
  const end = Math.min(lines.length - 1, current + 2);
  const isStabilityLine = (line: string): boolean =>
    /\bstability\s*:|\bstatus\s*:|^\|[^|]*stability[^|]*\|/i.test(line) ||
    /root-stable|subpath-stable|shipped but undocumented/i.test(line);

  for (let i = current; i >= start; i -= 1) {
    const candidate = lines[i] ?? "";
    if (!isStabilityLine(candidate)) continue;
    const label = canonicalizeStabilityLabel(candidate);
    if (label !== "unknown") return label;
  }
  for (let i = current + 1; i <= end; i += 1) {
    const candidate = lines[i] ?? "";
    if (!isStabilityLine(candidate)) continue;
    const label = canonicalizeStabilityLabel(candidate);
    if (label !== "unknown") return label;
  }
  return "unknown";
}

function parseImportsFromDoc(content: string, relFile: string): ImportClaim[] {
  const claims: ImportClaim[] = [];
  const importRe = /import\s+(?:type\s+)?(?:\{([^}]+)\}|[\w*\s,]+)\s+from\s+["'](@its-not-rocket-science\/ananke(?:\/[a-zA-Z0-9._-]+)*)["']/g;
  const fenceRe = /```([^\n`]*)\n([\s\S]*?)```/g;

  let fence: RegExpExecArray | null;
  while ((fence = fenceRe.exec(content)) !== null) {
    const info = (fence[1] ?? "").toLowerCase();
    if (info.includes("pseudocode") || info.includes("no-check-example")) continue;
    const code = fence[2] ?? "";

    let match: RegExpExecArray | null;
    while ((match = importRe.exec(code)) !== null) {
      const namesRaw = match[1] ?? "";
      const symbols = namesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.replace(/^type\s+/, "").split(/\s+as\s+/i)[0]?.trim() ?? "")
        .filter(Boolean);

      const absoluteIndex = fence.index + match.index;
      claims.push({
        file: relFile,
        line: lineAt(content, absoluteIndex),
        specifier: match[2] ?? PACKAGE_ROOT,
        symbols,
        claimedStability: inferClaimedStability(content, absoluteIndex),
        snippet: match[0].replace(/\s+/g, " ").trim(),
      });
    }
  }

  return claims;
}

function toSrcTypePath(typesPath: string): string | null {
  if (!typesPath.startsWith("./dist/src/") || !typesPath.endsWith(".d.ts")) return null;
  const candidate = path.join(REPO_ROOT, typesPath.replace(/^\.\/dist\/src\//, "src/").replace(/\.d\.ts$/, ".ts"));
  if (existsSync(candidate)) return candidate;
  const indexCandidate = candidate.replace(/\.ts$/, "/index.ts");
  return existsSync(indexCandidate) ? indexCandidate : null;
}

function loadExportedSymbolsBySpecifier(): Map<string, Set<string>> {
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as { exports?: Record<string, unknown> };
  const sourceFilesBySpecifier = new Map<string, string>();

  for (const [key, value] of Object.entries(pkg.exports ?? {})) {
    if (!(key === "." || key.startsWith("./"))) continue;
    const typesPath =
      typeof value === "string"
        ? value
        : typeof value === "object" && value !== null && "types" in value && typeof (value as { types?: unknown }).types === "string"
          ? (value as { types: string }).types
          : null;
    if (!typesPath) continue;
    const srcPath = toSrcTypePath(typesPath);
    if (!srcPath) continue;
    const specifier = key === "." ? PACKAGE_ROOT : `${PACKAGE_ROOT}${key.slice(1)}`;
    sourceFilesBySpecifier.set(specifier, srcPath);
  }

  const program = ts.createProgram({
    rootNames: [...new Set(sourceFilesBySpecifier.values())],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
    },
  });

  const checker = program.getTypeChecker();
  const result = new Map<string, Set<string>>();

  for (const [specifier, srcPath] of sourceFilesBySpecifier) {
    const source = program.getSourceFile(srcPath);
    if (!source) continue;
    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (!moduleSymbol) continue;
    result.set(specifier, new Set(checker.getExportsOfModule(moduleSymbol).map((s) => s.getName())));
  }

  return result;
}

function parseJsonMarker<T>(docPath: string, marker: string): T {
  const content = readFileSync(path.join(REPO_ROOT, docPath), "utf8");
  const start = `<!-- ${marker}:start -->`;
  const end = `<!-- ${marker}:end -->`;
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error(`${docPath} missing marker ${marker}`);
  }
  const block = content.slice(startIndex + start.length, endIndex);
  const m = /```json\s*([\s\S]*?)```/.exec(block);
  if (!m) throw new Error(`${docPath} marker ${marker} must include json fenced block`);
  return JSON.parse(m[1] ?? "null") as T;
}

function expectedStabilityBySpecifier(): Map<string, CanonicalStability> {
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as { exports?: Record<string, unknown> };
  const map = new Map<string, CanonicalStability>();
  map.set(PACKAGE_ROOT, "tier1");

  for (const key of Object.keys(pkg.exports ?? {})) {
    if (key === ".") continue;
    if (!key.startsWith("./")) continue;
    const spec = `${PACKAGE_ROOT}${key.slice(1)}`;
    map.set(spec, "shipped");
  }

  type Row = { kind: string; subject: string; status: string };
  const labels = parseJsonMarker<Row[]>("docs/module-index.md", "CONTRACT:STABILITY_LABELS");
  for (const row of labels) {
    if (row.kind !== "subpath") continue;
    const spec = row.subject === "." ? PACKAGE_ROOT : `${PACKAGE_ROOT}${row.subject.slice(1)}`;
    map.set(spec, canonicalizeStabilityLabel(row.status));
  }

  return map;
}

function main(): void {
  const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, "docs/stable-api-manifest.json"), "utf8")) as { symbols: string[] };
  const tier1Manifest = new Set(manifest.symbols);
  const exportedSymbolsBySpecifier = loadExportedSymbolsBySpecifier();
  const expectedStability = expectedStabilityBySpecifier();
  const files = [...new Set(DOC_ROOTS.flatMap((root) => walkDocs(root)))].sort();

  const importClaims: ImportClaim[] = [];
  for (const rel of files) {
    const content = readFileSync(path.join(REPO_ROOT, rel), "utf8");
    importClaims.push(...parseImportsFromDoc(content, rel));
  }

  const issues: Issue[] = [];

  const rootExports = exportedSymbolsBySpecifier.get(PACKAGE_ROOT) ?? new Set<string>();
  for (const symbol of rootExports) {
    if (!tier1Manifest.has(symbol)) {
      issues.push({
        kind: "manifest-tier1-mismatch",
        file: "src/index.ts",
        line: 1,
        message: `Root export '${symbol}' is not present in docs/stable-api-manifest.json`,
      });
    }
  }

  for (const claim of importClaims) {
    const available = exportedSymbolsBySpecifier.get(claim.specifier);
    if (!available) {
      issues.push({
        kind: "missing-export-path",
        file: claim.file,
        line: claim.line,
        message: `Import path '${claim.specifier}' is not exported by package.json`,
      });
      continue;
    }

    for (const symbol of claim.symbols) {
      if (!available.has(symbol)) {
        issues.push({
          kind: "missing-symbol-on-path",
          file: claim.file,
          line: claim.line,
          message: `Doc import claims '${symbol}' from '${claim.specifier}', but that symbol is not exported there`,
        });
      }
      if (claim.claimedStability === "tier1" && !tier1Manifest.has(symbol)) {
        issues.push({
          kind: "tier1-symbol-not-in-manifest",
          file: claim.file,
          line: claim.line,
          message: `Symbol '${symbol}' is claimed Tier-1 in docs but not in docs/stable-api-manifest.json`,
        });
      }
    }

    if (claim.claimedStability !== "unknown") {
      const expected = expectedStability.get(claim.specifier) ?? "unknown";
      if (expected !== "unknown" && claim.claimedStability !== expected) {
        issues.push({
          kind: "stability-contradiction",
          file: claim.file,
          line: claim.line,
          message: `Doc claims '${claim.specifier}' is ${claim.claimedStability}, but contract says ${expected}`,
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    filesScanned: files.length,
    importClaims,
    issueCount: issues.length,
    issues,
  };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (issues.length > 0) {
    console.error(`❌ Doc semantic consistency check failed with ${issues.length} issue(s).`);
    for (const issue of issues) {
      console.error(`- [${issue.kind}] ${issue.file}:${issue.line} ${issue.message}`);
    }
    console.error(`Report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
    process.exit(1);
  }

  console.log(`✅ Doc semantic consistency passed (${files.length} files, ${importClaims.length} import claim(s)).`);
  console.log(`Report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
}

main();
