export interface DiffResult {
  path: string;
  before: unknown;
  after: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function firstDiff(before: unknown, after: unknown, path = "$"): DiffResult | null {
  if (Object.is(before, after)) return null;

  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) {
      return { path: `${path}.length`, before: before.length, after: after.length };
    }
    for (let i = 0; i < before.length; i += 1) {
      const diff = firstDiff(before[i], after[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }

  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      if (!(key in before)) return { path: `${path}.${key}`, before: undefined, after: after[key] };
      if (!(key in after)) return { path: `${path}.${key}`, before: before[key], after: undefined };
      const diff = firstDiff(before[key], after[key], `${path}.${key}`);
      if (diff) return diff;
    }
    return null;
  }

  return { path, before, after };
}

export function formatParityDiff(label: string, before: unknown, after: unknown): string {
  const diff = firstDiff(before, after);
  if (!diff) return `${label}: identical`;

  return [
    `${label}: divergence at ${diff.path}`,
    `before=${JSON.stringify(diff.before)}`,
    `after=${JSON.stringify(diff.after)}`,
  ].join("\n");
}
