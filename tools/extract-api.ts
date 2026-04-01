// tools/extract-api.ts
// PM-2: Public API Surface Extraction
//
// Generates docs/api-surface-<package>.md for each @ananke/* package.
// Extracts exported type declarations, functions, constants, and classes
// from source files using static analysis (regex over .d.ts or .ts source).
//
// Usage:
//   npm run build && node dist/tools/extract-api.js
//   node dist/tools/extract-api.js --package=combat   (single package)
//   node dist/tools/extract-api.js --dry-run           (print to stdout, don't write)

import * as fs   from "node:fs";
import * as path from "node:path";

// Tools are run via npm scripts from the project root, so process.cwd() is reliable.
const ROOT    = process.cwd();
const DOCS    = path.join(ROOT, "docs");
const DRY_RUN = process.argv.includes("--dry-run");
const SINGLE  = process.argv.find(a => a.startsWith("--package="))?.split("=")[1];

// ── Package entry points (subpath exports from package.json) ──────────────────

type PackageName = "core" | "combat" | "campaign" | "content";

const PACKAGE_ENTRIES: Record<PackageName, string[]> = {
  core: [
    "src/units.ts",
    "src/rng.ts",
    "src/types.ts",
    "src/replay.ts",
    "src/netcode.ts",
    "src/generate.ts",
    "src/derive.ts",
    "src/describe.ts",
    "src/metrics.ts",
    "src/presets.ts",
    "src/wasm-kernel.ts",
    "src/host-loop.ts",
    "src/netcode.ts",
    "src/bridge/index.ts",
    "src/sim/entity.ts",
    "src/sim/kernel.ts",
    "src/sim/world.ts",
    "src/sim/commands.ts",
    "src/sim/commandBuilders.ts",
    "src/sim/events.ts",
    "src/sim/context.ts",
  ],
  combat: [
    "src/combat.ts",
    "src/equipment.ts",
    "src/weapons.ts",
    "src/extended-senses.ts",
    "src/arena.ts",
    "src/party.ts",
    "src/faction.ts",
    "src/anatomy/index.ts",
    "src/competence/index.ts",
    "src/sim/combat.ts",
    "src/sim/injury.ts",
    "src/sim/grapple.ts",
    "src/sim/ranged.ts",
    "src/sim/morale.ts",
    "src/sim/medical.ts",
    "src/sim/wound-aging.ts",
    "src/sim/ai/decide.ts",
    "src/sim/ai/presets.ts",
  ],
  campaign: [
    "src/polity.ts",
    "src/campaign-layer.ts",
    "src/social.ts",
    "src/narrative-layer.ts",
    "src/narrative-prose.ts",
    "src/renown.ts",
    "src/kinship.ts",
    "src/succession.ts",
    "src/calendar.ts",
    "src/feudal.ts",
    "src/diplomacy.ts",
    "src/migration.ts",
    "src/espionage.ts",
    "src/trade-routes.ts",
    "src/siege.ts",
    "src/faith.ts",
    "src/demography.ts",
    "src/epidemic.ts",
    "src/granary.ts",
    "src/infrastructure.ts",
    "src/unrest.ts",
    "src/research.ts",
    "src/taxation.ts",
    "src/military-campaign.ts",
    "src/governance.ts",
    "src/resources.ts",
    "src/climate.ts",
    "src/famine.ts",
    "src/containment.ts",
    "src/mercenaries.ts",
    "src/wonders.ts",
    "src/monetary.ts",
    "src/demography.ts",
    "src/schema-migration.ts",
    "src/tech-diffusion.ts",
    "src/sim/disease.ts",
    "src/sim/aging.ts",
    "src/sim/sleep.ts",
    "src/sim/mount.ts",
    "src/sim/hazard.ts",
    "src/sim/nutrition.ts",
    "src/sim/thermoregulation.ts",
  ],
  content: [
    "src/species.ts",
    "src/catalog.ts",
    "src/character.ts",
    "src/archetypes.ts",
    "src/inventory.ts",
    "src/content-pack.ts",
    "src/scenario.ts",
    "src/world-generation.ts",
    "src/crafting/index.ts",
  ],
};

const PACKAGE_DESCRIPTIONS: Record<PackageName, string> = {
  core:     "Kernel, entity model, fixed-point units, RNG, replay, bridge",
  combat:   "Combat resolution, anatomy, grapple, ranged, competence, AI",
  campaign: "World simulation — polity, economy, social, demography, epidemic",
  content:  "Species, equipment catalogue, archetypes, crafting",
};

// ── Export extraction ─────────────────────────────────────────────────────────

interface ExportedSymbol {
  kind:    "type" | "interface" | "enum" | "function" | "const" | "class" | "variable";
  name:    string;
  source:  string;
  comment: string;
}

