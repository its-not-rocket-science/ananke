#!/usr/bin/env node
// tools/pack-cli.ts — PA-4: Ananke content pack CLI
//
// Usage (after npm run build):
//   node dist/tools/pack-cli.js pack validate <file.json>
//   node dist/tools/pack-cli.js pack bundle <directory>
//
// Or via the installed binary:
//   npx ananke pack validate <file.json>
//   npx ananke pack bundle <directory>

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, extname, basename } from "node:path";
import { validatePack, loadPack, type AnankePackManifest } from "../src/content-pack.js";

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

// ── Entry point ───────────────────────────────────────────────────────────────

function main(): void {
  const argv = process.argv.slice(2);

  if (argv[0] !== "pack") {
    console.log("Ananke CLI");
    console.log("");
    console.log("Commands:");
    console.log("  pack validate <file.json>           — validate a pack manifest");
    console.log("  pack bundle <directory> [out.json]  — merge JSON files into one pack");
    console.log("  pack load <file.json>               — load a pack and report registered ids");
    process.exit(0);
  }

  const sub  = argv[1];
  const rest = argv.slice(2);

  switch (sub) {
    case "validate": cmdValidate(rest); break;
    case "bundle":   cmdBundle(rest);   break;
    case "load":     cmdLoad(rest);     break;
    default:
      console.error(`Unknown subcommand: pack ${sub ?? ""}`);
      console.error("Available: validate, bundle, load");
      process.exit(1);
  }
}

main();
