// ── Tier 1 — Stable host API (minimal contract) ─────────────────────────────
// This is the only import path hosts should treat as semver-stable:
//   import { createWorld, stepWorld, q, SCALE } from "@its-not-rocket-science/ananke"
//
// Everything not exported here is intentionally Tier 2/3 and must be imported
// via explicit subpaths (e.g. "/character", "/combat", "/tier2", "/tier3").
//
// Source of truth: docs/stable-api-manifest.json

// Fixed-point utilities
export {
  SCALE,
  G_mps2,
  q,
  clampQ,
  qMul,
  qDiv,
  mulDiv,
  to,
  from,
  sqrtQ,
} from "./units.js";
export type { I32, Q } from "./units.js";

// Core host-facing types
export type { IndividualAttributes } from "./types.js";
export type { Entity } from "./sim/entity.js";
export type { WorldState } from "./sim/world.js";
export type { KernelContext } from "./sim/context.js";
export type { Command, CommandMap } from "./sim/commands.js";

// World creation and scenario loading
export { createWorld } from "./world-factory.js";
export type { EntitySpec } from "./world-factory.js";
export { loadScenario, validateScenario } from "./scenario.js";
export type { AnankeScenario, AnankeScenarioEntity } from "./scenario.js";

// Stepping
export { stepWorld } from "./sim/kernel.js";

// Replay / serialization
export { ReplayRecorder, replayTo, serializeReplay, deserializeReplay } from "./replay.js";
export type { Replay, ReplayFrame } from "./replay.js";

// Bridge extraction
export { extractRigSnapshots, deriveAnimationHints } from "./model3d.js";
export type { RigSnapshot, AnimationHints } from "./model3d.js";
