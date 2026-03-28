// tools/generate-module-index.ts
// Generates docs/module-index.md from the export map defined here.
// Run with: npm run generate-module-index
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Script lives at tools/generate-module-index.ts → dist/tools/generate-module-index.js
// Root is two levels up from dist/tools/
const root = join(__dirname, "..", "..");

// ---------------------------------------------------------------------------
// Module metadata map
// ---------------------------------------------------------------------------

type Tier =
  | "Tier 1 — Stable"
  | "Tier 2 — Experimental"
  | "Tier 2 — Campaign Extension";

interface ModuleEntry {
  tier: Tier;
  description: string;
  keyExports: string;
  useCases: string;
  docs: string;
}

const MODULES: Record<string, ModuleEntry> = {
  ".": {
    tier: "Tier 1 — Stable",
    description: "Core kernel, entity model, units, bridge, replay",
    keyExports: "`stepWorld`, `generateIndividual`, `q`, `SCALE`, `ReplayRecorder`, `extractRigSnapshots`",
    useCases: "combat, multiplayer, replay, renderer",
    docs: "[STABLE_API.md](../STABLE_API.md)",
  },
  "./polity": {
    tier: "Tier 1 — Stable",
    description: "Geopolitical entities, tech diffusion, emotional contagion",
    keyExports: "`stepPolityDay`, `stepTechDiffusion`, `applyEmotionalContagion`, `Polity`",
    useCases: "world simulation, strategy",
    docs: "[STABLE_API.md](../STABLE_API.md)",
  },

  // Tier 2 — Experimental (core subsystems)
  "./species": {
    tier: "Tier 2 — Experimental",
    description: "Data-driven species registry with physiology overrides",
    keyExports: "`SPECIES_REGISTRY`, `getSpeciesById`, `SpeciesDefinition`",
    useCases: "xenobiology, species design",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./catalog": {
    tier: "Tier 2 — Experimental",
    description: "Historical weapons database and item types",
    keyExports: "`ALL_HISTORICAL_MELEE`, `ALL_HISTORICAL_RANGED`, `WEAPON_CATALOGUE`",
    useCases: "combat, item management",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./character": {
    tier: "Tier 2 — Experimental",
    description: "Aging, sleep, disease, wound-aging, nutrition, thermoregulation",
    keyExports: "`applyAgingToAttributes`, `stepSleep`, `stepDiseaseForEntity`, `stepNutrition`",
    useCases: "RPG, survival, simulation",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./combat": {
    tier: "Tier 2 — Experimental",
    description: "Grapple, ranged attack, formation, mount, hazard zones",
    keyExports: "`resolveGrappleContest`, `resolveRangedAttack`, `computeFormationBonus`, `computeChargeBonus`",
    useCases: "tactical combat, mounted warfare",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./campaign": {
    tier: "Tier 2 — Experimental",
    description: "Campaign world clock, settlement, downtime recovery",
    keyExports: "`stepCampaignDay`, `createSettlement`, `stepDowntime`, `Campaign`",
    useCases: "RPG, strategy, world simulation",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./social": {
    tier: "Tier 2 — Experimental",
    description: "Dialogue, faction standing, relationships, party",
    keyExports: "`resolveAction`, `updateStanding`, `createRelationshipGraph`, `createParty`",
    useCases: "RPG, diplomacy, narrative",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./narrative": {
    tier: "Tier 2 — Experimental",
    description: "Chronicle, story arcs, legend registry, myth compression",
    keyExports: "`addChronicleEntry`, `detectStoryArcs`, `createLegendRegistry`, `compressMythsFromHistory`",
    useCases: "storytelling, RPG, procedural content",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./anatomy": {
    tier: "Tier 2 — Experimental",
    description: "Compiled anatomy model, body-plan validation, helpers",
    keyExports: "`compileAnatomyDefinition`, `validateExtendedBodyPlan`, `createAnatomyHelpers`",
    useCases: "custom species, medical simulation",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./crafting": {
    tier: "Tier 2 — Experimental",
    description: "Batch manufacturing, workshop system, material properties",
    keyExports: "`craftItem`, `startManufacturing`, `advanceManufacturing`, `getAvailableRecipes`",
    useCases: "RPG, survival, economic simulation",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./competence": {
    tier: "Tier 2 — Experimental",
    description: "Non-combat skill resolution across all domains",
    keyExports: "`resolveCompetence`, `CompetenceDomain`, `CompetenceTask`",
    useCases: "RPG, skill systems",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./wasm-kernel": {
    tier: "Tier 2 — Experimental",
    description: "WebAssembly kernel for native C#/GDScript hosts",
    keyExports: "`loadWasmKernel`, `WasmKernelInstance`",
    useCases: "Unity, Godot, native hosts",
    docs: "[bridge-contract.md](bridge-contract.md)",
  },
  "./narrative-prose": {
    tier: "Tier 2 — Experimental",
    description: "Template-based prose from chronicle/trace events",
    keyExports: "`renderEntry`, `renderArcSummary`, `interpolateTemplate`",
    useCases: "procedural writing, logs",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./renown": {
    tier: "Tier 2 — Experimental",
    description: "Entity renown score and legend registry",
    keyExports: "`updateRenown`, `getRenownTier`, `RenownRegistry`",
    useCases: "RPG, social simulation",
    docs: "[project-overview.md](project-overview.md)",
  },

  // Tier 2 — Campaign Extensions (Phases 74–101)
  "./kinship": {
    tier: "Tier 2 — Campaign Extension",
    description: "Kinship graph, lineage, family relationships",
    keyExports: "`createKinshipGraph`, `addKinshipBond`, `getDescendants`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./succession": {
    tier: "Tier 2 — Campaign Extension",
    description: "Dynastic succession rules and heir resolution",
    keyExports: "`resolveSuccession`, `buildSuccessionOrder`, `DynastyRecord`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./calendar": {
    tier: "Tier 2 — Campaign Extension",
    description: "Seasonal calendar, agricultural cycle, holy days",
    keyExports: "`stepCalendar`, `getCurrentSeason`, `getHarvestYield`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./feudal": {
    tier: "Tier 2 — Campaign Extension",
    description: "Feudal bonds, vassal obligations, tribute flows",
    keyExports: "`createFeudalBond`, `computeTributeFlow`, `FeudalRegistry`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./diplomacy": {
    tier: "Tier 2 — Campaign Extension",
    description: "Treaties, alliances, trade agreements",
    keyExports: "`proposeTreaty`, `stepDiplomacy`, `TreatyRegistry`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./migration": {
    tier: "Tier 2 — Campaign Extension",
    description: "Population displacement and migration flows",
    keyExports: "`computeMigrationPressure`, `stepMigration`, `MigrationFlow`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./espionage": {
    tier: "Tier 2 — Campaign Extension",
    description: "Intelligence networks, spy operations, counter-espionage",
    keyExports: "`deployAgent`, `resolveOperation`, `EspionageNetwork`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./trade-routes": {
    tier: "Tier 2 — Campaign Extension",
    description: "Overland and sea trade route simulation",
    keyExports: "`establishTradeRoute`, `stepTradeRoutes`, `TradeRoute`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./siege": {
    tier: "Tier 2 — Campaign Extension",
    description: "Siege warfare mechanics and attrition",
    keyExports: "`initiateSiege`, `stepSiege`, `SiegeState`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./faith": {
    tier: "Tier 2 — Campaign Extension",
    description: "Religion, pilgrimage, faith-based morale effects",
    keyExports: "`stepFaith`, `computePietyEffect`, `FaithRegistry`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./demography": {
    tier: "Tier 2 — Campaign Extension",
    description: "Population growth, birth/death rates, age distribution",
    keyExports: "`stepDemography`, `computeGrowthRate`, `PopulationState`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./granary": {
    tier: "Tier 2 — Campaign Extension",
    description: "Food storage, supply chain, famine risk",
    keyExports: "`stepGranary`, `computeFoodSecurity`, `GranaryState`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./epidemic": {
    tier: "Tier 2 — Campaign Extension",
    description: "Disease spread at population scale (SEIR-style)",
    keyExports: "`stepEpidemic`, `computeR0`, `EpidemicState`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./infrastructure": {
    tier: "Tier 2 — Campaign Extension",
    description: "Roads, fortifications, infrastructure decay",
    keyExports: "`stepInfrastructure`, `computeTradeBonus`, `InfrastructureState`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./unrest": {
    tier: "Tier 2 — Campaign Extension",
    description: "Civil unrest, rebellion risk, suppression",
    keyExports: "`stepUnrest`, `computeRebellionRisk`, `UnrestState`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./research": {
    tier: "Tier 2 — Campaign Extension",
    description: "Technology research trees and discovery",
    keyExports: "`stepResearch`, `discoverTech`, `ResearchState`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./taxation": {
    tier: "Tier 2 — Campaign Extension",
    description: "Tax collection, revenue, economic pressure",
    keyExports: "`stepTaxation`, `computeTaxRevenue`, `TaxState`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./military-campaign": {
    tier: "Tier 2 — Campaign Extension",
    description: "Military campaign movement and battle initiation",
    keyExports: "`stepMilitaryCampaign`, `resolveEngagement`, `MilitaryCampaign`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./governance": {
    tier: "Tier 2 — Campaign Extension",
    description: "Governance structures, administrative efficiency",
    keyExports: "`stepGovernance`, `computeAdminEfficiency`, `GovernanceState`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./resources": {
    tier: "Tier 2 — Campaign Extension",
    description: "Raw resource extraction and depletion",
    keyExports: "`stepResources`, `computeExtractionRate`, `ResourceDeposit`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./climate": {
    tier: "Tier 2 — Campaign Extension",
    description: "Climate and biome effects on agriculture/population",
    keyExports: "`stepClimate`, `computeYieldModifier`, `ClimateState`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./famine": {
    tier: "Tier 2 — Campaign Extension",
    description: "Famine onset, mortality, recovery simulation",
    keyExports: "`stepFamine`, `computeFaminePressures`, `FamineState`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./containment": {
    tier: "Tier 2 — Campaign Extension",
    description: "Disease containment policies and effectiveness",
    keyExports: "`stepContainment`, `computeContainmentEffect`, `ContainmentPolicy`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./mercenaries": {
    tier: "Tier 2 — Campaign Extension",
    description: "Mercenary bands, contracts, loyalty",
    keyExports: "`recruitMercenaries`, `stepMercenaryContract`, `MercenaryBand`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./wonders": {
    tier: "Tier 2 — Campaign Extension",
    description: "Great wonders, their construction and civilisation effects",
    keyExports: "`initiateWonder`, `stepWonder`, `WonderState`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
  "./monetary": {
    tier: "Tier 2 — Campaign Extension",
    description: "Coin debasement, inflation, monetary crisis",
    keyExports: "`stepMonetary`, `applyDebasement`, `MonetaryState`",
    useCases: "strategy, 4X, grand strategy",
    docs: "[project-overview.md](project-overview.md)",
  },
};

// ---------------------------------------------------------------------------
// Markdown generation helpers
// ---------------------------------------------------------------------------

function tableRow(subpath: string, entry: ModuleEntry): string {
  const label = subpath === "." ? `\`"."\`` : `\`"${subpath}"\``;
  return `| ${label} | ${entry.description} | ${entry.keyExports} | ${entry.useCases} | ${entry.docs} |`;
}

function tableSection(entries: [string, ModuleEntry][]): string {
  const header = [
    "| Subpath | Description | Key exports | Use cases | Docs |",
    "|---------|-------------|-------------|-----------|------|",
  ];
  return [...header, ...entries.map(([k, v]) => tableRow(k, v))].join("\n");
}

function buildMarkdown(): string {
  const tier1 = Object.entries(MODULES).filter(
    ([, v]) => v.tier === "Tier 1 — Stable"
  );
  const tier2core = Object.entries(MODULES).filter(
    ([, v]) => v.tier === "Tier 2 — Experimental"
  );
  const tier2campaign = Object.entries(MODULES).filter(
    ([, v]) => v.tier === "Tier 2 — Campaign Extension"
  );

  return `# Ananke — Module Index

> Auto-generated by \`tools/generate-module-index.ts\`.  Run \`npm run generate-module-index\`
> to refresh after adding exports.

Choose your entry point based on what you need:

- **Duel / tactical combat** → \`"."\` + \`"./combat"\`
- **World simulation / strategy** → \`"."\` + \`"./polity"\` + \`"./campaign"\` + campaign extensions
- **Species / xenobiology** → \`"."\` + \`"./species"\` + \`"./anatomy"\` + \`"./character"\`
- **Renderer / 3D bridge** → \`"."\` (includes bridge exports) — see [\`docs/bridge-contract.md\`](bridge-contract.md)
- **Multiplayer / netcode** → \`"."\` — deterministic by design, see [\`docs/host-contract.md\`](host-contract.md)
- **Narrative / storytelling** → \`"./narrative"\` + \`"./narrative-prose"\` + \`"./renown"\`
- **Crafting / economy** → \`"./crafting"\` + \`"./catalog"\` + \`"./social"\`

---

## Tier 1 — Stable

> Will not break without a major version bump and migration guide.

${tableSection(tier1)}

---

## Tier 2 — Experimental (core subsystems)

> Tested and usable. May change across minor versions; changelog will document it.

${tableSection(tier2core)}

---

## Tier 2 — Campaign Extensions (Phases 74–101)

> Geopolitical and civilisation-scale modules. Each is self-contained and opt-in.

${tableSection(tier2campaign)}

---

## Adding a new entry point

1. Add the subpath to the \`"exports"\` field in \`package.json\` (import + types).
2. Add a matching entry to the \`MODULES\` map in \`tools/generate-module-index.ts\`.
3. Run \`npm run generate-module-index\` to refresh this file.
4. Bump the package version and update \`CHANGELOG.md\` — the new export is a
   publishable addition (see CLAUDE.md for the republish trigger list).
`;
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const outPath = join(root, "docs", "module-index.md");
writeFileSync(outPath, buildMarkdown(), "utf-8");
console.log(`Written: ${outPath}`);
