import { spawnSync } from "node:child_process";

interface ComplexityThresholds {
  fileCcn: number;
  fileFunctionCount: number;
  fileNloc: number;
  functionCcn: number;
  functionLength: number;
  functionNloc: number;
  functionParameterCount: number;
  functionTokenCount: number;
}

interface ComplexityViolation {
  metrics: string[];
  target: string;
}

interface FileMetrics {
  ccn: number;
  functionCount: number;
  nloc: number;
  path: string;
}

interface FunctionMetrics {
  ccn: number;
  functionName: string;
  length: number;
  location: string;
  nloc: number;
  parameterCount: number;
  path: string;
  tokenCount: number;
}

const LIZARD_ANALYSIS_ARGS = [
  "-m",
  "lizard",
  "--csv",
  "-l",
  "typescript",
  "-l",
  "tsx",
  "-x",
  "src/components/ui/*",
  "src",
  "scripts",
  "drizzle.config.ts",
  "next.config.ts",
  "playwright.config.ts",
  "tailwind.config.ts",
] as const;

export const LIZARD_THRESHOLDS: ComplexityThresholds = {
  fileCcn: 75,
  fileFunctionCount: 15,
  fileNloc: 220,
  functionCcn: 12,
  functionLength: 100,
  functionNloc: 70,
  functionParameterCount: 5,
  functionTokenCount: 400,
};

const MAX_REPORTED_VIOLATIONS = 20;

/** Aggregates function metrics into per-file totals for file-size and file-complexity checks. */
export function collectFileMetrics(functions: FunctionMetrics[]): FileMetrics[] {
  const metricsByPath = new Map<string, FileMetrics>();

  for (const entry of functions) {
    const existingMetrics = metricsByPath.get(entry.path) ?? {
      ccn: 0,
      functionCount: 0,
      nloc: 0,
      path: entry.path,
    };

    existingMetrics.ccn += entry.ccn;
    existingMetrics.functionCount += 1;
    existingMetrics.nloc += entry.nloc;
    metricsByPath.set(entry.path, existingMetrics);
  }

  return [...metricsByPath.values()].sort((left, right) => right.ccn - left.ccn);
}

/** Finds per-file complexity and size violations from the aggregated file metrics. */
export function findFileViolations(
  files: FileMetrics[],
  thresholds: ComplexityThresholds,
): ComplexityViolation[] {
  return files.flatMap((entry) => {
    const exceededMetrics = [
      entry.ccn > thresholds.fileCcn
        ? `file CCN ${entry.ccn} > ${thresholds.fileCcn}`
        : null,
      entry.functionCount > thresholds.fileFunctionCount
        ? `file functions ${entry.functionCount} > ${thresholds.fileFunctionCount}`
        : null,
      entry.nloc > thresholds.fileNloc
        ? `file NLOC ${entry.nloc} > ${thresholds.fileNloc}`
        : null,
    ].filter((metric): metric is string => metric !== null);

    if (exceededMetrics.length === 0) {
      return [];
    }

    return [{ metrics: exceededMetrics, target: entry.path }];
  });
}

/** Finds per-function threshold violations in the parsed Lizard metrics. */
export function findFunctionViolations(
  functions: FunctionMetrics[],
  thresholds: ComplexityThresholds,
): ComplexityViolation[] {
  return functions.flatMap((entry) => {
    const exceededMetrics = [
      entry.ccn > thresholds.functionCcn
        ? `CCN ${entry.ccn} > ${thresholds.functionCcn}`
        : null,
      entry.length > thresholds.functionLength
        ? `length ${entry.length} > ${thresholds.functionLength}`
        : null,
      entry.nloc > thresholds.functionNloc
        ? `NLOC ${entry.nloc} > ${thresholds.functionNloc}`
        : null,
      entry.tokenCount > thresholds.functionTokenCount
        ? `tokens ${entry.tokenCount} > ${thresholds.functionTokenCount}`
        : null,
      entry.parameterCount > thresholds.functionParameterCount
        ? `params ${entry.parameterCount} > ${thresholds.functionParameterCount}`
        : null,
    ].filter((metric): metric is string => metric !== null);

    if (exceededMetrics.length === 0) {
      return [];
    }

    return [
      {
        metrics: exceededMetrics,
        target: `${entry.functionName} (${entry.location})`,
      },
    ];
  });
}

