import { type ChildProcess, spawn } from "node:child_process";
import { type Dirent, rmSync } from "node:fs";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { availableParallelism } from "node:os";
import { dirname, join, relative } from "node:path";

const PLAYWRIGHT_COVERAGE_ENABLED =
  process.env.PLAYWRIGHT_COVERAGE_ENABLED === "1";
const PLAYWRIGHT_COVERAGE_FILE_PREFIX =
  process.env.PLAYWRIGHT_COVERAGE_FILE_PREFIX?.trim() ?? "";
const PLAYWRIGHT_COVERAGE_OUTPUT_DIR =
  process.env.PLAYWRIGHT_COVERAGE_OUTPUT_DIR ?? "coverage/playwright-raw";
const PLAYWRIGHT_COVERAGE_REPORT_DIR =
  process.env.PLAYWRIGHT_COVERAGE_REPORT_DIR ?? "coverage/playwright";
const PLAYWRIGHT_COVERAGE_HTML_REPORT_ENABLED =
  process.env.PLAYWRIGHT_COVERAGE_HTML_REPORT_ENABLED === "1";
const PLAYWRIGHT_JUNIT_REPORT_PATH =
  process.env.PLAYWRIGHT_JUNIT_REPORT_PATH?.trim();
export const DEFAULT_PLAYWRIGHT_HOST = "127.0.0.1";
export const DEFAULT_PLAYWRIGHT_PORT = 3100;
const PLAYWRIGHT_HOST = DEFAULT_PLAYWRIGHT_HOST;
const PLAYWRIGHT_SCRIPT_SOURCE_PATH = join(
  process.cwd(),
  "scripts",
  "playwright.ts",
);
const PROJECT_SOURCE_DIRECTORY_PATH = `${process.cwd().replaceAll("\\", "/")}/src/`;
const SUMMARY_METRIC_KEYS = [
  "lines",
  "statements",
  "functions",
  "branches",
  "branchesTrue",
] as const;
const PLAYWRIGHT_PORT_START = Number.parseInt(
  process.env.PLAYWRIGHT_PORT_START ?? String(DEFAULT_PLAYWRIGHT_PORT),
  10,
);
const PLAYWRIGHT_SERVER_TIMEOUT_MS = Number.parseInt(
  process.env.PLAYWRIGHT_SERVER_TIMEOUT_MS ?? "120000",
  10,
);
const PLAYWRIGHT_SHUTDOWN_TIMEOUT_MS = Number.parseInt(
  process.env.PLAYWRIGHT_SHUTDOWN_TIMEOUT_MS ?? "5000",
  10,
);
const PLAYWRIGHT_DIST_DIR_PREFIX = ".next-playwright";
const PLAYWRIGHT_LOG_LINE_LIMIT = 120;
const PLAYWRIGHT_READINESS_PATH = "/dashboard?explore=1";
const PLAYWRIGHT_PREWARM_PATHS = [
  "/dashboard?explore=1",
  "/dashboard",
  "/landing",
  "/api/auth/session",
  "/api/feeds",
  "/api/feeds/category-order",
] as const;
const PLAYWRIGHT_TSCONFIG_PREFIX = "tsconfig.playwright";
const PLAYWRIGHT_RUN_ID_OVERRIDE = process.env.PLAYWRIGHT_RUN_ID?.trim();
const PLAYWRIGHT_SHARD_COUNT = Number.parseInt(
  process.env.PLAYWRIGHT_SHARD_COUNT ?? "1",
  10,
);
const PLAYWRIGHT_INTERNAL_SHARD = process.env.PLAYWRIGHT_INTERNAL_SHARD?.trim();
const PLAYWRIGHT_SKIP_COVERAGE_GENERATION =
  process.env.PLAYWRIGHT_SKIP_COVERAGE_GENERATION === "1";
const PLAYWRIGHT_PRESERVE_RAW_COVERAGE =
  process.env.PLAYWRIGHT_PRESERVE_RAW_COVERAGE === "1";
const PLAYWRIGHT_SERVER_MODE = resolvePlaywrightServerMode(
  process.env.PLAYWRIGHT_SERVER_MODE,
);
const PLAYWRIGHT_DEV_SERVER_COMPILER_FLAG =
  PLAYWRIGHT_SERVER_MODE === "dev" && PLAYWRIGHT_COVERAGE_ENABLED
    ? "--turbopack"
    : "--webpack";
const PLAYWRIGHT_DEFAULT_WORKER_LIMIT = Math.min(4, availableParallelism());
const PLAYWRIGHT_CHILD_PORT_STRIDE = Number.parseInt(
  process.env.PLAYWRIGHT_CHILD_PORT_STRIDE ?? "1000",
  10,
);
const PYTHON_PARENT_DEATHSIG_LAUNCHER = [
  "import ctypes",
  "import os",
  "import signal",
  "import sys",
  "libc = ctypes.CDLL(None, use_errno=True)",
  "PR_SET_PDEATHSIG = 1",
  "result = libc.prctl(PR_SET_PDEATHSIG, signal.SIGKILL)",
  "if result != 0:",
  "    raise OSError(ctypes.get_errno(), 'prctl(PR_SET_PDEATHSIG) failed')",
  "os.execv(sys.argv[1], sys.argv[1:])",
].join("\n");

/**
 * Describes one metric group from the generated Monocart summary file.
 */
interface CoverageMetric {
  covered: number;
  pct: number;
  skipped: number;
  total: number;
}

/**
 * Defines the metric keys present in the generated coverage summary.
 */
type CoverageMetricKey = (typeof SUMMARY_METRIC_KEYS)[number];

/**
 * Defines the normalized summary object read from Monocart coverage output.
 */
type CoverageSummary = Record<string, unknown>;

/**
 * Defines one source-file summary entry keyed by Monocart metric name.
 */
type CoverageSummaryEntry = Partial<Record<CoverageMetricKey, CoverageMetric>>;

/**
 * Describes the dev server handle.
 */
interface DevServerHandle {
  baseURL: string;
  getRecentOutput: () => string;
  port: number;
  process: ChildProcess;
  startForwarding: () => void;
}

/**
 * Describes aggregate counts read from one JUnit XML report.
 */
interface JunitReportTotals {
  errors: number;
  failures: number;
  skipped: number;
  tests: number;
  time: number;
}

/**
 * Describes the Monocart report facade used by the Playwright coverage entrypoint.
 */
interface MonocartCoverageReport {
  add: (coverageData: RawCoverageData) => Promise<void>;
  cleanCache: () => Promise<void>;
  generate: () => Promise<unknown>;
}

/**
 * Defines the default export shape from `monocart-coverage-reports`.
 */
type MonocartCoverageReportFactory = (
  options: Record<string, unknown>,
) => MonocartCoverageReport;

/**
 * Describes the environment fields that can override the Playwright base URL.
 */
interface PlaywrightBaseUrlEnv {
  PLAYWRIGHT_BASE_URL?: string;
  PLAYWRIGHT_HOST?: string;
  PLAYWRIGHT_PORT?: string;
}

/**
 * Defines the supported command entrypoints for this Playwright utility script.
 */
type PlaywrightScriptEntrypoint = "coverage" | "test";

/**
 * Describes the application-server mode used for a Playwright run.
 */
type PlaywrightServerMode = "dev" | "start";

/**
 * Defines a raw coverage payload accepted by Monocart.
 */
