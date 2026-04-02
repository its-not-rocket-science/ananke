// eslint.config.mjs
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,

  // Typescript-eslint recommended rules
  ...tseslint.configs.recommended,

  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        // If you later want type-aware rules, we can add "project: true"
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name=/^__(sensoryEnv|factionRegistry|partyRegistry|relationshipGraph|nutritionAccum)$/]",
          message: "Use world.runtimeState with typed fields instead of hidden __* runtime side channels.",
        },
        {
          selector: "Property[key.name=/^__(sensoryEnv|factionRegistry|partyRegistry|relationshipGraph|nutritionAccum)$/]",
          message: "Use world.runtimeState with typed fields instead of hidden __* runtime side channels.",
        },
      ],
    },
  },

  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/tools/**",
    ],
  },
];