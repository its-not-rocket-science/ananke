import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

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
  column: number;
  specifier: string;
  kind: "violation" | "suspicious";
}

interface BoundarySummary {
  scannedFiles: number;
  mappedFiles: number;
  unmappedFiles: string[];
  unresolvedImports: Array<{ fromFile: string; specifier: string; line: number; column: number }>;
  violations: Violation[];
  importCounts: Record<string, number>;
}

interface ImportRef {
  specifier: string;
  line: number;
  column: number;
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

const EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"];

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

function extractImports(content: string): ImportRef[] {
  const source = ts.createSourceFile("inline.ts", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports: ImportRef[] = [];

  const pushSpecifier = (raw: string, pos: number): void => {
    if (!(raw.startsWith("./") || raw.startsWith("../"))) return;
    const loc = source.getLineAndCharacterOfPosition(pos);
    imports.push({ specifier: raw, line: loc.line + 1, column: loc.character + 1 });
  };

  const maybeStringLiteral = (expr: ts.Expression | undefined): string | null => {
    if (!expr || !ts.isStringLiteralLike(expr)) return null;
    return expr.text;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      const raw = maybeStringLiteral(moduleSpecifier);
      if (raw && moduleSpecifier) pushSpecifier(raw, moduleSpecifier.getStart(source));
    }

    if (ts.isCallExpression(node)) {
      // dynamic import("...")
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length > 0) {
        const firstArg = node.arguments[0];
        const raw = maybeStringLiteral(firstArg);
        if (raw && firstArg) pushSpecifier(raw, firstArg.getStart(source));
      }

      // CommonJS require("...")
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require" &&
        node.arguments.length > 0
      ) {
        const firstArg = node.arguments[0];
        const raw = maybeStringLiteral(firstArg);
        if (raw && firstArg) pushSpecifier(raw, firstArg.getStart(source));
      }
    }

    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      const lit = node.argument.literal;
      if (ts.isStringLiteralLike(lit)) pushSpecifier(lit.text, lit.getStart(source));
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  const deduped = new Map<string, ImportRef>();
  for (const item of imports) {
    deduped.set(`${item.specifier}:${item.line}:${item.column}`, item);
  }

  return [...deduped.values()];
}

function resolveImport(fromFile: string, specifier: string): string | null {
  const fromAbs = path.join(ROOT, fromFile);
  const dir = path.dirname(fromAbs);
  const candidate = path.resolve(dir, specifier);

  const tries: string[] = [];

  const pushIfExists = (absPath: string): void => {
    if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) tries.push(absPath);
  };

  if (path.extname(candidate)) {
    pushIfExists(candidate);

    const ext = path.extname(candidate);
    const withoutExt = candidate.slice(0, -ext.length);
    if ([".js", ".mjs", ".cjs"].includes(ext)) {
      for (const tsExt of [".ts", ".tsx", ".mts", ".cts"]) pushIfExists(withoutExt + tsExt);
      for (const tsExt of [".ts", ".tsx", ".mts", ".cts"]) pushIfExists(path.join(withoutExt, `index${tsExt}`));
    }
  } else {
    for (const ext of EXTS) pushIfExists(candidate + ext);
    for (const ext of EXTS) pushIfExists(path.join(candidate, `index${ext}`));
  }

  if (tries.length === 0) return null;

  const resolved = tries[0]!.replace(/\\/g, "/");
  const rootNormalized = ROOT.replace(/\\/g, "/");
  return resolved.startsWith(rootNormalized) ? resolved.slice(rootNormalized.length + 1) : resolved;
}

