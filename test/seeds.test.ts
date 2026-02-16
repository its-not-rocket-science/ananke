import { expect, test } from "vitest";
import { eventSeed } from "../src/sim/seeds";

test("eventSeed is deterministic and sensitive to inputs", () => {
  const a = eventSeed(123, 10, 1, 2, 0xBEEF);
  const b = eventSeed(123, 10, 1, 2, 0xBEEF);
  expect(a).toBe(b);

  expect(eventSeed(124, 10, 1, 2, 0xBEEF)).not.toBe(a);
  expect(eventSeed(123, 11, 1, 2, 0xBEEF)).not.toBe(a);
  expect(eventSeed(123, 10, 2, 1, 0xBEEF)).not.toBe(a);
  expect(eventSeed(123, 10, 1, 2, 0xBEEE)).not.toBe(a);
});