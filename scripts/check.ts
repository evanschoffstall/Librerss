import { existsSync, readFileSync } from "node:fs";
import { availableParallelism, cpus } from "node:os";
import { join } from "node:path";
import "ts-morph";

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

type SummaryPattern = {
  regex: string;
  type: "match" | "literal" | "table-row";
  format: string;
  cellSep?: string;
};
type Summary =
  | { type: "simple" }
  | { type: "test-runner" }
  | { type: "pattern"; patterns: SummaryPattern[]; default: string };

type LintConfig = {
  globExtensions: string[];
  skipDirs: string[];
  maxFiles: number;
  args: string[];
};

type TsPruneConfig = {
  project: string;
  skip?: string;
  ignore?: string;
  actionableLinePattern: string;
  usedInTestsMarker: string;
};

type DeadCssConfig = {
  cssFiles: string[];
  contentGlobs: string[];
  safelists: string[];
  selectorPrefix: string;
};

type OutputFilter = { type: "stripLines"; pattern: string };

type StepConfig = {
  key: string;
  label: string;
  handler?: string;
  cmd?: string;
  args?: string[];
  passMsg?: string;
  failMsg?: string;
  preRun?: boolean;
  enabled?: boolean;
  outputFilter?: OutputFilter;
  summary?: Summary;
  config?: LintConfig | TsPruneConfig | DeadCssConfig | Record<string, unknown>;
};

type CheckConfig = {
  thresholds: {
    lineCoverageThreshold: number;
    typeCoverageThreshold: number;
    testTimeoutMs: number;
    testCommandTimeoutMs: number;
    testCommandTimeoutEnvVar: string;
  };
  paths: { junitPath: string; lcovPath: string };
  coverageExcludedFiles: string[];
  steps: StepConfig[];
};

// ---------------------------------------------------------------------------
// Load config
// ---------------------------------------------------------------------------

const CFG: CheckConfig = JSON.parse(
  readFileSync(join(import.meta.dir, "check.json"), "utf8"),
) as CheckConfig;

const TEST_COMMAND_TIMEOUT_MS = Number.parseInt(
  process.env[CFG.thresholds.testCommandTimeoutEnvVar] ??
    String(CFG.thresholds.testCommandTimeoutMs),
  10,
);

// Auto-derive tokens: {key} → scalar thresholds, {key} → cwd-joined paths.
// Every key added to "thresholds" or "paths" in check.json becomes a usable
// {token} in any step's args or summary format strings — zero TS changes.
const TOKENS: Record<string, string> = (() => {
  const t: Record<string, string> = {};
  for (const [k, v] of Object.entries(CFG.thresholds))
    if (typeof v === "string" || typeof v === "number") t[`{${k}}`] = String(v);
  for (const [k, v] of Object.entries(CFG.paths))
    if (typeof v === "string") t[`{${k}}`] = join(process.cwd(), v);
  return t;
})();

const JUNIT_PATH = TOKENS["{junitPath}"] ?? "";
const LCOV_PATH = TOKENS["{lcovPath}"] ?? "";

// Substitute {token} placeholders in args, including embedded (e.g. --flag={token})
function resolveArgs(args: string[]): string[] {
  return args.map((a) =>
    a.replace(/\{(\w+)\}/g, (whole, k) => TOKENS[`{${k}}`] ?? whole),
  );
}

type TestResult = {
  file?: string;
  line?: string;
  suite?: string;
  name: string;
  message?: string;
};
type Command = {
  exitCode: number;
  timedOut: boolean;
  output: string;
  durationMs?: number;
  notFound?: boolean;
};

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

const paint = (text: string, ...codes: string[]) =>
  `${codes.join("")}${text}${ANSI.reset}`;
const passFail = (ok: boolean) =>
  paint(ok ? "PASS" : "FAIL", ANSI.bold, ok ? ANSI.green : ANSI.red);
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};
const row = (label: string, ok: boolean, details = "", durationMs?: number) => {
  const timing =
    durationMs !== undefined
      ? ` ${paint(formatDuration(durationMs), ANSI.gray)}`
      : "";
  return `${passFail(ok)} ${paint(label.padEnd(13), ANSI.bold)} ${details}${timing}`;
};
const divider = () => paint("────────────────────────────────", ANSI.gray);
const stripAnsi = (v: string): string => {
  let r = v;
  for (;;) {
    const s = r.indexOf("\u001B[");
    if (s < 0) return r;
    const rem = r.slice(s + 2);
    const m = rem.match(/^[0-9;]*m/);
    if (!m) return r;
    r = r.slice(0, s) + rem.slice(m[0].length);
  }
};
const norm = (v: string) => stripAnsi(v).replace(/\r/g, "").trim();
const splitLines = (v: string) =>
  norm(v)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
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

