import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LINE_COVERAGE_THRESHOLD = 80;
const TEST_TIMEOUT_MS = 5_000;
const DEFAULT_TEST_COMMAND_TIMEOUT_MS = 180_000;

function parsePositiveIntEnv(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const TEST_COMMAND_TIMEOUT_MS = parsePositiveIntEnv(
  process.env.CHECK_TEST_COMMAND_TIMEOUT_MS,
  DEFAULT_TEST_COMMAND_TIMEOUT_MS,
);

function stripAnsiEscapeSequences(value: string): string {
  let result = value;

  for (;;) {
    const start = result.indexOf("\u001B[");
    if (start < 0) return result;

    const remainder = result.slice(start + 2);
    const match = remainder.match(/^[0-9;]*m/);
    if (!match) return result;

    result = result.slice(0, start) + remainder.slice(match[0].length);
  }
}

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
  tscExitCode: number;
  eslintExitCode: number;
  exitCode: number;
};
type RedundancyChecks = {
  jscpdPassing: boolean;
  knipPassing: boolean;
  tsPrunePassing: boolean;
  jscpdExitCode: number;
  knipExitCode: number;
  tsPruneExitCode: number;
  exitCode: number;
};
type ArchitectureChecks = {
  depCruisePassing: boolean;
  madgePassing: boolean;
  typeCoveragePassing: boolean;
  depCruiseExitCode: number;
  madgeExitCode: number;
  typeCoverageExitCode: number;
  exitCode: number;
};
type AssuranceChecks = {
  stylelintPassing: boolean;
  tsdPassing: boolean;
  secretlintPassing: boolean;
  stylelintExitCode: number;
  tsdExitCode: number;
  secretlintExitCode: number;
  exitCode: number;
};
type AdvisoryChecks = {
  prettierCheckExitCode: number;
  semgrepExitCode: number;
  gitleaksExitCode: number;
  auditCiExitCode: number;
  osvAuditExitCode: number;
};
type Command = { exitCode: number; timedOut: boolean; output: string };
type SummaryDetails = {
  tsc: string;
  eslint: string;
  jscpd: string;
  knip: string;
  tsPrune: string;
  depCruise: string;
  madge: string;
  typeCoverage: string;
  stylelint: string;
  tsd: string;
  secretlint: string;
  prettier: string;
  semgrep: string;
  gitleaks: string;
  auditCi: string;
  osvAudit: string;
};

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
  tscExitCode: tscExit,
  eslintExitCode: eslintExit,
  exitCode: tscExit === 0 && eslintExit === 0 ? 0 : 1,
});
const redundancySummary = (
  jscpdExit: number,
  knipExit: number,
  tsPruneExit: number,
): RedundancyChecks => ({
  jscpdPassing: jscpdExit === 0,
  knipPassing: knipExit === 0,
  tsPrunePassing: tsPruneExit === 0,
  jscpdExitCode: jscpdExit,
  knipExitCode: knipExit,
  tsPruneExitCode: tsPruneExit,
  exitCode: jscpdExit === 0 && knipExit === 0 && tsPruneExit === 0 ? 0 : 1,
});
const architectureSummary = (
  depCruiseExit: number,
  madgeExit: number,
  typeCoverageExit: number,
): ArchitectureChecks => ({
  depCruisePassing: depCruiseExit === 0,
  madgePassing: madgeExit === 0,
  typeCoveragePassing: typeCoverageExit === 0,
  depCruiseExitCode: depCruiseExit,
  madgeExitCode: madgeExit,
  typeCoverageExitCode: typeCoverageExit,
  exitCode:
    depCruiseExit === 0 && madgeExit === 0 && typeCoverageExit === 0 ? 0 : 1,
});
const assuranceSummary = (
  stylelintExit: number,
  tsdExit: number,
  secretlintExit: number,
): AssuranceChecks => ({
  stylelintPassing: stylelintExit === 0,
  tsdPassing: tsdExit === 0,
  secretlintPassing: secretlintExit === 0,
  stylelintExitCode: stylelintExit,
  tsdExitCode: tsdExit,
  secretlintExitCode: secretlintExit,
  exitCode:
    stylelintExit === 0 && tsdExit === 0 && secretlintExit === 0 ? 0 : 1,
});
const advisorySummary = (
  prettierCheckExit: number,
  semgrepExit: number,
  gitleaksExit: number,
  auditCiExit: number,
  osvAuditExit: number,
): AdvisoryChecks => ({
  prettierCheckExitCode: prettierCheckExit,
  semgrepExitCode: semgrepExit,
  gitleaksExitCode: gitleaksExit,
  auditCiExitCode: auditCiExit,
  osvAuditExitCode: osvAuditExit,
});