type RawCoverageData = Record<string, unknown> | V8CoverageEntry[];

/**
 * Describes the sharded child execution settings.
 */
interface ShardRunSettings {
  coverageReportDir?: string;
  junitReportPath?: string;
  runId: string;
  shard: string;
}

/**
 * Describes source mapping metadata supplied by Monocart for a coverage entry.
 */
interface SourcePathInfo {
  distFile?: string;
}

/**
 * Describes one raw V8 coverage entry emitted by Playwright browser contexts.
 */
interface V8CoverageEntry {
  url: string;
}

/**
 * Builds the base URL injected into Playwright and readiness probes.
 * @param host - Hostname or IP address that the dedicated Playwright server binds to.
 * @param port - TCP port selected for the dedicated Playwright server.
 * @returns Normalized HTTP base URL without a trailing slash.
 */
export function buildPlaywrightBaseUrl(host: string, port: number): string {
  const normalizedHost = host.trim();

  if (!normalizedHost) {
    throw new Error("PLAYWRIGHT_HOST must not be empty.");
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `PLAYWRIGHT_PORT must be a valid TCP port. Received: ${port}`,
    );
  }

  return `http://${normalizedHost}:${port}`;
}

/**
 * Resolves the Playwright base URL from explicit environment overrides or repo defaults.
 * @param env - Environment-like object supplied by tests or process-level execution.
 * @returns Base URL used by Playwright clients, normalized without hash or trailing slash.
 */
export function resolvePlaywrightBaseUrl(
  env: PlaywrightBaseUrlEnv = process.env as PlaywrightBaseUrlEnv,
): string {
  const configuredBaseUrl = env.PLAYWRIGHT_BASE_URL?.trim();

  if (configuredBaseUrl) {
    const normalizedUrl = new URL(configuredBaseUrl);
    normalizedUrl.hash = "";

    return normalizedUrl.toString().replace(/\/$/u, "");
  }

  const configuredHost = env.PLAYWRIGHT_HOST?.trim() || DEFAULT_PLAYWRIGHT_HOST;
  const configuredPort = Number.parseInt(
    env.PLAYWRIGHT_PORT?.trim() ?? String(DEFAULT_PLAYWRIGHT_PORT),
    10,
  );

  return buildPlaywrightBaseUrl(configuredHost, configuredPort);
}

if (typeof globalThis.gc !== "function") {
  /**
   * Provides a no-op GC hook for coverage tooling when `--expose-gc` is disabled.
   * @returns A promise that resolves immediately.
   */
  globalThis.gc = async () => undefined;
}

/**
 * Resolves the requested script entrypoint while preserving the historic default test mode.
 * @param rawArguments - CLI arguments passed after the script path.
 * @returns Entrypoint plus remaining arguments for that entrypoint.
 */
export function resolvePlaywrightScriptEntrypoint(rawArguments: string[]): {
  entrypoint: PlaywrightScriptEntrypoint;
  forwardedArguments: string[];
} {
  const [maybeEntrypoint, ...remainingArguments] = rawArguments;

  if (maybeEntrypoint === "coverage" || maybeEntrypoint === "test") {
    return {
      entrypoint: maybeEntrypoint,
      forwardedArguments: remainingArguments,
    };
  }

  return {
    entrypoint: "test",
    forwardedArguments: rawArguments,
  };
}

/**
 * Resolves the application-server mode for Playwright runs.
 *
 * Coverage generation depends on development source maps, so those runs stay
 * on the dev server. Production mode remains opt-in because the repo's normal
 * e2e path has historically run against `next dev`.
 * @param configuredMode - Optional environment override.
 * @returns Normalized server mode.
 */
export function resolvePlaywrightServerMode(
  configuredMode: string | undefined,
): PlaywrightServerMode {
  const normalizedMode = configuredMode?.trim().toLowerCase();

  if (!normalizedMode) {
    return "dev";
  }

  if (normalizedMode === "dev" || normalizedMode === "start") {
    return normalizedMode;
  }

  throw new Error(
    `PLAYWRIGHT_SERVER_MODE must be either "dev" or "start". Received: ${configuredMode}`,
  );
}

/**
 * Creates a per-shard coverage report directory so each child can generate
 * source-mapped LCOV while its own dedicated dev server is still running.
 * @param reportDirectoryPath - Final report directory requested by the caller.
 * @param runId - Unique shard run id to append to the directory name.
 * @returns Per-shard coverage report directory path.
 */
export function resolveShardCoverageReportDirectory(
  reportDirectoryPath: string,
  runId: string,
) {
  return `${reportDirectoryPath}.${runId}`;
}

/**
 * Creates a per-shard JUnit path so concurrent children never overwrite the
 * aggregate report consumed by check-suite after the parent process exits.
 * @param reportPath - Final JUnit report path requested by the caller.
 * @param runId - Unique shard run id to insert into the file name.
 * @returns Per-shard JUnit path, or undefined when no JUnit report is enabled.
 */
export function resolveShardJunitReportPath(
  reportPath: string | undefined,
  runId: string,
) {
  if (!reportPath) {
    return undefined;
  }

  const lastSlashIndex = Math.max(
    reportPath.lastIndexOf("/"),
    reportPath.lastIndexOf("\\"),
  );
  const extensionIndex = reportPath.lastIndexOf(".");

  if (extensionIndex > lastSlashIndex) {
    return `${reportPath.slice(0, extensionIndex)}.${runId}${reportPath.slice(extensionIndex)}`;
  }

  return `${reportPath}.${runId}`;
}

/**
 * Asserts that generated coverage maps back to project source files instead of bundles.
 * @param reportDirectoryPath - Directory containing generated Monocart artifacts.
 * @param projectSourceFilePathSet - Normalized source files that belong to this project.
 */
async function assertSourceMappedCoverage(
  reportDirectoryPath: string,
  projectSourceFilePathSet: ReadonlySet<string>,
): Promise<void> {
  const summaryFilePath = join(reportDirectoryPath, "summary.json");
  const summary = JSON.parse(
    await readFile(summaryFilePath, "utf8"),
  ) as CoverageSummary;
  const sourceEntries = Object.keys(summary).filter((key) => key !== "total");

  if (
    sourceEntries.some((key) =>
      isTrackedProjectSourceFile(key, projectSourceFilePathSet),
    )
  ) {
    return;
  }

  throw new Error(
    "Playwright coverage did not map to project source files under src/. The generated report still points at bundle artifacts.",
  );
}

/**
 * Builds a dedicated production bundle for non-coverage Playwright runs so the
 * test workers do not compete with Turbopack route compilation.
 * @param distDir - The isolated dist dir for this Playwright run.
 * @param tsconfigPath - The isolated tsconfig path for this Playwright run.
 */
async function buildPlaywrightApplication(
  distDir: string,
  tsconfigPath: string,
) {
  const child = spawn(
    join(process.cwd(), "node_modules", ".bin", "next"),
    ["build"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXT_TYPESCRIPT_CONFIG_PATH: tsconfigPath,
        PLAYWRIGHT_NEXT_DIST_DIR: distDir,
      },
      stdio: "inherit",
    },
  );

  const { code, signal } = await waitForChildExit(child);

  if (signal) {
    throw new Error(
      `Playwright application build exited from signal ${signal}.`,
    );
  }

  if ((code ?? 1) !== 0) {
    throw new Error(
      `Playwright application build failed with exit code ${code ?? 1}.`,
    );
  }
}

