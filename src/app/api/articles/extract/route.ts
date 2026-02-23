import { parseJsonBodyOrResponse } from "@/lib/api/request";
import { jsonError } from "@/lib/api/responses";
import {
  logAndRespondError,
  requireMutableAuthenticatedUser,
} from "@/lib/api/route-helpers";
import { CONFIG } from "@/lib/config";
import {
  isAllowedFeedUrl,
  PUBLIC_FEED_URL_ERROR,
} from "@/lib/core/feed-fetcher";
import { toErrorMessage } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { sanitizeArticleHtml } from "@/lib/utils/sanitize";
import { extractFromHtml } from "@extractus/article-extractor";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function parseAndValidateArticleUrl(
  request: NextRequest,
): Promise<string | Response> {
  const payloadOrResponse = await parseJsonBodyOrResponse<{ url?: string }>(
    request,
  );
  if (payloadOrResponse instanceof Response) {
    return payloadOrResponse;
  }

  const articleUrl = payloadOrResponse.url?.trim() ?? "";
  if (!articleUrl) {
    return jsonError("Article URL is required", 400);
  }

  if (!(await isAllowedFeedUrl(articleUrl))) {
    return jsonError(PUBLIC_FEED_URL_ERROR, 400);
  }

  return articleUrl;
}

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

async function fetchHtml(url: string): Promise<string> {
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
  let articleUrl: string | null = null;

  try {
    const authResult = await requireMutableAuthenticatedUser(request, {
      rateLimit: {
        key: "article-extract",
        windowMs: CONFIG.RATE_LIMIT_EXTRACT_WINDOW_MS,
        maxAttempts: CONFIG.RATE_LIMIT_EXTRACT_MAX_REQUESTS,
      },
    });
    if (authResult instanceof Response) {
      return authResult;
    }

    const parsedUrl = await parseAndValidateArticleUrl(request);
    if (parsedUrl instanceof Response) {
      return parsedUrl;
    }
    articleUrl = parsedUrl;

    const html = await fetchHtml(articleUrl);
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
    if (axios.isAxiosError(error)) {
      const upstreamStatus = error.response?.status;
      const detail = toErrorMessage(error);
      const status =
        typeof upstreamStatus === "number" && upstreamStatus >= 400
          ? upstreamStatus
          : 502;

      logger.warn(
        `Returning ${status} ${status === 502 ? "Bad Gateway" : "Upstream Error"} — article extract upstream request failed${articleUrl ? ` for ${articleUrl}` : ""}: ${detail}`,
      );

      return jsonError(detail, status);
    }

    const detail = toErrorMessage(error);
    logger.warn(
      `Returning 502 Bad Gateway — article extract upstream processing failed${articleUrl ? ` for ${articleUrl}` : ""}: ${detail}`,
    );

    return logAndRespondError("Article extract error", error, {
      status: 502,
      publicMessage: detail,
    });
  }
}
