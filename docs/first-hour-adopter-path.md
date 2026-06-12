# First-Hour Adopter Path (Deterministic + Measurable)

This is the only path a new adopter needs for the first 60 minutes.

It is an onboarding confidence funnel, not a production-readiness certification.

- Entry example: `examples/guided-first-hour.ts`
- Command: `npm run example:first-hour`
- Validation command: `npm run test:first-hour-smoke`

## First-hour success funnel

### Step 1 (10 min): Install and build

```bash
npm install
npm run build
```

### Step 2 (10 min): Run the guided example once

```bash
npm run example:first-hour
```

### Step 3 (10 min): Verify deterministic output markers

Run the smoke test:

```bash
npm run test:first-hour-smoke
```

This runs the example twice and fails if stable output markers are missing or if the payload changes.

### Step 4 (10 min): Confirm success criteria

You are successful in the first hour only if all are true:

1. `FIRST_HOUR_SUCCESS PASS` is printed by the example.
2. `FIRST_HOUR_RESULT ...` is printed and parses as JSON.
3. `deterministicReplayMatch` is `true`.
4. `replayFrames` is greater than `0`.
5. Two consecutive runs produce exactly identical `FIRST_HOUR_RESULT` JSON.

## Exact expected output shape

`npm run example:first-hour` must print one line beginning with `FIRST_HOUR_RESULT ` followed by JSON in this shape:

```json
{
  "seed": 7,
  "maxTicks": 180,
  "finalTick": 180,
  "replayFrames": 180,
  "replayFinalTick": 180,
  "deterministicReplayMatch": true,
  "entities": [
    {
      "id": 1,
      "dead": false,
      "consciousness": 12345
    },
    {
      "id": 2,
      "dead": true,
      "consciousness": 0
    }
  ],
  "success": true
}
```

Notes:

- `finalTick`, `replayFrames`, and `consciousness` values are deterministic for a given version + seed, but may differ across versions.
- The shape and marker names are stable for first-hour verification.

## Failure troubleshooting (exact)

If first-hour verification fails, use this sequence:

1. Build artifacts missing (`Cannot find dist/...`):

   ```bash
   npm run build
   ```

2. Example marker missing (`FIRST_HOUR_RESULT` not found):

   ```bash
   npm run example:first-hour
   ```

   Ensure output includes both marker lines:
   - `FIRST_HOUR_RESULT ...`
   - `FIRST_HOUR_SUCCESS PASS`

3. Smoke test reports payload mismatch between runs:

   ```bash
   npm run test:first-hour-smoke
   ```

   Then re-run once more to confirm:

   ```bash
   npm run example:first-hour
   npm run example:first-hour
   ```

   If payload differs, check for local modifications affecting seeds, command generation, or stepping inputs in `examples/guided-first-hour.ts`.

4. Build errors (TypeScript):

   ```bash
   npm run build
   ```

   Fix reported errors and rerun until build succeeds.

## Support boundary reminder

- First-hour success confirms basic deterministic integration only.
- Long-lived integrations should stay on Tier-1 root imports unless you intentionally accept subpath volatility.
- For maintainer commitments and pinning guidance, see `docs/support-boundaries.md`.

## Next step after first hour

- **Game/server integrator next step:** implement your host tick loop contract in `docs/host-contract.md`.
- **Renderer integrator next step:** implement frame extraction + interpolation flow in `docs/bridge-contract.md`.
