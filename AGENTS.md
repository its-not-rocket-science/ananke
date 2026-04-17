# AGENTS instructions for `/workspace/ananke`

To avoid closing tasks with unresolved TypeScript/build issues:

1. Before declaring any coding task complete, run `npm run build`.
2. If `npm run build` fails, fix the reported errors and re-run it until it passes.
3. Include the exact build command and result in the final task summary.

To avoid release-dashboard CI failures:

4. If your changes touch `CHANGELOG.md`, `package.json`, or release-reporting docs/scripts, run `npm run generate-release-dashboard`.
5. Run `npm run check-release-dashboard` before declaring completion.
6. If the check reports `docs/release-dashboard.md` is stale, regenerate and commit the updated file.
