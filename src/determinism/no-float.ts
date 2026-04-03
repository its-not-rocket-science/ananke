const noop = (): void => undefined;

let armed = false;

export function assertNoFloatUsage(): void {
  if (armed) return;
  armed = true;

  const forbiddenRandom = (): never => {
    throw new Error("Determinism guard: Math.random() is forbidden in production.");
  };

  Object.defineProperty(Math, "random", {
    configurable: false,
    writable: false,
    value: forbiddenRandom,
  });
}

(process.env.NODE_ENV === "production" ? assertNoFloatUsage : noop)();
