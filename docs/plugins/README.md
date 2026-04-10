# Ananke Plugin SDK

Ananke plugins are third-party extensions that register one or more runtime hooks (for example `beforeStep`, `afterStep`, `afterDamage`, or `matchEnd`) and run in a constrained runtime.

> ⚠️ **Security caveat (public plugin loading):** `loadPlugin(...)` is not, by itself, a complete security boundary for hostile third-party code. If you load public/untrusted plugins, read `docs/plugins/security-model.md` and apply `docs/plugins/deployment-checklist.md` before production enablement.

## Write your first plugin in 10 minutes

1. Create a folder under `plugins/`.
2. Add `plugin.json` using `schema/plugin.schema.json`.
3. Add an `index.js` file exporting `setup(api)`.
4. Return handlers keyed by hook name.
5. Load with `loadPlugin(path)` and call hooks with `runHook(...)`.

### `plugin.json`

```json
{
  "id": "ananke-plugin-hello",
  "version": "1.0.0",
  "hooks": ["afterStep"],
  "dependencies": {},
  "permissions": ["read:worldState", "write:telemetry"]
}
```

### `index.js`

```js
module.exports = {
  setup(api) {
    return {
      afterStep(ctx) {
        const world = api.readWorldState(ctx.worldState);
        api.emitTelemetry("hello.entities", { count: world.entities.length });
      },
    };
  },
};
```

See `docs/plugins/hooks.md` for the hook contract, `docs/plugins/publishing.md` for registry publication, and `docs/plugins/security-model.md` for production threat modeling.
