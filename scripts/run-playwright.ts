import { type ChildProcess, spawn } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

const PLAYWRIGHT_COVERAGE_ENABLED =
  process.env.PLAYWRIGHT_COVERAGE_ENABLED === "1";
const PLAYWRIGHT_COVERAGE_OUTPUT_DIR =
  process.env.PLAYWRIGHT_COVERAGE_OUTPUT_DIR ?? "coverage/playwright-raw";
const PLAYWRIGHT_HOST = "127.0.0.1";
const PLAYWRIGHT_COVERAGE_GENERATOR_SOURCE_PATH = join(
  process.cwd(),
  "scripts",
  "generate-playwright-coverage.ts",
);
const PLAYWRIGHT_COVERAGE_GENERATOR_RUNTIME_DIRECTORY =
  ".cache/playwright-runtime";
const PLAYWRIGHT_PORT_START = Number.parseInt(
  process.env.PLAYWRIGHT_PORT_START ?? "3100",
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
const PLAYWRIGHT_TSCONFIG_PREFIX = "tsconfig.playwright";
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

interface DevServerHandle {
  baseURL: string;
  getRecentOutput: () => string;
  port: number;
  process: ChildProcess;
  startForwarding: () => void;
}

/** Tracks recent child-process output while forwarding it to the parent streams. */
function createOutputMirror(child: ChildProcess) {
  const bufferedChunks: { stream: NodeJS.WriteStream; text: string }[] = [];
  const recentLines: string[] = [];
  let isForwarding = false;

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
    getRecentOutput() {
      return recentLines.join("\n");
    },
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

/** Transpiles the TypeScript coverage generator to a temporary Node-executable module. */
async function createPlaywrightCoverageGeneratorRuntimeFile(runId: string) {
  const runtimeDirectoryPath = join(
    process.cwd(),
    PLAYWRIGHT_COVERAGE_GENERATOR_RUNTIME_DIRECTORY,
  );
  const coverageGeneratorRuntimePath = join(
    PLAYWRIGHT_COVERAGE_GENERATOR_RUNTIME_DIRECTORY,
    `generate-playwright-coverage.${runId}.mjs`,
  );
  const coverageGeneratorSource = await readFile(
    PLAYWRIGHT_COVERAGE_GENERATOR_SOURCE_PATH,
    "utf8",
  );
  const transpiler = new Bun.Transpiler({ loader: "ts" });

  await mkdir(runtimeDirectoryPath, { recursive: true });
  await writeFile(
    join(process.cwd(), coverageGeneratorRuntimePath),
    transpiler.transformSync(coverageGeneratorSource),
    "utf8",
  );

  return coverageGeneratorRuntimePath;
}

/** Creates a filesystem-safe run identifier for per-run Playwright artifacts. */
function createPlaywrightRunId() {
  return `${Date.now()}-${process.pid}`;
}

/** Creates a disposable root tsconfig so Next never mutates the repo file. */
async function createPlaywrightTsconfig(runId: string) {
  const tsconfigPath = `${PLAYWRIGHT_TSCONFIG_PREFIX}.${runId}.json`;

  await writeFile(
    join(process.cwd(), tsconfigPath),
    await readFile(join(process.cwd(), "tsconfig.json"), "utf8"),
    "utf8",
  );

  return tsconfigPath;
}

/** Formats a startup failure with recent server output for fast diagnosis. */
function createStartupError(message: string, recentOutput: string) {
  return new Error(
    recentOutput
      ? `${message}\nRecent server output:\n${recentOutput}`
      : message,
  );
}

/** Generates the aggregated Playwright coverage reports after a coverage run. */
async function generatePlaywrightCoverageReport(
  rawCoverageOutputDir: string,
  coverageGeneratorRuntimePath: string,
) {
  try {
    await access(join(process.cwd(), rawCoverageOutputDir));
  } catch {
    return 0;
  }

  const generatorProcess = spawn(
    "node",
    [join(process.cwd(), coverageGeneratorRuntimePath)],
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
    console.error(`Playwright coverage generation exited from signal ${signal}.`);
    return 1;
  }

  return code ?? 1;
}

/**
 * Quickly probes whether a TCP port can be bound without spawning a full
 * Next.js process.  Returns in ~1 ms per port, letting the scan skip
 * obviously-taken ports before paying the cost of a child process.
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

/** Detects startup failures that should retry the next port immediately. */
function isPortUnavailableOutput(output: string) {
  return /(EADDRINUSE|address already in use|port\s+\d+\s+is in use)/iu.test(
    output,
  );
}

async function main() {
  const forwardedArguments = process.argv.slice(2);
  const runId = createPlaywrightRunId();
  const coverageGeneratorRuntimePath = PLAYWRIGHT_COVERAGE_ENABLED
    ? await createPlaywrightCoverageGeneratorRuntimeFile(runId)
    : null;
  const rawCoverageOutputDir = PLAYWRIGHT_COVERAGE_ENABLED
    ? `${PLAYWRIGHT_COVERAGE_OUTPUT_DIR}.${runId}`
    : PLAYWRIGHT_COVERAGE_OUTPUT_DIR;
  const distDir = `${PLAYWRIGHT_DIST_DIR_PREFIX}.${runId}`;
  const tsconfigPath = await createPlaywrightTsconfig(runId);
  let serverProcess: ChildProcess | null = null;
  let testProcess: ChildProcess | null = null;

  let cleaningUp = false;

  const cleanup = async () => {
    if (cleaningUp) {
      return;
    }

    cleaningUp = true;
    await stopProcess(testProcess).catch(() => undefined);
    await stopProcess(serverProcess).catch(() => undefined);
    if (PLAYWRIGHT_COVERAGE_ENABLED) {
      await removePlaywrightRuntimeDirectory(rawCoverageOutputDir).catch(
        () => undefined,
      );
    }
    if (coverageGeneratorRuntimePath) {
      await removePlaywrightRuntimeDirectory(coverageGeneratorRuntimePath).catch(
        () => undefined,
      );
    }
    await removePlaywrightRuntimeDirectory(distDir).catch(() => undefined);
    await removePlaywrightRuntimeDirectory(tsconfigPath).catch(() => undefined);
  };

  const cleanupSync = () => {
    stopProcessNow(testProcess);
    stopProcessNow(serverProcess);
  };

  const exitWithCleanup = async (exitCode: number) => {
    await cleanup();
    process.exit(exitCode);
  };

  process.once("exit", () => {
    cleanupSync();
  });

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(signal, () => {
      void exitWithCleanup(
        128 + (signal === "SIGINT" ? 2 : signal === "SIGTERM" ? 15 : 1),
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

    testProcess = startPlaywrightTestRun(
      server.baseURL,
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

    const coverageExitCode = PLAYWRIGHT_COVERAGE_ENABLED
      ? await generatePlaywrightCoverageReport(
          rawCoverageOutputDir,
          coverageGeneratorRuntimePath ?? "",
        )
      : 0;
    const exitCode =
      code === 0
        ? coverageExitCode
        : (code ?? 1);

    await exitWithCleanup(exitCode);
  } catch (error) {
    console.error(error);
    await exitWithCleanup(1);
  }
}

/** Removes a Playwright runtime directory when the run exits. */
async function removePlaywrightRuntimeDirectory(directoryName: string) {
  await rm(join(process.cwd(), directoryName), {
    force: true,
    recursive: true,
  });
}

/**
 * Starts Next on the first available port.  Randomises the starting port so
 * hundreds of concurrent runs spread across the range instead of all piling
 * up on port 3100.  A fast TCP probe skips obviously-taken ports before
 * spawning a child process.
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

/** Starts the dedicated Next.js Playwright dev server on the chosen port. */
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
    baseURL: `http://${PLAYWRIGHT_HOST}:${port}`,
    getRecentOutput: outputMirror.getRecentOutput,
    port,
    process: child,
    startForwarding: outputMirror.startForwarding,
  };
}

/** Runs the Playwright CLI with the dynamically selected base URL. */
function startPlaywrightTestRun(
  baseURL: string,
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
      PLAYWRIGHT_HTML_REPORT_DIR:
        process.env.PLAYWRIGHT_HTML_REPORT_DIR ?? `playwright-report/${runId}`,
      PLAYWRIGHT_OUTPUT_DIR:
        process.env.PLAYWRIGHT_OUTPUT_DIR ?? `test-results/playwright/${runId}`,
    },
    stdio: "inherit",
  });
}

/** Stops the foreground Playwright CLI process if the wrapper is interrupted. */
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

/** Performs a best-effort synchronous kill of the Playwright CLI process. */
function stopProcessNow(child: ChildProcess | null) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGKILL");
}

/** Waits for a child process to exit and resolves with its exit status. */
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

/** Waits for the chosen dashboard route to be reachable before tests start. */
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
 * Detects whether the dev server has claimed its port by watching child-process
 * output for the "- Local:" line that Next.js emits once its HTTP server is
 * listening.  Falls back to EADDRINUSE detection and process-exit checks so
 * the port-scan loop can advance without the old two-second blind timer.
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
