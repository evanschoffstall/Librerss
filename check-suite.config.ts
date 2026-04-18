import type { GitFileScanOptions } from "check-suite/step";
import type {
  Command,
  InlineTypeScriptConfig,
  InlineTypeScriptContext,
  InlineTypeScriptPostProcessContext,
  PostProcessMessage,
  PostProcessSection,
  ProcessedCheck,
  StepConfig,
  StepPostProcessResult,
  Summary,
} from "check-suite/types";

import { hasPackageScript } from "check-suite/config";
import { defineCheckSuiteConfig } from "check-suite/config-schema";
import {
  createSpawnComplexityAdapter,
  discoverDefaultCodeRoots,
  parseCsvComplexityRows,
  runArchitectureCheck,
  runComplexityCheck,
} from "check-suite/quality";
import { createSafeRegExp, isSafeRegExpPattern } from "check-suite/regex";
import { defineStep, runGitFileScan } from "check-suite/step";

interface ArchitectureCodeTargetsConfig {
  declarationFilePatterns: string[];
  includePatterns: string[];
  resolutionEntrypointNames: string[];
  resolutionExtensions: string[];
  testFilePatterns: string[];
}
interface CoverageCommandStepOptions {
  allowSuiteFlagArgs?: boolean;
  args: string[];
  cmd: string;
  coverage: CoverageOptions;
  defaultThreshold: number;
  enabled?: boolean;
  ensureDirs?: string[];
  failMsg?: string;
  key: string;
  label: string;
  postProcess?: InlineTypeScriptConfig<
    InlineTypeScriptPostProcessContext,
    StepPostProcessResult
  >;
  serialGroup?: string;
  timeoutDrainMs?: number | string;
  timeoutEnvVar?: string;
  timeoutMs?: number | string;
  tokens?: Record<string, number | string>;
}
interface CoverageOptions {
  excludedFiles?: string[];
  excludedPaths?: string[];
  includedPaths?: string[];
  label?: string;
  path?: string;
  reportPath?: string;
  threshold?: number | string;
}
interface CoverageReportPostProcessOptions {
  defaultThreshold: number;
  parseConsoleCoverage?: (output: string) => CoverageTotals | null;
  readExecutionReport: (
    reportPath: string,
    commandOutput: string,
    existsSync: InlineTypeScriptPostProcessContext["existsSync"],
    readFileSync: InlineTypeScriptPostProcessContext["readFileSync"],
  ) => ExecutionReport;
}
interface CoverageState {
  coverageExcludedFiles: Set<string>;
  coverageExcludedPaths: string[];
  coverageIncludedPaths: string[];
  coverageLabel: string;
  coveragePath: string;
  coverageThreshold: number;
  reportPath: string;
}
interface CoverageStepOptions {
  enabled?: boolean;
  failMsg?: string;
  parseConsoleCoverage?: (output: string) => CoverageTotals | null;
  reportDirs?: string[];
  timeoutDrainMs?: number | string;
  timeoutEnvVar?: string;
  timeoutMs?: number | string;
  tokens?: Record<string, number | string>;
}
interface CoverageTotals {
  covered: number;
  found: number;
  pct: number;
}
interface ExecutionReport {
  failed: number;
  failedItems: string[];
  passed: number;
  skipped: number;
  skippedItems: string[];
}
type PatternSummary = Extract<Summary, { type: "pattern" }>;
type PurgeCssCheckResult =
  | { kind: "invalid-safelist"; message: string }
  | { kind: "ok"; unusedSelectors: string[] };
interface PurgeCssConfig {
  contentGlobs: string[];
  cssFiles: string[];
  safelists: string[];
  selectorPrefix: string;
}

// ── Helper functions ──────────────────────────────────────────────────────────
const BUN_LINE_COVERAGE_PATTERN =
  /(?:^|\n)\s*[│|]\s*Lines\s*[│|]\s*([\d.]+)\s*%\s*[│|]\s*([\d,]+)\s*[│|]\s*[\d,]+\s*[│|]\s*([\d,]+)\s*[│|]/u;
interface CollectLineCoverageOptions {
  coveragePath: string;
  excludedFiles: ReadonlySet<string>;
  excludedPaths: string[];
  existsSync: InlineTypeScriptPostProcessContext["existsSync"];
  includedPaths: string[];
  readFileSync: InlineTypeScriptPostProcessContext["readFileSync"];
}

interface CoverageCheckResultInput {
  coverageLabel: string;
  coveragePath?: string;
  coverageThreshold: number;
  totals: CoverageTotals | null;
}
interface PurgeCssOptions {
  config: PurgeCssConfig;
  cwd: string;
  importModule: (specifier: string) => Promise<unknown>;
  joinPath: InlineTypeScriptContext["join"];
}

/**
 * Analyze the purge css.
 * @param options - The options used to analyze the purge css.
 * @returns The purge css.
 */
