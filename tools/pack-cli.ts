#!/usr/bin/env node
// tools/pack-cli.ts — PA-4 / PA-10: Ananke CLI
//
// Usage (after npm run build):
//   node dist/tools/pack-cli.js pack validate <file.json>
//   node dist/tools/pack-cli.js pack bundle <directory>
//   node dist/tools/pack-cli.js replay diff <a.json> <b.json>
//
// Or via the installed binary:
//   npx ananke pack validate <file.json>
//   npx ananke pack bundle <directory>
//   npx ananke replay diff <a.json> <b.json>

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, extname, basename } from "node:path";
import { createHash } from "node:crypto";
import { validatePack, loadPack, type AnankePackManifest } from "../src/content-pack.js";
import { loadContentPack } from "../src/content/loader.js";
import { runContentSemanticChecks } from "../src/content/validator.js";
import { diffReplayJson } from "../src/netcode.js";
import { q } from "../src/units.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function readJson(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error(`Error reading ${filePath}: ${String(e)}`);
    process.exit(1);
  }
}

function printErrors(errors: { path: string; message: string }[]): void {
  for (const err of errors) {
    console.error(`  ${err.path}: ${err.message}`);
  }
}

// ── Commands ──────────────────────────────────────────────────────────────────

function cmdValidate(args: string[]): void {
  const filePath = args[0];
  if (!filePath) {
    console.error("Usage: ananke pack validate <file.json>");
    process.exit(1);
  }

  const manifest = readJson(resolve(filePath));
  const errors   = validatePack(manifest);

  if (errors.length === 0) {
    const m = manifest as Record<string, unknown>;
    console.log(`✓  ${m["name"] ?? "pack"}@${m["version"] ?? "?"} — valid`);
    process.exit(0);
  } else {
    console.error(`✗  ${errors.length} error(s) in ${filePath}:`);
    printErrors(errors);
    process.exit(1);
  }
}

function cmdBundle(args: string[]): void {
  const dir     = args[0];
  const outFile = args[1] ?? "bundle.ananke-pack.json";

  if (!dir) {
    console.error("Usage: ananke pack bundle <directory> [output.json]");
    process.exit(1);
  }

  const dirPath = resolve(dir);
  let entries: string[];
  try {
    entries = readdirSync(dirPath).filter(f => extname(f) === ".json");
  } catch (e) {
    console.error(`Cannot read directory ${dirPath}: ${String(e)}`);
    process.exit(1);
  }

  if (entries.length === 0) {
    console.error(`No .json files found in ${dirPath}`);
    process.exit(1);
  }

  const bundle: AnankePackManifest = {
    name:       basename(dirPath),
    version:    "1.0.0",
    description: `Bundled from ${entries.length} file(s) in ${dirPath}`,
    weapons:    [],
    armour:     [],
    archetypes: [],
    scenarios:  [],
  };

  for (const entry of entries) {
    const filePath = join(dirPath, entry);
    if (!statSync(filePath).isFile()) continue;

    const raw = readJson(filePath) as Record<string, unknown>;
    const partial = raw as Partial<AnankePackManifest>;

    if (Array.isArray(partial.weapons))    bundle.weapons!.push(...partial.weapons);
    if (Array.isArray(partial.armour))     bundle.armour!.push(...partial.armour);
    if (Array.isArray(partial.archetypes)) bundle.archetypes!.push(...partial.archetypes);
    if (Array.isArray(partial.scenarios))  bundle.scenarios!.push(...partial.scenarios);

    // Use name/version from first file that has them
    if (!bundle.name && typeof partial.name === "string") bundle.name = partial.name;
  }

  // Compute SHA-256 checksum: serialise with checksum="" (placeholder), then hash.
  // Store in registry block so consumers can verify integrity.
  if (!bundle.registry) bundle.registry = {};
  bundle.registry.checksum = "";  // placeholder — field present but blank for hashing
  const checksumInput = JSON.stringify(bundle, null, 2);
  bundle.registry.checksum = createHash("sha256").update(checksumInput).digest("hex");

  // Pre-validate before writing
  const errors = validatePack(bundle);
  if (errors.length > 0) {
    console.warn(`  ${errors.length} validation warning(s) in bundle:`);
    printErrors(errors);
  }

  const json = JSON.stringify(bundle, null, 2);
  writeFileSync(outFile, json, "utf8");
  console.log(`✓  Bundle written to ${outFile}`);
  console.log(`   weapons: ${bundle.weapons!.length}, armour: ${bundle.armour!.length}, archetypes: ${bundle.archetypes!.length}, scenarios: ${bundle.scenarios!.length}`);
  console.log(`   checksum: ${bundle.registry.checksum}`);
}

