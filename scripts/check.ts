import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LINE_COVERAGE_THRESHOLD = 80;
const TEST_TIMEOUT_MS = 5_000;
const TEST_COMMAND_TIMEOUT_MS = 120_000;

// This should always be empty-- no exceptions.
const COVERAGE_EXCLUDED_FILES: string[] = [];

type CoverageTotals = {
  coveredLines: number;
  foundLines: number;
};

type TestResult = {
  file?: string;
  line?: string;
  suite?: string;
  name: string;
  message?: string;
};

type TestSummary = {
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  failedTests: TestResult[];
  skippedTests: TestResult[];
  exitCode: number;
};

type CoverageSummary = {
  coveredLines: number;
  foundLines: number;
  lineCoverage: number;
  exitCode: number;
};

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

const colorize = (text: string, ...codes: string[]) =>
  `${codes.join("")}${text}${ANSI.reset}`;

const divider = () => colorize("────────────────────────────────", ANSI.gray);

function logStep(label: string, timerLabel: string) {
  console.log(colorize(`\n⏱️  ${label}`, ANSI.bold, ANSI.cyan));
}

const parseAttrs = (raw: string) => {
  const attrs: Record<string, string> = {};
  const attrRegex = /(\w+)="([^"]*)"/g;

  for (const match of raw.matchAll(attrRegex)) {
    const key = match[1];
    const value = match[2];
    if (key) {
      attrs[key] = value;
    }
  }

  return attrs;
};

type ParsedTestcase = {
  rawAttrs: string;
  body: string;
};

function parseTestcases(junitXml: string): ParsedTestcase[] {
  const testcases: ParsedTestcase[] = [];
  const openTagRegex = /<testcase\b([^>]*?)(\/)?>/g;

  for (const match of junitXml.matchAll(openTagRegex)) {
    const fullTag = match[0];
    const rawAttrs = match[1] ?? "";
    const startIndex = match.index ?? -1;

    if (startIndex < 0) {
      continue;
    }

    const openTagEndIndex = startIndex + fullTag.length;
    const isSelfClosing = /\/>$/.test(fullTag);

    if (isSelfClosing) {
      testcases.push({ rawAttrs, body: "" });
      continue;
    }

    const closeTag = "</testcase>";
    const closeTagIndex = junitXml.indexOf(closeTag, openTagEndIndex);
    if (closeTagIndex < 0) {
      continue;
    }

    const body = junitXml.slice(openTagEndIndex, closeTagIndex);
    testcases.push({ rawAttrs, body });
  }

  return testcases;
}

function formatLocation(result: TestResult): string {
  const file = result.file ?? "unknown-file";
  const line = result.line ? `:${result.line}` : "";
  const suite = result.suite ? `${result.suite} > ` : "";
  return `${file}${line} - ${suite}${result.name}`;
}

function getTestSummary(reportPath: string): TestSummary {
  if (!existsSync(reportPath)) {
    console.error(
      colorize(
        `❌ [test-summary] Report file not found: ${reportPath}`,
        ANSI.red,
        ANSI.bold,
      ),
    );
    return {
      passedCount: 0,
      failedCount: 1,
      skippedCount: 0,
      failedTests: [
        {
          name: "JUnit report missing",
          message: `Report file not found: ${reportPath}`,
        },
      ],
      skippedTests: [],
      exitCode: 1,
    };
  }

  const xml = readFileSync(reportPath, "utf8");

  const skipped: TestResult[] = [];
  const failed: TestResult[] = [];
  const passed: TestResult[] = [];

  for (const { rawAttrs, body } of parseTestcases(xml)) {
    const attrs = parseAttrs(rawAttrs);

    const test: TestResult = {
      file: attrs.file,
      line: attrs.line,
      suite: attrs.classname,
      name: attrs.name ?? "(unnamed test)",
    };

    const isSkipped = /<skipped\b/.test(body);
    const isFailed = body.includes("<failure") || body.includes("<error");

    if (isSkipped) {
      skipped.push(test);
    }

    if (isFailed) {
      const failureTag = body.match(/<(?:failure|error)\b([^>]*)>/)?.[1] ?? "";
      const failureAttrs = parseAttrs(failureTag);
      failed.push({
        ...test,
        message: failureAttrs.message,
      });
    }

    if (!isSkipped && !isFailed) {
      passed.push(test);
    }
  }

  return {
    passedCount: passed.length,
    failedCount: failed.length,
    skippedCount: skipped.length,
    failedTests: failed,
    skippedTests: skipped,
    exitCode: failed.length === 0 ? 0 : 1,
  };
}

