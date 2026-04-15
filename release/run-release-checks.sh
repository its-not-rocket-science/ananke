#!/usr/bin/env bash
set -euo pipefail

echo "Running full release quality gates..."
npm run ci
npm run check-coverage-summary
npm run generate-coverage-status
mkdir -p determinism-report
ANANKE_STRICT_DETERMINISM=1 \
DETERMINISM_SEED=1337 \
DETERMINISM_WORLD_STATES="${DETERMINISM_WORLD_STATES:-2000}" \
DETERMINISM_COMMANDS_PER_STATE="${DETERMINISM_COMMANDS_PER_STATE:-500}" \
node tools/run-determinism-tests.mjs \
  test/determinism/fuzz-against-wasm.spec.ts \
  test/determinism/regression.spec.ts \
  --seed=1337 \
  --reporter=json \
  --outputFile=determinism-report/results.json
node tools/generate-determinism-release-artifacts.mjs \
  --input=determinism-report/results.json \
  --summary=docs/dashboard/determinism-release-status.json \
  --matrix=docs/dashboard/determinism-matrix-summary.json \
  --doc=docs/determinism-status.md \
  --fuzz-threshold="${DETERMINISM_MIN_EXECUTIONS:-2000}" \
  --seed=1337 \
  --world-states="${DETERMINISM_WORLD_STATES:-2000}" \
  --commands-per-state="${DETERMINISM_COMMANDS_PER_STATE:-500}"
node tools/check-determinism-release-artifacts.mjs \
  --summary=docs/dashboard/determinism-release-status.json \
  --min-fuzz="${DETERMINISM_MIN_EXECUTIONS:-2000}"
npm run release-check
npm run benchmark-check:strict
