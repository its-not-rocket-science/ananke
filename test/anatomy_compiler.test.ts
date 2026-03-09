import { describe, test, expect } from "vitest";
import { compileAnatomyDefinition } from "../src/anatomy";

describe("compileAnatomyDefinition", () => {

  test("returns model for valid plan", () => {
    const result = compileAnatomyDefinition({
      id: "x",
      locomotion: { type: "biped" },
      cnsLayout: { type: "centralized" },
      segments: [
        { id: "torso", parent: null, mass_kg: 10, exposureWeight: {} },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.model).toBeDefined();
  });

  test("returns issues for invalid plan", () => {
    const result = compileAnatomyDefinition({
      id: "",
      segments: [],
    });

    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

});