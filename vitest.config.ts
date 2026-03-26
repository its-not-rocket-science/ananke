import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      reportsDirectory: "./coverage",
      cleanOnRerun: true,
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/types.ts",
        "src/sim/entity.ts",
        "src/sim/world.ts",
        "src/sim/tick.ts",
        "src/sim/ai/types.ts",
        "src/anatomy/anatomy-contracts.ts",
        // Type-definition-only modules — no runtime code to cover
        "src/bridge/types.ts",
        "src/sim/capability.ts",
        "src/sim/context.ts",
      ],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 85,
        lines: 90,
      }
    }
  },
});