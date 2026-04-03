import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export type ApiParam = {
  name: string;
  type: string;
  optional: boolean;
};

export type ApiExport = {
  name: string;
  kind: string;
  params: ApiParam[];
  returnType: string;
};

export type ApiSurface = {
  exports: ApiExport[];
  tsconfig: string;
};

function normalizeType(type: string): string {
  return type.replace(/\s+/g, " ").trim();
}

function getKind(symbol: ts.Symbol): string {
  const flags = symbol.getFlags();
  if (flags & ts.SymbolFlags.Function) return "function";
  if (flags & ts.SymbolFlags.Class) return "class";
  if (flags & ts.SymbolFlags.Interface) return "interface";
  if (flags & ts.SymbolFlags.TypeAlias) return "type";
  if (flags & ts.SymbolFlags.Enum) return "enum";
  if (flags & ts.SymbolFlags.Module) return "namespace";
  if (flags & ts.SymbolFlags.Value) return "value";
  return "unknown";
}

function parseArgs(argv: string[]): Record<string, string> {
  const options: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [rawKey, rawValue] = arg.slice(2).split("=");
    if (!rawKey) continue;
    options[rawKey] = rawValue ?? "true";
  }
  return options;
}

export function extractApiSurface(rootDir: string, entry = "src/index.ts"): ApiSurface {
  const tsconfigPath = ts.findConfigFile(rootDir, ts.sys.fileExists, "tsconfig.build.json")
    ?? ts.findConfigFile(rootDir, ts.sys.fileExists, "tsconfig.json");

  if (!tsconfigPath) {
    throw new Error(`Unable to locate tsconfig in ${rootDir}`);
  }

  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }

  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath));
  const program = ts.createProgram({ rootNames: parsedConfig.fileNames, options: parsedConfig.options });
  const checker = program.getTypeChecker();

  const entryAbsPath = path.resolve(rootDir, entry);
  const sourceFile = program.getSourceFile(entryAbsPath);
  if (!sourceFile) {
    throw new Error(`Entrypoint not found in program: ${entryAbsPath}`);
  }

  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) {
    throw new Error(`No module symbol for ${entry}`);
  }

  const exports = checker.getExportsOfModule(moduleSymbol)
    .map((exportSymbol): ApiExport => {
      const symbol = (exportSymbol.getFlags() & ts.SymbolFlags.Alias)
        ? checker.getAliasedSymbol(exportSymbol)
        : exportSymbol;

      const name = exportSymbol.getName();
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
      const kind = getKind(symbol);

      if (declaration && ts.isClassDeclaration(declaration)) {
        const ctor = declaration.members.find(ts.isConstructorDeclaration);
        const params = ctor
          ? ctor.parameters.map((param) => {
              const paramType = checker.getTypeAtLocation(param);
              return {
                name: param.name.getText(),
                type: normalizeType(checker.typeToString(paramType)),
                optional: Boolean(param.questionToken || param.initializer),
              };
            })
          : [];
        return { name, kind, params, returnType: name };
      }

      if (declaration) {
        const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
        const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
        if (signatures.length > 0) {
          const signature = signatures[0]!;
          const params = signature.getParameters().map((paramSymbol) => {
            const paramDecl = paramSymbol.valueDeclaration ?? paramSymbol.declarations?.[0];
            const paramType = paramDecl
              ? checker.getTypeOfSymbolAtLocation(paramSymbol, paramDecl)
              : checker.getTypeAtLocation(declaration);
            const optional = Boolean((paramDecl && ts.isParameter(paramDecl) && (paramDecl.questionToken || paramDecl.initializer))
              || (paramSymbol.getFlags() & ts.SymbolFlags.Optional));
            return {
              name: paramSymbol.getName(),
              type: normalizeType(checker.typeToString(paramType)),
              optional,
            };
          });
          const returnType = normalizeType(checker.typeToString(signature.getReturnType()));
          return {
            name,
            kind: kind === "value" ? "function" : kind,
            params,
            returnType,
          };
        }

        return {
          name,
          kind,
          params: [],
          returnType: normalizeType(checker.typeToString(type)),
        };
      }

      return { name, kind, params: [], returnType: "unknown" };
    })
    .filter((apiExport) => apiExport.name !== "default")
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    exports,
    tsconfig: path.relative(rootDir, tsconfigPath),
  };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(options.root ?? process.cwd());
  const entry = options.entry ?? "src/index.ts";
  const outputPath = options.out ? path.resolve(rootDir, options.out) : "";

  const result = extractApiSurface(rootDir, entry);
  const payload = `${JSON.stringify(result, null, 2)}\n`;

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, payload, "utf8");
    console.log(`Wrote API surface to ${path.relative(rootDir, outputPath)}`);
    return;
  }

  process.stdout.write(payload);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
