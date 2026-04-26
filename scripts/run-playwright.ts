import { type ChildProcess, spawn } from "node:child_process";
import { rmSync } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { availableParallelism } from "node:os";
import { join } from "node:path";

import {
  buildPlaywrightBaseUrl,
  DEFAULT_PLAYWRIGHT_HOST,
  DEFAULT_PLAYWRIGHT_PORT,
} from "./playwright-base-url";

const PLAYWRIGHT_COVERAGE_ENABLED =
  process.env.PLAYWRIGHT_COVERAGE_ENABLED === "1";
const PLAYWRIGHT_COVERAGE_FILE_PREFIX =
  process.env.PLAYWRIGHT_COVERAGE_FILE_PREFIX?.trim() ?? "";
const PLAYWRIGHT_COVERAGE_OUTPUT_DIR =
  process.env.PLAYWRIGHT_COVERAGE_OUTPUT_DIR ?? "coverage/playwright-raw";
const PLAYWRIGHT_HOST = DEFAULT_PLAYWRIGHT_HOST;
const PLAYWRIGHT_COVERAGE_GENERATOR_SOURCE_PATH = join(
  process.cwd(),
  "scripts",
  "generate-playwright-coverage.ts",
);
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
 * Describes the sharded child execution settings.
 */
interface ShardRunSettings {
  runId: string;
  shard: string;
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

  child.stdout?.on("data", (chunk) => {
    appendChunk(process.stdout, chunk);
  });
  child.stderr?.on("data", (chunk) => {
    appendChunk(process.stderr, chunk);
  });

  return {
    /**
     * Return the recent output.
     * @returns The recent output.
     */
    getRecentOutput() {
      return recentLines.join("\n");
    },
    /**
     * Process the start forwarding.
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

    return {
      runId: `${parentRunId}-shard-${shardNumber}`,
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
    [PLAYWRIGHT_COVERAGE_GENERATOR_SOURCE_PATH],
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
 * Recursively lists every file inside the requested directory.
 * @param directoryPath - Directory to scan.
 * @returns Absolute file paths for every nested file.
 */
async function listDirectoryFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nestedFileSets = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return await listDirectoryFiles(entryPath);
      }

      return [entryPath];
    }),
  );

  return nestedFileSets.flat();
}

/**
 * Process the main.
 */
