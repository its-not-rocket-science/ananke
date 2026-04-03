import * as fs from "node:fs";

interface Param {
  name: string;
  type: string;
}

interface ExportEntry {
  name: string;
  kind: string;
  params: Param[];
  returnType: string | null;
}

interface ApiSurface {
  exports: ExportEntry[];
  tsconfig: string;
}

interface DiffEntry {
  name: string;
  change: "added" | "removed" | "kind" | "params" | "return";
  base?: ExportEntry;
  head?: ExportEntry;
}

function getArg(name: string): string | undefined {
  const eqArg = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eqArg) return eqArg.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

function readSurface(filePath: string): ApiSurface {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as ApiSurface;
}

function paramsEqual(a: Param[], b: Param[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.name !== b[i]!.name || a[i]!.type !== b[i]!.type) return false;
  }
  return true;
}

function buildDiff(base: ApiSurface, head: ApiSurface): DiffEntry[] {
  const baseMap = new Map(base.exports.map((exp) => [exp.name, exp]));
  const headMap = new Map(head.exports.map((exp) => [exp.name, exp]));
  const names = [...new Set([...baseMap.keys(), ...headMap.keys()])].sort((a, b) => a.localeCompare(b));

  const diff: DiffEntry[] = [];

  for (const name of names) {
    const before = baseMap.get(name);
    const after = headMap.get(name);

    if (!before && after) {
      diff.push({ name, change: "added", head: after });
      continue;
    }

    if (before && !after) {
      diff.push({ name, change: "removed", base: before });
      continue;
    }

    if (!before || !after) continue;

    if (before.kind !== after.kind) {
      diff.push({ name, change: "kind", base: before, head: after });
    }

    if (!paramsEqual(before.params, after.params)) {
      diff.push({ name, change: "params", base: before, head: after });
    }

    if ((before.returnType ?? "") !== (after.returnType ?? "")) {
      diff.push({ name, change: "return", base: before, head: after });
    }
  }

  return diff;
}

function classifySeverity(diff: DiffEntry[]): "none" | "minor" | "major" {
  if (diff.length === 0) return "none";

  const hasBreaking = diff.some((entry) =>
    entry.change === "removed" || entry.change === "kind" || entry.change === "params" || entry.change === "return",
  );
  if (hasBreaking) return "major";

  const hasAdded = diff.some((entry) => entry.change === "added");
  return hasAdded ? "minor" : "none";
}

function escapePipes(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function signature(exp?: ExportEntry): string {
  if (!exp) return "-";
  const params = exp.params.map((param) => `${param.name}: ${param.type}`).join(", ");
  const suffix = exp.returnType ? ` => ${exp.returnType}` : "";
  return `${exp.kind}(${params})${suffix}`;
}

function toMarkdown(diff: DiffEntry[]): string {
  if (diff.length === 0) {
    return "No Tier 1 API surface changes detected.";
  }

  const header = [
    "| Export | Change | Base | PR |",
    "|---|---|---|---|",
  ];

  const rows = diff.map((entry) => {
    return `| ${escapePipes(entry.name)} | ${entry.change} | ${escapePipes(signature(entry.base))} | ${escapePipes(signature(entry.head))} |`;
  });

  return [...header, ...rows].join("\n");
}

function main(): void {
  const basePath = getArg("--base");
  const headPath = getArg("--head");
  if (!basePath || !headPath) {
    throw new Error("Usage: node dist/tools/api-diff-check.js --base <file> --head <file>");
  }

  const base = readSurface(basePath);
  const head = readSurface(headPath);
  const diff = buildDiff(base, head);
  const severity = classifySeverity(diff);

  const outputPath = getArg("--out");
  const commentPath = getArg("--comment-out");

  const summary = {
    severity,
    hasKindChanges: diff.some((entry) => entry.change === "kind"),
    hasParamChanges: diff.some((entry) => entry.change === "params"),
    hasNewExports: diff.some((entry) => entry.change === "added"),
    diff,
  };

  const markdown = toMarkdown(diff);

  if (outputPath) {
    fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }
  if (commentPath) {
    fs.writeFileSync(commentPath, `${markdown}\n`, "utf8");
  }

  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main();
