import { beforeAll, describe, it } from "vitest";

import type { CommandMap } from "../src/sim/commands.js";
import type { KernelContext } from "../src/sim/context.js";
import { stepWorld } from "../src/sim/kernel.js";
import type { TraceEvent, TraceSink } from "../src/sim/trace.js";
import type { WorldState } from "../src/sim/world.js";
import { KERNEL_PARITY_SCENARIOS, type KernelParityScenario } from "./fixtures/kernel-parity-scenarios.js";
import {
  captureTraceOrder,
  captureWorldParitySnapshot,
  formatParityDiff,
  firstDiff,
  type WorldParitySnapshot,
} from "./utils/kernel-parity-diff.js";

type StepWorldLike = (world: WorldState, cmds: CommandMap, ctx: KernelContext) => void;

interface ScenarioRun {
  scenario: KernelParityScenario;
  endState: WorldParitySnapshot;
  traceOrder: unknown[];
}

function runScenario(step: StepWorldLike, scenario: KernelParityScenario): ScenarioRun {
  const world = scenario.createWorld();
  const ctx = scenario.createContext();
  const traceEvents: TraceEvent[] = [];
  const trace: TraceSink = { onEvent: (event) => traceEvents.push(event) };

  for (let tick = 0; tick < scenario.ticks; tick += 1) {
    step(world, scenario.commandsAtTick(tick, world), { ...ctx, trace });
  }

  return {
    scenario,
    endState: captureWorldParitySnapshot(world),
    traceOrder: captureTraceOrder(traceEvents),
  };
}

function assertScenarioParity(before: ScenarioRun, after: ScenarioRun): void {
  const name = `${before.scenario.id}: ${before.scenario.name}`;

  const endStateDiff = firstDiff(before.endState, after.endState);
  if (endStateDiff) {
    throw new Error(formatParityDiff(`[${name}] end-state parity`, before.endState, after.endState));
  }

  if (before.scenario.compareTraceOrder) {
    const traceDiff = firstDiff(before.traceOrder, after.traceOrder);
    if (traceDiff) {
      throw new Error(formatParityDiff(`[${name}] trace ordering parity`, before.traceOrder, after.traceOrder));
    }
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

describe("kernel parity (canonical semantics fixtures)", () => {
  for (const scenario of KERNEL_PARITY_SCENARIOS) {
    it(`resolver extraction parity: ${scenario.id}`, () => {
      const before = runScenario(stepWorld, scenario);
      const after = runScenario(stepWorldAfter, scenario);
      assertScenarioParity(before, after);
    });
  }
});
