import pluginJs from "@eslint/js";
import pluginTypeScriptEslint from "@typescript-eslint/eslint-plugin";
import pluginTypeScriptEslintRaw from "@typescript-eslint/eslint-plugin/use-at-your-own-risk/raw-plugin";
import pluginBoundaries from "eslint-plugin-boundaries";
import pluginEslintComments from "eslint-plugin-eslint-comments";
import pluginImport from "eslint-plugin-import";
import pluginNoOnlyTests from "eslint-plugin-no-only-tests";
import perfectionist from "eslint-plugin-perfectionist";
import pluginPromise from "eslint-plugin-promise";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginRegexp from "eslint-plugin-regexp";
import pluginSecurity from "eslint-plugin-security";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import pluginSonarjs from "eslint-plugin-sonarjs";
import pluginUnicorn from "eslint-plugin-unicorn";
import pluginUnusedImports from "eslint-plugin-unused-imports";
import globals from "globals";

const typeScriptFiles = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];
const sourceTypeScriptFiles = [
  "src/**/*.ts",
  "src/**/*.tsx",
  "src/**/*.mts",
  "src/**/*.cts",
];

function scopeConfigs(configs, files, languageOptions = undefined) {
  return configs.map((config) => ({
    ...config,
    files,
    ...(languageOptions
      ? {
          languageOptions: {
            ...config.languageOptions,
            ...languageOptions,
            parserOptions: {
              ...config.languageOptions?.parserOptions,
              ...languageOptions.parserOptions,
            },
          },
        }
      : {}),
  }));
}

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    ignores: [
      ".cache/**",
      ".next/**",
      "build/**",
      "coverage/**",
      "dist/**",
      "drizzle/meta/**",
      "node_modules/**",
      "src/components/ui/**",
    ],
  },
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"] },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  pluginJs.configs.recommended,
  ...scopeConfigs(
    pluginTypeScriptEslintRaw.flatConfigs["flat/strict"],
    typeScriptFiles,
  ),
  ...scopeConfigs(
    pluginTypeScriptEslintRaw.flatConfigs["flat/stylistic"],
    typeScriptFiles,
  ),
  ...scopeConfigs(
    pluginTypeScriptEslintRaw.flatConfigs["flat/strict-type-checked"],
    sourceTypeScriptFiles,
    {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  ),
  ...scopeConfigs(
    pluginTypeScriptEslintRaw.flatConfigs["flat/stylistic-type-checked"],
    sourceTypeScriptFiles,
    {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  ),
  {
    plugins: {
      "@typescript-eslint": pluginTypeScriptEslint,
      boundaries: pluginBoundaries,
      "eslint-comments": pluginEslintComments,
      import: pluginImport,
      "no-only-tests": pluginNoOnlyTests,
      perfectionist,
      promise: pluginPromise,
      "react-hooks": pluginReactHooks,
      regexp: pluginRegexp,
      security: pluginSecurity,
      "simple-import-sort": simpleImportSort,
      sonarjs: pluginSonarjs,
      unicorn: pluginUnicorn,
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      "eslint-comments/no-unused-disable": "error",
      "import/first": "error",
      "import/newline-after-import": "error",
      "import/no-duplicates": "error",
      "no-only-tests/no-only-tests": "error",
      "promise/no-return-wrap": "error",
      "regexp/no-dupe-disjunctions": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "security/detect-unsafe-regex": "error",
      "sonarjs/no-identical-functions": "error",
      "unicorn/no-abusive-eslint-disable": "error",
      "simple-import-sort/exports": "error",
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            ["^node:", "^bun:"],
            ["^@?\\w"],
            ["^\\.\\.(?!/?$)", "^\\.\\./?$"],
            ["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
          ],
        },
      ],
      eqeqeq: ["error", "always"],
      "no-console": "off",
      "no-throw-literal": "error",
      "no-useless-return": "error",
      "unused-imports/no-unused-imports": "error",
    },
  },
  {
    files: sourceTypeScriptFiles,
    rules: {
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-deprecated": "off",
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-parameters": "off",
      "@typescript-eslint/no-unnecessary-type-conversion": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowAny: false,
          allowBoolean: true,
          allowNever: false,
          allowNullish: false,
          allowNumber: true,
          allowRegExp: false,
        },
      ],
      "@typescript-eslint/return-await": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    files: typeScriptFiles,
    rules: {
      "@typescript-eslint/no-empty-function": "off",
      ...perfectionist.configs["recommended-natural"].rules,
      "perfectionist/sort-exports": "off",
      "perfectionist/sort-imports": "off",
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
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
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
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-console": "off",
    },
  },
];
