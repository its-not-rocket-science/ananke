import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

type ExportKind = "function" | "class" | "interface" | "type" | "enum" | "const" | "variable" | "unknown";

interface ExportParam {
  name: string;
  type: string;
}

interface ApiExport {
  name: string;
  kind: ExportKind;
  params: ExportParam[];
  returnType: string | null;
}

interface ApiSurface {
  exports: ApiExport[];
  tsconfig: string;
}

interface CliArgs {
  rootDir: string;
  tsconfigPath: string;
  entryPath: string;
  outPath?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const rootDir = process.cwd();
  const defaults = {
    rootDir,
    tsconfigPath: path.join(rootDir, "tsconfig.build.json"),
    entryPath: path.join(rootDir, "src/index.ts"),
  };

  const getArg = (name: string): string | undefined => {
    const withEq = argv.find((value) => value.startsWith(`${name}=`));
    if (withEq) return withEq.slice(name.length + 1);
    const idx = argv.indexOf(name);
    if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
    return undefined;
  };

  const parsedRoot = getArg("--root") ? path.resolve(getArg("--root")!) : defaults.rootDir;
  const tsconfigPath = path.resolve(parsedRoot, getArg("--tsconfig") ?? path.relative(parsedRoot, defaults.tsconfigPath));
  const entryPath = path.resolve(parsedRoot, getArg("--entry") ?? path.relative(parsedRoot, defaults.entryPath));
  const outArg = getArg("--out");

  const args: CliArgs = {
    rootDir: parsedRoot,
    tsconfigPath,
    entryPath,
  };

  if (outArg) {
    args.outPath = path.resolve(parsedRoot, outArg);
  }

  return args;
}

function loadProgram(tsconfigPath: string): ts.Program {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext([configFile.error], formatHost()));
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath));
  if (parsed.errors.length > 0) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, formatHost()));
  }

  return ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
}

function formatHost(): ts.FormatDiagnosticsHost {
  return {
    getCanonicalFileName: (fileName: string) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  };
}

function normalizeType(typeText: string): string {
  return typeText.replace(/\s+/g, " ").trim();
}

function symbolKind(symbol: ts.Symbol, checker: ts.TypeChecker): ExportKind {
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const flags = resolved.flags;

  if (flags & ts.SymbolFlags.Function) return "function";
  if (flags & ts.SymbolFlags.Class) return "class";
  if (flags & ts.SymbolFlags.Interface) return "interface";
  if (flags & ts.SymbolFlags.TypeAlias) return "type";
  if (flags & ts.SymbolFlags.Enum) return "enum";
  if (flags & ts.SymbolFlags.ConstEnum) return "enum";
  if (flags & ts.SymbolFlags.BlockScopedVariable) return "const";
  if (flags & ts.SymbolFlags.Variable) return "variable";

  for (const decl of resolved.declarations ?? []) {
    if (ts.isFunctionDeclaration(decl)) return "function";
    if (ts.isClassDeclaration(decl)) return "class";
    if (ts.isInterfaceDeclaration(decl)) return "interface";
    if (ts.isTypeAliasDeclaration(decl)) return "type";
    if (ts.isEnumDeclaration(decl)) return "enum";
    if (ts.isVariableDeclaration(decl)) {
      const parent = decl.parent;
      if (ts.isVariableDeclarationList(parent) && (parent.flags & ts.NodeFlags.Const)) return "const";
      return "variable";
    }
  }

  return "unknown";
}

function extractSignatureData(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  entrySource: ts.SourceFile,
): Pick<ApiExport, "params" | "returnType"> {
  const type = checker.getTypeOfSymbolAtLocation(symbol, entrySource);
  const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);

  if (signatures.length === 0) {
    return { params: [], returnType: null };
  }

  const signature = signatures[0]!;
  const params = signature.getParameters().map((parameter) => {
    const decl = parameter.valueDeclaration ?? parameter.declarations?.[0] ?? entrySource;
    const parameterType = checker.getTypeOfSymbolAtLocation(parameter, decl);
    return {
      name: parameter.getName(),
      type: normalizeType(checker.typeToString(parameterType, decl, ts.TypeFormatFlags.NoTruncation)),
    };
  });

  const returnType = normalizeType(
    checker.typeToString(signature.getReturnType(), entrySource, ts.TypeFormatFlags.NoTruncation),
  );

  return { params, returnType };
}

function extractApiSurface(program: ts.Program, entryPath: string, tsconfigPath: string): ApiSurface {
  const checker = program.getTypeChecker();
  const entrySource = program.getSourceFile(entryPath);
  if (!entrySource) {
    throw new Error(`Could not load entry source file at ${entryPath}`);
  }

  const entrySymbol = checker.getSymbolAtLocation(entrySource);
  if (!entrySymbol) {
    throw new Error(`Could not resolve module symbol for ${entryPath}`);
  }

  const exports = checker.getExportsOfModule(entrySymbol)
    .map((exportSymbol): ApiExport => {
      const kind = symbolKind(exportSymbol, checker);
      const { params, returnType } = extractSignatureData(exportSymbol, checker, entrySource);
      return {
        name: exportSymbol.getName(),
        kind,
        params,
        returnType,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    exports,
    tsconfig: path.relative(process.cwd(), tsconfigPath),
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const program = loadProgram(args.tsconfigPath);
  const surface = extractApiSurface(program, args.entryPath, args.tsconfigPath);
  const payload = `${JSON.stringify(surface, null, 2)}\n`;

  if (args.outPath) {
    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, payload, "utf8");
    console.log(`Wrote API surface to ${args.outPath}`);
    return;
  }

  process.stdout.write(payload);
}

main();
