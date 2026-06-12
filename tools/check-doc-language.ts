#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

interface Issue {
  file: string;
  line: number;
  message: string;
  excerpt: string;
}

const TARGET_DOCS = [
  "docs/public-contract.md",
  "docs/support-boundaries.md",
  "docs/integration-primer.md",
];

const FORBIDDEN_TERMS = [/\bsupported\b/gi, /\bstable\b/gi, /\bready\b/gi, /\bcomplete\b/gi];
const ALLOWED_PHRASES = [
  /\bTier\s+1\s+stable\b/i,
  /\bExperimental\b/i,
  /\bInternal\b/i,
  /\bPlanned\b/i,
  /docs\/stable-api-manifest\.json/i,
  /STABLE_API\.md/i,
  /stable-api/i,
  /unstable/i,
];

function stripCodeAndLinks(line: string): string {
  return line
    .replace(/`[^`]*`/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/https?:\/\/\S+/g, "");
}

function checkForbiddenTerms(file: string, content: string): Issue[] {
  const issues: Issue[] = [];
  const lines = content.split("\n");
  let inFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? "";
    if (rawLine.trimStart().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const line = stripCodeAndLinks(rawLine);
    for (const re of FORBIDDEN_TERMS) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(line)) !== null) {
        const start = Math.max(0, match.index - 20);
        const end = Math.min(line.length, match.index + (match[0]?.length ?? 0) + 20);
        const excerpt = line.slice(start, end).trim();
        if (ALLOWED_PHRASES.some((allow) => allow.test(rawLine))) continue;
        issues.push({
          file,
          line: i + 1,
          message: `Forbidden vague term \"${match[0]}\". Replace with taxonomy-bound language.`,
          excerpt,
        });
      }
    }
  }

  return issues;
}

function checkClaimTriplet(file: string, content: string): Issue[] {
  const issues: Issue[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line.startsWith("- **Claim:**")) continue;
    const window = lines.slice(i + 1, i + 6).join("\n");
    for (const field of ["Scope", "Conditions", "Evidence"]) {
      if (!new RegExp(`-\\s+\\*\\*${field}:\\*\\*`).test(window)) {
        issues.push({
          file,
          line: i + 1,
          message: `Claim is missing required field: ${field}.`,
          excerpt: line.trim(),
        });
      }
    }
  }

  return issues;
}

function main(): void {
  const issues: Issue[] = [];
  for (const doc of TARGET_DOCS) {
    const abs = path.resolve(process.cwd(), doc);
    const content = readFileSync(abs, "utf8");
    issues.push(...checkForbiddenTerms(doc, content));
    if (doc === "docs/public-contract.md" || doc === "docs/support-boundaries.md") {
      issues.push(...checkClaimTriplet(doc, content));
    }
  }

  if (issues.length > 0) {
    console.error(`check-doc-language: found ${issues.length} issue(s).`);
    for (const issue of issues) {
      console.error(`${issue.file}:${issue.line} ${issue.message}`);
      console.error(`  ↳ ${issue.excerpt}`);
    }
    process.exit(1);
  }

  console.log(`check-doc-language: OK (${TARGET_DOCS.length} docs checked)`);
}

main();