function normalizeOutput(value: string): string {
  return stripAnsiEscapeSequences(value).replace(/\r/g, "").trim();
}

function nonEmptyOutputLines(value: string): string[] {
  return normalizeOutput(value)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseJscpdDetails(output: string): string {
  const lines = nonEmptyOutputLines(output);
  const totalRow = lines.find((line) => line.includes("│ Total:"));
  const cloneMatch = normalizeOutput(output).match(/Found\s+(\d+)\s+clones?/i);

  if (totalRow) {
    const cells = totalRow
      .split("│")
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (cells.length >= 7) {
      const files = cells[1] ?? "?";
      const cloned = cells[4] ?? "?";
      const duplicatedLines = cells[5] ?? "?";
      const duplicatedTokens = cells[6] ?? "?";
      return `${cloned} clones · ${duplicatedLines} lines · ${duplicatedTokens} tokens · ${files} files`;
    }
  }

  if (cloneMatch) return `${cloneMatch[1]} clones`;
  return "no duplicate stats detected";
}

function parseDepCruiseDetails(output: string): string {
  const match = normalizeOutput(output).match(
    /no dependency violations found \((\d+) modules,\s*(\d+) dependencies cruised\)/i,
  );
  if (match) return `${match[1]} modules · ${match[2]} dependencies cruised`;
  return "dependency check completed";
}

function parseMadgeDetails(output: string): string {
  const normalized = normalizeOutput(output);
  if (/No circular dependency found/i.test(normalized))
    return "0 circular dependencies";
  const match = normalized.match(/Found\s+(\d+)\s+circular\s+dependenc/i);
  if (match) return `${match[1]} circular dependencies`;
  return "circular dependency check completed";
}

function parseTypeCoverageDetails(output: string): string {
  const match = normalizeOutput(output).match(
    /\((\d+)\s*\/\s*(\d+)\)\s*([\d.]+)%/,
  );
  if (!match) return "type coverage completed";
  return `${match[3]}% (${match[1]}/${match[2]}) · threshold 98%`;
}

function parseAuditCiDetails(output: string): string {
  const normalized = normalizeOutput(output);
  if (/No vulnerabilities found/i.test(normalized))
    return "0 vulnerabilities found";
  const match = normalized.match(/(\d+)\s+vulnerabilit(?:y|ies)/i);
  if (match) return `${match[1]} vulnerabilities found`;
  return "dependency audit completed";
}

function parseOsvAuditDetails(output: string): string {
  const normalized = normalizeOutput(output);
  if (normalized.includes("{}")) return "0 advisories";
  return "OSV audit completed";
}

function detailFromExit(
  output: string,
  exitCode: number,
  passingText: string,
  failingText: string,
): string {
  if (exitCode === 0) return passingText;
  const lines = nonEmptyOutputLines(output);
  const firstError = lines.find((line) => !line.startsWith("$ "));
  return firstError ? `${failingText}: ${firstError}` : failingText;
}

function summaryDetailsFromOutputs(outputs: {
  types: Command;
  lint: Command;
  jscpd: Command;
  knip: Command;
  tsPrune: Command;
  depCruise: Command;
  madge: Command;
  typeCoverage: Command;
  stylelint: Command;
  tsd: Command;
  secretlint: Command;
  prettier: Command;
  semgrep: Command;
  gitleaks: Command;
  auditCi: Command;
  osvAudit: Command;
}): SummaryDetails {
  return {
    tsc: detailFromExit(
      outputs.types.output,
      outputs.types.exitCode,
      "typecheck clean",
      "typecheck failed",
    ),
    eslint: detailFromExit(
      outputs.lint.output,
      outputs.lint.exitCode,
      "lint clean",
      "lint failed",
    ),
    jscpd: parseJscpdDetails(outputs.jscpd.output),
    knip: detailFromExit(
      outputs.knip.output,
      outputs.knip.exitCode,
      "unused dependency check clean",
      "knip failed",
    ),
    tsPrune: detailFromExit(
      outputs.tsPrune.output,
      outputs.tsPrune.exitCode,
      "unused export check clean",
      "ts-prune failed",
    ),
    depCruise: parseDepCruiseDetails(outputs.depCruise.output),
    madge: parseMadgeDetails(outputs.madge.output),
    typeCoverage: parseTypeCoverageDetails(outputs.typeCoverage.output),
    stylelint: detailFromExit(
      outputs.stylelint.output,
      outputs.stylelint.exitCode,
      "stylelint clean",
      "stylelint failed",
    ),
    tsd: detailFromExit(
      outputs.tsd.output,
      outputs.tsd.exitCode,
      "type definition tests clean",
      "tsd failed",
    ),
    secretlint: detailFromExit(
      outputs.secretlint.output,
      outputs.secretlint.exitCode,
      "no secret findings",
      "secretlint failed",
    ),
    prettier: detailFromExit(
      outputs.prettier.output,
      outputs.prettier.exitCode,
      "formatting compliant",
      "prettier check failed",
    ),
    semgrep: detailFromExit(
      outputs.semgrep.output,
      outputs.semgrep.exitCode,
      "rule scan clean",
      "semgrep failed",
    ),
    gitleaks: detailFromExit(
      outputs.gitleaks.output,
      outputs.gitleaks.exitCode,
      "secret scan clean",
      "gitleaks failed",
    ),
    auditCi: parseAuditCiDetails(outputs.auditCi.output),
    osvAudit: parseOsvAuditDetails(outputs.osvAudit.output),
  };
}

function printStepOutput(label: string, output: string) {
  console.log(`\n${paint(label, ANSI.bold)}`);
  if (!output.trim()) {
    console.log(paint("(no output)", ANSI.gray));
    return;
  }
  process.stdout.write(
    output.endsWith("\n") ? output : `${output.replace(/\s+$/g, "")}\n`,
  );
}

function filterMadgeWarnings(output: string): string {
  return output
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = stripAnsiEscapeSequences(line);
      return !/\b\d+\s+warnings?\b/i.test(normalized);
    })
    .join("\n")
    .trimEnd();
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
  redundancy: RedundancyChecks;
  architecture: ArchitectureChecks;
  assurance: AssuranceChecks;
  advisory: AdvisoryChecks;
  details: SummaryDetails;
  tests: Summary;
  coverage: Coverage;
  testRunnerExitCode: number;
}) {
  const advisoryPassing =
    results.advisory.prettierCheckExitCode === 0 &&
    results.advisory.semgrepExitCode === 0 &&
    results.advisory.gitleaksExitCode === 0 &&
    results.advisory.auditCiExitCode === 0 &&
    results.advisory.osvAuditExitCode === 0;

  const ok =
    results.staticAnalysis.exitCode === 0 &&
    results.redundancy.exitCode === 0 &&
    results.architecture.exitCode === 0 &&
    results.assurance.exitCode === 0 &&
    advisoryPassing &&
    results.tests.exitCode === 0 &&
    results.coverage.exitCode === 0 &&
    results.testRunnerExitCode === 0;
  printTests("Failed tests", ANSI.red, results.tests.failedTests);
  printTests("Skipped tests", ANSI.gray, results.tests.skippedTests);
  console.log(`\n${paint("Quality Summary", ANSI.bold, ANSI.cyan)}`);
  console.log(divider());
  console.log(
    row("tsc", results.staticAnalysis.tscPassing, results.details.tsc),
  );
  console.log(
    row("eslint", results.staticAnalysis.eslintPassing, results.details.eslint),
  );
  console.log(
    row("jscpd", results.redundancy.jscpdPassing, results.details.jscpd),
  );
  console.log(
    row("knip", results.redundancy.knipPassing, results.details.knip),
  );
  console.log(
    row("ts-prune", results.redundancy.tsPrunePassing, results.details.tsPrune),
  );
  console.log(
    row(
      "depcruise",
      results.architecture.depCruisePassing,
      results.details.depCruise,
    ),
  );
  console.log(
    row("madge", results.architecture.madgePassing, results.details.madge),
  );
  console.log(
    row(
      "type-coverage",
      results.architecture.typeCoveragePassing,
      results.details.typeCoverage,
    ),
  );
  console.log(
    row(
      "stylelint",
      results.assurance.stylelintPassing,
      results.details.stylelint,
    ),
  );
  console.log(row("tsd", results.assurance.tsdPassing, results.details.tsd));
  console.log(
    row(
      "secretlint",
      results.assurance.secretlintPassing,
      results.details.secretlint,
    ),
  );
  console.log(
    row(
      "prettier",
      results.advisory.prettierCheckExitCode === 0,
      results.details.prettier,
    ),
  );
  console.log(
    row(
      "semgrep",
      results.advisory.semgrepExitCode === 0,
      results.details.semgrep,
    ),
  );
  console.log(
    row(
      "gitleaks",
      results.advisory.gitleaksExitCode === 0,
      results.details.gitleaks,
    ),
  );
  console.log(
    row(
      "audit-ci",
      results.advisory.auditCiExitCode === 0,
      results.details.auditCi,
    ),
  );
  console.log(
    row(
      "osv-audit",
      results.advisory.osvAuditExitCode === 0,
      results.details.osvAudit,
    ),
  );
  console.log(
    row(
      "Tests",
      results.tests.exitCode === 0 && results.testRunnerExitCode === 0,
      `${results.tests.passedCount} passed · ${results.tests.failedCount} failed · ${results.tests.skippedCount} skipped · runner exit ${results.testRunnerExitCode}`,
    ),
  );
  console.log(
    row(
      "Coverage",
      results.coverage.exitCode === 0,
      `${results.coverage.lineCoverage.toFixed(2)}% (${results.coverage.coveredLines}/${results.coverage.foundLines}) · threshold ${LINE_COVERAGE_THRESHOLD.toFixed(1)}%`,
    ),
  );
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
  const env: Record<string, string | undefined> = {
    ...process.env,
    FORCE_COLOR: process.env.FORCE_COLOR ?? "1",
    NODE_NO_WARNINGS: process.env.NODE_NO_WARNINGS ?? "1",
  };
  delete env.NO_COLOR;

  const child = Bun.spawn([command, ...args], {
    cwd: process.cwd(),
    env,
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
  process.stdout.write(
    paint(
      "⏳ Please wait -- validating static analysis, tests, coverage, and redundancy checks... ",
      ANSI.bold,
      ANSI.cyan,
    ),
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
  const jscpdRunPromise = runStep("Running jscpd", "bun", ["run", "dup"]);
  const knipRunPromise = runStep("Running knip", "bun", ["run", "redundancy"]);
  const tsPruneRunPromise = runStep("Running ts-prune", "bun", [
    "run",
    "ts-prune",
  ]);
  const depCruiseRunPromise = runStep("Running depcruise", "bunx", [
    "depcruise",
    "--config",
    ".dependency-cruiser.cjs",
    "src",
    "--output-type",
    "err",
  ]);
  const madgeRunPromise = runStep("Running madge", "bun", ["run", "depgraph"]);
  const typeCoverageRunPromise = runStep("Running type-coverage", "bunx", [
    "type-coverage",
    "--at-least",
    "98",
  ]);
  const stylelintRunPromise = runStep("Running stylelint", "bun", [
    "run",
    "lint:style",
  ]);
  const tsdRunPromise = runStep("Running tsd", "bun", ["run", "tsd"]);
  const secretlintRunPromise = runStep("Running secretlint", "bun", [
    "run",
    "scan:secretlint",
  ]);
  const prettierCheckRunPromise = runStep("Running prettier check", "bun", [
    "run",
    "format:check",
  ]);
  const semgrepRunPromise = runStep("Running semgrep", "bun", [
    "run",
    "scan:semgrep",
  ]);
  const gitleaksRunPromise = runStep("Running gitleaks", "bun", [
    "run",
    "scan:gitleaks",
  ]);
  const auditCiRunPromise = runStep("Running audit-ci", "bun", [
    "run",
    "scan:deps",
  ]);
  const osvAuditRunPromise = runStep("Running osv audit", "bun", [
    "run",
    "scan:osv",
  ]);

  const [
    testRun,
    typesRun,
    lintRun,
    jscpdRun,
    knipRun,
    tsPruneRun,
    depCruiseRun,
    madgeRun,
    typeCoverageRun,
    stylelintRun,
    tsdRun,
    secretlintRun,
    prettierCheckRun,
    semgrepRun,
    gitleaksRun,
    auditCiRun,
    osvAuditRun,
  ] = await Promise.all([
    testRunPromise,
    typesRunPromise,
    lintRunPromise,
    jscpdRunPromise,
    knipRunPromise,
    tsPruneRunPromise,
    depCruiseRunPromise,
    madgeRunPromise,
    typeCoverageRunPromise,
    stylelintRunPromise,
    tsdRunPromise,
    secretlintRunPromise,
    prettierCheckRunPromise,
    semgrepRunPromise,
    gitleaksRunPromise,
    auditCiRunPromise,
    osvAuditRunPromise,
  ]);
  const timedOut =
    testRun.timedOut ||
    typesRun.timedOut ||
    lintRun.timedOut ||
    jscpdRun.timedOut ||
    knipRun.timedOut ||
    tsPruneRun.timedOut ||
    depCruiseRun.timedOut ||
    madgeRun.timedOut ||
    typeCoverageRun.timedOut ||
    stylelintRun.timedOut ||
    tsdRun.timedOut ||
    secretlintRun.timedOut ||
    prettierCheckRun.timedOut ||
    semgrepRun.timedOut ||
    gitleaksRun.timedOut ||
    auditCiRun.timedOut ||
    osvAuditRun.timedOut;

  printStepOutput("Tests", testRun.output);
  printStepOutput("Types", typesRun.output);
  printStepOutput("Lint", lintRun.output);
  printStepOutput("jscpd", jscpdRun.output);
  printStepOutput("knip", knipRun.output);
  printStepOutput("ts-prune", tsPruneRun.output);
  printStepOutput("depcruise", depCruiseRun.output);
  printStepOutput("madge", filterMadgeWarnings(madgeRun.output));
  printStepOutput("type-coverage", typeCoverageRun.output);
  printStepOutput("stylelint", stylelintRun.output);
  printStepOutput("tsd", tsdRun.output);
  printStepOutput("secretlint", secretlintRun.output);
  printStepOutput("prettier-check", prettierCheckRun.output);
  printStepOutput("semgrep", semgrepRun.output);
  printStepOutput("gitleaks", gitleaksRun.output);
  printStepOutput("audit-ci", auditCiRun.output);
  printStepOutput("osv-audit", osvAuditRun.output);

  const qualityGateExit = printSummary({
    staticAnalysis: staticSummary(typesRun.exitCode, lintRun.exitCode),
    redundancy: redundancySummary(
      jscpdRun.exitCode,
      knipRun.exitCode,
      tsPruneRun.exitCode,
    ),
    architecture: architectureSummary(
      depCruiseRun.exitCode,
      madgeRun.exitCode,
      typeCoverageRun.exitCode,
    ),
    assurance: assuranceSummary(
      stylelintRun.exitCode,
      tsdRun.exitCode,
      secretlintRun.exitCode,
    ),
    advisory: advisorySummary(
      prettierCheckRun.exitCode,
      semgrepRun.exitCode,
      gitleaksRun.exitCode,
      auditCiRun.exitCode,
      osvAuditRun.exitCode,
    ),
    details: summaryDetailsFromOutputs({
      types: typesRun,
      lint: lintRun,
      jscpd: jscpdRun,
      knip: knipRun,
      tsPrune: tsPruneRun,
      depCruise: depCruiseRun,
      madge: madgeRun,
      typeCoverage: typeCoverageRun,
      stylelint: stylelintRun,
      tsd: tsdRun,
      secretlint: secretlintRun,
      prettier: prettierCheckRun,
      semgrep: semgrepRun,
      gitleaks: gitleaksRun,
      auditCi: auditCiRun,
      osvAudit: osvAuditRun,
    }),
    tests: testSummary(junitPath),
    coverage: coverageSummary(lcovPath),
    testRunnerExitCode: testRun.exitCode,
  });
  if (timedOut) {
    console.error(
      `Check command failed: bun test exceeded the ${TEST_COMMAND_TIMEOUT_MS / 1000}-second failsafe timeout. Please try again.`,
    );
    process.exit(1);
  }
  if (qualityGateExit !== 0) process.exit(1);
}

await main();
