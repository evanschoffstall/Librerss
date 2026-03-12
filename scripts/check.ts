import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { availableParallelism, cpus } from "node:os";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

interface CheckConfig {
  coverageExcludedFiles: string[];
  paths: { junitPath: string; lcovPath: string };
  steps: StepConfig[];
  thresholds: {
    lineCoverageThreshold: number;
    testCommandTimeoutEnvVar: string;
    testCommandTimeoutMs: number;
    testTimeoutMs: number;
    typeCoverageThreshold: number;
  };
}
interface InlineTypeScriptConfig {
  data?: Record<string, unknown>;
  source: string;
}

interface LintConfig {
  args: string[];
  globExtensions: string[];
  maxFiles: number;
  skipDirs: string[];
}

interface OutputFilter {
  pattern: string;
  type: "stripLines";
}

interface StepConfig {
  args?: string[];
  cmd?: string;
  config?: InlineTypeScriptConfig | LintConfig | Record<string, unknown>;
  enabled?: boolean;
  failMsg?: string;
  handler?: string;
  key: string;
  label: string;
  outputFilter?: OutputFilter;
  passMsg?: string;
  preRun?: boolean;
  summary?: Summary;
}

type Summary =
  | { default: string; patterns: SummaryPattern[]; type: "pattern" }
  | { type: "simple" }
  | { type: "test-runner" };

interface SummaryPattern {
  cellSep?: string;
  format: string;
  regex: string;
  type: "count" | "literal" | "match" | "table-row";
}

// ---------------------------------------------------------------------------
// Load config
// ---------------------------------------------------------------------------

const CFG: CheckConfig = JSON.parse(
  readFileSync(join(import.meta.dir, "check.json"), "utf8"),
) as CheckConfig;

const PROJECT_MANIFEST = (() => {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
  } catch {
    return {} as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
  }
})();

const DECLARED_BUNX_TARGETS = (() => {
  const targets = new Set<string>();
  const dependencyNames = new Set<string>([
    ...Object.keys(PROJECT_MANIFEST.dependencies ?? {}),
    ...Object.keys(PROJECT_MANIFEST.devDependencies ?? {}),
    ...Object.keys(PROJECT_MANIFEST.optionalDependencies ?? {}),
    ...Object.keys(PROJECT_MANIFEST.peerDependencies ?? {}),
  ]);

  for (const dependencyName of dependencyNames) {
    targets.add(dependencyName);

    try {
      const packageJson = JSON.parse(
        readFileSync(
          join(process.cwd(), "node_modules", dependencyName, "package.json"),
          "utf8",
        ),
      ) as { bin?: Record<string, string> | string };

      if (typeof packageJson.bin === "string") {
        targets.add(
          dependencyName.includes("/")
            ? (dependencyName.split("/").at(-1) ?? dependencyName)
            : dependencyName,
        );
        continue;
      }

      for (const binName of Object.keys(packageJson.bin ?? {}))
        targets.add(binName);
    } catch {
      continue;
    }
  }

  return targets;
})();

const TEST_COMMAND_TIMEOUT_MS = Number.parseInt(
  process.env[CFG.thresholds.testCommandTimeoutEnvVar] ??
    String(CFG.thresholds.testCommandTimeoutMs),
  10,
);
const CHECK_SUITE_TIMEOUT_MS = TEST_COMMAND_TIMEOUT_MS;

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
const COVERAGE_LABEL = "lcov-coverage";

interface Command {
  durationMs?: number;
  exitCode: number;
  notFound?: boolean;
  output: string;
  timedOut: boolean;
}

interface InlineTypeScriptContext {
  cwd: string;
  data: Record<string, unknown>;
  dirname: typeof dirname;
  existsSync: typeof existsSync;
  fail: (output: string, durationMs?: number) => Command;
  importModule: (specifier: string) => Promise<unknown>;
  join: typeof join;
  ok: (output: string, durationMs?: number) => Command;
  readFileSync: typeof readFileSync;
  step: StepConfig;
}
interface InlineTypeScriptOverrides {
  importModule?: (specifier: string) => Promise<unknown>;
}

type InlineTypeScriptRunner = (
  context: InlineTypeScriptContext,
) => Command | Promise<Command>;

type StepRunner = (step: StepConfig, timeoutMs?: number) => Promise<Command>;

interface TestResult {
  file?: string;
  line?: string;
  message?: string;
  name: string;
  suite?: string;
}

function getBunxCommandTarget(args: string[]): null | string {
  const target = args.find((arg) => !arg.startsWith("-"));
  return target && target.length > 0 ? target : null;
}