function cmdLoad(args: string[]): void {
  const filePath = args[0];
  if (!filePath) {
    console.error("Usage: ananke pack load <file.json>");
    process.exit(1);
  }

  const manifest = readJson(resolve(filePath)) as AnankePackManifest;
  const result   = loadPack(manifest);

  if (result.errors.length > 0) {
    console.error(`✗  Load failed:`);
    printErrors(result.errors);
    process.exit(1);
  }

  console.log(`✓  ${result.packId} loaded`);
  console.log(`   registered: ${result.registeredIds.join(", ") || "none"}`);
  console.log(`   scenarios:  ${result.scenarioIds.join(", ") || "none"}`);
  console.log(`   fingerprint: ${result.fingerprint}`);
}

function cmdReplayDiff(args: string[]): void {
  const fileA = args[0];
  const fileB = args[1];

  if (!fileA || !fileB) {
    console.error("Usage: ananke replay diff <replay-a.json> <replay-b.json>");
    process.exit(1);
  }

  let jsonA: string;
  let jsonB: string;
  try {
    jsonA = readFileSync(resolve(fileA), "utf8");
  } catch (e) {
    console.error(`Cannot read ${fileA}: ${String(e)}`);
    process.exit(1);
  }
  try {
    jsonB = readFileSync(resolve(fileB), "utf8");
  } catch (e) {
    console.error(`Cannot read ${fileB}: ${String(e)}`);
    process.exit(1);
  }

  const ctx = { tractionCoeff: q(1.0) };
  const result = diffReplayJson(jsonA!, jsonB!, ctx);

  console.log(`Ticks compared: ${result.ticksCompared}`);

  if (result.divergeAtTick === undefined) {
    console.log("✓  Replays are identical — no divergence detected.");
    process.exit(0);
  }

  if (result.divergeAtTick === -1) {
    console.error("✗  Initial states differ (before tick 0).");
    console.error(`   hash A: ${result.hashA?.toString(16)}`);
    console.error(`   hash B: ${result.hashB?.toString(16)}`);
    process.exit(1);
  }

  console.error(`✗  Divergence at tick ${result.divergeAtTick}.`);
  console.error(`   hash A: ${result.hashA?.toString(16)}`);
  console.error(`   hash B: ${result.hashB?.toString(16)}`);
  process.exit(1);
}

async function cmdContentValidate(args: string[]): Promise<void> {
  const filePath = args[0];
  if (!filePath) {
    console.error("Usage: ananke validate <content-pack.json>");
    process.exit(1);
  }

  try {
    const pack = await loadContentPack(resolve(filePath));
    const warnings = runContentSemanticChecks(pack);
    console.log(JSON.stringify({
      ok: true,
      pack: `${pack.name}@${pack.version}`,
      schemaErrors: [],
      semanticWarnings: warnings,
    }, null, 2));
    process.exit(0);
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      schemaErrors: [{ path: "$", message: String(error) }],
      semanticWarnings: [],
    }, null, 2));
    process.exit(1);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd  = argv[0];

  if (!cmd) {
    printHelp();
    process.exit(0);
  }

  const sub  = argv[1];
  const rest = argv.slice(2);

  switch (cmd) {
    case "pack":
      switch (sub) {
        case "validate": cmdValidate(rest); break;
        case "bundle":   cmdBundle(rest);   break;
        case "load":     cmdLoad(rest);     break;
        default:
          console.error(`Unknown subcommand: pack ${sub ?? ""}`);
          console.error("Available: validate, bundle, load");
          process.exit(1);
      }
      break;

    case "replay":
      switch (sub) {
        case "diff": cmdReplayDiff(rest); break;
        default:
          console.error(`Unknown subcommand: replay ${sub ?? ""}`);
          console.error("Available: diff");
          process.exit(1);
      }
      break;
    case "validate":
      await cmdContentValidate(argv.slice(1));
      break;

    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp(): void {
  console.log("Ananke CLI");
  console.log("");
  console.log("Commands:");
  console.log("  validate <file.json>                       — validate a content pack (schema + semantic checks)");
  console.log("  pack validate <file.json>                  — validate a pack manifest");
  console.log("  pack bundle <directory> [out.json]         — merge JSON files into one pack");
  console.log("  pack load <file.json>                      — load a pack and report registered ids");
  console.log("  replay diff <replay-a.json> <replay-b.json> — find the first tick divergence between two replays");
}

void main();
