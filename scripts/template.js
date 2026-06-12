#!/usr/bin/env node
/**
 * Generates all 17 stub pages from a single shared template.
 * Run: node template.js
 */

const fs   = require('fs');
const path = require('path');

// ── Shared head/styles/nav (all pages identical) ──────────────────────────────

const HEAD = (title, desc, relRoot) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Ananke</title>
<meta name="description" content="${desc}">
<link rel="icon" type="image/svg+xml" href="${relRoot}favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --bg:       #050816;
  --bg-mid:   #0b1020;
  --surface:  #111827;
  --surface2: #1a2235;
  --border:   #1e2a40;
  --border2:  #2a3a55;
  --accent:   #fbbf24;
  --acc-dim:  #78530a;
  --acc-glow: rgba(251,191,36,0.07);
  --ring:     #7dd3fc;
  --violet:   #a78bfa;
  --text:     #e5e7eb;
  --muted:    #6b7fa0;
  --live:     #34d399;
  --stub:     #475569;
  --mono:     'JetBrains Mono', monospace;
  --sans:     'Inter', system-ui, sans-serif;
  --r:        6px;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; }
body { background: var(--bg); color: var(--text); font-family: var(--sans);
       line-height: 1.6; min-height: 100vh; }

/* nav */
.topnav {
  border-bottom: 1px solid var(--border);
  padding: .55rem 2rem;
  display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap;
  font-family: var(--mono); font-size: .7rem;
}
.topnav a { color: var(--muted); text-decoration: none; transition: color .15s; }
.topnav a:hover { color: var(--text); }
.topnav a.home { color: var(--accent); }
.topnav .sep { color: var(--border2); }

/* page header */
.page-header {
  padding: 2rem 2rem 1.5rem;
  max-width: 1100px; margin: 0 auto;
  border-bottom: 1px solid var(--border);
}
.page-header h1 {
  font-family: var(--mono); font-size: 1.35rem; font-weight: 500;
  color: var(--text); letter-spacing: -.01em; margin-bottom: .35rem;
}
.page-header .subtitle {
  font-size: .875rem; color: var(--muted); max-width: 560px;
}
.stub-notice {
  display: inline-flex; align-items: center; gap: .4rem;
  font-family: var(--mono); font-size: .65rem;
  background: #1a1225; color: var(--violet);
  border: 1px solid #3a2560; border-radius: 3px;
  padding: 3px 9px; margin-top: .6rem;
}

/* main layout */
.page-body {
  max-width: 1100px; margin: 0 auto;
  padding: 1.75rem 2rem 3rem;
  display: flex; flex-direction: column; gap: 1.5rem;
}

/* section card */
.section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
}
.section-head {
  padding: .7rem 1rem;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: .6rem;
}
.section-title {
  font-family: var(--mono); font-size: .72rem; font-weight: 500;
  text-transform: uppercase; letter-spacing: .08em; color: var(--muted);
}
.section-body { padding: 1rem; }

/* two-col grid inside section */
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
@media (max-width: 700px) { .two-col { grid-template-columns: 1fr; } }

/* code block */
pre {
  background: var(--bg-mid); border: 1px solid var(--border2);
  border-radius: var(--r); padding: .85rem 1rem;
  font-family: var(--mono); font-size: .72rem; color: var(--ring);
  overflow-x: auto; line-height: 1.65; white-space: pre;
}
code { font-family: var(--mono); font-size: .78rem; color: var(--ring); }

/* form controls */
textarea, input, select {
  width: 100%; background: var(--bg-mid); border: 1px solid var(--border2);
  border-radius: var(--r); color: var(--text); font-family: var(--mono);
  font-size: .72rem; padding: .6rem .75rem; resize: vertical;
  transition: border-color .15s;
}
textarea:focus, input:focus, select:focus {
  outline: none; border-color: var(--accent);
}
label {
  font-family: var(--mono); font-size: .68rem; color: var(--muted);
  display: block; margin-bottom: .3rem;
}
.field { margin-bottom: .75rem; }
.field:last-child { margin-bottom: 0; }

/* button */
.btn {
  font-family: var(--mono); font-size: .72rem; color: var(--accent);
  background: none; border: 1px solid var(--acc-dim);
  border-radius: 3px; padding: 4px 14px; cursor: pointer;
  transition: background .15s, border-color .15s;
}
.btn:hover { background: var(--acc-glow); border-color: var(--accent); }

