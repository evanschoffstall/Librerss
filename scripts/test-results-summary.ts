import { existsSync, readFileSync } from "node:fs";

type TestResult = {
  file?: string;
  line?: string;
  suite?: string;
  name: string;
  message?: string;
};

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

const colorize = (text: string, ...codes: string[]) =>
  `${codes.join("")}${text}${ANSI.reset}`;

const divider = () => colorize("────────────────────────────────", ANSI.gray);

const reportPath = process.argv[2] ?? "coverage/test-results.xml";

if (!existsSync(reportPath)) {
  console.error(
    colorize(
      `❌ [test-summary] Report file not found: ${reportPath}`,
      ANSI.red,
      ANSI.bold,
    ),
  );
  process.exit(1);
}

const xml = readFileSync(reportPath, "utf8");

const attrRegex = /(\w+)="([^"]*)"/g;

const skipped: TestResult[] = [];
const failed: TestResult[] = [];
const passed: TestResult[] = [];

const parseAttrs = (raw: string) => {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(attrRegex)) {
    const key = match[1];
    const value = match[2];
    if (key) {
      attrs[key] = value;
    }
  }

  return attrs;
};

type ParsedTestcase = {
  rawAttrs: string;
  body: string;
};

function parseTestcases(junitXml: string): ParsedTestcase[] {
  const testcases: ParsedTestcase[] = [];
  const openTagRegex = /<testcase\b([^>]*?)(\/)?>/g;

  for (const match of junitXml.matchAll(openTagRegex)) {
    const fullTag = match[0];
    const rawAttrs = match[1] ?? "";
    const startIndex = match.index ?? -1;

    if (startIndex < 0) {
      continue;
    }

    const openTagEndIndex = startIndex + fullTag.length;
    const isSelfClosing = /\/>$/.test(fullTag);

    if (isSelfClosing) {
      testcases.push({ rawAttrs, body: "" });
      continue;
    }

    const closeTag = "</testcase>";
    const closeTagIndex = junitXml.indexOf(closeTag, openTagEndIndex);
    if (closeTagIndex < 0) {
      continue;
    }

    const body = junitXml.slice(openTagEndIndex, closeTagIndex);
    testcases.push({ rawAttrs, body });
  }

  return testcases;
}

for (const { rawAttrs, body } of parseTestcases(xml)) {
  const attrs = parseAttrs(rawAttrs);

  const test: TestResult = {
    file: attrs.file,
    line: attrs.line,
    suite: attrs.classname,
    name: attrs.name ?? "(unnamed test)",
  };

  const isSkipped = /<skipped\b/.test(body);
  const isFailed = body.includes("<failure") || body.includes("<error");

  if (isSkipped) {
    skipped.push(test);
  }

  if (isFailed) {
    const failureTag = body.match(/<(?:failure|error)\b([^>]*)>/)?.[1] ?? "";
    const failureAttrs = parseAttrs(failureTag);
    failed.push({
      ...test,
      message: failureAttrs.message,
    });
  }

  if (!isSkipped && !isFailed) {
    passed.push(test);
  }
}

const formatLocation = (result: TestResult) => {
  const file = result.file ?? "unknown-file";
  const line = result.line ? `:${result.line}` : "";
  const suite = result.suite ? `${result.suite} > ` : "";
  return `${file}${line} - ${suite}${result.name}`;
};

const formatStatus = (
  label: string,
  count: number,
  color: string,
  emptyLabel: string,
) => {
  const status = count > 0 ? "FAIL" : "PASS";
  return `${colorize(status, ANSI.bold, count > 0 ? color : ANSI.green)} ${colorize(label, ANSI.bold)} (${count})${count === 0 ? ` ${colorize(`· ${emptyLabel}`, ANSI.gray)}` : ""}`;
};

console.log(`\n${colorize("Test Outcomes", ANSI.bold, ANSI.cyan)}`);
console.log(divider());

console.log(
  `${colorize("PASS", ANSI.bold, ANSI.green)} ${colorize("Passed", ANSI.bold)} (${passed.length})`,
);
console.log(formatStatus("Failed", failed.length, ANSI.red, "none"));
if (failed.length === 0) {
} else {
  for (const result of failed) {
    const message = result.message ? ` [${result.message}]` : "";
    console.log(
      `  ${colorize("•", ANSI.red)} ${colorize(formatLocation(result), ANSI.red)}${message}`,
    );
  }
}

console.log(formatStatus("Skipped", skipped.length, ANSI.yellow, "none"));
if (skipped.length === 0) {
} else {
  for (const result of skipped) {
    console.log(
      `  ${colorize("•", ANSI.yellow)} ${colorize(formatLocation(result), ANSI.yellow)}`,
    );
  }
}

console.log(divider());
