# Obsidian Narrative Export Skeleton

This skeleton exports Ananke simulation outputs into Obsidian-friendly Markdown with frontmatter.

## Usage (planned)

```bash
node dist/tools/obsidian/export.js --input fixtures/replay-knight-brawler.json --out vault/Scenes/Battle-of-Greyford.md
```

## Frontmatter shape

```yaml
---
title: Battle of Greyford
seed: 7305
tick_start: 120
tick_end: 201
hero: Sir Marcus
plausibility_score: 87
violations: []
---
```
