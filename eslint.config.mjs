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
    },
  },

  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
    ],
  },
];