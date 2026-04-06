#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${TAG_NAME:-}" ]]; then
  echo "TAG_NAME environment variable is required (e.g., v1.2.3)."
  exit 1
fi

VERSION="${TAG_NAME#v}"
OUT_FILE="release-notes.md"

awk -v version="$VERSION" '
  BEGIN { capture = 0 }
  $0 ~ "^## \\[" version "\\]" { capture = 1; print; next }
  capture && $0 ~ "^## \\[" { exit }
  capture { print }
' CHANGELOG.md > "$OUT_FILE"

if ! grep -q "^## \[$VERSION\]" "$OUT_FILE"; then
  echo "No CHANGELOG.md entry found for version $VERSION"
  exit 1
fi

echo "Release notes extracted to $OUT_FILE"
