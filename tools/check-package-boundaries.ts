// tools/check-package-boundaries.ts
// PM-2: Package-Boundary Enforcement
//
// Analyses the src/ import graph against the planned @ananke/* package boundaries
// defined in docs/package-architecture.md.  Reports cross-boundary violations so
// that Phase 2 source migration can proceed with clear guidance.
//
// Usage:
//   npm run build && node dist/tools/check-package-boundaries.js
//   node dist/tools/check-package-boundaries.js --strict   (exit 1 on any violation)
//   node dist/tools/check-package-boundaries.js --json     (machine-readable output)

import * as fs   from "node:fs";
import * as path from "node:path";

// ── Package mapping ───────────────────────────────────────────────────────────
// Source file prefixes/paths belonging to each logical package.
// A prefix ending in "/" matches all files in that directory.

type PackageName = "@ananke/core" | "@ananke/combat" | "@ananke/campaign" | "@ananke/content";

const PACKAGE_FILES: Record<PackageName, string[]> = {
  "@ananke/core": [
    "src/units.ts",
    "src/rng.ts",
    "src/types.ts",
    "src/replay.ts",
    "src/netcode.ts",
    "src/presets.ts",
    "src/generate.ts",
    "src/derive.ts",
    "src/describe.ts",
    "src/traits.ts",
    "src/metrics.ts",
    "src/dist.ts",
    "src/wasm-kernel.ts",
    "src/sim/entity.ts",
    "src/sim/kernel.ts",
    "src/sim/seeds.ts",
    "src/sim/world.ts",
    "src/sim/kinds.ts",
    "src/sim/condition.ts",
    "src/sim/body.ts",
    "src/sim/bodyplan.ts",
    "src/sim/limb.ts",
    "src/sim/tick.ts",
    "src/sim/indexing.ts",
    "src/sim/events.ts",
    "src/sim/commands.ts",
    "src/sim/commandBuilders.ts",
    "src/sim/context.ts",
    "src/sim/intent.ts",
    "src/sim/vec3.ts",
    "src/sim/spatial.ts",
    "src/sim/skills.ts",
    "src/sim/traits.ts",
    "src/sim/terrain.ts",
    "src/sim/action.ts",
    "src/sim/team.ts",
    "src/sim/capability.ts",
    "src/sim/trace.ts",
    "src/sim/tuning.ts",
    "src/sim/testing.ts",
    "src/sim/step/",     // all files under src/sim/step/
    "src/bridge/",       // all files under src/bridge/
  ],

  "@ananke/combat": [
    "src/sim/combat.ts",
    "src/sim/injury.ts",
    "src/sim/wound-aging.ts",
    "src/sim/medical.ts",
    "src/sim/morale.ts",
    "src/sim/grapple.ts",
    "src/sim/ranged.ts",
    "src/sim/stamina.ts",
    "src/sim/impairment.ts",
    "src/sim/knockback.ts",
    "src/sim/cover.ts",
    "src/sim/cone.ts",
    "src/sim/formation.ts",
    "src/sim/formation-combat.ts",
    "src/sim/formation-unit.ts",
    "src/sim/frontage.ts",
    "src/sim/density.ts",
    "src/sim/occlusion.ts",
    "src/sim/explosion.ts",
    "src/sim/hydrostatic.ts",
    "src/sim/weapon_dynamics.ts",
    "src/sim/ai/",         // all files under src/sim/ai/
    "src/combat.ts",
    "src/equipment.ts",
    "src/weapons.ts",
    "src/extended-senses.ts",
    "src/arena.ts",
    "src/dialogue.ts",
    "src/party.ts",
    "src/faction.ts",
    "src/downtime.ts",
    "src/anatomy/",        // all files under src/anatomy/
    "src/competence/",     // all files under src/competence/
  ],

  "@ananke/campaign": [
    "src/campaign.ts",
    "src/campaign-layer.ts",
    "src/polity.ts",
    "src/polity-vassals.ts",
    "src/social.ts",
    "src/relationships.ts",
    "src/relationships-effects.ts",
    "src/emotional-contagion.ts",
    "src/narrative.ts",
    "src/narrative-layer.ts",
    "src/narrative-prose.ts",
    "src/narrative-render.ts",
    "src/narrative-stress.ts",
    "src/story-arcs.ts",
    "src/quest.ts",
    "src/quest-generators.ts",
    "src/chronicle.ts",
    "src/legend.ts",
    "src/mythology.ts",
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
    "src/granary.ts",
    "src/epidemic.ts",
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
    "src/collective-activities.ts",
    "src/economy.ts",
    "src/economy-gen.ts",
    "src/tech-diffusion.ts",
    "src/culture.ts",
    "src/settlement.ts",
    "src/settlement-services.ts",
    "src/channels.ts",
    "src/inheritance.ts",
    "src/progression.ts",
    "src/schema-migration.ts",
    "src/sim/disease.ts",
    "src/sim/aging.ts",
    "src/sim/sleep.ts",
    "src/sim/mount.ts",
    "src/sim/hazard.ts",
    "src/sim/nutrition.ts",
    "src/sim/thermoregulation.ts",
    "src/sim/toxicology.ts",
    "src/sim/systemic-toxicology.ts",
    "src/sim/substance.ts",
    "src/sim/weather.ts",
    "src/sim/biome.ts",
    "src/sim/tech.ts",
  ],

  "@ananke/content": [
    "src/species.ts",
    "src/catalog.ts",
    "src/character.ts",
    "src/archetypes.ts",
    "src/inventory.ts",
    "src/item-durability.ts",
    "src/snapshot.ts",
    "src/world-generation.ts",
    "src/world-factory.ts",
    "src/scenario.ts",
    "src/modding.ts",
    "src/lod.ts",
    "src/model3d.ts",
    "src/content-pack.ts",
    "src/crafting/",       // all files under src/crafting/
  ],
};

