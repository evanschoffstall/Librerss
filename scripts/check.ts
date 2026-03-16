import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { availableParallelism, cpus } from "node:os";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

interface CheckConfig {
  /** All path values are joined to cwd and exposed as `{key}` tokens. */
  paths: Record<string, string>;
  steps: StepConfig[];
  /** Suite-level wall-clock timeout — overridable via `timeoutEnvVar`. */
  suite?: {
    timeoutEnvVar?: string;
    timeoutMs?: number;
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
  ensureDirs?: string[];
  failMsg?: string;
  handler?: string;
  key: string;
  label: string;
  outputFilter?: OutputFilter;
  passMsg?: string;
  postProcess?: InlineTypeScriptConfig | Record<string, unknown>;
  preRun?: boolean;
  summary?: Summary;
  /** Max drain time for buffered output after a timed-out step is terminated. */
  timeoutDrainMs?: number | string;
  /** Environment variable that overrides `timeoutMs` at runtime. */
  timeoutEnvVar?: string;
  timeoutMs?: number | string;
  /** Step-local scalar token store exposed as `{key}` placeholders. */
  tokens?: Record<string, number | string>;
}

type Summary =
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

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const PROJECT_MANIFEST: PackageManifest = (() => {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as PackageManifest;
  } catch {
    return {};
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

const SUITE_TIMEOUT_MS = resolveTimeoutMs(
  CFG.suite?.timeoutEnvVar ?? "",
  CFG.suite?.timeoutMs,
  120_000,
);
const SUITE_LABEL =
  process.env["npm_lifecycle_event"]?.trim() || "quality suite";

// Auto-derive shared path tokens: every key in "paths" becomes a cwd-joined
// `{token}` available to any step.
const PATH_TOKENS: Record<string, string> = (() => {
  const t: Record<string, string> = {};
  for (const [k, v] of Object.entries(CFG.paths))
    t[`{${k}}`] = join(process.cwd(), v);
  return t;
})();

interface CliArguments {
  directStep?: StepConfig;
  directStepArgs: string[];
  invalidSuiteFlags: string[];
  keyFilter: null | Set<string>;
  summaryOnly: boolean;
}

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

interface InlineTypeScriptPostProcessContext {
  command: Command;
  cwd: string;
  data: Record<string, unknown>;
  displayOutput: string;
  existsSync: typeof existsSync;
  helpers: {
    compactDomAssertionNoise: typeof compactDomAssertionNoise;
    stripAnsi: typeof stripAnsi;
  };
  join: typeof join;
  readFileSync: typeof readFileSync;
  resolveTokenString: (value: string) => string;
  step: StepConfig;
  tokens: Record<string, string>;
}

type InlineTypeScriptPostProcessor = (
  context: InlineTypeScriptPostProcessContext,
) => Promise<StepPostProcessResult> | StepPostProcessResult;

interface PostProcessMessage {
  text: string;
  tone?: PostProcessTone;
}

interface PostProcessSection {
  items: string[];
  title: string;
  tone?: PostProcessTone;
}

type PostProcessTone = "fail" | "info" | "pass" | "warn";

interface ProcessedCheck {
  details: string;
  label: string;
  status: "fail" | "pass";
}
interface RunOptions {
  extraEnv?: Record<string, string>;
  label?: string;
  timeoutDrainMs?: number;
  timeoutMs?: number;
}

interface StepPostProcessResult {
  extraChecks?: ProcessedCheck[];
  messages?: PostProcessMessage[];
  output?: string;
  sections?: PostProcessSection[];
  status?: "fail" | "pass";
  summary?: string;
}

type StepRunner = (
  step: StepConfig,
  timeoutMs?: number,
  extraArgs?: string[],
) => Promise<Command>;

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

/** Returns the enabled non-pre-run step keys that can be selected from the CLI. */
function getRunnableSuiteStepKeys(): Set<string> {
  return new Set(
    CFG.steps
      .filter((step) => !step.preRun && step.enabled !== false)
      .map((step) => step.key),
  );
}

function getStepTokens(
  step: Pick<StepConfig, "tokens">,
): Record<string, string> {
  const tokens = { ...PATH_TOKENS };
  for (const [key, value] of Object.entries(step.tokens ?? {})) {
    tokens[`{${key}}`] = String(value);
  }
  return tokens;
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
    /\bscript not found\b/i,
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

/** Resolves `{token}` placeholders in a string via a token map. */
function resolveTokenString(
  value: string,
  tokens: Record<string, string>,
): string {
  return value.replace(
    /\{(\w+)\}/g,
    (whole, key) => tokens[`{${key}}`] ?? whole,
  );
}

/** Resolves `{token}` placeholders in each element of an args array. */
const resolveArgs = (args: string[], tokens: Record<string, string>) =>
  args.map((argument) => resolveTokenString(argument, tokens));

function resolveStepTimeoutDrainMsValue(step: StepConfig): null | number {
  if (typeof step.timeoutDrainMs === "number")
    return parsePositiveTimeoutMs(step.timeoutDrainMs);
  if (typeof step.timeoutDrainMs !== "string") return null;
  return parsePositiveTimeoutMs(
    resolveTokenString(step.timeoutDrainMs, getStepTokens(step)),
  );
}

function resolveStepTimeoutMsValue(step: StepConfig): null | number {
  const envMs = step.timeoutEnvVar
    ? parsePositiveTimeoutMs(process.env[step.timeoutEnvVar])
    : null;
  if (envMs !== null) return envMs;
  if (typeof step.timeoutMs === "number")
    return parsePositiveTimeoutMs(step.timeoutMs);
  if (typeof step.timeoutMs !== "string") return null;
  return parsePositiveTimeoutMs(
    resolveTokenString(step.timeoutMs, getStepTokens(step)),
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

const DOM_ASSERTION_RECEIVED_LINE =
  /^Received:\s+(?:HTML|SVG|Window|Document|Element|Node|NodeList|HTMLCollection|Text)\w*\s*\{/;

function appendTimedOutDrainMessage(
  output: string,
  label: string,
  timeoutDrainMs: number,
): string {
  const drainLine = `${label} output drain exceeded the ${formatDuration(timeoutDrainMs)} timeout after termination\n`;
  if (!output.trim()) return drainLine;
  return `${output.endsWith("\n") ? output : `${output}\n`}${drainLine}`;
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
  const tokens = getStepTokens(step);
  if (!summary || summary.type === "simple") {
    if (cmd.exitCode === 0) return "passed";

    if (cmd.timedOut) {
      const timeoutLine =
        splitLines(cmd.output)
          .reverse()
          .find((line) => /\btimeout\b/i.test(line)) ??
        `${step.label} exceeded its timeout`;
      return step.failMsg ? `${step.failMsg}: ${timeoutLine}` : timeoutLine;
    }

    const firstError = splitLines(cmd.output).find((l) => !l.startsWith("$ "));
    return firstError
      ? `${step.failMsg ?? "failed"}: ${firstError}`
      : (step.failMsg ?? "failed");
  }
  // pattern
  const n = norm(cmd.output);
  for (const pat of summary.patterns) {
    if (pat.type === "count") {
      const count = Array.from(n.matchAll(new RegExp(pat.regex, "gim"))).length;
      if (count > 0)
        return resolveSummaryTokens(
          pat.format.replaceAll("{count}", String(count)),
          null,
          tokens,
        );
    } else if (pat.type === "literal") {
      if (new RegExp(pat.regex, "i").test(n))
        return resolveSummaryTokens(pat.format, null, tokens);
    } else if (pat.type === "match") {
      const m = n.match(new RegExp(pat.regex, "i"));
      if (m) return resolveSummaryTokens(pat.format, m, tokens);
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

/**
 * Collapses oversized Happy DOM assertion dumps so test failures stay readable
 * even when Bun serializes full DOM nodes into the reporter output.
 */
function compactDomAssertionNoise(output: string): string {
  const lines = output.split(/\r?\n/);
  const compacted: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const plainLine = stripAnsi(line);

    if (!DOM_ASSERTION_RECEIVED_LINE.test(plainLine)) {
      compacted.push(line);
      continue;
    }

    let skippedLineCount = 0;
    compacted.push(line.replace(/\{\s*$/, "{ /* DOM tree omitted */ }"));

    for (index += 1; index < lines.length; index += 1) {
      const nextLine = lines[index] ?? "";
      const plainNextLine = stripAnsi(nextLine);

      if (
        plainNextLine.length === 0 ||
        /^\s*at\s/.test(plainNextLine) ||
        /^\s*\d+\s+\|/.test(plainNextLine) ||
        /^error:\s/.test(plainNextLine) ||
        /^Bun v/.test(plainNextLine) ||
        /^pass\s/.test(plainNextLine) ||
        /^fail\s/.test(plainNextLine)
      ) {
        index -= 1;
        break;
      }

      skippedLineCount += 1;
    }

    if (skippedLineCount > 0)
      compacted.push(
        `  ... omitted ${skippedLineCount} DOM detail line(s) ...`,
      );
  }

  return compacted.join("\n");
}

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

// ---------------------------------------------------------------------------
// Output filters
// ---------------------------------------------------------------------------

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

/** Returns the remaining suite budget in milliseconds without clamping. */
function getRemainingTimeoutMs(deadlineMs: number): number {
  return deadlineMs - Date.now();
}

// ---------------------------------------------------------------------------
// Summary builders
// ---------------------------------------------------------------------------

/** Reports whether the overall suite deadline has already been exhausted. */
function hasDeadlineExpired(deadlineMs: number): boolean {
  return getRemainingTimeoutMs(deadlineMs) <= 0;
}

function makeTimedOutCommand(label: string, timeoutMs: number): Command {
  return {
    exitCode: 124,
    output: `${label} exceeded the ${formatDuration(timeoutMs)} timeout\n`,
    timedOut: true,
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

function resolveSummaryTokens(
  format: string,
  match: null | RegExpMatchArray,
  tokens: Record<string, string>,
): string {
  return format.replace(/\{(\w+)\}/g, (whole, key) => {
    if (/^\d+$/.test(key)) return match?.[Number(key)] ?? "";
    return tokens[`{${key}}`] ?? whole;
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
const INLINE_TS_FUNCTION_CACHE = new Map<
  string,
  (context: unknown) => Promise<unknown> | unknown
>();

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

async function flushCollectors(
  collectors: StreamCollector[],
  timeoutMs = STREAM_FLUSH_GRACE_MS,
): Promise<boolean> {
  const delay = createDelay(timeoutMs, false);
  try {
    const outcome = await Promise.race([
      Promise.all(collectors.map((collector) => collector.done)).then(
        () => true,
      ),
      delay.promise,
    ]);
    return outcome;
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

export async function run(
  cmd: string,
  args: string[],
  options: RunOptions = {},
): Promise<Command> {
  const startMs = Date.now();
  const { extraEnv, label = cmd, timeoutDrainMs, timeoutMs } = options;
  const activeTimeoutDrainMs =
    parsePositiveTimeoutMs(timeoutDrainMs) ?? STREAM_FLUSH_GRACE_MS;
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
    const didFlushOutput = await flushCollectors(
      [stdoutCollector, stderrCollector],
      activeTimeoutDrainMs,
    );
    let output = appendTimedOutMessage(
      `${stdoutCollector.getOutput()}${stderrCollector.getOutput()}`,
      label,
      activeTimeoutMs,
    );
    if (!didFlushOutput) {
      output = appendTimedOutDrainMessage(output, label, activeTimeoutDrainMs);
    }
    return {
      durationMs: Date.now() - startMs,
      exitCode: 124,
      output,
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
    const runner = compileInlineTypeScriptFunction<
      InlineTypeScriptContext,
      Command
    >(inlineConfig.source);
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

function compileInlineTypeScriptFunction<TContext, TResult>(
  source: string,
): (context: TContext) => Promise<TResult> | TResult {
  const cached = INLINE_TS_FUNCTION_CACHE.get(source);
  if (cached)
    return cached as (context: TContext) => Promise<TResult> | TResult;

  const jsSource = INLINE_TS_TRANSPILE.transformSync(
    `const __runner = (${source});`,
  );
  const factory = new Function(
    `"use strict";\n${jsSource}\nreturn __runner;`,
  ) as () => unknown;
  const runner = factory();
  if (typeof runner !== "function") {
    throw new Error(
      "inline TypeScript config must evaluate to an anonymous function",
    );
  }

  INLINE_TS_FUNCTION_CACHE.set(
    source,
    runner as (context: unknown) => Promise<unknown> | unknown,
  );
  return runner as (context: TContext) => Promise<TResult> | TResult;
}

function ensureStepDirectories(step: StepConfig): void {
  const tokens = getStepTokens(step);
  for (const entry of step.ensureDirs ?? []) {
    mkdirSync(resolveConfiguredPath(resolveTokenString(entry, tokens)), {
      recursive: true,
    });
  }
}

function getToneColor(tone: PostProcessTone | undefined): string {
  switch (tone) {
    case "fail": {
      return ANSI.red;
    }
    case "pass": {
      return ANSI.green;
    }
    case "warn": {
      return ANSI.yellow;
    }
    default: {
      return ANSI.gray;
    }
  }
}

function normalizeTone(value: unknown): PostProcessTone | undefined {
  return value === "fail" ||
    value === "info" ||
    value === "pass" ||
    value === "warn"
    ? value
    : undefined;
}

function printPostProcessMessages(messages: PostProcessMessage[]): void {
  for (const message of messages) {
    console.log(
      `\n${paint(message.text, ANSI.bold, getToneColor(message.tone))}`,
    );
  }
}

function printPostProcessSections(sections: PostProcessSection[]): void {
  for (const section of sections) {
    const color = getToneColor(section.tone);
    console.log(`\n${paint(section.title, ANSI.bold, color)}`);
    for (const item of section.items) {
      console.log(`  ${paint("•", color)} ${paint(item, color)}`);
    }
  }
}

function resolveConfiguredPath(entry: string): string {
  return entry.startsWith("/") ? entry : join(process.cwd(), entry);
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

async function runStepPostProcess(
  step: StepConfig,
  command: Command,
  displayOutput: string,
): Promise<null | StepPostProcessResult> {
  const inlineConfig = toInlineTypeScriptConfig(step.postProcess);
  if (!inlineConfig || command.notFound || command.timedOut) return null;

  try {
    const postProcessor = compileInlineTypeScriptFunction<
      InlineTypeScriptPostProcessContext,
      StepPostProcessResult
    >(inlineConfig.source) as InlineTypeScriptPostProcessor;
    const tokens = getStepTokens(step);
    const processedResult = await postProcessor({
      command,
      cwd: process.cwd(),
      data: inlineConfig.data ?? {},
      displayOutput,
      existsSync,
      helpers: {
        compactDomAssertionNoise,
        stripAnsi,
      },
      join,
      readFileSync,
      resolveTokenString: (value) => resolveTokenString(value, tokens),
      step,
      tokens,
    });

    const normalizedResult = toStepPostProcessResult(processedResult);
    if (normalizedResult) return normalizedResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      messages: [
        {
          text: `${step.label} post-process failed: ${message}`,
          tone: "fail",
        },
      ],
      status: "fail",
      summary: `${step.label} post-process failed`,
    };
  }

  return {
    messages: [
      {
        text: `${step.label} post-process returned an invalid result`,
        tone: "fail",
      },
    ],
    status: "fail",
    summary: `${step.label} post-process returned an invalid result`,
  };
}

function toPostProcessMessage(value: unknown): null | PostProcessMessage {
  if (!isRecord(value)) return null;
  const text = value["text"];
  if (typeof text !== "string") return null;
  return {
    text,
    tone: normalizeTone(value["tone"]),
  };
}

function toPostProcessSection(value: unknown): null | PostProcessSection {
  if (!isRecord(value)) return null;
  const title = value["title"];
  const items = value["items"];
  if (
    typeof title !== "string" ||
    !Array.isArray(items) ||
    items.some((item) => typeof item !== "string")
  ) {
    return null;
  }
  return {
    items,
    title,
    tone: normalizeTone(value["tone"]),
  };
}

function toProcessedCheck(value: unknown): null | ProcessedCheck {
  if (!isRecord(value)) return null;
  const label = value["label"];
  const details = value["details"];
  const status = value["status"];
  if (
    typeof label !== "string" ||
    typeof details !== "string" ||
    (status !== "fail" && status !== "pass")
  ) {
    return null;
  }

  return { details, label, status };
}

function toStepPostProcessResult(value: unknown): null | StepPostProcessResult {
  if (!isRecord(value)) return null;

  const extraChecks = value["extraChecks"];
  const messages = value["messages"];
  const output = value["output"];
  const sections = value["sections"];
  const status = value["status"];
  const summary = value["summary"];

  if (output !== undefined && typeof output !== "string") return null;
  if (summary !== undefined && typeof summary !== "string") return null;
  if (status !== undefined && status !== "fail" && status !== "pass")
    return null;

  const normalizedExtraChecks =
    extraChecks === undefined
      ? undefined
      : Array.isArray(extraChecks)
        ? extraChecks
            .map((entry) => toProcessedCheck(entry))
            .filter((entry): entry is ProcessedCheck => entry !== null)
        : null;
  if (normalizedExtraChecks === null) return null;

  const normalizedMessages =
    messages === undefined
      ? undefined
      : Array.isArray(messages)
        ? messages
            .map((entry) => toPostProcessMessage(entry))
            .filter((entry): entry is PostProcessMessage => entry !== null)
        : null;
  if (normalizedMessages === null) return null;

  const normalizedSections =
    sections === undefined
      ? undefined
      : Array.isArray(sections)
        ? sections
            .map((entry) => toPostProcessSection(entry))
            .filter((entry): entry is PostProcessSection => entry !== null)
        : null;
  if (normalizedSections === null) return null;

  return {
    extraChecks: normalizedExtraChecks,
    messages: normalizedMessages,
    output,
    sections: normalizedSections,
    status,
    summary,
  };
}

// Handler registry — keyed by step "handler" field
const HANDLERS: Record<string, StepRunner> = {
  "inline-ts": (step, timeoutMs) =>
    withStepTimeout(step.label, runInlineTypeScriptStep(step), timeoutMs),
  lint: (step, timeoutMs, extraArgs = []) =>
    runLint(step, step.config as LintConfig, extraArgs, timeoutMs),
};

/** Splits CLI arguments into global flags, step filters, and direct step execution. */
export function parseCliArguments(argv: string[]): CliArguments {
  const command = argv[2];
  const directStep =
    command && !command.startsWith("--")
      ? CFG.steps.find((step) => step.key === command && step.enabled !== false)
      : undefined;

  if (directStep) {
    return {
      directStep,
      directStepArgs: argv.slice(3),
      invalidSuiteFlags: [],
      keyFilter: null,
      summaryOnly: false,
    };
  }

  const globalFlags = new Set(["summary"]);
  const runnableSuiteStepKeys = getRunnableSuiteStepKeys();
  const summaryOnly = argv.slice(2).includes("--summary");
  const suiteFlags = argv
    .slice(2)
    .filter((argument) => argument.startsWith("--"))
    .map((argument) => argument.slice(2));
  const suiteStepKeys = suiteFlags.filter((flag) => !globalFlags.has(flag));
  const invalidSuiteFlags = suiteStepKeys.filter(
    (flag) => !runnableSuiteStepKeys.has(flag),
  );

  return {
    directStep: undefined,
    directStepArgs: [],
    invalidSuiteFlags,
    keyFilter: suiteStepKeys.length > 0 ? new Set(suiteStepKeys) : null,
    summaryOnly,
  };
}

/** Runs the configured quality suite with optional step filtering and summary mode. */
export async function runCheckSuite(
  keyFilter?: null | Set<string>,
  options: { summaryOnly?: boolean } = {},
) {
  const startedAtMs = Date.now();
  const deadlineMs = startedAtMs + SUITE_TIMEOUT_MS;
  const summaryOnly = options.summaryOnly === true;
  if (!summaryOnly) {
    process.stdout.write(paint("⏳ Please wait ... ", ANSI.bold, ANSI.cyan));
  }

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
  const suiteExpiredBeforeMain =
    !preRunTimedOut && hasDeadlineExpired(deadlineMs);
  const executedMainSteps =
    preRunTimedOut || suiteExpiredBeforeMain ? [] : mainSteps;
  const mainResults =
    preRunTimedOut || suiteExpiredBeforeMain
      ? {}
      : await runStepBatch(mainSteps, deadlineMs);
  const runs = { ...preRunResults, ...mainResults };
  const suiteExpiredBeforeOutput =
    !preRunTimedOut &&
    !suiteExpiredBeforeMain &&
    hasDeadlineExpired(deadlineMs);

  const timedOut =
    suiteExpiredBeforeMain ||
    suiteExpiredBeforeOutput ||
    Object.values(runs).some((result) => result.timedOut);
  const allExecutedSteps = [...preRunSteps, ...executedMainSteps];
  const missingSteps = allExecutedSteps
    .filter((step) => runs[step.key]?.notFound)
    .map((s) => s.label);
  const processedResults = suiteExpiredBeforeOutput
    ? Object.fromEntries(
        allExecutedSteps.map((step) => {
          const filteredOutput = step.outputFilter
            ? applyOutputFilter(step.outputFilter, runs[step.key].output)
            : runs[step.key].output;
          return [
            step.key,
            { displayOutput: filteredOutput, postProcess: null },
          ] as const;
        }),
      )
    : Object.fromEntries(
        await Promise.all(
          allExecutedSteps.map(async (step) => {
            const filteredOutput = step.outputFilter
              ? applyOutputFilter(step.outputFilter, runs[step.key].output)
              : runs[step.key].output;
            return [
              step.key,
              {
                displayOutput: filteredOutput,
                postProcess: await runStepPostProcess(
                  step,
                  runs[step.key],
                  filteredOutput,
                ),
              },
            ] as const;
          }),
        ),
      );

  if (!summaryOnly && !suiteExpiredBeforeOutput) {
    for (const step of allExecutedSteps) {
      if (runs[step.key]?.notFound) continue;
      const displayOutput =
        processedResults[step.key]?.postProcess?.output ??
        processedResults[step.key]?.displayOutput ??
        runs[step.key].output;
      printStepOutput(step.label, displayOutput);
    }
  }

  interface CheckRow {
    d: string;
    k: string;
    ms?: number;
    status: "fail" | "pass";
    stpk: null | string;
  }
  const checks: CheckRow[] = executedMainSteps.flatMap((step) => {
    const cmd = runs[step.key];
    const processed = processedResults[step.key]?.postProcess;
    const stepCheck: CheckRow = {
      d: processed?.summary ?? buildSummary(step, cmd),
      k: step.label,
      ms: cmd.durationMs,
      status: processed?.status ?? (cmd.exitCode === 0 ? "pass" : "fail"),
      stpk: step.key,
    };
    const extraChecks = (processed?.extraChecks ?? []).map((check) => ({
      d: check.details,
      k: check.label,
      status: check.status,
      stpk: null,
    }));
    return [stepCheck, ...extraChecks];
  });

  if (!summaryOnly) {
    if (suiteExpiredBeforeOutput) {
      console.log(
        `\n${paint("Suite deadline reached before detailed output; skipping step output and post-processing.", ANSI.bold, ANSI.yellow)}`,
      );
    }

    for (const step of executedMainSteps) {
      if (suiteExpiredBeforeOutput) break;
      const processed = processedResults[step.key]?.postProcess;
      if (processed?.messages?.length) {
        printPostProcessMessages(processed.messages);
      }
      if (processed?.sections?.length) {
        printPostProcessSections(processed.sections);
      }
    }

    if (missingSteps.length > 0)
      console.log(
        `\n${paint("missing/not found:", ANSI.bold, ANSI.yellow)} ${paint(missingSteps.join(", "), ANSI.yellow)}`,
      );
  }

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

/** Runs a parallel batch while refusing to start steps after the deadline. */
export async function runStepBatch(
  steps: StepConfig[],
  deadlineMs: number,
): Promise<Record<string, Command>> {
  return Object.fromEntries(
    await Promise.all(
      steps.map(
        async (step) =>
          [step.key, await runStepWithinDeadline(step, deadlineMs)] as const,
      ),
    ),
  ) as Record<string, Command>;
}

/**
 * Runs a step only when the suite still has time budget remaining.
 *
 * This prevents late steps from spawning child processes or inline handlers
 * after a long pre-run phase has already consumed the suite timeout.
 */
export function runStepWithinDeadline(
  step: StepConfig,
  deadlineMs: number,
  extraArgs: string[] = [],
): Promise<Command> {
  const timeoutMs = getStepTimeoutMs(step, deadlineMs);
  if (timeoutMs <= 0) {
    return Promise.resolve(makeTimedOutCommand(step.label, 0));
  }

  return runStep(step, timeoutMs, extraArgs);
}

function getStepTimeoutMs(step: StepConfig, deadlineMs: number): number {
  const remainingTimeoutMs = getRemainingTimeoutMs(deadlineMs);
  if (remainingTimeoutMs <= 0) {
    return 0;
  }

  const configuredTimeoutMs = resolveStepTimeoutMsValue(step);
  if (configuredTimeoutMs !== null) {
    return Math.min(configuredTimeoutMs, remainingTimeoutMs);
  }

  return remainingTimeoutMs;
}

async function main() {
  const cliArguments = parseCliArguments(Bun.argv);
  const writeOut = (output: string) =>
    process.stdout.write(
      output.endsWith("\n") ? output : `${output.replace(/\s+$/g, "")}\n`,
    );

  if (cliArguments.invalidSuiteFlags.length > 0) {
    writeOut(
      `unknown suite flag(s): ${cliArguments.invalidSuiteFlags.join(", ")}`,
    );
    process.exit(1);
  }

  if (cliArguments.directStep) {
    const result = await runStepWithinDeadline(
      cliArguments.directStep,
      Date.now() + SUITE_TIMEOUT_MS,
      cliArguments.directStepArgs,
    );
    writeOut(result.output);
    process.exit(result.exitCode);
  }

  await runCheckSuite(cliArguments.keyFilter, {
    summaryOnly: cliArguments.summaryOnly,
  });
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

  ensureStepDirectories(step);
  const tokens = getStepTokens(step);

  return run(
    step.cmd,
    [...resolveArgs(step.args ?? [], tokens), ...extraArgs],
    {
      label: step.label,
      timeoutDrainMs: resolveStepTimeoutDrainMsValue(step) ?? undefined,
      timeoutMs,
    },
  );
}

/** Limits CLI auto-execution to direct `bun scripts/check.ts` entrypoints. */
function shouldAutoRunCheckCli(argv: string[]): boolean {
  const invokedScriptPath = argv[1];
  return (
    typeof invokedScriptPath === "string" &&
    invokedScriptPath.endsWith("/scripts/check.ts")
  );
}

export {
  applyOutputFilter,
  buildSummary,
  compactDomAssertionNoise,
  runStepPostProcess,
};

if (import.meta.main && shouldAutoRunCheckCli(Bun.argv)) void main();