async function analyzePurgeCss(
  options: PurgeCssOptions,
): Promise<PurgeCssCheckResult> {
  const { config, cwd, importModule, joinPath } = options;
  if (!config.safelists.every((pattern) => isSafeRegExpPattern(pattern)))
    return {
      kind: "invalid-safelist",
      message: "purgecss config contains an unsafe safelist pattern\n",
    };
  const compiledSafelists = config.safelists.map((pattern) =>
      createSafeRegExp(pattern),
    ),
    safeSelectorPattern =
      compiledSafelists.length > 0
        ? createSafeRegExp(
            compiledSafelists.map((pattern) => pattern.source).join("|"),
          )
        : null;
  const purgeCssModule = (await importModule("purgecss")) as {
    PurgeCSS: new () => {
      purge: (options: {
        content: string[];
        css: string[];
        rejected: boolean;
        safelist: { greedy: RegExp[] };
      }) => Promise<{ rejected?: string[] }[]>;
    };
  };
  const [result] = await new purgeCssModule.PurgeCSS().purge({
    content: config.contentGlobs.map((file) => joinPath(cwd, file)),
    css: config.cssFiles.map((file) => joinPath(cwd, file)),
    rejected: true,
    safelist: { greedy: compiledSafelists },
  });
  return {
    kind: "ok",
    unusedSelectors: Array.isArray(result.rejected)
      ? result.rejected.filter(
          (selector) =>
            selector.startsWith(config.selectorPrefix) &&
            !(safeSelectorPattern ? safeSelectorPattern.test(selector) : false),
        )
      : [],
  };
}
/**
 * Append the coverage check result.
 * @param input - The input used to append the coverage check result.
 * @param messages - The messages.
 * @param extraChecks - The extra checks.
 * @returns Whether coverage check result.
 */
function appendCoverageCheckResult(
  input: CoverageCheckResultInput,
  messages: PostProcessMessage[],
  extraChecks: ProcessedCheck[],
): boolean {
  if (!input.totals) {
    messages.push({
      text: `Coverage report not found: ${input.coveragePath ?? "(unset)"}`,
      tone: "fail",
    });
    extraChecks.push({
      details: `0.00% (0/0) · threshold ${input.coverageThreshold.toFixed(1)}%`,
      label: input.coverageLabel,
      status: "fail",
    });
    return true;
  }
  const status: "fail" | "pass" =
    input.totals.found > 0 && input.totals.pct >= input.coverageThreshold
      ? "pass"
      : "fail";
  extraChecks.push({
    details: `${input.totals.pct.toFixed(2)}% (${input.totals.covered}/${input.totals.found}) · threshold ${input.coverageThreshold.toFixed(1)}%`,
    label: input.coverageLabel,
    status,
  });
  if (input.totals.found === 0)
    messages.push({
      text: "No executable lines found in coverage report",
      tone: "fail",
    });
  return status === "fail";
}
/**
 * Append the execution result sections.
 * @param executionReport - The execution report.
 * @param sections - The sections.
 * @param failedTitle - The failed title.
 * @param skippedTitle - The skipped title.
 * @returns Whether execution result sections.
 */
function appendExecutionResultSections(
  executionReport: Pick<ExecutionReport, "failedItems" | "skippedItems">,
  sections: PostProcessSection[],
  failedTitle: string,
  skippedTitle: string,
): boolean {
  let hasFailures = false;
  if (executionReport.failedItems.length > 0) {
    sections.push({
      items: executionReport.failedItems,
      title: failedTitle,
      tone: "fail",
    });
    hasFailures = true;
  }
  if (executionReport.skippedItems.length > 0)
    sections.push({
      items: executionReport.skippedItems,
      title: skippedTitle,
      tone: "warn",
    });
  return hasFailures;
}
/**
 * Append the missing report message.
 * @param messages - The messages.
 * @param reportPath - The report path.
 */
function appendMissingReportMessage(
  messages: PostProcessMessage[],
  reportPath?: string,
): void {
  messages.push({
    text: `Report file not found: ${reportPath ?? "(unset)"}`,
    tone: "fail",
  });
}
/**
 * Build the common coverage state.
 * @param data - The data.
 * @param resolveTokenString - The callback that token string.
 * @param defaultThreshold - The default threshold value.
 * @returns The common coverage state.
 */
function buildCommonCoverageState(
  data: Record<string, unknown>,
  resolveTokenString: (value: string) => string,
  defaultThreshold: number,
): CoverageState {
  const coverageIncludedPaths = resolveCoverageMatchers(
      data.coverageIncludedPaths,
      [],
      resolveTokenString,
    ),
    coverageExcludedFiles = new Set(
      resolveCoverageMatchers(
        data.coverageExcludedFiles,
        coverageIncludedPaths,
        resolveTokenString,
      ),
    ),
    coverageExcludedPaths = resolveCoverageMatchers(
      data.coverageExcludedPaths,
      coverageIncludedPaths,
      resolveTokenString,
    );
  return {
    coverageExcludedFiles,
    coverageExcludedPaths,
    coverageIncludedPaths,
    coverageLabel:
      typeof data.coverageLabel === "string" ? data.coverageLabel : "coverage",
    coveragePath:
      typeof data.coveragePath === "string"
        ? resolveTokenString(data.coveragePath)
        : "",
    coverageThreshold:
      typeof data.coverageThreshold === "number"
        ? data.coverageThreshold
        : typeof data.coverageThreshold === "string" &&
            Number.isFinite(
              Number.parseFloat(resolveTokenString(data.coverageThreshold)),
            )
          ? Number.parseFloat(resolveTokenString(data.coverageThreshold))
          : defaultThreshold,
    reportPath:
      typeof data.reportPath === "string"
        ? resolveTokenString(data.reportPath)
        : "",
  };
}
/**
 * Build the console only execution report.
 * @param commandOutput - The command output.
 * @returns The console only execution report.
 */
function buildConsoleOnlyExecutionReport(
  commandOutput: string,
): ExecutionReport {
  return {
    failed: parseConsoleCount(commandOutput, "failed"),
    failedItems: [],
    passed: parseConsoleCount(commandOutput, "passed"),
    skipped: parseConsoleCount(commandOutput, "skipped"),
    skippedItems: [],
  };
}
/**
 * Build the coverage report post process.
 * @param options - The options used to build the coverage report post process.
 * @returns The coverage report post process.
 */
