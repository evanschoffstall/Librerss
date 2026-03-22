import type { ReporterDescription } from "@playwright/test";

import { defineConfig, devices } from "@playwright/test";
import { availableParallelism } from "node:os";

import { resolvePlaywrightBaseUrl } from "./scripts/playwright-base-url";

const baseURL = resolvePlaywrightBaseUrl();
const htmlReportDir =
  process.env.PLAYWRIGHT_HTML_REPORT_DIR ?? "playwright-report";
const includeMobileWebKit = process.env.PLAYWRIGHT_INCLUDE_WEBKIT === "1";
const isCoverageRun = process.env.PLAYWRIGHT_COVERAGE_ENABLED === "1";
const junitReportPath = process.env.PLAYWRIGHT_JUNIT_REPORT_PATH?.trim();
const outputDir =
  process.env.PLAYWRIGHT_OUTPUT_DIR ?? "test-results/playwright";
const workerOverride = process.env.PLAYWRIGHT_WORKERS?.trim();
const consoleReporter = process.env.CI ? "dot" : "line";
const reporter: ReporterDescription[] = [
  [consoleReporter],
  ["html", { open: "never", outputFolder: htmlReportDir }],
  ...(junitReportPath
    ? ([["junit", { outputFile: junitReportPath }]] satisfies ReporterDescription[])
    : []),
];

/**
 * Uses a higher local worker count for faster e2e runs while capping coverage
 * runs so the dedicated dev server stays stable under load.
 */
function resolveWorkerCount() {
  if (workerOverride) {
    return workerOverride;
  }

  if (process.env.CI) {
    return 2;
  }

  const detectedWorkerCount = availableParallelism();
  const targetWorkerCount = isCoverageRun
    ? Math.ceil(detectedWorkerCount * 0.75)
    : Math.ceil(detectedWorkerCount * 0.5);

  return Math.min(isCoverageRun ? 4 : 12, Math.max(2, targetWorkerCount));
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
      testIgnore: ["**/*.mobile.e2e.ts"],
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "mobile-chromium",
      testMatch: "**/*.mobile.e2e.ts",
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium" as const,
      },
    },
    ...(includeMobileWebKit
      ? [
          {
            name: "mobile-webkit",
            testMatch: "**/*.mobile.e2e.ts",
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
  testMatch: "**/*.e2e.ts",
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
