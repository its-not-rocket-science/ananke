#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const REPO_ROOT = process.cwd();
const PACKAGE_ROOT = "@its-not-rocket-science/ananke";
const GENERATED_ROOT = path.join(REPO_ROOT, ".tmp", "doc-ts-examples");
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);
const IGNORE_SEGMENTS = new Set(["node_modules", ".git", "build", ".docusaurus"]);

type BlockMode = "example" | "pseudocode";

interface TsBlock {
  blockIndex: number;
  info: string;
  code: string;
  line: number;
  mode: BlockMode;
}

interface BlockMeta {
  sourceFile: string;
  blockIndex: number;
  blockLine: number;
  claimedStability: CanonicalStability;
}

type CanonicalStability = "tier1" | "experimental" | "internal" | "subpath-stable" | "shipped" | "unknown";

function walkMarkdownFiles(inputPath: string, files: string[] = []): string[] {
  const abs = path.join(REPO_ROOT, inputPath);
  let stat;
  try {
    stat = statSync(abs);
  } catch {
    return files;
  }

  if (stat.isFile()) {
    if (MARKDOWN_EXTENSIONS.has(path.extname(inputPath).toLowerCase())) {
      files.push(inputPath);
    }
    return files;
  }

  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(inputPath, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_SEGMENTS.has(entry.name)) {
        continue;
      }
      walkMarkdownFiles(rel, files);
      continue;
    }

    if (MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(rel);
    }
  }

  return files;
}

function parseBlockMode(info: string): BlockMode {
  const tokens = info.split(/\s+/).map(t => t.toLowerCase()).filter(Boolean);
  if (tokens.includes("pseudocode") || tokens.includes("no-check-example")) {
    return "pseudocode";
  }
  return "example";
}

function extractTypeScriptBlocks(content: string): TsBlock[] {
  const blocks: TsBlock[] = [];
  const fenceRe = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let tsBlockIndex = 0;

  while ((match = fenceRe.exec(content)) !== null) {
    const info = (match[1] || "").trim();
    const lang = info.split(/\s+/)[0]?.toLowerCase();
    if (!lang || !["ts", "tsx", "typescript"].includes(lang)) {
      continue;
    }

    tsBlockIndex += 1;
    const line = content.slice(0, match.index).split("\n").length;

    blocks.push({
      blockIndex: tsBlockIndex,
      info,
      code: match[2] ?? "",
      line,
      mode: parseBlockMode(info),
    });
  }

  return blocks;
}