function buildCoverageReportPostProcess(
  options: CoverageReportPostProcessOptions,
) {
  return ({
    command,
    data,
    displayOutput,
    existsSync,
    helpers,
    readFileSync,
    resolveTokenString,
  }: InlineTypeScriptPostProcessContext): StepPostProcessResult => {
    const coverageState = buildCommonCoverageState(
      data,
      resolveTokenString,
      options.defaultThreshold,
    );
    const extraChecks: NonNullable<StepPostProcessResult["extraChecks"]> = [],
      messages: NonNullable<StepPostProcessResult["messages"]> = [],
      sections: NonNullable<StepPostProcessResult["sections"]> = [];
    const coverageTotals = resolveCoverageTotals(
        options,
        coverageState,
        displayOutput,
        messages,
        existsSync,
        readFileSync,
      ),
      executionReport = options.readExecutionReport(
        coverageState.reportPath,
        displayOutput,
        existsSync,
        readFileSync,
      ),
      reportExists =
        Boolean(coverageState.reportPath) &&
        existsSync(coverageState.reportPath);
    let status: "fail" | "pass" = command.exitCode === 0 ? "pass" : "fail";
    if (!reportExists)
      status = resolveMissingReportStatus(
        options,
        executionReport,
        messages,
        coverageState.reportPath,
        status,
      );
    else if (
      appendExecutionResultSections(
        executionReport,
        sections,
        "Failed tests",
        "Skipped tests",
      )
    )
      status = "fail";
    if (
      appendCoverageCheckResult(
        {
          coverageLabel: coverageState.coverageLabel,
          coveragePath: coverageState.coveragePath,
          coverageThreshold: coverageState.coverageThreshold,
          totals: coverageTotals,
        },
        messages,
        extraChecks,
      )
    )
      status = "fail";
    return {
      extraChecks,
      messages,
      output: helpers.compactDomAssertionNoise(displayOutput),
      sections,
      status,
      summary: buildExecutionSummary(
        executionReport,
        command.exitCode,
        coverageTotals,
      ),
    };
  };
}
/**
 * Build the execution summary.
 * @param executionReport - The execution report.
 * @param exitCode - The exit code.
 * @param coverageTotals - The coverage totals.
 * @returns The execution summary.
 */
function buildExecutionSummary(
  executionReport: Pick<ExecutionReport, "failed" | "passed" | "skipped">,
  exitCode: number,
  coverageTotals: CoverageTotals | null,
): string {
  return `${executionReport.passed} passed · ${executionReport.failed} failed · ${executionReport.skipped} skipped${formatExecutionSummaryCoverage(coverageTotals)}${exitCode === 0 ? "" : ` · runner exit ${exitCode}`}`;
} /**
 * Process the collect case results.
 * @param report - The report.
 * @param resultType - The result type.
 * @returns The collect case results.
 */
function collectCaseResults(
  report: string,
  resultType: "failed" | "skipped",
): string[] {
  const collected: string[] = [];
  for (const match of report.matchAll(
    /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g,
  )) {
    const body = match[0].endsWith("/>") ? "" : match[2];
    if (!matchesResultType(body, resultType)) continue;
    collected.push(formatCaseResult(match, body));
  }
  return collected;
}

/**
 * Process the collect line coverage.
 * @param options - The options used to process the collect line coverage.
 * @returns The collect line coverage.
 */
function collectLineCoverage(
  options: CollectLineCoverageOptions,
): CoverageTotals | null {
  if (!options.coveragePath || !options.existsSync(options.coveragePath))
    return null;
  const lineHitCounts = new Map<string, number>();
  let activeFile = "",
    includeActiveFile = false;
  for (const line of options
    .readFileSync(options.coveragePath, "utf8")
    .split(/\r?\n/u)) {
    if (line.startsWith("SF:")) {
      activeFile = normalizeCoverageFilePath(line.slice(3));
      includeActiveFile = shouldIncludeCoverageFile(
        activeFile,
        options.includedPaths,
        options.excludedFiles,
        options.excludedPaths,
      );
      continue;
    }
    if (!includeActiveFile || !activeFile || !line.startsWith("DA:")) continue;
    const hitCount = Number.parseInt(line.slice(line.lastIndexOf(",") + 1), 10),
      lineNumber = line.slice(3, line.lastIndexOf(","));
    if (!lineNumber || !Number.isFinite(hitCount)) continue;
    const lineKey = `${activeFile}:${lineNumber}`,
      previous = lineHitCounts.get(lineKey);
    if (previous === undefined || hitCount > previous)
      lineHitCounts.set(lineKey, hitCount);
  }
  let covered = 0,
    found = 0;
  for (const hitCount of lineHitCounts.values()) {
    found += 1;
    if (hitCount > 0) covered += 1;
  }
  return { covered, found, pct: found > 0 ? (covered / found) * 100 : 0 };
}
/**
 * Create the coverage step.
 * @param key - The key.
 * @param args - The args.
 * @param coverage - The coverage.
 * @param defaultThreshold - The default threshold value.
 * @param options - The options used to create the coverage step.
 * @returns The coverage step.
 */