async function main() {
  const forwardedArguments = process.argv.slice(2);
  const runId = createPlaywrightRunId();

  if (
    PLAYWRIGHT_SHARD_COUNT > 1 &&
    !PLAYWRIGHT_INTERNAL_SHARD &&
    !forwardedArguments.some((argument) => argument.startsWith("--shard="))
  ) {
    process.exit(await runPlaywrightShards(forwardedArguments, runId));
    return;
  }

  const rawCoverageOutputDir = PLAYWRIGHT_COVERAGE_ENABLED
    ? `${PLAYWRIGHT_COVERAGE_OUTPUT_DIR}.${runId}`
    : PLAYWRIGHT_COVERAGE_OUTPUT_DIR;
  const distDir = `${PLAYWRIGHT_DIST_DIR_PREFIX}.${runId}`;
  const tsconfigPath = await createPlaywrightTsconfig(runId);
  let serverProcess: ChildProcess | null = null;
  let testProcess: ChildProcess | null = null;

  let cleaningUp = false;

  /** Collects all temporary paths that must be removed on exit. */
  const temporaryPaths = [
    distDir,
    tsconfigPath,
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
    const server = await startFirstAvailableDevServer(distDir, tsconfigPath);
    serverProcess = server.process;

    console.log(`Playwright dev server port: ${server.port}`);
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
 * Copies per-shard raw coverage files into one merged directory for the final
 * coverage report generation pass.
 * @param shardRunSettings - Child shard settings used during execution.
 * @param mergedRawCoverageDir - Destination merged raw coverage directory.
 */
async function mergeShardRawCoverage(
  shardRunSettings: ShardRunSettings[],
  mergedRawCoverageDir: string,
) {
  await removePlaywrightRuntimeDirectory(mergedRawCoverageDir);
  await mkdir(join(process.cwd(), mergedRawCoverageDir), { recursive: true });

  for (const shardSetting of shardRunSettings) {
    const shardRawCoverageDir = `${PLAYWRIGHT_COVERAGE_OUTPUT_DIR}.${shardSetting.runId}`;
    const shardRawCoveragePath = join(process.cwd(), shardRawCoverageDir);

    try {
      await access(shardRawCoveragePath);
    } catch {
      continue;
    }

    const shardFiles = (await listDirectoryFiles(shardRawCoveragePath)).filter(
      (filePath) => filePath.endsWith(".json"),
    );

    for (const shardFile of shardFiles) {
      const targetFileName = `${shardSetting.runId}-${shardFile
        .split("/")
        .at(-1)}`;
      await copyFile(shardFile, join(process.cwd(), mergedRawCoverageDir, targetFileName));
    }
  }
}

/**
 * Prewarms the routes and endpoints that the Playwright suite commonly hits
 * first so the run does not pay cold-compilation costs mid-test.
 * @param server - The started Playwright dev server.
 */
async function prewarmServerRoutes(server: DevServerHandle) {
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
 * Computes the per-shard worker budget so concurrent shard runners do not
 * oversubscribe the local machine.
 * @returns Worker count to inject into each internal shard run.
 */
function resolveShardWorkerBudget() {
  const configuredWorkers = process.env.PLAYWRIGHT_WORKERS?.trim();

  if (configuredWorkers && /^\d+$/u.test(configuredWorkers)) {
    return Math.max(
      1,
      Math.floor(Number.parseInt(configuredWorkers, 10) / PLAYWRIGHT_SHARD_COUNT),
    );
  }

  const localWorkerCap = Math.min(10, availableParallelism());

  return Math.max(1, Math.floor(localWorkerCap / PLAYWRIGHT_SHARD_COUNT));
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

  for (const [index, shardSetting] of shardRunSettings.entries()) {
    const shardPortStart = PLAYWRIGHT_PORT_START + index * PLAYWRIGHT_CHILD_PORT_STRIDE;
    const shardCommandArgs = [
      "scripts/run-playwright.ts",
      ...forwardedArguments,
      `--shard=${shardSetting.shard}`,
    ];
    const child = spawn(bunExecutablePath, shardCommandArgs, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PLAYWRIGHT_COVERAGE_FILE_PREFIX: `${PLAYWRIGHT_COVERAGE_FILE_PREFIX}${PLAYWRIGHT_COVERAGE_FILE_PREFIX ? "-" : ""}${shardSetting.runId}`,
        PLAYWRIGHT_INTERNAL_SHARD: shardSetting.shard,
        PLAYWRIGHT_PORT_START: String(shardPortStart),
        PLAYWRIGHT_PRESERVE_RAW_COVERAGE: PLAYWRIGHT_COVERAGE_ENABLED
          ? "1"
          : "0",
        PLAYWRIGHT_RUN_ID: shardSetting.runId,
        PLAYWRIGHT_SHARD_COUNT: "1",
        PLAYWRIGHT_SKIP_COVERAGE_GENERATION: PLAYWRIGHT_COVERAGE_ENABLED
          ? "1"
          : "0",
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
    return 1;
  }

  if (PLAYWRIGHT_COVERAGE_ENABLED) {
    const mergedRawCoverageDir = `${PLAYWRIGHT_COVERAGE_OUTPUT_DIR}.${parentRunId}`;

    await mergeShardRawCoverage(shardRunSettings, mergedRawCoverageDir);

    const coverageExitCode = await generatePlaywrightCoverageReport(
      mergedRawCoverageDir,
    );

    await Promise.allSettled(
      shardRunSettings.map((shardSetting) =>
        removePlaywrightRuntimeDirectory(
          `${PLAYWRIGHT_COVERAGE_OUTPUT_DIR}.${shardSetting.runId}`,
        ),
      ),
    );
    await removePlaywrightRuntimeDirectory(mergedRawCoverageDir);

    return coverageExitCode;
  }

  return 0;
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

    const server = startPlaywrightDevServer(port, distDir, tsconfigPath);

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
            `Playwright dev server failed to start on port ${port}.`,
            recentOutput,
          );
    }
  }

  throw new Error(
    `No usable Playwright dev-server port found from ${PLAYWRIGHT_PORT_START}.`,
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
      "--turbopack",
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

void main();
