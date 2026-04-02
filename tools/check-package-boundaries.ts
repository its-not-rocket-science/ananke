import * as fs from "node:fs";
import * as path from "node:path";

type PackageName = "@ananke/core" | "@ananke/combat" | "@ananke/campaign" | "@ananke/content";

interface BoundaryConfig {
  packages: Record<PackageName, string[]>;
  allowedDeps: Partial<Record<PackageName, PackageName[]>>;
}

interface Violation {
  fromFile: string;
  toFile: string;
  fromPkg: PackageName;
  toPkg: PackageName;
  line: number;
  specifier: string;
  kind: "violation" | "suspicious";
}

interface BoundarySummary {
  scannedFiles: number;
  mappedFiles: number;
  unmappedFiles: string[];
  violations: Violation[];
  importCounts: Record<string, number>;
}

const ROOT = process.cwd();
const PKGS: PackageName[] = ["@ananke/core", "@ananke/combat", "@ananke/campaign", "@ananke/content"];
const SHORT: Record<PackageName, string> = {
  "@ananke/core": "core",
  "@ananke/combat": "combat",
  "@ananke/campaign": "campaign",
  "@ananke/content": "content",
};

const CONFIG_PATH = path.join(ROOT, "tools", "package-boundaries.config.json");
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as BoundaryConfig;

function relToRoot(abs: string): string {
  return abs.startsWith(ROOT) ? abs.slice(ROOT.length + 1).replace(/\\/g, "/") : abs;
}

function classifyFile(rel: string): PackageName | null {
  for (const [pkg, patterns] of Object.entries(config.packages) as [PackageName, string[]][]) {
    for (const pat of patterns) {
      if (pat.endsWith("/")) {
        if (rel === pat.slice(0, -1) || rel.startsWith(pat)) return pkg;
      } else if (rel === pat) {
        return pkg;
      }
    }
  }
  return null;
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  const re = /(?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|[^'"]+?)\s+from\s+['"]([^'"]+)['"]/g;
  const dynRe = /import\(['"]([^'"]+)['"]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) imports.push(m[1]!);
  while ((m = dynRe.exec(content)) !== null) imports.push(m[1]!);
  return imports.filter(s => s.startsWith("./") || s.startsWith("../"));
}

function resolveImport(fromFile: string, specifier: string): string {
  const dir = path.dirname(path.join(ROOT, fromFile));
  let resolved = path.resolve(dir, specifier).replace(/\\/g, "/");
  const rootNormalized = ROOT.replace(/\\/g, "/");
  if (resolved.startsWith(rootNormalized)) {
    resolved = resolved.slice(rootNormalized.length + 1);
  }
  if (resolved.endsWith(".js")) resolved = resolved.slice(0, -3) + ".ts";
  if (!resolved.includes(".")) {
    if (fs.existsSync(path.join(ROOT, resolved + ".ts"))) return resolved + ".ts";
    if (fs.existsSync(path.join(ROOT, resolved, "index.ts"))) return resolved + "/index.ts";
  }
  return resolved;
}

function walkDir(dir: string, exts = [".ts"]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full, exts));
    else if (exts.some(e => entry.name.endsWith(e))) results.push(full);
  }
  return results;
}

function analyse(): BoundarySummary {
  const srcDir = path.join(ROOT, "src");
  const allFiles = walkDir(srcDir).map(f => relToRoot(f));
  const summary: BoundarySummary = {
    scannedFiles: allFiles.length,
    mappedFiles: 0,
    unmappedFiles: [],
    violations: [],
    importCounts: {},
  };

  for (const a of PKGS) for (const b of PKGS) summary.importCounts[`${a}→${b}`] = 0;

  for (const relFile of allFiles) {
    if (relFile.endsWith(".d.ts") || relFile.endsWith(".test.ts")) continue;

    const fromPkg = classifyFile(relFile);
    if (!fromPkg) {
      summary.unmappedFiles.push(relFile);
      continue;
    }
    summary.mappedFiles++;

    const content = fs.readFileSync(path.join(ROOT, relFile), "utf8");
    const lines = content.split("\n");
    const specs = extractImports(content);

    for (const spec of specs) {
      const toFile = resolveImport(relFile, spec);
      const toPkg = classifyFile(toFile);
      if (!toPkg || toPkg === fromPkg) continue;

      summary.importCounts[`${fromPkg}→${toPkg}`] = (summary.importCounts[`${fromPkg}→${toPkg}`] ?? 0) + 1;

      let lineNo = 1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]?.includes(spec)) {
          lineNo = i + 1;
          break;
        }
      }

      const allowed = config.allowedDeps[fromPkg] ?? [];
      if (!allowed.includes(toPkg)) {
        summary.violations.push({
          fromFile: relFile,
          toFile,
          fromPkg,
          toPkg,
          line: lineNo,
          specifier: spec,
          kind: fromPkg === "@ananke/core" ? "violation" : "suspicious",
        });
      }
    }
  }

  return summary;
}

