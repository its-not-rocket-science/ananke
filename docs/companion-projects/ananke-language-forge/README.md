# ananke-language-forge

![Ananke version](https://img.shields.io/badge/ananke-sync%20with%20package.json-6366f1)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![LLM](https://img.shields.io/badge/LLM-OpenAI%20%7C%20Anthropic%20%7C%20local-ff6b35)
![Status](https://img.shields.io/badge/status-wanted-lightgrey)

LLM-powered procedural language generation that reads Ananke's faction and campaign history to produce plausible evolving vocabulary, grammar patterns, and oral traditions for cultures.

---

## Table of contents

1. [Purpose](#purpose)
2. [Why this is outside Ananke](#why-this-is-outside-ananke)
3. [Prerequisites](#prerequisites)
4. [Architecture](#architecture)
5. [Ananke inputs consumed](#ananke-inputs-consumed)
6. [What it generates](#what-it-generates)
7. [Quick start](#quick-start)
8. [File layout](#file-layout)
9. [LLM provider configuration](#llm-provider-configuration)
10. [Output format](#output-format)
11. [Contributing](#contributing)

---

## Purpose

After running an Ananke campaign — dozens of factions, hundreds of entities, thousands of contacts — you have a detailed history: which groups fought, traded, intermarried, isolated themselves, or collapsed. That history implies linguistic divergence. Factions in sustained contact borrow words. Isolated factions develop unique grammar. Victorious factions impose vocabulary on the conquered.

`ananke-language-forge` reads that history and asks a language model to make it linguistically concrete: what does the Thornwall Militia's greeting sound like after two generations of trade with the River Traders? What taboo words emerged after the Siege of Ashford?

The output is narrative texture — vocabulary snippets, phonology profiles, grammar complexity scores, loan-word indices — not a rigorous NLP grammar engine.

---

## Why this is outside Ananke

Ananke is a physics-first engine. Every number it produces is derived from a deterministic formula grounded in SI units. Natural language generation does not fit that model:

- Vocabulary is not computable from physics alone.
- LLM outputs are stochastic, not deterministic (even with fixed seeds, API responses vary).
- The required model weights are gigabytes; Ananke has zero runtime dependencies.
- Language evolution is inherently qualitative and culturally situated.

Separating this into a companion project keeps Ananke's core deterministic and dependency-free while giving world-builders a path to richer narrative output.

---

## Prerequisites

| Dependency | Minimum version | Notes |
|-----------|----------------|-------|
| Node.js | 18 | |
| Ananke | package.json version (workspace) | For campaign export types |
| LLM API key | — | OpenAI, Anthropic, or a local server (see below) |

This project does not run the Ananke simulation — it reads exported campaign JSON. Ananke itself does not need to be installed unless you want to generate exports programmatically (see [Ananke inputs consumed](#ananke-inputs-consumed)).

---

## Architecture

```
Ananke campaign export (JSON)
        │
        ▼
CampaignReader.ts
  ├── Reads faction contact pairs from PolityRegistry export
  ├── Reads myth events from Phase 66 (mythology) export
  ├── Reads per-entity linguisticIntelligence_Q scores
  └── Reads faction standing history (Phase 24)
        │
        ▼
LanguageContextBuilder.ts
  ├── Groups factions into proto-language families (contact graph clustering)
  ├── Scores linguistic drift per faction pair (contact frequency × time)
  └── Emits a structured LanguageContext object
        │
        ▼
PromptTemplates.ts
  ├── One prompt template per output type (vocabulary, phonology, grammar, oral tradition)
  └── Fills templates with LanguageContext data
        │
        ▼
LLMClient.ts  (pluggable provider)
  ├── OpenAI GPT-4o
  ├── Anthropic Claude
  └── OpenAI-compatible local server (Ollama, LM Studio, etc.)
        │
        ▼
OutputParser.ts
  └── Extracts structured JSON from LLM responses
        │
        ▼
LanguagePackage (JSON)
  ├── languageFamilyTree
  ├── factionVocabulary[]
  ├── grammarComplexityScores{}
  └── loanWordContaminationIndex{}
```

---

## Ananke inputs consumed

The forge reads Ananke campaign exports produced by `serializeCampaign` (Tier 2 export). The relevant fields are:

### `linguisticIntelligence_Q` (Phase 37)

Per-entity linguistic intelligence score (`q(0)` to `q(1.0)`). Factions with high average linguistic intelligence develop more complex grammar and larger vocabularies. Factions with low scores tend toward simpler, more context-dependent communication.

```typescript
// How it's read
const avgLinguistic = faction.memberIds
  .map(id => world.entities.get(id)?.attributes?.cognition?.linguistic ?? SCALE.Q / 2)
  .reduce((a, b) => a + b, 0) / faction.memberIds.length;
```

### Faction contact pairs (Phase 24 — PolityRegistry)

The contact history records which factions interacted and how many ticks of contact they accumulated. Higher contact → higher loan-word index.

### Myth events (Phase 66 — mythology)

Myth events carry a `theme` string and a `participantFactionId`. Shared myth events between factions indicate cultural exchange. Unique myths indicate linguistic isolation.

### Faction standing history

Trade relationships (positive standing) correlate with vocabulary borrowing. Hostile relationships (negative standing, prior wars) correlate with taboo-word formation around the enemy culture.

---

## What it generates

### Language family tree

A JSON tree grouping factions into proto-language families based on contact-graph clustering. Factions with high mutual contact and positive standing share a proto-language branch.

```json
{
  "protoLanguages": [
    {
      "id": "proto_river",
      "name": "Proto-River Tongue",
      "memberFactionIds": ["river_traders", "thornwall_militia", "fisherfolk"],
      "divergenceDepth": 3
    }
  ]
}
```

### Faction vocabulary

For each faction: a list of example words with translations and etymological notes.

```json
{
  "factionId": "thornwall_militia",
  "vocabulary": [
    { "word": "vrathek", "meaning": "siege engine", "etymology": "borrowed from River Traders 'vratha' (machine) + Thornwall suffix '-ek' (war tool)" },
    { "word": "sholme",  "meaning": "traitor",       "etymology": "derived from the name of Sholm the Defector (myth event, tick 4420)" }
  ]
}
```

### Grammar complexity score

A numeric score per faction representing morphological complexity. Factions with high `linguisticIntelligence_Q` averages and low external contact tend toward higher scores (agglutinative, rich case systems). Factions with heavy trade contact trend toward analytic simplification.

### Loan-word contamination index

Per faction-pair: the fraction of the subordinate faction's vocabulary estimated to have been borrowed from the dominant faction. Derived from contact frequency, standing polarity, and relative faction sizes.

---

## Quick start

```bash
# 1. Clone this repo
git clone https://github.com/its-not-rocket-science/ananke-language-forge.git
cd ananke-language-forge

# 2. Install dependencies
npm install

# 3. Copy your Ananke campaign export
cp /path/to/my-campaign-export.json examples/campaign.json

# 4. Configure your LLM provider
cp .env.example .env
# Edit .env: set LANGUAGE_FORGE_PROVIDER=openai and LANGUAGE_FORGE_API_KEY=sk-...

# 5. Run
npm run forge -- --input examples/campaign.json --output examples/language-package.json

# 6. Inspect output
cat examples/language-package.json | npx jq '.factionVocabulary[0]'
```

A minimal example campaign export is included in `examples/` so you can try the forge without running Ananke.

---

## File layout

```
ananke-language-forge/
├── src/
│   ├── main.ts                      CLI entry point
│   ├── CampaignReader.ts            Reads and validates Ananke campaign JSON
│   ├── LanguageContextBuilder.ts    Derives contact graph + drift scores
│   ├── PromptTemplates.ts           LLM prompt templates
│   ├── LLMClient.ts                 Pluggable provider interface
│   ├── providers/
│   │   ├── OpenAIProvider.ts
│   │   ├── AnthropicProvider.ts
│   │   └── LocalProvider.ts         OpenAI-compatible API (Ollama etc.)
│   ├── OutputParser.ts              Structured JSON extraction from LLM output
│   └── types.ts                     LanguagePackage, LanguageContext types
│
├── examples/
│   ├── campaign.json                Minimal example Ananke campaign export
│   └── language-package.json        Example output
│
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## LLM provider configuration

Set the following environment variables in `.env`:

| Variable | Values | Default |
|---------|--------|---------|
| `LANGUAGE_FORGE_PROVIDER` | `openai`, `anthropic`, `local` | `openai` |
| `LANGUAGE_FORGE_API_KEY` | Your API key | — |
| `LANGUAGE_FORGE_MODEL` | e.g. `gpt-4o`, `claude-opus-4-5`, `llama3` | Provider default |
| `LANGUAGE_FORGE_BASE_URL` | Override for local servers | Provider default |
| `LANGUAGE_FORGE_MAX_TOKENS` | Response length cap | `2048` |

For a fully local setup with no external API calls:

```env
LANGUAGE_FORGE_PROVIDER=local
LANGUAGE_FORGE_BASE_URL=http://localhost:11434/v1
LANGUAGE_FORGE_MODEL=llama3
LANGUAGE_FORGE_API_KEY=ollama
```

---

## Output format

The forge produces a single `LanguagePackage` JSON file. The schema is defined in `src/types.ts` and exported so downstream tools can import it as a TypeScript type.

The output is **not deterministic** — the same input campaign may produce different vocabulary words on different runs. If your application needs reproducibility, commit the language package alongside your campaign save and treat it as a snapshot artifact.

---

## Contributing

1. Fork this repository and create a feature branch.
2. Do not add Ananke simulation code here — only read from exported JSON.
3. Prompt templates live in `src/PromptTemplates.ts` and are the most productive place to improve output quality.
4. If you add a new output type (e.g., oral tradition narratives), add a corresponding schema type and a JSON example.
5. All LLM provider implementations must implement the `LLMProvider` interface in `src/LLMClient.ts`.

To list this project in Ananke's `docs/ecosystem.md`, open a PR to the Ananke repository.