function getConcurrency(n: number): number {
  if (n < 50) return 1;
  const c =
    typeof availableParallelism === "function"
      ? availableParallelism()
      : cpus().length;
  return c <= 4
    ? Math.max(2, c)
    : c <= 8
      ? c - 1
      : Math.min(8, Math.max(4, Math.ceil(c / 2)));
}

async function estLintFiles(cfg: LintConfig): Promise<number> {
  const glob = new Bun.Glob(`**/*.{${cfg.globExtensions.join(",")}}`);
  let count = 0;
  for await (const fp of glob.scan({ cwd: process.cwd(), absolute: false })) {
    if (
      cfg.skipDirs.some((d) => fp.startsWith(`${d}/`) || fp.includes(`/${d}/`))
    )
      continue;
    if (++count >= cfg.maxFiles) return count;
  }
  return count;
}

function printTests(label: string, color: string, tests: TestResult[]) {
  if (!tests.length) return;
  console.log(`\n${paint(label, ANSI.bold, color)}`);
  for (const test of tests)
    console.log(
      `  ${paint("•", color)} ${paint(where(test), color)}${test.message ? ` [${test.message}]` : ""}`,
    );
}

function parseTests(reportPath: string) {
  if (!existsSync(reportPath)) {
    console.error(
      paint(
        `❌ [test-summary] Report file not found: ${reportPath}`,
        ANSI.red,
        ANSI.bold,
      ),
    );
    return {
      passed: 0,
      failed: 1,
      skipped: 0,
      failedTests: [
        {
          name: "JUnit report missing",
          message: `Report file not found: ${reportPath}`,
        },
      ],
      skippedTests: [],
      ok: false,
    };
  }
  const failed: TestResult[] = [];
  const skipped: TestResult[] = [];
  let passed = 0;
  const matches = Array.from(
    readFileSync(reportPath, "utf8").matchAll(
      /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g,
    ),
  );
  for (const m of matches) {
    const test = toTest(attrs(m[1] ?? ""));
    const body = m[2] ?? "";
    const isSkip = /<skipped\b/.test(body);
    const isFail = body.includes("<failure") || body.includes("<error");
    if (isSkip) skipped.push(test);
    if (isFail)
      failed.push({
        ...test,
        message: attrs(body.match(/<(?:failure|error)\b([^>]*)>/)?.[1] ?? "")
          .message,
      });
    if (!isSkip && !isFail) passed += 1;
  }
  return {
    passed,
    failed: failed.length,
    skipped: skipped.length,
    failedTests: failed,
    skippedTests: skipped,
    ok: failed.length === 0,
  };
}

function parseCoverage(path: string) {
  if (!existsSync(path)) {
    console.error(
      `${paint("FAIL", ANSI.bold, ANSI.red)} Coverage report not found at ${path}`,
    );
    return { covered: 0, found: 0, pct: 0, ok: false };
  }
  const hits = new Map<string, Map<number, number>>();
  let file = "";
  let include = false;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      file = line.slice(3);
      include = !CFG.coverageExcludedFiles.includes(file);
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
  const allHits = [...hits.values()].flatMap((m) => [...m.values()]);
  const found = allHits.length;
  const covered = allHits.filter((h) => h > 0).length;
  if (!found) {
    console.error(
      `${paint("FAIL", ANSI.bold, ANSI.red)} No executable lines found in coverage report`,
    );
    return { covered, found: 0, pct: 0, ok: false };
  }
  const pct = (covered / found) * 100;
  return {
    covered,
    found,
    pct,
    ok: pct >= CFG.thresholds.lineCoverageThreshold,
  };
}

// ---------------------------------------------------------------------------
// Output filters
// ---------------------------------------------------------------------------

function applyOutputFilter(filter: OutputFilter, output: string): string {
  if (filter.type === "stripLines")
    return output
      .split(/\r?\n/)
      .filter((line) => !new RegExp(filter.pattern, "i").test(stripAnsi(line)))
      .join("\n")
      .trimEnd();
  return output;
}

// ---------------------------------------------------------------------------
// Summary builders
// ---------------------------------------------------------------------------

function resolveSummaryTokens(
  format: string,
  match: RegExpMatchArray | null,
): string {
  return format.replace(/\{(\w+)\}/g, (whole, key) => {
    if (/^\d+$/.test(key)) return match?.[Number(key)] ?? "";
    return TOKENS[`{${key}}`] ?? whole;
  });
}

