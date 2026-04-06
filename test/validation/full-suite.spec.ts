import { describe, expect, it } from "vitest";
import { runFullGameValidation } from "../../tools/validate-games/run-validation.js";

describe("full mini-game validation suite", () => {
  it("runs all games and meets baseline checks", () => {
    const report = runFullGameValidation();
    expect(report.crashes).toBe(true);
    expect(report.deterministic).toBe(true);
    expect(report.performanceWithinBudget).toBe(true);
    expect(report.compatibility["Node 20"]).toBe("pass");
    expect(report.compatibility.Chrome).toBe("pass");
  });
});
