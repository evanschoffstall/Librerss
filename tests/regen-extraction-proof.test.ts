import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type ExtractionProofDiff } from "./regen-extraction-proof-support";

const REPO_ROOT = join(import.meta.dir, "..");

describe("regen extraction proof", () => {
  test("matches checked-in sanitized extraction proof outputs.", async () => {
    const result = runExtractionProofCheck();

    if (shouldUpdateExtractionProofFixtures(Bun.env)) {
      expect(result.generatedCount ?? 0).toBeGreaterThan(0);
      return;
    }

    const diffs = result.diffs ?? [];
    expect(diffs, formatExtractionProofDiffMessage(diffs)).toHaveLength(0);
  }, 60_000);
});

interface ExtractionProofRunnerResult {
  diffs?: ExtractionProofDiff[];
  generatedCount?: number;
}

function createIsolatedRunnerEnv(
  env: NodeJS.ProcessEnv,
  outputPath: string,
): NodeJS.ProcessEnv {
  const isolatedEnv: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PATH: env.PATH,
    REGEN_EXTRACTION_PROOF_CHILD: "1",
    REGEN_EXTRACTION_PROOF_OUTPUT_PATH: outputPath,
  };

  if (env.UPDATE_EXTRACTION_PROOF !== undefined) {
    isolatedEnv.UPDATE_EXTRACTION_PROOF = env.UPDATE_EXTRACTION_PROOF;
  }

  return isolatedEnv;
}

/**
 * Format all detected extraction proof fixture diffs into one reviewable failure.
 * @param diffs - Created, changed, and stale proof fixture records.
 * @returns Failure message explaining how to review and accept proof changes.
 */
function formatExtractionProofDiffMessage(
  diffs: ExtractionProofDiff[],
): string {
  if (diffs.length === 0) {
    return "Extraction proof fixtures match generated output.";
  }

  const diffLines = diffs
    .map((diff) => {
      const sourceSuffix = diff.relativeInputPath
        ? ` from ${diff.relativeInputPath}`
        : "";
      return `- ${diff.kind}: tests/regen-extraction-proof/${diff.expectedFileName}${sourceSuffix}`;
    })
    .join("\n");

  return [
    "Extraction proof fixtures differ from the full in-code extraction and sanitization pipeline.",
    "Confirm extraction proof changes do not show regressions before accepting them.",
    "Run `bun run test:regen` to refresh the expected fixtures after review.",
    diffLines,
  ].join("\n");
}

function runExtractionProofCheck(): ExtractionProofRunnerResult {
  const outputDirectory = mkdtempSync(
    join(tmpdir(), "librerss-regen-extraction-proof-"),
  );
  const outputPath = join(outputDirectory, "result.json");

  try {
    execFileSync("bun", ["run", "./tests/regen-extraction-proof-runner.ts"], {
      cwd: REPO_ROOT,
      env: createIsolatedRunnerEnv(process.env, outputPath),
      stdio: "pipe",
    });

    return JSON.parse(
      readFileSync(outputPath, "utf8"),
    ) as ExtractionProofRunnerResult;
  } finally {
    rmSync(outputDirectory, { force: true, recursive: true });
  }
}

/**
 * Return whether this test run should update expected extraction proof fixtures.
 * @param env - Bun environment variables.
 * @returns Whether proof fixtures should be rewritten instead of compared.
 */
function shouldUpdateExtractionProofFixtures(
  env: Record<string, string | undefined>,
): boolean {
  if (
    env.UPDATE_EXTRACTION_PROOF !== undefined &&
    env.UPDATE_EXTRACTION_PROOF !== "1"
  ) {
    throw new Error("UPDATE_EXTRACTION_PROOF must be unset or exactly '1'.");
  }

  return env.UPDATE_EXTRACTION_PROOF === "1";
}
