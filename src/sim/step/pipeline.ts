export const STEP_PHASE_ORDER = [
  "prepare",
  "cooldowns",
  "capabilityLifecycle",
  "intent",
  "movement",
  "hazardsAndPush",
  "actions",
  "grappleMaintenance",
  "impactResolution",
  "effects",
  "physiology",
  "morale",
  "finalize",
] as const;

export type StepPhaseName = (typeof STEP_PHASE_ORDER)[number];