/**
 * Create the output mirror.
 * @param child - The child.
 * @returns The output mirror.
 */
function createOutputMirror(child: ChildProcess) {
  const bufferedChunks: { stream: NodeJS.WriteStream; text: string }[] = [];
  const recentLines: string[] = [];
  let isForwarding = false;

  /**
   * Append the chunk.
   * @param stream - The stream.
   * @param chunk - The chunk.
   */
  const appendChunk = (stream: NodeJS.WriteStream, chunk: Buffer | string) => {
    const text = chunk.toString();

    if (isForwarding) {
      stream.write(text);
    } else {
      bufferedChunks.push({ stream, text });
    }

    for (const line of text.split(/\r?\n/u)) {
      if (!line) {
        continue;
      }

      recentLines.push(line);

      if (recentLines.length > PLAYWRIGHT_LOG_LINE_LIMIT) {
        recentLines.shift();
      }
    }
  };

  child.stdout?.on("data", (chunk) => appendChunk(process.stdout, chunk));
  child.stderr?.on("data", (chunk) => appendChunk(process.stderr, chunk));

  return {
    /**
     * Reads the buffered child-process output captured so far.
     * @returns Recent log lines joined for startup diagnostics.
     */
    getRecentOutput() {
      return recentLines.join("\n");
    },
    /**
     * Flushes buffered child-process output and switches to live forwarding.
     */
    startForwarding() {
      if (isForwarding) {
        return;
      }

      isForwarding = true;

      for (const chunk of bufferedChunks) {
        chunk.stream.write(chunk.text);
      }

      bufferedChunks.length = 0;
    },
  };
}

/**
 * Create the playwright run id.
 * @returns The playwright run id.
 */
function createPlaywrightRunId() {
  if (PLAYWRIGHT_RUN_ID_OVERRIDE) {
    return PLAYWRIGHT_RUN_ID_OVERRIDE;
  }

  return `${Date.now()}-${process.pid}`;
}

/**
 * Create the playwright tsconfig.
 * @param runId - The run id.
 * @returns The playwright tsconfig.
 */
async function createPlaywrightTsconfig(runId: string) {
  const tsconfigPath = `${PLAYWRIGHT_TSCONFIG_PREFIX}.${runId}.json`;

  await writeFile(
    join(process.cwd(), tsconfigPath),
    await readFile(join(process.cwd(), "tsconfig.json"), "utf8"),
    "utf8",
  );

  return tsconfigPath;
}

/**
 * Builds deterministic shard settings for internal child executions.
 * @param parentRunId - Base run id for the coordinator run.
 * @returns Child shard descriptors.
 */
function createShardRunSettings(parentRunId: string): ShardRunSettings[] {
  return Array.from({ length: PLAYWRIGHT_SHARD_COUNT }, (_, index) => {
    const shardNumber = index + 1;
    const runId = `${parentRunId}-shard-${shardNumber}`;

    return {
      coverageReportDir: PLAYWRIGHT_COVERAGE_ENABLED
        ? resolveShardCoverageReportDirectory(
            PLAYWRIGHT_COVERAGE_REPORT_DIR,
            runId,
          )
        : undefined,
      junitReportPath: resolveShardJunitReportPath(
        PLAYWRIGHT_JUNIT_REPORT_PATH,
        runId,
      ),
      runId,
      shard: `${shardNumber}/${PLAYWRIGHT_SHARD_COUNT}`,
    };
  });
}

/**
 * Create the startup error.
 * @param message - The message.
 * @param recentOutput - The recent output.
 * @returns The startup error.
 */
function createStartupError(message: string, recentOutput: string) {
  return new Error(
    recentOutput
      ? `${message}\nRecent server output:\n${recentOutput}`
      : message,
  );
}

/**
 * Process the generate playwright coverage report.
 * @param rawCoverageOutputDir - The raw coverage output dir.
 * @returns The generate playwright coverage report.
 */
async function generatePlaywrightCoverageReport(rawCoverageOutputDir: string) {
  try {
    await access(join(process.cwd(), rawCoverageOutputDir));
  } catch {
    return 0;
  }

  const generatorProcess = spawn(
    Bun.which("bun") ?? "bun",
    [PLAYWRIGHT_SCRIPT_SOURCE_PATH, "coverage"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PLAYWRIGHT_COVERAGE_OUTPUT_DIR: rawCoverageOutputDir,
      },
      stdio: "inherit",
    },
  );

  const { code, signal } = await waitForChildExit(generatorProcess);

  if (signal) {
    console.error(
      `Playwright coverage generation exited from signal ${signal}.`,
    );
    return 1;
  }

  return code ?? 1;
}

/**
 * Returns a summary metric from a source-file coverage summary entry.
 * @param summaryEntry - Source-file summary entry produced by Monocart.
 * @param metricKey - Metric key to retrieve from the summary entry.
 * @returns The metric when present, otherwise null.
 */
function getSummaryMetric(
  summaryEntry: CoverageSummaryEntry,
  metricKey: CoverageMetricKey,
): CoverageMetric | null {
  return summaryEntry[metricKey] ?? null;
}

/**
 * Return whether is port available.
 * @param port - The port.
 * @returns Whether is port available.
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, PLAYWRIGHT_HOST, () => {
      probe.close(() => resolve(true));
    });
  });
}

/**
 * Return whether is port unavailable output.
 * @param output - The output.
 * @returns Whether is port unavailable output.
 */
function isPortUnavailableOutput(output: string) {
  return /(EADDRINUSE|address already in use|port\s+\d+\s+is in use)/iu.test(
    output,
  );
}

/**
 * Determines whether a parsed JSON value is a non-null object record.
 * @param value - Parsed JSON value to inspect.
 * @returns Whether the value can be safely treated as a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Determines whether a coverage source path belongs to the tracked project source set.
 * @param sourcePath - Source path from a generated coverage artifact.
 * @param projectSourceFilePathSet - Normalized project source file paths.
 * @returns Whether the path resolves to a tracked source file under `src/`.
 */
function isTrackedProjectSourceFile(
  sourcePath: string,
  projectSourceFilePathSet: ReadonlySet<string>,
): boolean {
  return projectSourceFilePathSet.has(normalizeCoveragePath(sourcePath));
}

/**
 * Determines whether a parsed raw coverage item is a V8 coverage entry.
 * @param value - Parsed coverage item to inspect.
 * @returns Whether the item has the V8 coverage URL shape expected by Monocart.
 */
function isV8CoverageEntry(value: unknown): value is V8CoverageEntry {
  return isRecord(value) && typeof value.url === "string";
}

/**
 * Recursively lists every file within a directory tree.
 * @param directoryPath - Root directory to scan.
 * @returns Absolute file paths for every nested file.
 */
async function listFilesRecursively(directoryPath: string): Promise<string[]> {
  const directoryEntries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  const nestedFiles = await Promise.all(
    directoryEntries.map(async (directoryEntry: Dirent) => {
      const entryPath = join(directoryPath, directoryEntry.name);
      if (directoryEntry.isDirectory()) {
        return await listFilesRecursively(entryPath);
      }

      return [entryPath];
    }),
  );

  return nestedFiles.flat();
}

/**
 * Returns temporary paths that a parent shard coordinator must clean after it
 * has merged coverage and JUnit artifacts from all successful children.
 * @param shardRunSettings - Child shard settings used during execution.
 * @returns Runtime directories and tsconfig files preserved by shard children.
 */
