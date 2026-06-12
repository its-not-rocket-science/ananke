# Ananke Web (Three.js) Integration — Quickstart

This guide shows how to connect a Three.js scene to an Ananke sidecar and animate entities in a browser.  No Unity or Godot required.

---

## Prerequisites

- **Node.js 18+** (for the sidecar)
- A browser with WebSocket support (all modern browsers)
- [`ananke-unity-reference`](https://github.com/its-not-rocket-science/ananke-unity-reference) or [`ananke-godot-reference`](https://github.com/its-not-rocket-science/ananke-godot-reference) sidecar

---

## Step 1 — Start the sidecar (2 minutes)

```bash
cd ananke-unity-reference/sidecar  # or ananke-godot-reference/sidecar
npm install && npm start
```

---

## Step 2 — Minimal browser client

Save this as `index.html` and open it in a browser (no build step required):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Ananke Web Bridge Demo</title>
  <style>body { margin: 0; background: #111; }</style>
</head>
<body>
<script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.165/build/three.module.min.js" } }
</script>
<script type="module">
import * as THREE from "three";

// ── Three.js setup ─────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2, 8);
camera.lookAt(0, 1, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
scene.add(Object.assign(new THREE.DirectionalLight(0xffffff, 1), { position: { set: () => {} } }));
scene.background = new THREE.Color(0x222233);

// ── Entity meshes ──────────────────────────────────────────────────────────────
const meshes = new Map();

function getOrCreateMesh(entityId, teamId) {
  if (meshes.has(entityId)) return meshes.get(entityId);
  const color = teamId === 1 ? 0x4488ff : 0xff4444;
  const mesh  = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.25, 1.0, 4, 8),
    new THREE.MeshStandardMaterial({ color }),
  );
  scene.add(mesh);
  meshes.set(entityId, mesh);
  return mesh;
}

// ── WebSocket connection ───────────────────────────────────────────────────────
const ws = new WebSocket("ws://127.0.0.1:3001/stream");

ws.onmessage = (ev) => {
  /** @type {import("@its-not-rocket-science/ananke/host-loop").BridgeFrame} */
  const frame = JSON.parse(ev.data);

  for (const entity of frame.entities) {
    const mesh = getOrCreateMesh(entity.entityId, entity.teamId);

    // Position: BridgeVec3 is already in real metres — set directly.
    mesh.position.set(entity.position_m.x, entity.position_m.y + 0.75, entity.position_m.z);

    // Facing: normalised direction vector.
    mesh.rotation.y = Math.atan2(entity.facing.x, entity.facing.z);

    // Condition: dim the mesh when shocked, hide when dead.
    if (entity.condition.dead) {
      mesh.visible = false;
    } else {
      mesh.visible = true;
      mesh.material.opacity      = 1 - entity.condition.shockQ * 0.5;
      mesh.material.transparent  = entity.condition.shockQ > 0;
    }

    // Injury deformation: tint toward red as worst-case impairment increases.
    const worstInjury = Math.max(...entity.pose.map(p => p.impairmentQ), 0);
    mesh.material.color.lerpColors(
      new THREE.Color(entity.teamId === 1 ? 0x4488ff : 0xff4444),
      new THREE.Color(0x883300),
      worstInjury,
    );
  }
};

ws.onerror = () => console.warn("[ananke] WebSocket error — is the sidecar running?");
ws.onclose = () => console.warn("[ananke] WebSocket closed");

// ── Render loop ────────────────────────────────────────────────────────────────
renderer.setAnimationLoop(() => renderer.render(scene, camera));
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
</script>
</body>
</html>
```

Open `index.html` in a browser while the sidecar is running.  Two coloured capsules will appear and move as the simulation runs.

---

## BridgeFrame fields used in this example

| Field | Usage |
|---|---|
| `entity.position_m` | `mesh.position.set(x, y, z)` |
| `entity.facing` | `mesh.rotation.y = atan2(x, z)` |
| `entity.condition.dead` | Hide mesh |
| `entity.condition.shockQ` | Transparency blend |
| `entity.pose[].impairmentQ` | Red injury tint |
| `entity.animation.primaryState` | Drive animation state machine |
| `entity.animation.locomotionBlend` | Drive walk/run blend tree |

---

## Adding animation with Three.js AnimationMixer

```js
ws.onmessage = (ev) => {
  const frame = JSON.parse(ev.data);
  for (const entity of frame.entities) {
    const mixer = getMixer(entity.entityId); // your AnimationMixer per entity
    const primaryState = entity.animation.primaryState;

    // primaryState is one of: "idle" | "attack" | "flee" | "prone" | "unconscious" | "dead"
    const clip = getClipForState(primaryState); // your animation clips lookup
    if (clip) {
      const action = mixer.clipAction(clip);
      action.play();
    }

    mixer.setTime(entity.tick / entity.tickHz);
  }
};
```

---

## TypeScript sidecar: using `serializeBridgeFrame`

If you write your own sidecar, use the canonical serializer from the ananke package:

```typescript pseudocode
import { serializeBridgeFrame, type HostLoopConfig }
  from "@its-not-rocket-science/ananke/host-loop";
import { stepWorld } from "@its-not-rocket-science/ananke";

const config: HostLoopConfig = { scenarioId: "my-duel", tickHz: 20 };

setInterval(() => {
  stepWorld(world, commands, ctx);
  const frame = serializeBridgeFrame(world, config);
  broadcast(JSON.stringify(frame));
}, 50); // 20 Hz
```

This produces the same `BridgeFrame` schema the browser client expects.

---

## CORS and security

The sidecar runs on `127.0.0.1` only.  For production deployments behind a reverse proxy (nginx, Caddy), add appropriate CORS headers and TLS.  Never expose the sidecar WebSocket on a public interface without authentication.

---

## Next steps

- **Unity integration** — [docs/quickstart-unity.md](quickstart-unity.md)
- **Godot integration** — [docs/quickstart-godot.md](quickstart-godot.md)
- **Content packs** — [docs/integration-primer.md](integration-primer.md)
