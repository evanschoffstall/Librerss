import { parseJsonBody } from "@/lib/api/request";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { getUserFromRequest } from "@/lib/auth/session";
import { CONFIG } from "@/lib/config";
import { isAllowedFeedUrl } from "@/lib/core/feedFetcher";
import { logger } from "@/lib/utils/logger";
import { rateLimiter } from "@/lib/utils/rate-limit";
import { sanitizeArticleHtml } from "@/lib/utils/sanitize";
import { extractFromHtml } from "@extractus/article-extractor";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toParagraphHtml(raw: string): string {
  return raw
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => `<p>${segment.replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

function sanitizeExtractedContent(rawContent: string): string {
  const normalized = rawContent.trim();
  if (!normalized) {
    return "";
  }

  const containsHtml = /<\/?[a-z][\s\S]*>/i.test(normalized);
  const htmlCandidate = containsHtml ? normalized : toParagraphHtml(normalized);

  return sanitizeArticleHtml(htmlCandidate);
}

async function fetchHtmlWithValidatedRedirects(url: string): Promise<string> {
  let currentUrl = url;

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (!(await isAllowedFeedUrl(currentUrl))) {
      throw new Error("Blocked URL");
    }

    const response = await axios.get(currentUrl, {
      timeout: CONFIG.FEED_REQUEST_TIMEOUT_MS,
      maxContentLength: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
      maxRedirects: 0,
      responseType: "text",
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        "user-agent": "librerss/0.1 (+https://github.com)",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (typeof location !== "string" || !location.trim()) {
        throw new Error("Redirect without Location header");
      }

      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return typeof response.data === "string"
      ? response.data
      : String(response.data ?? "");
  }

  throw new Error("Too many redirects");
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting — this endpoint makes outbound HTTP requests per call.
    const rateLimitError = rateLimiter.check(request, "article-extract", {
      windowMs: CONFIG.RATE_LIMIT_EXTRACT_WINDOW_MS,
      maxAttempts: CONFIG.RATE_LIMIT_EXTRACT_MAX_REQUESTS,
    });
    if (rateLimitError) {
      return rateLimitError;
    }

    const csrfError = requireSameOrigin(request);
    if (csrfError) {
      return csrfError;
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedBody = await parseJsonBody<{ url?: string }>(request);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const articleUrl = parsedBody.data?.url?.trim() ?? "";

    if (!articleUrl) {
      return NextResponse.json(
        { error: "Article URL is required" },
        { status: 400 },
      );
    }

    if (!(await isAllowedFeedUrl(articleUrl))) {
      return NextResponse.json(
        {
          error:
            "Article URL must use http or https and resolve to a public host",
        },
        { status: 400 },
      );
    }

    const html = await fetchHtmlWithValidatedRedirects(articleUrl);
    const extracted = await extractFromHtml(html, articleUrl, {
      contentLengthThreshold: 120,
    });

    const rawContent =
      extracted?.content?.trim() || extracted?.description?.trim() || "";
    const content = sanitizeExtractedContent(rawContent);

    return NextResponse.json({
      content,
      title: extracted?.title ?? null,
      source: extracted?.source ?? null,
    });
  } catch (error) {
    logger.error("Article extract error", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    // 502 Bad Gateway — the failure is in the upstream site, not this server.
    return NextResponse.json(
      { error: "Unable to extract article" },
      { status: 502 },
    );
  }
}
