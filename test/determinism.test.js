import { describe, expect, test } from "vitest";
import { generateIndividual } from "../src/generate";
import { HUMAN_BASE, SERVICE_ROBOT } from "../src/archetypes";
import { applyTraitsToAttributes, buildTraitProfile } from "../src/traits";
describe("determinism", () => {
    test("same seed => same human attributes", () => {
        const a1 = generateIndividual(1234567890, HUMAN_BASE);
        const a2 = generateIndividual(1234567890, HUMAN_BASE);
        expect(a1).toEqual(a2);
    });
    test("different seeds => different attributes", () => {
        const a1 = generateIndividual(1, HUMAN_BASE);
        const a2 = generateIndividual(2, HUMAN_BASE);
        expect(a1).not.toEqual(a2);
    });
    test("traits apply deterministically (order independent)", () => {
        const base = generateIndividual(42, SERVICE_ROBOT);
        const t1 = applyTraitsToAttributes(base, ["sealed", "radiationHardened", "distributedControl"]);
        const t2 = applyTraitsToAttributes(base, ["distributedControl", "sealed", "radiationHardened"]);
        expect(t1).toEqual(t2);
        const prof = buildTraitProfile(["sealed", "radiationHardened"]);
        expect(typeof prof.immuneMask).toBe("number");
        expect(typeof prof.resistantMask).toBe("number");
    });
});
