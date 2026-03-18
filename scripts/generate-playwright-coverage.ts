import type { Dirent } from "node:fs";

import MCR from "monocart-coverage-reports";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/** Aggregates raw Playwright coverage artifacts into the reports consumed by repo checks. */

const PLAYWRIGHT_COVERAGE_OUTPUT_DIR =
  process.env.PLAYWRIGHT_COVERAGE_OUTPUT_DIR ?? "coverage/playwright-raw";
const PLAYWRIGHT_COVERAGE_REPORT_DIR =
  process.env.PLAYWRIGHT_COVERAGE_REPORT_DIR ?? "coverage/playwright";
const PROJECT_SOURCE_DIRECTORY_PATH = normalizePath(
  join(process.cwd(), "src") + sep,
);

type RawCoverageData = MCR.V8CoverageEntry[] | Record<string, unknown>;

/** Narrows unknown JSON objects so the script can reject invalid payloads early. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Checks the minimal V8 entry shape Monocart expects from Playwright raw coverage dumps. */
function isV8CoverageEntry(value: unknown): value is MCR.V8CoverageEntry {
  return isRecord(value) && typeof value.url === "string";
}

/** Recursively lists files beneath a directory without relying on shell utilities. */
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

/** Creates the Playwright-to-source coverage reports used by the repo checks. */
async function main(): Promise<void> {
  const rawCoverageDirectoryPath = join(
    process.cwd(),
    PLAYWRIGHT_COVERAGE_OUTPUT_DIR,
  );
  const reportDirectoryPath = join(
    process.cwd(),
    PLAYWRIGHT_COVERAGE_REPORT_DIR,
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

  const coverageReport = MCR({
    clean: true,
    cleanCache: true,
    logging: "error",
    name: "playwright-e2e",
    outputDir: reportDirectoryPath,
    reports: [
      ["console-summary"],
      ["html", { subdir: "html" }],
      ["json-summary", { file: "summary.json" }],
      ["lcovonly", { file: "lcov.info" }],
    ],
    sourceFilter: (sourcePath: string) => {
      const normalizedSourcePath = normalizePath(sourcePath);
      return normalizedSourcePath.startsWith(PROJECT_SOURCE_DIRECTORY_PATH);
    },
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

  console.log(
    `Generated Playwright coverage from ${rawCoverageFilePaths.length} raw file(s) into ${relative(process.cwd(), reportDirectoryPath) || "."}.`,
  );
}

/** Normalizes paths so coverage filters behave consistently across platforms. */
function normalizePath(filePath: string): string {
  return filePath.split(sep).join("/");
}

/** Validates the parsed raw coverage payload before it reaches Monocart. */
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

await main();