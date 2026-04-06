#!/usr/bin/env bash
set -euo pipefail

echo "Building release artifacts (npm package + WASM)..."
npm run build
npm run build:wasm:all
npm pack

mkdir -p release/artifacts
mv ./*.tgz release/artifacts/
cp -r wasm release/artifacts/wasm
