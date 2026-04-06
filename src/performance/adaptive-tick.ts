export type AdaptiveFallback = "reduceDistanceChecks" | "skipNonVisible" | "batchMoves";

export interface AdaptiveTickConfig {
  targetHz: number;
  maxEntities: number;
  fallback: AdaptiveFallback;
  overshootToleranceMs?: number;
}

export interface AdaptiveTickInput {
  frameTimeMs: number;
  entityCount: number;
  visibleEntityRatio: number;
}

export interface AdaptiveTickPlan {
  fidelityScale: number;
  processDistanceChecks: boolean;
  processVisibilityOnly: boolean;
  batchMovement: boolean;
}

const DEFAULT_CONFIG: AdaptiveTickConfig = {
  targetHz: 60,
  maxEntities: 2000,
  fallback: "reduceDistanceChecks",
  overshootToleranceMs: 1,
};

export function createAdaptiveTick(config: Partial<AdaptiveTickConfig> = {}) {
  const resolved: AdaptiveTickConfig = { ...DEFAULT_CONFIG, ...config };

  const frameBudgetMs = 1000 / resolved.targetHz;

  function plan(input: AdaptiveTickInput): AdaptiveTickPlan {
    const overshoot = input.frameTimeMs - frameBudgetMs;
    const overload = input.entityCount > resolved.maxEntities;
    const shouldFallback = overload || overshoot > (resolved.overshootToleranceMs ?? 1);

    if (!shouldFallback) {
      return {
        fidelityScale: 1,
        processDistanceChecks: true,
        processVisibilityOnly: false,
        batchMovement: false,
      };
    }

    if (resolved.fallback === "skipNonVisible") {
      return {
        fidelityScale: Math.max(0.3, input.visibleEntityRatio),
        processDistanceChecks: true,
        processVisibilityOnly: true,
        batchMovement: false,
      };
    }

    if (resolved.fallback === "batchMoves") {
      return {
        fidelityScale: 0.6,
        processDistanceChecks: true,
        processVisibilityOnly: false,
        batchMovement: true,
      };
    }

    return {
      fidelityScale: 0.5,
      processDistanceChecks: false,
      processVisibilityOnly: false,
      batchMovement: true,
    };
  }

  return {
    config: resolved,
    frameBudgetMs,
    plan,
  };
}
