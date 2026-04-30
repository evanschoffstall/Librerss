import type { ReporterDescription } from "@playwright/test";

import { defineConfig, devices } from "@playwright/test";
import { readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";

import { resolvePlaywrightBaseUrl } from "./scripts/playwright-base-url";

const baseURL = resolvePlaywrightBaseUrl();
const backgroundUniversalDesktopTests =
  "**/dashboard-background-universal.e2e.test.ts";
const backgroundUniversalMobileTests =
  "**/dashboard-background-universal.mobile.e2e.test.ts";
const htmlReportDir =
  process.env.PLAYWRIGHT_HTML_REPORT_DIR ?? "playwright-report";
const includeMobileWebKit = process.env.PLAYWRIGHT_INCLUDE_WEBKIT === "1";
const isCoverageRun = process.env.PLAYWRIGHT_COVERAGE_ENABLED === "1";
const junitReportPath = process.env.PLAYWRIGHT_JUNIT_REPORT_PATH?.trim();
const htmlReportEnabled =
  process.env.PLAYWRIGHT_HTML_REPORT_ENABLED === "1" || !isCoverageRun;
const outputDir =
  process.env.PLAYWRIGHT_OUTPUT_DIR ?? "test-results/playwright";
const workerOverride = process.env.PLAYWRIGHT_WORKERS?.trim();
const consoleReporter = process.env.CI ? "dot" : "line";
const LOCAL_PLAYWRIGHT_WORKER_CAP = 10;
const reporter: ReporterDescription[] = [
  [consoleReporter],
  ...(htmlReportEnabled
    ? ([
        ["html", { open: "never", outputFolder: htmlReportDir }],
      ] satisfies ReporterDescription[])
    : []),
  ...(junitReportPath
    ? ([
        ["junit", { outputFile: junitReportPath }],
      ] satisfies ReporterDescription[])
    : []),
];

/**
 * Recursively counts `.e2e.test.ts` entrypoint files under the given directory so
 * worker allocation can scale to the number of test files automatically.
 * @param directoryPath - Absolute path to the directory containing Playwright entrypoint files.
 * @returns The count of Playwright entrypoint files found at any nesting depth.
 */
function countEntrypointFiles(directoryPath: string): number {
  let fileCount = 0;

  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      fileCount += countEntrypointFiles(join(directoryPath, entry.name));
    } else if (entry.isFile() && entry.name.endsWith(".e2e.test.ts")) {
      fileCount += 1;
    }
  }

  return fileCount;
}

/**
 * Returns the number of `.e2e.test.ts` entrypoint files under `tests/e2e` so that
 * local runs can automatically fan out across the entire suite without an
 * artificial worker cap.
 * @returns The number of Playwright e2e entrypoint files in the test suite.
 */
function countPlaywrightEntrypoints(): number {
  return countEntrypointFiles(join(process.cwd(), "tests", "e2e"));
}

/**
 * Resolves the Playwright worker count for the current run context.
 *
 * - CI: 2 workers (conservative for shared infra).
 * - Local coverage run: capped so the instrumented dev server stays stable
 *   under concurrent load.
 * - Local non-coverage: capped at a measured stable ceiling. The dashboard
 *   pagination suites are intentionally heavy and can overload a single
 *   Turbopack dev server when every logical CPU starts a page at once.
 * @returns The Playwright worker count or a percent-string worker override for the current run.
 */
function resolveWorkerCount(): number | string {
  if (workerOverride) {
    return /^\d+$/u.test(workerOverride)
      ? Number.parseInt(workerOverride, 10)
      : workerOverride;
  }

  if (process.env.CI) {
    return 2;
  }

  const detectedWorkerCount = availableParallelism();

  if (isCoverageRun) {
    return Math.max(
      2,
      Math.min(
        LOCAL_PLAYWRIGHT_WORKER_CAP,
        Math.ceil(detectedWorkerCount * 0.75),
      ),
    );
  }

  return Math.max(
    2,
    Math.min(
      LOCAL_PLAYWRIGHT_WORKER_CAP,
      detectedWorkerCount,
      countPlaywrightEntrypoints(),
    ),
  );
}

/**
 * Fast local-first Playwright configuration driven by the wrapper script.
 *
 * The wrapper selects the first free port from 3100 upward, starts the Next.js
 * dev server on that port, prewarms the dashboard route, and injects the base
 * URL into this config before the suite runs.
 */
export default defineConfig({
  expect: {
    timeout: 5_000,
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  outputDir,
  projects: [
    {
      name: "chromium",
      testIgnore: ["**/*.mobile.e2e.test.ts"],
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "edge-chromium",
      testMatch: backgroundUniversalDesktopTests,
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium" as const,
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0",
      },
    },
    {
      name: "firefox",
      testMatch: backgroundUniversalDesktopTests,
      use: {
        ...devices["Desktop Firefox"],
      },
    },
    {
      name: "mobile-chromium",
      testMatch: "**/*.mobile.e2e.test.ts",
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium" as const,
      },
    },
    ...(includeMobileWebKit
      ? [
          {
            name: "mobile-webkit",
            testMatch: backgroundUniversalMobileTests,
            use: {
              ...devices["iPhone 14"],
              browserName: "webkit" as const,
            },
          },
        ]
      : []),
  ],
  reporter,
  retries: process.env.CI ? 1 : 0,
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.test.ts",
  timeout: 30_000,
  use: {
    actionTimeout: 5_000,
    baseURL,
    headless: true,
    ignoreHTTPSErrors: true,
    navigationTimeout: 15_000,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "on-first-retry",
    viewport: { height: 900, width: 1440 },
  },
  workers: resolveWorkerCount(),
});
