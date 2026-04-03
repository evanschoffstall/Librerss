import { describe, expect, test } from "bun:test";

import {
  collectFileMetrics,
  findFileViolations,
  findFunctionViolations,
  LIZARD_THRESHOLDS,
  parseLizardCsv,
  parseLizardCsvLine,
} from "@/../scripts/check-lizard";

describe("parseLizardCsvLine", () => {
  test("preserves quoted commas in function signatures", () => {
    const cells = parseLizardCsvLine(
      '34,6,223,1,87,"useDashboardToolbarState@17-103@src/app/dashboard/hooks/useDashboardToolbarState.ts","src/app/dashboard/hooks/useDashboardToolbarState.ts","useDashboardToolbarState","useDashboardToolbarState ( startInShellLoading = false, search = ""a,b"" )",17,103',
    );

    expect(cells[8]).toContain('search = "a,b"');
    expect(cells).toHaveLength(11);
  });
});

describe("lizard threshold helpers", () => {
  test("locks maintainability thresholds to the stricter policy", () => {
    expect(LIZARD_THRESHOLDS).toEqual({
      fileCcn: 75,
      fileFunctionCount: 15,
      fileNloc: 220,
      functionCcn: 12,
      functionLength: 100,
      functionNloc: 70,
      functionParameterCount: 5,
      functionTokenCount: 400,
    });
  });

  test("parses csv rows into typed function metrics", () => {
    const functions = parseLizardCsv(
      [
        '10,4,120,2,20,"alpha@1-20@src/example.ts","src/example.ts","alpha","alpha",1,20',
        '15,7,200,3,30,"beta@21-50@src/example.ts","src/example.ts","beta","beta",21,50',
      ].join("\n"),
    );

    expect(functions).toEqual([
      {
        ccn: 4,
        functionName: "alpha",
        length: 20,
        location: "alpha@1-20@src/example.ts",
        nloc: 10,
        parameterCount: 2,
        path: "src/example.ts",
        tokenCount: 120,
      },
      {
        ccn: 7,
        functionName: "beta",
        length: 30,
        location: "beta@21-50@src/example.ts",
        nloc: 15,
        parameterCount: 3,
        path: "src/example.ts",
        tokenCount: 200,
      },
    ]);
  });

  test("aggregates file totals and reports function and file violations", () => {
    const functions = parseLizardCsv(
      [
        `351,51,1301,26,551,"tooComplex@1-551@src/hotspot.ts","src/hotspot.ts","tooComplex","tooComplex",1,551`,
        `30,10,200,1,30,"supportA@552-581@src/hotspot.ts","src/hotspot.ts","supportA","supportA",552,581`,
        `30,10,200,1,30,"supportB@582-611@src/hotspot.ts","src/hotspot.ts","supportB","supportB",582,611`,
        `30,10,200,1,30,"supportC@612-641@src/hotspot.ts","src/hotspot.ts","supportC","supportC",612,641`,
        `20,2,100,1,20,"fine@1-20@src/ok.ts","src/ok.ts","fine","fine",1,20`,
      ].join("\n"),
    );

    const files = collectFileMetrics(functions);
    const functionViolations = findFunctionViolations(functions, LIZARD_THRESHOLDS);
    const fileViolations = findFileViolations(files, LIZARD_THRESHOLDS);

    expect(files[0]).toEqual({
      ccn: 81,
      functionCount: 4,
      nloc: 441,
      path: "src/hotspot.ts",
    });
    expect(functionViolations).toHaveLength(1);
    expect(functionViolations[0]).toEqual({
      metrics: [
        "CCN 51 > 12",
        "length 551 > 100",
        "NLOC 351 > 70",
        "tokens 1301 > 400",
        "params 26 > 5",
      ],
      target: "tooComplex (tooComplex@1-551@src/hotspot.ts)",
    });
    expect(fileViolations).toEqual([
      {
        metrics: ["file CCN 81 > 75", "file NLOC 441 > 220"],
        target: "src/hotspot.ts",
      },
    ]);
  });
});