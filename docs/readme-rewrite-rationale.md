# README rewrite rationale

This note explains the editorial decisions in the root `README.md` rewrite.

## Audit summary

The previous README mixed three different audiences in one page:

1. first-time adopters looking for a reliable setup path,
2. integrators looking for stable API guarantees,
3. internal contributors tracking implementation breadth and roadmap status.

That overlap increased cognitive load and weakened trust signals by combining hard guarantees with promotional or transient elements.

## Changes and why

### 1) Tightened the opening claim
- **Change:** Kept a short deterministic value proposition and removed broad framing language.
- **Why:** Makes the core promise verifiable and concrete early.

### 2) Removed high-noise badges/labels from the top
- **Change:** Kept CI + determinism badges; removed novelty/community labels from first screen.
- **Why:** Preserves credibility signals while reducing distractions.

### 3) Replaced multi-path narrative with one explicit golden path
- **Change:** Frontloads one onboarding flow with exact commands and the first-hour doc link.
- **Why:** A single default path reduces decision friction for new adopters.

### 4) Consolidated API guarantees into one "Stable API" section
- **Change:** Lists Tier 1 surface, tier table, and source-of-truth files.
- **Why:** Makes contract boundaries clear and discoverable without internal detail overload.

### 5) Added a direct "When to use it" fit/non-fit section
- **Change:** Introduced explicit use-case criteria and one non-fit statement.
- **Why:** Improves product clarity and trust by helping users self-qualify quickly.

### 6) Demoted broad implementation/status storytelling to further reading
- **Change:** Removed long status/vision content from README and linked canonical docs.
- **Why:** Keeps root messaging focused while retaining technical depth in dedicated docs.

### 7) Kept technical credibility signals
- **Change:** Retained determinism badge, stable API contract link, fixed-point framing, replay/bridge mention, and links to performance/validation docs.
- **Why:** Preserves seriousness and evidence without marketing-style sprawl.

## Proposed lean README structure (implemented)

1. **what it is**
2. **golden path**
3. **stable API**
4. **when to use it**
5. **further reading**

This aligns root messaging to product trust and integration clarity, while leaving deep technical context in scoped documents.
