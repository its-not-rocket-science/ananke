import { createAdaptiveTick } from "../src/performance/adaptive-tick.js";

const adaptiveTick = createAdaptiveTick({
  targetHz: 60,
  maxEntities: 2000,
  fallback: "reduceDistanceChecks",
});

const sampleFrames = [
  { frameTimeMs: 12.4, entityCount: 1200, visibleEntityRatio: 0.8 },
  { frameTimeMs: 21.7, entityCount: 2800, visibleEntityRatio: 0.55 },
  { frameTimeMs: 17.0, entityCount: 2200, visibleEntityRatio: 0.6 },
];

for (const [index, frame] of sampleFrames.entries()) {
  const plan = adaptiveTick.plan(frame);
  console.log(`frame=${index} budget=${adaptiveTick.frameBudgetMs.toFixed(2)}ms`, plan);
}
