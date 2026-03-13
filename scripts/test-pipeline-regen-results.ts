import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";

import { POST } from "@/app/api/articles/extract/route";
import type { AuthenticatedUser } from "@/lib/server";

const ANONYMOUS_USER: AuthenticatedUser = {
  email: "anonymous",
  expiresAt: new Date(Date.now() + 86_400_000),
  sessionId: -1,
  userId: -1,
};

function extractCanonicalUrlFromHtml(
  html: string,
  fixtureName: string,
): string {
  const canonicalMatch = html.match(
    /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i,
  );
  if (canonicalMatch?.[1]) return canonicalMatch[1];

  const ogUrlMatch = html.match(
    /<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i,
  );
  if (ogUrlMatch?.[1]) return ogUrlMatch[1];

  return `https://example.invalid/${fixtureName}`;
}

async function extractViaApiRoute(
  articleUrl: string,
  downloadedHtml: string,
): Promise<string> {
  const request = new NextRequest("http://localhost/api/articles/extract", {
    body: JSON.stringify({ url: articleUrl }),
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    method: "POST",
  });

  const response = await POST(request, {
    errorFn: () => {},
    fetchHtmlFn: async () => downloadedHtml,
    infoFn: () => {},
    parseAndValidateArticleUrlFn: async (incomingRequest) => {
      const payload = (await incomingRequest.json()) as { url?: string };
      return payload.url?.trim() ?? "";
    },
    requireMutableAuthenticatedUserFn: async () => ANONYMOUS_USER,
    shouldUseExtractCacheFn: () => false,
    warnFn: () => {},
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as null | {
      error?: string;
    };
    throw new Error(
      `extract endpoint failed (${response.status}): ${body?.error ?? "unknown error"}`,
    );
  }

  const payload = (await response.json()) as { content?: string };
  return payload.content?.trim() ?? "";
}

async function main() {
  const dir = join(
    process.cwd(),
    "tests/templates/extract-sanitize-hydrate-pipeline",
  );

  const articleFiles = readdirSync(dir)
    .filter((name) => /^article-\d+\.html$/.test(name))
    .map((name) => name.replace(/\.html$/, ""))
    .sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]));

  for (const articleName of articleFiles) {
    const result = await regenerateExpectation(dir, articleName);
    console.log(
      `regenerated ${result.articleName} -> ${result.outputPath} (${result.size} chars)`,
    );
  }
}

async function regenerateExpectation(dir: string, articleName: string) {
  const inputPath = join(dir, `${articleName}.html`);
  const outputPath = resolveExpectedPath(dir, articleName);

  const downloadedHtml = readFileSync(inputPath, "utf8");
  const url = extractCanonicalUrlFromHtml(downloadedHtml, articleName);
  const cleaned = await extractViaApiRoute(url, downloadedHtml);

  if (!cleaned) {
    throw new Error(`${articleName} produced empty expectation output`);
  }

  writeFileSync(outputPath, `${cleaned}\n`, "utf8");
  return { articleName, outputPath, size: cleaned.length };
}

function resolveExpectedPath(dir: string, articleName: string): string {
  const articleNumber = articleName.split("-")[1];
  return join(dir, `article-results-${articleNumber}.html`);
}

void main();
