import { hasPackageScript } from "check-suite/config";
import * as postProcess from "check-suite/post-process";
import * as quality from "check-suite/quality";
import * as step from "check-suite/step";
import { existsSync } from "node:fs";

const args = step.tokenizeCommandArgs;
const paths = {
  e2eExecutionReportPath: "coverage/playwright-junit.xml",
  e2eLineHitReportPath: "coverage/playwright/lcov.info",
  unitExecutionReportPath: "coverage/test-results.xml",
  unitLineHitReportPath: "coverage/lcov.info",
};
const discovery = quality.defineCodeTargetDiscovery({
  extensions: ".cjs .js .jsx .mjs .ts .tsx",
  ignoredDirectories:
    "**/.* **/__generated__ **/build **/coverage **/dist **/generated **/node_modules **/out **/scripts **/tmp **/ui **/vendor",
  resolutionEntrypointNames: "index main mod",
  testDirectories:
    "**/__fixtures__ **/__mocks__ **/__tests__ **/fixtures **/mocks **/test **/tests",
  testFilePatterns: "**/*.spec.* **/*.test.*",
});
const discoveredRoots = quality.discoverDefaultCodeRoots(
  process.cwd(),
  discovery,
).directories;
const roots = discoveredRoots.includes("src") ? ["src"] : discoveredRoots;
/**
 * Expands a shell-style argument string with the discovered repository roots.
 * @param value - The base argument string to tokenize.
 * @returns The tokenized arguments followed by the discovered roots.
 */
const withRoots = (value: string) => [...args(value), ...roots];
const command = {
  e2e: "run test:e2e:coverage",
  lint: "eslint . --cache --cache-strategy content --cache-location .cache/eslint --fix",
  prettier: "prettier --write ./src/ ./tests/",
  semgrep:
    "scan --config p/default --error --metrics off --exclude=tests --exclude=src/components/ui --exclude-rule=javascript.lang.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml --exclude-rule=typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml --exclude-rule=problem-based-packs.insecure-transport.js-node.bypass-tls-verification.bypass-tls-verification --quiet",
  unit: "test --timeout={testTimeoutMs} --coverage --coverage-reporter=lcov --coverage-dir=coverage --reporter=junit --reporter-outfile={unitExecutionReportPath}",
};
const complexityColumns =
  "nloc=0 ccn=1 tokenCount=2 parameterCount=3 length=4 location=5 path=6 functionName=7 startLine=9 endLine=10";
const complexityThresholds =
  "fileCcn=60 fileFunctionCount=15 fileNloc=450 fileTokenCount=2200 functionCcn=10 functionLength=80 functionNestingDepth=4 functionNloc=60 functionParameterCount=6 functionTokenCount=240";
const hasTsd = existsSync("next-env.d.ts") && existsSync("next-env.test-d.ts");
const bunLineTotals =
  /(?:^|\n)\s*[│|]\s*Lines\s*[│|]\s*([\d.]+)\s*%\s*[│|]\s*([\d,]+)\s*[│|]\s*[\d,]+\s*[│|]\s*([\d,]+)\s*[│|]/u;
const metricStep = step.createMetricCommandStepFactory({
  defaults: { cmd: "bun", serialGroup: "coverage-tests" },
  /**
   * Resolves a metric configuration into a line-hit post-processor.
   * @param metric - The metric configuration supplied by the check-suite step.
   * @returns The line-hit ratio resolver configured for source files.
   */
  resolve: (metric) =>
    postProcess.createLineHitRatioResolver({
      includedPaths: ["src"],
      ...metric,
    }),
});
const kinds = {
  architecture: { factory: quality.defineArchitectureStep },
  command: { factory: step.defineStep },
  commands: { group: "command" },
  complexity: { factory: quality.defineComplexityStep },
  "file-scan": { factory: step.defineGitFileScanStep },
  "imported-list": { factory: step.defineImportedClassListStep },
  lint: { defaults: { handler: "lint" }, factory: step.defineStep },
  metric: { factory: metricStep },
};