/* tag/pill */
.pill {
  font-family: var(--mono); font-size: .6rem; font-weight: 500;
  padding: 2px 7px; border-radius: 3px; white-space: nowrap;
}
.pill-stub   { background: #111827; color: var(--stub); border: 1px solid var(--border2); }
.pill-live   { background: #052018; color: var(--live); }
.pill-ring   { background: #041828; color: var(--ring); }
.pill-violet { background: #160f2a; color: var(--violet); }

/* info row */
.info-row {
  display: flex; align-items: baseline; gap: .5rem;
  padding: .45rem 0; border-bottom: 1px solid var(--border);
  font-size: .8rem;
}
.info-row:last-child { border-bottom: none; }
.info-key { font-family: var(--mono); font-size: .7rem; color: var(--muted); min-width: 160px; }
.info-val { color: var(--text); }

/* link list */
.link-list { display: flex; flex-direction: column; gap: .4rem; }
.link-list a {
  font-family: var(--mono); font-size: .72rem; color: var(--ring);
  text-decoration: none; border-bottom: 1px solid transparent;
  transition: border-color .15s;
}
.link-list a:hover { border-color: var(--ring); }

/* checklist */
.checklist { list-style: none; display: flex; flex-direction: column; gap: .35rem; }
.checklist li {
  font-size: .8rem; color: var(--muted); padding-left: 1.1rem; position: relative;
}
.checklist li::before {
  content: '○'; position: absolute; left: 0;
  font-family: var(--mono); font-size: .7rem; color: var(--border2);
}
.checklist li.done { color: var(--text); }
.checklist li.done::before { content: '●'; color: var(--live); }

/* flow diagram (flex row of nodes) */
.flow { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.flow-node {
  background: var(--surface2); border: 1px solid var(--border2);
  border-radius: var(--r); padding: .4rem .75rem;
  font-family: var(--mono); font-size: .72rem; color: var(--text);
}
.flow-arrow { color: var(--muted); font-size: .8rem; flex-shrink: 0; }

/* table */
.data-table { width: 100%; border-collapse: collapse; font-size: .78rem; }
.data-table th {
  font-family: var(--mono); font-size: .65rem; text-transform: uppercase;
  letter-spacing: .07em; color: var(--muted); text-align: left;
  padding: .4rem .6rem; border-bottom: 1px solid var(--border2);
}
.data-table td {
  padding: .4rem .6rem; color: var(--text);
  border-bottom: 1px solid var(--border);
}
.data-table tr:last-child td { border-bottom: none; }
.data-table tr:hover td { background: var(--surface2); }

/* meter bar */
.meter { height: 5px; background: var(--border); border-radius: 4px; overflow: hidden; margin-top: .2rem; }
.meter-fill { height: 100%; border-radius: 4px; background: var(--accent); }

@media (max-width: 600px) {
  .topnav, .page-header, .page-body { padding-left: 1rem; padding-right: 1rem; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
<body>`;

const TOPNAV = (relRoot, currentLabel) => `
<nav class="topnav" aria-label="Breadcrumb">
  <a class="home" href="${relRoot}hub/">Hub</a>
  <span class="sep">/</span>
  <span>${currentLabel}</span>
  <span style="flex:1"></span>
  <a href="https://github.com/its-not-rocket-science/ananke" target="_blank" rel="noopener">GitHub ↗</a>
  <a href="${relRoot}api/" target="_blank" rel="noopener">API ↗</a>
</nav>`;

const FOOT = `
</body>
</html>`;

// ── Page definitions ───────────────────────────────────────────────────────────

const pages = [

// 1. Session API
{ path: 'session/index.html', title: 'Session API', label: 'Session API',
  desc: 'Embeddable npm runtime and session API for Ananke.',
  body: `
<div class="page-header">
  <h1>Session API</h1>
  <p class="subtitle">Embeddable npm runtime — create, step, fork, and serialise Ananke worlds from any JavaScript or TypeScript host.</p>
  <span class="stub-notice">● static preview — live runner coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Lifecycle</span></div>
    <div class="section-body">
      <div class="flow">
        <div class="flow-node">createSession(seed)</div><span class="flow-arrow">→</span>
        <div class="flow-node">dispatch(command)</div><span class="flow-arrow">→</span>
        <div class="flow-node">stepWorld()</div><span class="flow-arrow">→</span>
        <div class="flow-node">snapshot()</div><span class="flow-arrow">→</span>
        <div class="flow-node">fork() / serialize()</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Sample import</span></div>
    <div class="section-body">
<pre>import { createSession } from '@its-not-rocket-science/ananke/session';

const session = createSession({ seed: 0xDEADBEEF });
session.dispatch({ type: 'SPAWN_ENTITY', archetype: 'soldier', pos: [10, 20] });
const state = session.stepWorld();
const snap  = session.snapshot();     // serialisable envelope
const fork  = session.fork();         // deterministic branch</pre>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Session envelope (preview)</span></div>
    <div class="section-body">
<pre>{
  "version": "1.0",
  "seed": 3735928559,
  "tick": 42,
  "entities": [ ... ],
  "commands": [ ... ],
  "checksum": "q(1.0):deadbeef"
}</pre>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="../hub/">← Hub</a>
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/session-api.md" target="_blank" rel="noopener">session-api.md ↗</a>
        <a href="../playground/">Playground — run sessions live ↗</a>
        <a href="../debugger/">Visual Debugger ↗</a>
      </div>
    </div>
  </div>

</div>` },

// 2. Content Packs
{ path: 'content-packs/index.html', title: 'Content Packs', label: 'Content Packs',
  desc: 'Content pack manifest validator and registry workflow for Ananke.',
  body: `
<div class="page-header">
  <h1>Content Pack Registry</h1>
  <p class="subtitle">Validate, inspect, and register content packs — species, weapons, armour, archetypes, scenarios, and culture bundles.</p>
  <span class="stub-notice">● static preview — registry backend coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Manifest validator</span></div>
    <div class="section-body">
      <div class="field">
        <label for="manifest-input">Paste pack manifest JSON</label>
        <textarea id="manifest-input" rows="8" placeholder='{ "name": "my-pack", "version": "1.0.0", "includes": ["weapons","archetypes"] }'></textarea>
      </div>
      <button class="btn" onclick="validateManifest()">Validate shape</button>
      <div id="manifest-result" style="margin-top:.75rem;font-family:var(--mono);font-size:.72rem;color:var(--muted)"></div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Pack sections</span></div>
    <div class="section-body">
      <table class="data-table">
        <thead><tr><th>Section</th><th>Key</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Weapons</td><td><code>weapons[]</code></td><td><span class="pill pill-ring">supported</span></td></tr>
          <tr><td>Armour</td><td><code>armour[]</code></td><td><span class="pill pill-ring">supported</span></td></tr>
          <tr><td>Archetypes</td><td><code>archetypes[]</code></td><td><span class="pill pill-ring">supported</span></td></tr>
          <tr><td>Scenarios</td><td><code>scenarios[]</code></td><td><span class="pill pill-ring">supported</span></td></tr>
          <tr><td>Species</td><td><code>species[]</code></td><td><span class="pill pill-ring">supported</span></td></tr>
          <tr><td>Cultures</td><td><code>cultures[]</code></td><td><span class="pill pill-violet">preview</span></td></tr>
          <tr><td>Provenance</td><td><code>provenance{}</code></td><td><span class="pill pill-violet">preview</span></td></tr>
          <tr><td>Checksum</td><td><code>checksum</code></td><td><span class="pill pill-stub">stub</span></td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/content-packs.md" target="_blank" rel="noopener">content-packs.md ↗</a>
        <a href="../zoo/">Simulation Zoo — browse built-in content ↗</a>
        <a href="../data-governance/">Data Governance &amp; Provenance ↗</a>
      </div>
    </div>
  </div>

</div>
<script>
function validateManifest() {
  const val = document.getElementById('manifest-input').value.trim();
  const out = document.getElementById('manifest-result');
  if (!val) { out.textContent = 'Paste a manifest first.'; return; }
  try {
    const m = JSON.parse(val);
    const missing = ['name','version','includes'].filter(k => !(k in m));
    if (missing.length) {
      out.style.color = 'var(--violet)';
      out.textContent = 'Missing required keys: ' + missing.join(', ');
    } else {
      out.style.color = 'var(--live)';
      out.textContent = '✓ Shape valid — name: ' + m.name + '  version: ' + m.version;
    }
  } catch(e) {
    out.style.color = '#f87171';
    out.textContent = 'JSON parse error: ' + e.message;
  }
}
</script>` },

// 3. World Evolution
{ path: 'world-evolution/index.html', title: 'World Evolution', label: 'World Evolution',
  desc: 'World evolution branching, checkpoint, and diff viewer for Ananke.',
  body: `
<div class="page-header">
  <h1>World Evolution</h1>
  <p class="subtitle">Branching checkpoints, world diffs, and timeline navigation for long-running Ananke simulations.</p>
  <span class="stub-notice">● static preview — live branching viewer coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Branch timeline (static mock)</span></div>
    <div class="section-body" style="overflow-x:auto">
<pre style="color:var(--text)">main   ──●──────●──────●──────●──────●  (tick 0 → 500)
              │           │
              └──●──●     └──●──●──●   feature branches
                 fork-A       fork-B</pre>
      <p style="font-size:.75rem;color:var(--muted);margin-top:.75rem">
        Each <code>●</code> is a deterministic checkpoint — a serialised session envelope
        that can be restored, forked, or diffed against any other checkpoint.
      </p>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Checkpoint concepts</span></div>
    <div class="section-body">
      <div class="info-row"><span class="info-key">checkpoint</span><span class="info-val">Full serialised world state at a given tick. Deterministically reproducible from seed + command log.</span></div>
      <div class="info-row"><span class="info-key">fork()</span><span class="info-val">Creates an independent branch from the current checkpoint. Both branches share history up to the fork tick.</span></div>
      <div class="info-row"><span class="info-key">diff(a, b)</span><span class="info-val">Entity-level delta between two checkpoints — added, removed, and mutated entities.</span></div>
      <div class="info-row"><span class="info-key">restore(id)</span><span class="info-val">Rewind to any prior checkpoint. All subsequent ticks are re-deterministic from that point.</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/world-evolution.md" target="_blank" rel="noopener">world-evolution.md ↗</a>
        <a href="../replay/">Replay &amp; Diff Viewer ↗</a>
        <a href="../map/">Generative Cartography ↗</a>
        <a href="../session/">Session API ↗</a>
      </div>
    </div>
  </div>

</div>` },

// 4. Combat
{ path: 'combat/index.html', title: 'Combat Kernel', label: 'Combat Kernel',
  desc: 'Tactical combat kernel explorer for Ananke.',
  body: `
<div class="page-header">
  <h1>Combat Kernel Explorer</h1>
  <p class="subtitle">Explore Ananke's deterministic tactical combat engine — archetypes, weapons, armour, and tick-by-tick resolution.</p>
  <span class="stub-notice">● link explorer — live kernel runner in Playground</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">How deterministic tick stepping works</span></div>
    <div class="section-body">
      <div class="flow">
        <div class="flow-node">Seed + commands</div><span class="flow-arrow">→</span>
        <div class="flow-node">stepWorld()</div><span class="flow-arrow">→</span>
        <div class="flow-node">Fixed-point resolution</div><span class="flow-arrow">→</span>
        <div class="flow-node">Identical output, every host</div>
      </div>
      <p style="font-size:.78rem;color:var(--muted);margin-top:.85rem">
        All arithmetic uses <code>q()</code> fixed-point values. No floating-point. No platform variance.
        Given the same seed and command sequence, every host produces byte-identical state.
      </p>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Explorer parameters</span></div>
    <div class="section-body">
      <div class="two-col">
        <div>
          <div class="field"><label>Attacker archetype</label>
            <select><option>soldier</option><option>archer</option><option>cavalry</option><option>mage</option></select></div>
          <div class="field"><label>Weapon</label>
            <select><option>longsword</option><option>shortbow</option><option>lance</option><option>staff</option></select></div>
        </div>
        <div>
          <div class="field"><label>Defender archetype</label>
            <select><option>soldier</option><option>shield-bearer</option><option>heavy-infantry</option></select></div>
          <div class="field"><label>Armour</label>
            <select><option>chainmail</option><option>plate</option><option>leather</option><option>none</option></select></div>
        </div>
      </div>
      <div class="field" style="margin-top:.5rem"><label>Seed (hex)</label>
        <input type="text" value="0xDEADBEEF" style="max-width:180px"></div>
      <p style="font-size:.75rem;color:var(--muted);margin-top:.5rem">
        Live resolution runs in the <a href="../playground/" style="color:var(--ring)">Playground</a>. Use the Playground's combat scenario tab with these parameters.
      </p>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="../playground/">Playground — run combat live ↗</a>
        <a href="../examples/tactics-duel/">Tactics Duel game ↗</a>
        <a href="../debugger/">Visual Debugger — step ticks ↗</a>
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/combat.md" target="_blank" rel="noopener">combat.md ↗</a>
      </div>
    </div>
  </div>

</div>` },

// 5. Replay
{ path: 'replay/index.html', title: 'Replay & Diff Viewer', label: 'Replay & Diff',
  desc: 'Replay trace and deterministic diff viewer for Ananke.',
  body: `
<div class="page-header">
  <h1>Replay &amp; Diff Viewer</h1>
  <p class="subtitle">Load two replay traces and compare them tick-by-tick — identify divergence points and entity state deltas.</p>
  <span class="stub-notice">● static preview — diff engine coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Load replay trace</span></div>
    <div class="section-body">
      <div class="field">
        <label>Paste replay JSON (Trace A)</label>
        <textarea rows="6" placeholder='{ "seed": 0, "ticks": [...], "checksum": "..." }'></textarea>
      </div>
      <div class="field">
        <label>Paste replay JSON (Trace B — optional, for diff)</label>
        <textarea rows="6" placeholder='{ "seed": 0, "ticks": [...], "checksum": "..." }'></textarea>
      </div>
      <button class="btn">Parse traces</button>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Tick list (placeholder)</span></div>
    <div class="section-body">
      <table class="data-table">
        <thead><tr><th>Tick</th><th>Entities</th><th>Commands</th><th>Checksum</th><th>Delta</th></tr></thead>
        <tbody>
          <tr><td>0</td><td>12</td><td>3</td><td><code>q:a1b2…</code></td><td>—</td></tr>
          <tr><td>1</td><td>12</td><td>1</td><td><code>q:c3d4…</code></td><td>—</td></tr>
          <tr><td>2</td><td>11</td><td>2</td><td><code>q:e5f6…</code></td><td><span style="color:var(--violet)">1 entity removed</span></td></tr>
        </tbody>
      </table>
      <p style="font-size:.72rem;color:var(--muted);margin-top:.6rem">Populate by loading a real trace above.</p>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">What deterministic comparison means</span></div>
    <div class="section-body">
      <p style="font-size:.8rem;color:var(--muted);line-height:1.65">
        Two traces with the same seed and command sequence must produce byte-identical checksums at every tick.
        Any divergence indicates a host integration error, a non-deterministic command, or a platform
        floating-point leak. The diff viewer identifies the first divergent tick and the entity fields responsible.
      </p>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="../debugger/">Visual Debugger ↗</a>
        <a href="../examples/host-coherence/">Host Coherence Reference ↗</a>
        <a href="../conformance/">Conformance Dashboard ↗</a>
      </div>
    </div>
  </div>

</div>` },

// 6. Narrative Stress
{ path: 'narrative-stress/index.html', title: 'Narrative Stress', label: 'Narrative Stress',
  desc: 'Plot-armour and narrative plausibility analyser for Ananke.',
  body: `
<div class="page-header">
  <h1>Narrative Stress Analyser</h1>
  <p class="subtitle">Analyse beat sequences for narrative plausibility — identify over-protected entities, implausible survivals, and plot-armour pressure.</p>
  <span class="stub-notice">● static preview — analyser engine coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Beat sequence editor</span></div>
    <div class="section-body">
      <div class="field">
        <label>Beat sequence (one beat per line: entity — event — outcome)</label>
        <textarea rows="8" placeholder="Hero — ambushed by 10 soldiers — survives unharmed&#10;Hero — falls from cliff — lands safely&#10;Hero — poisoned — recovers in 1 tick"></textarea>
      </div>
      <button class="btn">Analyse sequence</button>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Narrative push scale</span></div>
    <div class="section-body">
      <div class="info-row"><span class="info-key">0.0 — 0.3</span><span class="info-val">Plausible. Outcomes consistent with simulation state.</span></div>
      <div class="info-row"><span class="info-key">0.3 — 0.6</span><span class="info-val">Elevated. Some outcomes require implicit authorial intervention.</span></div>
      <div class="info-row"><span class="info-key">0.6 — 0.8</span><span class="info-val">High. Entity is consistently surviving implausible situations.</span></div>
      <div class="info-row"><span class="info-key">0.8 — 1.0</span><span class="info-val">Plot armour detected. Outcomes statistically inconsistent with world state.</span></div>
      <div style="margin-top:.85rem">
        <label style="margin-bottom:.35rem;display:block">Current narrative push (mock)</label>
        <div class="meter"><div class="meter-fill" style="width:42%"></div></div>
        <span style="font-family:var(--mono);font-size:.68rem;color:var(--accent)">0.42 — elevated</span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/narrative-stress.md" target="_blank" rel="noopener">narrative-stress.md ↗</a>
        <a href="../examples/narrative-campaign/">Narrative Campaign example ↗</a>
        <a href="../mythology/">Mythology &amp; Chronicle systems ↗</a>
      </div>
    </div>
  </div>

</div>` },

// 7. Arena
{ path: 'arena/index.html', title: 'Arena', label: 'Arena',
  desc: 'Batch simulation runner for Ananke.',
  body: `
<div class="page-header">
  <h1>Arena</h1>
  <p class="subtitle">Batch simulation runner — run hundreds of scenarios in parallel and aggregate results against expectations.</p>
  <span class="stub-notice">● static preview — batch runner coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Run configuration</span></div>
    <div class="section-body">
      <div class="two-col">
        <div>
          <div class="field"><label>Scenario</label>
            <select><option>tactics-duel-standard</option><option>siege-defence</option><option>open-field</option></select></div>
          <div class="field"><label>Trials</label>
            <input type="number" value="100" min="1" max="10000"></div>
        </div>
        <div>
          <div class="field"><label>Seed range</label>
            <input type="text" value="0x0000 — 0xFFFF"></div>
          <div class="field"><label>Max ticks per trial</label>
            <input type="number" value="500"></div>
        </div>
      </div>
      <div class="field"><label>Expectations (JSON)</label>
        <textarea rows="4" placeholder='{ "winRate": { "attacker": ">0.45" }, "avgTicks": "<200" }'></textarea>
      </div>
      <button class="btn">Run batch (static — no output)</button>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Report preview (mock)</span></div>
    <div class="section-body">
      <table class="data-table">
        <thead><tr><th>Metric</th><th>Expected</th><th>Observed</th><th>Pass</th></tr></thead>
        <tbody>
          <tr><td>Attacker win rate</td><td>&gt;0.45</td><td>0.51</td><td><span class="pill pill-live">✓</span></td></tr>
          <tr><td>Avg ticks to resolution</td><td>&lt;200</td><td>147</td><td><span class="pill pill-live">✓</span></td></tr>
          <tr><td>Checksum collisions</td><td>0</td><td>0</td><td><span class="pill pill-live">✓</span></td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/arena.md" target="_blank" rel="noopener">arena.md ↗</a>
        <a href="../playground/">Playground — single-run scenarios ↗</a>
        <a href="../dashboard/">Validation Dashboard ↗</a>
      </div>
    </div>
  </div>

</div>` },

// 8. Politics
{ path: 'politics/index.html', title: 'Faction & Diplomacy', label: 'Politics',
  desc: 'Faction, diplomacy, and reputation explorer for Ananke.',
  body: `
<div class="page-header">
  <h1>Faction &amp; Diplomacy</h1>
  <p class="subtitle">Explore polity and faction relation matrices, diplomatic standing, and reputation dynamics.</p>
  <span class="stub-notice">● static preview — live faction explorer coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Polity relation matrix (mock)</span></div>
    <div class="section-body" style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th></th><th>Arken</th><th>Veldris</th><th>Solund</th><th>Norrith</th></tr></thead>
        <tbody>
          <tr><td><strong>Arken</strong></td><td>—</td><td><span style="color:var(--live)">Allied</span></td><td><span style="color:var(--muted)">Neutral</span></td><td><span style="color:#f87171">Hostile</span></td></tr>
          <tr><td><strong>Veldris</strong></td><td><span style="color:var(--live)">Allied</span></td><td>—</td><td><span style="color:var(--accent)">Tense</span></td><td><span style="color:var(--muted)">Neutral</span></td></tr>
          <tr><td><strong>Solund</strong></td><td><span style="color:var(--muted)">Neutral</span></td><td><span style="color:var(--accent)">Tense</span></td><td>—</td><td><span style="color:var(--live)">Allied</span></td></tr>
          <tr><td><strong>Norrith</strong></td><td><span style="color:#f87171">Hostile</span></td><td><span style="color:var(--muted)">Neutral</span></td><td><span style="color:var(--live)">Allied</span></td><td>—</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/diplomacy.md" target="_blank" rel="noopener">diplomacy.md ↗</a>
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/faction.md" target="_blank" rel="noopener">faction.md ↗</a>
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/polity.md" target="_blank" rel="noopener">polity.md ↗</a>
        <a href="../world-evolution/">World Evolution ↗</a>
      </div>
    </div>
  </div>
</div>` },

// 9. Economy
{ path: 'economy/index.html', title: 'Economy & Trade', label: 'Economy',
  desc: 'Economy, trade, inventory, and crafting explorer for Ananke.',
  body: `
<div class="page-header">
  <h1>Economy &amp; Trade</h1>
  <p class="subtitle">Item valuation, trade offers, inventory management, and crafting recipes.</p>
  <span class="stub-notice">● static preview — economy engine coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Trade offer preview</span></div>
    <div class="section-body">
      <table class="data-table">
        <thead><tr><th>Item</th><th>Qty</th><th>Base value (q)</th><th>Market modifier</th><th>Offer price</th></tr></thead>
        <tbody>
          <tr><td>Longsword</td><td>1</td><td>q(120)</td><td>×1.2</td><td><span style="color:var(--accent)">q(144)</span></td></tr>
          <tr><td>Healing salve</td><td>5</td><td>q(30)</td><td>×0.8</td><td><span style="color:var(--accent)">q(24)</span></td></tr>
          <tr><td>Iron ingot</td><td>20</td><td>q(8)</td><td>×1.0</td><td><span style="color:var(--accent)">q(8)</span></td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Inventory (mock)</span></div>
    <div class="section-body">
      <table class="data-table">
        <thead><tr><th>Slot</th><th>Item</th><th>Condition</th><th>Weight (q)</th></tr></thead>
        <tbody>
          <tr><td>Weapon</td><td>Longsword</td><td><span class="pill pill-live">good</span></td><td>q(3.2)</td></tr>
          <tr><td>Armour</td><td>Chainmail</td><td><span class="pill pill-ring">worn</span></td><td>q(12.0)</td></tr>
          <tr><td>Misc ×3</td><td>Healing salve</td><td><span class="pill pill-live">good</span></td><td>q(0.5)</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/economy.md" target="_blank" rel="noopener">economy.md ↗</a>
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/crafting.md" target="_blank" rel="noopener">crafting.md ↗</a>
        <a href="../content-packs/">Content Packs ↗</a>
      </div>
    </div>
  </div>
</div>` },

// 10. Medical
{ path: 'medical/index.html', title: 'Medical & Recovery', label: 'Medical',
  desc: 'Injury, recovery, and downtime explorer for Ananke.',
  body: `
<div class="page-header">
  <h1>Medical &amp; Recovery</h1>
  <p class="subtitle">Injury states, recovery timelines, care levels, and downtime modelling.</p>
  <span class="stub-notice">● static preview — medical engine coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Injury state (mock)</span></div>
    <div class="section-body">
      <div class="info-row"><span class="info-key">Entity</span><span class="info-val">Soldier_042</span></div>
      <div class="info-row"><span class="info-key">Injury</span><span class="info-val">Laceration — left arm</span></div>
      <div class="info-row"><span class="info-key">Severity</span><span class="info-val"><span class="pill pill-ring">moderate</span></span></div>
      <div class="info-row"><span class="info-key">Ticks to recovery</span><span class="info-val">48 ticks (care: standard)</span></div>
      <div class="info-row"><span class="info-key">Combat effectiveness</span><span class="info-val">−30%</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Recovery timeline</span></div>
    <div class="section-body">
      <div class="flow">
        <div class="flow-node">Injured (tick 0)</div><span class="flow-arrow">→</span>
        <div class="flow-node">Stabilised (tick 4)</div><span class="flow-arrow">→</span>
        <div class="flow-node">Recovering (tick 4–48)</div><span class="flow-arrow">→</span>
        <div class="flow-node">Fit for duty (tick 48)</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Care level selector</span></div>
    <div class="section-body">
      <div class="field">
        <label>Care level</label>
        <select>
          <option>none — recovery ×0.5</option>
          <option selected>standard — recovery ×1.0</option>
          <option>skilled — recovery ×1.5</option>
          <option>magical — recovery ×3.0</option>
        </select>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/medical.md" target="_blank" rel="noopener">medical.md ↗</a>
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/downtime.md" target="_blank" rel="noopener">downtime.md ↗</a>
        <a href="../campaign/">Campaign systems ↗</a>
      </div>
    </div>
  </div>
</div>` },

// 11. Environment
{ path: 'environment/index.html', title: 'Environment & Weather', label: 'Environment',
  desc: 'Weather, atmosphere, hazards, and climate explorer for Ananke.',
  body: `
<div class="page-header">
  <h1>Environment &amp; Weather</h1>
  <p class="subtitle">Weather states, atmospheric hazards, climate effects, and world-state interactions.</p>
  <span class="stub-notice">● static preview — environment engine coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Weather controls (mock)</span></div>
    <div class="section-body">
      <div class="two-col">
        <div>
          <div class="field"><label>Weather state</label>
            <select><option>clear</option><option>overcast</option><option>rain</option><option selected>storm</option><option>blizzard</option></select></div>
          <div class="field"><label>Wind (q, m/s)</label>
            <input type="number" value="14"></div>
        </div>
        <div>
          <div class="field"><label>Temperature (q, °C)</label>
            <input type="number" value="4"></div>
          <div class="field"><label>Visibility (q, 0–1)</label>
            <input type="number" value="0.3" step="0.1" min="0" max="1"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Effect summary</span></div>
    <div class="section-body">
      <div class="info-row"><span class="info-key">Ranged accuracy</span><span class="info-val">−40% (storm penalty)</span></div>
      <div class="info-row"><span class="info-key">Movement speed</span><span class="info-val">−20% (mud/wind)</span></div>
      <div class="info-row"><span class="info-key">Fire hazard</span><span class="info-val"><span class="pill pill-live">suppressed</span></span></div>
      <div class="info-row"><span class="info-key">Hypothermia risk</span><span class="info-val"><span class="pill pill-ring">moderate</span></span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/environment.md" target="_blank" rel="noopener">environment.md ↗</a>
        <a href="../map/">Generative Cartography ↗</a>
        <a href="../world-evolution/">World Evolution ↗</a>
      </div>
    </div>
  </div>
</div>` },

// 12. Epidemiology
{ path: 'epidemiology/index.html', title: 'Epidemiology', label: 'Epidemiology',
  desc: 'Disease, epidemic, quarantine, and famine modelling for Ananke.',
  body: `
<div class="page-header">
  <h1>Epidemiology</h1>
  <p class="subtitle">Disease states, epidemic spread, quarantine protocols, and famine modelling.</p>
  <span class="stub-notice">● static preview — epidemic engine coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Infection state (mock)</span></div>
    <div class="section-body">
      <div class="info-row"><span class="info-key">Disease</span><span class="info-val">Marsh Fever</span></div>
      <div class="info-row"><span class="info-key">Infected entities</span><span class="info-val">14 / 200 population</span></div>
      <div class="info-row"><span class="info-key">R₀ (q)</span><span class="info-val">q(2.3)</span></div>
      <div class="info-row"><span class="info-key">Quarantine active</span><span class="info-val"><span class="pill pill-live">yes</span></span></div>
      <div style="margin-top:.85rem">
        <label style="display:block;margin-bottom:.3rem">Infection prevalence</label>
        <div class="meter"><div class="meter-fill" style="width:7%;background:#f87171"></div></div>
        <span style="font-family:var(--mono);font-size:.68rem;color:var(--muted)">7% — early outbreak</span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Spread controls (mock)</span></div>
    <div class="section-body">
      <div class="two-col">
        <div class="field"><label>Transmission vector</label>
          <select><option>airborne</option><option selected>contact</option><option>water</option><option>vector</option></select></div>
        <div class="field"><label>Quarantine radius (tiles)</label>
          <input type="number" value="3"></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/epidemiology.md" target="_blank" rel="noopener">epidemiology.md ↗</a>
        <a href="../world-evolution/">World Evolution ↗</a>
        <a href="../politics/">Polity &amp; Faction systems ↗</a>
      </div>
    </div>
  </div>
</div>` },

// 13. Technology
{ path: 'technology/index.html', title: 'Technology & Research', label: 'Technology',
  desc: 'Tech diffusion, research, and era progression explorer for Ananke.',
  body: `
<div class="page-header">
  <h1>Technology &amp; Research</h1>
  <p class="subtitle">Tech era ladder, diffusion pressure, and research progression modelling.</p>
  <span class="stub-notice">● static preview — tech engine coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Tech era ladder (mock)</span></div>
    <div class="section-body">
      <table class="data-table">
        <thead><tr><th>Era</th><th>Key techs</th><th>Status</th><th>Diffusion pressure</th></tr></thead>
        <tbody>
          <tr><td>Stone Age</td><td>Fire, tools, shelter</td><td><span class="pill pill-live">complete</span></td><td>—</td></tr>
          <tr><td>Bronze Age</td><td>Metallurgy, writing, agriculture</td><td><span class="pill pill-live">complete</span></td><td>—</td></tr>
          <tr><td>Iron Age</td><td>Iron weapons, roads, coinage</td><td><span class="pill pill-ring">current</span></td>
            <td><div class="meter" style="width:100px;display:inline-block"><div class="meter-fill" style="width:68%"></div></div> 68%</td></tr>
          <tr><td>Medieval</td><td>Plate armour, siegecraft, universities</td><td><span class="pill pill-stub">locked</span></td>
            <td><div class="meter" style="width:100px;display:inline-block"><div class="meter-fill" style="width:12%"></div></div> 12%</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/technology.md" target="_blank" rel="noopener">technology.md ↗</a>
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/research.md" target="_blank" rel="noopener">research.md ↗</a>
        <a href="../world-evolution/">World Evolution ↗</a>
      </div>
    </div>
  </div>
</div>` },

// 14. Campaign
{ path: 'campaign/index.html', title: 'Campaign', label: 'Campaign',
  desc: 'Quest, settlement, and campaign system explorer for Ananke.',
  body: `
<div class="page-header">
  <h1>Campaign</h1>
  <p class="subtitle">Quest management, settlement progression, and campaign state overview.</p>
  <span class="stub-notice">● static preview — campaign engine coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Campaign state (mock)</span></div>
    <div class="section-body">
      <div class="info-row"><span class="info-key">Campaign</span><span class="info-val">The Broken Coast</span></div>
      <div class="info-row"><span class="info-key">Current tick</span><span class="info-val">342</span></div>
      <div class="info-row"><span class="info-key">Active quests</span><span class="info-val">3</span></div>
      <div class="info-row"><span class="info-key">Settlements</span><span class="info-val">4 (2 friendly, 1 neutral, 1 hostile)</span></div>
      <div class="info-row"><span class="info-key">Party size</span><span class="info-val">6 entities</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Location / Entity / Inventory tabs</span></div>
    <div class="section-body">
      <div style="display:flex;gap:.5rem;margin-bottom:.85rem;flex-wrap:wrap">
        <button class="btn" style="opacity:1">Locations</button>
        <button class="btn" style="opacity:.5">Entities</button>
        <button class="btn" style="opacity:.5">Inventory</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Location</th><th>Type</th><th>Entities</th><th>Stance</th></tr></thead>
        <tbody>
          <tr><td>Saltfen village</td><td>Settlement</td><td>42</td><td><span style="color:var(--live)">Friendly</span></td></tr>
          <tr><td>Ironwatch keep</td><td>Fortification</td><td>18</td><td><span style="color:var(--muted)">Neutral</span></td></tr>
          <tr><td>Cursed barrow</td><td>Dungeon</td><td>7</td><td><span style="color:#f87171">Hostile</span></td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="../examples/narrative-campaign/">Narrative Campaign example ↗</a>
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/campaign.md" target="_blank" rel="noopener">campaign.md ↗</a>
        <a href="../world-evolution/">World Evolution ↗</a>
        <a href="../economy/">Economy &amp; Trade ↗</a>
      </div>
    </div>
  </div>
</div>` },

// 15. Mythology
{ path: 'mythology/index.html', title: 'Mythology & Chronicle', label: 'Mythology',
  desc: 'Mythology, chronicle, and legend system explorer for Ananke.',
  body: `
<div class="page-header">
  <h1>Mythology &amp; Chronicle</h1>
  <p class="subtitle">Chronicle events harden into legends; legends solidify into myths. Myth feeds back into world behaviour.</p>
  <span class="stub-notice">● static preview — mythology engine coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Chronicle → Legend → Myth flow</span></div>
    <div class="section-body">
      <div class="flow">
        <div class="flow-node">World event<br><span style="font-size:.68rem;color:var(--muted)">tick 0–n</span></div>
        <span class="flow-arrow">→</span>
        <div class="flow-node">Chronicle entry<br><span style="font-size:.68rem;color:var(--muted)">raw record</span></div>
        <span class="flow-arrow">→</span>
        <div class="flow-node">Legend<br><span style="font-size:.68rem;color:var(--muted)">embellished, shared</span></div>
        <span class="flow-arrow">→</span>
        <div class="flow-node">Myth<br><span style="font-size:.68rem;color:var(--muted)">canonical, effects world</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Myth effect preview (mock)</span></div>
    <div class="section-body">
      <div class="info-row"><span class="info-key">Myth</span><span class="info-val">The Unbroken Tide — Saltfen cannot fall to siege</span></div>
      <div class="info-row"><span class="info-key">Belief penetration</span><span class="info-val">82% of regional population</span></div>
      <div class="info-row"><span class="info-key">World effect</span><span class="info-val">Saltfen defender morale +25 when attacked</span></div>
      <div class="info-row"><span class="info-key">Decay rate</span><span class="info-val">−2% per 100 ticks without reinforcing event</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/mythology.md" target="_blank" rel="noopener">mythology.md ↗</a>
        <a href="../narrative-stress/">Narrative Stress Analyser ↗</a>
        <a href="../campaign/">Campaign systems ↗</a>
      </div>
    </div>
  </div>
</div>` },

// 16. Conformance
{ path: 'conformance/index.html', title: 'Conformance', label: 'Conformance',
  desc: 'Host-loop, netcode, and conformance dashboard for Ananke integrators.',
  body: `
<div class="page-header">
  <h1>Conformance</h1>
  <p class="subtitle">Host integration checklist, import surface status, and conformance test results for Ananke integrators.</p>
  <span class="stub-notice">● static preview — live conformance runner coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Host integration checklist</span></div>
    <div class="section-body">
      <ul class="checklist">
        <li class="done">Import only from declared subpath exports (<code>ananke/session</code>, <code>ananke/combat</code>, etc.)</li>
        <li class="done">Use <code>q()</code> for all values passed to Ananke — no raw floats</li>
        <li class="done">Dispatch commands only via the command queue — no direct state mutation</li>
        <li class="done">Store and restore world state only via <code>snapshot()</code> / <code>restore()</code></li>
        <li>Validate replay determinism: same seed + commands → same checksum on all target platforms</li>
        <li>Pass the host-loop conformance test suite (<code>npm run test:conformance</code>)</li>
        <li>Subscribe to the <code>STABLE_API.md</code> tier for the exports you use</li>
      </ul>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Import surface status</span></div>
    <div class="section-body">
      <table class="data-table">
        <thead><tr><th>Subpath</th><th>Stability tier</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td><code>ananke/session</code></td><td>Tier 1 — stable</td><td><span class="pill pill-live">✓ conformant</span></td></tr>
          <tr><td><code>ananke/combat</code></td><td>Tier 1 — stable</td><td><span class="pill pill-live">✓ conformant</span></td></tr>
          <tr><td><code>ananke/world</code></td><td>Tier 1 — stable</td><td><span class="pill pill-live">✓ conformant</span></td></tr>
          <tr><td><code>ananke/narrative</code></td><td>Tier 2 — preview</td><td><span class="pill pill-ring">preview</span></td></tr>
          <tr><td><code>ananke/economy</code></td><td>Tier 2 — preview</td><td><span class="pill pill-ring">preview</span></td></tr>
          <tr><td><code>ananke/internal/*</code></td><td>Unstable — do not import</td><td><span class="pill pill-stub">unstable</span></td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="../examples/host-coherence/">Host Coherence Reference app ↗</a>
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/conformance.md" target="_blank" rel="noopener">conformance.md ↗</a>
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/STABLE_API.md" target="_blank" rel="noopener">STABLE_API.md ↗</a>
        <a href="../replay/">Replay &amp; Diff Viewer ↗</a>
        <a href="../dashboard/">Validation Dashboard ↗</a>
      </div>
    </div>
  </div>
</div>` },

// 17. Data Governance
{ path: 'data-governance/index.html', title: 'Data Governance', label: 'Data Governance',
  desc: 'Provenance, validation, trust, and data governance for Ananke.',
  body: `
<div class="page-header">
  <h1>Data Governance</h1>
  <p class="subtitle">Provenance tracking, trust artefacts, validation results, and release integrity for Ananke content and releases.</p>
  <span class="stub-notice">● static preview — trust dashboard coming</span>
</div>
<div class="page-body">

  <div class="section">
    <div class="section-head"><span class="section-title">Provenance checklist</span></div>
    <div class="section-body">
      <ul class="checklist">
        <li class="done">All content packs include a <code>provenance</code> block (author, date, source)</li>
        <li class="done">Release artefacts include SHA-256 checksums</li>
        <li class="done">npm package published from CI (not local dev)</li>
        <li class="done">All determinism tests pass before release tag</li>
        <li>SLSA provenance attestation for npm releases (planned)</li>
        <li>Signed git tags for all version releases</li>
      </ul>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Trust artefacts</span></div>
    <div class="section-body">
      <div class="info-row"><span class="info-key">Determinism badge</span><span class="info-val"><span class="pill pill-live">passing</span> — all seeds, all platforms</span></div>
      <div class="info-row"><span class="info-key">CI provenance</span><span class="info-val"><span class="pill pill-live">GitHub Actions</span> — no local builds in releases</span></div>
      <div class="info-row"><span class="info-key">Validation dashboard</span><span class="info-val"><span class="pill pill-ring">last run: CI</span></span></div>
      <div class="info-row"><span class="info-key">SLSA level</span><span class="info-val"><span class="pill pill-stub">level 1</span> — attestation planned</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">Links</span></div>
    <div class="section-body">
      <div class="link-list">
        <a href="../dashboard/">Validation Dashboard ↗</a>
        <a href="../content-packs/">Content Pack Registry ↗</a>
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/docs/data-governance.md" target="_blank" rel="noopener">data-governance.md ↗</a>
        <a href="https://github.com/its-not-rocket-science/ananke/blob/main/CHANGELOG.md" target="_blank" rel="noopener">Changelog ↗</a>
      </div>
    </div>
  </div>
</div>` },

]; // end pages array

// ── Generate files ─────────────────────────────────────────────────────────────

const OUT = path.resolve(__dirname, 'docs');

for (const page of pages) {
  const dir = path.join(OUT, path.dirname(page.path));
  fs.mkdirSync(dir, { recursive: true });

  const relRoot = '../'.repeat(page.path.split('/').length - 1);
  const html = HEAD(page.title, page.desc, relRoot)
    + TOPNAV(relRoot, page.label)
    + page.body
    + FOOT;

  fs.writeFileSync(path.join(OUT, page.path), html);
  console.log('✓', page.path);
}

console.log(`\nGenerated ${pages.length} pages → docs/`);
