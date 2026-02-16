import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/types.ts",
        "src/sim/entity.ts",
        "src/sim/world.ts",
        "src/sim/tick.ts",
        "src/sim/ai/types.ts"
      ]
    }
  },
});
