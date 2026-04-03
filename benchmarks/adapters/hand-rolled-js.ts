import type { BaselineAdapter } from "./types.js";

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function makeBodies(count: number): Body[] {
  return Array.from({ length: count }, (_, i) => ({
    x: (i % 60) * 1.3,
    y: Math.floor(i / 60) * 1.3,
    vx: (i % 3) - 1,
    vy: (i % 5) - 2,
  }));
}

function naiveTick(bodies: Body[]): void {
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]!;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy + 1e-6;
      const dist = Math.sqrt(distSq);
      const inv = 1 / dist;

      // intentionally naive and expensive broadphase/narrowphase pair loop
      for (let k = 0; k < 50; k++) {
        const impulse = Math.sin(dist + k) * inv * 0.0007;
        a.vx -= dx * impulse;
        a.vy -= dy * impulse;
        b.vx += dx * impulse;
        b.vy += dy * impulse;
      }
    }
  }

  for (const b of bodies) {
    b.x += b.vx * 0.016;
    b.y += b.vy * 0.016;
    b.vx *= 0.997;
    b.vy *= 0.997;
  }
}

function inferEntities(id: string): number {
  if (id === "empty-world") return 0;
  if (id === "small-skirmish") return 20;
  if (id === "large-battle") return 200;
  if (id === "spawn-storm") return 1000;
  return 100;
}

export const handRolledJsAdapter: BaselineAdapter = {
  id: "hand-rolled-js",
  label: "Hand-rolled JS O(N²)",
  async run(scenario) {
    const entities = inferEntities(scenario.id);
    const bodies = makeBodies(entities);
    const t0 = performance.now();
    for (let tick = 0; tick < scenario.ticks; tick++) {
      if (scenario.id === "spawn-storm" && tick < 100) {
        bodies.push(...makeBodies(10));
      }
      naiveTick(bodies);
    }
    const elapsedMs = performance.now() - t0;
    const tickMs = elapsedMs / scenario.ticks;
    return {
      tickMs,
      ticksPerSec: tickMs > 0 ? 1000 / tickMs : 0,
      notes: "Reference implementation intentionally uses naive O(N²) broadphase.",
    };
  },
};