function createCoverageStep(
  key: string,
  args: string[],
  coverage: CoverageOptions,
  defaultThreshold: number,
  options: CoverageStepOptions = {},
): StepConfig {
  return defineCoverageCommandStep({
    allowSuiteFlagArgs: key === "junit",
    args,
    cmd: "bun",
    coverage,
    defaultThreshold,
    enabled: options.enabled,
    ensureDirs: options.reportDirs,
    failMsg: options.failMsg,
    key,
    label: key,
    postProcess: {
      source: buildCoverageReportPostProcess({
        defaultThreshold,
        parseConsoleCoverage: options.parseConsoleCoverage,
        readExecutionReport: parseJunitExecutionReport,
      }),
    },
    serialGroup: "coverage-tests",
    timeoutDrainMs: options.timeoutDrainMs,
    timeoutEnvVar: options.timeoutEnvVar,
    timeoutMs: options.timeoutMs,
    tokens: options.tokens,
  });
}
/**
 * Process the define coverage command step.
 * @param input - The input used to process the define coverage command step.
 * @returns The define coverage command step.
 */
function defineCoverageCommandStep(
  input: CoverageCommandStepOptions,
): StepConfig {
  const step = defineStep({
    allowSuiteFlagArgs: input.allowSuiteFlagArgs,
    args: input.args,
    cmd: input.cmd,
    enabled: input.enabled ?? true,
    ensureDirs: input.ensureDirs,
    failMsg: input.failMsg ?? `${input.label} failed`,
    key: input.key,
    label: input.label,
    serialGroup: input.serialGroup,
    timeoutDrainMs: input.timeoutDrainMs,
    timeoutEnvVar: input.timeoutEnvVar,
    timeoutMs: input.timeoutMs,
    tokens: input.tokens,
  });
  if (input.postProcess)
    step.postProcess = {
      data: {
        coverageExcludedFiles: input.coverage.excludedFiles ?? [],
        coverageExcludedPaths: input.coverage.excludedPaths ?? [],
        coverageIncludedPaths: input.coverage.includedPaths ?? ["src"],
        coverageLabel: input.coverage.label ?? "coverage",
        coveragePath: input.coverage.path ?? "",
        coverageThreshold: input.coverage.threshold ?? input.defaultThreshold,
        reportPath: input.coverage.reportPath ?? "",
        ...(input.postProcess.data ?? {}),
      },
      source: input.postProcess.source,
    };
  return step;
}
/**
 * Process the format case result.
 * @param match - The match.
 * @param body - The body.
 * @returns The format case result.
 */
function formatCaseResult(match: RegExpMatchArray, body: string): string {
  const failure = readXmlAttributes(
      /<(?:failure|error)\b([^>]*)>/.exec(body)?.[1] ?? "",
    ),
    test = readXmlAttributes(match[1]);
  return `${test.file ?? "unknown-file"}${test.line ? `:${test.line}` : ""} - ${test.classname ? `${test.classname} > ` : ""}${test.name ?? "(unnamed test)"}${failure.message ? ` [${failure.message}]` : ""}`;
}
/**
 * Process the format execution summary coverage.
 * @param coverageTotals - The coverage totals.
 * @returns The format execution summary coverage.
 */
function formatExecutionSummaryCoverage(
  coverageTotals: CoverageTotals | null,
): string {
  if (!coverageTotals) return " · coverage missing";
  return ` · coverage ${coverageTotals.pct.toFixed(2)}% (${coverageTotals.covered}/${coverageTotals.found})`;
}
/**
 * Process the format unused selector output.
 * @param unusedSelectors - The unused selectors.
 * @returns The format unused selector output.
 */
function formatUnusedSelectorOutput(unusedSelectors: string[]): string {
  return `${unusedSelectors.map((selector) => `  unused: ${selector}`).join("\n")}\nfound ${unusedSelectors.length} unused CSS selector(s)\n`;
}
/**
 * Process the matches coverage path.
 * @param filePath - The file path.
 * @param matcherPath - The matcher path.
 * @returns Whether matches coverage path.
 */
function matchesCoveragePath(filePath: string, matcherPath: string): boolean {
  return filePath === matcherPath || filePath.startsWith(`${matcherPath}/`);
}
/**
 * Process the matches result type.
 * @param body - The body.
 * @param resultType - The result type.
 * @returns Whether matches result type.
 */
function matchesResultType(
  body: string,
  resultType: "failed" | "skipped",
): boolean {
  return resultType === "skipped"
    ? /<skipped\b/.test(body)
    : !/<skipped\b/.test(body) &&
        (body.includes("<failure") || body.includes("<error"));
}
/**
 * Normalize the coverage file path.
 * @param value - The value.
 * @returns The coverage file path.
 */
function normalizeCoverageFilePath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//u, "")
    .replace(/\/$/u, "");
}
/**
 * Parse the console count.
 * @param commandOutput - The command output.
 * @param label - The label.
 * @returns The console count.
 */
function parseConsoleCount(
  commandOutput: string,
  label: "failed" | "passed" | "skipped",
): number {
  const match = (
    {
      failed: /(?:^|\n)\s*(\d+)\s+failed(?:\s|$)/i,
      passed: /(?:^|\n)\s*(\d+)\s+passed(?:\s|$)/i,
      skipped: /(?:^|\n)\s*(\d+)\s+skipped(?:\s|$)/i,
    } as const
  )[label].exec(commandOutput);
  return match ? Number.parseInt(match[1], 10) : 0;
}
/**
 * Parse the junit execution report.
 * @param reportPath - The report path.
 * @param commandOutput - The command output.
 * @param existsSync - The exists sync.
 * @param readFileSync - The read file sync.
 * @returns The junit execution report.
 */
