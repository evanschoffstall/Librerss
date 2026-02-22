import { requireSameOrigin } from "@/lib/auth/csrf";
import { getUserFromRequest } from "@/lib/auth/session";
import { isAllowedFeedUrl } from "@/lib/core/feedFetcher";
import { logger } from "@/lib/utils/logger";
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
    const csrfError = requireSameOrigin(request);
    if (csrfError) {
      return csrfError;
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let payload: { url?: string };
    try {
      payload = (await request.json()) as { url?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const articleUrl = payload?.url?.trim() ?? "";

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
    return NextResponse.json(
      { error: "Unable to extract article" },
      { status: 500 },
    );
  }
}
