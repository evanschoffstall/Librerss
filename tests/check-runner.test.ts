import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyOutputFilter,
  buildSummary,
  compactDomAssertionNoise,
  resolveTimeoutMs,
  run,
  runInlineTypeScriptStep,
  runStepBatch,
  runStepPostProcess,
  runStepWithinDeadline,
} from "@/../scripts/check";

type CommandResult = Awaited<ReturnType<typeof run>>;
type InlineStep = Parameters<typeof runInlineTypeScriptStep>[0];
type PostProcessStep = Parameters<typeof runStepPostProcess>[0];
type StepDeadlineArgument = Parameters<typeof runStepWithinDeadline>[0];

const trackedEnv = new Map<string, string | undefined>();
const trackedTempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "librerss-check-runner-"));
  trackedTempDirs.push(dir);
  return dir;
}

function makeCommandResult(
  overrides: Partial<CommandResult> = {},
): CommandResult {
  return {
    durationMs: 0,
    exitCode: 0,
    output: "",
    timedOut: false,
    ...overrides,
  };
}

function makeDeadlineStep(
  overrides: Partial<StepDeadlineArgument> = {},
): StepDeadlineArgument {
  return {
    key: "deadline-step",
    label: "Deadline Step",
    ...overrides,
  } as StepDeadlineArgument;
}

function makeInlineStep(overrides: Partial<InlineStep> = {}): InlineStep {
  return {
    key: "inline-step",
    label: "Inline Step",
    ...overrides,
  } as InlineStep;
}

function makePostProcessStep(
  overrides: Partial<PostProcessStep> = {},
): PostProcessStep {
  return {
    key: "post-process-step",
    label: "Post Process Step",
    ...overrides,
  } as PostProcessStep;
}

