# Content Pack Loader Threat / Failure Model

## Scope
This note covers `src/content-pack.ts` runtime loading for externally supplied pack manifests.

## Primary risks and mitigations

- **Version-range bypass via malformed semver expressions**
  - Risk: malformed `compatRange` / `anankeVersion` strings could be parsed loosely and accidentally pass.
  - Mitigation: strict semver token parsing (`X`, `X.Y`, `X.Y.Z`) and explicit range-shape validation before compatibility checks.

- **Checksum spoofing / silent drift**
  - Risk: a pack can claim integrity metadata but ship modified content.
  - Mitigation: verify `registry.checksum` against a deterministic SHA-256 computed from manifest JSON with `registry.checksum` blanked.

- **Non-idempotent duplicate loads**
  - Risk: same `name@version` could be loaded twice with different content, leading to inconsistent runtime behavior.
  - Mitigation: treat matching `name@version` + matching fingerprint as idempotent; reject matching `name@version` + different fingerprint.

- **Partial registration and stale registry state**
  - Risk: if one item registration fails mid-load, pack may appear loaded while only a subset succeeded.
  - Mitigation: only persist pack metadata/scenarios in internal registry on full registration success; failure returns errors and leaves pack absent from `_packs`.

- **Duplicate IDs inside a single pack**
  - Risk: duplicate weapon/armour/archetype/scenario IDs can cause non-deterministic resolution or late runtime failures.
  - Mitigation: validation now rejects duplicate IDs per content kind before loading.

## Remaining known limitation

- Registration into global catalogues is not transactional; if a late registration fails, earlier successful catalog writes remain. The loader now avoids storing failed packs in its own registry, but does not roll back global catalog side-effects.
