# Runtime State Integrity Audit

Scope audited:
- `src/sim/world.ts`
- `src/sim/kernel.ts`
- `src/sim/normalization.ts`

## Implicit / weakly typed state

1. **`WorldRuntimeState` is optional and mostly optional inside**
   - `WorldState.runtimeState` is optional.
   - `WorldRuntimeState` members (`sensoryEnv`, registries, `nutritionAccum`) are all optional.
   - `kernel.ts` uses a non-null assertion (`world.runtimeState!`), which bypasses static safety and implies hidden initialization ordering.

2. **Runtime-vs-deterministic ownership is under-specified**
   - `WorldState` correctly separates core and runtime state, but `WorldRuntimeState` currently behaves like a catch-all bag.
   - Ownership boundaries are only documented in comments, not encoded in types (e.g., no subsystem-specific runtime slices with required ownership).

3. **Normalization relies on unchecked casts and ad-hoc patching**
   - `normalizeEntityInPlace` repeatedly uses `(e).x` style access and default backfilling.
   - This pattern can hide schema drift because missing fields are silently repaired at runtime.
   - Several defaults are numeric sentinel values (`0`, `-1`) that encode absence implicitly.

4. **Map state shape is runtime-only and not serialization-safe by default**
   - `e.armourState` is created as a `Map`, which can be fine in-memory but introduces a potential mismatch with save/load schemas unless explicitly normalized at boundaries.

## Refactoring recommendations

1. **Make runtime root explicit and total**
   - Change `WorldState.runtimeState?: WorldRuntimeState` to a required `runtime: WorldRuntimeState` (or equivalent rename).
   - Introduce `createDefaultWorldRuntimeState()` and ensure world construction always initializes it.
   - Remove non-null assertions in kernel step paths.

2. **Split runtime into owned subsystem slices**
   - Replace one optional-bag interface with a composed, owned structure such as:
     - `runtime.sensory`
     - `runtime.faction`
     - `runtime.party`
     - `runtime.relationships`
     - `runtime.nutrition`
   - Require each slice and encode optional feature enablement with discriminated unions instead of absent properties.

3. **Convert normalization from “patch object” to “parse + construct”**
   - Replace direct `(e).field` mutation checks with a typed migration/normalization pipeline:
     - parse unknown input
     - validate schema version
     - produce fully-typed `Entity` and `WorldState` outputs
   - Keep in-place optimization only after a successful typed parse.

4. **Replace sentinel absence values with explicit option types**
   - For ids and tick markers currently represented by `0`/`-1`, prefer `number | null` (or a branded `EntityId | null`) to clarify meaning.

5. **Document and enforce serialization boundary types**
   - If `Map` is retained for runtime performance, define explicit persistence DTOs (`Record<string, ...>`/arrays) and conversion functions.

## Suggested type/interface improvements

1. **Strengthen world runtime typing**
   - `interface WorldRuntimeState` should avoid optional members where defaults are always available.
   - Example: `sensoryEnv: SensoryEnvironment` with `DEFAULT_SENSORY_ENV` at construction time.

2. **Add branded ids and tick types**
   - Use branded aliases (e.g., `type EntityId = number & { readonly __brand: 'EntityId' }`, `type Tick = number & { readonly __brand: 'Tick' }`) to prevent accidental cross-assignment.

3. **Introduce strict normalized shapes**
   - Add `NormalizedEntity` / `NormalizedWorldState` types that guarantee post-normalization invariants.
   - `stepWorld` should accept only normalized types.

4. **Adopt runtime schema validation at ingress**
   - Add schema validators (e.g., Zod/Valibot/TypeBox + Ajv) for save files, fixtures, and external commands before normalization.
   - Use versioned schemas to make backward compatibility and migrations explicit.

5. **Enforce with compiler settings / linting**
   - Increase strictness around unchecked access patterns (`noUncheckedIndexedAccess`, stricter ESLint rules against unnecessary assertions/casts in normalization paths).
