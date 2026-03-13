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
    checkSuiteTimeoutEnvVar?: string;
    checkSuiteTimeoutMs?: number;
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
  timeoutMs?: number | string;
}

type Summary =
  | {
      coverageLabel?: string;
      coveragePathToken?: string;
      reportPathToken?: string;
      type: "test-runner";
    }
  | { default: string; patterns: SummaryPattern[]; type: "pattern" }
  | { type: "simple" };

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

const TEST_COMMAND_TIMEOUT_MS = resolveTimeoutMs(
  CFG.thresholds.testCommandTimeoutEnvVar,
  CFG.thresholds.testCommandTimeoutMs,
  CFG.thresholds.testCommandTimeoutMs,
);
const SUITE_TIMEOUT_MS = resolveTimeoutMs(
  CFG.thresholds.checkSuiteTimeoutEnvVar ?? "",
  CFG.thresholds.checkSuiteTimeoutMs,
  TEST_COMMAND_TIMEOUT_MS,
);
const SUITE_LABEL =
  process.env["npm_lifecycle_event"]?.trim() || "quality suite";

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

interface Command {
  durationMs?: number;
  exitCode: number;
  notFound?: boolean;
  output: string;
  timedOut: boolean;
}

interface CoverageSummary {
  covered: number;
  found: number;
  issues: string[];
  ok: boolean;
  pct: number;
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

interface RunOptions {
  extraEnv?: Record<string, string>;
  label?: string;
  timeoutMs?: number;
}

type StepRunner = (
  step: StepConfig,
  timeoutMs?: number,
  extraArgs?: string[],
) => Promise<Command>;

interface TestResult {
  file?: string;
  line?: string;
  message?: string;
  name: string;
  suite?: string;
}

interface TestRunnerArtifacts {
  coverageLabel: string;
  coverageReportPath: string;
  testReportPath: string;
}

interface TestSummary {
  failed: number;
  failedTests: TestResult[];
  issues: string[];
  ok: boolean;
  passed: number;
  skipped: number;
  skippedTests: TestResult[];
}

export function resolveTimeoutMs(
  envVarName: string,
  configuredMs: number | undefined,
  fallbackMs: number,
): number {
  return (
    (envVarName ? parsePositiveTimeoutMs(process.env[envVarName]) : null) ??
    parsePositiveTimeoutMs(configuredMs) ??
    fallbackMs
  );
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

function parsePositiveTimeoutMs(
  value: number | string | undefined,
): null | number {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
  }
  if (typeof value !== "string") return null;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// Substitute {token} placeholders in args, including embedded (e.g. --flag={token})
function resolveArgs(args: string[]): string[] {
  return args.map((a) =>
    a.replace(/\{(\w+)\}/g, (whole, k) => TOKENS[`{${k}}`] ?? whole),
  );
}

function resolvePathToken(tokenName: string | undefined): string {
  if (!tokenName) return "";
  return TOKENS[`{${tokenName}}`] ?? "";
}

function resolveScalarToken(value: string): string {
  return value.replace(
    /\{(\w+)\}/g,
    (whole, key) => TOKENS[`{${key}}`] ?? whole,
  );
}

function resolveStepTimeoutMsValue(step: StepConfig): null | number {
  if (typeof step.timeoutMs === "number") {
    return parsePositiveTimeoutMs(step.timeoutMs);
  }
  if (typeof step.timeoutMs !== "string") return null;

  return parsePositiveTimeoutMs(resolveScalarToken(step.timeoutMs));
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
const SUMMARY_LABEL_WIDTH = 13;
const formatSummaryLabel = (label: string): string => {
  if (label.length <= SUMMARY_LABEL_WIDTH)
    return label.padEnd(SUMMARY_LABEL_WIDTH);
  return `${label.slice(0, SUMMARY_LABEL_WIDTH - 3)}...`;
};
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
  return `${passFail(status)} ${paint(formatSummaryLabel(label), ANSI.bold)} ${details}${timing}`;
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

interface DelayHandle<T> {
  cancel(): void;
  promise: Promise<T>;
}

interface KillableProcess {
  exited: Promise<null | number>;
  kill(signal?: number | string): void;
}

interface StreamCollector {
  done: Promise<void>;
  getOutput: () => string;
}

function appendTimedOutMessage(
  output: string,
  label: string,
  timeoutMs: number,
): string {
  const timeoutLine = makeTimedOutCommand(label, timeoutMs).output;
  if (!output.trim()) return timeoutLine;
  return `${output.endsWith("\n") ? output : `${output}\n`}${timeoutLine}`;
}

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
  if (cmd.exitCode === 0 && step.passMsg !== undefined) return step.passMsg;

  const { summary } = step;
  if (!summary || summary.type === "simple") {
    if (cmd.exitCode === 0) return "passed";
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

// ---------------------------------------------------------------------------
// Output filters
// ---------------------------------------------------------------------------

function createDelay<T>(ms: number, value: T): DelayHandle<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      resolve(value);
    }, ms);
    timeoutId.unref?.();
  });

  return {
    cancel() {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    },
    promise,
  };
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
// Summary builders
// ---------------------------------------------------------------------------

