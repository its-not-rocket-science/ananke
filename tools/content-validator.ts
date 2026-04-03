#!/usr/bin/env node
import { resolve } from "node:path";
import { loadContentPack } from "../src/content/loader.js";
import { runContentSemanticChecks } from "../src/content/validator.js";

async function main(): Promise<void> {
  const [, , cmd, filePath] = process.argv;
  if (cmd !== "validate" || !filePath) {
    console.error("Usage: npx ananke validate <content-pack.json>");
    process.exit(1);
  }

  try {
    const pack = await loadContentPack(resolve(filePath));
    const semanticWarnings = runContentSemanticChecks(pack);

    console.log(JSON.stringify({
      ok: true,
      pack: `${pack.name}@${pack.version}`,
      schemaErrors: [],
      semanticWarnings,
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

void main();
