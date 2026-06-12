#!/usr/bin/env node
/**
 * scripts/generate-site-manifest.js
 *
 * Generates docs/site-manifest.json, which the hub reads at runtime
 * to display accurate status badges and build metadata.
 *
 * Run automatically by the Pages deploy workflow after all build steps.
 * Safe to run locally: produces a manifest reflecting your local build state.
 */

const fs   = require('fs');
const path = require('path');

// ── Read kernel version from package.json ─────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const kernelVersion = pkg.version ?? '0.0.0';

// ── Tool definitions ───────────────────────────────────────────────────────────
// Each tool has:
//   path     — relative path under docs/ to its index.html
//   status   — default status if we can't detect it
//   required — file that must exist (post-build) for the tool to be 'live'
const TOOLS = [
  // Adopters
  { id: 'playground',        path: 'playground/index.html',                        defaultStatus: 'live'    },
  { id: 'wasm',              path: 'examples/wasm-browser.html',                   defaultStatus: 'live'    },
  { id: 'host-coherence',    path: 'examples/host-coherence/index.html',           defaultStatus: 'build'   },
  { id: 'tactics-duel',      path: 'examples/tactics-duel/index.html',             defaultStatus: 'preview' },
  { id: 'narrative-campaign',path: 'examples/narrative-campaign/index.html',       defaultStatus: 'preview' },
  { id: 'session-api',       path: 'session/index.html',                           defaultStatus: 'stub'    },

  // Creators
  { id: 'zoo',               path: 'zoo/index.html',                               defaultStatus: 'live'    },
  { id: 'map',               path: 'map/index.html',                               defaultStatus: 'live'    },
  { id: 'body-plan-editor',  path: 'editors/body-plan-editor.html',                defaultStatus: 'preview' },
  { id: 'species-forge',     path: 'editors/species-forge.html',                   defaultStatus: 'preview' },
  { id: 'culture-forge',     path: 'editors/culture-forge.html',                   defaultStatus: 'preview' },
  { id: 'scenario-builder',  path: 'editors/scenario-builder.html',                defaultStatus: 'preview' },
  { id: 'world-client',      path: 'world-client/index.html',                      defaultStatus: 'preview' },
  { id: 'content-packs',     path: 'content-packs/index.html',                     defaultStatus: 'stub'    },

  // Developers
  { id: 'debugger',          path: 'debugger/index.html',                          defaultStatus: 'live'    },
  { id: 'perf',              path: 'perf/index.html',                              defaultStatus: 'live'    },
  { id: 'dashboard',         path: 'dashboard/index.html',                         defaultStatus: 'live'    },
  { id: 'replay',            path: 'replay/index.html',                            defaultStatus: 'stub'    },
  { id: 'conformance',       path: 'conformance/index.html',                       defaultStatus: 'stub'    },
  { id: 'api-docs',          path: 'api/index.html',                               defaultStatus: 'live'    },
  { id: 'replication-client',path: 'world-client/replication-client.html',         defaultStatus: 'preview' },
];

// ── Detect actual status ───────────────────────────────────────────────────────
const DOCS = path.resolve('docs');

const tools = {};
let toolsLive = 0;

for (const tool of TOOLS) {
  const fullPath = path.join(DOCS, tool.path);
  const exists   = fs.existsSync(fullPath);

  let status = tool.defaultStatus;

  // If the file exists and the default is 'stub' or 'build', promote to 'preview'
  if (exists && (status === 'stub' || status === 'build')) {
    status = 'preview';
  }

  // If the file doesn't exist and the default is 'live' or 'preview', demote to 'build'
  if (!exists && (status === 'live' || status === 'preview')) {
    status = 'build';
  }

  if (status === 'live' || status === 'preview') toolsLive++;

  tools[tool.id] = { status, path: tool.path, exists };
}

// ── Write manifest ─────────────────────────────────────────────────────────────
const manifest = {
  manifestVersion: 1,
  kernelVersion,
  builtAt:   new Date().toISOString(),
  toolsLive,
  toolsTotal: TOOLS.length,
  tools,
};

const outPath = path.join(DOCS, 'site-manifest.json');
fs.mkdirSync(DOCS, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));

console.log(`✓ site-manifest.json written`);
console.log(`  kernel: v${kernelVersion}`);
console.log(`  tools:  ${toolsLive}/${TOOLS.length} active`);
console.log(`  path:   ${outPath}`);
