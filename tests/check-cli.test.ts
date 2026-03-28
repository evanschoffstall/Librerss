import { describe, expect, test } from "bun:test";

import { parseCliArguments } from "@/../scripts/check";

describe("parseCliArguments", () => {
  test("keeps suite-filter mode for junit without extra args", () => {
    const result = parseCliArguments([
      "bun",
      "/home/evans/Repos/librerss/scripts/check.ts",
      "--junit",
    ]);

    expect(result.directStep?.key).toBeUndefined();
    expect(result.directStepArgs).toEqual([]);
    expect(Array.from(result.keyFilter ?? [])).toEqual(["junit"]);
  });

  test("routes junit suite-flag args into direct execution", () => {
    const result = parseCliArguments([
      "bun",
      "/home/evans/Repos/librerss/scripts/check.ts",
      "--junit",
      "tests/check-cli.test.ts",
    ]);

    expect(result.directStep?.key).toBe("junit");
    expect(result.directStepArgs).toEqual(["tests/check-cli.test.ts"]);
    expect(result.keyFilter).toBeNull();
  });

  test("preserves explicit passthrough args after separator", () => {
    const result = parseCliArguments([
      "bun",
      "/home/evans/Repos/librerss/scripts/check.ts",
      "--junit",
      "tests/check-cli.test.ts",
      "--",
      "--bail",
    ]);

    expect(result.directStep?.key).toBe("junit");
    expect(result.directStepArgs).toEqual([
      "tests/check-cli.test.ts",
      "--bail",
    ]);
    expect(result.keyFilter).toBeNull();
  });
});