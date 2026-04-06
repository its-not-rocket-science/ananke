# Narrative Campaign

Interactive-fiction style story where player choices decide unit roster; combat is resolved by Ananke.

## Included

- Ink source: `ink/story.ink`
- Web UI: `web/`
- Ananke resolver: `campaign-core.ts`
- Markdown combat log export for author review

## Run

```bash
npm run build
node -e "import('./dist/examples/games/narrative-campaign/campaign-core.js').then(m => console.log(m.resolveCampaignBattle(2026, m.CHOICES.slice(0,1)).winner))"
```

To host web UI, serve repository root and open `examples/games/narrative-campaign/web/index.html`.
