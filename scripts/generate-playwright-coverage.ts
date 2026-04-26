import type { Dirent } from "node:fs";

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

/**
 * Describes the source path info.
 */
interface SourcePathInfo {
  distFile?: string;
}

if (typeof globalThis.gc !== "function") {
  /**
   * Provides a no-op GC hook in environments where `--expose-gc` is disabled.
   * @returns A promise that resolves immediately.
   */
  globalThis.gc = async () => undefined;
}

/** Aggregates raw Playwright coverage artifacts into the reports consumed by repo checks. */

const PLAYWRIGHT_COVERAGE_OUTPUT_DIR =
  process.env.PLAYWRIGHT_COVERAGE_OUTPUT_DIR ?? "coverage/playwright-raw";
const PLAYWRIGHT_COVERAGE_REPORT_DIR =
  process.env.PLAYWRIGHT_COVERAGE_REPORT_DIR ?? "coverage/playwright";
const PLAYWRIGHT_COVERAGE_HTML_REPORT_ENABLED =
  process.env.PLAYWRIGHT_COVERAGE_HTML_REPORT_ENABLED === "1";

/**
 * Defines the coverage summary type.
 */
type CoverageSummary = Record<string, unknown>;
/**
 * Defines the raw coverage data type.
 */
type RawCoverageData = Record<string, unknown> | V8CoverageEntry[];
const PROJECT_SOURCE_DIRECTORY_PATH = `${process.cwd().replaceAll("\\", "/")}/src/`;
const SUMMARY_METRIC_KEYS = [
  "lines",
  "statements",
  "functions",
  "branches",
  "branchesTrue",
] as const;

/**
 * Describes the coverage metric.
 */
interface CoverageMetric {
  covered: number;
  pct: number;
  skipped: number;
  total: number;
}
/**
 * Defines the coverage metric key type.
 */
type CoverageMetricKey = (typeof SUMMARY_METRIC_KEYS)[number];

/**
 * Defines the coverage summary entry type.
 */
type CoverageSummaryEntry = Partial<Record<CoverageMetricKey, CoverageMetric>>;

/**
 * Describes the monocart coverage report.
 */
interface MonocartCoverageReport {
  add: (coverageData: RawCoverageData) => Promise<void>;
  cleanCache: () => Promise<void>;
  generate: () => Promise<unknown>;
}
/**
 * Defines the monocart coverage report factory type.
 */
type MonocartCoverageReportFactory = (
  options: Record<string, unknown>,
) => MonocartCoverageReport;
/**
 * Describes the v8 coverage entry.
 */
interface V8CoverageEntry {
  url: string;
}

/**
 * Process the assert source mapped coverage.
 * @param reportDirectoryPath - The report directory path.
 * @param projectSourceFilePathSet - The project source file path set.
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
 * Return the summary metric.
 * @param summaryEntry - The summary entry.
 * @param metricKey - The metric key.
 * @returns The summary metric.
 */
function getSummaryMetric(
  summaryEntry: CoverageSummaryEntry,
  metricKey: CoverageMetricKey,
): CoverageMetric | null {
  return summaryEntry[metricKey] ?? null;
}

/**
 * Return whether is record.
 * @param value - The value.
 * @returns Whether is record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Return whether is tracked project source file.
 * @param sourcePath - The source path.
 * @param projectSourceFilePathSet - The project source file path set.
 * @returns Whether is tracked project source file.
 */
function isTrackedProjectSourceFile(
  sourcePath: string,
  projectSourceFilePathSet: ReadonlySet<string>,
): boolean {
  return projectSourceFilePathSet.has(normalizeCoveragePath(sourcePath));
}

/**
 * Return whether is v8 coverage entry.
 * @param value - The value.
 * @returns Whether is v8 coverage entry.
 */
function isV8CoverageEntry(value: unknown): value is V8CoverageEntry {
  return isRecord(value) && typeof value.url === "string";
}

/**
 * Process the list files recursively.
 * @param directoryPath - The directory path.
 * @returns The list files recursively.
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
 * Process the main.
 */
async function main(): Promise<void> {
  const monocartModule =
    (await import("monocart-coverage-reports")) as unknown as {
      default: MonocartCoverageReportFactory;
    };
  const MCR = monocartModule.default;
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

  const coverageReport = MCR({
    clean: true,
    cleanCache: true,
    logging: "error",
    name: "playwright-e2e",
    outputDir: reportDirectoryPath,
    reports: [
      ...(PLAYWRIGHT_COVERAGE_HTML_REPORT_ENABLED
        ? ([
            ["html", { subdir: "html" }],
          ] as const)
        : []),
      ["json-summary", { file: "summary.json" }],
      ["lcovonly", { file: "lcov.info" }],
    ],
    /**
     * Process the source filter.
     * @param sourcePath - The source path.
     * @returns Whether source filter.
     */
    sourceFilter: (sourcePath: string) =>
      isTrackedProjectSourceFile(sourcePath, projectSourceFilePathSet),
    /**
     * Process the source path.
     * @param sourcePath - The source path.
     * @param info - The info.
     * @returns The source path.
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
 * Process the merge coverage metric.
 * @param summaryEntries - The summary entries.
 * @param metricKey - The metric key.
 * @returns The merge coverage metric.
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
 * Normalize the coverage path.
 * @param sourcePath - The source path.
 * @param distFilePath - The dist file path.
 * @returns The coverage path.
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
 * Normalize the dist file path.
 * @param distFilePath - The dist file path.
 * @returns The dist file path.
 */
function normalizeDistFilePath(distFilePath?: string): string {
  return distFilePath?.replaceAll("\\", "/") ?? "";
}

/**
 * Parse the raw coverage data.
 * @param rawCoverageJson - The raw coverage json.
 * @param rawCoverageFilePath - The raw coverage file path.
 * @returns The raw coverage data.
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
 * Process the rewrite coverage artifacts.
 * @param reportDirectoryPath - The report directory path.
 * @param projectSourceFilePathSet - The project source file path set.
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
 * Process the rewrite lcov file.
 * @param reportDirectoryPath - The report directory path.
 * @param projectSourceFilePathSet - The project source file path set.
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
 * Process the rewrite summary file.
 * @param reportDirectoryPath - The report directory path.
 * @param projectSourceFilePathSet - The project source file path set.
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

await main();
