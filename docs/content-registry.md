# Content Pack Registry Design

`ananke-content-registry` is a simple GitHub-hosted index consumed by `ananke install <pack-name>`.

## index.json shape

```json
{
  "version": 1,
  "packs": {
    "fantasy-starter": {
      "url": "https://raw.githubusercontent.com/its-not-rocket-science/ananke-content-registry/main/packs/fantasy-starter.json",
      "checksum": "sha256:...",
      "compatRange": ">=0.2.0"
    }
  }
}
```

## Install flow

1. Resolve `index.json` from registry repo.
2. Lookup `pack-name`.
3. Download pack JSON.
4. Run `ananke validate`.
5. Save to local `./packs/<pack-name>.json`.

## Security

- Require HTTPS URLs.
- Verify SHA-256 checksum before install.
- Enforce `compatRange` before applying to a running world.
