import fs from "node:fs";

import type { ApiExport, ApiSurface } from "./api-surface.js";

export type ChangeKind = "none" | "added" | "removed" | "kind" | "params" | "returnType";

export type ApiChange = {
  name: string;
  change: ChangeKind;
  before?: ApiExport;
  after?: ApiExport;
  severity: "none" | "patch" | "minor" | "major";
  reason: string;
};

export function readSurface(filePath: string): ApiSurface {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as ApiSurface;
}

function paramsEqual(a: ApiExport["params"], b: ApiExport["params"]): boolean {
  if (a.length !== b.length) return false;
  return a.every((param, idx) => {
    const other = b[idx];
    return (
      param.name === other?.name
      && param.type === other?.type
      && param.optional === other?.optional
    );
  });
}

export function diffApiSurface(base: ApiSurface, head: ApiSurface): ApiChange[] {
  const baseByName = new Map(base.exports.map((exp) => [exp.name, exp]));
  const headByName = new Map(head.exports.map((exp) => [exp.name, exp]));
  const names = new Set([...baseByName.keys(), ...headByName.keys()]);
  const changes: ApiChange[] = [];

  for (const name of [...names].sort()) {
    const before = baseByName.get(name);
    const after = headByName.get(name);

    if (!before && after) {
      changes.push({
        name,
        change: "added",
        after,
        severity: "minor",
        reason: "New Tier 1 export added",
      });
      continue;
    }

    if (before && !after) {
      changes.push({
        name,
        change: "removed",
        before,
        severity: "major",
        reason: "Tier 1 export removed",
      });
      continue;
    }

    if (!before || !after) continue;

    if (before.kind !== after.kind) {
      changes.push({
        name,
        change: "kind",
        before,
        after,
        severity: "major",
        reason: `Export kind changed (${before.kind} → ${after.kind})`,
      });
      continue;
    }

    if (!paramsEqual(before.params, after.params)) {
      changes.push({
        name,
        change: "params",
        before,
        after,
        severity: "major",
        reason: "Function/class parameter list changed",
      });
      continue;
    }

    if (before.returnType !== after.returnType) {
      changes.push({
        name,
        change: "returnType",
        before,
        after,
        severity: "major",
        reason: "Return or value type changed",
      });
      continue;
    }

    changes.push({
      name,
      change: "none",
      before,
      after,
      severity: "none",
      reason: "No public API change",
    });
  }

  return changes;
}

export function requiredBump(changes: ApiChange[]): "none" | "patch" | "minor" | "major" {
  if (changes.some((change) => change.severity === "major")) return "major";
  if (changes.some((change) => change.severity === "minor")) return "minor";
  if (changes.length === 0) return "none";
  return "patch";
}

export function summarize(changes: ApiChange[]): ApiChange[] {
  return changes.filter((change) => change.change !== "none");
}

export function toMarkdown(changes: ApiChange[]): string {
  const rows = summarize(changes);
  if (rows.length === 0) {
    return "No Tier 1 API changes detected.";
  }

  const tableRows = rows
    .map((change) => {
      const before = change.before ? `${change.before.kind}(${change.before.params.map((p) => `${p.name}: ${p.type}`).join(", ")})` : "—";
      const after = change.after ? `${change.after.kind}(${change.after.params.map((p) => `${p.name}: ${p.type}`).join(", ")})` : "—";
      return `| ${change.name} | ${change.change} | ${change.severity} | ${before} | ${after} | ${change.reason} |`;
    })
    .join("\n");

  return [
    "| Export | Change | Severity | Before | After | Reason |",
    "|---|---|---|---|---|---|",
    tableRows,
  ].join("\n");
}
