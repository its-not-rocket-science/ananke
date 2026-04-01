#!/usr/bin/env bash
# scripts/tag-release.sh
#
# Bumps the package version, syncs ANANKE_ENGINE_VERSION, commits, and pushes
# the git tag that triggers the publish workflow.
#
# Usage:
#   ./scripts/tag-release.sh patch    # 0.1.69 → 0.1.70
#   ./scripts/tag-release.sh minor    # 0.1.69 → 0.2.0
#   ./scripts/tag-release.sh major    # 0.1.69 → 1.0.0
#   ./scripts/tag-release.sh 0.1.71   # explicit version
#
# Prerequisites:
#   - npm is authenticated (npm whoami should return your username)
#   - working tree is clean (git status clean)
#   - CHANGELOG.md entry for the new version is already written
#
# What it does:
#   1. Validates the working tree is clean
#   2. Bumps version with `npm version` (no git tag yet)
#   3. Syncs ANANKE_ENGINE_VERSION in src/content-pack.ts
#   4. Rebuilds so the dist reflects the new version
#   5. Commits the version bump
#   6. Pushes the commit + tag → triggers publish.yml

set -euo pipefail

BUMP="${1:-}"

if [ -z "$BUMP" ]; then
  echo "Usage: $0 <patch|minor|major|x.y.z>"
  exit 1
fi

# ── Working tree must be clean ────────────────────────────────────────────────
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "❌ Working tree is not clean. Commit or stash changes first."
  exit 1
fi

# ── Bump version ──────────────────────────────────────────────────────────────
echo "→ Bumping version ($BUMP)…"
npm version "$BUMP" --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "  New version: $NEW_VERSION"

# ── Sync ANANKE_ENGINE_VERSION ────────────────────────────────────────────────
echo "→ Syncing ANANKE_ENGINE_VERSION in src/content-pack.ts…"
# Use node to do the replacement so it works on both Linux and macOS
node -e "
  const fs = require('fs');
  const file = 'src/content-pack.ts';
  const src = fs.readFileSync(file, 'utf8');
  const updated = src.replace(
    /export const ANANKE_ENGINE_VERSION = \"[^\"]+\"/,
    \`export const ANANKE_ENGINE_VERSION = \"\${process.argv[1]}\"\`
  );
  if (src === updated) { console.error('❌ ANANKE_ENGINE_VERSION not found in ' + file); process.exit(1); }
  fs.writeFileSync(file, updated, 'utf8');
  console.log('  ANANKE_ENGINE_VERSION =', process.argv[1]);
" "$NEW_VERSION"

# ── Update lock file ─────────────────────────────────────────────────────────
echo "→ Updating package-lock.json…"
npm install --ignore-scripts

# ── Rebuild ───────────────────────────────────────────────────────────────────
echo "→ Building…"
npm run build

# ── Check CHANGELOG has an entry for this version ─────────────────────────────
if ! grep -q "\[${NEW_VERSION}\]" CHANGELOG.md; then
  echo "⚠️  No CHANGELOG.md entry found for [$NEW_VERSION]."
  echo "   Add one before publishing, or the release will be missing release notes."
  echo "   Continue anyway? (y/N)"
  read -r CONFIRM
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Aborted."
    exit 1
  fi
fi

# ── Commit and tag ────────────────────────────────────────────────────────────
echo "→ Committing version bump…"
git add package.json package-lock.json src/content-pack.ts dist/
git commit -m "chore: release v${NEW_VERSION}"

echo "→ Tagging v${NEW_VERSION}…"
git tag "v${NEW_VERSION}"

echo "→ Pushing commit and tag…"
git push origin HEAD
git push origin "v${NEW_VERSION}"

echo ""
echo "✅ Released v${NEW_VERSION}"
echo "   GitHub Actions publish workflow is now running:"
echo "   https://github.com/its-not-rocket-science/ananke/actions"
