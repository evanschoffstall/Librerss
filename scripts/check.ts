import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LINE_COVERAGE_THRESHOLD = 80;
const TEST_TIMEOUT_MS = 5_000;
const TEST_COMMAND_TIMEOUT_MS = 120_000;

// This should always be empty-- no exceptions.
const COVERAGE_EXCLUDED_FILES: string[] = [];

type TestResult = {
  file?: string;
  line?: string;
  suite?: string;
  name: string;
  message?: string;
};
type Summary = {
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  failedTests: TestResult[];
  skippedTests: TestResult[];
  exitCode: number;
};
type Coverage = {
  coveredLines: number;
  foundLines: number;
  lineCoverage: number;
  exitCode: number;
};
type StaticAnalysis = {
  tscPassing: boolean;
  eslintPassing: boolean;
  exitCode: number;
};
type Command = { exitCode: number; timedOut: boolean; output: string };

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;
const paint = (text: string, ...codes: string[]) =>
  `${codes.join("")}${text}${ANSI.reset}`;
const divider = () => paint("────────────────────────────────", ANSI.gray);
const passFail = (ok: boolean) =>
  paint(ok ? "PASS" : "FAIL", ANSI.bold, ok ? ANSI.green : ANSI.red);
const row = (label: string, ok: boolean, details = "") =>
  `${passFail(ok)} ${paint(label.padEnd(13), ANSI.bold)} ${details}`;
const pct = (covered: number, found: number) =>
  found ? (covered / found) * 100 : 100;
const attrs = (raw: string) =>
  Object.fromEntries(
    Array.from(raw.matchAll(/(\w+)="([^"]*)"/g)).flatMap((m) =>
      m[1] ? [[m[1], m[2] ?? ""]] : [],
    ),
  );
const toTest = (a: Record<string, string>): TestResult => ({
  file: a.file,
  line: a.line,
  suite: a.classname,
  name: a.name ?? "(unnamed test)",
});
const where = ({ file, line, suite, name }: TestResult) =>
  `${file ?? "unknown-file"}${line ? `:${line}` : ""} - ${suite ? `${suite} > ` : ""}${name}`;
const staticSummary = (
  tscExit: number,
  eslintExit: number,
): StaticAnalysis => ({
  tscPassing: tscExit === 0,
  eslintPassing: eslintExit === 0,
  exitCode: tscExit === 0 && eslintExit === 0 ? 0 : 1,
});

function printStepOutput(label: string, output: string) {
  console.log(`\n${paint(label, ANSI.bold)}`);
  if (!output.trim()) {
    console.log(paint("(no output)", ANSI.gray));
    return;
  }
  for (const line of output.replace(/\s+$/g, "").split(/\r?\n/))
    console.log(line);
}

const parseTestcases = (xml: string) =>
  Array.from(
    xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g),
    (m) => ({ rawAttrs: m[1] ?? "", body: m[2] ?? "" }),
  );

function printTests(label: string, color: string, tests: TestResult[]) {
  if (!tests.length) return;
  console.log(`\n${paint(label, ANSI.bold, color)}`);
  for (const test of tests)
    console.log(
      `  ${paint("•", color)} ${paint(where(test), color)}${test.message ? ` [${test.message}]` : ""}`,
    );
}

