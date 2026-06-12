# Script: Debugging determinism failures (advanced)

## Chapters
1. Reproduce divergence with seeded scenario.
2. Capture timelines and world hashes.
3. Bisect command stream and isolate non-deterministic branch.
4. Validate fix with determinism tests.

## Demo commands
```bash
npm run test:determinism -- --seed=1337
```
