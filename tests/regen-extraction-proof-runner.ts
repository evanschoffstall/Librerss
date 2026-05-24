import { writeFileSync } from "node:fs";

import {
  compareExtractionProofOutputs,
  generateExtractionProofOutputs,
  writeExtractionProofOutputs,
} from "./regen-extraction-proof-support";

interface ExtractionProofRunnerResult {
  diffs?: ReturnType<typeof compareExtractionProofOutputs>;
  generatedCount?: number;
}

const outputPath = process.env.REGEN_EXTRACTION_PROOF_OUTPUT_PATH;

if (!outputPath) {
  throw new Error("Expected REGEN_EXTRACTION_PROOF_OUTPUT_PATH env var.");
}

const generatedOutputs = await generateExtractionProofOutputs();

if (shouldUpdateExtractionProofFixtures(Bun.env)) {
  writeExtractionProofOutputs(generatedOutputs);
  writeExtractionProofResult(outputPath, {
    generatedCount: generatedOutputs.length,
  });
} else {
  writeExtractionProofResult(outputPath, {
    diffs: compareExtractionProofOutputs(generatedOutputs),
  });
}

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

function writeExtractionProofResult(
  filePath: string,
  result: ExtractionProofRunnerResult,
): void {
  writeFileSync(filePath, JSON.stringify(result), "utf8");
}
