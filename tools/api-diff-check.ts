import path from "node:path";

import { diffApiSurface, readSurface, summarize, toMarkdown } from "./api-policy.js";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [rawKey, rawValue] = arg.slice(2).split("=");
    if (!rawKey) continue;
    args[rawKey] = rawValue ?? "true";
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const basePath = path.resolve(args.base ?? "api-surface-main.json");
  const headPath = path.resolve(args.head ?? "api-surface-pr.json");
  const allowNew = args.allowNew === "true";

  const base = readSurface(basePath);
  const head = readSurface(headPath);
  const changes = summarize(diffApiSurface(base, head));

  console.log("## Tier 1 API Diff");
  console.log("");
  console.log(toMarkdown(changes));

  const hardFailures: string[] = [];
  if (changes.some((change) => change.change === "kind")) {
    hardFailures.push("Blocked: export kind changed in Tier 1 API.");
  }
  if (changes.some((change) => change.change === "params") && args.headVersionMajor === args.baseVersionMajor) {
    hardFailures.push("Blocked: parameter changes require a major version bump.");
  }
  if (!allowNew && changes.some((change) => change.change === "added")) {
    hardFailures.push("Blocked: new Tier 1 exports require PR comment approval (API-ADDITION-APPROVED).");
  }

  if (hardFailures.length > 0) {
    console.log("");
    console.log("### Merge blockers");
    for (const failure of hardFailures) {
      console.log(`- ${failure}`);
    }
  }

  if (hardFailures.length > 0) {
    for (const failure of hardFailures) {
      console.error(failure);
    }
    process.exit(1);
  }
}

main();
