import { describe, test, expect } from "vitest";
import * as anatomy from "../src/anatomy";

describe("anatomy module exports", () => {

  test("exposes compiler", () => {
    expect(typeof anatomy.compileAnatomyDefinition).toBe("function");
  });

  test("exposes helpers", () => {
    expect(typeof anatomy.createAnatomyHelpers).toBe("function");
  });

});