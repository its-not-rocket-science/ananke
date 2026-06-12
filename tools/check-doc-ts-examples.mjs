#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const REPO_ROOT = process.cwd();
const DEFAULT_DOC_ROOTS = ["README.md", "docs"];
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);
const IGNORE_SEGMENTS = new Set(["node_modules", ".git", "build", ".docusaurus"]);
const PACKAGE_ROOT = "@its-not-rocket-science/ananke";
const NO_CHECK_MARKER = "no-check-example";
const GENERATED_ROOT = path.join(REPO_ROOT, ".tmp", "doc-ts-examples");

function walkMarkdownFiles(inputPath, files = []) {
  const abs = path.join(REPO_ROOT, inputPath);
  let stat;
  try {
    stat = statSync(abs);
  } catch {
    return files;
  }

  if (stat.isFile()) {
    if (MARKDOWN_EXTENSIONS.has(path.extname(inputPath))) {
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
    } else if (MARKDOWN_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(rel);
    }
  }

  return files;
}

function extractTypeScriptBlocks(content) {
  const blocks = [];
  const fenceRe = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match;
  let tsBlockIndex = 0;

  while ((match = fenceRe.exec(content)) !== null) {
    const info = (match[1] || "").trim();
    const lang = info.split(/\s+/)[0]?.toLowerCase();
    if (!["ts", "tsx", "typescript"].includes(lang)) {
      continue;
    }

    tsBlockIndex += 1;
    const line = content.slice(0, match.index).split("\n").length;
    const noCheck = info.includes(NO_CHECK_MARKER);

    blocks.push({
      blockIndex: tsBlockIndex,
      info,
      code: match[2],
      line,
      noCheck,
    });
  }

  return blocks;
}

function toSrcTypePath(typesPath) {
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

function loadPackageExportMap() {
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  const exportsMap = pkg.exports ?? {};
  const map = new Map();

  for (const [key, value] of Object.entries(exportsMap)) {
    if (!(key === "." || key.startsWith("./"))) {
      continue;
    }

    const typesPath =
      typeof value === "string"
        ? value
        : typeof value === "object" && value && typeof value.types === "string"
          ? value.types
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

function toModuleSpecifier(fromFile, toTsFile) {
  const rel = path.relative(path.dirname(fromFile), toTsFile).replace(/\\/g, "/");
  const withPrefix = rel.startsWith(".") ? rel : `./${rel}`;
  return withPrefix.replace(/\/index\.ts$/, "/index.js").replace(/\.ts$/, ".js");
}

function normalizeImports(code, virtualFilePath, exportMap) {
  const replaceSpecifier = (specifier) => {
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

function flattenDiagnosticMessage(messageText) {
  return typeof messageText === "string" ? messageText : ts.flattenDiagnosticMessageText(messageText, "\n");
}

function main() {
  rmSync(GENERATED_ROOT, { recursive: true, force: true });
  mkdirSync(GENERATED_ROOT, { recursive: true });

  const exportMap = loadPackageExportMap();
  const markdownFiles = resolveMarkdownFiles().sort();
  const roots = [];
  const metadataByGeneratedFile = new Map();

  for (const relFile of markdownFiles) {
    const absFile = path.join(REPO_ROOT, relFile);
    const content = readFileSync(absFile, "utf8");
    const blocks = extractTypeScriptBlocks(content);

    for (const block of blocks) {
      if (block.noCheck) {
        continue;
      }

      const safeRelDir = path.dirname(relFile);
      const safeBaseName = path.basename(relFile).replace(/[^a-zA-Z0-9_.-]/g, "_");
      const outDir = path.join(GENERATED_ROOT, safeRelDir);
      mkdirSync(outDir, { recursive: true });

      const outFile = path.join(outDir, `${safeBaseName}.block-${block.blockIndex}.ts`);
      const normalized = normalizeImports(block.code, outFile, exportMap);
      const wrapped = `// Source: ${relFile} (ts block ${block.blockIndex})\n${normalized}\n\nexport {};\n`;
      writeFileSync(outFile, wrapped, "utf8");
      roots.push(outFile);
      metadataByGeneratedFile.set(path.resolve(outFile), {
        sourceFile: relFile,
        blockIndex: block.blockIndex,
        blockLine: block.line,
      });
    }
  }

  const compilerOptions = {
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
  };

  const program = ts.createProgram({
    rootNames: roots,
    options: compilerOptions,
  });

  const diagnostics = ts.getPreEmitDiagnostics(program);

  if (diagnostics.length === 0) {
    console.log(`✅ Typechecked ${roots.length} TypeScript doc example block(s).`);
    return;
  }

  const blockFailures = new Map();
  const nonBlockDiagnostics = [];
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
          blockFailures.set(key, {
            sourceFile: meta.sourceFile,
            blockIndex: meta.blockIndex,
            blockLine: meta.blockLine,
            line,
            col,
            code,
            message,
          });
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

    nonBlockDiagnostics.push({
      location: null,
      code,
      message,
    });
  }

  console.error(`❌ Found ${blockFailures.size + nonBlockDiagnostics.length} failing doc example location(s).`);
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

  process.exit(1);
}

function resolveMarkdownFiles() {
  const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  const publishedFiles = Array.isArray(packageJson.files) ? packageJson.files : [];
  const preferred = publishedFiles.filter((entry) => entry === "README.md" || /^docs\/.*\.md$/i.test(entry));

  if (preferred.length > 0) {
    return preferred;
  }

  return DEFAULT_DOC_ROOTS.flatMap((root) => walkMarkdownFiles(root));
}

main();