function getRemainingTimeoutMs(deadlineMs: number): number {
  return Math.max(1, deadlineMs - Date.now());
}

function getTestRunnerArtifacts(step: StepConfig): TestRunnerArtifacts {
  if (step.summary?.type !== "test-runner") {
    return {
      coverageLabel: "coverage",
      coverageReportPath: "",
      testReportPath: "",
    };
  }

  return {
    coverageLabel: step.summary.coverageLabel ?? "coverage",
    coverageReportPath: resolvePathToken(step.summary.coveragePathToken),
    testReportPath: resolvePathToken(step.summary.reportPathToken),
  };
}

function makeTimedOutCommand(label: string, timeoutMs: number): Command {
  return {
    exitCode: 124,
    output: `${label} exceeded the ${formatDuration(timeoutMs)} timeout\n`,
    timedOut: true,
  };
}

function parseCoverage(path: string): CoverageSummary {
  if (!existsSync(path)) {
    return {
      covered: 0,
      found: 0,
      issues: [
        `${paint("FAIL", ANSI.bold, ANSI.red)} No coverage report found at ${path}`,
      ],
      ok: false,
      pct: 0,
    };
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
    return {
      covered,
      found: 0,
      issues: [
        `${paint("FAIL", ANSI.bold, ANSI.red)} No executable lines found in coverage report`,
      ],
      ok: false,
      pct: 0,
    };
  }
  const pct = (covered / found) * 100;
  return {
    covered,
    found,
    issues: [],
    ok: pct >= CFG.thresholds.lineCoverageThreshold,
    pct,
  };
}

