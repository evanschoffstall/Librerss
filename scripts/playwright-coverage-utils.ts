import { fileURLToPath } from "node:url";

const PROJECT_SOURCE_DIRECTORY_PATH = `${process.cwd().replaceAll("\\", "/")}/src/`;

function normalizeDistFilePath(distFilePath?: string): string {
  return distFilePath?.replaceAll("\\", "/") ?? "";
}

const SOURCE_MAP_COMMENT_PATTERNS = [
  /\/\/[#@]\s*sourceMappingURL=([^\s]+)\s*$/u,
  /\/\*[#@]\s*sourceMappingURL=([^*]+?)\s*\*\//u,
] as const;

export function extractSourceMapSpecifier(source: string): null | string {
  for (const pattern of SOURCE_MAP_COMMENT_PATTERNS) {
    const match = pattern.exec(source);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

export function isProjectSourcePath(sourcePath: string): boolean {
  return normalizeCoveragePath(sourcePath).startsWith("src/");
}

export function normalizeCoveragePath(
  sourcePath: string,
  distFilePath?: string,
): string {
  let normalizedSourcePath = sourcePath.replaceAll("\\", "/");
  const normalizedDistFilePath = normalizeDistFilePath(distFilePath);

  if (normalizedSourcePath.startsWith("file:")) {
    try {
      normalizedSourcePath = fileURLToPath(normalizedSourcePath).replaceAll(
        "\\",
        "/",
      );
    } catch {
      return normalizedSourcePath;
    }
  }

  if (normalizedSourcePath.startsWith(PROJECT_SOURCE_DIRECTORY_PATH)) {
    return normalizedSourcePath.slice(process.cwd().replaceAll("\\", "/").length + 1);
  }

  if (normalizedSourcePath.startsWith("src/")) {
    if (normalizedDistFilePath.includes("/node_modules/")) {
      return `${normalizedDistFilePath}::${normalizedSourcePath}`;
    }

    return normalizedSourcePath;
  }

  const srcDirectoryIndex = normalizedSourcePath.lastIndexOf("/src/");
  if (srcDirectoryIndex >= 0 && !normalizedSourcePath.startsWith("/")) {
    return normalizedSourcePath.slice(srcDirectoryIndex + 1);
  }

  return normalizedSourcePath;
}

export function resolveCoverageUrl(
  sourceMapSpecifier: string,
  scriptUrl: string,
): null | string {
  try {
    return new URL(sourceMapSpecifier, scriptUrl).toString();
  } catch {
    return null;
  }
}