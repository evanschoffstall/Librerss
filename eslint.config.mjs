import pluginJs from "@eslint/js";
import pluginNoOnlyTests from "eslint-plugin-no-only-tests";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginSonarjs from "eslint-plugin-sonarjs";
import globals from "globals";
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.cache/**",
      "drizzle/meta/**",
      "src/components/ui/**",
    ],
  },
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "no-only-tests": pluginNoOnlyTests,
      "react-hooks": pluginReactHooks,
      sonarjs: pluginSonarjs,
    },
    rules: {
      "no-only-tests/no-only-tests": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "sonarjs/no-identical-functions": "error",
      eqeqeq: ["error", "always"],
      "no-console": "off",
      "no-throw-literal": "error",
      "no-useless-return": "error",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": "allow-with-description",
          "ts-expect-error": "allow-with-description",
          "ts-nocheck": true,
          "ts-check": false,
          minimumDescriptionLength: 5,
        },
      ],
    },
  },
  {
    files: ["src/lib/**/*.{ts,tsx}", "src/app/api/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": "allow-with-description",
          "ts-expect-error": "allow-with-description",
          "ts-nocheck": true,
          "ts-check": false,
          minimumDescriptionLength: 5,
        },
      ],
    },
  },
  {
    files: ["src/**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    rules: {
      "no-console": [
        "error",
        {
          allow: ["info", "warn", "error"],
        },
      ],
    },
  },
  {
    files: ["src/lib/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["src/__tests__/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-console": "off",
    },
  },
];