function parseTests(reportPath: string): TestSummary {
  if (!existsSync(reportPath)) {
    return {
      failed: 1,
      failedTests: [
        {
          message: `Report file not found: ${reportPath}`,
          name: "Test report missing",
        },
      ],
      issues: [
        paint(
          `FAIL [test-summary] Report file not found: ${reportPath}`,
          ANSI.red,
          ANSI.bold,
        ),
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
    issues: [],
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

const PROCESS_KILL_GRACE_MS = 250;
const STREAM_FLUSH_GRACE_MS = 250;

function createStreamCollector(
  stream: null | ReadableStream<Uint8Array> | undefined,
): StreamCollector {
  let output = "";

  if (!stream) {
    return {
      done: Promise.resolve(),
      getOutput: () => output,
    };
  }

  const done = (async () => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      for (;;) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        if (value) output += decoder.decode(value, { stream: true });
      }
    } catch {
      // Ignore collector errors so timeouts can still return partial output.
    } finally {
      output += decoder.decode();
      reader.releaseLock();
    }
  })();

  return {
    done,
    getOutput: () => output,
  };
}

async function flushCollectors(collectors: StreamCollector[]): Promise<void> {
  const delay = createDelay(STREAM_FLUSH_GRACE_MS, undefined);
  try {
    await Promise.race([
      Promise.all(collectors.map((collector) => collector.done)),
      delay.promise,
    ]);
  } finally {
    delay.cancel();
  }
}

async function terminateProcess(child: KillableProcess): Promise<void> {
  try {
    child.kill();
  } catch {
    return;
  }

  const exited = child.exited.catch(() => null);
  const gracefulDelay = createDelay(PROCESS_KILL_GRACE_MS, false);
  const exitedGracefully = await Promise.race([
    exited.then(() => true),
    gracefulDelay.promise,
  ]);
  gracefulDelay.cancel();
  if (exitedGracefully) return;

  try {
    child.kill("SIGKILL");
  } catch {
    // Ignore hard-kill failures. The caller will still return buffered output.
  }

  const killDelay = createDelay(PROCESS_KILL_GRACE_MS, null);
  try {
    await Promise.race([exited, killDelay.promise]);
  } finally {
    killDelay.cancel();
  }
}

const INLINE_TS_TRANSPILE = new Bun.Transpiler({ loader: "ts" });
const INLINE_TS_RUNNER_CACHE = new Map<string, InlineTypeScriptRunner>();

export async function run(
  cmd: string,
  args: string[],
  options: RunOptions = {},
): Promise<Command> {
  const startMs = Date.now();
  const { extraEnv, label = cmd, timeoutMs } = options;
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
  const stdoutCollector = createStreamCollector(child.stdout);
  const stderrCollector = createStreamCollector(child.stderr);
  const timeoutDelay =
    timeoutMs && timeoutMs > 0
      ? createDelay(timeoutMs, { kind: "timeout" as const })
      : null;
  const exitPromise = child.exited.then((exitCode) => ({
    exitCode: exitCode ?? 1,
    kind: "exit" as const,
  }));
  const outcome = await Promise.race(
    timeoutDelay ? [exitPromise, timeoutDelay.promise] : [exitPromise],
  );
  timeoutDelay?.cancel();

  if (outcome.kind === "timeout") {
    const activeTimeoutMs = timeoutMs ?? 1;
    await terminateProcess(child);
    await flushCollectors([stdoutCollector, stderrCollector]);
    return {
      durationMs: Date.now() - startMs,
      exitCode: 124,
      output: appendTimedOutMessage(
        `${stdoutCollector.getOutput()}${stderrCollector.getOutput()}`,
        label,
        activeTimeoutMs,
      ),
      timedOut: true,
    };
  }

  await flushCollectors([stdoutCollector, stderrCollector]);
  return withMissingDetection({
    durationMs: Date.now() - startMs,
    exitCode: outcome.exitCode,
    output: `${stdoutCollector.getOutput()}${stderrCollector.getOutput()}`,
    timedOut: false,
  });
}

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

async function runLint(
  step: StepConfig,
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
  return run("bunx", [...cfg.args, String(concurrency), ...extraArgs], {
    label: step.label,
    timeoutMs,
  });
}

// Handler registry — keyed by step "handler" field
const HANDLERS: Record<string, StepRunner> = {
  "inline-ts": (step, timeoutMs) =>
    withStepTimeout(step.label, runInlineTypeScriptStep(step), timeoutMs),
  lint: (step, timeoutMs, extraArgs = []) =>
    runLint(step, step.config as LintConfig, extraArgs, timeoutMs),
  test: (step, timeoutMs, extraArgs = []) => {
    const artifacts = getTestRunnerArtifacts(step);
    if (artifacts.testReportPath)
      mkdirSync(dirname(artifacts.testReportPath), { recursive: true });
    return run("bun", [...resolveArgs(step.args ?? []), ...extraArgs], {
      label: step.label,
      timeoutMs,
    });
  },
};

export async function runCheckSuite(keyFilter?: null | Set<string>) {
  const startedAtMs = Date.now();
  const deadlineMs = startedAtMs + SUITE_TIMEOUT_MS;
  process.stdout.write(paint("⏳ Please wait ... ", ANSI.bold, ANSI.cyan));

  const preRunSteps = keyFilter
    ? []
    : CFG.steps.filter((s) => s.preRun && s.enabled !== false);
  const mainSteps = CFG.steps.filter(
    (s) =>
      !s.preRun && s.enabled !== false && (!keyFilter || keyFilter.has(s.key)),
  );

  const preRunResults = await runStepBatch(preRunSteps, deadlineMs);
  const preRunTimedOut = Object.values(preRunResults).some(
    (run) => run.timedOut,
  );
  const executedMainSteps = preRunTimedOut ? [] : mainSteps;
  const mainResults = preRunTimedOut
    ? {}
    : await runStepBatch(mainSteps, deadlineMs);
  const runs = { ...preRunResults, ...mainResults };

  const timedOut = Object.values(runs).some((result) => result.timedOut);
  const allExecutedSteps = [...preRunSteps, ...executedMainSteps];
  const missingSteps = allExecutedSteps
    .filter((step) => runs[step.key]?.notFound)
    .map((s) => s.label);

  for (const step of allExecutedSteps) {
    if (runs[step.key]?.notFound) continue;
    printStepOutput(
      step.label,
      step.outputFilter
        ? applyOutputFilter(step.outputFilter, runs[step.key].output)
        : runs[step.key].output,
    );
  }

  const selectedTestRunnerStep = executedMainSteps.find(
    (step) => step.summary?.type === "test-runner",
  );
  const testRunnerArtifacts = selectedTestRunnerStep
    ? getTestRunnerArtifacts(selectedTestRunnerStep)
    : null;
  const runTests = !timedOut && selectedTestRunnerStep !== undefined;
  const tests =
    runTests && testRunnerArtifacts
      ? parseTests(testRunnerArtifacts.testReportPath)
      : {
          failed: 0,
          failedTests: [],
          issues: [],
          ok: true,
          passed: 0,
          skipped: 0,
          skippedTests: [],
        };
  const coverage =
    runTests && testRunnerArtifacts?.coverageReportPath
      ? parseCoverage(testRunnerArtifacts.coverageReportPath)
      : null;

  interface CheckRow {
    d: string;
    k: string;
    ms?: number;
    status: "fail" | "pass";
    stpk: null | string;
  }
  const checks: CheckRow[] = executedMainSteps.map((step) => {
    const cmd = runs[step.key];
    const isTestRunner = step.summary?.type === "test-runner";
    const status: "fail" | "pass" =
      cmd.exitCode === 0 && (!isTestRunner || tests.ok) ? "pass" : "fail";
    const d =
      isTestRunner && status === "fail"
        ? `${tests.passed} passed · ${tests.failed} failed · ${tests.skipped} skipped · runner exit ${cmd.exitCode}`
        : buildSummary(step, cmd);
    return {
      d,
      k: step.label,
      ms: cmd.durationMs,
      status,
      stpk: step.key,
    };
  });

  if (coverage)
    checks.push({
      d: `${coverage.pct.toFixed(2)}% (${coverage.covered}/${coverage.found}) · threshold ${CFG.thresholds.lineCoverageThreshold.toFixed(1)}%`,
      k: testRunnerArtifacts?.coverageLabel ?? "coverage",
      status: coverage.ok ? "pass" : "fail",
      stpk: null,
    });

  for (const issue of [...tests.issues, ...(coverage?.issues ?? [])]) {
    console.log(`\n${issue}`);
  }

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
      `Check command failed: ${SUITE_LABEL} exceeded the ${(SUITE_TIMEOUT_MS / 1000).toFixed(2)}-second overall timeout. Please try again.`,
    );
    process.exit(1);
  }
  if (!allOk) process.exit(1);
}

