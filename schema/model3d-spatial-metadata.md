# Model3D Spatial Metadata Design (Phase 14B)

## Problem
`src/model3d.ts` historically inferred canonical segment placement from `BodySegment.id` keyword matching (e.g. `leftArm`, `head`, `tail`). This heuristic path is brittle for non-humanoid and future body plans.

## Heuristics identified in current bridge
Naming-based heuristics exist in:
- `lateralSign(id)`: infers side from `left/right` or `_l/_r` suffixes.
- `getCanonicalOffset(segId)`: regex-maps names to canonical vertical/lateral offsets (`head`, `torso`, `upperLeg`, `wing`, etc.), with unknown fallback to midpoint.

These offsets directly drive:
- `deriveMassDistribution` CoG estimation.
- `deriveInertiaTensor` yaw/pitch/roll approximation.

## New metadata layer
Add `BodySegment.renderSpatial?: BodySegmentRenderSpatial`.

### Fields
- `canonicalAnchor`: render-facing anchor classification.
- `lateralSide?`: `left | right | center`.
- `verticalPosition?`: `crown | high | upper | mid | lower | ground`.
- `rigRole?`: semantic role for stable defaults (`head`, `arm_upper`, `wing`, `core`, etc.).
- `centerOfMassHint?`: optional explicit `{ xFrac?, yFrac? }`.

## Resolution order (metadata-first)
For each segment in model3d:
1. If `centerOfMassHint` is present, it has highest priority for provided axes.
2. Else derive from `verticalPosition` / `rigRole` tables + `lateralSide` sign.
3. Missing metadata axis falls back to legacy name-based heuristic.
4. Unknown legacy names still fall back to midpoint (`x=0, y=0.5`).

This preserves backward compatibility while enabling stable explicit mappings.

## Migration path for existing body plans
1. **No immediate changes required**: old plans work via fallback heuristics.
2. **Incremental opt-in**: add `renderSpatial` per segment as plans are touched.
3. **Recommended minimum metadata**:
   - `canonicalAnchor`
   - `rigRole`
   - `lateralSide` for bilateral appendages
   - `verticalPosition` for nonstandard anatomies
4. **High-fidelity CoG tuning**: add `centerOfMassHint` only where needed.

## Compatibility guarantees
- Plans without `renderSpatial` remain behaviorally equivalent.
- Metadata only overrides specified axes.
- Mixed plans (some segments annotated, some legacy) are supported.