function listPreservedShardRuntimePaths(shardRunSettings: ShardRunSettings[]) {
  return shardRunSettings.flatMap((shardSetting) => [
    `${PLAYWRIGHT_DIST_DIR_PREFIX}.${shardSetting.runId}`,
    `${PLAYWRIGHT_TSCONFIG_PREFIX}.${shardSetting.runId}.json`,
    ...(shardSetting.coverageReportDir ? [shardSetting.coverageReportDir] : []),
    ...(shardSetting.junitReportPath ? [shardSetting.junitReportPath] : []),
  ]);
}

/**
 * Merges source-file coverage metrics into a total metric for summary output.
 * @param summaryEntries - Source-file summary entries retained for project files.
 * @param metricKey - Metric key to merge across the retained source entries.
 * @returns Merged total coverage metric.
 */
function mergeCoverageMetric(
  summaryEntries: CoverageSummaryEntry[],
  metricKey: CoverageMetricKey,
): CoverageMetric {
  const total = summaryEntries.reduce(
    (sum, entry) => sum + (getSummaryMetric(entry, metricKey)?.total ?? 0),
    0,
  );
  const covered = summaryEntries.reduce(
    (sum, entry) => sum + (getSummaryMetric(entry, metricKey)?.covered ?? 0),
    0,
  );
  const skipped = summaryEntries.reduce(
    (sum, entry) => sum + (getSummaryMetric(entry, metricKey)?.skipped ?? 0),
    0,
  );

  return {
    covered,
    pct: total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2)),
    skipped,
    total,
  };
}

/**
 * Merges already source-mapped per-shard LCOV reports into the final Playwright
 * coverage location. Each child generates coverage while its dev server is
 * still alive, then the parent concatenates those mapped records for check-suite
 * to total with its existing LCOV reader.
 * @param shardRunSettings - Child shard settings that include coverage dirs.
 * @param reportDirectoryPath - Final Playwright coverage report directory.
 */
async function mergeShardCoverageReports(
  shardRunSettings: ShardRunSettings[],
  reportDirectoryPath: string,
) {
  await removePlaywrightRuntimeDirectory(reportDirectoryPath);
  await mkdir(join(process.cwd(), reportDirectoryPath), { recursive: true });

  const lcovParts = await Promise.all(
    shardRunSettings.map(async (shardSetting) => {
      if (!shardSetting.coverageReportDir) {
        return "";
      }

      return await readFile(
        join(process.cwd(), shardSetting.coverageReportDir, "lcov.info"),
        "utf8",
      );
    }),
  );

  await writeFile(
    join(process.cwd(), reportDirectoryPath, "lcov.info"),
    lcovParts.filter(Boolean).join("\n"),
    "utf8",
  );
}

/**
 * Merges per-shard JUnit XML reports into the final report path expected by
 * check-suite. Playwright shards run as independent child processes, so each
 * child writes its own `<testsuites>` document and the parent combines the suite
 * bodies and aggregate counts after every child succeeds.
 * @param shardRunSettings - Child shard settings that include per-shard reports.
 * @param reportPath - Final JUnit report path requested by the parent command.
 */
async function mergeShardJunitReports(
  shardRunSettings: ShardRunSettings[],
  reportPath: string | undefined,
) {
  if (!reportPath) {
    return;
  }

  const reportParts = await Promise.all(
    shardRunSettings.map(async (shardSetting) => {
      if (!shardSetting.junitReportPath) {
        return null;
      }

      const reportXml = await readFile(
        join(process.cwd(), shardSetting.junitReportPath),
        "utf8",
      );

      return parseShardJunitReport(reportXml);
    }),
  );
  const reports = reportParts.filter(
    (report): report is { body: string; totals: JunitReportTotals } =>
      report !== null,
  );
  const totals = reports.reduce<JunitReportTotals>(
    (currentTotals, report) => ({
      errors: currentTotals.errors + report.totals.errors,
      failures: currentTotals.failures + report.totals.failures,
      skipped: currentTotals.skipped + report.totals.skipped,
      tests: currentTotals.tests + report.totals.tests,
      time: currentTotals.time + report.totals.time,
    }),
    { errors: 0, failures: 0, skipped: 0, tests: 0, time: 0 },
  );
  const mergedReport = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites errors="${totals.errors}" failures="${totals.failures}" skipped="${totals.skipped}" tests="${totals.tests}" time="${totals.time.toFixed(3)}">`,
    ...reports.map((report) => report.body),
    "</testsuites>",
    "",
  ].join("\n");

  await mkdir(dirname(join(process.cwd(), reportPath)), { recursive: true });
  await writeFile(join(process.cwd(), reportPath), mergedReport, "utf8");
}

/**
 * Normalizes a coverage artifact path into the repo-relative source path used by checks.
 * @param sourcePath - Source path emitted by Monocart or V8 coverage mapping.
 * @param distFilePath - Optional generated bundle path associated with the source map.
 * @returns Normalized project-relative source path or namespaced dependency source path.
 */
function normalizeCoveragePath(
  sourcePath: string,
  distFilePath?: string,
): string {
  const normalizedSourcePath = sourcePath.replaceAll("\\", "/");
  const normalizedDistFilePath = normalizeDistFilePath(distFilePath);

  if (normalizedSourcePath.startsWith(PROJECT_SOURCE_DIRECTORY_PATH)) {
    return normalizedSourcePath.slice(
      process.cwd().replaceAll("\\", "/").length + 1,
    );
  }

  if (normalizedSourcePath.startsWith("src/")) {
    if (normalizedDistFilePath.includes("/node_modules/")) {
      return `${normalizedDistFilePath}::${normalizedSourcePath}`;
    }

    return normalizedSourcePath;
  }

  const srcDirectoryIndex = normalizedSourcePath.lastIndexOf("/src/");
  if (srcDirectoryIndex >= 0 && !normalizedSourcePath.startsWith("/")) {
    return normalizedSourcePath.slice(srcDirectoryIndex + 1);
  }

  return normalizedSourcePath;
}

/**
 * Normalizes an optional generated bundle path for coverage source-map decisions.
 * @param distFilePath - Optional generated bundle path from Monocart.
 * @returns Slash-normalized bundle path or an empty string.
 */
function normalizeDistFilePath(distFilePath?: string): string {
  return distFilePath?.replaceAll("\\", "/") ?? "";
}

/**
 * Parses and validates one raw Playwright coverage JSON artifact.
 * @param rawCoverageJson - Raw JSON file contents.
 * @param rawCoverageFilePath - File path used in validation error messages.
 * @returns Coverage payload accepted by Monocart.
 */
function parseRawCoverageData(
  rawCoverageJson: string,
  rawCoverageFilePath: string,
): RawCoverageData {
  const parsedCoverageData: unknown = JSON.parse(rawCoverageJson) as unknown;

  if (Array.isArray(parsedCoverageData)) {
    if (parsedCoverageData.every(isV8CoverageEntry)) {
      return parsedCoverageData;
    }

    throw new Error(
      `Expected ${rawCoverageFilePath} to contain an array of V8 coverage entries with string urls.`,
    );
  }

  if (isRecord(parsedCoverageData)) {
    return parsedCoverageData;
  }

  throw new Error(
    `Expected ${rawCoverageFilePath} to contain a JSON object or an array of V8 coverage entries.`,
  );
}

/**
 * Reads aggregate counts and child suite XML from one shard JUnit report.
 * @param reportXml - Raw JUnit XML written by a Playwright child process.
 * @returns Parsed totals and suite body for the parent aggregate report.
 */
function parseShardJunitReport(reportXml: string): {
  body: string;
  totals: JunitReportTotals;
} {
  const testsuitesMatch = /<testsuites\b([^>]*)>([\s\S]*?)<\/testsuites>/u.exec(
    reportXml,
  );
  const totals = readJunitReportTotals(testsuitesMatch?.[1] ?? "");

  return {
    body: testsuitesMatch?.[2]?.trim() ?? reportXml.trim(),
    totals,
  };
}

/**
 * Prewarms the routes and endpoints that the Playwright suite commonly hits
 * first so the run does not pay cold-compilation costs mid-test.
 * @param server - The started Playwright dev server.
 */
async function prewarmServerRoutes(server: DevServerHandle) {
  if (PLAYWRIGHT_SERVER_MODE === "start") {
    return;
  }

  for (const path of PLAYWRIGHT_PREWARM_PATHS) {
    const response = await fetch(`${server.baseURL}${path}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status >= 500) {
      throw createStartupError(
        `Playwright dev server returned ${response.status} while prewarming ${path}.`,
        server.getRecentOutput(),
      );
    }
  }
}

