// tools/audit-deprecations.ts
// PM-7: API Deprecation Framework — audit tool
//
// Scans src/ for @deprecated JSDoc tags and outputs a structured report.
// Any @deprecated tag with a "Removes at X.Y.Z" version ≤ current triggers
// an error in --check mode (used by prepublishOnly).
//
// Convention (from docs/versioning.md):
//   @deprecated since {version} — use {replacement} instead. Removes at {removeAfter}.
//
// Usage:
//   npm run build && npm run audit-deprecations
//   npm run audit-deprecations -- --json       (machine-readable output)
//   npm run audit-deprecations -- --check      (exit 1 if overdue removals exist)

import * as fs   from "node:fs";
import * as path from "node:path";
import { ANANKE_ENGINE_VERSION, semverSatisfies } from "../src/content-pack.js";

const ROOT    = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const JSON_OUT = process.argv.includes("--json");
const CHECK    = process.argv.includes("--check");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeprecatedEntry {
  /** Inferred symbol name (function/type/class/const name following the tag). */
  symbol:      string;
  /** Source file path relative to project root. */
  file:        string;
  /** 1-based line number of the @deprecated tag. */
  line:        number;
  /** Version in which the symbol was deprecated, e.g. "0.1.50". */
  since:       string | null;
  /** Version at which the symbol will be removed, e.g. "0.3.0". */
  removeAfter: string | null;
  /** Replacement guidance extracted from the tag body. */
  replacement: string | null;
  /** True if removeAfter ≤ current engine version (overdue for removal). */
  overdue:     boolean;
}

// ── Parser ────────────────────────────────────────────────────────────────────

// Matches the structured convention:
//   @deprecated since X.Y.Z — use ... instead. Removes at X.Y.Z.
const STRUCTURED_RE =
  /@deprecated\s+since\s+([\d.]+)\s*[—-]+\s*(.+?)\.\s*Removes at\s+([\d.]+)\.?/i;

// Fallback: any @deprecated with optional plain text
const FALLBACK_RE = /@deprecated\s*(.*)/i;

// After a tag line, look ahead up to 4 lines for the symbol name.
// Covers: declarations (function/class/type/interface/const/let/var/enum)
// and interface properties (  propName?: Type).
const DECL_RE = /(?:export\s+(?:default\s+)?)?(?:function|class|type|interface|const|let|var|enum)\s+(\w+)/;
const PROP_RE = /^\s{0,8}(?:readonly\s+)?(\w+)\??\s*[?!]?\s*:/;

function inferSymbol(lines: string[], tagLineIdx: number): string {
  for (let i = tagLineIdx; i < Math.min(tagLineIdx + 4, lines.length); i++) {
    const decl = lines[i]!.match(DECL_RE);
    if (decl) return decl[1]!;
    const prop = lines[i]!.match(PROP_RE);
    if (prop) return prop[1]!;
  }
  return "<unknown>";
}

function parseFile(filePath: string): DeprecatedEntry[] {
  const content = fs.readFileSync(filePath, "utf8");
  const lines   = content.split("\n");
  const entries: DeprecatedEntry[] = [];
  const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.includes("@deprecated")) continue;

    let since: string | null = null;
    let removeAfter: string | null = null;
    let replacement: string | null = null;

    const structured = line.match(STRUCTURED_RE);
    if (structured) {
      since       = structured[1]!;
      replacement = structured[2]!.trim();
      removeAfter = structured[3]!.replace(/\.$/, ""); // strip trailing dot
    } else {
      const fb = line.match(FALLBACK_RE);
      if (fb && fb[1]!.trim()) replacement = fb[1]!.trim();
    }

    const overdue =
      removeAfter !== null &&
      !semverSatisfies(removeAfter, `>${ANANKE_ENGINE_VERSION}`);

    entries.push({
      symbol:      inferSymbol(lines, i + 1),
      file:        rel,
      line:        i + 1,
      since,
      removeAfter,
      replacement,
      overdue,
    });
  }
  return entries;
}

function walkDir(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkDir(full));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts"))) {
      out.push(full);
    }
  }
  return out;
}

// ── Run ───────────────────────────────────────────────────────────────────────

const files   = walkDir(SRC_DIR);
const entries = files.flatMap(parseFile);

entries.sort((a, b) => {
  const fc = a.file.localeCompare(b.file);
  return fc !== 0 ? fc : a.line - b.line;
});

const overdue = entries.filter(e => e.overdue);

// ── Output ────────────────────────────────────────────────────────────────────

if (JSON_OUT) {
  console.log(JSON.stringify({
    _generated:          new Date().toISOString(),
    anankeEngineVersion: ANANKE_ENGINE_VERSION,
    total:               entries.length,
    overdue:             overdue.length,
    entries,
  }, null, 2));
  process.exit(CHECK && overdue.length > 0 ? 1 : 0);
}

console.log(`\nAnanke — Deprecated API Audit\n` + `═`.repeat(60));
console.log(`  Engine version: ${ANANKE_ENGINE_VERSION}`);
console.log(`  Found ${entries.length} deprecated symbol(s), ${overdue.length} overdue\n`);

if (entries.length === 0) {
  console.log("  (no @deprecated tags found in src/)");
} else {
  for (const e of entries) {
    const since       = e.since       ? `since ${e.since}` : "since ?";
    const removeAfter = e.removeAfter ? `removes at ${e.removeAfter}` : "no removal date";
    const overdueTag  = e.overdue     ? " ⚠ OVERDUE" : "";
    console.log(`  ${e.overdue ? "⚠" : "·"} ${e.symbol}`);
    console.log(`      ${e.file}:${e.line}  [${since} · ${removeAfter}]${overdueTag}`);
    if (e.replacement) console.log(`      use: ${e.replacement}`);
  }
}

if (overdue.length > 0) {
  console.log(`\n  ⚠  ${overdue.length} symbol(s) are overdue for removal (removeAfter ≤ ${ANANKE_ENGINE_VERSION}):`);
  for (const e of overdue) {
    console.log(`     ${e.symbol}  (${e.file}:${e.line})`);
  }
}

const allOk = !CHECK || overdue.length === 0;
console.log(`\n  Verdict: ${allOk ? "✅ no overdue deprecations" : "❌ overdue deprecations — bump removeAfter or remove the symbol"}\n`);

process.exit(allOk ? 0 : 1);
