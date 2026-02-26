import { availableParallelism, cpus } from "node:os";

function getAdaptiveConcurrency(fileCount: number): number {
  if (fileCount < 1200) {
    return 1;
  }

  const cores =
    typeof availableParallelism === "function"
      ? availableParallelism()
      : cpus().length;

  if (cores <= 4) {
    return Math.max(2, cores);
  }

  if (cores <= 8) {
    return cores - 1;
  }

  return Math.min(8, Math.max(4, Math.ceil(cores / 2)));
}

async function estimateLintableFileCount(): Promise<number> {
  const glob = new Bun.Glob("**/*.{js,mjs,cjs,ts,jsx,tsx}");
  let count = 0;

  for await (const filePath of glob.scan({
    cwd: process.cwd(),
    absolute: false,
  })) {
    if (
      filePath.includes("node_modules/") ||
      filePath.includes("/.next/") ||
      filePath.startsWith(".next/") ||
      filePath.includes("/dist/") ||
      filePath.startsWith("dist/") ||
      filePath.includes("/build/") ||
      filePath.startsWith("build/") ||
      filePath.includes("/coverage/") ||
      filePath.startsWith("coverage/") ||
      filePath.includes("/.cache/") ||
      filePath.startsWith(".cache/")
    ) {
      continue;
    }

    count += 1;
    if (count >= 5000) {
      return count;
    }
  }

  return count;
}

const envConcurrency = process.env.ESLINT_CONCURRENCY;
const lintableFileCount = await estimateLintableFileCount();
const resolvedConcurrency =
  envConcurrency && /^\d+$/.test(envConcurrency)
    ? Number.parseInt(envConcurrency, 10)
    : getAdaptiveConcurrency(lintableFileCount);

const extraArgs = Bun.argv.slice(2);

const result = Bun.spawnSync(
  [
    "bunx",
    "eslint",
    ".",
    "--cache",
    "--cache-strategy",
    "content",
    "--cache-location",
    ".cache/eslint",
    "--concurrency",
    String(resolvedConcurrency),
    ...extraArgs,
  ],
  {
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  },
);

process.exit(result.exitCode);