// ── Allowed cross-boundary dependency edges ───────────────────────────────────
// Everything not listed here is a violation.
// Each package may always import from itself.

const ALLOWED_DEPS: Partial<Record<PackageName, PackageName[]>> = {
  "@ananke/core":     [],                                          // core has no outward deps
  "@ananke/combat":   ["@ananke/core", "@ananke/content"],         // combat uses core + species/equipment
  "@ananke/campaign": ["@ananke/core", "@ananke/content"],         // campaign uses core + world data
  "@ananke/content":  ["@ananke/core"],                            // content uses only core
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Tools are run via npm scripts from the project root, so process.cwd() is reliable.
const ROOT = process.cwd();

function relToRoot(abs: string): string {
  return abs.startsWith(ROOT) ? abs.slice(ROOT.length + 1).replace(/\\/g, "/") : abs;
}

function classifyFile(rel: string): PackageName | null {
  for (const [pkg, patterns] of Object.entries(PACKAGE_FILES) as [PackageName, string[]][]) {
    for (const pat of patterns) {
      if (pat.endsWith("/")) {
        if (rel === pat.slice(0, -1) || rel.startsWith(pat)) return pkg;
      } else {
        if (rel === pat) return pkg;
      }
    }
  }
  return null;
}

/** Scan a TypeScript source file and return all relative import specifiers. */
function extractImports(content: string): string[] {
  const imports: string[] = [];
  // Match: import ... from "..."  or  import("...")  or  export ... from "..."
  const re = /(?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|[^'"]+?)\s+from\s+['"]([^'"]+)['"]/g;
  const dynRe = /import\(['"]([^'"]+)['"]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) imports.push(m[1]!);
  while ((m = dynRe.exec(content)) !== null) imports.push(m[1]!);
  return imports.filter(s => s.startsWith("./") || s.startsWith("../"));
}

/** Resolve a relative import specifier to a normalised root-relative path. */
function resolveImport(fromFile: string, specifier: string): string {
  const dir = path.dirname(path.join(ROOT, fromFile));
  let resolved = path.resolve(dir, specifier).replace(/\\/g, "/");
  // Strip ROOT prefix and handle .ts/.js extension normalisation
  if (resolved.startsWith(ROOT.replace(/\\/g, "/"))) {
    resolved = resolved.slice(ROOT.replace(/\\/g, "/").length + 1);
  }
  // Remove .js extension (TS imports use .js for output but source is .ts)
  if (resolved.endsWith(".js")) resolved = resolved.slice(0, -3) + ".ts";
  // If no extension, try .ts then index.ts
  if (!resolved.includes(".")) {
    if (fs.existsSync(path.join(ROOT, resolved + ".ts"))) return resolved + ".ts";
    if (fs.existsSync(path.join(ROOT, resolved, "index.ts"))) return resolved + "/index.ts";
  }
  return resolved;
}

function walkDir(dir: string, exts = [".ts"]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full, exts));
    } else if (exts.some(e => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

// ── Main analysis ─────────────────────────────────────────────────────────────

interface Violation {
  fromFile:  string;
  toFile:    string;
  fromPkg:   PackageName;
  toPkg:     PackageName;
  line:      number;
  specifier: string;
  kind:      "violation" | "suspicious";
}

interface BoundarySummary {
  scannedFiles:   number;
  mappedFiles:    number;
  unmappedFiles:  string[];
  violations:     Violation[];
  importCounts:   Record<string, number>;
}

function analyse(): BoundarySummary {
  const srcDir = path.join(ROOT, "src");
  const allFiles = walkDir(srcDir).map(f => relToRoot(f));

  const summary: BoundarySummary = {
    scannedFiles: allFiles.length,
    mappedFiles: 0,
    unmappedFiles: [],
    violations: [],
    importCounts: {},
  };

  // Build edge count matrix
  const PKGS: PackageName[] = ["@ananke/core", "@ananke/combat", "@ananke/campaign", "@ananke/content"];
  for (const a of PKGS) for (const b of PKGS) summary.importCounts[`${a}→${b}`] = 0;

  for (const relFile of allFiles) {
    if (relFile.endsWith(".d.ts") || relFile.endsWith(".test.ts")) continue;

    const fromPkg = classifyFile(relFile);
    if (!fromPkg) {
      summary.unmappedFiles.push(relFile);
      continue;
    }
    summary.mappedFiles++;

    const content = fs.readFileSync(path.join(ROOT, relFile), "utf8");
    const lines   = content.split("\n");
    const specs   = extractImports(content);

    for (const spec of specs) {
      const toFile = resolveImport(relFile, spec);
      const toPkg  = classifyFile(toFile);
      if (!toPkg || toPkg === fromPkg) continue;

      summary.importCounts[`${fromPkg}→${toPkg}`] =
        (summary.importCounts[`${fromPkg}→${toPkg}`] ?? 0) + 1;

      // Find line number
      let lineNo = 1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]?.includes(spec)) { lineNo = i + 1; break; }
      }

      const allowed = ALLOWED_DEPS[fromPkg] ?? [];
      if (!allowed.includes(toPkg)) {
        summary.violations.push({
          fromFile: relFile, toFile, fromPkg, toPkg, line: lineNo, specifier: spec,
          kind: fromPkg === "@ananke/core" ? "violation" : "suspicious",
        });
      }
    }
  }

  return summary;
}