function parseLcovTotals(lcovContent: string): CoverageTotals {
  const fileLineHits = new Map<string, Map<number, number>>();
  let currentFile = "";
  let includeCurrentFile = false;

  for (const line of lcovContent.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      currentFile = line.slice(3);
      includeCurrentFile = !COVERAGE_EXCLUDED_FILES.includes(currentFile);
      if (!includeCurrentFile) {
        continue;
      }

      if (!fileLineHits.has(currentFile)) {
        fileLineHits.set(currentFile, new Map<number, number>());
      }
      continue;
    }

    if (!currentFile || !includeCurrentFile) {
      continue;
    }

    if (line.startsWith("DA:")) {
      const payload = line.slice(3);
      const commaIndex = payload.indexOf(",");
      if (commaIndex <= 0) {
        continue;
      }

      const lineNumber = Number.parseInt(payload.slice(0, commaIndex), 10);
      const hitCount = Number.parseInt(payload.slice(commaIndex + 1), 10);

      if (!Number.isFinite(lineNumber) || !Number.isFinite(hitCount)) {
        continue;
      }

      const lineMap = fileLineHits.get(currentFile);
      if (!lineMap) {
        continue;
      }

      const previousHits = lineMap.get(lineNumber) ?? 0;
      lineMap.set(lineNumber, Math.max(hitCount, previousHits));
    }
  }

  let coveredLines = 0;
  let foundLines = 0;

  for (const lineMap of Array.from(fileLineHits.values())) {
    for (const hitCount of Array.from(lineMap.values())) {
      foundLines += 1;
      if (hitCount > 0) {
        coveredLines += 1;
      }
    }
  }

  return { coveredLines, foundLines };
}

function coveragePercent(covered: number, found: number): number {
  if (found === 0) {
    return 100;
  }

  return (covered / found) * 100;
}

function getCoverageSummary(lcovPath: string): CoverageSummary {
  if (!existsSync(lcovPath)) {
    console.error(
      `${colorize("FAIL", ANSI.bold, ANSI.red)} Coverage report not found at ${lcovPath}`,
    );
    return {
      coveredLines: 0,
      foundLines: 0,
      lineCoverage: 0,
      exitCode: 1,
    };
  }

  const lcovContent = readFileSync(lcovPath, "utf8");
  const totals = parseLcovTotals(lcovContent);

  if (totals.foundLines === 0) {
    console.error(
      `${colorize("FAIL", ANSI.bold, ANSI.red)} No executable lines found in coverage report`,
    );
    return {
      coveredLines: totals.coveredLines,
      foundLines: totals.foundLines,
      lineCoverage: 0,
      exitCode: 1,
    };
  }

  const lineCoverage = coveragePercent(totals.coveredLines, totals.foundLines);
  return {
    coveredLines: totals.coveredLines,
    foundLines: totals.foundLines,
    lineCoverage,
    exitCode: lineCoverage >= LINE_COVERAGE_THRESHOLD ? 0 : 1,
  };
}

function getStaticAnalysisSummary(
  tscExit: number,
  eslintExit: number,
): { tscPassing: boolean; eslintPassing: boolean; exitCode: number } {
  const tscPassing = tscExit === 0;
  const eslintPassing = eslintExit === 0;
  return {
    tscPassing,
    eslintPassing,
    exitCode: tscPassing && eslintPassing ? 0 : 1,
  };
}