function walkDir(dir: string, exts = [".ts", ".tsx", ".mts", ".cts"]): string[] {
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
    unresolvedImports: [],
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
    const imports = extractImports(content);

    for (const imp of imports) {
      const toFile = resolveImport(relFile, imp.specifier);
      if (!toFile) {
        summary.unresolvedImports.push({
          fromFile: relFile,
          specifier: imp.specifier,
          line: imp.line,
          column: imp.column,
        });
        continue;
      }

      const toPkg = classifyFile(toFile);
      if (!toPkg || toPkg === fromPkg) continue;

      summary.importCounts[`${fromPkg}→${toPkg}`] = (summary.importCounts[`${fromPkg}→${toPkg}`] ?? 0) + 1;

      const allowed = config.allowedDeps[fromPkg] ?? [];
      if (!allowed.includes(toPkg)) {
        summary.violations.push({
          fromFile: relFile,
          toFile,
          fromPkg,
          toPkg,
          line: imp.line,
          column: imp.column,
          specifier: imp.specifier,
          kind: fromPkg === "@ananke/core" ? "violation" : "suspicious",
        });
      }
    }
  }

  summary.unmappedFiles.sort();
  summary.unresolvedImports.sort((a, b) =>
    a.fromFile.localeCompare(b.fromFile) || a.line - b.line || a.column - b.column || a.specifier.localeCompare(b.specifier),
  );
  summary.violations.sort((a, b) =>
    a.kind.localeCompare(b.kind) ||
    a.fromFile.localeCompare(b.fromFile) ||
    a.line - b.line ||
    a.column - b.column ||
    a.specifier.localeCompare(b.specifier),
  );

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
  lines.push(`- Unresolved relative imports: ${summary.unresolvedImports.length}`);
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
      lines.push(
        `- \`${v.fromFile}:${v.line}:${v.column}\` imports \`${v.specifier}\` → \`${v.toFile}\` (${SHORT[v.fromPkg]} → ${SHORT[v.toPkg]}).`,
      );
    }
  }

  lines.push("");
  lines.push("## Suspicious imports (warning mode)");
  lines.push("");
  if (suspiciousImports.length === 0) {
    lines.push("None.");
  } else {
    for (const v of suspiciousImports) {
      lines.push(
        `- \`${v.fromFile}:${v.line}:${v.column}\` imports \`${v.specifier}\` → \`${v.toFile}\` (${SHORT[v.fromPkg]} → ${SHORT[v.toPkg]}).`,
      );
    }
  }

  lines.push("");
  lines.push("## Unresolved relative imports");
  lines.push("");
  if (summary.unresolvedImports.length === 0) {
    lines.push("None.");
  } else {
    for (const u of summary.unresolvedImports) {
      lines.push(`- \`${u.fromFile}:${u.line}:${u.column}\` references unresolved path \`${u.specifier}\`.`);
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
const STRICT_ALL = process.argv.includes("--strict-all");
const JSON_OUT = process.argv.includes("--json");
const REPORT_MD_PATH = (() => {
  const arg = process.argv.find(a => a.startsWith("--report-md="));
  return arg ? arg.slice("--report-md=".length) : null;
})();
const MAX_HARD = (() => {
  const arg = process.argv.find(a => a.startsWith("--max-hard="));
  if (!arg) return null;
  const n = Number(arg.slice("--max-hard=".length));
  return Number.isFinite(n) ? n : null;
})();
const MAX_SUSPICIOUS = (() => {
  const arg = process.argv.find(a => a.startsWith("--max-suspicious="));
  if (!arg) return null;
  const n = Number(arg.slice("--max-suspicious=".length));
  return Number.isFinite(n) ? n : null;
})();

const summary = analyse();
const hardViolations = summary.violations.filter(v => v.kind === "violation");
const suspiciousImports = summary.violations.filter(v => v.kind === "suspicious");

if (REPORT_MD_PATH) {
  writeMarkdownReport(summary, path.resolve(ROOT, REPORT_MD_PATH));
}

const exceedsHardCap = MAX_HARD !== null && hardViolations.length > MAX_HARD;
const exceedsSuspiciousCap = MAX_SUSPICIOUS !== null && suspiciousImports.length > MAX_SUSPICIOUS;
const shouldFail = (STRICT_ALL ? summary.violations.length > 0 : STRICT ? hardViolations.length > 0 : false) || exceedsHardCap || exceedsSuspiciousCap;

if (JSON_OUT) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(shouldFail ? 1 : 0);
}

console.log("\nAnanke — Package Boundary Check  (PM-2)");
console.log("═".repeat(70));
console.log(`  Source files scanned : ${summary.scannedFiles}`);
console.log(`  Files mapped to pkg  : ${summary.mappedFiles}`);
console.log(`  Unmapped files       : ${summary.unmappedFiles.length}`);
console.log(`  Unresolved imports   : ${summary.unresolvedImports.length}`);

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
  console.log(`\n❌  Hard violations (${hardViolations.length}) — core must not depend on upper layers.`);
} else {
  console.log("\n✅  No hard violations — core is clean of upward deps.");
}

if (suspiciousImports.length > 0) {
  console.log(`\n⚠   Suspicious cross-boundary imports (${suspiciousImports.length}) — warning mode.`);
} else {
  console.log("\n✅  No suspicious cross-boundary imports.");
}

if (summary.unresolvedImports.length > 0) {
  console.log(`\n⚠   Unresolved relative imports (${summary.unresolvedImports.length}) — update checker/config if these are generated files.`);
}

if (MAX_HARD !== null) {
  console.log(`\n🎯  Hard cap: ${hardViolations.length}/${MAX_HARD}`);
}

if (MAX_SUSPICIOUS !== null) {
  console.log(`🎯  Suspicious cap: ${suspiciousImports.length}/${MAX_SUSPICIOUS}`);
}

if (summary.unmappedFiles.length > 0) {
  console.log(`\nℹ   Unmapped source files (${summary.unmappedFiles.length}) — not yet assigned to a package.`);
}

if (REPORT_MD_PATH) {
  console.log(`\n📝 Boundary report written to ${REPORT_MD_PATH}`);
}

if (shouldFail) process.exit(1);