/**
 * Reads numeric aggregate attributes from a `<testsuites>` opening tag.
 * @param rawAttributes - Raw XML attributes from the testsuites element.
 * @returns JUnit aggregate totals with missing values treated as zero.
 */
function readJunitReportTotals(rawAttributes: string): JunitReportTotals {
  const attributes = Object.fromEntries(
    [
      ...rawAttributes.matchAll(
        /(errors|failures|skipped|tests|time)="([^"]*)"/gu,
      ),
    ].map((match) => [match[1], match[2]]),
  );

  return {
    errors: Number.parseInt(attributes.errors ?? "0", 10) || 0,
    failures: Number.parseInt(attributes.failures ?? "0", 10) || 0,
    skipped: Number.parseInt(attributes.skipped ?? "0", 10) || 0,
    tests: Number.parseInt(attributes.tests ?? "0", 10) || 0,
    time: Number.parseFloat(attributes.time ?? "0") || 0,
  };
}

/**
 * Process the remove playwright runtime directory.
 * @param directoryName - The directory name.
 */
async function removePlaywrightRuntimeDirectory(directoryName: string) {
  await rm(join(process.cwd(), directoryName), {
    force: true,
    recursive: true,
  });
}

/**
 * Resolves the default worker budget for direct Playwright runs when the user
 * did not pass a CLI `--workers` flag or a `PLAYWRIGHT_WORKERS` override.
 *
 * The dedicated dev server regresses badly when a single wrapper run fans out
 * to the full local worker ceiling. Keeping the wrapper default lower preserves
 * stability while still allowing explicit overrides and internal sharding.
 * @param forwardedArguments - CLI arguments forwarded to `playwright test`.
 * @returns Worker count to inject into the Playwright child environment.
 */
function resolvePlaywrightWorkerOverride(forwardedArguments: string[]) {
  if (
    process.env.PLAYWRIGHT_WORKERS?.trim() ||
    forwardedArguments.some(
      (argument) =>
        argument === "--workers" || argument.startsWith("--workers="),
    )
  ) {
    return undefined;
  }

  return String(PLAYWRIGHT_DEFAULT_WORKER_LIMIT);
}

/**
 * Computes the per-shard worker budget so concurrent shard runners do not
 * oversubscribe the local machine.
 * @returns Worker count to inject into each internal shard run.
 */
function resolveShardWorkerBudget() {
  const configuredWorkers = process.env.PLAYWRIGHT_WORKERS?.trim();

  if (configuredWorkers && /^\d+$/u.test(configuredWorkers)) {
    return Math.max(
      1,
      Math.floor(
        Number.parseInt(configuredWorkers, 10) / PLAYWRIGHT_SHARD_COUNT,
      ),
    );
  }

  const localWorkerCap = Math.min(10, availableParallelism());

  return Math.max(1, Math.floor(localWorkerCap / PLAYWRIGHT_SHARD_COUNT));
}

/**
 * Rewrites generated coverage artifacts so downstream checks only see project files.
 * @param reportDirectoryPath - Directory containing generated Monocart artifacts.
 * @param projectSourceFilePathSet - Normalized project source file paths.
 */
async function rewriteCoverageArtifacts(
  reportDirectoryPath: string,
  projectSourceFilePathSet: ReadonlySet<string>,
): Promise<void> {
  await Promise.all([
    rewriteSummaryFile(reportDirectoryPath, projectSourceFilePathSet),
    rewriteLcovFile(reportDirectoryPath, projectSourceFilePathSet),
  ]);
}

/**
 * Rewrites the generated LCOV file to retain only tracked project source blocks.
 * @param reportDirectoryPath - Directory containing the generated `lcov.info` file.
 * @param projectSourceFilePathSet - Normalized project source file paths.
 */
async function rewriteLcovFile(
  reportDirectoryPath: string,
  projectSourceFilePathSet: ReadonlySet<string>,
): Promise<void> {
  const lcovFilePath = join(reportDirectoryPath, "lcov.info");
  const lcovBlocks = (await readFile(lcovFilePath, "utf8"))
    .split("end_of_record\n")
    .map((block) => block.trim())
    .filter(Boolean);
  const filteredBlocks = lcovBlocks.flatMap((block) => {
    const lines = block.split(/\r?\n/u);
    const sourceFileLine = lines.find((line) => line.startsWith("SF:"));
    if (!sourceFileLine) {
      return [];
    }

    const sourcePath = sourceFileLine.slice(3);
    if (!isTrackedProjectSourceFile(sourcePath, projectSourceFilePathSet)) {
      return [];
    }

    lines[lines.indexOf(sourceFileLine)] =
      `SF:${normalizeCoveragePath(sourcePath)}`;
    return [`${lines.join("\n")}\nend_of_record\n`];
  });

  await writeFile(lcovFilePath, filteredBlocks.join(""));
}

/**
 * Rewrites the generated summary to retain project files and recompute totals.
 * @param reportDirectoryPath - Directory containing the generated `summary.json` file.
 * @param projectSourceFilePathSet - Normalized project source file paths.
 */
async function rewriteSummaryFile(
  reportDirectoryPath: string,
  projectSourceFilePathSet: ReadonlySet<string>,
): Promise<void> {
  const summaryFilePath = join(reportDirectoryPath, "summary.json");
  const summary = JSON.parse(
    await readFile(summaryFilePath, "utf8"),
  ) as CoverageSummary;
  const filteredEntries = Object.entries(summary)
    .filter(
      ([sourcePath]) =>
        sourcePath !== "total" &&
        isTrackedProjectSourceFile(sourcePath, projectSourceFilePathSet),
    )
    .map(
      ([sourcePath, summaryEntry]) =>
        [
          normalizeCoveragePath(sourcePath),
          summaryEntry as CoverageSummaryEntry,
        ] as const,
    );
  const totalEntry = Object.fromEntries(
    SUMMARY_METRIC_KEYS.map((metricKey) => [
      metricKey,
      mergeCoverageMetric(
        filteredEntries.map(([, summaryEntry]) => summaryEntry),
        metricKey,
      ),
    ]),
  );

  await writeFile(
    summaryFilePath,
    JSON.stringify({
      total: totalEntry,
      ...Object.fromEntries(filteredEntries),
    }),
  );
}

