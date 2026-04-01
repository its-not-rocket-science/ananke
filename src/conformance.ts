// src/conformance.ts
// PM-5: Conformance suite public API
//
// Exports types and helpers used by third-party host SDKs to verify
// deterministic compatibility with the reference Ananke engine.
//
// Usage:
//   import type { ConformanceFixture, FixtureKind } from "@its-not-rocket-science/ananke/conformance";
//
// The full conformance fixtures live in conformance/*.json (published in the package).
// Run the suite with: npx ananke conformance  (via pack-cli)

/** Discriminated union of all supported fixture kinds. */
export type FixtureKind =
  | "state-hash"
  | "replay-parity"
  | "command-round-trip"
  | "bridge-snapshot"
  | "lockstep-sequence";

/** Version identifier embedded in every fixture file. */
export const CONFORMANCE_VERSION = "conformance/v1" as const;

/** Common header shared by all conformance fixtures. */
export interface ConformanceFixtureHeader {
  /** Fixture format version — check this before reading. */
  version:     typeof CONFORMANCE_VERSION;
  /** Unique fixture identifier. */
  id:          string;
  /** Human-readable description of what this fixture tests. */
  description: string;
  /** Fixture kind — determines which runner handles it. */
  kind:        FixtureKind;
  /** Implementation notes — read before writing a custom runner. */
  notes:       string[];
}

/** State-hash fixture: given an initial world, hashWorldState must return a known hex. */
export interface StateHashFixture extends ConformanceFixtureHeader {
  kind:  "state-hash";
  cases: Array<{
    tick:        number;
    description: string;
    /** FNV-64 hash as a 0x-prefixed hex string. */
    hashHex:     string;
  }>;
}

/** Replay-parity fixture: re-simulating a replay must produce the same per-tick hashes. */
export interface ReplayParityFixture extends ConformanceFixtureHeader {
  kind:       "replay-parity";
  /** Serialised Replay JSON produced by ReplayRecorder. */
  replayJson: string;
  hashTrace:  Array<{ tick: number; hashHex: string }>;
}

/** Command round-trip fixture: verifies scale constants and JSON round-trips. */
export interface CommandRoundTripFixture extends ConformanceFixtureHeader {
  kind:     "command-round-trip";
  scale:    { Q: number; kg: number; m: number; mps: number };
  commands: Array<Record<string, unknown>>;
}

/** Bridge-snapshot fixture: serializeBridgeFrame must produce this shape. */
export interface BridgeSnapshotFixture extends ConformanceFixtureHeader {
  kind:  "bridge-snapshot";
  input: {
    seed:            number;
    tick:            number;
    entityCount:     number;
    entityPositions: Array<{ id: number; x_m: number; y_m: number }>;
  };
  expected: {
    schema:      string;
    tick:        number;
    entityCount: number;
    scenarioId:  string;
    entityIds:   number[];
  };
}

/** Lockstep-sequence fixture: entity state at each tick of a deterministic run. */
export interface LockstepSequenceFixture extends ConformanceFixtureHeader {
  kind:    "lockstep-sequence";
  context: { tractionCoeff_Q: number };
  snapshots: Array<{
    tick:     number;
    hashHex:  string;
    entities: Array<{ id: number; x_m: number; dead: boolean; shock_Q: number }>;
  }>;
}

/** Union of all fixture types. */
export type ConformanceFixture =
  | StateHashFixture
  | ReplayParityFixture
  | CommandRoundTripFixture
  | BridgeSnapshotFixture
  | LockstepSequenceFixture;

/** Result of running a single fixture. */
export interface ConformanceResult {
  id:         string;
  kind:       FixtureKind;
  status:     "pass" | "fail" | "skip" | "error";
  checks:     number;
  failures:   string[];
  durationMs: number;
}

/** Summary of a full conformance run. */
export interface ConformanceSummary {
  _generated: string;
  passed:     number;
  failed:     number;
  errored:    number;
  skipped:    number;
  total:      number;
  conformant: boolean;
  results:    ConformanceResult[];
}
