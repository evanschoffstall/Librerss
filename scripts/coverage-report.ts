import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COVERAGE_EXCLUDED_FILES,
  LINE_COVERAGE_THRESHOLD,
} from "./coverage-config";

const LCOV_PATH = join(process.cwd(), "coverage", "lcov.info");

type CoverageTotals = {
  coveredLines: number;
  foundLines: number;
};

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

const colorize = (text: string, ...codes: string[]) =>
  `${codes.join("")}${text}${ANSI.reset}`;

const divider = () => colorize("────────────────────────────────", ANSI.gray);

const formatStatus = (
  label: string,
  passing: boolean,
  color: string,
  details: string,
) => {
  const status = passing ? "PASS" : "FAIL";
  return `${colorize(status, ANSI.bold, color)} ${colorize(label, ANSI.bold)} ${details}`;
};

function parseLcovTotals(lcovContent: string): CoverageTotals {
  const fileLineHits = new Map<string, Map<number, number>>();
  let currentFile = "";
  let includeCurrentFile = false;

  for (const line of lcovContent.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      currentFile = line.slice(3);
      includeCurrentFile = !COVERAGE_EXCLUDED_FILES.includes(currentFile);
      if (!includeCurrentFile) {
        continue;
      }
      if (!fileLineHits.has(currentFile)) {
        fileLineHits.set(currentFile, new Map<number, number>());
      }
      continue;
    }

    if (!currentFile || !includeCurrentFile) {
      continue;
    }

    if (line.startsWith("DA:")) {
      const payload = line.slice(3);
      const commaIndex = payload.indexOf(",");
      if (commaIndex <= 0) {
        continue;
      }

      const lineNumber = Number.parseInt(payload.slice(0, commaIndex), 10);
      const hitCount = Number.parseInt(payload.slice(commaIndex + 1), 10);

      if (!Number.isFinite(lineNumber) || !Number.isFinite(hitCount)) {
        continue;
      }

      const lineMap = fileLineHits.get(currentFile);
      if (!lineMap) {
        continue;
      }

      const previousHits = lineMap.get(lineNumber) ?? 0;
      lineMap.set(lineNumber, Math.max(hitCount, previousHits));
    }
  }

  let coveredLines = 0;
  let foundLines = 0;

  for (const lineMap of Array.from(fileLineHits.values())) {
    for (const hitCount of Array.from(lineMap.values())) {
      foundLines += 1;
      if (hitCount > 0) {
        coveredLines += 1;
      }
    }
  }

  return { coveredLines, foundLines };
}

function coveragePercent(covered: number, found: number): number {
  if (found === 0) {
    return 100;
  }

  return (covered / found) * 100;
}

if (!existsSync(LCOV_PATH)) {
  console.error(
    `${colorize("FAIL", ANSI.bold, ANSI.red)} Coverage report not found at coverage/lcov.info`,
  );
  process.exit(1);
}

const lcovContent = readFileSync(LCOV_PATH, "utf8");
const totals = parseLcovTotals(lcovContent);

if (totals.foundLines === 0) {
  console.error(
    `${colorize("FAIL", ANSI.bold, ANSI.red)} No executable lines found in coverage report`,
  );
  process.exit(1);
}

const lineCoverage = coveragePercent(totals.coveredLines, totals.foundLines);

console.log(`\n${colorize("Coverage Summary", ANSI.bold, ANSI.cyan)}`);
console.log(divider());
console.log(
  formatStatus(
    "Lines",
    lineCoverage >= LINE_COVERAGE_THRESHOLD,
    lineCoverage >= LINE_COVERAGE_THRESHOLD ? ANSI.green : ANSI.red,
    `${lineCoverage.toFixed(2)}% (${totals.coveredLines}/${totals.foundLines}) · threshold ${LINE_COVERAGE_THRESHOLD.toFixed(1)}%`,
  ),
);
const allPassing = lineCoverage >= LINE_COVERAGE_THRESHOLD;

console.log(divider());

if (!allPassing) {
  process.exit(1);
}
