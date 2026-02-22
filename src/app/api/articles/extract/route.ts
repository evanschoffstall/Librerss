import { requireSameOrigin } from "@/lib/auth/csrf";
import { getUserFromRequest } from "@/lib/auth/session";
import { logger } from "@/lib/utils/logger";
import {
  isBlockedHost,
  isBlockedResolvedAddress,
  normalizeHostname,
} from "@/lib/utils/ssrf";
import { extract } from "@extractus/article-extractor";
import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import sanitizeHtml from "sanitize-html";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function isAllowedPublicHttpUrl(raw: string): Promise<boolean> {
  try {
    const parsed = new URL(raw);
    const supportedProtocol =
      parsed.protocol === "http:" || parsed.protocol === "https:";

    if (!supportedProtocol || parsed.username || parsed.password) {
      return false;
    }

    const normalizedHostname = normalizeHostname(parsed.hostname);

    if (isBlockedHost(normalizedHostname)) {
      return false;
    }

    if (isIP(normalizedHostname)) {
      return !isBlockedResolvedAddress(normalizedHostname);
    }

    const records = await lookup(normalizedHostname, {
      all: true,
      verbatim: true,
    });
    return !records.some((record) => isBlockedResolvedAddress(record.address));
  } catch {
    return false;
  }
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

  return sanitizeHtml(htmlCandidate, {
    allowedTags: [
      "p",
      "br",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "strong",
      "em",
      "b",
      "i",
      "u",
      "a",
      "hr",
      "figure",
      "figcaption",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      code: ["class"],
      pre: ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName: string, attribs: Record<string, string>) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
    },
  }).trim();
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

    const payload = (await request.json()) as { url?: string };
    const articleUrl = payload?.url?.trim() ?? "";

    if (!articleUrl) {
      return NextResponse.json(
        { error: "Article URL is required" },
        { status: 400 },
      );
    }

    if (!(await isAllowedPublicHttpUrl(articleUrl))) {
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