function writeMarkdownReport(summary: BoundarySummary, outputPath: string): void {
  const hardViolations = summary.violations.filter(v => v.kind === "violation");
  const suspiciousImports = summary.violations.filter(v => v.kind === "suspicious");
  const now = new Date().toISOString();

  const lines: string[] = [];
  lines.push("# Package Boundary Report");
  lines.push("");
  lines.push(`Generated: ${now}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Source files scanned: ${summary.scannedFiles}`);
  lines.push(`- Files mapped to package: ${summary.mappedFiles}`);
  lines.push(`- Unmapped files: ${summary.unmappedFiles.length}`);
  lines.push(`- Hard violations: ${hardViolations.length}`);
  lines.push(`- Suspicious imports (warning mode): ${suspiciousImports.length}`);
  lines.push("");
  lines.push("## Cross-package import matrix");
  lines.push("");
  lines.push("| From \\ To | core | combat | campaign | content |");
  lines.push("|---|---:|---:|---:|---:|");
  for (const fromPkg of PKGS) {
    const row = PKGS.map(toPkg => {
      if (fromPkg === toPkg) return "self";
      return String(summary.importCounts[`${fromPkg}→${toPkg}`] ?? 0);
    });
    lines.push(`| ${SHORT[fromPkg]} | ${row.join(" | ")} |`);
  }

  lines.push("");
  lines.push("## Hard violations");
  lines.push("");
  if (hardViolations.length === 0) {
    lines.push("None.");
  } else {
    for (const v of hardViolations) {
      lines.push(`- \`${v.fromFile}:${v.line}\` imports \`${v.specifier}\` → \`${v.toFile}\` (${SHORT[v.fromPkg]} → ${SHORT[v.toPkg]}).`);
    }
  }

  lines.push("");
  lines.push("## Suspicious imports (warning mode)");
  lines.push("");
  if (suspiciousImports.length === 0) {
    lines.push("None.");
  } else {
    for (const v of suspiciousImports) {
      lines.push(`- \`${v.fromFile}:${v.line}\` imports \`${v.specifier}\` → \`${v.toFile}\` (${SHORT[v.fromPkg]} → ${SHORT[v.toPkg]}).`);
    }
  }

  lines.push("");
  lines.push("## Unmapped files");
  lines.push("");
  if (summary.unmappedFiles.length === 0) {
    lines.push("None.");
  } else {
    for (const file of summary.unmappedFiles) lines.push(`- \`${file}\``);
  }

  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
}

const STRICT = process.argv.includes("--strict");
const JSON_OUT = process.argv.includes("--json");
const REPORT_MD_PATH = (() => {
  const arg = process.argv.find(a => a.startsWith("--report-md="));
  return arg ? arg.slice("--report-md=".length) : null;
})();

const summary = analyse();
const hardViolations = summary.violations.filter(v => v.kind === "violation");
const suspiciousImports = summary.violations.filter(v => v.kind === "suspicious");

if (REPORT_MD_PATH) {
  writeMarkdownReport(summary, path.resolve(ROOT, REPORT_MD_PATH));
}

if (JSON_OUT) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(STRICT && summary.violations.length > 0 ? 1 : 0);
}

console.log("\nAnanke — Package Boundary Check  (PM-2)");
console.log("═".repeat(70));
console.log(`  Source files scanned : ${summary.scannedFiles}`);
console.log(`  Files mapped to pkg  : ${summary.mappedFiles}`);
console.log(`  Unmapped files       : ${summary.unmappedFiles.length}`);

console.log("\nCross-package import matrix (count of cross-boundary import statements):\n");
const COL_W = 12;
const header = "FROM \\ TO".padEnd(16) + PKGS.map(p => SHORT[p].padStart(COL_W)).join("");
console.log(header);
console.log("─".repeat(header.length));
for (const fromPkg of PKGS) {
  const allowed = config.allowedDeps[fromPkg] ?? [];
  let row = SHORT[fromPkg].padEnd(16);
  for (const toPkg of PKGS) {
    if (fromPkg === toPkg) {
      row += "  (self)".padStart(COL_W);
      continue;
    }
    const count = summary.importCounts[`${fromPkg}→${toPkg}`] ?? 0;
    const ok = allowed.includes(toPkg);
    const cell = count === 0 ? "—" : ok ? `${count} ✓` : `${count} ✗`;
    row += cell.padStart(COL_W);
  }
  console.log(row);
}

if (hardViolations.length > 0) {
  console.log(`\n❌  Hard violations (${hardViolations.length}) — must fix before migration:`);
} else {
  console.log("\n✅  No hard violations — core is clean of upward deps.");
}

if (suspiciousImports.length > 0) {
  console.log(`\n⚠   Suspicious cross-boundary imports (${suspiciousImports.length}) — warning mode:`);
} else {
  console.log("\n✅  No suspicious cross-boundary imports.");
}

if (summary.unmappedFiles.length > 0) {
  console.log(`\nℹ   Unmapped source files (${summary.unmappedFiles.length}) — not yet assigned to a package.`);
}

if (REPORT_MD_PATH) {
  console.log(`\n📝 Boundary report written to ${REPORT_MD_PATH}`);
}

const exitCode = STRICT && summary.violations.length > 0 ? 1 : 0;
if (exitCode) process.exit(exitCode);