/**
 * Generates the Playwright coverage reports consumed by repository checks.
 */
async function runPlaywrightCoverageReport(): Promise<void> {
  const monocartModule =
    (await import("monocart-coverage-reports")) as unknown as {
      default: MonocartCoverageReportFactory;
    };
  const createCoverageReport = monocartModule.default;
  const rawCoverageDirectoryPath = join(
    process.cwd(),
    PLAYWRIGHT_COVERAGE_OUTPUT_DIR,
  );
  const reportDirectoryPath = join(
    process.cwd(),
    PLAYWRIGHT_COVERAGE_REPORT_DIR,
  );
  const projectSourceFilePathSet = new Set(
    (await listFilesRecursively(join(process.cwd(), "src"))).map((filePath) =>
      normalizeCoveragePath(filePath),
    ),
  );
  const rawCoverageFilePaths = (
    await listFilesRecursively(rawCoverageDirectoryPath)
  )
    .filter((filePath) => filePath.endsWith(".json"))
    .sort((leftPath, rightPath) => leftPath.localeCompare(rightPath));

  if (rawCoverageFilePaths.length === 0) {
    throw new Error(
      `No Playwright coverage JSON files were found in ${rawCoverageDirectoryPath}.`,
    );
  }

  const coverageReport = createCoverageReport({
    clean: true,
    cleanCache: true,
    logging: "error",
    name: "playwright-e2e",
    outputDir: reportDirectoryPath,
    reports: [
      ...(PLAYWRIGHT_COVERAGE_HTML_REPORT_ENABLED
        ? ([["html", { subdir: "html" }]] as const)
        : []),
      ["json-summary", { file: "summary.json" }],
      ["lcovonly", { file: "lcov.info" }],
    ],
    /**
     * Keeps generated reports scoped to tracked project source files.
     * @param sourcePath - Source path reported by Monocart.
     * @returns Whether the source path belongs to this project.
     */
    sourceFilter: (sourcePath: string) =>
      isTrackedProjectSourceFile(sourcePath, projectSourceFilePathSet),
    /**
     * Normalizes Monocart source paths before they are written to reports.
     * @param sourcePath - Source path reported by Monocart.
     * @param info - Source-map metadata for the reported source path.
     * @returns Normalized coverage path.
     */
    sourcePath: (sourcePath: string, info: SourcePathInfo) =>
      normalizeCoveragePath(sourcePath, info.distFile),
  });

  for (const rawCoverageFilePath of rawCoverageFilePaths) {
    const rawCoverageJson = await readFile(rawCoverageFilePath, "utf8");
    const rawCoverageData = parseRawCoverageData(
      rawCoverageJson,
      rawCoverageFilePath,
    );

    await coverageReport.add(rawCoverageData);
  }

  const coverageResults = await coverageReport.generate();

  if (!coverageResults) {
    throw new Error("Playwright coverage generation did not produce results.");
  }

  await rewriteCoverageArtifacts(reportDirectoryPath, projectSourceFilePathSet);
  await assertSourceMappedCoverage(
    reportDirectoryPath,
    projectSourceFilePathSet,
  );

  console.log(
    `Generated Playwright coverage from ${rawCoverageFilePaths.length} raw file(s) into ${relative(process.cwd(), reportDirectoryPath) || "."}.`,
  );
}

/**
 * Dispatches the unified Playwright utility script to the requested entrypoint.
 * @param rawArguments - CLI arguments passed after the script path.
 */
async function runPlaywrightScriptEntrypoint(
  rawArguments: string[],
): Promise<void> {
  const { entrypoint, forwardedArguments } =
    resolvePlaywrightScriptEntrypoint(rawArguments);

  if (entrypoint === "coverage") {
    await runPlaywrightCoverageReport();
    return;
  }

  await runPlaywrightTests(forwardedArguments);
}

/**
 * Launches N internal shard child processes in parallel, each with its own
 * cold Playwright server lifecycle.
 * @param forwardedArguments - CLI args originally passed to this script.
 * @param parentRunId - Coordinator run id used to derive child run ids.
 * @returns Exit code representing the aggregate shard execution outcome.
 */
async function runPlaywrightShards(
  forwardedArguments: string[],
  parentRunId: string,
) {
  const shardRunSettings = createShardRunSettings(parentRunId);
  const shardWorkerBudget = resolveShardWorkerBudget();
  const bunExecutablePath = Bun.which("bun") ?? "bun";
  const childProcesses: ChildProcess[] = [];
  const preservedShardRuntimePaths =
    listPreservedShardRuntimePaths(shardRunSettings);

  for (const [index, shardSetting] of shardRunSettings.entries()) {
    const shardPortStart =
      PLAYWRIGHT_PORT_START + index * PLAYWRIGHT_CHILD_PORT_STRIDE;
    const shardCommandArgs = [
      "scripts/playwright.ts",
      "test",
      ...forwardedArguments,
      `--shard=${shardSetting.shard}`,
    ];
    const child = spawn(bunExecutablePath, shardCommandArgs, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PLAYWRIGHT_COVERAGE_FILE_PREFIX: `${PLAYWRIGHT_COVERAGE_FILE_PREFIX}${PLAYWRIGHT_COVERAGE_FILE_PREFIX ? "-" : ""}${shardSetting.runId}`,
        PLAYWRIGHT_INTERNAL_SHARD: shardSetting.shard,
        ...(shardSetting.junitReportPath
          ? { PLAYWRIGHT_JUNIT_REPORT_PATH: shardSetting.junitReportPath }
          : {}),
        ...(shardSetting.coverageReportDir
          ? { PLAYWRIGHT_COVERAGE_REPORT_DIR: shardSetting.coverageReportDir }
          : {}),
        PLAYWRIGHT_PORT_START: String(shardPortStart),
        PLAYWRIGHT_PRESERVE_RAW_COVERAGE:
          process.env.PLAYWRIGHT_PRESERVE_RAW_COVERAGE ?? "0",
        PLAYWRIGHT_RUN_ID: shardSetting.runId,
        PLAYWRIGHT_SHARD_COUNT: "1",
        PLAYWRIGHT_SKIP_COVERAGE_GENERATION: "0",
        PLAYWRIGHT_WORKERS: String(shardWorkerBudget),
      },
      stdio: "inherit",
    });

    childProcesses.push(child);
  }

  const shardResults = await Promise.all(childProcesses.map(waitForChildExit));
  const failedShard = shardResults.find(
    (result) => result.signal !== null || (result.code ?? 1) !== 0,
  );

  if (failedShard) {
    if (!PLAYWRIGHT_PRESERVE_RAW_COVERAGE) {
      await Promise.allSettled(
        preservedShardRuntimePaths.map((targetPath) =>
          removePlaywrightRuntimeDirectory(targetPath),
        ),
      );
    }
    return 1;
  }

  await mergeShardJunitReports(shardRunSettings, PLAYWRIGHT_JUNIT_REPORT_PATH);

  if (PLAYWRIGHT_COVERAGE_ENABLED) {
    await mergeShardCoverageReports(
      shardRunSettings,
      PLAYWRIGHT_COVERAGE_REPORT_DIR,
    );

    if (!PLAYWRIGHT_PRESERVE_RAW_COVERAGE) {
      await Promise.allSettled(
        [
          ...shardRunSettings.map(
            (shardSetting) =>
              `${PLAYWRIGHT_COVERAGE_OUTPUT_DIR}.${shardSetting.runId}`,
          ),
          ...preservedShardRuntimePaths,
        ].map((targetPath) => removePlaywrightRuntimeDirectory(targetPath)),
      );
    }

    return 0;
  }

  await Promise.allSettled(
    preservedShardRuntimePaths.map((targetPath) =>
      removePlaywrightRuntimeDirectory(targetPath),
    ),
  );

  return 0;
}

