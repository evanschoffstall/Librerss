import { parseJsonBody } from "@/lib/api/request";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { getUserFromRequest } from "@/lib/auth/session";
import { CONFIG } from "@/lib/config";
import { isAllowedFeedUrl } from "@/lib/core/feedFetcher";
import { logger } from "@/lib/utils/logger";
import { rateLimiter } from "@/lib/utils/rate-limit";
import { sanitizeArticleHtml } from "@/lib/utils/sanitize";
import { extract } from "@extractus/article-extractor";
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

    const extracted = await extract(
      articleUrl,
      { contentLengthThreshold: 120 },
      {
        headers: {
          "user-agent": "librerss/0.1 (+https://github.com)",
          "accept-language": "en-US,en;q=0.9",
        },
      },
    );

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