function buildSummary(step: StepConfig, cmd: Command): string {
  const { summary } = step;
  if (!summary || summary.type === "simple") {
    if (cmd.exitCode === 0) return step.passMsg ?? "passed";
    const firstError = splitLines(cmd.output).find((l) => !l.startsWith("$ "));
    return firstError
      ? `${step.failMsg ?? "failed"}: ${firstError}`
      : (step.failMsg ?? "failed");
  }
  if (summary.type === "test-runner") return "";
  // pattern
  const n = norm(cmd.output);
  for (const pat of summary.patterns) {
    if (pat.type === "literal") {
      if (new RegExp(pat.regex, "i").test(n))
        return resolveSummaryTokens(pat.format, null);
    } else if (pat.type === "match") {
      const m = n.match(new RegExp(pat.regex, "i"));
      if (m) return resolveSummaryTokens(pat.format, m);
    } else if (pat.type === "table-row") {
      const tableRow = splitLines(cmd.output).find((l) =>
        l.includes(pat.regex),
      );
      if (tableRow) {
        const cells = tableRow
          .split(pat.cellSep ?? "│")
          .map((c) => c.trim())
          .filter(Boolean);
        if (cells.length >= 7)
          return pat.format.replace(
            /\{(\d+)\}/g,
            (_, i) => cells[Number(i)] ?? "",
          );
      }
    }
  }
  return summary.default;
}

function printStepOutput(label: string, output: string) {
  console.log(`\n${paint(label, ANSI.bold)}`);
  if (!output.trim()) console.log(paint("(no output)", ANSI.gray));
  else
    process.stdout.write(
      output.endsWith("\n") ? output : `${output.replace(/\s+$/g, "")}\n`,
    );
}

async function runDeadCss(cfg: DeadCssConfig): Promise<Command> {
  const startMs = Date.now();
  const cwd = process.cwd();
  const { cssFiles, contentGlobs, safelists, selectorPrefix } = cfg;
  const safelistRe = safelists.map((s) => new RegExp(s));
  const safePattern = new RegExp(safelists.join("|"));
  try {
    const { PurgeCSS } = await import("purgecss");
    const [result] = await new PurgeCSS().purge({
      css: cssFiles.map((f) => join(cwd, f)),
      content: contentGlobs.map((g) => join(cwd, g)),
      rejected: true,
      safelist: { greedy: safelistRe },
    });
    const dead = (result?.rejected ?? []).filter(
      (s) => s.startsWith(selectorPrefix) && !safePattern.test(s),
    );
    const durationMs = Date.now() - startMs;
    if (!dead.length)
      return {
        exitCode: 0,
        timedOut: false,
        output: "no dead CSS definitions found\n",
        durationMs,
      };
    return {
      exitCode: 1,
      timedOut: false,
      output: `${dead.map((s) => `  dead: ${s}`).join("\n")}\nfound ${dead.length} unused CSS selector(s)\n`,
      durationMs,
    };
  } catch (e) {
    return {
      exitCode: 1,
      timedOut: false,
      output: `dead-css check failed: ${e instanceof Error ? e.message : String(e)}\n`,
      durationMs: Date.now() - startMs,
    };
  }
}

async function run(
  cmd: string,
  args: string[],
  timeoutMs?: number,
  extraEnv?: Record<string, string>,
): Promise<Command> {
  const startMs = Date.now();
  if (!Bun.which(cmd))
    return {
      exitCode: 127,
      timedOut: false,
      output: `command not found: ${cmd}`,
      notFound: true,
      durationMs: 0,
    };
  const env: Record<string, string | undefined> = {
    ...process.env,
    FORCE_COLOR: process.env.FORCE_COLOR ?? "1",
    NODE_NO_WARNINGS: process.env.NODE_NO_WARNINGS ?? "1",
    ...extraEnv,
  };
  delete env.NO_COLOR;
  const child = Bun.spawn([cmd, ...args], {
    cwd: process.cwd(),
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdoutP = child.stdout
    ? new Response(child.stdout).text()
    : Promise.resolve("");
  const stderrP = child.stderr
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
    stdoutP,
    stderrP,
  ]);
  if (timeout) clearTimeout(timeout);
  const durationMs = Date.now() - startMs;
  const output = `${stdout}${stderr}`;
  return timedOut
    ? { exitCode: 124, timedOut: true, output, durationMs }
    : { exitCode: exitCode ?? 1, timedOut: false, output, durationMs };
}