function extractExports(filePath: string, relPath: string): ExportedSymbol[] {
  if (!fs.existsSync(filePath)) return [];
  const src   = fs.readFileSync(filePath, "utf8");
  const lines = src.split("\n");
  const result: ExportedSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith("export ")) continue;

    // Collect preceding JSDoc comment
    let comment = "";
    let j = i - 1;
    while (j >= 0 && (lines[j]?.trim().startsWith("*") || lines[j]?.trim().startsWith("/**") || lines[j]?.trim() === "*/")) {
      const l = lines[j]!.trim().replace(/^\/\*\*?/, "").replace(/\*\/$/, "").replace(/^\*\s?/, "").trim();
      if (l) comment = l + (comment ? " " + comment : "");
      j--;
    }

    // Parse the declaration
    const m =
      line.match(/^export\s+(type)\s+(\w+)/)        ??
      line.match(/^export\s+(interface)\s+(\w+)/)    ??
      line.match(/^export\s+(enum)\s+(\w+)/)         ??
      line.match(/^export\s+(class)\s+(\w+)/)        ??
      line.match(/^export\s+(function)\s+(\w+)/)     ??
      line.match(/^export\s+(const)\s+(\w+)/)        ??
      line.match(/^export\s+(let|var)\s+(\w+)/);

    if (m) {
      const rawKind = m[1]!;
      const kind = (rawKind === "let" || rawKind === "var" ? "variable" : rawKind) as ExportedSymbol["kind"];
      const name = m[2]!;
      // Skip re-exports and internal helpers
      if (name.startsWith("_")) continue;
      result.push({ kind, name, source: relPath, comment });
    }
  }

  return result;
}

// ── Markdown generation ───────────────────────────────────────────────────────

function generateMarkdown(pkg: PackageName, symbols: ExportedSymbol[]): string {
  const fullName = `@ananke/${pkg}`;
  const now = new Date().toISOString().split("T")[0];

  const groups: Record<string, ExportedSymbol[]> = {
    "Types & Interfaces": symbols.filter(s => s.kind === "type" || s.kind === "interface"),
    "Enumerations":       symbols.filter(s => s.kind === "enum"),
    "Functions":          symbols.filter(s => s.kind === "function"),
    "Constants":          symbols.filter(s => s.kind === "const"),
    "Classes":            symbols.filter(s => s.kind === "class"),
    "Variables":          symbols.filter(s => s.kind === "variable"),
  };

  let md = `# API Surface: ${fullName}\n\n`;
  md += `> **Auto-generated** by \`tools/extract-api.ts\` — ${now}  \n`;
  md += `> Do not edit by hand. Re-run \`npm run extract-api\` to refresh.\n\n`;
  md += `**${PACKAGE_DESCRIPTIONS[pkg]}**\n\n`;
  md += `Total exported symbols: **${symbols.length}**\n\n`;
  md += `---\n\n`;

  // Source file index
  const bySource = new Map<string, ExportedSymbol[]>();
  for (const s of symbols) {
    if (!bySource.has(s.source)) bySource.set(s.source, []);
    bySource.get(s.source)!.push(s);
  }

  md += `## Source files (${bySource.size})\n\n`;
  for (const [src, syms] of [...bySource.entries()].sort()) {
    md += `- \`${src}\` — ${syms.length} export${syms.length !== 1 ? "s" : ""}\n`;
  }
  md += "\n---\n\n";

  // Grouped symbol tables
  for (const [groupName, syms] of Object.entries(groups)) {
    if (syms.length === 0) continue;
    md += `## ${groupName} (${syms.length})\n\n`;
    md += `| Name | Source | Notes |\n`;
    md += `|------|--------|-------|\n`;
    for (const s of syms.sort((a, b) => a.name.localeCompare(b.name))) {
      const notes = s.comment || "";
      md += `| \`${s.name}\` | \`${s.source}\` | ${notes} |\n`;
    }
    md += "\n";
  }

  return md;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const packagesToProcess: PackageName[] = SINGLE
  ? [SINGLE as PackageName]
  : (Object.keys(PACKAGE_ENTRIES) as PackageName[]);

let totalSymbols = 0;

for (const pkg of packagesToProcess) {
  const entries = PACKAGE_ENTRIES[pkg];
  if (!entries) { console.error(`Unknown package: ${pkg}`); continue; }

  const allSymbols: ExportedSymbol[] = [];
  for (const relPath of [...new Set(entries)]) {  // deduplicate
    const absPath = path.join(ROOT, relPath);
    const syms = extractExports(absPath, relPath);
    allSymbols.push(...syms);
  }

  // Deduplicate by name+source
  const seen = new Set<string>();
  const dedupedSymbols = allSymbols.filter(s => {
    const key = `${s.source}::${s.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  totalSymbols += dedupedSymbols.length;
  const md = generateMarkdown(pkg, dedupedSymbols);

  const outPath = path.join(DOCS, `api-surface-${pkg}.md`);
  if (DRY_RUN) {
    console.log(`\n${"═".repeat(60)}\n${outPath}\n${"═".repeat(60)}`);
    console.log(md.slice(0, 2000));
    if (md.length > 2000) console.log(`... (${md.length - 2000} more chars)`);
  } else {
    fs.writeFileSync(outPath, md, "utf8");
    console.log(`✓  docs/api-surface-${pkg}.md  (${dedupedSymbols.length} exports)`);
  }
}

if (!DRY_RUN) {
  console.log(`\nTotal: ${totalSymbols} exported symbols across ${packagesToProcess.length} packages.`);
  console.log(`Files written to docs/api-surface-*.md`);
}
