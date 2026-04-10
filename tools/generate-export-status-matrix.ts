import fs from "node:fs";
import path from "node:path";

type StabilityStatus =
  | "Tier 1 stable"
  | "Stable subpath"
  | "Experimental"
  | "Internal"
  | "Shipped but undocumented"
  | "Planned only";

type SubjectKind = "subpath" | "symbol-group";

type StatusRecord = {
  subject: string;
  kind: SubjectKind;
  status: StabilityStatus;
  source: string;
  notes: string;
  symbolCount?: number;
};

const TAXONOMY: StabilityStatus[] = [
  "Tier 1 stable",
  "Stable subpath",
  "Experimental",
  "Internal",
  "Shipped but undocumented",
  "Planned only",
];

const root = process.cwd();
const outputPath = path.join(root, "docs", "export-status-matrix.md");

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8")) as T;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "");
}

function parseNamedExports(filePath: string): string[] {
  const source = stripComments(fs.readFileSync(path.join(root, filePath), "utf8"));
  const out = new Set<string>();

  const namedExportRegex = /export\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["'][^"']+["'];/g;
  for (const match of source.matchAll(namedExportRegex)) {
    const body = match[1] ?? "";
    for (const rawPart of body.split(",")) {
      const part = rawPart.trim();
      if (!part) continue;
      const asMatch = /^(?:type\s+)?([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(part);
      if (asMatch) {
        out.add(asMatch[2]!);
        continue;
      }
      const plainMatch = /^(?:type\s+)?([A-Za-z_$][\w$]*)$/.exec(part);
      if (plainMatch) out.add(plainMatch[1]!);
    }
  }

  const exportAllRegex = /export\s+\*\s+from\s+["'][^"']+["'];/g;
  if (exportAllRegex.test(source)) {
    out.add("*");
  }

  return [...out].sort();
}

function extractMarkedJson<T>(docPath: string, marker: string): T {
  const text = fs.readFileSync(path.join(root, docPath), "utf8");
  const start = `<!-- ${marker}:start -->`;
  const end = `<!-- ${marker}:end -->`;
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error(`${docPath} is missing marker block ${marker}`);
  }

  const body = text.slice(startIndex + start.length, endIndex);
  const match = /```json\s*([\s\S]*?)```/.exec(body);
  if (!match) {
    throw new Error(`${docPath} marker ${marker} must contain a json code block`);
  }

  return JSON.parse(match[1] ?? "null") as T;
}

function assertStatus(value: string, context: string): asserts value is StabilityStatus {
  if (!TAXONOMY.includes(value as StabilityStatus)) {
    throw new Error(`${context} has invalid status: ${value}`);
  }
}

function loadDocLabels(docPath: string): StatusRecord[] {
  const parsed = extractMarkedJson<StatusRecord[]>(docPath, "CONTRACT:STABILITY_LABELS");
  if (!Array.isArray(parsed)) {
    throw new Error(`${docPath} CONTRACT:STABILITY_LABELS must be an array`);
  }

  return parsed.map((record, index) => {
    if (!record || typeof record !== "object") {
      throw new Error(`${docPath} label row ${index} is not an object`);
    }
    if (record.kind !== "subpath" && record.kind !== "symbol-group") {
      throw new Error(`${docPath} label row ${index} has invalid kind`);
    }
    if (typeof record.subject !== "string" || record.subject.length === 0) {
      throw new Error(`${docPath} label row ${index} has empty subject`);
    }
    if (typeof record.status !== "string") {
      throw new Error(`${docPath} label row ${index} has missing status`);
    }
    assertStatus(record.status, `${docPath} label row ${index}`);

    return {
      subject: record.subject,
      kind: record.kind,
      status: record.status,
      source: docPath,
      notes: typeof record.notes === "string" ? record.notes : "",
      ...(typeof record.symbolCount === "number" ? { symbolCount: record.symbolCount } : {}),
    };
  });
}

function buildInventory(): StatusRecord[] {
  const pkg = readJson<{ exports: Record<string, unknown> }>("package.json");
  const subpaths = Object.keys(pkg.exports).sort();

  const records: StatusRecord[] = [];
  for (const subpath of subpaths) {
    let status: StabilityStatus;
    let notes = "";

    if (subpath === ".") {
      status = "Tier 1 stable";
      notes = "Root package entrypoint.";
    } else if (subpath === "./tier2") {
      status = "Experimental";
      notes = "Tier-2 barrel.";
    } else if (subpath === "./tier3") {
      status = "Internal";
      notes = "Tier-3 barrel.";
    } else {
      status = "Shipped but undocumented";
      notes = "Exported subpath; not Tier-1 root.";
    }

    records.push({
      subject: subpath,
      kind: "subpath",
      status,
      source: "package.json#exports",
      notes,
    });
  }

  const rootSymbols = parseNamedExports("src/index.ts").filter((s) => s !== "*");
  records.push({
    subject: "root:tier1-symbols",
    kind: "symbol-group",
    status: "Tier 1 stable",
    source: "src/index.ts",
    notes: "Named exports from root barrel.",
    symbolCount: rootSymbols.length,
  });

  const tier2Symbols = parseNamedExports("src/tier2.ts");
  records.push({
    subject: "tier2:barrel-symbols",
    kind: "symbol-group",
    status: "Experimental",
    source: "src/tier2.ts",
    notes: "Tier-2 barrel exports.",
    ...(tier2Symbols.includes("*") ? {} : { symbolCount: tier2Symbols.length }),
  });

  const tier3Symbols = parseNamedExports("src/tier3.ts");
  records.push({
    subject: "tier3:barrel-symbols",
    kind: "symbol-group",
    status: "Internal",
    source: "src/tier3.ts",
    notes: "Tier-3 barrel exports.",
    ...(tier3Symbols.includes("*") ? {} : { symbolCount: tier3Symbols.length }),
  });

  records.push({
    subject: "wire:lockstep-message-protocol",
    kind: "symbol-group",
    status: "Planned only",
    source: "docs/wire-protocol.md",
    notes: "Message kinds are documented as roadmap guidance.",
  });

  return records.sort((a, b) => `${a.kind}:${a.subject}`.localeCompare(`${b.kind}:${b.subject}`));
}

function renderMarkdown(records: StatusRecord[]): string {
  const jsonBlock = JSON.stringify(records, null, 2);

  const tableRows = records
    .map((record) => {
      const count = typeof record.symbolCount === "number" ? String(record.symbolCount) : "-";
      return `| ${record.kind} | \`${record.subject}\` | ${record.status} | ${count} | \`${record.source}\` | ${record.notes} |`;
    })
    .join("\n");

  return `# Export Status Matrix

Generated by \`tools/generate-export-status-matrix.ts\`.

## Taxonomy

- Tier 1 stable
- Stable subpath
- Experimental
- Internal
- Shipped but undocumented
- Planned only

## Machine-readable inventory

<!-- CONTRACT:EXPORT_STATUS_MATRIX:start -->
\`\`\`json
${jsonBlock}
\`\`\`
<!-- CONTRACT:EXPORT_STATUS_MATRIX:end -->

## Status table

| Kind | Subject | Status | Symbol count | Source | Notes |
|---|---|---|---:|---|---|
${tableRows}
`;
}

function validateDocLabels(inventory: StatusRecord[]): void {
  const docs = ["docs/module-index.md", "STABLE_API.md", "docs/bridge-contract.md", "docs/wire-protocol.md"];
  const allLabels = docs.flatMap(loadDocLabels);

  const inventoryMap = new Map(inventory.map((r) => [`${r.kind}:${r.subject}`, r]));
  const duplicateCheck = new Set<string>();

  for (const label of allLabels) {
    const key = `${label.kind}:${label.subject}`;
    if (duplicateCheck.has(`${label.source}:${key}`)) {
      throw new Error(`${label.source} contains duplicate label for ${key}`);
    }
    duplicateCheck.add(`${label.source}:${key}`);

    const canonical = inventoryMap.get(key);
    if (!canonical) {
      throw new Error(`${label.source} declares ${key} but it is not present in generated inventory`);
    }

    if (canonical.status !== label.status) {
      throw new Error(
        `${label.source} has conflicting status for ${key}: documented="${label.status}" canonical="${canonical.status}"`,
      );
    }
  }
}

function main(): void {
  const check = process.argv.includes("--check");
  const write = process.argv.includes("--write") || !check;

  const inventory = buildInventory();
  validateDocLabels(inventory);

  const markdown = renderMarkdown(inventory);
  if (write) {
    fs.writeFileSync(outputPath, markdown);
    console.log(`Wrote ${path.relative(root, outputPath)}`);
    return;
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error("docs/export-status-matrix.md is missing. Run generator with --write.");
  }

  const existing = fs.readFileSync(outputPath, "utf8");
  if (existing !== markdown) {
    throw new Error("docs/export-status-matrix.md is out of date. Run generator with --write.");
  }

  console.log("Export status matrix check passed.");
}

main();
