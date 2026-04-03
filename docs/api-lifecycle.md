# API Lifecycle Policy (Tier 1)

Tier 1 exports (`src/index.ts`) are semver-stable and treated as a public contract.

## Deprecation workflow

1. Mark the symbol with `@deprecated` in JSDoc and include the replacement API.
2. Keep the deprecated symbol available for **at least one full major version**.
3. Add migration notes to `CHANGELOG.md` and relevant docs.
4. Remove only in the next major release after the grace period.

## CI guarantees

- PRs run automated Tier 1 API diff checks.
- Any breaking Tier 1 change requires a major version bump.
- New Tier 1 exports require explicit approval in PR comments.

This policy allows game teams to adopt `@its-not-rocket-science/ananke@^1.0` with confidence that accidental breakage is blocked before merge.
