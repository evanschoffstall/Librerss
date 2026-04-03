import { constants as fsConstants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { PlaceholderSourceDefinition } from "@/lib/core/placeholder-sources";

import { PLACEHOLDER_SOURCE_DEFINITIONS } from "@/lib/core/placeholder-sources";
import { fetchHtmlWithHttpCloak } from "@/lib/fetch";

const PLACEHOLDER_ROOT = join(process.cwd(), "public", "placeholder-articles");
const FORCE_FLAG = "--force";

interface SnapshotFetchCliOptions {
  force: boolean;
  requestedBasePaths: string[];
}

/** Keeps HTTPCloak redirects constrained to the exact hostnames declared in the placeholder manifest. */
function createAllowedUrlPredicate(source: PlaceholderSourceDefinition) {
  const allowedHosts = new Set(
    source.seeds.map((seed) => new URL(seed.url).hostname.toLowerCase()),
  );

  return async (candidateUrl: string): Promise<boolean> => {
    try {
      const parsedUrl = new URL(candidateUrl);
      return (
        parsedUrl.protocol === "https:" &&
        allowedHosts.has(parsedUrl.hostname.toLowerCase())
      );
    } catch {
      return false;
    }
  };
}

/** Returns whether a snapshot file already exists on disk. */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Fetches missing bundled placeholder snapshots through the shared HTTPCloak transport. */
async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const selectedSources = selectPlaceholderSources(options.requestedBasePaths);
  let fetchedCount = 0;
  let skippedCount = 0;

  for (const source of selectedSources) {
    const isAllowedUrl = createAllowedUrlPredicate(source);

    for (const seed of source.seeds) {
      const outputPath = join(PLACEHOLDER_ROOT, source.basePath, `${seed.slug}.html`);

      if (!options.force && (await fileExists(outputPath))) {
        skippedCount += 1;
        console.log(`skip ${source.basePath}/${seed.slug}.html`);
        continue;
      }

      const { html } = await fetchHtmlWithHttpCloak(seed.url, isAllowedUrl);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, html, "utf8");
      fetchedCount += 1;
      console.log(`saved ${source.basePath}/${seed.slug}.html`);
    }
  }

  console.log(
    `Completed placeholder snapshot fetch: fetched=${String(fetchedCount)} skipped=${String(skippedCount)}`,
  );
}

/** Parses the narrow CLI surface for selecting source groups and forcing refreshes. */
function parseCliOptions(argv: readonly string[]): SnapshotFetchCliOptions {
  const requestedBasePaths: string[] = [];
  let force = false;

  for (const argument of argv) {
    if (argument === FORCE_FLAG) {
      force = true;
      continue;
    }

    if (argument.startsWith("--")) {
      throw new Error(`Unknown flag: ${argument}`);
    }

    const trimmedArgument = argument.trim();
    if (trimmedArgument === "") {
      throw new Error("Source names must not be empty.");
    }

    requestedBasePaths.push(trimmedArgument);
  }

  return { force, requestedBasePaths };
}

/** Resolves the requested placeholder source groups and rejects unknown names eagerly. */
function selectPlaceholderSources(
  requestedBasePaths: readonly string[],
): PlaceholderSourceDefinition[] {
  if (requestedBasePaths.length === 0) {
    return PLACEHOLDER_SOURCE_DEFINITIONS;
  }

  const requestedBasePathSet = new Set(requestedBasePaths);
  const selectedSources = PLACEHOLDER_SOURCE_DEFINITIONS.filter((source) =>
    requestedBasePathSet.has(source.basePath),
  );

  if (selectedSources.length !== requestedBasePathSet.size) {
    const knownBasePaths = new Set(
      PLACEHOLDER_SOURCE_DEFINITIONS.map((source) => source.basePath),
    );
    const unknownBasePaths = [...requestedBasePathSet].filter(
      (basePath) => !knownBasePaths.has(basePath),
    );
    throw new Error(`Unknown placeholder source name(s): ${unknownBasePaths.join(", ")}`);
  }

  return selectedSources;
}

await main();