/**
 * Runs the isolated Playwright test workflow with a dedicated Next.js server.
 * @param forwardedArguments - Playwright CLI arguments to forward after the `test` entrypoint.
 */
async function runPlaywrightTests(forwardedArguments: string[]) {
  const runId = createPlaywrightRunId();

  if (
    PLAYWRIGHT_SHARD_COUNT > 1 &&
    !PLAYWRIGHT_INTERNAL_SHARD &&
    !forwardedArguments.some((argument) => argument.startsWith("--shard="))
  ) {
    process.exit(await runPlaywrightShards(forwardedArguments, runId));
  }

  const rawCoverageOutputDir = PLAYWRIGHT_COVERAGE_ENABLED
    ? `${PLAYWRIGHT_COVERAGE_OUTPUT_DIR}.${runId}`
    : PLAYWRIGHT_COVERAGE_OUTPUT_DIR;
  const distDir = `${PLAYWRIGHT_DIST_DIR_PREFIX}.${runId}`;
  const tsconfigPath = await createPlaywrightTsconfig(runId);
  let serverProcess: ChildProcess | null = null;
  let testProcess: ChildProcess | null = null;

  let cleaningUp = false;

  const shouldPreserveRuntimeForParentCoverage =
    PLAYWRIGHT_COVERAGE_ENABLED &&
    PLAYWRIGHT_PRESERVE_RAW_COVERAGE &&
    PLAYWRIGHT_SKIP_COVERAGE_GENERATION &&
    Boolean(PLAYWRIGHT_INTERNAL_SHARD);

  /** Collects all temporary paths that must be removed on exit. */
  const temporaryPaths = [
    ...(shouldPreserveRuntimeForParentCoverage ? [] : [distDir, tsconfigPath]),
    ...(PLAYWRIGHT_COVERAGE_ENABLED && !PLAYWRIGHT_PRESERVE_RAW_COVERAGE
      ? [rawCoverageOutputDir]
      : []),
  ];

  /**
   * Process the cleanup.
   */
  const cleanup = async () => {
    if (cleaningUp) {
      return;
    }

    cleaningUp = true;

    await Promise.allSettled([
      stopProcess(testProcess),
      stopProcess(serverProcess),
    ]);

    await Promise.allSettled(
      temporaryPaths.map((target) => removePlaywrightRuntimeDirectory(target)),
    );
  };

  /**
   * Process the cleanup sync.
   */
  const cleanupSync = () => {
    stopProcessNow(testProcess);
    stopProcessNow(serverProcess);

    for (const target of temporaryPaths) {
      try {
        rmSync(join(process.cwd(), target), { force: true, recursive: true });
      } catch {
        // Best-effort only — the process is already exiting.
      }
    }
  };

  /**
   * Process the exit with cleanup.
   * @param exitCode - The exit code.
   * @returns The exit with cleanup.
   */
  const exitWithCleanup = async (exitCode: number) => {
    const forceExitTimer = setTimeout(() => {
      console.error("Async cleanup timed out — forcing exit.");
      cleanupSync();
      process.exit(exitCode);
    }, PLAYWRIGHT_SHUTDOWN_TIMEOUT_MS * 2);

    forceExitTimer.unref();

    try {
      await cleanup();
    } catch {
      cleanupSync();
    } finally {
      clearTimeout(forceExitTimer);
    }

    process.exit(exitCode);
  };

  process.once("exit", () => {
    cleanupSync();
  });

  let signalCount = 0;

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"] as const) {
    process.on(signal, () => {
      signalCount++;

      if (signalCount > 1) {
        console.error(`Received ${signal} again — forcing immediate exit.`);
        cleanupSync();
        process.exit(
          128 +
            (signal === "SIGINT"
              ? 2
              : signal === "SIGTERM"
                ? 15
                : signal === "SIGQUIT"
                  ? 3
                  : 1),
        );
      }

      void exitWithCleanup(
        128 +
          (signal === "SIGINT"
            ? 2
            : signal === "SIGTERM"
              ? 15
              : signal === "SIGQUIT"
                ? 3
                : 1),
      );
    });
  }

  process.once("uncaughtException", (error) => {
    console.error(error);
    void exitWithCleanup(1);
  });

  process.once("unhandledRejection", (error) => {
    console.error(error);
    void exitWithCleanup(1);
  });

  try {
    if (PLAYWRIGHT_COVERAGE_ENABLED) {
      await removePlaywrightRuntimeDirectory(rawCoverageOutputDir);
    }
    await removePlaywrightRuntimeDirectory(distDir);
    if (PLAYWRIGHT_SERVER_MODE === "start") {
      await buildPlaywrightApplication(distDir, tsconfigPath);
    }
    const server = await startFirstAvailableDevServer(distDir, tsconfigPath);
    serverProcess = server.process;

    console.log(`Playwright server mode: ${PLAYWRIGHT_SERVER_MODE}`);
    console.log(`Playwright server port: ${server.port}`);
    console.log(`Playwright dist dir: ${distDir}`);
    console.log(`Playwright tsconfig: ${tsconfigPath}`);
    await prewarmServerRoutes(server);

    testProcess = startPlaywrightTestRun(
      server.baseURL,
      server.port,
      forwardedArguments,
      rawCoverageOutputDir,
      runId,
    );
    const { code, signal } = await waitForChildExit(testProcess);

    if (signal) {
      console.error(`Playwright exited from signal ${signal}.`);
      await exitWithCleanup(1);
      return;
    }

    const coverageExitCode =
      PLAYWRIGHT_COVERAGE_ENABLED && !PLAYWRIGHT_SKIP_COVERAGE_GENERATION
        ? await generatePlaywrightCoverageReport(rawCoverageOutputDir)
        : 0;
    const exitCode = code === 0 ? coverageExitCode : (code ?? 1);

    await exitWithCleanup(exitCode);
  } catch (error) {
    console.error(error);
    await exitWithCleanup(1);
  }
}

/**
 * Process the start first available dev server.
 * @param distDir - The dist dir.
 * @param tsconfigPath - The tsconfig path.
 * @returns The start first available dev server.
 */
async function startFirstAvailableDevServer(
  distDir: string,
  tsconfigPath: string,
) {
  const portRangeSize = 65_535 - PLAYWRIGHT_PORT_START + 1;
  const randomOffset = Math.floor(Math.random() * portRangeSize);

  for (let attempt = 0; attempt < portRangeSize; attempt++) {
    const port =
      PLAYWRIGHT_PORT_START + ((randomOffset + attempt) % portRangeSize);

    const portFree = await isPortAvailable(port);
    if (!portFree) {
      continue;
    }

    const server =
      PLAYWRIGHT_SERVER_MODE === "start"
        ? startPlaywrightProductionServer(port, distDir, tsconfigPath)
        : startPlaywrightDevServer(port, distDir, tsconfigPath);

    try {
      await waitForServerStartup(server.process, server.getRecentOutput);
      await waitForServerReadiness(server, PLAYWRIGHT_SERVER_TIMEOUT_MS);
      server.startForwarding();
      return server;
    } catch (error) {
      const recentOutput = server.getRecentOutput();

      await stopProcess(server.process).catch(() => undefined);

      if (isPortUnavailableOutput(recentOutput)) {
        continue;
      }

      throw error instanceof Error
        ? error
        : createStartupError(
            `Playwright server failed to start on port ${port}.`,
            recentOutput,
          );
    }
  }

  throw new Error(
    `No usable Playwright server port found from ${PLAYWRIGHT_PORT_START}.`,
  );
}