// ── Reporting ─────────────────────────────────────────────────────────────────

const STRICT = process.argv.includes("--strict");
const JSON_OUT = process.argv.includes("--json");

const summary = analyse();

if (JSON_OUT) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.violations.some(v => v.kind === "violation") ? 1 : 0);
}

console.log("\nAnanke — Package Boundary Check  (PM-2)");
console.log("═".repeat(70));
console.log(`  Source files scanned : ${summary.scannedFiles}`);
console.log(`  Files mapped to pkg  : ${summary.mappedFiles}`);
console.log(`  Unmapped files       : ${summary.unmappedFiles.length}`);

// ── Import matrix ─────────────────────────────────────────────────────────────
console.log("\nCross-package import matrix (count of cross-boundary import statements):\n");
const PKGS: PackageName[] = ["@ananke/core", "@ananke/combat", "@ananke/campaign", "@ananke/content"];
const SHORT: Record<PackageName, string> = {
  "@ananke/core": "core", "@ananke/combat": "combat",
  "@ananke/campaign": "campaign", "@ananke/content": "content",
};
const COL_W = 12;
const header = "FROM \\ TO".padEnd(16) + PKGS.map(p => SHORT[p].padStart(COL_W)).join("");
console.log(header);
console.log("─".repeat(header.length));
for (const fromPkg of PKGS) {
  const allowed = ALLOWED_DEPS[fromPkg] ?? [];
  let row = SHORT[fromPkg].padEnd(16);
  for (const toPkg of PKGS) {
    if (fromPkg === toPkg) { row += "  (self)".padStart(COL_W); continue; }
    const count = summary.importCounts[`${fromPkg}→${toPkg}`] ?? 0;
    const ok    = allowed.includes(toPkg);
    const cell  = count === 0 ? "—" : ok ? `${count} ✓` : `${count} ✗`;
    row += cell.padStart(COL_W);
  }
  console.log(row);
}

