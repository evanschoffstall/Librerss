import { describe, expect, test } from "bun:test";

import {
  compareExtractionProofOutputs,
  generateExtractionProofOutputs,
  writeExtractionProofOutputs,
  type ExtractionProofDiff,
} from "./regen-extraction-proof-support";

const REVIEW_NOTE =
  "Confirm extraction proof changes do not show regressions before accepting them.";

describe("regen extraction proof", () => {
  test("matches checked-in sanitized extraction proof outputs", async () => {
    const generatedOutputs = await generateExtractionProofOutputs();

    if (shouldUpdateExtractionProofFixtures(Bun.env)) {
      writeExtractionProofOutputs(generatedOutputs);
      expect(generatedOutputs.length).toBeGreaterThan(0);
      return;
    }

    const diffs = compareExtractionProofOutputs(generatedOutputs);
    expect(diffs, formatExtractionProofDiffMessage(diffs)).toHaveLength(0);
  }, 60_000);
});

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
    REVIEW_NOTE,
    "Run `bun run test:regen` to refresh the expected fixtures after review.",
    diffLines,
  ].join("\n");
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
