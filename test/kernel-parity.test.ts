import { beforeAll, describe, it } from "vitest";

import type { CommandMap } from "../src/sim/commands.js";
import type { KernelContext } from "../src/sim/context.js";
import { stepWorld } from "../src/sim/kernel.js";
import type { TraceEvent, TraceSink } from "../src/sim/trace.js";
import type { WorldState } from "../src/sim/world.js";
import { KERNEL_PARITY_SCENARIOS } from "./fixtures/kernel-parity-scenarios.js";
import { formatParityDiff, firstDiff } from "./utils/kernel-parity-diff.js";

type StepWorldLike = (world: WorldState, cmds: CommandMap, ctx: KernelContext) => void;

interface TickSnapshot {
  tick: number;
  entities: unknown;
  traceShape: unknown;
}

function normalizedTraceShape(events: TraceEvent[]): unknown[] {
  return events.map((event) => {
    const anyEvent = event as Record<string, unknown>;
    return {
      kind: event.kind,
      tick: event.tick,
      entityId: anyEvent.entityId ?? null,
      attackerId: anyEvent.attackerId ?? null,
      targetId: anyEvent.targetId ?? null,
      shooterId: anyEvent.shooterId ?? null,
      treaterId: anyEvent.treaterId ?? null,
    };
  });
}

function entityView(world: WorldState): unknown {
  return world.entities
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((entity) => ({
      id: entity.id,
      tick: world.tick,
      position_m: { ...entity.position_m },
      velocity_mps: { ...entity.velocity_mps },
      injury: {
        dead: entity.injury.dead,
        consciousness: entity.injury.consciousness,
        fluidLoss: entity.injury.fluidLoss,
        shock: entity.injury.shock,
        byRegion: entity.injury.byRegion,
      },
      condition: {
        fearQ: entity.condition.fearQ,
        suppressedTicks: entity.condition.suppressedTicks,
        suppressionFearMul: entity.condition.suppressionFearMul,
        surrendered: entity.condition.surrendered,
        rallyCooldownTicks: entity.condition.rallyCooldownTicks,
      },
      actionCooldowns: {
        attackCooldownTicks: entity.action.attackCooldownTicks,
        shootCooldownTicks: entity.action.shootCooldownTicks,
        capabilityCooldownTicks: entity.action.capabilityCooldownTicks,
        treatCooldownTicks: entity.action.treatCooldownTicks,
      },
    }));
}

function runOneTick(step: StepWorldLike, world: WorldState, ctx: KernelContext, commands: CommandMap): TickSnapshot {
  const traceEvents: TraceEvent[] = [];
  const trace: TraceSink = { onEvent: (event) => traceEvents.push(event) };
  step(world, commands, { ...ctx, trace });

  return {
    tick: world.tick,
    entities: entityView(world),
    traceShape: normalizedTraceShape(traceEvents),
  };
}

function assertNoDivergence(
  scenarioName: string,
  tick: number,
  before: TickSnapshot,
  after: TickSnapshot,
): void {
  if (before.tick !== after.tick) {
    throw new Error(formatParityDiff(`[${scenarioName}] tick counter @ tick ${tick}`, before.tick, after.tick));
  }

  const entityDiff = firstDiff(before.entities, after.entities);
  if (entityDiff) {
    throw new Error(formatParityDiff(`[${scenarioName}] world/entity parity @ tick ${tick}`, before.entities, after.entities));
  }

  const traceDiff = firstDiff(before.traceShape, after.traceShape);
  if (traceDiff) {
    throw new Error(formatParityDiff(`[${scenarioName}] trace parity @ tick ${tick}`, before.traceShape, after.traceShape));
  }
}

let stepWorldAfter: StepWorldLike = stepWorld;

beforeAll(async () => {
  try {
    const mod = await import("../src/sim/kernel-refactor.js");
    const candidate = (mod as Record<string, unknown>).stepWorldRefactor ?? (mod as Record<string, unknown>).stepWorld;
    if (typeof candidate === "function") {
      stepWorldAfter = candidate as StepWorldLike;
    }
  } catch {
    // Optional module during migration. If missing, parity still validates harness determinism.
  }
});

describe("kernel parity harness (before vs after)", () => {
  for (const scenario of KERNEL_PARITY_SCENARIOS) {
    it(`matches for scenario: ${scenario.name}`, () => {
      const beforeWorld = structuredClone(scenario.createWorld());
      const afterWorld = structuredClone(scenario.createWorld());
      const beforeCtx = structuredClone(scenario.createContext());
      const afterCtx = structuredClone(scenario.createContext());

      for (let tick = 0; tick < scenario.ticks; tick += 1) {
        const commands = scenario.commandsAtTick(tick, beforeWorld);
        const beforeSnap = runOneTick(stepWorld, beforeWorld, beforeCtx, commands);
        const afterSnap = runOneTick(stepWorldAfter, afterWorld, afterCtx, structuredClone(commands));
        assertNoDivergence(scenario.name, tick + 1, beforeSnap, afterSnap);
      }
    });
  }
});