// ── Violations ────────────────────────────────────────────────────────────────
const hardViolations    = summary.violations.filter(v => v.kind === "violation");
const suspiciousImports = summary.violations.filter(v => v.kind === "suspicious");

if (hardViolations.length > 0) {
  console.log(`\n❌  Hard violations (${hardViolations.length}) — must fix before Phase 2 migration:`);
  console.log("─".repeat(70));
  for (const v of hardViolations) {
    console.log(`  ${v.fromFile}:${v.line}`);
    console.log(`    ${SHORT[v.fromPkg]} imports ${v.specifier} → ${SHORT[v.toPkg]}`);
  }
} else {
  console.log("\n✅  No hard violations — core is clean of upward deps.");
}

if (suspiciousImports.length > 0) {
  console.log(`\n⚠   Suspicious cross-boundary imports (${suspiciousImports.length}) — review before Phase 2:`);
  console.log("─".repeat(70));
  // Group by fromPkg→toPkg edge
  const grouped = new Map<string, Violation[]>();
  for (const v of suspiciousImports) {
    const key = `${SHORT[v.fromPkg]}→${SHORT[v.toPkg]}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(v);
  }
  for (const [edge, vs] of grouped) {
    console.log(`  ${edge}  (${vs.length} import${vs.length > 1 ? "s" : ""}):`);
    // Show up to 5 examples
    for (const v of vs.slice(0, 5)) {
      console.log(`    ${v.fromFile}:${v.line}  →  ${v.toFile}`);
    }
    if (vs.length > 5) console.log(`    … and ${vs.length - 5} more`);
  }
} else {
  console.log("\n✅  No suspicious cross-boundary imports.");
}

// ── Unmapped files ─────────────────────────────────────────────────────────────
if (summary.unmappedFiles.length > 0) {
  console.log(`\nℹ   Unmapped source files (${summary.unmappedFiles.length}) — not yet assigned to a package:`);
  for (const f of summary.unmappedFiles.slice(0, 20)) console.log(`    ${f}`);
  if (summary.unmappedFiles.length > 20) console.log(`    … and ${summary.unmappedFiles.length - 20} more`);
}

// ── Bundle size estimate ───────────────────────────────────────────────────────
console.log("\nSource size estimate per package (TypeScript bytes, pre-compilation):");
console.log("─".repeat(50));

function sizeForPatterns(patterns: string[]): number {
  let total = 0;
  for (const pat of patterns) {
    const fullPat = path.join(ROOT, pat.endsWith("/") ? pat : pat);
    if (pat.endsWith("/")) {
      const dir = path.join(ROOT, pat);
      if (fs.existsSync(dir)) {
        for (const f of walkDir(dir)) {
          if (f.endsWith(".ts") && !f.endsWith(".d.ts")) {
            total += fs.statSync(f).size;
          }
        }
      }
    } else {
      const full = path.join(ROOT, pat);
      if (fs.existsSync(full)) total += fs.statSync(full).size;
    }
  }
  return total;
}

for (const pkg of PKGS) {
  const bytes = sizeForPatterns(PACKAGE_FILES[pkg]);
  const kb    = (bytes / 1024).toFixed(1);
  const bar   = "█".repeat(Math.min(40, Math.ceil(bytes / 4096)));
  console.log(`  ${SHORT[pkg].padEnd(12)} ${kb.padStart(8)} KB  ${bar}`);
}

console.log("\nNote: size counts raw .ts source, not compiled output.  For precise");
console.log("      treeshaken bundle sizes run: npx esbuild --bundle --metafile.");

// ── Exit code ─────────────────────────────────────────────────────────────────
const exitCode = STRICT && hardViolations.length > 0 ? 1 : 0;
if (exitCode) process.exit(exitCode);
