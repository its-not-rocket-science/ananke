#!/usr/bin/env bash
set -euo pipefail

echo "Running full release quality gates..."
npm run ci
npm run test:determinism
npm run benchmark-check:strict
