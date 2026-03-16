import MCR from "monocart-coverage-reports";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const PLAYWRIGHT_COVERAGE_OUTPUT_DIR =
  process.env.PLAYWRIGHT_COVERAGE_OUTPUT_DIR ?? "coverage/playwright-raw";
const PLAYWRIGHT_COVERAGE_REPORT_DIR =
  process.env.PLAYWRIGHT_COVERAGE_REPORT_DIR ?? "coverage/playwright";
const PROJECT_SOURCE_DIRECTORY_PATH = normalizePath(
  join(process.cwd(), "src") + sep,
);

/** Recursively lists files beneath a directory without relying on shell utilities. */
async function listFilesRecursively(directoryPath) {
  const directoryEntries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  const nestedFiles = await Promise.all(
    directoryEntries.map(async (directoryEntry) => {
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
async function main() {
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
    sourceFilter: (sourcePath) => {
      const normalizedSourcePath = normalizePath(sourcePath);
      return normalizedSourcePath.startsWith(PROJECT_SOURCE_DIRECTORY_PATH);
    },
  });

  for (const rawCoverageFilePath of rawCoverageFilePaths) {
    await coverageReport.add(
      JSON.parse(await readFile(rawCoverageFilePath, "utf8")),
    );
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
function normalizePath(filePath) {
  return filePath.split(sep).join("/");
}

await main();
