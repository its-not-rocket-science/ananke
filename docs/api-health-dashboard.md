# Tier 1 API Health Dashboard

![Tier 1 API Health](https://img.shields.io/badge/Tier%201%20API%20Health-%E2%9C%85%200%20breaking%20changes%20in%2090%20days-brightgreen)

## Current status

**Tier 1 API Health ✅ 0 breaking changes in 90 days**

## How it is measured

- Tier 1 surface is extracted from `src/index.ts` and re-exports.
- PRs diff this surface against `main`.
- Any breaking change without a major bump fails CI.
