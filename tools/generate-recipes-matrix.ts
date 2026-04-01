// tools/generate-recipes-matrix.ts
// PM-3: Supported-Recipes Matrix
//
// Generates docs/recipes-matrix.md — a single-table reference mapping use cases to
// recommended packages, stability tier, runnable example, performance envelope, and
// save/replay compatibility.  Source of truth is the RECIPES array below.
//
// Usage:
//   npm run build && node dist/tools/generate-recipes-matrix.js
//   node dist/tools/generate-recipes-matrix.js --dry-run   (print to stdout)

import * as fs   from "node:fs";
import * as path from "node:path";

const ROOT    = process.cwd();
const DRY_RUN = process.argv.includes("--dry-run");

// ── Stability tiers ───────────────────────────────────────────────────────────

type Tier =
  | "Stable"         // Will not break without a major version bump
  | "Experimental";  // Tested and usable; may change across minor versions

type ReplayCompat = "✅ full" | "✅ replay only" | "⚠ stateless" | "n/a";

// ── Recipe catalogue ──────────────────────────────────────────────────────────

interface Recipe {
  /** Short use-case title shown in the table */
  useCase: string;
  /** Which high-level domain this recipe belongs to */
  domain: "Tactical" | "Campaign" | "Content" | "Renderer" | "Multiplayer" | "Tooling";
  /** Recommended subpath imports */
  packages: string[];
  /** Stability tier of the APIs involved */
  tier: Tier;
  /** npm script name(s) the user can run, or null */
  scripts: string[];
  /** Related docs links */
  docs: string[];
  /** Rough performance at typical scale */
  performance: string;
  /** Cookbook recipe anchor if present */
  cookbookAnchor: string | null;
  /** Whether world state can be saved/replayed deterministically */
  replayCompat: ReplayCompat;
  /** One-line note for the Notes column */
  notes: string;
}