function printCompactSummary(results: {
  staticAnalysis: {
    tscPassing: boolean;
    eslintPassing: boolean;
    exitCode: number;
  };
  tests: TestSummary;
  coverage: CoverageSummary;
  testRunnerPassing: boolean;
}): number {
  const overallPassing =
    results.staticAnalysis.exitCode === 0 &&
    results.tests.exitCode === 0 &&
    results.coverage.exitCode === 0 &&
    results.testRunnerPassing;

  const statusToken = (passing: boolean) =>
    colorize(
      passing ? "PASS" : "FAIL",
      ANSI.bold,
      passing ? ANSI.green : ANSI.red,
    );

  const row = (label: string, passing: boolean, details: string) =>
    `${statusToken(passing)} ${colorize(label.padEnd(13), ANSI.bold)} ${details}`;

  logStep("Done", "none");

  if (results.tests.failedTests.length > 0) {
    console.log(`\n${colorize("Failed tests", ANSI.bold, ANSI.red)}`);
    for (const test of results.tests.failedTests) {
      const message = test.message ? ` [${test.message}]` : "";
      console.log(
        `  ${colorize("•", ANSI.red)} ${colorize(formatLocation(test), ANSI.red)}${message}`,
      );
    }
  }

  if (results.tests.skippedTests.length > 0) {
    console.log(`\n${colorize("Skipped tests", ANSI.bold, ANSI.gray)}`);
    for (const test of results.tests.skippedTests) {
      console.log(
        `  ${colorize("•", ANSI.gray)} ${colorize(formatLocation(test), ANSI.gray)}`,
      );
    }
  }

  console.log(`\n${colorize("Quality Summary", ANSI.bold, ANSI.cyan)}`);
  console.log(divider());
  console.log(
    row(
      "Tests",
      results.tests.exitCode === 0,
      `${results.tests.passedCount} passed · ${results.tests.failedCount} failed · ${results.tests.skippedCount} skipped`,
    ),
  );
  console.log(
    row(
      "Coverage",
      results.coverage.exitCode === 0,
      `${results.coverage.lineCoverage.toFixed(2)}% (${results.coverage.coveredLines}/${results.coverage.foundLines}) · threshold ${LINE_COVERAGE_THRESHOLD.toFixed(1)}%`,
    ),
  );
  console.log(row("Types", results.staticAnalysis.tscPassing, ""));
  console.log(row("Lint", results.staticAnalysis.eslintPassing, ""));
  console.log(divider());
  console.log(
    row(
      "Overall",
      overallPassing,
      overallPassing ? "all checks passed" : "one or more checks failed",
    ),
  );
  console.log(divider());

  return overallPassing ? 0 : 1;
}

async function runCommand(
  command: string,
  args: string[],
  timeoutMs?: number,
): Promise<{ exitCode: number; timedOut: boolean }> {
  const child = Bun.spawn([command, ...args], {
    cwd: process.cwd(),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  let timedOut = false;
  const timeout =
    timeoutMs && timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          child.kill();
        }, timeoutMs)
      : null;

  const exit = await child.exited;
  if (timeout) {
    clearTimeout(timeout);
  }

  if (timedOut) {
    return { exitCode: 124, timedOut: true };
  }

  return { exitCode: exit ?? 1, timedOut: false };
}

async function main() {
  const junitPath = join(process.cwd(), "coverage", "test-results.xml");
  const lcovPath = join(process.cwd(), "coverage", "lcov.info");

  console.log(
    `\n${colorize("⏳ Please wait -- validating static analysis, tests, and coverage...", ANSI.bold, ANSI.cyan)}`,
  );

  let timedOut = false;
  let tscExit = 1;
  let eslintExit = 1;
  let testExit = 1;

  logStep(
    "Running tests",
    `${TEST_TIMEOUT_MS / 1000}s per test, ${TEST_COMMAND_TIMEOUT_MS / 1000}s process failsafe`,
  );
  {
    const testRun = await runCommand(
      "bun",
      [
        "test",
        `--timeout=${TEST_TIMEOUT_MS}`,
        "--reporter=junit",
        `--reporter-outfile=${junitPath}`,
      ],
      TEST_COMMAND_TIMEOUT_MS,
    );
    testExit = testRun.exitCode;
    timedOut = timedOut || testRun.timedOut;
  }

  if (!timedOut) {
    logStep("Running TypeScript", "none");
    const tscRun = await runCommand("tsc", ["--noEmit"]);
    tscExit = tscRun.exitCode;
    timedOut = timedOut || tscRun.timedOut;
  }

  if (!timedOut) {
    logStep("Running ESLint", "none");
    const eslintRun = await runCommand("eslint", ["."]);
    eslintExit = eslintRun.exitCode;
    timedOut = timedOut || eslintRun.timedOut;
  }

  const staticAnalysis = getStaticAnalysisSummary(tscExit, eslintExit);
  const tests = getTestSummary(junitPath);
  const coverage = getCoverageSummary(lcovPath);
  const qualityGateExit = printCompactSummary({
    staticAnalysis,
    tests,
    coverage,
    testRunnerPassing: testExit === 0,
  });

  if (timedOut) {
    console.error(
      "Check command failed: bun test exceeded the 120-second failsafe timeout. Please try again.",
    );
    process.exit(1);
  }

  if (qualityGateExit !== 0) {
    process.exit(1);
  }
}

await main();