/**
 * Process the start playwright dev server.
 * @param port - The port.
 * @param distDir - The dist dir.
 * @param tsconfigPath - The tsconfig path.
 * @returns The start playwright dev server.
 */
function startPlaywrightDevServer(
  port: number,
  distDir: string,
  tsconfigPath: string,
) {
  const child = spawn(
    "python3",
    [
      "-c",
      PYTHON_PARENT_DEATHSIG_LAUNCHER,
      join(process.cwd(), "node_modules", ".bin", "next"),
      "dev",
      PLAYWRIGHT_DEV_SERVER_COMPILER_FLAG,
      "-H",
      PLAYWRIGHT_HOST,
      "-p",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXT_TYPESCRIPT_CONFIG_PATH: tsconfigPath,
        PLAYWRIGHT_NEXT_DIST_DIR: distDir,
        PLAYWRIGHT_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const outputMirror = createOutputMirror(child);

  return {
    baseURL: buildPlaywrightBaseUrl(PLAYWRIGHT_HOST, port),
    getRecentOutput: outputMirror.getRecentOutput,
    port,
    process: child,
    startForwarding: outputMirror.startForwarding,
  };
}

/**
 * Starts a dedicated production server backed by a completed Playwright build.
 * @param port - The port.
 * @param distDir - The dist dir.
 * @param tsconfigPath - The tsconfig path.
 * @returns The started application server handle.
 */
function startPlaywrightProductionServer(
  port: number,
  distDir: string,
  tsconfigPath: string,
) {
  const child = spawn(
    "python3",
    [
      "-c",
      PYTHON_PARENT_DEATHSIG_LAUNCHER,
      join(process.cwd(), "node_modules", ".bin", "next"),
      "start",
      "-H",
      PLAYWRIGHT_HOST,
      "-p",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXT_TYPESCRIPT_CONFIG_PATH: tsconfigPath,
        PLAYWRIGHT_NEXT_DIST_DIR: distDir,
        PLAYWRIGHT_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const outputMirror = createOutputMirror(child);

  return {
    baseURL: buildPlaywrightBaseUrl(PLAYWRIGHT_HOST, port),
    getRecentOutput: outputMirror.getRecentOutput,
    port,
    process: child,
    startForwarding: outputMirror.startForwarding,
  };
}

/**
 * Process the start playwright test run.
 * @param baseURL - The base url.
 * @param port - The port.
 * @param forwardedArguments - The forwarded arguments.
 * @param rawCoverageOutputDir - The raw coverage output dir.
 * @param runId - The run id.
 * @returns The start playwright test run.
 */
function startPlaywrightTestRun(
  baseURL: string,
  port: number,
  forwardedArguments: string[],
  rawCoverageOutputDir: string,
  runId: string,
) {
  const workerOverride = resolvePlaywrightWorkerOverride(forwardedArguments);

  return spawn("bunx", ["playwright", "test", ...forwardedArguments], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseURL,
      PLAYWRIGHT_COVERAGE_OUTPUT_DIR: rawCoverageOutputDir,
      PLAYWRIGHT_HOST,
      PLAYWRIGHT_HTML_REPORT_DIR:
        process.env.PLAYWRIGHT_HTML_REPORT_DIR ?? `playwright-report/${runId}`,
      PLAYWRIGHT_OUTPUT_DIR:
        process.env.PLAYWRIGHT_OUTPUT_DIR ?? `test-results/playwright/${runId}`,
      PLAYWRIGHT_PORT: String(port),
      ...(workerOverride ? { PLAYWRIGHT_WORKERS: workerOverride } : {}),
    },
    stdio: "inherit",
  });
}

/**
 * Process the stop process.
 * @param child - The child.
 */
async function stopProcess(child: ChildProcess | null) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  const exitedNaturally = await Promise.race([
    waitForChildExit(child).then(() => true),
    Bun.sleep(PLAYWRIGHT_SHUTDOWN_TIMEOUT_MS).then(() => false),
  ]);

  if (!exitedNaturally) {
    child.kill("SIGKILL");
    await waitForChildExit(child).catch(() => undefined);
  }
}

/**
 * Process the stop process now.
 * @param child - The child.
 */
function stopProcessNow(child: ChildProcess | null) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGKILL");
}

/**
 * Process the wait for child exit.
 * @param child - The child.
 * @returns The wait for child exit.
 */
async function waitForChildExit(child: ChildProcess) {
  return await new Promise<{
    code: null | number;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve({ code, signal });
    });
  });
}

/**
 * Process the wait for server readiness.
 * @param server - The server.
 * @param timeoutMs - The timeout ms value.
 */
async function waitForServerReadiness(
  server: DevServerHandle,
  timeoutMs: number,
) {
  const readinessURL = `${server.baseURL}${PLAYWRIGHT_READINESS_PATH}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (
      server.process.exitCode !== null ||
      server.process.signalCode !== null
    ) {
      throw createStartupError(
        `Playwright dev server exited before ${PLAYWRIGHT_READINESS_PATH} became ready.`,
        server.getRecentOutput(),
      );
    }

    let response: Response;

    try {
      response = await fetch(readinessURL, {
        signal: AbortSignal.timeout(3_000),
      });
    } catch {
      // Keep polling until the server becomes reachable or times out.
      await Bun.sleep(250);
      continue;
    }

    if (response.ok) {
      return;
    }

    if (response.status >= 500) {
      throw createStartupError(
        `Playwright dev server returned ${response.status} for ${PLAYWRIGHT_READINESS_PATH}.`,
        server.getRecentOutput(),
      );
    }

    await Bun.sleep(250);
  }

  throw createStartupError(
    `Timed out waiting for Playwright dev server readiness at ${readinessURL}.`,
    server.getRecentOutput(),
  );
}

/**
 * Process the wait for server startup.
 * @param child - The child.
 * @param getRecentOutput - The callback that recent output.
 */
async function waitForServerStartup(
  child: ChildProcess,
  getRecentOutput: () => string,
) {
  const deadline = Date.now() + PLAYWRIGHT_SERVER_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw createStartupError(
        "Playwright dev server exited before startup completed.",
        getRecentOutput(),
      );
    }

    const output = getRecentOutput();

    if (isPortUnavailableOutput(output)) {
      throw createStartupError(
        "Playwright dev server port is already in use.",
        output,
      );
    }

    // Next.js (webpack and turbopack) prints "- Local:" followed by the
    // bound address once its HTTP server is listening.
    if (/- Local:\s+http/iu.test(output)) {
      return;
    }

    await Bun.sleep(50);
  }

  throw createStartupError(
    "Timed out waiting for Playwright dev server to claim its port.",
    getRecentOutput(),
  );
}

if (import.meta.main) {
  void runPlaywrightScriptEntrypoint(process.argv.slice(2));
}
