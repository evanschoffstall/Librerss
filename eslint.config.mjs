import pluginJs from "@eslint/js";
import pluginTypeScriptEslint from "@typescript-eslint/eslint-plugin";
import pluginTypeScriptEslintRaw from "@typescript-eslint/eslint-plugin/use-at-your-own-risk/raw-plugin";
import pluginBetterTailwindcss from "eslint-plugin-better-tailwindcss";
import pluginEslintComments from "eslint-plugin-eslint-comments";
import pluginImport from "eslint-plugin-import";
import pluginNoOnlyTests from "eslint-plugin-no-only-tests";
import perfectionist from "eslint-plugin-perfectionist";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import pluginPromise from "eslint-plugin-promise";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginRegexp from "eslint-plugin-regexp";
import pluginSecurity from "eslint-plugin-security";
import pluginSonarjs from "eslint-plugin-sonarjs";
import pluginUnicorn from "eslint-plugin-unicorn";
import pluginUnusedImports from "eslint-plugin-unused-imports";
import { globalIgnores } from "eslint/config";
import globals from "globals";
import { readFileSync } from "node:fs";

const sourceFiles = ["src/**"];
const testFiles = ["tests/**"];
const scriptFiles = ["scripts/**"];
const rootConfigFiles = [
  "drizzle.config.ts",
  "eslint.config.mjs",
  "next.config.ts",
  "playwright.config.ts",
  "tailwind.config.ts",
];
const nonSourceProjectFiles = [
  ...testFiles,
  ...scriptFiles,
  ...rootConfigFiles,
];
const barrelImportFiles = [
  "src/app/**/*.ts",
  "src/app/**/*.tsx",
  "src/components/**/*.ts",
  "src/components/**/*.tsx",
  "src/proxy.ts",
];
const projectFiles = [...sourceFiles, ...nonSourceProjectFiles];
const apiAndLibraryFiles = ["src/lib/**", "src/app/api/**"];
const barrelOnlyImportPatterns = [
  {
    group: ["./lib/server/*"],
    message: 'Use the public "@/lib/server" barrel instead.',
  },
  {
    group: ["@/lib/core/types"],
    message: 'Use the public "@/lib" barrel instead.',
  },
  {
    group: ["@/lib/hooks/*"],
    message: 'Use the public "@/lib" barrel instead.',
  },
  {
    group: ["@/lib/server/*"],
    message: 'Use the public "@/lib/server" barrel instead.',
  },
];
const typeScriptFlatConfigs = pluginTypeScriptEslintRaw.flatConfigs;
const typeCheckedParserOptions = {
  projectService: true,
  tsconfigRootDir: import.meta.dirname,
};
const banTypeScriptCommentRule = [
  "error",
  {
    minimumDescriptionLength: 5,
    "ts-check": false,
    "ts-expect-error": "allow-with-description",
    "ts-ignore": "allow-with-description",
    "ts-nocheck": true,
  },
];
const sourceTailwindSettings = {
  "better-tailwindcss": {
    entryPoint: `${import.meta.dirname}/src/app/globals.css`,
    tsconfig: `${import.meta.dirname}/tsconfig.json`,
  },
};
const sourceTailwindRules = {
  "better-tailwindcss/enforce-canonical-classes": "error",
  "better-tailwindcss/enforce-consistent-class-order": "error",
  "better-tailwindcss/enforce-consistent-important-position": "error",
  "better-tailwindcss/enforce-consistent-line-wrapping": "error",
  "better-tailwindcss/enforce-consistent-variable-syntax": "error",
  "better-tailwindcss/enforce-shorthand-classes": "error",
  "better-tailwindcss/no-conflicting-classes": "error",
  "better-tailwindcss/no-deprecated-classes": "error",
  "better-tailwindcss/no-duplicate-classes": "error",
  "better-tailwindcss/no-restricted-classes": "error",
  "better-tailwindcss/no-unnecessary-whitespace": "error",
};
const sourceTypeScriptRules = {
  "@typescript-eslint/no-base-to-string": "error",
  "@typescript-eslint/no-confusing-void-expression": "error",
  "@typescript-eslint/no-deprecated": "error",
  "@typescript-eslint/no-extraneous-class": "error",
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/no-non-null-assertion": "error",
  "@typescript-eslint/no-unnecessary-condition": "error",
  "@typescript-eslint/no-unnecessary-type-conversion": "error",
  "@typescript-eslint/no-unnecessary-type-parameters": "error",
  "@typescript-eslint/no-unsafe-argument": "error",
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/no-unsafe-return": "error",
  "@typescript-eslint/no-unused-expressions": "error",
  "@typescript-eslint/prefer-nullish-coalescing": "error",
  "@typescript-eslint/require-await": "error",
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
  "@typescript-eslint/unbound-method": "error",
};
const restrictedTypeScriptRules = {
  "@typescript-eslint/ban-ts-comment": banTypeScriptCommentRule,
  "@typescript-eslint/no-explicit-any": "error",
};
const sharedTypeScriptRules = {
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      ignoreRestSiblings: true,
      varsIgnorePattern: "^_",
    },
  ],
  ...restrictedTypeScriptRules,
};
const testTypeScriptRelaxedRules = {
  "@typescript-eslint/ban-ts-comment": "off",
  "@typescript-eslint/no-dynamic-delete": "off",
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-extraneous-class": "off",
  "@typescript-eslint/no-non-null-assertion": "off",
  "@typescript-eslint/no-unused-vars": "off",
  "no-console": "off",
};

