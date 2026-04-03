import { TraceKinds } from "../sim/kinds.js";
import type { TraceEvent } from "../sim/trace.js";

export interface TickRange {
  start: number;
  end: number;
}

export interface CausalFactor {
  label: string;
  weight: number;
  evidence: string[];
}

export interface Explanation {
  entityId: number;
  tickRange: TickRange;
  summary: string;
  factors: CausalFactor[];
  mermaid: string;
}

export interface ExplanationContext {
  trace: TraceEvent[];
  windPenaltyByTick?: Record<number, number>;
  fatigueByEntityId?: Record<number, number>;
}

function inRange(tick: number, range: TickRange): boolean {
  return tick >= range.start && tick <= range.end;
}

function toMermaid(entityId: number, factors: CausalFactor[]): string {
  const lines = [
    "flowchart TD",
    `  ROOT[Why entity ${entityId} got this outcome]`,
  ];

  for (let i = 0; i < factors.length; i++) {
    const node = `F${i}`;
    lines.push(`  ROOT --> ${node}[${factors[i]!.label} (${factors[i]!.weight.toFixed(2)})]`);
    for (let e = 0; e < factors[i]!.evidence.length; e++) {
      lines.push(`  ${node} --> ${node}_${e}[${factors[i]!.evidence[e]}]`);
    }
  }

  return lines.join("\n");
}

export function explainOutcome(
  entityId: number,
  tickRange: TickRange,
  context: ExplanationContext,
): Explanation {
  const relevant = context.trace.filter(ev => inRange(ev.tick, tickRange));

  const missEvents = relevant.filter(
    (ev): ev is Extract<TraceEvent, { kind: typeof TraceKinds.ProjectileHit }> =>
      ev.kind === TraceKinds.ProjectileHit && ev.shooterId === entityId && !ev.hit,
  );

  const totalShots = relevant.filter(
    (ev): ev is Extract<TraceEvent, { kind: typeof TraceKinds.ProjectileHit }> =>
      ev.kind === TraceKinds.ProjectileHit && ev.shooterId === entityId,
  ).length;

  const avgDistance = missEvents.length > 0
    ? missEvents.reduce((sum, ev) => sum + ev.distance_m, 0) / missEvents.length
    : 0;

  const windPenalty = missEvents.reduce((sum, ev) => sum + (context.windPenaltyByTick?.[ev.tick] ?? 0), 0);
  const fatigue = context.fatigueByEntityId?.[entityId] ?? 0;

  const factors: CausalFactor[] = [];

  if (missEvents.length > 0) {
    factors.push({
      label: "Range pressure",
      weight: Math.min(1, avgDistance / 50000),
      evidence: [`${missEvents.length}/${totalShots} shots missed`, `Average miss distance ${(avgDistance / 1000).toFixed(1)}m`],
    });
  }

  if (fatigue > 0) {
    factors.push({
      label: "Fatigue accumulation",
      weight: Math.min(1, fatigue),
      evidence: [`Fatigue score ${fatigue.toFixed(2)} reduced aim stability`],
    });
  }

  if (windPenalty > 0) {
    factors.push({
      label: "Crosswind interference",
      weight: Math.min(1, windPenalty / 3),
      evidence: [`Wind penalty total ${windPenalty.toFixed(2)} across selected ticks`],
    });
  }

  if (factors.length === 0) {
    factors.push({
      label: "No dominant penalty detected",
      weight: 0.2,
      evidence: ["Trace did not include ranged misses or explicit penalties"],
    });
  }

  const summary = missEvents.length >= 3
    ? `Entity ${entityId} missed repeatedly due to stacked penalties in the selected tick window.`
    : `Entity ${entityId} outcome explained from ${factors.length} weighted factor(s).`;

  return {
    entityId,
    tickRange,
    summary,
    factors,
    mermaid: toMermaid(entityId, factors),
  };
}

export function createCausalExplainer(context: ExplanationContext): {
  explainOutcome: (entityId: number, tickRange: TickRange) => Explanation;
} {
  return {
    explainOutcome(entityId: number, tickRange: TickRange): Explanation {
      return explainOutcome(entityId, tickRange, context);
    },
  };
}