function getStepTimeoutMs(step: StepConfig, deadlineMs: number): number {
  const remainingTimeoutMs = getRemainingTimeoutMs(deadlineMs);
  const configuredTimeoutMs = resolveStepTimeoutMsValue(step);
  if (configuredTimeoutMs !== null) {
    return Math.min(configuredTimeoutMs, remainingTimeoutMs);
  }

  return remainingTimeoutMs;
}

async function main() {
  const command = Bun.argv[2];
  const args = Bun.argv.slice(3);
  const writeOut = (output: string) =>
    process.stdout.write(
      output.endsWith("\n") ? output : `${output.replace(/\s+$/g, "")}\n`,
    );
  const directStep =
    command && !command.startsWith("--")
      ? CFG.steps.find((step) => step.key === command && step.enabled !== false)
      : undefined;
  if (directStep) {
    const result = await runStep(
      directStep,
      getStepTimeoutMs(directStep, Date.now() + SUITE_TIMEOUT_MS),
      args,
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

function runStep(
  step: StepConfig,
  timeoutMs?: number,
  extraArgs: string[] = [],
): Promise<Command> {
  if (step.handler)
    return (
      HANDLERS[step.handler]?.(step, timeoutMs, extraArgs) ??
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
  return run(step.cmd, [...resolveArgs(step.args ?? []), ...extraArgs], {
    label: step.label,
    timeoutMs,
  });
}

async function runStepBatch(
  steps: StepConfig[],
  deadlineMs: number,
): Promise<Record<string, Command>> {
  return Object.fromEntries(
    await Promise.all(
      steps.map(
        async (step) =>
          [
            step.key,
            await runStep(step, getStepTimeoutMs(step, deadlineMs)),
          ] as const,
      ),
    ),
  ) as Record<string, Command>;
}

export { applyOutputFilter, buildSummary, parseCoverage, parseTests };

if (import.meta.main) void main();
