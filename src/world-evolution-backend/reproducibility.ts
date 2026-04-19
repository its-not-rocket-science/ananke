import type {
  WorldEvolutionRunRequest,
  WorldEvolutionRunResult,
} from "./types.js";

export interface EvolutionRunReproducibilityRecord {
  requestFingerprint: string;
  outputDigest: string;
}

export function computeWorldEvolutionRunRequestFingerprint(request: WorldEvolutionRunRequest): string {
  return stableHashHex(stableJsonStringify(request));
}

export function computeWorldEvolutionRunResultDigest(result: WorldEvolutionRunResult): string {
  return stableHashHex(stableJsonStringify(result));
}

export function buildEvolutionRunReproducibilityRecord(
  request: WorldEvolutionRunRequest,
  result: WorldEvolutionRunResult,
): EvolutionRunReproducibilityRecord {
  return {
    requestFingerprint: computeWorldEvolutionRunRequestFingerprint(request),
    outputDigest: computeWorldEvolutionRunResultDigest(result),
  };
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(stableJson(value));
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableJson(entry));
  }
  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stableJson(entry)]),
    );
  }
  return value;
}

function stableHashHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const normalized = hash >>> 0;
  return normalized.toString(16).padStart(8, "0");
}
