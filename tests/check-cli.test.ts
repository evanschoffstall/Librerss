import { describe, expect, test } from "bun:test";

import { parseCliArguments } from "@/../scripts/check";

describe("parseCliArguments", () => {
  test("collects suite exclusions from ---no flags", () => {
    const result = parseCliArguments([
      "bun",
      "/home/evans/Repos/librerss/scripts/check.ts",
      "---no=playwright",
      "---no=lint",
    ]);

    expect(result.directStep?.key).toBeUndefined();
    expect(result.directStepArgs).toEqual([]);
    expect(result.invalidSuiteExclusions).toEqual([]);
    expect(result.invalidSuiteFlags).toEqual([]);
    expect(Array.from(result.excludedKeys)).toEqual(["playwright", "lint"]);
    expect(result.keyFilter).toBeNull();
  });

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

  test("preserves suite filters while excluding other configured keys", () => {
    const result = parseCliArguments([
      "bun",
      "/home/evans/Repos/librerss/scripts/check.ts",
      "--junit",
      "---no=playwright",
    ]);

    expect(Array.from(result.keyFilter ?? [])).toEqual(["junit"]);
    expect(Array.from(result.excludedKeys)).toEqual(["playwright"]);
    expect(result.invalidSuiteExclusions).toEqual([]);
  });

  test("reports unknown suite exclusions", () => {
    const result = parseCliArguments([
      "bun",
      "/home/evans/Repos/librerss/scripts/check.ts",
      "---no=missing-step",
      "---no=",
    ]);

    expect(Array.from(result.excludedKeys)).toEqual(["missing-step"]);
    expect(result.invalidSuiteExclusions).toEqual([
      "---no=",
      "missing-step",
    ]);
  });

  test("parses suite exclusions in summary mode", () => {
    const result = parseCliArguments([
      "bun",
      "/home/evans/Repos/librerss/scripts/check.ts",
      "summary",
      "---no=playwright",
      "--junit",
    ]);

    expect(result.command).toBe("summary");
    expect(Array.from(result.excludedKeys)).toEqual(["playwright"]);
    expect(Array.from(result.keyFilter ?? [])).toEqual(["junit"]);
    expect(result.invalidSuiteExclusions).toEqual([]);
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