function parseJunitExecutionReport(
  reportPath: string,
  commandOutput: string,
  existsSync: InlineTypeScriptPostProcessContext["existsSync"],
  readFileSync: InlineTypeScriptPostProcessContext["readFileSync"],
): ExecutionReport {
  if (!reportPath || !existsSync(reportPath))
    return buildConsoleOnlyExecutionReport(commandOutput);
  const report = readFileSync(reportPath, "utf8"),
    suites = readXmlAttributes(/<testsuites\b([^>]*)>/.exec(report)?.[1] ?? ""),
    failed = Number.parseInt(suites.failures ?? "0", 10),
    skipped = Number.parseInt(suites.skipped ?? "0", 10),
    totalTests = Number.parseInt(suites.tests ?? "0", 10);
  return {
    failed,
    failedItems: collectCaseResults(report, "failed"),
    passed: Math.max(0, totalTests - failed - skipped),
    skipped,
    skippedItems: collectCaseResults(report, "skipped"),
  };
}
/**
 * Parse the table line coverage.
 * @param displayOutput - The display output.
 * @param pattern - The pattern.
 * @returns The table line coverage.
 */
function parseTableLineCoverage(
  displayOutput: string,
  pattern: RegExp,
): CoverageTotals | null {
  const match = pattern.exec(displayOutput);
  return match
    ? {
        covered: Number.parseInt(match[2].replace(/,/g, ""), 10),
        found: Number.parseInt(match[3].replace(/,/g, ""), 10),
        pct: Number.parseFloat(match[1]),
      }
    : null;
}
/**
 * Process the read purge css config.
 * @param data - The data.
 * @returns The read purge css config.
 */
function readPurgeCssConfig(data: unknown): null | PurgeCssConfig {
  /**
   * Returns whether a config entry is an array of string values.
   * @param entry - Candidate value read from the config object.
   * @returns Whether the entry is a string array.
   */
  const hasStringList = (entry: unknown): entry is string[] =>
      Array.isArray(entry) && entry.every((item) => typeof item === "string"),
    value = data as null | Partial<PurgeCssConfig>;
  if (
    typeof data !== "object" ||
    data === null ||
    !hasStringList(value?.cssFiles) ||
    !hasStringList(value?.contentGlobs) ||
    !hasStringList(value?.safelists) ||
    typeof value.selectorPrefix !== "string"
  )
    return null;
  return {
    contentGlobs: value.contentGlobs,
    cssFiles: value.cssFiles,
    safelists: value.safelists,
    selectorPrefix: value.selectorPrefix,
  };
}
/**
 * Process the read xml attributes.
 * @param raw - The raw.
 * @returns The read xml attributes.
 */
