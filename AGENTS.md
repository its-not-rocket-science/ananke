# AGENTS instructions for `/workspace/ananke`

To avoid closing tasks with unresolved TypeScript/build issues:

1. Before declaring any coding task complete, run `npm run build`.
2. If `npm run build` fails, fix the reported errors and re-run it until it passes.
3. Include the exact build command and result in the final task summary.

To avoid release-dashboard CI failures:

4. If your changes touch `CHANGELOG.md`, `package.json`, or release-reporting docs/scripts, run `npm run generate-release-dashboard`.
5. Run `npm run check-release-dashboard` before declaring completion.
6. If the check reports `docs/release-dashboard.md` is stale, regenerate and commit the updated file.

## Codex rules for docs-site config safety

7. For Docusaurus config changes, only use keys supported by the installed docs-site version (`docs/ananke/node_modules/@docusaurus/types`), and prefer documented top-level fields such as `onBrokenMarkdownLinks` over unsupported nested keys.
8. After editing `docs/ananke/docusaurus.config.ts`, always run `npm run build` from `docs/ananke` first to validate the docs configuration schema before finishing.

## Codex rules for Markdown TypeScript example safety

9. If you edit any `docs/**/*.md` file that contains `ts` code fences, run `npm run check:doc-examples` before declaring completion.
10. If `npm run check:doc-examples` fails, fix all reported examples and re-run until it passes.


## Codex rules for trust dashboard artifact safety

11. If your changes touch trust evidence inputs (`docs/trust-dashboard.md`, `docs/release-readiness-bundle.md`, `docs/release-readiness-bundle.json`, `docs/dashboard/repo-discipline-audit.{md,json}`, `tools/generate-trust-dashboard.ts`, or `tools/check-trust-dashboard-artifacts.mjs`), run `npm run generate-trust-dashboard`.
12. Always run `npm run check-trust-dashboard-artifacts` before declaring completion when trust evidence/docs/scripts are changed.
13. If the check reports `docs/trust-dashboard.md` is stale or manually edited, regenerate it and commit the updated file.