function toSrcTypePath(typesPath: string): string | null {
  if (!typesPath.startsWith("./dist/src/") || !typesPath.endsWith(".d.ts")) {
    return null;
  }

  const candidate = path.join(REPO_ROOT, typesPath.replace(/^\.\/dist\/src\//, "src/").replace(/\.d\.ts$/, ".ts"));
  if (existsSync(candidate)) {
    return candidate;
  }

  const indexCandidate = candidate.replace(/\.ts$/, "/index.ts");
  if (existsSync(indexCandidate)) {
    return indexCandidate;
  }

  return null;
}

function loadPackageExportMap(): Map<string, string> {
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
    exports?: Record<string, unknown>;
  };
  const exportsMap = pkg.exports ?? {};
  const map = new Map<string, string>();

  for (const [key, value] of Object.entries(exportsMap)) {
    if (!(key === "." || key.startsWith("./"))) {
      continue;
    }

    const typesPath =
      typeof value === "string"
        ? value
        : typeof value === "object" && value !== null && "types" in value && typeof (value as { types?: unknown }).types === "string"
          ? (value as { types: string }).types
          : null;

    if (!typesPath) {
      continue;
    }

    const srcPath = toSrcTypePath(typesPath);
    if (!srcPath) {
      continue;
    }

    const specifier = key === "." ? PACKAGE_ROOT : `${PACKAGE_ROOT}${key.slice(1)}`;
    map.set(specifier, srcPath);
  }

  return map;
}

function toModuleSpecifier(fromFile: string, toTsFile: string): string {
  const rel = path.relative(path.dirname(fromFile), toTsFile).replace(/\\/g, "/");
  const withPrefix = rel.startsWith(".") ? rel : `./${rel}`;
  return withPrefix.replace(/\/index\.ts$/, "/index.js").replace(/\.ts$/, ".js");
}

function normalizeImports(code: string, virtualFilePath: string, exportMap: Map<string, string>): string {
  const replaceSpecifier = (specifier: string): string => {
    if (specifier === PACKAGE_ROOT || specifier.startsWith(`${PACKAGE_ROOT}/`)) {
      const srcPath = exportMap.get(specifier);
      if (!srcPath) {
        return specifier;
      }
      return toModuleSpecifier(virtualFilePath, srcPath);
    }
    return specifier;
  };

  let normalized = code.replace(/(\bfrom\s+["'])([^"']+)(["'])/g, (_m, p1, spec, p3) => {
    return `${p1}${replaceSpecifier(spec)}${p3}`;
  });

  normalized = normalized.replace(/(\bimport\(\s*["'])([^"']+)(["']\s*\))/g, (_m, p1, spec, p3) => {
    return `${p1}${replaceSpecifier(spec)}${p3}`;
  });

  return normalized;
}

function flattenDiagnosticMessage(messageText: string | ts.DiagnosticMessageChain): string {
  return typeof messageText === "string" ? messageText : ts.flattenDiagnosticMessageText(messageText, "\n");
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
    if (key === "." || !key.startsWith("./")) continue;
    map.set(`${PACKAGE_ROOT}${key.slice(1)}`, "shipped");
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

function inferClaimedStability(content: string, blockStartLine: number): CanonicalStability {
  const lines = content.split("\n");
  const lineIndex = Math.max(0, blockStartLine - 1);
  const start = Math.max(0, lineIndex - 8);
  const end = Math.min(lines.length - 1, lineIndex + 2);
  const isStabilityLine = (line: string): boolean =>
    /\bstability\s*:|\bstatus\s*:|^\|[^|]*stability[^|]*\|/i.test(line) ||
    /root-stable|subpath-stable|shipped but undocumented/i.test(line);

  for (let i = lineIndex; i >= start; i -= 1) {
    const candidate = lines[i] ?? "";
    if (!isStabilityLine(candidate)) continue;
    const label = canonicalizeStabilityLabel(candidate);
    if (label !== "unknown") return label;
  }
  for (let i = lineIndex + 1; i <= end; i += 1) {
    const candidate = lines[i] ?? "";
    if (!isStabilityLine(candidate)) continue;
    const label = canonicalizeStabilityLabel(candidate);
    if (label !== "unknown") return label;
  }
  return "unknown";
}

function resolveMarkdownFiles(): string[] {
  const files = new Set<string>(["README.md"]);
  for (const file of walkMarkdownFiles("docs")) {
    files.add(file);
  }
  return [...files].sort();
}

function main(): void {
  rmSync(GENERATED_ROOT, { recursive: true, force: true });
  mkdirSync(GENERATED_ROOT, { recursive: true });

  const exportMap = loadPackageExportMap();
  const stabilityBySpecifier = expectedStabilityBySpecifier();
  const markdownFiles = resolveMarkdownFiles();
  const roots: string[] = [];
  const metadataByGeneratedFile = new Map<string, BlockMeta>();

  let pseudocodeBlocks = 0;
  let exampleBlocks = 0;

  for (const relFile of markdownFiles) {
    const absFile = path.join(REPO_ROOT, relFile);
    const content = readFileSync(absFile, "utf8");
    const blocks = extractTypeScriptBlocks(content);

    for (const block of blocks) {
      if (block.mode === "pseudocode") {
        pseudocodeBlocks += 1;
        continue;
      }

      exampleBlocks += 1;
      const safeRelDir = path.dirname(relFile);
      const safeBaseName = path.basename(relFile).replace(/[^a-zA-Z0-9_.-]/g, "_");
      const outDir = path.join(GENERATED_ROOT, safeRelDir);
      mkdirSync(outDir, { recursive: true });

      const outFile = path.join(outDir, `${safeBaseName}.block-${block.blockIndex}.ts`);
      const normalized = normalizeImports(block.code, outFile, exportMap);
      const wrapped = `// Source: ${relFile} (ts block ${block.blockIndex}, mode=${block.mode})\n${normalized}\n\nexport {};\n`;
      writeFileSync(outFile, wrapped, "utf8");
      roots.push(outFile);
      metadataByGeneratedFile.set(path.resolve(outFile), {
        sourceFile: relFile,
        blockIndex: block.blockIndex,
        blockLine: block.line,
        claimedStability: inferClaimedStability(content, block.line),
      });
    }
  }

  if (roots.length === 0) {
    console.log(`✅ No TypeScript doc examples found. (${pseudocodeBlocks} pseudocode block(s) skipped)`);
    return;
  }

  const program = ts.createProgram({
    rootNames: roots,
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
      forceConsistentCasingInFileNames: true,
      types: ["node"],
    },
  });

  const diagnostics = ts.getPreEmitDiagnostics(program);
  const stabilityFailures: string[] = [];
  const importRe = /import\s+(?:type\s+)?(?:\{[^}]+\}|[\w*\s,]+)\s+from\s+["'](@its-not-rocket-science\/ananke(?:\/[a-zA-Z0-9._-]+)*)["']/g;
  for (const generated of roots) {
    const meta = metadataByGeneratedFile.get(path.resolve(generated));
    if (!meta || meta.claimedStability === "unknown") continue;
    const code = readFileSync(generated, "utf8");
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(code)) !== null) {
      const specifier = m[1] ?? PACKAGE_ROOT;
      const expected = stabilityBySpecifier.get(specifier) ?? "unknown";
      if (expected !== "unknown" && expected !== meta.claimedStability) {
        stabilityFailures.push(
          `${meta.sourceFile} [ts block ${meta.blockIndex}] claims ${meta.claimedStability} but import '${specifier}' is ${expected}`,
        );
      }
    }
  }

  if (diagnostics.length === 0 && stabilityFailures.length === 0) {
    console.log(`✅ Typechecked ${exampleBlocks} TypeScript doc example block(s); skipped ${pseudocodeBlocks} pseudocode block(s).`);
    return;
  }

  const blockFailures = new Map<string, BlockMeta & { line: number; col: number; code: number; message: string }>();
  const nonBlockDiagnostics: Array<{ location: string | null; code: number; message: string }> = [];

  for (const diagnostic of diagnostics) {
    const message = flattenDiagnosticMessage(diagnostic.messageText);
    const code = diagnostic.code;

    if (diagnostic.file && typeof diagnostic.start === "number") {
      const source = diagnostic.file;
      const filePath = path.resolve(source.fileName);
      const position = source.getLineAndCharacterOfPosition(diagnostic.start);
      const line = position.line + 1;
      const col = position.character + 1;
      const meta = metadataByGeneratedFile.get(filePath);

      if (meta) {
        const key = `${meta.sourceFile}::${meta.blockIndex}`;
        if (!blockFailures.has(key)) {
          blockFailures.set(key, { ...meta, line, col, code, message });
        }
        continue;
      }

      nonBlockDiagnostics.push({
        location: `${path.relative(REPO_ROOT, filePath)}:${line}:${col}`,
        code,
        message,
      });
      continue;
    }

    nonBlockDiagnostics.push({ location: null, code, message });
  }

  console.error(`❌ Found ${blockFailures.size + nonBlockDiagnostics.length + stabilityFailures.length} failing doc example location(s).`);
  for (const failure of blockFailures.values()) {
    console.error(
      `- ${failure.sourceFile} [ts block ${failure.blockIndex}] (starts at line ${failure.blockLine}) -> TS${failure.code} at ${failure.line}:${failure.col}`,
    );
    console.error(`  ${failure.message}`);
  }

  for (const diagnostic of nonBlockDiagnostics) {
    if (diagnostic.location) {
      console.error(`- ${diagnostic.location} -> TS${diagnostic.code}`);
      console.error(`  ${diagnostic.message}`);
    } else {
      console.error(`- TS${diagnostic.code}: ${diagnostic.message}`);
    }
  }
  for (const failure of stabilityFailures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

main();