async function runLint(cfg: LintConfig, extraArgs: string[]): Promise<Command> {
  const envC = process.env.ESLINT_CONCURRENCY;
  const fileCount = await estLintFiles(cfg);
  const concurrency =
    envC && /^\d+$/.test(envC)
      ? Number.parseInt(envC, 10)
      : getConcurrency(fileCount);
  return run("bunx", [...cfg.args, String(concurrency), ...extraArgs]);
}

async function runTsPrune(
  cfg: TsPruneConfig,
  argv?: string[],
): Promise<Command> {
  // CLI --config override: load from file and recurse
  const overridePath = argv
    ? (() => {
        const cfgIdx = argv.indexOf("--config");
        if (cfgIdx >= 0) return argv[cfgIdx + 1] ?? null;
        return argv.find((a) => a.startsWith("--config="))?.slice(9) ?? null;
      })()
    : null;
  if (overridePath !== null) {
    const absPath = join(process.cwd(), overridePath);
    if (!existsSync(absPath))
      return {
        exitCode: 1,
        timedOut: false,
        output: `ts-prune config file not found: ${absPath}\n`,
      };
    const raw = JSON.parse(readFileSync(absPath, "utf8")) as unknown;
    if (!raw || typeof raw !== "object")
      return {
        exitCode: 1,
        timedOut: false,
        output: `Invalid ts-prune config at ${absPath}: expected an object\n`,
      };
    const r = raw as Record<string, unknown>;
    return runTsPrune(
      {
        project: typeof r.project === "string" ? r.project : cfg.project,
        skip: typeof r.skip === "string" ? r.skip : cfg.skip,
        ignore: typeof r.ignore === "string" ? r.ignore : cfg.ignore,
        actionableLinePattern: cfg.actionableLinePattern,
        usedInTestsMarker: cfg.usedInTestsMarker,
      },
      undefined,
    );
  }
  try {
    const { project, skip, ignore, actionableLinePattern, usedInTestsMarker } =
      cfg;
    let ignoreRe: RegExp | null = null;
    if (ignore) {
      try {
        ignoreRe = new RegExp(ignore);
      } catch (e) {
        throw new Error(
          `Invalid regex in ts-prune config: ${ignore} (${e instanceof Error ? e.message : "unknown error"})`,
        );
      }
    }
    const tsArgs = ["ts-prune", "-p", project];
    if (skip) tsArgs.push("--skip", skip);
    if (ignore) tsArgs.push("--ignore", ignore);
    const result = await run("bunx", tsArgs);
    if (result.timedOut) return result;
    const actionableRe = new RegExp(actionableLinePattern);
    const actionable = result.output
      .split(/\r?\n/)
      .filter(
        (l) =>
          actionableRe.test(l.trim()) &&
          (l.includes(usedInTestsMarker) || !ignoreRe?.test(l)),
      );
    if (actionable.length > 0)
      return {
        exitCode: 1,
        timedOut: false,
        output: `${actionable.join("\n")}\nts-prune found ${actionable.length} actionable unused export(s)\n`,
      };
    return result;
  } catch (e) {
    return {
      exitCode: 1,
      timedOut: false,
      output: `ts-prune failed: ${e instanceof Error ? e.message : "unknown error"}\n`,
    };
  }
}

// Handler registry — keyed by step "handler" field
const HANDLERS: Record<string, (step: StepConfig) => Promise<Command>> = {
  lint: (step) => runLint(step.config as LintConfig, []),
  "ts-prune": (step) => runTsPrune(step.config as TsPruneConfig),
  "dead-css": (step) => runDeadCss(step.config as DeadCssConfig),
  test: (step) =>
    run("bun", resolveArgs(step.args ?? []), TEST_COMMAND_TIMEOUT_MS),
};

function runStep(step: StepConfig): Promise<Command> {
  if (step.handler)
    return (
      HANDLERS[step.handler]?.(step) ??
      Promise.resolve({
        exitCode: 1,
        timedOut: false,
        output: `unknown handler: ${step.handler}`,
      })
    );
  if (!step.cmd)
    return Promise.resolve({
      exitCode: 1,
      timedOut: false,
      output: `step "${step.key}" missing cmd`,
    });
  return run(step.cmd, resolveArgs(step.args ?? []));
}

