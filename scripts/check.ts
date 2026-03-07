import { existsSync, readFileSync } from "node:fs";
import { availableParallelism, cpus } from "node:os";
import { join } from "node:path";

const LINE_COVERAGE_THRESHOLD = 80;
const TEST_TIMEOUT_MS = 5_000;
const TEST_COMMAND_TIMEOUT_MS = Number.parseInt(
  process.env.CHECK_TEST_COMMAND_TIMEOUT_MS ?? "100000",
  10,
);
const COVERAGE_EXCLUDED_FILES: string[] = [];

const JUNIT_PATH = join(process.cwd(), "coverage", "test-results.xml");
const LCOV_PATH = join(process.cwd(), "coverage", "lcov.info");

type Cmd = [string, string[]];
const CMD_PRETTIER_FMT: Cmd = ["bunx", ["prettier", "--write", "."]];
const CMD_BUN_TEST: Cmd = [
  "bun",
  [
    "test",
    `--timeout=${TEST_TIMEOUT_MS}`,
    "--reporter=junit",
    `--reporter-outfile=${JUNIT_PATH}`,
  ],
];
const CMD_TSC: Cmd = ["tsc", ["--noEmit"]];
const CMD_JSCPD: Cmd = ["bunx", ["jscpd", "--config", ".jscpd.json"]];
const CMD_KNIP: Cmd = ["bunx", ["knip", "--config", "knip.json", "--cache"]];
const CMD_DEPCRUISE: Cmd = [
  "bunx",
  [
    "depcruise",
    "--config",
    ".dependency-cruiser.cjs",
    "src",
    "--output-type",
    "err",
    "--cache",
    ".cache/depcruise",
  ],
];
const CMD_MADGE: Cmd = [
  "bunx",
  ["madge@8", "--circular", "--extensions", "ts,tsx", "src"],
];
const CMD_TYPE_COVERAGE: Cmd = [
  "bunx",
  [
    "type-coverage",
    "--at-least",
    "98",
    "--cache",
    "--cache-directory",
    ".cache/type-coverage",
  ],
];
const CMD_STYLELINT: Cmd = [
  "bunx",
  [
    "stylelint",
    "src/**/*.{css,scss}",
    "--cache",
    "--cache-location",
    ".cache/stylelint",
    "--cache-strategy",
    "content",
  ],
];
const CMD_TSD: Cmd = [
  "bunx",
  ["tsd", "--typings", "next-env.d.ts", "--files", "next-env.test-d.ts"],
];
const CMD_SECRETLINT: Cmd = [
  "bunx",
  ["secretlint", "**/*", "--secretlintignore", ".secretlintignore"],
];
const CMD_PRETTIER_CHECK: Cmd = [
  "bunx",
  [
    "prettier",
    "--check",
    ".",
    "--cache",
    "--cache-location",
    ".cache/prettier",
  ],
];
const CMD_SEMGREP: Cmd = [
  "semgrep",
  [
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
    "src",
  ],
];
const CMD_GITLEAKS: Cmd = [
  "bunx",
  [
    "@0xts/gitleaks-cli",
    "detect",
    "-s",
    "src",
    "--no-git",
    "-c",
    ".gitleaks.toml",
  ],
];
const CMD_BUN_AUDIT: Cmd = ["bun", ["audit"]];
const ESLINT_ARGS_BASE = [
  "eslint",
  ".",
  "--cache",
  "--cache-strategy",
  "content",
  "--cache-location",
  ".cache/eslint",
  "--concurrency",
];
const TS_PRUNE_ARGS_BASE = ["ts-prune", "-p"];

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
const lines = (v: string) =>
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