const RECIPES: Recipe[] = [
  // ── Tactical / Combat ──────────────────────────────────────────────────────
  {
    useCase: "Simulate a 1v1 duel",
    domain: "Tactical",
    packages: [`"."`, `"./combat"`],
    tier: "Stable",
    scripts: ["example:combat", "ref:tactical-duel"],
    docs: ["cookbook.md#1-simulate-a-duel", "STABLE_API.md"],
    performance: "< 1 ms/tick",
    cookbookAnchor: "#1-simulate-a-duel",
    replayCompat: "✅ full",
    notes: "Fixed-point, deterministic across seeds",
  },
  {
    useCase: "Run a 500-agent battle",
    domain: "Tactical",
    packages: [`"."`, `"./combat"`],
    tier: "Stable",
    scripts: ["ref:tactical-duel", "run:demo"],
    docs: ["cookbook.md#2-run-a-500-agent-battle", "docs/performance.md"],
    performance: "< 0.5 ms/tick at 500 agents",
    cookbookAnchor: "#2-run-a-500-agent-battle",
    replayCompat: "✅ full",
    notes: "Use lineInfantry AI preset; spatial index built each tick",
  },
  {
    useCase: "Add a custom weapon",
    domain: "Content",
    packages: [`"./catalog"`, `"."`],
    tier: "Experimental",
    scripts: [],
    docs: ["cookbook.md#4-add-a-custom-weapon", "STABLE_API.md"],
    performance: "negligible",
    cookbookAnchor: "#4-add-a-custom-weapon",
    replayCompat: "✅ full",
    notes: "Weapon stats in SI units (SCALE.kg / SCALE.mps / SCALE.m)",
  },
  {
    useCase: "Mounted combat / charges",
    domain: "Tactical",
    packages: [`"."`, `"./combat"`],
    tier: "Experimental",
    scripts: [],
    docs: ["docs/project-overview.md"],
    performance: "< 1 ms/tick",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "computeChargeBonus, checkMountStep, MountProfile",
  },
  {
    useCase: "Ranged / projectile combat",
    domain: "Tactical",
    packages: [`"."`, `"./combat"`],
    tier: "Experimental",
    scripts: [],
    docs: ["docs/project-overview.md"],
    performance: "< 1 ms/tick",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "resolveRangedAttack; cone/occlusion built into kernel",
  },
  {
    useCase: "Formation / mass battle",
    domain: "Tactical",
    packages: [`"."`, `"./combat"`],
    tier: "Experimental",
    scripts: ["run:demo"],
    docs: ["docs/project-overview.md"],
    performance: "< 0.5 ms/tick",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "computeFormationBonus, FormationUnit, frontage/density",
  },
  {
    useCase: "Grapple / wrestling",
    domain: "Tactical",
    packages: [`"."`, `"./combat"`],
    tier: "Experimental",
    scripts: [],
    docs: ["docs/project-overview.md"],
    performance: "< 1 ms/tick",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "resolveGrappleContest; grapple state on Entity.grapple",
  },
  {
    useCase: "Anatomy / regional injury",
    domain: "Tactical",
    packages: [`"./anatomy"`, `"./combat"`, `"."`],
    tier: "Experimental",
    scripts: [],
    docs: ["docs/project-overview.md"],
    performance: "< 1 ms/tick",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "compileAnatomyDefinition; injury.byRegion per body part",
  },
  {
    useCase: "Competence / skill contests",
    domain: "Tactical",
    packages: [`"./competence"`, `"."`],
    tier: "Experimental",
    scripts: [],
    docs: ["docs/project-overview.md"],
    performance: "negligible",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "resolveCompetence across all 12 domains (Gardner model)",
  },
  {
    useCase: "Environmental hazard zones",
    domain: "Tactical",
    packages: [`"."`, `"./combat"`],
    tier: "Experimental",
    scripts: [],
    docs: ["docs/project-overview.md"],
    performance: "< 1 ms/tick",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "HazardZone, computeHazardExposure, deriveHazardEffect",
  },
  {
    useCase: "What-if scenario engine",
    domain: "Tooling",
    packages: [`"."`, `"./combat"`],
    tier: "Experimental",
    scripts: ["run:what-if"],
    docs: ["cookbook.md#8-use-the-what-if-engine"],
    performance: "< 5 ms/scenario",
    cookbookAnchor: "#8-use-the-what-if-engine",
    replayCompat: "✅ replay only",
    notes: "Sweep over seeds / parameters; compareScenarios",
  },
  {
    useCase: "Build a validation scenario",
    domain: "Tooling",
    packages: [`"."`, `"./combat"`],
    tier: "Experimental",
    scripts: ["run:validation", "run:validation-dashboard"],
    docs: ["cookbook.md#7-build-a-validation-scenario", "docs/emergent-validation-report.md"],
    performance: "varies",
    cookbookAnchor: "#7-build-a-validation-scenario",
    replayCompat: "⚠ stateless",
    notes: "DirectValidationScenario; compare vs empirical data ±tolerance",
  },

  // ── Campaign / World simulation ────────────────────────────────────────────
  {
    useCase: "Campaign loop (day tick)",
    domain: "Campaign",
    packages: [`"./campaign"`, `"./polity"`, `"."`],
    tier: "Experimental",
    scripts: ["ref:campaign-sandbox", "example:campaign"],
    docs: ["cookbook.md#6-create-a-campaign-loop", "docs/project-overview.md"],
    performance: "< 1 ms/day at 4 polities",
    cookbookAnchor: "#6-create-a-campaign-loop",
    replayCompat: "✅ full",
    notes: "stepPolityDay, stepCampaignDay, PolityRegistry",
  },
  {
    useCase: "Population / demography",
    domain: "Campaign",
    packages: [`"./demography"`, `"./polity"`, `"./migration"`],
    tier: "Experimental",
    scripts: ["ref:campaign-sandbox"],
    docs: ["docs/project-overview.md"],
    performance: "< 0.1 ms/polity/day",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "stepPolityPopulation; computeMigrationFlow; applyMigrationFlows",
  },
  {
    useCase: "Epidemic / disease spread",
    domain: "Campaign",
    packages: [`"./epidemic"`, `"./containment"`, `"./polity"`],
    tier: "Experimental",
    scripts: ["ref:campaign-sandbox"],
    docs: ["docs/project-overview.md"],
    performance: "< 0.1 ms/disease/day",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "createEpidemicState, stepEpidemic, spreadEpidemic; 6 disease profiles",
  },
  {
    useCase: "Diplomacy / treaties",
    domain: "Campaign",
    packages: [`"./diplomacy"`, `"./polity"`],
    tier: "Experimental",
    scripts: ["ref:campaign-sandbox"],
    docs: ["docs/project-overview.md"],
    performance: "negligible",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "signTreaty, stepTreatyStrength; TreatyType: trade_pact / military_alliance / …",
  },
  {
    useCase: "Feudal hierarchy / succession",
    domain: "Campaign",
    packages: [`"./feudal"`, `"./succession"`, `"./kinship"`],
    tier: "Experimental",
    scripts: [],
    docs: ["docs/project-overview.md"],
    performance: "negligible",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "createFeudalBond, resolveSuccession, buildSuccessionOrder",
  },
  {
    useCase: "Trade routes / economy",
    domain: "Campaign",
    packages: [`"./trade-routes"`, `"./monetary"`, `"./granary"`],
    tier: "Experimental",
    scripts: [],
    docs: ["docs/project-overview.md"],
    performance: "negligible",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "computeTradeFlow; monetary policy; food storage and distribution",
  },
  {
    useCase: "Siege warfare",
    domain: "Campaign",
    packages: [`"./siege"`, `"./polity"`, `"."`],
    tier: "Experimental",
    scripts: [],
    docs: ["docs/project-overview.md"],
    performance: "< 1 ms/tick",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "SiegeState, stepSiege; siege escalation and breach resolution",
  },
  {
    useCase: "Narrative / storytelling",
    domain: "Campaign",
    packages: [`"./narrative"`, `"./narrative-prose"`, `"./renown"`],
    tier: "Experimental",
    scripts: ["run:narrative-stress-test", "run:narrative-stress-cinema"],
    docs: ["cookbook.md#9-stream-events-to-an-agent", "docs/project-overview.md"],
    performance: "< 1 ms/event",
    cookbookAnchor: "#9-stream-events-to-an-agent",
    replayCompat: "⚠ stateless",
    notes: "Chronicle, story arcs, legend registry, template prose",
  },
  {
    useCase: "Tech diffusion / eras",
    domain: "Campaign",
    packages: [`"./polity"`, `"./research"`],
    tier: "Experimental",
    scripts: ["ref:campaign-sandbox"],
    docs: ["docs/project-overview.md"],
    performance: "negligible",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "stepTechDiffusion; TechEra: Prehistoric→Ancient→Medieval→EarlyModern",
  },
  {
    useCase: "Religion / faith system",
    domain: "Campaign",
    packages: [`"./faith"`, `"./polity"`],
    tier: "Experimental",
    scripts: [],
    docs: ["docs/project-overview.md"],
    performance: "negligible",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "FaithState, stepFaith; doctrine spread, piety, heresy",
  },
  {
    useCase: "Civil unrest / governance",
    domain: "Campaign",
    packages: [`"./unrest"`, `"./governance"`, `"./taxation"`],
    tier: "Experimental",
    scripts: [],
    docs: ["docs/project-overview.md"],
    performance: "negligible",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "stepUnrest; edicts, tax pressure, stability feedback loops",
  },
  {
    useCase: "Military campaign layer",
    domain: "Campaign",
    packages: [`"./military-campaign"`, `"./polity"`, `"."`],
    tier: "Experimental",
    scripts: [],
    docs: ["docs/project-overview.md"],
    performance: "< 1 ms/day",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "MilitaryCampaign, campaign marching, attrition, supply lines",
  },

  // ── Content / Species ──────────────────────────────────────────────────────
  {
    useCase: "Author a new species",
    domain: "Content",
    packages: [`"./species"`, `"./character"`, `"."`],
    tier: "Experimental",
    scripts: ["ref:species-lab", "ref:species-lab:quick", "example:species"],
    docs: ["cookbook.md#3-author-a-new-species", "docs/project-overview.md"],
    performance: "negligible",
    cookbookAnchor: "#3-author-a-new-species",
    replayCompat: "✅ full",
    notes: "SpeciesDefinition; generateSpeciesIndividual; innateTraits",
  },
  {
    useCase: "Extended senses (echolocation, thermal, …)",
    domain: "Content",
    packages: [`"./extended-senses"`, `"./species"`, `"."`],
    tier: "Experimental",
    scripts: ["ref:species-lab"],
    docs: ["docs/project-overview.md"],
    performance: "negligible",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "dominantSense, thermalSignature, hasEcholocation, hasOlfaction",
  },
  {
    useCase: "Aging, sleep, nutrition, disease (entity)",
    domain: "Content",
    packages: [`"./character"`, `"."`],
    tier: "Experimental",
    scripts: [],
    docs: ["docs/project-overview.md"],
    performance: "< 0.1 ms/entity/day",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "applyAgingToAttributes, stepSleep, stepNutrition, stepDiseaseForEntity",
  },
  {
    useCase: "Crafting / manufacturing",
    domain: "Content",
    packages: [`"./crafting"`, `"./catalog"`],
    tier: "Experimental",
    scripts: [],
    docs: ["cookbook.md#12-load-a-content-pack", "docs/project-overview.md"],
    performance: "negligible",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "craftItem, startManufacturing, advanceManufacturing, getAvailableRecipes",
  },
  {
    useCase: "Load a content pack",
    domain: "Content",
    packages: [`"./content-pack"`],
    tier: "Experimental",
    scripts: [],
    docs: ["cookbook.md#12-load-a-content-pack", "schema/pack.schema.json"],
    performance: "negligible",
    cookbookAnchor: "#12-load-a-content-pack",
    replayCompat: "✅ full",
    notes: "JSON pack schema; loadContentPack, validatePack",
  },

  // ── Renderer / Bridge ──────────────────────────────────────────────────────
  {
    useCase: "Drive a renderer (bridge layer)",
    domain: "Renderer",
    packages: [`"."`, `"./atmosphere"`, `"./terrain-bridge"`],
    tier: "Stable",
    scripts: ["run:renderer-bridge", "run:bridge-demo"],
    docs: ["cookbook.md#5-drive-a-renderer", "docs/bridge-contract.md"],
    performance: "< 0.2 ms/frame interpolation",
    cookbookAnchor: "#5-drive-a-renderer",
    replayCompat: "✅ full",
    notes: "serializeBridgeFrame, extractRigSnapshots; Unity/Godot ready",
  },
  {
    useCase: "WASM kernel (C#/GDScript host)",
    domain: "Renderer",
    packages: [`"./wasm-kernel"`],
    tier: "Experimental",
    scripts: ["build:wasm:all"],
    docs: ["docs/bridge-contract.md"],
    performance: "native speed",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "loadWasmKernel; push/injury/units WASM modules",
  },

  // ── Multiplayer / Netcode ──────────────────────────────────────────────────
  {
    useCase: "Authoritative lockstep multiplayer",
    domain: "Multiplayer",
    packages: [`"."`, `"./netcode"`],
    tier: "Stable",
    scripts: ["example:lockstep"],
    docs: ["docs/host-contract.md", "docs/netcode-host-checklist.md"],
    performance: "< 1 ms/tick",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "hashWorldState per tick; fixed 20 Hz tick rate recommended",
  },
  {
    useCase: "Rollback / client-side prediction",
    domain: "Multiplayer",
    packages: [`"."`, `"./netcode"`],
    tier: "Stable",
    scripts: ["example:rollback"],
    docs: ["docs/host-contract.md", "docs/netcode-host-checklist.md"],
    performance: "< 1 ms/re-sim",
    cookbookAnchor: null,
    replayCompat: "✅ full",
    notes: "Snapshot → predict → verify hash → re-simulate on mismatch",
  },
  {
    useCase: "Replay recording and diffing",
    domain: "Multiplayer",
    packages: [`"."`, `"./netcode"`],
    tier: "Stable",
    scripts: ["run:trace-attack", "example:lockstep"],
    docs: ["cookbook.md#11-record-and-replay-a-fight", "docs/host-contract.md"],
    performance: "< 0.1 ms/frame encode",
    cookbookAnchor: "#11-record-and-replay-a-fight",
    replayCompat: "✅ replay only",
    notes: "ReplayRecorder, replayToWorld; `npx ananke replay diff a.json b.json`",
  },

  // ── Tooling / Persistence ──────────────────────────────────────────────────
  {
    useCase: "Save and reload a world",
    domain: "Tooling",
    packages: [`"."`, `"./schema"`],
    tier: "Stable",
    scripts: ["run:serialize", "ref:campaign-sandbox"],
    docs: ["cookbook.md#10-save-and-reload-a-world", "docs/versioning.md"],
    performance: "< 1 ms/snapshot",
    cookbookAnchor: "#10-save-and-reload-a-world",
    replayCompat: "✅ full",
    notes: "stampSnapshot, JSON.stringify/parse; schema forward-compat via stampSnapshot",
  },
  {
    useCase: "Stream world events to an AI agent",
    domain: "Tooling",
    packages: [`"."`],
    tier: "Stable",
    scripts: ["run:observer"],
    docs: ["cookbook.md#9-stream-events-to-an-agent"],
    performance: "negligible",
    cookbookAnchor: "#9-stream-events-to-an-agent",
    replayCompat: "⚠ stateless",
    notes: "world.events array cleared each tick; snapshot for context window",
  },
];

