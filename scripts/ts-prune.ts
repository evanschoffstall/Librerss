import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type TsPruneConfig = {
  project: string;
  skip?: string;
  ignore?: string;
};

function parseConfigPath(argv: string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--config") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --config");
      }
      return value;
    }

    if (arg?.startsWith("--config=")) {
      const value = arg.slice("--config=".length);
      if (!value) {
        throw new Error("Missing value for --config");
      }
      return value;
    }
  }

  return ".ts-prune.json";
}

function validateConfig(raw: unknown, sourcePath: string): TsPruneConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid config at ${sourcePath}: expected an object`);
  }

  const { project, skip, ignore } = raw as Record<string, unknown>;

  if (typeof project !== "string" || !project.trim()) {
    throw new Error(
      `Invalid config at ${sourcePath}: "project" must be a non-empty string`,
    );
  }

  if (skip !== undefined && typeof skip !== "string") {
    throw new Error(
      `Invalid config at ${sourcePath}: "skip" must be a string when provided`,
    );
  }

  if (ignore !== undefined && typeof ignore !== "string") {
    throw new Error(
      `Invalid config at ${sourcePath}: "ignore" must be a string when provided`,
    );
  }

  return {
    project,
    skip,
    ignore,
  };
}

function compileRegex(pattern: string | undefined): RegExp | null {
  if (!pattern) {
    return null;
  }

  try {
    return new RegExp(pattern);
  } catch (error) {
    throw new Error(
      `Invalid regex in ts-prune config: ${pattern} (${error instanceof Error ? error.message : "unknown error"})`,
    );
  }
}

function isPotentialFinding(line: string): boolean {
  return /^\S.+:\d+\s-\s.+$/.test(line.trim());
}

const configArgPath = parseConfigPath(Bun.argv.slice(2));
const configPath = resolve(process.cwd(), configArgPath);

if (!existsSync(configPath)) {
  console.error(`ts-prune config file not found: ${configPath}`);
  process.exit(1);
}

const config = validateConfig(
  JSON.parse(readFileSync(configPath, "utf8")) as unknown,
  configPath,
);

const ignoreRegex = compileRegex(config.ignore);
const args = ["ts-prune", "-p", config.project];

if (config.skip) {
  args.push("--skip", config.skip);
}

if (config.ignore) {
  args.push("--ignore", config.ignore);
}

const result = Bun.spawnSync(["bunx", ...args], {
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});

const stdout = result.stdout.toString();
const stderr = result.stderr.toString();
const mergedLines = `${stdout}\n${stderr}`
  .split(/\r?\n/)
  .map((line) => line.trimEnd())
  .filter((line) => line.trim().length > 0);

const actionableFindings = mergedLines.filter((line) => {
  if (!isPotentialFinding(line)) {
    return false;
  }

  if (ignoreRegex && ignoreRegex.test(line)) {
    return false;
  }

  return true;
});

if (actionableFindings.length > 0) {
  for (const line of actionableFindings) {
    console.log(line);
  }
  console.error(
    `ts-prune found ${actionableFindings.length} actionable unused export(s)`,
  );
  process.exit(1);
}

if (result.exitCode !== 0) {
  if (stdout.trim().length > 0) {
    process.stdout.write(stdout.endsWith("\n") ? stdout : `${stdout}\n`);
  }
  if (stderr.trim().length > 0) {
    process.stderr.write(stderr.endsWith("\n") ? stderr : `${stderr}\n`);
  }
  process.exit(result.exitCode);
}