async function runCheckSuite(keyFilter?: Set<string> | null) {
  const startedAtMs = Date.now();
  process.stdout.write(paint("⏳ Please wait ... ", ANSI.bold, ANSI.cyan));

  const preRunSteps = keyFilter
    ? []
    : CFG.steps.filter((s) => s.preRun && s.enabled !== false);
  const mainSteps = CFG.steps.filter(
    (s) =>
      !s.preRun && s.enabled !== false && (!keyFilter || keyFilter.has(s.key)),
  );

  for (const step of preRunSteps) await runStep(step);

  const runs = Object.fromEntries(
    await Promise.all(
      mainSteps.map(async (s) => [s.key, await runStep(s)] as const),
    ),
  ) as Record<string, Command>;

  const timedOut = Object.values(runs).some((r) => r.timedOut);
  const missingLabels = mainSteps
    .filter((s) => runs[s.key]?.notFound)
    .map((s) => s.label);

  for (const step of mainSteps) {
    if (runs[step.key]?.notFound) continue;
    printStepOutput(
      step.label,
      step.outputFilter
        ? applyOutputFilter(step.outputFilter, runs[step.key].output)
        : runs[step.key].output,
    );
  }

  const runTests = !keyFilter || keyFilter.has("test");
  const tests = runTests
    ? parseTests(JUNIT_PATH)
    : {
        passed: 0,
        failed: 0,
        skipped: 0,
        failedTests: [],
        skippedTests: [],
        ok: true,
      };
  const coverage = runTests ? parseCoverage(LCOV_PATH) : null;

  type CheckRow = {
    k: string;
    ok: boolean;
    d: string;
    ms?: number;
    stpk: string | null;
  };
  const checks: CheckRow[] = mainSteps.map((step) => {
    const cmd = runs[step.key];
    const isTestRunner = step.summary?.type === "test-runner";
    const d = isTestRunner
      ? `${tests.passed} passed · ${tests.failed} failed · ${tests.skipped} skipped · runner exit ${cmd.exitCode}`
      : buildSummary(step, cmd);
    return {
      k: step.label,
      ok: cmd.exitCode === 0 && (!isTestRunner || tests.ok),
      d,
      ms: cmd.durationMs,
      stpk: step.key,
    };
  });

  if (coverage)
    checks.push({
      k: "Coverage",
      ok: coverage.ok,
      d: `${coverage.pct.toFixed(2)}% (${coverage.covered}/${coverage.found}) · threshold ${CFG.thresholds.lineCoverageThreshold.toFixed(1)}%`,
      stpk: null,
    });

  printTests("Failed tests", ANSI.red, tests.failedTests);
  printTests("Skipped tests", ANSI.gray, tests.skippedTests);

  if (missingLabels.length > 0)
    console.log(
      `\n${paint("missing/not found:", ANSI.bold, ANSI.yellow)} ${paint(missingLabels.join(", "), ANSI.yellow)}`,
    );

  const presentChecks = checks.filter(
    (c) => !c.stpk || !runs[c.stpk]?.notFound,
  );

  console.log(`\n${paint("Quality Summary", ANSI.bold, ANSI.cyan)}`);
  console.log(divider());
  for (const check of presentChecks)
    console.log(row(check.k, check.ok, check.d, check.ms));
  console.log(divider());

  const allOk = presentChecks.every((c) => c.ok) && !timedOut;
  const elapsedSeconds = ((Date.now() - startedAtMs) / 1000).toFixed(2);
  console.log(
    row(
      "Overall",
      allOk,
      `${allOk ? "all checks passed" : "one or more checks failed"} (in ${elapsedSeconds} seconds)`,
    ),
  );
  console.log(divider());

  if (timedOut) {
    console.error(
      `Check command failed: bun test exceeded the ${TEST_COMMAND_TIMEOUT_MS / 1000}-second failsafe timeout. Please try again.`,
    );
    process.exit(1);
  }
  if (!allOk) process.exit(1);
}

async function main() {
  const command = Bun.argv[2];
  const args = Bun.argv.slice(3);
  const writeOut = (output: string) =>
    process.stdout.write(
      output.endsWith("\n") ? output : `${output.replace(/\s+$/g, "")}\n`,
    );
  if (command === "lint") {
    const step = CFG.steps.find((s) => s.handler === "lint");
    const result = await runLint(step?.config as LintConfig, args);
    writeOut(result.output);
    process.exit(result.exitCode);
  }
  if (command === "ts-prune") {
    const step = CFG.steps.find((s) => s.handler === "ts-prune");
    const result = await runTsPrune(step?.config as TsPruneConfig, args);
    writeOut(result.output);
    process.exit(result.exitCode);
  }
  const flagKeys = Bun.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => a.slice(2));
  await runCheckSuite(flagKeys.length > 0 ? new Set(flagKeys) : null);
}

await main();
