import { describe, test, expect } from "vitest";
import { ExtendedBodyPlanDefinition, validateExtendedBodyPlan } from "../src/anatomy/anatomy-schema";
import { AnatomyFunctionId, TissueLayerDefinition } from "../src/anatomy";

const VALID_PLAN: ExtendedBodyPlanDefinition = {
    id: "test",
    locomotion: { type: "biped" },
    cnsLayout: { type: "centralized" },
    segments: [
        { id: "torso", parent: null, mass_kg: 10, exposureWeight: {} },
        { id: "head", parent: "torso", mass_kg: 5, exposureWeight: {}, cnsRole: "central" },
        { id: "leftArm", parent: "torso", mass_kg: 4, exposureWeight: {}, manipulationRole: "primary" },
        { id: "rightArm", parent: "torso", mass_kg: 4, exposureWeight: {}, manipulationRole: "primary" },
    ],
};

describe("validateExtendedBodyPlan", () => {

    test("accepts minimal valid plan", () => {
        const result = validateExtendedBodyPlan(VALID_PLAN);
        expect(result.ok).toBe(true);
    });

    test("rejects non-object input", () => {
        const result = validateExtendedBodyPlan({} as ExtendedBodyPlanDefinition);
        expect(result.ok).toBe(false);
    });

    test("rejects duplicate segment ids", () => {
        const plan = {
            ...VALID_PLAN,
            segments: [
                { id: "torso", parent: null, mass_kg: 10, exposureWeight: {} },
                { id: "torso", parent: null, mass_kg: 10, exposureWeight: {} },
            ],
        };

        const result = validateExtendedBodyPlan(plan);
        expect(result.ok).toBe(false);
    });

    test("rejects unknown parent id", () => {
        const plan = {
            ...VALID_PLAN,
            segments: [
                { id: "torso", parent: "missing", mass_kg: 10, exposureWeight: {} },
            ],
        };

        const result = validateExtendedBodyPlan(plan);
        expect(result.ok).toBe(false);
    });

    test("detects parent cycle", () => {
        const plan = {
            ...VALID_PLAN,
            segments: [
                { id: "a", parent: "b", mass_kg: 1, exposureWeight: {} },
                { id: "b", parent: "a", mass_kg: 1, exposureWeight: {} },
            ],
        };

        const result = validateExtendedBodyPlan(plan);
        expect(result.ok).toBe(false);
    });

    describe("validateExtendedBodyPlan nested invalid cases", () => {
        test("rejects segmentData for unknown segment id", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    ghost: { tags: ["x"] },
                },
            };

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.includes("segmentData.ghost"))).toBe(true);
        });

        test("rejects non-array segmentData.tags", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: { tags: "bad" as unknown as string[] },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path === "segmentData.torso.tags")).toBe(true);
        });

        test("rejects duplicate tissue ids", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: {
                        tissues: [
                            { id: "skin", kind: "skin" },
                            { id: "skin", kind: "muscle" },
                        ],
                    },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.message.includes("Duplicate tissue id"))).toBe(true);
        });

        test("rejects duplicate organ ids", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: {
                        organs: [
                            { id: "heart", kind: "pump" },
                            { id: "heart", kind: "pump" },
                        ],
                    },
                },
            };

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.message.includes("Duplicate organ id"))).toBe(true);
        });

        test("rejects unknown non-namespaced function id", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: {
                        functions: [{ id: "coordination", role: "primary" }],
                    },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.message.includes("Unknown function id 'coordination'"))).toBe(true);
        });

        test("accepts custom namespaced function id", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: {
                        functions: [{ id: "x:coordination", role: "primary" }],
                    },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(true);
        });

        test("rejects duplicate target profile ids", () => {
            const plan = {
                ...VALID_PLAN,
                targetProfiles: [
                    { id: "default", selectors: [{ ids: ["head"], weight: 1 }] },
                    { id: "default", selectors: [{ ids: ["torso"], weight: 1 }] },
                ],
            };

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.message.includes("Duplicate profile id 'default'"))).toBe(true);
        });

        test("rejects duplicate coverage profile ids", () => {
            const plan = {
                ...VALID_PLAN,
                coverageProfiles: [
                    { id: "cover", selectors: [{ ids: ["leftArm"] }] },
                    { id: "cover", selectors: [{ ids: ["rightArm"] }] },
                ],
            };

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.message.includes("Duplicate profile id 'cover'"))).toBe(true);
        });

        test("rejects selector with no criteria", () => {
            const plan = {
                ...VALID_PLAN,
                targetProfiles: [
                    { id: "default", selectors: [{ weight: 1 }] },
                ],
            };

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.message.includes("Selector must define at least one criterion"))).toBe(true);
        });

        test("rejects selector with unknown ids", () => {
            const plan = {
                ...VALID_PLAN,
                targetProfiles: [
                    { id: "default", selectors: [{ ids: ["ghost"], weight: 1 }] },
                ],
            };

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.message.includes("Unknown segment 'ghost'"))).toBe(true);
        });

        test("rejects selector with bad subtreeOf", () => {
            const plan = {
                ...VALID_PLAN,
                coverageProfiles: [
                    { id: "cover", selectors: [{ subtreeOf: "ghost" }] },
                ],
            };

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.message.includes("Unknown subtree root 'ghost'"))).toBe(true);
        });

        test("rejects selector with empty anyOf", () => {
            const plan = {
                ...VALID_PLAN,
                coverageProfiles: [
                    { id: "cover", selectors: [{ anyOf: [] }] },
                ],
            };

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".anyOf"))).toBe(true);
        });

        test("rejects selector with empty allOf", () => {
            const plan = {
                ...VALID_PLAN,
                coverageProfiles: [
                    { id: "cover", selectors: [{ allOf: [] }] },
                ],
            };

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".allOf"))).toBe(true);
        });

        test("rejects bad humanoid alias segment id", () => {
            const plan = {
                ...VALID_PLAN,
                contracts: {
                    humanoidTargeting: {
                        head: ["ghost"],
                    },
                },
            };

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.message.includes("Unknown segment 'ghost'"))).toBe(true);
        });

        test("rejects bad humanoid alias non-array", () => {
            const plan = {
                ...VALID_PLAN,
                contracts: {
                    humanoidTargeting: {
                        head: "head" as unknown as string[],
                    },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.message.includes("Humanoid alias entry must be a string array"))).toBe(true);
        });

        test("rejects empty object input", () => {
            expect(validateExtendedBodyPlan({} as ExtendedBodyPlanDefinition).ok).toBe(false);
        });

        test("rejects non-object tissue entry", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: {
                        tissues: ["bad-entry" as unknown as TissueLayerDefinition],
                    },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.message.includes("Tissue definition must be an object"))).toBe(true);
        });

        test("rejects tissue with non-numeric integrity", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: {
                        tissues: [{ id: "skin", kind: "skin", integrity: "bad" as unknown as number }],
                    },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".integrity"))).toBe(true);
        });

        test("rejects tissue with non-array tags", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: {
                        tissues: [{ id: "skin", kind: "skin", tags: "bad" as unknown as readonly string[] }],
                    },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".tags"))).toBe(true);
        });

        test("rejects non-object organ entry", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: {
                        organs: ["bad-entry" as unknown as { id: string; kind: string }],
                    },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.message.includes("Organ definition must be an object"))).toBe(true);
        });

        test("rejects organ with non-array functionIds", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: {
                        organs: [{ id: "heart", kind: "pump", functionIds: "bad" as unknown as readonly AnatomyFunctionId[] }],
                    },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".functionIds"))).toBe(true);
        });

        test("rejects organ with non-array tags", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: {
                        organs: [{ id: "heart", kind: "pump", tags: "bad" as unknown as readonly string[] }],
                    },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".tags"))).toBe(true);
        });

        test("rejects organ with non-boolean vital", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: {
                        organs: [{ id: "heart", kind: "pump", vital: "yes" as unknown as boolean }],
                    },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".vital"))).toBe(true);
        });

        test("rejects non-object function entry", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: {
                        functions: ["bad-entry" as unknown as { id: string; role?: "primary" }],
                    },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.message.includes("Function definition must be an object"))).toBe(true);
        });

        test("rejects function with invalid role", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: {
                        functions: [{ id: "x:test", role: "bad" as unknown as "primary" }],
                    },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".role"))).toBe(true);
        });

        test("rejects function with non-numeric weight", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: {
                        functions: [{ id: "x:test", role: "primary", weight: "bad" as unknown as number }],
                    },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".weight"))).toBe(true);
        });

        test("rejects function with non-array tags", () => {
            const plan = {
                ...VALID_PLAN,
                segmentData: {
                    torso: {
                        functions: [{ id: "x:test", role: "primary", tags: "bad" as unknown as readonly string[] }],
                    },
                },
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".tags"))).toBe(true);
        });

        test("rejects targetProfiles when not an array", () => {
            const plan = {
                ...VALID_PLAN,
                targetProfiles: "bad" as unknown as readonly [],
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path === "targetProfiles")).toBe(true);
        });

        test("rejects coverageProfiles when not an array", () => {
            const plan = {
                ...VALID_PLAN,
                coverageProfiles: "bad" as unknown as readonly [],
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path === "coverageProfiles")).toBe(true);
        });

        test("rejects coverage profile tags when not an array", () => {
            const plan = {
                ...VALID_PLAN,
                coverageProfiles: [
                    { id: "cover", tags: "bad" as unknown as readonly string[], selectors: [{ ids: ["leftArm"] }] },
                ],
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path === "coverageProfiles[0].tags")).toBe(true);
        });

        test("rejects selector ids when not an array", () => {
            const plan = {
                ...VALID_PLAN,
                targetProfiles: [
                    { id: "default", selectors: [{ ids: "bad" as unknown as readonly string[], weight: 1 }] },
                ],
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".ids"))).toBe(true);
        });

        test("rejects selector tags when not an array", () => {
            const plan = {
                ...VALID_PLAN,
                targetProfiles: [
                    { id: "default", selectors: [{ tags: "bad" as unknown as readonly string[], weight: 1 }] },
                ],
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".tags"))).toBe(true);
        });

        test("rejects selector functionIds when not an array", () => {
            const plan = {
                ...VALID_PLAN,
                targetProfiles: [
                    { id: "default", selectors: [{ functionIds: "bad" as unknown as readonly string[], weight: 1 }] },
                ],
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".functionIds"))).toBe(true);
        });

        test("rejects selector subtreeOf when not a string", () => {
            const plan = {
                ...VALID_PLAN,
                targetProfiles: [
                    { id: "default", selectors: [{ subtreeOf: 123 as unknown as string, weight: 1 }] },
                ],
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".subtreeOf"))).toBe(true);
        });

        test("rejects selector anyOf when not an array", () => {
            const plan = {
                ...VALID_PLAN,
                coverageProfiles: [
                    { id: "cover", selectors: [{ anyOf: "bad" as unknown as readonly [] }] },
                ],
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".anyOf"))).toBe(true);
        });

        test("rejects selector allOf when not an array", () => {
            const plan = {
                ...VALID_PLAN,
                coverageProfiles: [
                    { id: "cover", selectors: [{ allOf: "bad" as unknown as readonly [] }] },
                ],
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".allOf"))).toBe(true);
        });

        test("rejects selector exclude when not an object", () => {
            const plan = {
                ...VALID_PLAN,
                coverageProfiles: [
                    { id: "cover", selectors: [{ ids: ["leftArm"], exclude: "bad" as unknown as object }] },
                ],
            } satisfies ExtendedBodyPlanDefinition;

            const result = validateExtendedBodyPlan(plan);
            expect(result.ok).toBe(false);
            expect(result.issues.some(i => i.path.endsWith(".exclude"))).toBe(true);
        });
    });
});