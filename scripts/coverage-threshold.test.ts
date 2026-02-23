import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LINE_COVERAGE_THRESHOLD = 95.5;
const BRANCH_COVERAGE_THRESHOLD = 85.0; // Branches are harder to cover
const LCOV_PATH = join(process.cwd(), "coverage", "lcov.info");

type CoverageTotals = {
  coveredLines: number;
  foundLines: number;
  coveredBranches: number;
  foundBranches: number;
};

function parseLcovTotals(lcovContent: string): CoverageTotals {
  const fileLineHits = new Map<string, Map<number, number>>();
  const fileBranchHits = new Map<string, Map<string, number>>();
  let currentFile = "";

  for (const line of lcovContent.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      currentFile = line.slice(3);
      if (!fileLineHits.has(currentFile)) {
        fileLineHits.set(currentFile, new Map<number, number>());
        fileBranchHits.set(currentFile, new Map<string, number>());
      }
      continue;
    }

    if (!currentFile) {
      continue;
    }

    // Parse line coverage: DA:lineNumber,hitCount
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

    // Parse branch coverage: BRDA:line,block,branch,taken
    if (line.startsWith("BRDA:")) {
      const payload = line.slice(5);
      const parts = payload.split(",");
      if (parts.length !== 4) {
        continue;
      }

      const branchKey = `${parts[0]},${parts[1]},${parts[2]}`;
      const taken = parts[3] === "-" ? 0 : Number.parseInt(parts[3], 10);

      if (!Number.isFinite(taken)) {
        continue;
      }

      const branchMap = fileBranchHits.get(currentFile);
      if (!branchMap) {
        continue;
      }

      const previousHits = branchMap.get(branchKey) ?? 0;
      branchMap.set(branchKey, Math.max(taken, previousHits));
    }
  }

  let coveredLines = 0;
  let foundLines = 0;
  let coveredBranches = 0;
  let foundBranches = 0;

  // Calculate line coverage
  for (const lineMap of Array.from(fileLineHits.values())) {
    for (const hitCount of Array.from(lineMap.values())) {
      foundLines += 1;
      if (hitCount > 0) {
        coveredLines += 1;
      }
    }
  }

  // Calculate branch coverage
  for (const branchMap of Array.from(fileBranchHits.values())) {
    for (const taken of Array.from(branchMap.values())) {
      foundBranches += 1;
      if (taken > 0) {
        coveredBranches += 1;
      }
    }
  }

  return { coveredLines, foundLines, coveredBranches, foundBranches };
}

function calculateCoveragePercent(covered: number, found: number): number {
  if (found === 0) {
    return 100;
  }

  return (covered / found) * 100;
}

describe("coverage threshold", () => {
  if (process.env.CHECK_COVERAGE !== "1") {
    test("coverage threshold check skipped", () => {
      expect(true).toBe(true);
    });
    return;
  }

  test("coverage meets minimum thresholds", () => {
    expect(existsSync(LCOV_PATH)).toBe(true);

    const lcovContent = readFileSync(LCOV_PATH, "utf8");
    const totals = parseLcovTotals(lcovContent);
    const lineCoveragePercent = calculateCoveragePercent(
      totals.coveredLines,
      totals.foundLines,
    );
    const branchCoveragePercent = calculateCoveragePercent(
      totals.coveredBranches,
      totals.foundBranches,
    );

    // Ensure we have actual coverage data
    expect(totals.foundLines).toBeGreaterThan(0);

    // Line coverage threshold
    expect(lineCoveragePercent).toBeGreaterThanOrEqual(LINE_COVERAGE_THRESHOLD);

    // Branch coverage threshold (only if branches exist)
    if (totals.foundBranches > 0) {
      expect(branchCoveragePercent).toBeGreaterThanOrEqual(
        BRANCH_COVERAGE_THRESHOLD,
      );
    }
  });
});
