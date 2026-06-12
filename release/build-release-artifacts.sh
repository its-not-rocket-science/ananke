#!/usr/bin/env bash
set -euo pipefail

echo "Building release artifacts (npm package + WASM)..."
npm run build
npm run build:wasm:all
npm pack

mkdir -p release/artifacts
mv ./*.tgz release/artifacts/
cp -r wasm release/artifacts/wasm
mkdir -p release/artifacts/determinism
cp docs/dashboard/determinism-release-status.json release/artifacts/determinism/determinism-summary.json
cp docs/dashboard/determinism-matrix-summary.json release/artifacts/determinism/matrix-summary.json
cp docs/determinism-status.md release/artifacts/determinism/determinism-status.md