/** Converts Lizard CSV output into typed per-function metrics. */
export function parseLizardCsv(csvOutput: string): FunctionMetrics[] {
  return csvOutput
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parseLizardCsvLine(line))
    .map((cells) => {
      if (cells.length < 8) {
        throw new Error(`Unexpected lizard CSV row: ${cells.join(",")}`);
      }

      const [nloc, ccn, tokenCount, parameterCount, length, location, path, functionName] = cells;

      return {
        ccn: Number.parseInt(ccn ?? "0", 10),
        functionName: functionName && functionName.length > 0 ? functionName : "(anonymous)",
        length: Number.parseInt(length ?? "0", 10),
        location: location ?? path ?? "unknown-location",
        nloc: Number.parseInt(nloc ?? "0", 10),
        parameterCount: Number.parseInt(parameterCount ?? "0", 10),
        path: path ?? "unknown-file",
        tokenCount: Number.parseInt(tokenCount ?? "0", 10),
      } satisfies FunctionMetrics;
    });
}

/** Parses one Lizard CSV line while preserving quoted commas in function signatures. */
export function parseLizardCsvLine(line: string): string[] {
  const cells: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? "";
    const nextCharacter = line[index + 1] ?? "";

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      cells.push(currentCell);
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  cells.push(currentCell);
  return cells;
}

/** Executes the pinned Lizard analysis and returns raw CSV output for post-processing. */
export function runLizardAnalysis(): string {
  const result = spawnSync("python3", [...LIZARD_ANALYSIS_ARGS], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  const stderr = result.stderr.trim();
  const stdout = result.stdout.trim();

  if (result.status !== 0) {
    const details = stderr || stdout || "lizard exited with a non-zero status";
    failWithOutput(
      [
        "complexity: 0 function violations · 0 file violations",
        "missing dependency or runner failure while starting python3 -m lizard",
        details,
        "install with: python3 -m pip install -r requirements-dev.txt",
      ].join("\n"),
      result.status ?? 1,
    );
  }

  if (/No module named/i.test(stderr) || /No module named/i.test(stdout)) {
    failWithOutput(
      [
        "complexity: 0 function violations · 0 file violations",
        stderr || stdout,
        "install with: python3 -m pip install -r requirements-dev.txt",
      ].join("\n"),
    );
  }

  return result.stdout;
}

function failWithOutput(output: string, exitCode = 1): never {
  process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  process.exit(exitCode);
}

function formatThresholdSummary(thresholds: ComplexityThresholds): string {
  return [
    `function CCN<=${thresholds.functionCcn}`,
    `function length<=${thresholds.functionLength}`,
    `function NLOC<=${thresholds.functionNloc}`,
    `function tokens<=${thresholds.functionTokenCount}`,
    `function params<=${thresholds.functionParameterCount}`,
    `file CCN<=${thresholds.fileCcn}`,
    `file functions<=${thresholds.fileFunctionCount}`,
    `file NLOC<=${thresholds.fileNloc}`,
  ].join(" · ");
}

function formatViolations(title: string, violations: ComplexityViolation[]): string[] {
  const lines = [title];

  for (const violation of violations.slice(0, MAX_REPORTED_VIOLATIONS)) {
    lines.push(`  - ${violation.target}: ${violation.metrics.join(", ")}`);
  }

  if (violations.length > MAX_REPORTED_VIOLATIONS) {
    lines.push(
      `  - ... ${violations.length - MAX_REPORTED_VIOLATIONS} more violation(s) omitted`,
    );
  }

  return lines;
}

function main(): void {
  const lizardCsvOutput = runLizardAnalysis();
  const functions = parseLizardCsv(lizardCsvOutput);

  if (functions.length === 0) {
    failWithOutput("complexity: 0 function violations · 0 file violations\nno lizard rows were produced");
  }

  const files = collectFileMetrics(functions);
  const functionViolations = findFunctionViolations(functions, LIZARD_THRESHOLDS);
  const fileViolations = findFileViolations(files, LIZARD_THRESHOLDS);
  const summary = `complexity: ${functionViolations.length} function violations · ${fileViolations.length} file violations`;
  const thresholdSummary = formatThresholdSummary(LIZARD_THRESHOLDS);

  if (functionViolations.length === 0 && fileViolations.length === 0) {
    process.stdout.write(`${summary}\n${thresholdSummary}\n`);
    return;
  }

  const outputLines = [summary, thresholdSummary];

  if (functionViolations.length > 0) {
    outputLines.push(...formatViolations("Function threshold violations:", functionViolations));
  }

  if (fileViolations.length > 0) {
    outputLines.push(...formatViolations("File threshold violations:", fileViolations));
  }

  failWithOutput(outputLines.join("\n"));
}

if (import.meta.main) {
  main();
}