// ── Markdown generation ───────────────────────────────────────────────────────

function renderPackages(pkgs: string[]): string {
  return pkgs.map(p => `\`${p}\``).join(" + ");
}

function renderScripts(scripts: string[]): string {
  if (scripts.length === 0) return "—";
  return scripts.map(s => `\`npm run ${s}\``).join("<br>");
}

function renderDocs(docs: string[]): string {
  const links = docs.map(d => {
    const base = path.basename(d.split("#")[0]!);
    const hash = d.includes("#") ? d.slice(d.indexOf("#")) : "";
    return `[${base}${hash}](${d})`;
  });
  return links.join(" · ");
}

function generateMatrix(): string {
  const now = new Date().toISOString().split("T")[0];

  // Group by domain
  const domains = ["Tactical", "Campaign", "Content", "Renderer", "Multiplayer", "Tooling"] as const;
  const byDomain = new Map<string, Recipe[]>();
  for (const d of domains) byDomain.set(d, []);
  for (const r of RECIPES) byDomain.get(r.domain)!.push(r);

  let md = `# Ananke — Supported-Recipes Matrix\n\n`;
  md += `> **Auto-generated** by \`tools/generate-recipes-matrix.ts\` — ${now}  \n`;
  md += `> Run \`npm run generate-recipes-matrix\` to refresh.\n\n`;
  md += `One table per domain.  Use this to pick the right entry point without reading multiple docs.\n\n`;
  md += `**Stability tiers:**\n`;
  md += `- 🟢 **Stable** — guaranteed not to break without a major version bump + migration guide\n`;
  md += `- 🟡 **Experimental** — tested and usable; may change across minor versions; changelog documents it\n\n`;
  md += `**Save/replay column:**\n`;
  md += `- ✅ **full** — world state is deterministic and can be saved, loaded, and replayed exactly\n`;
  md += `- ✅ **replay only** — replay records tick-by-tick input; output is deterministic\n`;
  md += `- ⚠ **stateless** — output depends on external input (AI calls, prose templates); deterministic per seed but not replayable as a world state\n`;
  md += `- **n/a** — not applicable\n\n`;
  md += `---\n\n`;

  const tierBadge: Record<Tier, string> = {
    "Stable":       "🟢 Stable",
    "Experimental": "🟡 Experimental",
  };

  const domainEmoji: Record<string, string> = {
    Tactical:    "⚔️",
    Campaign:    "🏰",
    Content:     "📦",
    Renderer:    "🖼️",
    Multiplayer: "🌐",
    Tooling:     "🔧",
  };

  // Summary counts
  md += `## Summary\n\n`;
  md += `| Domain | Recipes | Stable | Experimental |\n`;
  md += `|--------|---------|--------|--------------|\n`;
  for (const d of domains) {
    const rs    = byDomain.get(d)!;
    const stable = rs.filter(r => r.tier === "Stable").length;
    const exp    = rs.filter(r => r.tier === "Experimental").length;
    md += `| ${domainEmoji[d]} ${d} | ${rs.length} | ${stable} | ${exp} |\n`;
  }
  md += `| **Total** | **${RECIPES.length}** | **${RECIPES.filter(r => r.tier === "Stable").length}** | **${RECIPES.filter(r => r.tier === "Experimental").length}** |\n`;
  md += `\n---\n\n`;

  for (const domain of domains) {
    const recipes = byDomain.get(domain)!;
    if (recipes.length === 0) continue;

    md += `## ${domainEmoji[domain]} ${domain}\n\n`;
    md += `| Use case | Packages | Tier | Run | Performance | Save/Replay | Notes |\n`;
    md += `|----------|----------|------|-----|-------------|-------------|-------|\n`;

    for (const r of recipes) {
      const useCase = r.cookbookAnchor
        ? `[${r.useCase}](cookbook.md${r.cookbookAnchor})`
        : r.useCase;
      md += `| ${useCase} | ${renderPackages(r.packages)} | ${tierBadge[r.tier]} | ${renderScripts(r.scripts)} | ${r.performance} | ${r.replayCompat} | ${r.notes} |\n`;
    }
    md += "\n";
  }

  md += `---\n\n`;
  md += `## Quick-reference: use case → entry point\n\n`;
  md += `| I want to… | Start here |\n`;
  md += `|------------|------------|\n`;
  md += `| Run a 1v1 fight | \`import { stepWorld } from "@its-not-rocket-science/ananke"\` |\n`;
  md += `| Build a strategy game | \`import { stepPolityDay } from "@its-not-rocket-science/ananke/polity"\` |\n`;
  md += `| Design a creature | \`import { SpeciesDefinition } from "@its-not-rocket-science/ananke/species"\` |\n`;
  md += `| Integrate with Unity / Godot | \`import { serializeBridgeFrame } from "@its-not-rocket-science/ananke"\` |\n`;
  md += `| Add multiplayer | \`import { hashWorldState } from "@its-not-rocket-science/ananke/netcode"\` |\n`;
  md += `| Save game state | \`import { stampSnapshot } from "@its-not-rocket-science/ananke/schema"\` |\n`;
  md += `| Debug desyncs | \`npx ananke replay diff a.json b.json\` |\n`;
  md += `\nFor a deeper walkthrough see **[docs/cookbook.md](cookbook.md)** (12 task-oriented recipes).\n\n`;
  md += `For API guarantees see **[STABLE_API.md](../STABLE_API.md)**.\n\n`;
  md += `For the full module listing see **[docs/module-index.md](module-index.md)**.\n`;

  return md;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const md = generateMatrix();

if (DRY_RUN) {
  console.log(md);
} else {
  const outPath = path.join(ROOT, "docs", "recipes-matrix.md");
  fs.writeFileSync(outPath, md, "utf8");
  console.log(`✓  docs/recipes-matrix.md  (${RECIPES.length} recipes across 6 domains)`);
}