function readXmlAttributes(raw: string): Partial<Record<string, string>> {
  return Object.fromEntries(
    [...raw.matchAll(/(\w+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  );
}
/**
 * Resolve the coverage matchers.
 * @param values - The values.
 * @param includePaths - The include paths.
 * @param resolveTokenString - The callback that token string.
 * @returns The coverage matchers.
 */
function resolveCoverageMatchers(
  values: unknown,
  includePaths: string[],
  resolveTokenString: (value: string) => string,
): string[] {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values.flatMap((value) => {
        if (typeof value !== "string") return [];
        const normalizedValue = normalizeCoverageFilePath(
          resolveTokenString(value),
        );
        if (!normalizedValue) return [];
        const resolved = new Set([normalizedValue]);
        for (const includePath of includePaths) {
          resolved.add(
            normalizeCoverageFilePath(`${includePath}/${normalizedValue}`),
          );
          if (normalizedValue.startsWith("../"))
            resolved.add(
              normalizeCoverageFilePath(
                `${includePath}/${normalizedValue.slice(3)}`,
              ),
            );
        }
        return [...resolved].filter(Boolean);
      }),
    ),
  ];
}
/**
 * Resolve the coverage totals.
 * @param options - The options used to resolve the coverage totals.
 * @param coverageState - The coverage state.
 * @param displayOutput - The display output.
 * @param messages - The messages.
 * @param existsSync - The exists sync.
 * @param readFileSync - The read file sync.
 * @returns The coverage totals.
 */
function resolveCoverageTotals(
  options: CoverageReportPostProcessOptions,
  coverageState: CoverageState,
  displayOutput: string,
  messages: NonNullable<StepPostProcessResult["messages"]>,
  existsSync: InlineTypeScriptPostProcessContext["existsSync"],
  readFileSync: InlineTypeScriptPostProcessContext["readFileSync"],
): CoverageTotals | null {
  if (options.parseConsoleCoverage) {
    const consoleTotals = options.parseConsoleCoverage(displayOutput),
      hasPathFilters =
        coverageState.coverageIncludedPaths.length > 0 ||
        coverageState.coverageExcludedFiles.size > 0 ||
        coverageState.coverageExcludedPaths.length > 0;
    if (consoleTotals && !hasPathFilters) return consoleTotals;
    if (!consoleTotals)
      messages.push({
        text: "Coverage summary row not found in output; falling back to LCOV artifact totals.",
        tone: "warn",
      });
  }
  return collectLineCoverage({
    coveragePath: coverageState.coveragePath,
    excludedFiles: coverageState.coverageExcludedFiles,
    excludedPaths: coverageState.coverageExcludedPaths,
    existsSync,
    includedPaths: coverageState.coverageIncludedPaths,
    readFileSync,
  });
}
/**
 * Resolve the missing report status.
 * @param options - The options used to resolve the missing report status.
 * @param executionReport - The execution report.
 * @param messages - The messages.
 * @param reportPath - The report path.
 * @param currentStatus - The current status.
 * @returns The missing report status.
 */
function resolveMissingReportStatus(
  options: CoverageReportPostProcessOptions,
  executionReport: ExecutionReport,
  messages: NonNullable<StepPostProcessResult["messages"]>,
  reportPath: string,
  currentStatus: "fail" | "pass",
): "fail" | "pass" {
  if (!options.parseConsoleCoverage) {
    appendMissingReportMessage(messages, reportPath);
    return "fail";
  }
  const anyChecksRan =
    executionReport.passed > 0 ||
    executionReport.failed > 0 ||
    executionReport.skipped > 0;
  if (!anyChecksRan) {
    appendMissingReportMessage(messages, reportPath);
    return "fail";
  }
  return executionReport.failed > 0 ? "fail" : currentStatus;
}
/**
 * Return whether should include coverage file.
 * @param filePath - The file path.
 * @param includedPaths - The included paths.
 * @param excludedFiles - The excluded files.
 * @param excludedPaths - The excluded paths.
 * @returns Whether should include coverage file.
 */
function shouldIncludeCoverageFile(
  filePath: string,
  includedPaths: string[],
  excludedFiles: ReadonlySet<string>,
  excludedPaths: string[],
): boolean {
  const normalizedFilePath = normalizeCoverageFilePath(filePath);
  const isIncluded =
    includedPaths.length === 0 ||
    includedPaths.some((matcherPath) =>
      matchesCoveragePath(normalizedFilePath, matcherPath),
    );
  return (
    isIncluded &&
    !excludedFiles.has(normalizedFilePath) &&
    !excludedPaths.some((matcherPath) =>
      matchesCoveragePath(normalizedFilePath, matcherPath),
    )
  );
}

// ── Summary helpers ───────────────────────────────────────────────────────────
/**
 * Process the pat.
 * @param defaultValue - The default value.
 * @param patterns - The patterns.
 * @returns The pat.
 */
const pat = (
  defaultValue: string,
  patterns: PatternSummary["patterns"],
): Summary => ({ default: defaultValue, patterns, type: "pattern" });
const lintSummary = pat("", [
  {
    format: "{1} problems ({2} errors, {3} warnings)",
    regex:
      "[✖xX]\\s+(\\d+)\\s+problems?\\s*\\((\\d+)\\s+errors?,\\s*(\\d+)\\s+warnings?\\)",
    type: "match",
  },
]);
const typeSummary = pat("", [
  {
    format: "{count} TypeScript errors",
    regex: ":\\s+error\\s+TS\\d+:",
    type: "count",
  },
]);
const coverageSummary = pat("type coverage completed", [
  {
    format: "{3}% ({1}/{2}) · threshold {typeCoverageThreshold}%",
    regex: "\\((\\d+)\\s*/\\s*(\\d+)\\)\\s*([\\d.]+)%",
    type: "match",
  },
]);
const lizardSummary = pat("complexity check completed", [
  {
    format: "{1} function violations · {2} file violations",
    regex:
      "complexity:\\s+(\\d+)\\s+function violations\\s+·\\s+(\\d+)\\s+file violations",
    type: "match",
  },
]);
const madgeSummary = pat("circular dependency check completed", [
  {
    format: "0 circular dependencies",
    regex: "No circular dependency found",
    type: "literal",
  },
  {
    format: "{1} circular dependencies",
    regex: "Found\\s+(\\d+)\\s+circular\\s+dependenc",
    type: "match",
  },
]);
const jscpdSummary = pat("no duplicate stats detected", [
  {
    cellSep: "│",
    format: "{4} clones · {5} lines · {6} tokens · {1} files",
    regex: "│ Total:",
    type: "table-row",
  },
  { format: "{1} clones", regex: "Found\\s+(\\d+)\\s+clones?", type: "match" },
]);

// ── Step declarations ─────────────────────────────────────────────────────────

const knip = defineStep({
  args: ["knip", "--config", "knip.json", "--cache"],
  failMsg: "knip failed",
  label: "knip",
});
const architecture = defineStep({
  data: {
    discovery: {
      ...(() => {
        const discovery = {
          codeTargets: {
            declarationFilePatterns: [
              "**/*.d.cjs",
              "**/*.d.js",
              "**/*.d.jsx",
              "**/*.d.mjs",
              "**/*.d.ts",
              "**/*.d.tsx",
            ],
            includePatterns: [
              "**/*.cjs",
              "**/*.js",
              "**/*.jsx",
              "**/*.mjs",
              "**/*.ts",
              "**/*.tsx",
            ],
            resolutionEntrypointNames: ["index", "main", "mod"],
            resolutionExtensions: [
              ".cjs",
              ".js",
              ".jsx",
              ".mjs",
              ".ts",
              ".tsx",
            ],
            testFilePatterns: ["**/*.spec.*", "**/*.test.*"],
          } satisfies ArchitectureCodeTargetsConfig,
          ignoredDirectories: [
            "**/.*",
            "**/__generated__",
            "**/build",
            "**/coverage",
            "**/dist",
            "**/generated",
            "**/node_modules",
            "**/out",
            "**/scripts",
            "**/tmp",
            "**/ui",
            "**/vendor",
          ],
          testDirectories: [
            "**/__fixtures__",
            "**/__mocks__",
            "**/__tests__",
            "**/fixtures",
            "**/mocks",
            "**/test",
            "**/tests",
          ],
        } as const;
        const { directories } = discoverDefaultCodeRoots(
          process.cwd(),
          discovery,
        );
        return {
          ...discovery,
          rootDirectories: directories.includes("src") ? ["src"] : directories,
        };
      })(),
    },
    policy: {
      dependencyPolicies: [],
      infer: true,
    },
    rules: {
      "broad-barrel-surface": { maxReExports: 12 },
      "central-surface-budget": { maxExports: 66 },
      "dependency-policy-coverage": { enabled: true },
      "dependency-policy-cycle": { enabled: true },
      "dependency-policy-fan-out": { maxDependencies: 5 },
      "directory-depth": { maxDepth: 3 },
      "junk-drawer-file": {
        fileNamePatterns: [
          "*helper*",
          "*Helper*",
          "*runtime*",
          "*Runtime*",
          "*util*",
          "*Util*",
          "*support*",
          "*Support*",
        ],
      },
      "mixed-file-name-case": { enabled: true, ignoreFileGlobs: ["index.ts"] },
      "public-surface-purity": {},
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
  label: "architecture",
  /**
   * Runs the architecture check with the inline TypeScript step context.
   * @param context - Inline TypeScript context for the current step execution.
   * @returns The command result consumed by the check-suite runner.
   */
  source: async (context: InlineTypeScriptContext): Promise<Command> => {
    const { cwd, data, fail, ok } = context;
    const result = await runArchitectureCheck(cwd, data);
    return result.exitCode === 0 ? ok(result.output) : fail(result.output);
  },
});
const architectureRootDirectories = (
  (
    architecture.config as InlineTypeScriptConfig<
      InlineTypeScriptContext,
      Command
    >
  ).data?.discovery as undefined | { rootDirectories?: unknown }
)?.rootDirectories;
const srcDirs = Array.isArray(architectureRootDirectories)
  ? architectureRootDirectories.filter(
      (directory): directory is string => typeof directory === "string",
    )
  : ["."];
const madge = defineStep({
  args: ["madge@8", "--circular", "--extensions", "ts,tsx", ...srcDirs],
  failMsg: "circular dependencies found",
  label: "madge",
  outputFilter: {
    pattern: "\\b\\d+\\s+warnings?\\b",
    type: "stripLines",
  },
  summary: madgeSummary,
});
const purgeCss = defineStep({
  data: {
    contentGlobs: ["src/**/*.{css,ts,tsx}"],
    cssFiles: ["src/app/globals.css"],
    safelists: ["^dark$", "^motion-profile-"],
    selectorPrefix: ".",
  } satisfies PurgeCssConfig,
  failMsg: "unused CSS selectors found",
  label: "purgecss",
  /**
   * Runs the PurgeCSS step with the inline TypeScript step context.
   * @param context - Inline TypeScript context for the current step execution.
   * @returns The command result consumed by the check-suite runner.
   */
  source: async (context: InlineTypeScriptContext) => {
    const { cwd, data, fail, importModule, join, ok } = context;
    const config = readPurgeCssConfig(data);
    if (!config) return fail("purgecss config is invalid\n");
    const result = await analyzePurgeCss({
      config,
      cwd,
      importModule,
      joinPath: join,
    });
    if (result.kind === "invalid-safelist") return fail(result.message);
    return result.unusedSelectors.length === 0
      ? ok("no unused CSS selectors found\n")
      : fail(formatUnusedSelectorOutput(result.unusedSelectors));
  },
});
const secretlint = defineStep({
  failMsg: "secretlint failed",
  label: "secretlint",
  /**
   * Runs secretlint against tracked files from the current working tree.
   * @param context - Inline TypeScript context for the current step execution.
   * @returns The command result consumed by the check-suite runner.
   */
  source: async (context: InlineTypeScriptContext) =>
    runGitFileScan(context.cwd, {
      command: "bunx",
      fallbackArgs: [
        "secretlint",
        "**/*",
        "--secretlintignore",
        ".secretlintignore",
      ],
      fileArgs: [
        "secretlint",
        "--no-glob",
        "--secretlintignore",
        ".secretlintignore",
      ],
      noFilesMessage:
        "No tracked or non-ignored files matched for secretlint\n",
    } satisfies GitFileScanOptions),
});
const semgrep = defineStep({
  args: [
    "scan",
    "--config",
    "p/default",
    "--error",
    "--metrics",
    "off",
    "--exclude=tests",
    "--exclude=src/components/ui",
    "--exclude-rule=javascript.lang.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml",
    "--exclude-rule=typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml",
    "--exclude-rule=problem-based-packs.insecure-transport.js-node.bypass-tls-verification.bypass-tls-verification",
    "--quiet",
    ...srcDirs,
  ],
  cmd: "semgrep",
  failMsg: "semgrep failed",
  label: "semgrep",
});
const audit = defineStep({
  args: ["audit"],
  cmd: "bun",
  failMsg: "bun audit failed",
  label: "audit",
});
const gitleaks = defineStep({
  args: [
    "@0xts/gitleaks-cli",
    "detect",
    "-s",
    srcDirs[0] ?? ".",
    "--no-git",
    "-c",
    ".gitleaks.toml",
  ],
  failMsg: "gitleaks failed",
  label: "@0xts/gitleaks-cli",
});
const tsd = defineStep({
  args: ["tsd", "--typings", "next-env.d.ts", "--files", "next-env.test-d.ts"],
  failMsg: "tsd failed",
  label: "tsd",
});
const typeCoverage = defineStep({
  args: [
    "type-coverage",
    "--at-least",
    "{typeCoverageThreshold}",
    "--cache",
    "--cache-directory",
    ".cache/type-coverage",
  ],
  failMsg: "type coverage below threshold",
  label: "type-coverage",
  summary: coverageSummary,
  tokens: {
    typeCoverageThreshold: 98,
  },
});
const tsc = defineStep({
  args: ["tsc", "--noEmit"],
  failMsg: "typecheck failed",
  key: "types",
  label: "tsc",
  summary: typeSummary,
});
const eslint = defineStep({
  args: [
    "eslint",
    ".",
    "--cache",
    "--cache-strategy",
    "content",
    "--cache-location",
    ".cache/eslint",
    "--fix",
  ],
  concurrencyArgs: ["--concurrency"],
  concurrencyEnvVar: "CHECK_SUITE_LINT_CONCURRENCY",
  handler: "lint",
  label: "eslint",
  summary: lintSummary,
});
const prettier = defineStep({
  args: ["prettier", "-w", "src/"],
  failMsg: "prettier failed",
  label: "prettier",
});

const lizard = defineStep({
  failMsg: "complexity limits exceeded",
  label: "lizard",
  /**
   * Runs the lizard complexity step with the inline TypeScript context.
   * @param context - Inline TypeScript context for the current step execution.
   * @returns The command result consumed by the check-suite runner.
   */
  source: async (context: InlineTypeScriptContext): Promise<Command> => {
    const { fail, ok } = context;
    const result = await runComplexityCheck({
      analyzer: createSpawnComplexityAdapter({
        /**
         * Builds the lizard CLI argument list for the requested targets.
         * @param targets - Source targets that should be analyzed.
         * @param excluded - Glob patterns that should be excluded from analysis.
         * @returns CLI arguments for invoking lizard.
         */
        buildArgs: (
          targets: readonly string[],
          excluded: readonly string[],
        ) => [
          "-m",
          "lizard",
          "--csv",
          "-l",
          "typescript",
          "-l",
          "tsx",
          ...excluded.flatMap((path) => ["-x", path]),
          ...targets,
        ],
        command: "python3",
        failureLabel: "complexity",
        installHint: "python3 -m pip install lizard",
        /**
         * Parses CSV output emitted by lizard into complexity rows.
         * @param output - Raw CSV output captured from the lizard process.
         * @returns Parsed complexity rows for threshold evaluation.
         */
        parseOutput: (output: string) =>
          parseCsvComplexityRows(output, {
            ccn: 1,
            endLine: 10,
            functionName: 7,
            length: 4,
            location: 5,
            nloc: 0,
            parameterCount: 3,
            path: 6,
            startLine: 9,
            tokenCount: 2,
          }),
      }),
      excludedPaths: ["src/components/ui/**"],
      targets: srcDirs,
      thresholds: {
        // file-level
        fileCcn: 60,
        fileFunctionCount: 15,
        fileNloc: 450,
        fileTokenCount: 2_200, // function-level
        functionCcn: 10,
        functionLength: 80,
        functionNestingDepth: 4,
        functionNloc: 60,
        functionParameterCount: 6,
        functionTokenCount: 240,
      },
    });
    return result.exitCode === 0 ? ok(result.output) : fail(result.output);
  },
  summary: lizardSummary,
});
const jscpd = defineStep({
  args: ["jscpd", "--config", ".jscpd.json"],
  failMsg: "duplicates found",
  label: "jscpd",
  summary: jscpdSummary,
});
const junit = createCoverageStep(
  "junit",
  [
    "test",
    "--timeout={testTimeoutMs}",
    "--coverage",
    "--coverage-reporter=lcov",
    "--coverage-dir=coverage",
    "--reporter=junit",
    "--reporter-outfile={junitPath}",
  ],
  {
    includedPaths: ["src"],
    label: "junit coverage",
    path: "{lcovPath}",
    reportPath: "{junitPath}",
  },
  85,
  {
    failMsg: "",
    reportDirs: ["coverage"],
    timeoutEnvVar: "CHECK_TEST_COMMAND_TIMEOUT_MS",
    timeoutMs: 120_000,
    tokens: { lineCoverageThreshold: 85, testTimeoutMs: 5_000 },
  },
);
const playwright = createCoverageStep(
  "playwright",
  ["run", "test:e2e:coverage"],
  {
    includedPaths: ["src"],
    label: "playwright coverage",
    path: "{playwrightLcovPath}",
    reportPath: "{playwrightJunitPath}",
  },
  55,
  {
    enabled: hasPackageScript("test:e2e:coverage"),
    failMsg: "playwright e2e failed",
    /**
     * Parses the Playwright coverage summary emitted to stdout.
     * @param output - Console output captured from the Playwright coverage run.
     * @returns Parsed line-coverage totals when the summary table is present.
     */
    parseConsoleCoverage: (output) =>
      parseTableLineCoverage(output, BUN_LINE_COVERAGE_PATTERN),
    reportDirs: ["coverage/playwright"],
    timeoutDrainMs: 20_000,
    timeoutEnvVar: "CHECK_PLAYWRIGHT_TIMEOUT_MS",
    timeoutMs: 180_000,
    tokens: { lineCoverageThreshold: 55 },
  },
);

export default defineCheckSuiteConfig([
  { suite: { timeoutEnvVar: "CHECK_SUITE_TIMEOUT_MS", timeoutMs: 180_000 } },
  {
    paths: {
      junitPath: "coverage/test-results.xml",
      lcovPath: "coverage/lcov.info",
      playwrightJunitPath: "coverage/playwright-junit.xml",
      playwrightLcovPath: "coverage/playwright/lcov.info",
    },
  },
  knip,
  madge,
  architecture,
  purgeCss,
  secretlint,
  audit,
  semgrep,
  gitleaks,
  tsd,
  typeCoverage,
  tsc,
  eslint,
  prettier,
  lizard,
  jscpd,
  junit,
  playwright,
]);