export default [
  { paths },
  { kinds },
  {
    items: {
      knip: "knip --config knip.json --cache",
      madge: {
        args: ["madge@8", ...args("--circular --extensions ts,tsx"), ...roots],
        failMsg: "circular dependencies found",
        outputFilter: {
          pattern: "\\b\\d+\\s+warnings?\\b",
          type: "stripLines",
        },
        summary: {
          default: "circular dependency check completed",
          none: {
            literal: "0 circular dependencies",
            regex: "No circular dependency found",
          },
          total: {
            match: "{1} circular dependencies",
            regex: "Found\\s+(\\d+)\\s+circular\\s+dependenc",
          },
        },
      },
    },
    kind: "commands",
  },
  {
    config: {
      discovery: { ...discovery, rootDirectories: roots },
      policy: { infer: true },
      rules: {
        "broad-barrel-surface": { maxReExports: 12 },
        "central-surface-budget": { maxExports: 66 },
        "dependency-policy-coverage": { enabled: true },
        "dependency-policy-cycle": { enabled: true },
        "dependency-policy-fan-out": { maxDependencies: 5 },
        "directory-depth": { maxDepth: 3 },
        "junk-drawer-file": {
          fileNamePatterns: args("*helper* *runtime* *util* *support*"),
        },
        "mixed-file-name-case": {
          enabled: true,
          ignoreFileGlobs: ["index.ts"],
        },
        "public-surface-re-export-chain": { allow: false },
        "public-surface-wildcard-export": { maxWildcardExports: 0 },
        "repeated-deep-import": { minImporters: 3 },
        "shared-home": { names: ["types", "contracts", "utils"] },
        "sibling-import-cohesion": { maxSiblingImports: 7 },
        "too-many-internal-dependencies": { maxImports: 12 },
        "type-only-policy-import": { enabled: true },
      },
    },
    failMsg: "architecture violations found",
    kind: "architecture",
  },
  {
    classExport: "PurgeCSS",
    cwdPathLists: {
      content: "src/components/components.css",
      css: "src/app/globals.css",
    },
    enabledPaths: "src/app/globals.css",
    failItemPrefix: "unused",
    failMsg: "unused CSS selectors found",
    failSummary: "found {count} unused CSS selector(s)",
    importSpecifier: "purgecss",
    includePrefix: ".",
    input: { rejected: true },
    key: "purgecss",
    kind: "imported-list",
    method: "purge",
    passMessage: "no unused CSS selectors found\n",
    regexListPaths: { "safelist.greedy": "^dark$ ^motion-profile-" },
    resultPath: "0.rejected",
  },
  {
    command: "bunx",
    fallbackArgs: "secretlint **/* --secretlintignore .secretlintignore",
    fileArgs: "secretlint --no-glob --secretlintignore .secretlintignore",
    key: "secretlint",
    kind: "file-scan",
    noFilesMessage: "No tracked or non-ignored files matched for secretlint\n",
  },
  {
    items: {
      "@0xts/gitleaks-cli": {
        args: [
          "@0xts/gitleaks-cli",
          ...args("detect -s"),
          roots[0] ?? ".",
          ...args("--no-git -c .gitleaks.toml"),
        ],
      },
      audit: {
        args: "audit",
        cmd: "bun",
        failMsg: "bun audit failed",
      },
      semgrep: { args: withRoots(command.semgrep), cmd: "semgrep" },
    },
    kind: "commands",
  },
  {
    items: {
      prettier: command.prettier,
      tsc: {
        args: "tsc --noEmit",
        failMsg: "typecheck failed",
        key: "types",
        summary: {
          count: "{count} TypeScript errors",
          regex: ":\\s+error\\s+TS\\d+:",
        },
      },
      tsd: {
        args: "tsd --typings next-env.d.ts --files next-env.test-d.ts",
        enabled: hasTsd,
      },
      "type-coverage": {
        args: "type-coverage --at-least {typeCoverageThreshold} --cache --cache-directory .cache/type-coverage",
        failMsg: "type coverage below threshold",
        summary: {
          default: "type coverage completed",
          match: "{3}% ({1}/{2}) · threshold {typeCoverageThreshold}%",
          regex: "\\((\\d+)\\s*/\\s*(\\d+)\\)\\s*([\\d.]+)%",
        },
        tokens: { typeCoverageThreshold: 98 },
      },
    },
    kind: "commands",
  },
  {
    args: command.lint,
    concurrencyArgs: "--concurrency",
    concurrencyEnvVar: "CHECK_SUITE_LINT_CONCURRENCY",
    key: "eslint",
    kind: "lint",
    summary: {
      match: "{1} problems ({2} errors, {3} warnings)",
      regex:
        "[✖xX]\\s+(\\d+)\\s+problems?\\s*\\((\\d+)\\s+errors?,\\s*(\\d+)\\s+warnings?\\)",
    },
  },
  {
    config: {
      analyzer: quality.createCsvSpawnComplexityAdapter({
        baseArgs: ["--csv"],
        columnMap: complexityColumns,
        command: "lizard",
        failureLabel: "complexity",
        installHint:
          "install a lizard executable on PATH (for example: pipx install lizard)",
      }),
      excludedPaths: ["src/components/ui/**"],
      targets: roots,
      thresholds: complexityThresholds,
    },
    failMsg: "complexity limits exceeded",
    key: "complexity",
    kind: "complexity",
    summary: {
      default: "complexity check completed",
      match: "{1} function violations · {2} file violations",
      regex:
        "complexity:\\s+(\\d+)\\s+function violations\\s+·\\s+(\\d+)\\s+file violations",
    },
  },
  {
    args: "jscpd --config .jscpd.json",
    failMsg: "duplicates found",
    key: "jscpd",
    kind: "command",
    summary: {
      clones: { match: "{1} clones", regex: "Found\\s+(\\d+)\\s+clones?" },
      default: "no duplicate stats detected",
      totals: {
        cellSep: "│",
        regex: "│ Total:",
        tableRow: "{4} clones · {5} lines · {6} tokens · {1} files",
      },
    },
  },
  {
    allowSuiteFlagArgs: true,
    args: command.unit,
    ensureDirs: ["coverage"],
    failMsg: "",
    key: "junit",
    kind: "metric",
    metric: {
      metricLabel: "unit coverage",
      metricPath: "{unitLineHitReportPath}",
      reportPath: "{unitExecutionReportPath}",
      threshold: 85,
    },
    timeoutEnvVar: "CHECK_TEST_COMMAND_TIMEOUT_MS",
    timeoutMs: 500000,
    tokens: { lineCoverageThreshold: 85, testTimeoutMs: 5000 },
  },
  {
    allowSuiteFlagArgs: true,
    args: command.e2e,
    enabled: hasPackageScript("test:e2e:coverage"),
    ensureDirs: ["coverage/playwright"],
    failMsg: "playwright e2e failed",
    key: "playwright",
    kind: "metric",
    metric: {
      metricLabel: "e2e coverage",
      metricPath: "{e2eLineHitReportPath}",
      parseConsoleTotalsPattern: bunLineTotals,
      reportPath: "{e2eExecutionReportPath}",
      threshold: 55,
    },
    timeoutDrainMs: 20000,
    timeoutEnvVar: "CHECK_PLAYWRIGHT_TIMEOUT_MS",
    timeoutMs: 500000,
    tokens: { lineCoverageThreshold: 55 },
  },
  { suite: { timeoutEnvVar: "CHECK_SUITE_TIMEOUT_MS", timeoutMs: 500000 } },
];
