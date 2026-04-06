# Publishing plugins to `ananke-plugins`

The plugin registry is a GitHub repository that exposes a JSON index consumed by `ananke install <plugin>`.

## Registry structure

- `index.json` at repo root
- one directory per plugin containing `plugin.json` and `index.js`

Example entry:

```json
{
  "name": "ananke-plugin-logger",
  "manifestUrl": "https://raw.githubusercontent.com/its-not-rocket-science/ananke-plugins/main/ananke-plugin-logger/plugin.json",
  "moduleUrl": "https://raw.githubusercontent.com/its-not-rocket-science/ananke-plugins/main/ananke-plugin-logger/index.js"
}
```

## CI validation workflow

1. Install latest Ananke package.
2. Validate each `plugin.json` against `schema/plugin.schema.json`.
3. Load each plugin with `loadPlugin` smoke test.
4. Run plugin-specific test suite.

This keeps registry plugins compatible with the latest API.