async function estLintFiles(): Promise<number> {
  const glob = new Bun.Glob("**/*.{js,mjs,cjs,ts,jsx,tsx}");
  const skip = ["node_modules", ".next", "dist", "build", "coverage", ".cache"];
  let count = 0;
  for await (const fp of glob.scan({ cwd: process.cwd(), absolute: false })) {
    if (skip.some((d) => fp.startsWith(`${d}/`) || fp.includes(`/${d}/`)))
      continue;
    if (++count >= 5000) return count;
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
  return { covered, found, pct, ok: pct >= LINE_COVERAGE_THRESHOLD };
}

function parseDetails(outputs: Record<string, Command>) {
  const detail = (cmd: Command, pass: string, fail: string) => {
    if (cmd.exitCode === 0) return pass;
    const firstError = lines(cmd.output).find((l) => !l.startsWith("$ "));
    return firstError ? `${fail}: ${firstError}` : fail;
  };
  const regex = (out: string, pattern: RegExp) => norm(out).match(pattern);
  const jscpdM = regex(outputs.jscpd.output, /Found\s+(\d+)\s+clones?/i);
  const jscpdRow = lines(outputs.jscpd.output).find((l) =>
    l.includes("│ Total:"),
  );
  let jscpd = "no duplicate stats detected";
  if (jscpdRow) {
    const cells = jscpdRow
      .split("│")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length >= 7)
      jscpd = `${cells[4]} clones · ${cells[5]} lines · ${cells[6]} tokens · ${cells[1]} files`;
  } else if (jscpdM) jscpd = `${jscpdM[1]} clones`;
  const depM = regex(
    outputs.depCruise.output,
    /no dependency violations found \((\d+) modules,\s*(\d+) dependencies cruised\)/i,
  );
  const depCruise = depM
    ? `${depM[1]} modules · ${depM[2]} dependencies cruised`
    : "dependency check completed";
  const madgeN = norm(outputs.madge.output);
  const madgeM = madgeN.match(/Found\s+(\d+)\s+circular\s+dependenc/i);
  const madge = /No circular dependency found/i.test(madgeN)
    ? "0 circular dependencies"
    : madgeM
      ? `${madgeM[1]} circular dependencies`
      : "circular dependency check completed";
  const typeCovM = regex(
    outputs.typeCoverage.output,
    /\((\d+)\s*\/\s*(\d+)\)\s*([\d.]+)%/,
  );
  const typeCoverage = typeCovM
    ? `${typeCovM[3]}% (${typeCovM[1]}/${typeCovM[2]}) · threshold 98%`
    : "type coverage completed";
  const depAuditN = norm(outputs.depAudit.output);
  const depAuditM = depAuditN.match(/(\d+)\s+vulnerabilit(?:y|ies)/i);
  const depAudit = /No vulnerabilities found/i.test(depAuditN)
    ? "0 vulnerabilities found"
    : depAuditM
      ? `${depAuditM[1]} vulnerabilities found`
      : "dependency audit completed";
  return {
    tsc: detail(outputs.types, "typecheck clean", "typecheck failed"),
    eslint: detail(outputs.lint, "lint clean", "lint failed"),
    jscpd,
    knip: detail(outputs.knip, "unused dependency check clean", "knip failed"),
    tsPrune: detail(
      outputs.tsPrune,
      "unused export check clean",
      "ts-prune failed",
    ),
    depCruise,
    madge,
    typeCoverage,
    stylelint: detail(outputs.stylelint, "stylelint clean", "stylelint failed"),
    tsd: detail(outputs.tsd, "type definition tests clean", "tsd failed"),
    secretlint: detail(
      outputs.secretlint,
      "no secret findings",
      "secretlint failed",
    ),
    prettier: detail(
      outputs.prettier,
      "formatting compliant",
      "prettier check failed",
    ),
    semgrep: detail(outputs.semgrep, "rule scan clean", "semgrep failed"),
    gitleaks: detail(outputs.gitleaks, "secret scan clean", "gitleaks failed"),
    depAudit,
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

function filterMadge(output: string): string {
  return output
    .split(/\r?\n/)
    .filter((line) => !/\b\d+\s+warnings?\b/i.test(stripAnsi(line)))
    .join("\n")
    .trimEnd();
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

async function runLint(extraArgs: string[]): Promise<Command> {
  const envC = process.env.ESLINT_CONCURRENCY;
  const fileCount = await estLintFiles();
  const concurrency =
    envC && /^\d+$/.test(envC)
      ? Number.parseInt(envC, 10)
      : getConcurrency(fileCount);
  return run("bunx", [...ESLINT_ARGS_BASE, String(concurrency), ...extraArgs]);
}

async function runTsPrune(argv: string[]): Promise<Command> {
  const cfgIdx = argv.indexOf("--config");
  const configPath =
    cfgIdx >= 0
      ? (argv[cfgIdx + 1] ??
        (() => {
          throw new Error("Missing value for --config");
        })())
      : (argv.find((a) => a.startsWith("--config="))?.slice(9) ??
        ".ts-prune.json");
  try {
    const absPath = join(process.cwd(), configPath);
    if (!existsSync(absPath))
      return {
        exitCode: 1,
        timedOut: false,
        output: `ts-prune config file not found: ${absPath}\n`,
      };
    const raw = JSON.parse(readFileSync(absPath, "utf8")) as unknown;
    if (!raw || typeof raw !== "object")
      throw new Error(`Invalid config at ${absPath}: expected an object`);
    const { project, skip, ignore } = raw as Record<string, unknown>;
    if (typeof project !== "string" || !project.trim())
      throw new Error(
        `Invalid config at ${absPath}: "project" must be a non-empty string`,
      );
    if (skip !== undefined && typeof skip !== "string")
      throw new Error(
        `Invalid config at ${absPath}: "skip" must be a string when provided`,
      );
    if (ignore !== undefined && typeof ignore !== "string")
      throw new Error(
        `Invalid config at ${absPath}: "ignore" must be a string when provided`,
      );
    let ignoreRe: RegExp | null = null;
    if (typeof ignore === "string") {
      try {
        ignoreRe = new RegExp(ignore);
      } catch (e) {
        throw new Error(
          `Invalid regex in ts-prune config: ${ignore} (${e instanceof Error ? e.message : "unknown error"})`,
        );
      }
    }
    const args = [...TS_PRUNE_ARGS_BASE, project as string];
    if (typeof skip === "string") args.push("--skip", skip);
    if (typeof ignore === "string") args.push("--ignore", ignore);
    const result = await run("bunx", args);
    if (result.timedOut) return result;
    const actionable = result.output
      .split(/\r?\n/)
      .filter(
        (l) =>
          /^\S.+:\d+\s-\s.+$/.test(l.trim()) &&
          (l.includes("(used in tests)") || !ignoreRe?.test(l)),
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
      output: `ts-prune failed to load config (${configPath}): ${e instanceof Error ? e.message : "unknown error"}\n`,
    };
  }
}

async function runCheckSuite() {
  const startedAtMs = Date.now();
  process.stdout.write(
    paint(
      "⏳ Please wait -- validating static analysis, tests, coverage, and redundancy checks... ",
      ANSI.bold,
      ANSI.cyan,
    ),
  );

  await run(...CMD_PRETTIER_FMT);

  const steps = [
    {
      k: "test",
      l: "Tests",
      r: () => run(...CMD_BUN_TEST, TEST_COMMAND_TIMEOUT_MS),
    },
    { k: "types", l: "tsc", r: () => run(...CMD_TSC) },
    { k: "lint", l: "eslint", r: () => runLint([]) },
    { k: "jscpd", l: "jscpd", r: () => run(...CMD_JSCPD) },
    { k: "knip", l: "knip", r: () => run(...CMD_KNIP) },
    { k: "tsPrune", l: "ts-prune", r: () => runTsPrune([]) },
    { k: "depCruise", l: "depcruise", r: () => run(...CMD_DEPCRUISE) },
    { k: "madge", l: "madge", r: () => run(...CMD_MADGE), t: filterMadge },
    {
      k: "typeCoverage",
      l: "type-coverage",
      r: () => run(...CMD_TYPE_COVERAGE),
    },
    { k: "stylelint", l: "stylelint", r: () => run(...CMD_STYLELINT) },
    { k: "tsd", l: "tsd", r: () => run(...CMD_TSD) },
    { k: "secretlint", l: "secretlint", r: () => run(...CMD_SECRETLINT) },
    { k: "prettier", l: "prettier-check", r: () => run(...CMD_PRETTIER_CHECK) },
    { k: "semgrep", l: "semgrep", r: () => run(...CMD_SEMGREP) },
    { k: "gitleaks", l: "gitleaks", r: () => run(...CMD_GITLEAKS) },
    { k: "depAudit", l: "dep-audit", r: () => run(...CMD_BUN_AUDIT) },
  ];
  const runs = Object.fromEntries(
    await Promise.all(steps.map(async (s) => [s.k, await s.r()] as const)),
  ) as Record<string, Command>;
  const timedOut = Object.values(runs).some((result) => result.timedOut);
  const missingLabels = steps.filter((s) => runs[s.k].notFound).map((s) => s.l);
  for (const step of steps)
    if (!runs[step.k].notFound)
      printStepOutput(
        step.l,
        step.t ? step.t(runs[step.k].output) : runs[step.k].output,
      );
  const tests = parseTests(JUNIT_PATH);
  const coverage = parseCoverage(LCOV_PATH);
  const details = parseDetails(runs);
  const checks = [
    {
      k: "tsc",
      ok: runs.types.exitCode === 0,
      d: details.tsc,
      ms: runs.types.durationMs,
      stpk: "types",
    },
    {
      k: "eslint",
      ok: runs.lint.exitCode === 0,
      d: details.eslint,
      ms: runs.lint.durationMs,
      stpk: "lint",
    },
    {
      k: "jscpd",
      ok: runs.jscpd.exitCode === 0,
      d: details.jscpd,
      ms: runs.jscpd.durationMs,
      stpk: "jscpd",
    },
    {
      k: "knip",
      ok: runs.knip.exitCode === 0,
      d: details.knip,
      ms: runs.knip.durationMs,
      stpk: "knip",
    },
    {
      k: "ts-prune",
      ok: runs.tsPrune.exitCode === 0,
      d: details.tsPrune,
      ms: runs.tsPrune.durationMs,
      stpk: "tsPrune",
    },
    {
      k: "depcruise",
      ok: runs.depCruise.exitCode === 0,
      d: details.depCruise,
      ms: runs.depCruise.durationMs,
      stpk: "depCruise",
    },
    {
      k: "madge",
      ok: runs.madge.exitCode === 0,
      d: details.madge,
      ms: runs.madge.durationMs,
      stpk: "madge",
    },
    {
      k: "type-coverage",
      ok: runs.typeCoverage.exitCode === 0,
      d: details.typeCoverage,
      ms: runs.typeCoverage.durationMs,
      stpk: "typeCoverage",
    },
    {
      k: "stylelint",
      ok: runs.stylelint.exitCode === 0,
      d: details.stylelint,
      ms: runs.stylelint.durationMs,
      stpk: "stylelint",
    },
    {
      k: "tsd",
      ok: runs.tsd.exitCode === 0,
      d: details.tsd,
      ms: runs.tsd.durationMs,
      stpk: "tsd",
    },
    {
      k: "secretlint",
      ok: runs.secretlint.exitCode === 0,
      d: details.secretlint,
      ms: runs.secretlint.durationMs,
      stpk: "secretlint",
    },
    {
      k: "prettier",
      ok: runs.prettier.exitCode === 0,
      d: details.prettier,
      ms: runs.prettier.durationMs,
      stpk: "prettier",
    },
    {
      k: "semgrep",
      ok: runs.semgrep.exitCode === 0,
      d: details.semgrep,
      ms: runs.semgrep.durationMs,
      stpk: "semgrep",
    },
    {
      k: "gitleaks",
      ok: runs.gitleaks.exitCode === 0,
      d: details.gitleaks,
      ms: runs.gitleaks.durationMs,
      stpk: "gitleaks",
    },
    {
      k: "dep-audit",
      ok: runs.depAudit.exitCode === 0,
      d: details.depAudit,
      ms: runs.depAudit.durationMs,
      stpk: "depAudit",
    },
    {
      k: "Tests",
      ok: tests.ok && runs.test.exitCode === 0,
      d: `${tests.passed} passed · ${tests.failed} failed · ${tests.skipped} skipped · runner exit ${runs.test.exitCode}`,
      ms: runs.test.durationMs,
      stpk: "test",
    },
    {
      k: "Coverage",
      ok: coverage.ok,
      d: `${coverage.pct.toFixed(2)}% (${coverage.covered}/${coverage.found}) · threshold ${LINE_COVERAGE_THRESHOLD.toFixed(1)}%`,
      stpk: null,
    },
  ];
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
    const result = await runLint(args);
    writeOut(result.output);
    process.exit(result.exitCode);
  }
  if (command === "ts-prune") {
    const result = await runTsPrune(args);
    writeOut(result.output);
    process.exit(result.exitCode);
  }
  await runCheckSuite();
}

await main();