function testSummary(reportPath: string): Summary {
  if (!existsSync(reportPath)) {
    console.error(
      paint(
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
  const failed: TestResult[] = [];
  const skipped: TestResult[] = [];
  let passedCount = 0;
  for (const { rawAttrs, body } of parseTestcases(
    readFileSync(reportPath, "utf8"),
  )) {
    const test = toTest(attrs(rawAttrs));
    const isSkipped = /<skipped\b/.test(body);
    const isFailed = body.includes("<failure") || body.includes("<error");
    if (isSkipped) skipped.push(test);
    if (isFailed)
      failed.push({
        ...test,
        message: attrs(body.match(/<(?:failure|error)\b([^>]*)>/)?.[1] ?? "")
          .message,
      });
    if (!isSkipped && !isFailed) passedCount += 1;
  }
  return {
    passedCount,
    failedCount: failed.length,
    skippedCount: skipped.length,
    failedTests: failed,
    skippedTests: skipped,
    exitCode: failed.length ? 1 : 0,
  };
}

function lcovTotals(content: string): {
  coveredLines: number;
  foundLines: number;
} {
  const hits = new Map<string, Map<number, number>>();
  let file = "";
  let include = false;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      file = line.slice(3);
      include = !COVERAGE_EXCLUDED_FILES.includes(file);
      if (include && !hits.has(file)) hits.set(file, new Map<number, number>());
      continue;
    }
    if (!include || !file || !line.startsWith("DA:")) continue;
    const [lineRaw, hitRaw] = line.slice(3).split(",");
    const lineNo = Number.parseInt(lineRaw ?? "", 10);
    const hit = Number.parseInt(hitRaw ?? "", 10);
    if (!Number.isFinite(lineNo) || !Number.isFinite(hit)) continue;
    const map = hits.get(file);
    if (!map) continue;
    map.set(lineNo, Math.max(hit, map.get(lineNo) ?? 0));
  }
  let coveredLines = 0;
  let foundLines = 0;
  for (const map of hits.values())
    for (const hit of map.values()) {
      foundLines += 1;
      if (hit > 0) coveredLines += 1;
    }
  return { coveredLines, foundLines };
}

function coverageSummary(path: string): Coverage {
  if (!existsSync(path)) {
    console.error(
      `${paint("FAIL", ANSI.bold, ANSI.red)} Coverage report not found at ${path}`,
    );
    return { coveredLines: 0, foundLines: 0, lineCoverage: 0, exitCode: 1 };
  }
  const totals = lcovTotals(readFileSync(path, "utf8"));
  if (!totals.foundLines) {
    console.error(
      `${paint("FAIL", ANSI.bold, ANSI.red)} No executable lines found in coverage report`,
    );
    return {
      coveredLines: totals.coveredLines,
      foundLines: 0,
      lineCoverage: 0,
      exitCode: 1,
    };
  }
  const lineCoverage = pct(totals.coveredLines, totals.foundLines);
  return {
    coveredLines: totals.coveredLines,
    foundLines: totals.foundLines,
    lineCoverage,
    exitCode: lineCoverage >= LINE_COVERAGE_THRESHOLD ? 0 : 1,
  };
}

function printSummary(results: {
  staticAnalysis: StaticAnalysis;
  tests: Summary;
  coverage: Coverage;
  testRunnerPassing: boolean;
}) {
  const ok =
    results.staticAnalysis.exitCode === 0 &&
    results.tests.exitCode === 0 &&
    results.coverage.exitCode === 0 &&
    results.testRunnerPassing;
  printTests("Failed tests", ANSI.red, results.tests.failedTests);
  printTests("Skipped tests", ANSI.gray, results.tests.skippedTests);
  console.log(`\n${paint("Quality Summary", ANSI.bold, ANSI.cyan)}`);
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
  console.log(row("Types", results.staticAnalysis.tscPassing));
  console.log(row("Lint", results.staticAnalysis.eslintPassing));
  console.log(divider());
  console.log(
    row("Overall", ok, ok ? "all checks passed" : "one or more checks failed"),
  );
  console.log(divider());
  return ok ? 0 : 1;
}

async function run(
  command: string,
  args: string[],
  timeoutMs?: number,
): Promise<Command> {
  const child = Bun.spawn([command, ...args], {
    cwd: process.cwd(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdoutPromise = child.stdout
    ? new Response(child.stdout).text()
    : Promise.resolve("");
  const stderrPromise = child.stderr
    ? new Response(child.stderr).text()
    : Promise.resolve("");
  let timedOut = false;
  const timeout =
    timeoutMs && timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          child.kill();
        }, timeoutMs)
      : null;
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    stdoutPromise,
    stderrPromise,
  ]);
  if (timeout) clearTimeout(timeout);
  const output = `${stdout}${stderr}`;
  return timedOut
    ? { exitCode: 124, timedOut: true, output }
    : { exitCode: exitCode ?? 1, timedOut: false, output };
}

const runStep = (
  _label: string,
  command: string,
  args: string[],
  timeoutMs?: number,
  _details?: string,
) => {
  return run(command, args, timeoutMs);
};

async function main() {
  const junitPath = join(process.cwd(), "coverage", "test-results.xml");
  const lcovPath = join(process.cwd(), "coverage", "lcov.info");
  console.log(
    `\n${paint("⏳ Please wait -- validating static analysis, tests, and coverage...", ANSI.bold, ANSI.cyan)}`,
  );

  const testRunPromise = runStep(
    "Running tests",
    "bun",
    [
      "test",
      `--timeout=${TEST_TIMEOUT_MS}`,
      "--reporter=junit",
      `--reporter-outfile=${junitPath}`,
    ],
    TEST_COMMAND_TIMEOUT_MS,
    `${TEST_TIMEOUT_MS / 1000}s per test, ${TEST_COMMAND_TIMEOUT_MS / 1000}s process failsafe`,
  );
  const typesRunPromise = runStep("Running Types", "tsc", ["--noEmit"]);
  const lintRunPromise = runStep("Running Lint", "bun", ["scripts/lint.ts"]);

  const [testRun, typesRun, lintRun] = await Promise.all([
    testRunPromise,
    typesRunPromise,
    lintRunPromise,
  ]);
  const timedOut = testRun.timedOut || typesRun.timedOut || lintRun.timedOut;

  printStepOutput("Tests", testRun.output);
  printStepOutput("Types", typesRun.output);
  printStepOutput("Lint", lintRun.output);

  const qualityGateExit = printSummary({
    staticAnalysis: staticSummary(typesRun.exitCode, lintRun.exitCode),
    tests: testSummary(junitPath),
    coverage: coverageSummary(lcovPath),
    testRunnerPassing: testRun.exitCode === 0,
  });
  if (timedOut) {
    console.error(
      "Check command failed: bun test exceeded the 120-second failsafe timeout. Please try again.",
    );
    process.exit(1);
  }
  if (qualityGateExit !== 0) process.exit(1);
}

await main();