function hasExplicitPackageVersion(specifier: string): boolean {
  if (!specifier.startsWith("@")) return specifier.includes("@");

  const slashIndex = specifier.indexOf("/");
  if (slashIndex < 0) return false;
  return specifier.includes("@", slashIndex + 1);
}

function hasMissingSignal(output: string): boolean {
  const text = stripAnsi(output);
  return [
    /command not found:/i,
    /should be provided by a local binary/i,
    /cannot find package ['"][^'"]+['"]/i,
    /cannot find module ['"][^'"]+['"]/i,
  ].some((pattern) => pattern.test(text));
}

function isBunxCommandAvailable(args: string[]): boolean {
  const target = getBunxCommandTarget(args);
  if (!target) return true;
  if (hasExplicitPackageVersion(target)) return true;

  const packageName = stripPackageVersion(target);
  return (
    DECLARED_BUNX_TARGETS.has(target) || DECLARED_BUNX_TARGETS.has(packageName)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Substitute {token} placeholders in args, including embedded (e.g. --flag={token})
function resolveArgs(args: string[]): string[] {
  return args.map((a) =>
    a.replace(/\{(\w+)\}/g, (whole, k) => TOKENS[`{${k}}`] ?? whole),
  );
}

function stripPackageVersion(specifier: string): string {
  if (!specifier.startsWith("@"))
    return specifier.split("@", 2)[0] ?? specifier;

  const slashIndex = specifier.indexOf("/");
  if (slashIndex < 0) return specifier;

  const versionIndex = specifier.indexOf("@", slashIndex + 1);
  return versionIndex < 0 ? specifier : specifier.slice(0, versionIndex);
}

function toCommand(value: unknown, fallbackDurationMs: number): Command | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.exitCode !== "number" ||
    typeof value.timedOut !== "boolean" ||
    typeof value.output !== "string"
  )
    return null;
  return withMissingDetection({
    durationMs:
      typeof value.durationMs === "number"
        ? value.durationMs
        : fallbackDurationMs,
    exitCode: value.exitCode,
    notFound: value.notFound === true ? true : undefined,
    output: value.output,
    timedOut: value.timedOut,
  });
}

function toInlineTypeScriptConfig(
  config: StepConfig["config"],
): InlineTypeScriptConfig | null {
  if (!isRecord(config)) return null;
  const source = config["source"];
  const data = config["data"];
  if (typeof source !== "string") return null;
  return {
    data: isRecord(data) ? data : {},
    source,
  };
}

function withMissingDetection(result: Command): Command {
  if (!hasMissingSignal(result.output)) return result;
  return {
    ...result,
    notFound: true,
  };
}

const ANSI = {
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  reset: "\x1b[0m",
  yellow: "\x1b[33m",
} as const;

const paint = (text: string, ...codes: string[]) =>
  `${codes.join("")}${text}${ANSI.reset}`;
const passFail = (status: "fail" | "pass") =>
  paint(
    status === "pass" ? "PASS" : "FAIL",
    ANSI.bold,
    status === "pass" ? ANSI.green : ANSI.red,
  );
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};
const row = (
  label: string,
  status: "fail" | "pass",
  details = "",
  durationMs?: number,
) => {
  const timing =
    durationMs !== undefined
      ? ` ${paint(formatDuration(durationMs), ANSI.gray)}`
      : "";
  return `${passFail(status)} ${paint(label.padEnd(13), ANSI.bold)} ${details}${timing}`;
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
  name: a.name ?? "(unnamed test)",
  suite: a.classname,
});
const where = ({ file, line, name, suite }: TestResult) =>
  `${file ?? "unknown-file"}${line ? `:${line}` : ""} - ${suite ? `${suite} > ` : ""}${name}`;