function normalizeIgnorePattern(pattern) {
  const trimmedPattern = pattern.startsWith("/") ? pattern.slice(1) : pattern;
  return trimmedPattern.endsWith("/") ? `${trimmedPattern}**` : trimmedPattern;
}

const gitignorePatterns = readFileSync(
  new URL("./.gitignore", import.meta.url),
  "utf8",
)
  .split(/\r?\n/u)
  .map((line) => normalizeIgnorePattern(line.trim()))
  .filter((line) => line.length > 0 && !line.startsWith("#"));
const globalIgnorePatterns = [...gitignorePatterns, "src/components/ui/**"];

/**
 * Scope flat ESLint config entries to a file set with optional language options.
 */
function scopeConfigs(configs, files, languageOptions) {
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
  globalIgnores(globalIgnorePatterns, "Repo global ignores"),
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
  ...scopeConfigs(typeScriptFlatConfigs["flat/strict"], projectFiles),
  ...scopeConfigs(typeScriptFlatConfigs["flat/stylistic"], projectFiles),
  ...scopeConfigs(
    typeScriptFlatConfigs["flat/strict-type-checked"],
    sourceFiles,
    {
      parserOptions: typeCheckedParserOptions,
    },
  ),
  ...scopeConfigs(
    typeScriptFlatConfigs["flat/stylistic-type-checked"],
    sourceFiles,
    {
      parserOptions: typeCheckedParserOptions,
    },
  ),
  {
    plugins: {
      "@typescript-eslint": pluginTypeScriptEslint,
      "better-tailwindcss": pluginBetterTailwindcss,
      "eslint-comments": pluginEslintComments,
      import: pluginImport,
      "no-only-tests": pluginNoOnlyTests,
      promise: pluginPromise,
      "react-hooks": pluginReactHooks,
      regexp: pluginRegexp,
      security: pluginSecurity,
      sonarjs: pluginSonarjs,
      unicorn: pluginUnicorn,
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      eqeqeq: ["error", "always"],
      "eslint-comments/no-unused-disable": "error",
      "import/first": "error",
      "import/newline-after-import": "error",
      "import/no-duplicates": "error",
      "no-console": "off",
      "no-only-tests/no-only-tests": "error",
      "no-throw-literal": "error",
      "no-useless-return": "error",
      "promise/no-return-wrap": "error",
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
      "regexp/no-dupe-disjunctions": "error",
      "security/detect-unsafe-regex": "error",
      "sonarjs/no-identical-functions": "error",
      "sort-imports": "off",
      "unicorn/no-abusive-eslint-disable": "error",
      "unused-imports/no-unused-imports": "error",
    },
  },
  {
    files: sourceFiles,
    rules: sourceTailwindRules,
    settings: sourceTailwindSettings,
  },
  {
    files: sourceFiles,
    rules: sourceTypeScriptRules,
  },
  {
    files: barrelImportFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: barrelOnlyImportPatterns,
        },
      ],
    },
  },
  {
    ...perfectionist.configs["recommended-natural"],
    files: projectFiles,
  },
  {
    files: nonSourceProjectFiles,
    rules: {
      "@typescript-eslint/no-empty-function": "off",
    },
  },
  {
    rules: sharedTypeScriptRules,
  },
  {
    files: apiAndLibraryFiles,
    rules: restrictedTypeScriptRules,
  },
  {
    files: testFiles,
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: sourceFiles,
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
    files: testFiles,
    rules: testTypeScriptRelaxedRules,
  },
  // Keep this last so eslint-config-prettier disables conflicting formatting
  // rules from earlier configs.
  eslintPluginPrettierRecommended,
  {
    files: ["**/*.{jsx,tsx,js,ts}"],
    rules: {
      "prettier/prettier": "off",
    },
  },
];