function setTrackedEnv(name: string, value: string | undefined): void {
  if (!trackedEnv.has(name)) {
    trackedEnv.set(name, process.env[name]);
  }

  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

afterEach(() => {
  for (const [name, originalValue] of trackedEnv) {
    if (originalValue === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalValue;
    }
  }
  trackedEnv.clear();

  for (const dir of trackedTempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("resolveTimeoutMs", () => {
  test("prefers a positive environment override", () => {
    setTrackedEnv("CHECK_RUNNER_TIMEOUT_MS", "321");

    expect(resolveTimeoutMs("CHECK_RUNNER_TIMEOUT_MS", 100, 50)).toBe(321);
  });

  test("falls back to configured and default values when needed", () => {
    setTrackedEnv("CHECK_RUNNER_TIMEOUT_MS", "0");

    expect(resolveTimeoutMs("CHECK_RUNNER_TIMEOUT_MS", 240, 50)).toBe(240);
    expect(resolveTimeoutMs("CHECK_RUNNER_TIMEOUT_MS", undefined, 50)).toBe(
      50,
    );
  });
});

describe("run", () => {
  test("reports missing bunx targets without spawning a process", async () => {
    const result = await run("bunx", ["definitely-missing-bunx-target"]);

    expect(result.exitCode).toBe(127);
    expect(result.notFound).toBeTrue();
    expect(result.output).toContain("command not found: definitely-missing-bunx-target");
  });

  test("reports missing commands", async () => {
    const result = await run("definitely-missing-check-runner-command", []);

    expect(result.exitCode).toBe(127);
    expect(result.notFound).toBeTrue();
    expect(result.output).toContain(
      "command not found: definitely-missing-check-runner-command",
    );
  });

  test("collects output from successful child processes", async () => {
    const result = await run("bun", ["-e", "console.log('runner ok')"]);

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBeFalse();
    expect(result.output).toContain("runner ok");
  });

  test("marks missing-module style output as not found", async () => {
    const result = await run(
      "bun",
      ["-e", "console.error('Cannot find module \"virtual-module\"')"],
      { label: "missing-module-check" },
    );

    expect(result.exitCode).toBe(0);
    expect(result.notFound).toBeTrue();
    expect(result.output).toContain("Cannot find module");
  });

  test("terminates timed out child processes and appends a timeout message", async () => {
    const result = await run(
      "bun",
      ["-e", "await Bun.sleep(100)"],
      {
        label: "slow-runner-step",
        timeoutDrainMs: 20,
        timeoutMs: 10,
      },
    );

    expect(result.exitCode).toBe(124);
    expect(result.timedOut).toBeTrue();
    expect(result.output).toContain("slow-runner-step exceeded the 10ms timeout");
  });
});

describe("runInlineTypeScriptStep", () => {
  test("returns an error when inline config is missing", async () => {
    const result = await runInlineTypeScriptStep(
      makeInlineStep({ config: { invalid: true } }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(
      "Inline Step is missing a valid inline TypeScript config",
    );
  });

  test("executes inline TypeScript with injected imports and cached compilation", async () => {
    const source = [
      "async ({ data, importModule, ok }) => {",
      "  const loaded = await importModule('virtual:demo');",
      "  return ok(`value:${loaded.base + Number(data['offset'] ?? 0)}`);",
      "}",
    ].join("\n");
    const loadModule = async () => ({ base: 40 });

    const firstResult = await runInlineTypeScriptStep(
      makeInlineStep({
        config: { data: { offset: 2 }, source },
      }),
      { importModule: loadModule },
    );
    const secondResult = await runInlineTypeScriptStep(
      makeInlineStep({
        config: { data: { offset: 1 }, source },
      }),
      { importModule: loadModule },
    );

    expect(firstResult.exitCode).toBe(0);
    expect(firstResult.output).toBe("value:42");
    expect(secondResult.exitCode).toBe(0);
    expect(secondResult.output).toBe("value:41");
  });

  test("rejects invalid inline results", async () => {
    const result = await runInlineTypeScriptStep(
      makeInlineStep({
        config: {
          source: "() => ({ status: 'no-command' })",
        },
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(
      "Inline Step returned an invalid inline TypeScript result",
    );
  });

  test("surfaces inline execution failures", async () => {
    const result = await runInlineTypeScriptStep(
      makeInlineStep({
        config: {
          source: "() => { throw new Error('boom'); }",
        },
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Inline Step failed: boom");
  });
});

describe("runStepPostProcess", () => {
  test("normalizes structured post-process output", async () => {
    const result = await runStepPostProcess(
      makePostProcessStep({
        postProcess: {
          source: [
            "({ command, displayOutput, helpers, resolveTokenString }) => ({",
            "  extraChecks: [{ label: 'Nested check', details: 'ok', status: 'pass' }],",
            "  messages: [{ text: 'Processed output', tone: 'pass' }],",
            "  output: helpers.compactDomAssertionNoise(displayOutput),",
            "  sections: [{ title: resolveTokenString('Artifacts {artifact}'), items: ['report.txt'], tone: 'warn' }],",
            "  status: command.exitCode === 0 ? 'pass' : 'fail',",
            "  summary: resolveTokenString('stored {artifact}'),",
            "})",
          ].join("\n"),
        },
        tokens: { artifact: "bundle" },
      }),
      makeCommandResult({ exitCode: 0 }),
      [
        "Received: HTMLElement {",
        "  <div>",
        "    child",
        "  </div>",
        "}",
        "  at test stack",
      ].join("\n"),
    );

    expect(result).toEqual({
      extraChecks: [{ details: "ok", label: "Nested check", status: "pass" }],
      messages: [{ text: "Processed output", tone: "pass" }],
      output: [
        "Received: HTMLElement { /* DOM tree omitted */ }",
        "  ... omitted 4 DOM detail line(s) ...",
        "  at test stack",
      ].join("\n"),
      sections: [
        { items: ["report.txt"], title: "Artifacts bundle", tone: "warn" },
      ],
      status: "pass",
      summary: "stored bundle",
    });
  });

  test("skips post-processing for missing or timed out commands", async () => {
    const step = makePostProcessStep({
      postProcess: { source: "() => ({ summary: 'unused' })" },
    });

    expect(
      await runStepPostProcess(
        step,
        makeCommandResult({ notFound: true }),
        "output",
      ),
    ).toBeNull();
    expect(
      await runStepPostProcess(
        step,
        makeCommandResult({ timedOut: true }),
        "output",
      ),
    ).toBeNull();
  });

  test("reports invalid or failing post-process handlers", async () => {
    const invalidResult = await runStepPostProcess(
      makePostProcessStep({
        postProcess: { source: "() => ({ status: 'maybe' })" },
      }),
      makeCommandResult(),
      "output",
    );
    const thrownResult = await runStepPostProcess(
      makePostProcessStep({
        postProcess: { source: "() => { throw new Error('post boom'); }" },
      }),
      makeCommandResult(),
      "output",
    );

    expect(invalidResult?.status).toBe("fail");
    expect(invalidResult?.summary).toBe(
      "Post Process Step post-process returned an invalid result",
    );
    expect(thrownResult?.status).toBe("fail");
    expect(thrownResult?.summary).toBe("Post Process Step post-process failed");
    expect(thrownResult?.messages?.[0]?.text).toContain("post boom");
  });
});

describe("summary and output helpers", () => {
  test("filters ANSI-decorated lines by regex", () => {
    const output = [
      "keep this line",
      "\u001b[31mremove this line\u001b[0m",
      "KEEP this line too",
    ].join("\n");

    expect(
      applyOutputFilter(
        { pattern: "remove", type: "stripLines" },
        output,
      ),
    ).toBe(["keep this line", "KEEP this line too"].join("\n"));
  });

  test("compacts oversized DOM assertion output", () => {
    const compacted = compactDomAssertionNoise(
      [
        "Received: HTMLElement {",
        "  <div>",
        "    <span />",
        "  </div>",
        "}",
        "  at renderer",
      ].join("\n"),
    );

    expect(compacted).toBe(
      [
        "Received: HTMLElement { /* DOM tree omitted */ }",
        "  ... omitted 4 DOM detail line(s) ...",
        "  at renderer",
      ].join("\n"),
    );
  });

  test("builds simple summaries for pass, failure, and timeout cases", () => {
    const step = makePostProcessStep({
      failMsg: "step failed",
      passMsg: "step passed",
    });

    expect(buildSummary(step, makeCommandResult({ exitCode: 0 }))).toBe(
      "step passed",
    );
    expect(
      buildSummary(
        step,
        makeCommandResult({
          exitCode: 1,
          output: "$ command\nfirst useful problem\nsecond problem",
        }),
      ),
    ).toBe("step failed: first useful problem");
    expect(
      buildSummary(
        step,
        makeCommandResult({
          exitCode: 124,
          output: "some log\ncustom timeout detail",
          timedOut: true,
        }),
      ),
    ).toBe("step failed: custom timeout detail");
  });

  test("builds pattern summaries for count, literal, match, and table rows", () => {
    const countStep = makePostProcessStep({
      summary: {
        default: "no issues",
        patterns: [
          { format: "found {count} issue(s) in {artifact}", regex: "issue", type: "count" },
        ],
        type: "pattern",
      },
      tokens: { artifact: "report.txt" },
    });
    const literalStep = makePostProcessStep({
      summary: {
        default: "ok",
        patterns: [
          { format: "literal match", regex: "all done", type: "literal" },
        ],
        type: "pattern",
      },
    });
    const matchStep = makePostProcessStep({
      summary: {
        default: "ok",
        patterns: [
          { format: "captured {1}", regex: "failed: (\\d+)", type: "match" },
        ],
        type: "pattern",
      },
    });
    const tableStep = makePostProcessStep({
      summary: {
        default: "ok",
        patterns: [
          { format: "coverage {6}", regex: "All files", type: "table-row" },
        ],
        type: "pattern",
      },
    });

    expect(
      buildSummary(
        countStep,
        makeCommandResult({ exitCode: 1, output: "issue\nother\nissue" }),
      ),
    ).toBe("found 2 issue(s) in report.txt");
    expect(
      buildSummary(
        literalStep,
        makeCommandResult({ exitCode: 1, output: "All done" }),
      ),
    ).toBe("literal match");
    expect(
      buildSummary(
        matchStep,
        makeCommandResult({ exitCode: 1, output: "Failed: 3" }),
      ),
    ).toBe("captured 3");
    expect(
      buildSummary(
        tableStep,
        makeCommandResult({
          exitCode: 1,
          output: "All files │ 80 │ 81 │ 82 │ 83 │ 84 │ 85",
        }),
      ),
    ).toBe("coverage 85");
  });
});

describe("step execution helpers", () => {
  test("returns a timed out command when the deadline has already passed", async () => {
    const result = await runStepWithinDeadline(
      makeDeadlineStep({ cmd: "bun" }),
      Date.now() - 1,
    );

    expect(result.exitCode).toBe(124);
    expect(result.timedOut).toBeTrue();
    expect(result.output).toContain("Deadline Step exceeded the 0ms timeout");
  });

  test("resolves tokens, creates ensured directories, and runs direct steps", async () => {
    const tempDir = createTempDir();
    const outputDir = join(tempDir, "nested");
    const outputFile = join(outputDir, "result.txt");
    const step = makeDeadlineStep({
      args: [
        "-e",
        [
          "import { writeFileSync } from 'node:fs';",
          "const file = process.argv.at(-1);",
          "if (!file) throw new Error('missing file');",
          "writeFileSync(file, 'written from runner');",
          "console.log(file);",
        ].join("\n"),
        "{targetFile}",
      ],
      cmd: "bun",
      ensureDirs: ["{targetDir}"],
      timeoutDrainMs: "{drainMs}",
      tokens: {
        drainMs: 25,
        targetDir: outputDir,
        targetFile: outputFile,
      },
    });

    const result = await runStepWithinDeadline(step, Date.now() + 2_000);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain(outputFile);
    expect(readFileSync(outputFile, "utf8")).toBe("written from runner");
  });

  test("runs serial groups in order while allowing unrelated steps to run too", async () => {
    const tempDir = createTempDir();
    const traceFile = join(tempDir, "trace.txt");
    writeFileSync(traceFile, "");

    const appendScript = [
      "import { readFileSync, writeFileSync } from 'node:fs';",
      "const [file, value, delayText] = process.argv.slice(-3);",
      "if (delayText) await Bun.sleep(Number(delayText));",
      "let current = '';",
      "try { current = readFileSync(file, 'utf8'); } catch {}",
      "writeFileSync(file, current + value);",
    ].join("\n");

    const results = await runStepBatch(
      [
        makeDeadlineStep({
          args: ["-e", appendScript, traceFile, "A", "30"],
          cmd: "bun",
          key: "serial-a",
          label: "Serial A",
          serialGroup: "proxy",
        }),
        makeDeadlineStep({
          args: ["-e", appendScript, traceFile, "B", "0"],
          cmd: "bun",
          key: "serial-b",
          label: "Serial B",
          serialGroup: "proxy",
        }),
        makeDeadlineStep({
          args: ["-e", appendScript, traceFile, "X", "0"],
          cmd: "bun",
          key: "parallel-x",
          label: "Parallel X",
        }),
      ],
      Date.now() + 2_000,
    );

    const trace = readFileSync(traceFile, "utf8");

    expect(Object.keys(results).sort()).toEqual([
      "parallel-x",
      "serial-a",
      "serial-b",
    ]);
    expect(trace).toContain("X");
    expect(trace.indexOf("A")).toBeGreaterThanOrEqual(0);
    expect(trace.indexOf("B")).toBeGreaterThan(trace.indexOf("A"));
  });
});