function applyOutputFilter(filter: OutputFilter, output: string): string {
  if (filter.type === "stripLines")
    return output
      .split(/\r?\n/)
      .filter((line) => !new RegExp(filter.pattern, "i").test(stripAnsi(line)))
      .join("\n")
      .trimEnd();
  return output;
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
    if (pat.type === "count") {
      const count = Array.from(n.matchAll(new RegExp(pat.regex, "gim"))).length;
      if (count > 0)
        return resolveSummaryTokens(
          pat.format.replaceAll("{count}", String(count)),
          null,
        );
    } else if (pat.type === "literal") {
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

async function estLintFiles(cfg: LintConfig): Promise<number> {
  const glob = new Bun.Glob(`**/*.{${cfg.globExtensions.join(",")}}`);
  let count = 0;
  for await (const fp of glob.scan({ absolute: false, cwd: process.cwd() })) {
    if (
      cfg.skipDirs.some((d) => fp.startsWith(`${d}/`) || fp.includes(`/${d}/`))
    )
      continue;
    if (++count >= cfg.maxFiles) return count;
  }
  return count;
}

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

// ---------------------------------------------------------------------------
// Output filters
// ---------------------------------------------------------------------------

function getRemainingTimeoutMs(deadlineMs: number): number {
  return Math.max(1, deadlineMs - Date.now());
}

function makeTimedOutCommand(label: string, timeoutMs: number): Command {
  return {
    exitCode: 124,
    output: `${label} exceeded the ${Math.ceil(timeoutMs / 1000)}-second timeout\n`,
    timedOut: true,
  };
}

// ---------------------------------------------------------------------------
// Summary builders
// ---------------------------------------------------------------------------

function parseCoverage(path: string) {
  if (!existsSync(path)) {
    console.error(
      `${paint("FAIL", ANSI.bold, ANSI.red)} ${COVERAGE_LABEL} report not found at ${path}`,
    );
    return { covered: 0, found: 0, ok: false, pct: 0 };
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
  const allHits = Array.from(hits.values()).flatMap((m) =>
    Array.from(m.values()),
  );
  const found = allHits.length;
  const covered = allHits.filter((h) => h > 0).length;
  if (!found) {
    console.error(
      `${paint("FAIL", ANSI.bold, ANSI.red)} No executable lines found in ${COVERAGE_LABEL} report`,
    );
    return { covered, found: 0, ok: false, pct: 0 };
  }
  const pct = (covered / found) * 100;
  return {
    covered,
    found,
    ok: pct >= CFG.thresholds.lineCoverageThreshold,
    pct,
  };
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
      failed: 1,
      failedTests: [
        {
          message: `Report file not found: ${reportPath}`,
          name: "JUnit report missing",
        },
      ],
      ok: false,
      passed: 0,
      skipped: 0,
      skippedTests: [],
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
    failed: failed.length,
    failedTests: failed,
    ok: failed.length === 0,
    passed,
    skipped: skipped.length,
    skippedTests: skipped,
  };
}

function printStepOutput(label: string, output: string) {
  console.log(`\n${paint(label, ANSI.bold)}`);
  if (!output.trim()) console.log(paint("(no output)", ANSI.gray));
  else
    process.stdout.write(
      output.endsWith("\n") ? output : `${output.replace(/\s+$/g, "")}\n`,
    );
}

function printTests(label: string, color: string, tests: TestResult[]) {
  if (!tests.length) return;
  console.log(`\n${paint(label, ANSI.bold, color)}`);
  for (const test of tests)
    console.log(
      `  ${paint("•", color)} ${paint(where(test), color)}${test.message ? ` [${test.message}]` : ""}`,
    );
}

function resolveSummaryTokens(
  format: string,
  match: null | RegExpMatchArray,
): string {
  return format.replace(/\{(\w+)\}/g, (whole, key) => {
    if (/^\d+$/.test(key)) return match?.[Number(key)] ?? "";
    return TOKENS[`{${key}}`] ?? whole;
  });
}

async function withStepTimeout(
  label: string,
  stepPromise: Promise<Command>,
  timeoutMs?: number,
): Promise<Command> {
  if (timeoutMs === undefined || timeoutMs <= 0) return stepPromise;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      stepPromise,
      new Promise<Command>((resolve) => {
        timeoutId = setTimeout(() => {
          resolve(makeTimedOutCommand(label, timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

const INLINE_TS_TRANSPILE = new Bun.Transpiler({ loader: "ts" });
const INLINE_TS_RUNNER_CACHE = new Map<string, InlineTypeScriptRunner>();

export async function runInlineTypeScriptStep(
  step: StepConfig,
  overrides: InlineTypeScriptOverrides = {},
): Promise<Command> {
  const startMs = Date.now();
  const inlineConfig = toInlineTypeScriptConfig(step.config);
  if (!inlineConfig)
    return withMissingDetection({
      durationMs: Date.now() - startMs,
      exitCode: 1,
      output: `${step.label} is missing a valid inline TypeScript config\n`,
      timedOut: false,
    });

  const makeResult = (exitCode: number, output: string, durationMs?: number) =>
    withMissingDetection({
      durationMs,
      exitCode,
      output,
      timedOut: false,
    });

  try {
    const runner = compileInlineTypeScriptRunner(inlineConfig.source);
    const result = await runner({
      cwd: process.cwd(),
      data: inlineConfig.data ?? {},
      dirname,
      existsSync,
      fail: (output, durationMs) => makeResult(1, output, durationMs),
      importModule:
        overrides.importModule ?? ((specifier) => import(specifier)),
      join,
      ok: (output, durationMs) => makeResult(0, output, durationMs),
      readFileSync,
      step,
    });
    const durationMs = Date.now() - startMs;
    return (
      toCommand(result, durationMs) ??
      makeResult(
        1,
        `${step.label} returned an invalid inline TypeScript result\n`,
        durationMs,
      )
    );
  } catch (e) {
    return makeResult(
      1,
      `${step.label} failed: ${e instanceof Error ? e.message : String(e)}\n`,
      Date.now() - startMs,
    );
  }
}

function compileInlineTypeScriptRunner(source: string): InlineTypeScriptRunner {
  const cached = INLINE_TS_RUNNER_CACHE.get(source);
  if (cached) return cached;

  const jsSource = INLINE_TS_TRANSPILE.transformSync(
    `const __runner = (${source});`,
  );
  const factory = new Function(
    `"use strict";\n${jsSource}\nreturn __runner;`,
  ) as () => InlineTypeScriptRunner | unknown;
  const runner = factory();
  if (typeof runner !== "function") {
    throw new Error(
      "inline TypeScript config must evaluate to an anonymous function",
    );
  }

  INLINE_TS_RUNNER_CACHE.set(source, runner as InlineTypeScriptRunner);
  return runner as InlineTypeScriptRunner;
}

async function run(
  cmd: string,
  args: string[],
  timeoutMs?: number,
  extraEnv?: Record<string, string>,
): Promise<Command> {
  const startMs = Date.now();
  if (cmd === "bunx" && !isBunxCommandAvailable(args)) {
    const target = getBunxCommandTarget(args) ?? "bunx target";
    return {
      durationMs: 0,
      exitCode: 127,
      notFound: true,
      output: `command not found: ${target}`,
      timedOut: false,
    };
  }
  if (!Bun.which(cmd))
    return {
      durationMs: 0,
      exitCode: 127,
      notFound: true,
      output: `command not found: ${cmd}`,
      timedOut: false,
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
    stderr: "pipe",
    stdin: "ignore",
    stdout: "pipe",
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
    ? { durationMs, exitCode: 124, output, timedOut: true }
    : withMissingDetection({
        durationMs,
        exitCode: exitCode ?? 1,
        output,
        timedOut: false,
      });
}

async function runLint(
  cfg: LintConfig,
  extraArgs: string[],
  timeoutMs?: number,
): Promise<Command> {
  const envC = process.env.ESLINT_CONCURRENCY;
  const fileCount = await estLintFiles(cfg);
  const concurrency =
    envC && /^\d+$/.test(envC)
      ? Number.parseInt(envC, 10)
      : getConcurrency(fileCount);
  return run(
    "bunx",
    [...cfg.args, String(concurrency), ...extraArgs],
    timeoutMs,
  );
}

// Handler registry — keyed by step "handler" field
const HANDLERS: Record<string, StepRunner> = {
  "inline-ts": (step, timeoutMs) =>
    withStepTimeout(step.label, runInlineTypeScriptStep(step), timeoutMs),
  lint: (step, timeoutMs) => runLint(step.config as LintConfig, [], timeoutMs),
  test: (step, timeoutMs) => {
    if (JUNIT_PATH) mkdirSync(dirname(JUNIT_PATH), { recursive: true });
    return run("bun", resolveArgs(step.args ?? []), timeoutMs);
  },
};

async function main() {
  const command = Bun.argv[2];
  const args = Bun.argv.slice(3);
  const writeOut = (output: string) =>
    process.stdout.write(
      output.endsWith("\n") ? output : `${output.replace(/\s+$/g, "")}\n`,
    );
  if (command === "lint") {
    const step = CFG.steps.find((s) => s.handler === "lint");
    const result = await runLint(
      step?.config as LintConfig,
      args,
      CHECK_SUITE_TIMEOUT_MS,
    );
    writeOut(result.output);
    process.exit(result.exitCode);
  }
  const flagKeys = Bun.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => a.slice(2));
  await runCheckSuite(flagKeys.length > 0 ? new Set(flagKeys) : null);
}

async function runCheckSuite(keyFilter?: null | Set<string>) {
  const startedAtMs = Date.now();
  const deadlineMs = startedAtMs + CHECK_SUITE_TIMEOUT_MS;
  process.stdout.write(paint("⏳ Please wait ... ", ANSI.bold, ANSI.cyan));

  const preRunSteps = keyFilter
    ? []
    : CFG.steps.filter((s) => s.preRun && s.enabled !== false);
  const mainSteps = CFG.steps.filter(
    (s) =>
      !s.preRun && s.enabled !== false && (!keyFilter || keyFilter.has(s.key)),
  );

  for (const step of preRunSteps) {
    const result = await runStep(step, getRemainingTimeoutMs(deadlineMs));
    if (result.timedOut) {
      printStepOutput(step.label, result.output);
      console.error(
        `Check command failed: bun check exceeded the ${CHECK_SUITE_TIMEOUT_MS / 1000}-second overall timeout. Please try again.`,
      );
      process.exit(1);
    }
  }

  const runs = Object.fromEntries(
    await Promise.all(
      mainSteps.map(
        async (s) =>
          [s.key, await runStep(s, getRemainingTimeoutMs(deadlineMs))] as const,
      ),
    ),
  ) as Record<string, Command>;

  const timedOut = Object.values(runs).some((r) => r.timedOut);
  const missingSteps = mainSteps
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

  const testRunnerKeys = new Set(
    CFG.steps
      .filter((step) => step.summary?.type === "test-runner")
      .map((step) => step.key),
  );
  const runTests =
    !keyFilter || Array.from(testRunnerKeys).some((key) => keyFilter.has(key));
  const tests = runTests
    ? parseTests(JUNIT_PATH)
    : {
        failed: 0,
        failedTests: [],
        ok: true,
        passed: 0,
        skipped: 0,
        skippedTests: [],
      };
  const coverage = runTests && LCOV_PATH ? parseCoverage(LCOV_PATH) : null;

  interface CheckRow {
    d: string;
    k: string;
    ms?: number;
    status: "fail" | "pass";
    stpk: null | string;
  }
  const checks: CheckRow[] = mainSteps.map((step) => {
    const cmd = runs[step.key];
    const isTestRunner = step.summary?.type === "test-runner";
    const d = isTestRunner
      ? `${tests.passed} passed · ${tests.failed} failed · ${tests.skipped} skipped · runner exit ${cmd.exitCode}`
      : buildSummary(step, cmd);
    return {
      d,
      k: step.label,
      ms: cmd.durationMs,
      status:
        cmd.exitCode === 0 && (!isTestRunner || tests.ok) ? "pass" : "fail",
      stpk: step.key,
    };
  });

  if (coverage)
    checks.push({
      d: `${coverage.pct.toFixed(2)}% (${coverage.covered}/${coverage.found}) · threshold ${CFG.thresholds.lineCoverageThreshold.toFixed(1)}%`,
      k: COVERAGE_LABEL,
      status: coverage.ok ? "pass" : "fail",
      stpk: null,
    });

  printTests("Failed tests", ANSI.red, tests.failedTests);
  printTests("Skipped tests", ANSI.gray, tests.skippedTests);

  if (missingSteps.length > 0)
    console.log(
      `\n${paint("missing/not found:", ANSI.bold, ANSI.yellow)} ${paint(missingSteps.join(", "), ANSI.yellow)}`,
    );

  const presentChecks = checks.filter(
    (c) => !c.stpk || !runs[c.stpk]?.notFound,
  );

  console.log(`\n${paint("Quality Summary", ANSI.bold, ANSI.cyan)}`);
  console.log(divider());
  for (const check of presentChecks)
    console.log(row(check.k, check.status, check.d, check.ms));
  console.log(divider());

  const allOk = presentChecks.every((c) => c.status !== "fail") && !timedOut;
  const elapsedSeconds = ((Date.now() - startedAtMs) / 1000).toFixed(2);
  console.log(
    row(
      "Overall",
      allOk ? "pass" : "fail",
      `${allOk ? "all checks passed" : "one or more checks failed"} (in ${elapsedSeconds} seconds)`,
    ),
  );
  console.log(divider());

  if (timedOut) {
    console.error(
      `Check command failed: bun check exceeded the ${CHECK_SUITE_TIMEOUT_MS / 1000}-second overall timeout. Please try again.`,
    );
    process.exit(1);
  }
  if (!allOk) process.exit(1);
}

function runStep(step: StepConfig, timeoutMs?: number): Promise<Command> {
  if (step.handler)
    return (
      HANDLERS[step.handler]?.(step, timeoutMs) ??
      Promise.resolve({
        exitCode: 1,
        output: `unknown handler: ${step.handler}`,
        timedOut: false,
      })
    );
  if (!step.cmd)
    return Promise.resolve({
      exitCode: 1,
      output: `step "${step.key}" missing cmd`,
      timedOut: false,
    });
  return run(step.cmd, resolveArgs(step.args ?? []), timeoutMs);
}

if (import.meta.main) void main();
