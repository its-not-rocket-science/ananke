import { writeFileSync } from "node:fs";

export interface ObsidianExportInput {
  title: string;
  seed: number;
  tickStart: number;
  tickEnd: number;
  hero?: string;
  plausibilityScore: number;
  violations: string[];
  logLines: string[];
}

export function toObsidianMarkdown(input: ObsidianExportInput): string {
  const header = [
    "---",
    `title: ${input.title}`,
    `seed: ${input.seed}`,
    `tick_start: ${input.tickStart}`,
    `tick_end: ${input.tickEnd}`,
    ...(input.hero ? [`hero: ${input.hero}`] : []),
    `plausibility_score: ${input.plausibilityScore}`,
    `violations: [${input.violations.join(", ")}]`,
    "---",
    "",
  ];

  return [...header, "## Combat Log", ...input.logLines.map(l => `- ${l}`), ""].join("\n");
}

export function exportObsidianFile(path: string, input: ObsidianExportInput): void {
  writeFileSync(path, toObsidianMarkdown(input), "utf8");
}
