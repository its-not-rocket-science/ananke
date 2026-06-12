#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

type IssueKind = "broken-link" | "missing-script" | "missing-export" | "missing-example-file" | "missing-file";
interface Issue { kind: IssueKind; file: string; line: number; message: string; }

const REPO_ROOT = process.cwd();
const DOC_ROOTS = ["README.md", "docs"];
const PACKAGE_NAME = "@its-not-rocket-science/ananke";
const IGNORE_DIRS = new Set([".git", "node_modules", "dist", "build", ".docusaurus"]);

function safeStat(filePath: string) {
  try { return statSync(filePath); } catch { return null; }
}

function walkMarkdownFiles(input: string, files: string[] = []): string[] {
  const abs = path.join(REPO_ROOT, input);
  const stat = safeStat(abs);
  if (!stat) return files;
  if (stat.isFile()) {
    if (path.extname(input).toLowerCase() === ".md") files.push(input);
    return files;
  }

  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(input, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walkMarkdownFiles(rel, files);
      continue;
    }
    if (path.extname(entry.name).toLowerCase() === ".md") files.push(rel);
  }
  return files;
}

function lineAt(content: string, index: number): number {
  return content.slice(0, Math.max(index, 0)).split("\n").length;
}

function normalizeRef(target: string): string {
  return target.replace(/[?#].*$/, "").replace(/[.,;:!?]+$/, "");
}

function isExternal(target: string): boolean {
  return /^(?:[a-z]+:|#|mailto:|tel:)/i.test(target) || /^(?:\.\.\/)+actions\/workflows\//.test(target);
}

function shouldSkipNonFileRoute(target: string): boolean {
  if (target.startsWith("./") || target.startsWith("../") || target.startsWith("/")) return false;
  if (target.includes("/")) return false;
  if (path.extname(target)) return false;
  return true;
}

function resolveCandidates(fromDoc: string, target: string): string[] {
  const clean = normalizeRef(target);
  if (!clean || clean.includes("*")) return [];

  const candidates = new Set<string>();
  candidates.add(path.normalize(path.join(path.dirname(fromDoc), clean)));
  candidates.add(path.normalize(clean.replace(/^\//, "")));
  return [...candidates];
}

function collectAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();
  const headingRe = /^#{1,6}\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(markdown)) !== null) {
    const anchor = (m[1] ?? "")
      .toLowerCase()
      .replace(/[`*_~]/g, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    if (anchor) anchors.add(anchor);
  }
  return anchors;
}

function loadScripts(): Set<string> {
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  return new Set(Object.keys(pkg.scripts ?? {}));
}

function toSrcTypePath(typesPath: string): string | null {
  if (!typesPath.startsWith("./dist/src/") || !typesPath.endsWith(".d.ts")) return null;
  const candidate = path.join(REPO_ROOT, typesPath.replace(/^\.\/dist\/src\//, "src/").replace(/\.d\.ts$/, ".ts"));
  if (existsSync(candidate)) return candidate;
  const indexCandidate = candidate.replace(/\.ts$/, "/index.ts");
  return existsSync(indexCandidate) ? indexCandidate : null;
}

function loadExports(): Map<string, Set<string>> {
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as { exports?: Record<string, unknown> };
  const exportFiles = new Map<string, string>();

  for (const [key, value] of Object.entries(pkg.exports ?? {})) {
    if (!(key === "." || key.startsWith("./"))) continue;
    const typesPath = typeof value === "string"
      ? value
      : typeof value === "object" && value !== null && "types" in value && typeof (value as { types?: unknown }).types === "string"
        ? (value as { types: string }).types
        : null;
    if (!typesPath) continue;
    const srcPath = toSrcTypePath(typesPath);
    if (!srcPath) continue;
    const specifier = key === "." ? PACKAGE_NAME : `${PACKAGE_NAME}${key.slice(1)}`;
    exportFiles.set(specifier, srcPath);
  }

  const program = ts.createProgram({
    rootNames: [...new Set(exportFiles.values())],
    options: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true },
  });
  const checker = program.getTypeChecker();
  const exportsBySpecifier = new Map<string, Set<string>>();

  for (const [specifier, filePath] of exportFiles) {
    const source = program.getSourceFile(filePath);
    if (!source) continue;
    const symbol = checker.getSymbolAtLocation(source);
    if (!symbol) continue;
    exportsBySpecifier.set(specifier, new Set(checker.getExportsOfModule(symbol).map((s) => s.getName())));
  }

  return exportsBySpecifier;
}

function parseLinks(content: string): Array<{ target: string; line: number }> {
  const links: Array<{ target: string; line: number }> = [];
  const re = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) links.push({ target: m[1] ?? "", line: lineAt(content, m.index) });
  return links;
}

interface FencedBlock { info: string; code: string; line: number; }
function extractFencedBlocks(content: string): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  const re = /```([^\n`]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    blocks.push({ info: (m[1] ?? "").trim().toLowerCase(), code: m[2] ?? "", line: lineAt(content, m.index) });
  }
  return blocks;
}

function main(): void {
  const files = [...new Set(DOC_ROOTS.flatMap((root) => walkMarkdownFiles(root)))].sort();
  const scripts = loadScripts();
  const exportsBySpecifier = loadExports();
  const issues: Issue[] = [];
  const cache = new Map<string, string>();

  const importRe = /(?:import|export)\s+(?:type\s+)?(?:\{([^}]+)\}|[\w*\s,]+)\s+from\s+["'](@its-not-rocket-science\/ananke(?:\/[a-zA-Z0-9._-]+)*)["']/g;

  for (const relFile of files) {
    const absFile = path.join(REPO_ROOT, relFile);
    const content = readFileSync(absFile, "utf8");
    cache.set(relFile, content);

    for (const link of parseLinks(content)) {
      if (!link.target || isExternal(link.target) || shouldSkipNonFileRoute(link.target)) continue;

      const [_, rawAnchor] = link.target.split("#", 2);
      const candidates = resolveCandidates(relFile, link.target);
      const existing = candidates.find((c) => existsSync(path.join(REPO_ROOT, c)));
      if (!existing) {
        const kind: IssueKind = link.target.includes("examples/") ? "missing-example-file" : "broken-link";
        const message = link.target.includes("examples/")
          ? `Example file reference not found: ${link.target}`
          : `Relative link target not found: ${link.target}`;
        issues.push({ kind, file: relFile, line: link.line, message });
        continue;
      }

      if (!rawAnchor || path.extname(existing).toLowerCase() !== ".md") continue;
      const targetContent = cache.get(existing) ?? readFileSync(path.join(REPO_ROOT, existing), "utf8");
      cache.set(existing, targetContent);
      if (!collectAnchors(targetContent).has(rawAnchor.toLowerCase())) {
        issues.push({ kind: "broken-link", file: relFile, line: link.line, message: `Missing markdown anchor '#${rawAnchor}' in ${existing}` });
      }

    }

    const fencedBlocks = extractFencedBlocks(content);

    for (const block of fencedBlocks) {
      if (relFile.startsWith("docs/companion-projects/")) {
        continue;
      }
      let s: RegExpExecArray | null;
      const scriptLineRe = /(?:^|\n)\s*(?:\$\s*)?npm\s+run\s+([a-zA-Z0-9:_-]+)/g;
      while ((s = scriptLineRe.exec(block.code)) !== null) {
        const name = s[1] ?? "";
        if (!scripts.has(name)) {
          issues.push({ kind: "missing-script", file: relFile, line: block.line + lineAt(block.code, s.index) - 1, message: `npm script not found in package.json: ${name}` });
        }
      }
    }

    for (const block of fencedBlocks) {
      if (block.info.includes("pseudocode") || block.info.includes("no-check-example")) continue;
      let i: RegExpExecArray | null;
      while ((i = importRe.exec(block.code)) !== null) {
        const namesRaw = i[1] ?? "";
        const specifier = i[2] ?? PACKAGE_NAME;
        const available = exportsBySpecifier.get(specifier);
        if (!available) {
          issues.push({ kind: "missing-export", file: relFile, line: block.line + lineAt(block.code, i.index) - 1, message: `Package export path not found: ${specifier}` });
          continue;
        }
        for (const name of namesRaw.split(",").map((v) => v.trim()).filter(Boolean).map((v) => v.replace(/^type\s+/, "").split(/\s+as\s+/i)[0]?.trim() ?? "").filter(Boolean)) {
          if (!available.has(name)) {
            issues.push({ kind: "missing-export", file: relFile, line: block.line + lineAt(block.code, i.index) - 1, message: `Export '${name}' not found in ${specifier}` });
          }
        }
      }
    }
  }

  if (issues.length === 0) {
    console.log(`✅ Docs freshness checks passed across ${files.length} markdown file(s).`);
    return;
  }

  console.error(`❌ Docs freshness checks found ${issues.length} issue(s):`);
  for (const issue of issues) {
    console.error(`- [${issue.kind}] ${issue.file}:${issue.line} ${issue.message}`);
  }
  process.exit(1);
}

main();
