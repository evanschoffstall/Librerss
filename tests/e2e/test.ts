import {
    test as base,
    expect,
    type Page,
    type TestInfo,
} from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PLAYWRIGHT_COVERAGE_ENABLED =
  process.env.PLAYWRIGHT_COVERAGE_ENABLED === "1";
const PLAYWRIGHT_COVERAGE_OUTPUT_DIR =
  process.env.PLAYWRIGHT_COVERAGE_OUTPUT_DIR ?? "coverage/playwright-raw";

/** Builds a stable, filesystem-safe name for persisted per-test coverage payloads. */
function createCoverageFileName(testInfo: TestInfo) {
  const titlePath = testInfo.titlePath.join(" > ");
  const titleHash = createHash("sha1").update(titlePath).digest("hex").slice(0, 12);
  const sanitizedTitle = titlePath
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);

  return `${testInfo.workerIndex}-${testInfo.retry}-${sanitizedTitle || "test"}-${titleHash}.json`;
}

/** Persists raw Chromium V8 coverage so the wrapper can merge it after the run. */
async function persistRawCoverage(page: Page, testInfo: TestInfo) {
  const rawCoverageDirectoryPath = join(
    process.cwd(),
    PLAYWRIGHT_COVERAGE_OUTPUT_DIR,
  );
  const rawCoverageEntries = await page.coverage.stopJSCoverage();

  await mkdir(rawCoverageDirectoryPath, { recursive: true });
  await writeFile(
    join(rawCoverageDirectoryPath, createCoverageFileName(testInfo)),
    JSON.stringify(rawCoverageEntries),
    "utf8",
  );
}

/** Shared Playwright test base that enables optional raw Chromium coverage capture. */
export const test = base.extend({
  page: async ({ browserName, page }, runTest, testInfo) => {
    const shouldCollectCoverage =
      PLAYWRIGHT_COVERAGE_ENABLED && browserName === "chromium";

    if (shouldCollectCoverage) {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    }

    try {
      await runTest(page);
    } finally {
      if (shouldCollectCoverage) {
        await persistRawCoverage(page, testInfo);
      }
    }
  },
});

export { expect };
