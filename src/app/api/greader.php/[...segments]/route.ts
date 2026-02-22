import { parsePositiveInt } from "@/lib/api/request";
import {
  createSession,
  getUserFromRequest,
  getUserFromSessionToken,
  verifyPassword,
  type SessionUser,
} from "@/lib/auth/session";
import { PLACEHOLDER_ADMIN_USER, RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import {
  articles,
  articleStatuses,
  feedCategories,
  feeds,
  feedSources,
  users,
} from "@/lib/db/schema";
import { isValidUrl, tryNormalizeFeedUrl } from "@/lib/utils/url";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GOOGLE_LOGIN_PREFIX = "googlelogin auth=";
const MAX_STREAM_ITEMS = 250;
const DEFAULT_STREAM_ITEMS = 50;
const ITEM_ID_PREFIX = "tag:google.com,2005:reader/item/";
let articleStatusesTableAvailable = false;
let warnedMissingArticleStatusesTable = false;

type RouteContext = {
  params: Promise<{
    segments: string[];
  }>;
};

type ClientLoginPayload = {
  email: string;
  password: string;
};

function isMissingArticleStatusesTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: string;
    message?: string;
    cause?: unknown;
  };

  const hasMissingRelationCode = candidate.code === "42P01";
  const mentionsArticleStatuses =
    typeof candidate.message === "string" &&
    candidate.message.toLowerCase().includes("articlestatus");

  if (hasMissingRelationCode && mentionsArticleStatuses) {
    return true;
  }

  return isMissingArticleStatusesTableError(candidate.cause);
}

function warnMissingArticleStatusesTable(): void {
  if (warnedMissingArticleStatusesTable) {
    return;
  }

  warnedMissingArticleStatusesTable = true;
  console.warn(
    "[greader] ArticleStatus table is missing; read/starred state will be treated as unavailable until database schema is provisioned.",
  );
}

async function canUseArticleStatusesTable(): Promise<boolean> {
  if (articleStatusesTableAvailable) {
    return true;
  }

  try {
    const db = getDb();
    await db.select({ id: articleStatuses.id }).from(articleStatuses).limit(1);
    articleStatusesTableAvailable = true;
    return true;
  } catch (error) {
    if (isMissingArticleStatusesTableError(error)) {
      warnMissingArticleStatusesTable();
      return false;
    }

    throw error;
  }
}

function textResponse(body: string, status = 200): Response {
  return new NextResponse(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function parseClientLoginParams(
  searchParams: URLSearchParams,
): ClientLoginPayload | null {
  const email =
    searchParams.get("Email") ??
    searchParams.get("email") ??
    searchParams.get("username");
  const password =
    searchParams.get("Passwd") ??
    searchParams.get("password") ??
    searchParams.get("passwd");

  if (!email || !password) {
    return null;
  }

  return {
    email: email.trim().toLowerCase(),
    password,
  };
}

async function parseClientLoginPayload(
  request: NextRequest,
): Promise<ClientLoginPayload | null> {
  const urlPayload = parseClientLoginParams(new URL(request.url).searchParams);
  if (urlPayload) {
    return urlPayload;
  }

  if (request.method !== "POST") {
    return null;
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    const email = String(
      form.get("Email") ?? form.get("email") ?? form.get("username") ?? "",
    )
      .trim()
      .toLowerCase();
    const password = String(
      form.get("Passwd") ?? form.get("password") ?? form.get("passwd") ?? "",
    );

    if (!email || !password) {
      return null;
    }

    return { email, password };
  }

  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return null;
  }

  const parsed = parseClientLoginParams(new URLSearchParams(rawBody));
  if (parsed) {
    return parsed;
  }

  try {
    const json = JSON.parse(rawBody) as Record<string, unknown>;
    const email =
      typeof json.Email === "string"
        ? json.Email
        : typeof json.email === "string"
          ? json.email
          : "";
    const password =
      typeof json.Passwd === "string"
        ? json.Passwd
        : typeof json.password === "string"
          ? json.password
          : "";

    if (!email || !password) {
      return null;
    }

    return { email: email.trim().toLowerCase(), password };
  } catch {
    return null;
  }
}

async function handleClientLogin(request: NextRequest): Promise<Response> {
  const payload = await parseClientLoginPayload(request);

  if (!payload) {
    return textResponse("Error=BadAuthentication\n", 400);
  }

  if (RUNTIME_FLAGS.usePlaceholderData) {
    const isValidEmail = payload.email === PLACEHOLDER_ADMIN_USER.email;
    const isValidPassword = await verifyPassword(
      payload.password,
      PLACEHOLDER_ADMIN_USER.passwordHash,
    );

    if (
      !RUNTIME_FLAGS.allowPlaceholderAuth ||
      !isValidEmail ||
      !isValidPassword
    ) {
      return textResponse("Error=BadAuthentication\n", 403);
    }

    const token = await createSession(PLACEHOLDER_ADMIN_USER.id);

    return textResponse(`SID=${token}\nLSID=${token}\nAuth=${token}\n`);
  }

  const db = getDb();

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, payload.email))
    .limit(1);

  if (!user) {
    return textResponse("Error=BadAuthentication\n", 403);
  }

  const isValidPassword = await verifyPassword(
    payload.password,
    user.passwordHash,
  );
  if (!isValidPassword) {
    return textResponse("Error=BadAuthentication\n", 403);
  }

  const token = await createSession(user.id);
  return textResponse(`SID=${token}\nLSID=${token}\nAuth=${token}\n`);
}

function extractAuthToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization")?.trim();

  if (authorization) {
    const normalized = authorization.toLowerCase();

    if (normalized.startsWith(GOOGLE_LOGIN_PREFIX)) {
      return authorization.slice(GOOGLE_LOGIN_PREFIX.length).trim() || null;
    }

    if (normalized.startsWith("bearer ")) {
      return authorization.slice("bearer ".length).trim() || null;
    }
  }

  const searchParams = new URL(request.url).searchParams;

  return (
    searchParams.get("auth") ??
    searchParams.get("Auth") ??
    searchParams.get("T") ??
    null
  );
}

async function requireGReaderUser(
  request: NextRequest,
): Promise<SessionUser | Response> {
  const cookieUser = await getUserFromRequest(request);
  if (cookieUser) {
    return cookieUser;
  }

  const token = extractAuthToken(request);
  if (!token) {
    return textResponse("Unauthorized\n", 401);
  }

  const tokenUser = await getUserFromSessionToken(token);
  if (!tokenUser) {
    return textResponse("Unauthorized\n", 401);
  }

  return tokenUser;
}

function toStreamItemId(articleId: number): string {
  return `${ITEM_ID_PREFIX}${articleId.toString(16)}`;
}

function parseItemRefArticleId(rawId: string): number | null {
  const trimmed = rawId.trim();
  if (!trimmed) {
    return null;
  }

  const lastSegment = trimmed.includes("/")
    ? trimmed.slice(trimmed.lastIndexOf("/") + 1)
    : trimmed;

  if (/^[0-9a-f]+$/i.test(lastSegment)) {
    const hexValue = Number.parseInt(lastSegment, 16);
    if (Number.isInteger(hexValue) && hexValue > 0) {
      return hexValue;
    }
  }

  const decimalValue = Number.parseInt(lastSegment, 10);
  if (Number.isInteger(decimalValue) && decimalValue > 0) {
    return decimalValue;
  }

  return null;
}

async function parseFormOrQueryParams(
  request: NextRequest,
): Promise<URLSearchParams> {
  if (request.method === "GET") {
    return new URL(request.url).searchParams;
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    const params = new URLSearchParams();
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        params.append(key, value);
      }
    }
    return params;
  }

  const raw = await request.text();
  return new URLSearchParams(raw);
}

type ListedArticle = {
  articleId: number;
  title: string;
  link: string;
  content: string;
  publicationDate: Date;
  sourceName: string;
  sourceUrl: string;
  category: string | null;
  isRead: boolean | null;
  isStarred: boolean | null;
};

function mapArticleAsItem(row: ListedArticle) {
  const publishedSec = Math.floor(row.publicationDate.getTime() / 1000);
  const categories = ["user/-/state/com.google/reading-list"];

  if (row.category) {
    categories.push(`user/-/label/${row.category}`);
  }

  if (row.isRead) {
    categories.push("user/-/state/com.google/read");
  }

  if (row.isStarred) {
    categories.push("user/-/state/com.google/starred");
  }

  return {
    id: toStreamItemId(row.articleId),
    crawlTimeMsec: String(row.publicationDate.getTime()),
    timestampUsec: String(row.publicationDate.getTime() * 1000),
    title: row.title,
    published: publishedSec,
    updated: publishedSec,
    categories,
    canonical: [{ href: row.link }],
    alternate: [{ href: row.link, type: "text/html" }],
    summary: { direction: "ltr", content: row.content },
    origin: {
      streamId: `feed/${row.sourceUrl}`,
      title: row.sourceName,
      htmlUrl: row.sourceUrl,
    },
  };
}

async function upsertArticleStatuses(
  userId: number,
  articleIds: number[],
  changes: { isRead?: boolean; isStarred?: boolean },
): Promise<void> {
  if (articleIds.length === 0) {
    return;
  }

  if (!(await canUseArticleStatusesTable())) {
    return;
  }

  const db = getDb();

  const existingRows = await db
    .select({
      articleId: articleStatuses.articleId,
      isRead: articleStatuses.isRead,
      isStarred: articleStatuses.isStarred,
    })
    .from(articleStatuses)
    .where(
      and(
        eq(articleStatuses.userId, userId),
        inArray(articleStatuses.articleId, articleIds),
      ),
    );

  const existingByArticleId = new Map(
    existingRows.map((row) => [row.articleId, row]),
  );

  for (const articleId of articleIds) {
    const existing = existingByArticleId.get(articleId);

    await db
      .insert(articleStatuses)
      .values({
        userId,
        articleId,
        isRead: changes.isRead ?? existing?.isRead ?? false,
        isStarred: changes.isStarred ?? existing?.isStarred ?? false,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [articleStatuses.userId, articleStatuses.articleId],
        set: {
          isRead: changes.isRead ?? existing?.isRead ?? false,
          isStarred: changes.isStarred ?? existing?.isStarred ?? false,
          updatedAt: new Date(),
        },
      });
  }
}

async function handleUserInfo(user: SessionUser): Promise<Response> {
  return NextResponse.json({
    userId: String(user.userId),
    userName: user.email,
    userEmail: user.email,
    isBloggerUser: false,
    signupTimeSec: 0,
  });
}

async function handleToken(): Promise<Response> {
  return textResponse("librerss-greader-token\n");
}

async function handleTagList(user: SessionUser): Promise<Response> {
  const db = getDb();
  const labels = await db
    .select({ category: feedCategories.category })
    .from(feedCategories)
    .where(eq(feedCategories.userId, user.userId))
    .groupBy(feedCategories.category);

  return NextResponse.json({
    tags: [
      {
        id: "user/-/state/com.google/reading-list",
        sortid: "0",
      },
      {
        id: "user/-/state/com.google/read",
        sortid: "1",
      },
      {
        id: "user/-/state/com.google/starred",
        sortid: "2",
      },
      ...labels.map((label, index) => ({
        id: `user/-/label/${label.category}`,
        sortid: String(index + 10),
      })),
    ],
  });
}

async function handleSubscriptionList(user: SessionUser): Promise<Response> {
  const db = getDb();

  const rows = await db
    .select({
      sourceId: feedSources.id,
      title: feedSources.name,
      url: feedSources.url,
      feedId: feeds.id,
      category: feedCategories.category,
    })
    .from(feedSources)
    .innerJoin(feeds, eq(feeds.url, feedSources.url))
    .leftJoin(
      feedCategories,
      and(
        eq(feedCategories.userId, feedSources.userId),
        eq(feedCategories.feedId, feeds.id),
      ),
    )
    .where(eq(feedSources.userId, user.userId));

  return NextResponse.json({
    subscriptions: rows.map((row) => ({
      id: `feed/${row.url}`,
      title: row.title,
      url: row.url,
      htmlUrl: row.url,
      iconUrl: "",
      sortid: String(row.sourceId),
      categories: row.category
        ? [
            {
              id: `user/-/label/${row.category}`,
              label: row.category,
            },
          ]
        : [],
    })),
  });
}

function parseStreamPaging(searchParams: URLSearchParams): {
  limit: number;
  offset: number;
} {
  const requested = parsePositiveInt(searchParams.get("n"));
  const limit = Math.min(requested ?? DEFAULT_STREAM_ITEMS, MAX_STREAM_ITEMS);

  const continuation = searchParams.get("c");
  if (!continuation) {
    return { limit, offset: 0 };
  }

  if (continuation.startsWith("offset:")) {
    const continuationOffset = Number.parseInt(
      continuation.slice("offset:".length),
      10,
    );

    if (Number.isInteger(continuationOffset) && continuationOffset >= 0) {
      return { limit, offset: continuationOffset };
    }
  }

  const parsedRawOffset = Number.parseInt(continuation, 10);

  if (Number.isInteger(parsedRawOffset) && parsedRawOffset >= 0) {
    return { limit, offset: parsedRawOffset };
  }

  return { limit, offset: 0 };
}

function parseStreamId(resource: string): string {
  const raw = resource.slice("stream/contents/".length);
  return decodeURIComponent(raw);
}

async function handleStreamContents(
  user: SessionUser,
  request: NextRequest,
  resource: string,
): Promise<Response> {
  const streamId = parseStreamId(resource);
  const isReadingList = streamId === "user/-/state/com.google/reading-list";
  const isStarredStream = streamId === "user/-/state/com.google/starred";
  const isFeed = streamId.startsWith("feed/");

  if (!isReadingList && !isFeed && !isStarredStream) {
    return NextResponse.json({ id: streamId, items: [] });
  }

  const feedUrl = isFeed ? streamId.slice("feed/".length) : null;

  const searchParams = new URL(request.url).searchParams;
  const { limit, offset } = parseStreamPaging(searchParams);
  const olderThanSec = Number.parseInt(searchParams.get("ot") ?? "", 10);
  const sinceDate = Number.isInteger(olderThanSec)
    ? new Date(olderThanSec * 1000)
    : null;

  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();

  if (isStarredStream && !useArticleStatuses) {
    return NextResponse.json({
      id: streamId,
      direction: "ltr",
      updated: Math.floor(Date.now() / 1000),
      items: [],
    });
  }

  let rows: ListedArticle[];

  if (useArticleStatuses) {
    const conditions: Parameters<typeof and> = [];

    if (feedUrl && sinceDate) {
      conditions.push(
        and(eq(feeds.url, feedUrl), gte(articles.publicationDate, sinceDate)),
      );
    } else if (feedUrl) {
      conditions.push(eq(feeds.url, feedUrl));
    } else if (sinceDate) {
      conditions.push(gte(articles.publicationDate, sinceDate));
    }

    if (isStarredStream) {
      conditions.push(eq(articleStatuses.isStarred, true));
    }

    const query = db
      .select({
        articleId: articles.id,
        title: articles.title,
        link: articles.link,
        content: articles.content,
        publicationDate: articles.publicationDate,
        sourceName: feedSources.name,
        sourceUrl: feedSources.url,
        category: feedCategories.category,
        isRead: articleStatuses.isRead,
        isStarred: articleStatuses.isStarred,
      })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(
        feedSources,
        and(
          eq(feedSources.url, feeds.url),
          eq(feedSources.userId, user.userId),
        ),
      )
      .leftJoin(
        feedCategories,
        and(
          eq(feedCategories.userId, feedSources.userId),
          eq(feedCategories.feedId, feeds.id),
        ),
      )
      .leftJoin(
        articleStatuses,
        and(
          eq(articleStatuses.userId, user.userId),
          eq(articleStatuses.articleId, articles.id),
        ),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(articles.publicationDate))
      .limit(limit)
      .offset(offset);

    rows = await query;
  } else {
    const conditions: Parameters<typeof and> = [];

    if (feedUrl && sinceDate) {
      conditions.push(
        and(eq(feeds.url, feedUrl), gte(articles.publicationDate, sinceDate)),
      );
    } else if (feedUrl) {
      conditions.push(eq(feeds.url, feedUrl));
    } else if (sinceDate) {
      conditions.push(gte(articles.publicationDate, sinceDate));
    }

    const query = db
      .select({
        articleId: articles.id,
        title: articles.title,
        link: articles.link,
        content: articles.content,
        publicationDate: articles.publicationDate,
        sourceName: feedSources.name,
        sourceUrl: feedSources.url,
        category: feedCategories.category,
        isRead: sql<boolean>`false`,
        isStarred: sql<boolean>`false`,
      })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(
        feedSources,
        and(
          eq(feedSources.url, feeds.url),
          eq(feedSources.userId, user.userId),
        ),
      )
      .leftJoin(
        feedCategories,
        and(
          eq(feedCategories.userId, feedSources.userId),
          eq(feedCategories.feedId, feeds.id),
        ),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(articles.publicationDate))
      .limit(limit)
      .offset(offset);

    rows = await query;
  }

  const items = rows.map(mapArticleAsItem);

  const nextOffset = offset + rows.length;

  return NextResponse.json({
    id: streamId,
    direction: "ltr",
    updated: Math.floor(Date.now() / 1000),
    continuation: rows.length === limit ? `offset:${nextOffset}` : undefined,
    items,
  });
}

async function handleStreamItemIds(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const searchParams = new URL(request.url).searchParams;
  const streamId =
    searchParams.get("s") ?? "user/-/state/com.google/reading-list";

  const isFeed = streamId.startsWith("feed/");
  const feedUrl = isFeed ? streamId.slice("feed/".length) : null;
  const excludeRead = searchParams
    .getAll("xt")
    .some((value) => value === "user/-/state/com.google/read");

  const { limit, offset } = parseStreamPaging(searchParams);
  const olderThanSec = Number.parseInt(searchParams.get("ot") ?? "", 10);
  const sinceDate = Number.isInteger(olderThanSec)
    ? new Date(olderThanSec * 1000)
    : null;

  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();

  if (streamId === "user/-/state/com.google/starred" && !useArticleStatuses) {
    return NextResponse.json({ itemRefs: [], continuation: undefined });
  }

  let rows: Array<{
    articleId: number;
    isRead: boolean | null;
    isStarred: boolean | null;
  }>;

  if (useArticleStatuses) {
    const conditions: Parameters<typeof and> = [];

    if (feedUrl && sinceDate) {
      conditions.push(
        and(eq(feeds.url, feedUrl), gte(articles.publicationDate, sinceDate)),
      );
    } else if (feedUrl) {
      conditions.push(eq(feeds.url, feedUrl));
    } else if (sinceDate) {
      conditions.push(gte(articles.publicationDate, sinceDate));
    }

    if (streamId === "user/-/state/com.google/starred") {
      conditions.push(eq(articleStatuses.isStarred, true));
    }

    if (excludeRead) {
      conditions.push(sql`coalesce(${articleStatuses.isRead}, false) = false`);
    }

    const query = db
      .select({
        articleId: articles.id,
        isRead: articleStatuses.isRead,
        isStarred: articleStatuses.isStarred,
      })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(
        feedSources,
        and(
          eq(feedSources.url, feeds.url),
          eq(feedSources.userId, user.userId),
        ),
      )
      .leftJoin(
        articleStatuses,
        and(
          eq(articleStatuses.userId, user.userId),
          eq(articleStatuses.articleId, articles.id),
        ),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(articles.publicationDate))
      .limit(limit)
      .offset(offset);

    rows = await query;
  } else {
    const conditions: Parameters<typeof and> = [];

    if (feedUrl && sinceDate) {
      conditions.push(
        and(eq(feeds.url, feedUrl), gte(articles.publicationDate, sinceDate)),
      );
    } else if (feedUrl) {
      conditions.push(eq(feeds.url, feedUrl));
    } else if (sinceDate) {
      conditions.push(gte(articles.publicationDate, sinceDate));
    }

    const query = db
      .select({
        articleId: articles.id,
        isRead: sql<boolean>`false`,
        isStarred: sql<boolean>`false`,
      })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(
        feedSources,
        and(
          eq(feedSources.url, feeds.url),
          eq(feedSources.userId, user.userId),
        ),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(articles.publicationDate))
      .limit(limit)
      .offset(offset);

    rows = await query;
  }

  return NextResponse.json({
    itemRefs: rows.map((row) => ({ id: toStreamItemId(row.articleId) })),
    continuation:
      rows.length === limit ? `offset:${offset + rows.length}` : undefined,
  });
}

async function handleStreamItemContents(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
  const itemRefs = params.getAll("i");
  const articleIds = Array.from(
    new Set(
      itemRefs
        .map((value) => parseItemRefArticleId(value))
        .filter((value): value is number => value !== null),
    ),
  );

  if (articleIds.length === 0) {
    return NextResponse.json({
      id: "user/-/state/com.google/reading-list",
      updated: Math.floor(Date.now() / 1000),
      items: [],
    });
  }

  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();

  const rows = await (useArticleStatuses
    ? db
        .select({
          articleId: articles.id,
          title: articles.title,
          link: articles.link,
          content: articles.content,
          publicationDate: articles.publicationDate,
          sourceName: feedSources.name,
          sourceUrl: feedSources.url,
          category: feedCategories.category,
          isRead: articleStatuses.isRead,
          isStarred: articleStatuses.isStarred,
        })
        .from(articles)
        .innerJoin(feeds, eq(feeds.id, articles.feedId))
        .innerJoin(
          feedSources,
          and(
            eq(feedSources.url, feeds.url),
            eq(feedSources.userId, user.userId),
          ),
        )
        .leftJoin(
          feedCategories,
          and(
            eq(feedCategories.userId, feedSources.userId),
            eq(feedCategories.feedId, feeds.id),
          ),
        )
        .leftJoin(
          articleStatuses,
          and(
            eq(articleStatuses.userId, user.userId),
            eq(articleStatuses.articleId, articles.id),
          ),
        )
        .where(inArray(articles.id, articleIds))
    : db
        .select({
          articleId: articles.id,
          title: articles.title,
          link: articles.link,
          content: articles.content,
          publicationDate: articles.publicationDate,
          sourceName: feedSources.name,
          sourceUrl: feedSources.url,
          category: feedCategories.category,
          isRead: sql<boolean>`false`,
          isStarred: sql<boolean>`false`,
        })
        .from(articles)
        .innerJoin(feeds, eq(feeds.id, articles.feedId))
        .innerJoin(
          feedSources,
          and(
            eq(feedSources.url, feeds.url),
            eq(feedSources.userId, user.userId),
          ),
        )
        .leftJoin(
          feedCategories,
          and(
            eq(feedCategories.userId, feedSources.userId),
            eq(feedCategories.feedId, feeds.id),
          ),
        )
        .where(inArray(articles.id, articleIds)));

  rows.sort(
    (left, right) =>
      articleIds.indexOf(left.articleId) - articleIds.indexOf(right.articleId),
  );

  return NextResponse.json({
    id: "user/-/state/com.google/reading-list",
    updated: Math.floor(Date.now() / 1000),
    items: rows.map(mapArticleAsItem),
  });
}

async function handleSubscriptionQuickAdd(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
  const quickAdd = params.get("quickadd")?.trim() ?? "";

  const normalizedUrl = tryNormalizeFeedUrl(quickAdd);
  if (!normalizedUrl || !isValidUrl(normalizedUrl)) {
    return NextResponse.json(
      { numResults: 0, error: "Invalid feed URL" },
      { status: 400 },
    );
  }

  const db = getDb();

  const [existing] = await db
    .select({ id: feedSources.id })
    .from(feedSources)
    .where(
      and(
        eq(feedSources.userId, user.userId),
        eq(feedSources.url, normalizedUrl),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({
      numResults: 0,
      error: `Already subscribed! ${normalizedUrl}`,
      streamId: `feed/${normalizedUrl}`,
    });
  }

  const [createdFeed] = await db
    .insert(feeds)
    .values({ url: normalizedUrl })
    .onConflictDoNothing({ target: feeds.url })
    .returning({ id: feeds.id });

  const feedId = createdFeed?.id
    ? createdFeed.id
    : (
        await db
          .select({ id: feeds.id })
          .from(feeds)
          .where(eq(feeds.url, normalizedUrl))
          .limit(1)
      )[0]?.id;

  if (!feedId) {
    return NextResponse.json(
      { numResults: 0, error: "Unable to create feed" },
      { status: 500 },
    );
  }

  const fallbackName = (() => {
    try {
      return new URL(normalizedUrl).hostname || normalizedUrl;
    } catch {
      return normalizedUrl;
    }
  })();

  await db.insert(feedSources).values({
    userId: user.userId,
    url: normalizedUrl,
    name: fallbackName,
  });

  return NextResponse.json({
    numResults: 1,
    streamId: `feed/${normalizedUrl}`,
  });
}

async function handleSubscriptionEdit(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
  const subscriptionId = params.get("s")?.trim() ?? "";
  const action = params.get("ac")?.trim() ?? "";
  const title = params.get("t")?.trim() ?? "";
  const addTag = params.get("a")?.trim() ?? "";
  const removeTag = params.get("r")?.trim() ?? "";

  if (!subscriptionId.startsWith("feed/")) {
    return textResponse("OK\n");
  }

  const feedUrl = subscriptionId.slice("feed/".length);
  const db = getDb();

  if (action === "unsubscribe") {
    await db
      .delete(feedSources)
      .where(
        and(eq(feedSources.userId, user.userId), eq(feedSources.url, feedUrl)),
      );

    const [feed] = await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(eq(feeds.url, feedUrl))
      .limit(1);

    if (feed) {
      await db
        .delete(feedCategories)
        .where(
          and(
            eq(feedCategories.userId, user.userId),
            eq(feedCategories.feedId, feed.id),
          ),
        );
    }

    return textResponse("OK\n");
  }

  if (title) {
    await db
      .update(feedSources)
      .set({ name: title })
      .where(
        and(eq(feedSources.userId, user.userId), eq(feedSources.url, feedUrl)),
      );
  }

  if (addTag.startsWith("user/-/label/")) {
    const label = addTag.slice("user/-/label/".length);
    const [feed] = await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(eq(feeds.url, feedUrl))
      .limit(1);

    if (feed && label) {
      await db
        .delete(feedCategories)
        .where(
          and(
            eq(feedCategories.userId, user.userId),
            eq(feedCategories.feedId, feed.id),
          ),
        );

      await db.insert(feedCategories).values({
        userId: user.userId,
        feedId: feed.id,
        category: label,
      });
    }
  }

  if (removeTag.startsWith("user/-/label/")) {
    const label = removeTag.slice("user/-/label/".length);
    const [feed] = await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(eq(feeds.url, feedUrl))
      .limit(1);

    if (feed && label) {
      await db
        .delete(feedCategories)
        .where(
          and(
            eq(feedCategories.userId, user.userId),
            eq(feedCategories.feedId, feed.id),
            eq(feedCategories.category, label),
          ),
        );
    }
  }

  return textResponse("OK\n");
}

async function handleDisableTag(): Promise<Response> {
  return textResponse("OK\n");
}

async function handleRenameTag(): Promise<Response> {
  return textResponse("OK\n");
}

async function handleMarkAllAsRead(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
  const stream = params.get("s") ?? "user/-/state/com.google/reading-list";

  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();

  const rows = stream.startsWith("feed/")
    ? await db
        .select({ articleId: articles.id })
        .from(articles)
        .innerJoin(feeds, eq(feeds.id, articles.feedId))
        .innerJoin(
          feedSources,
          and(
            eq(feedSources.url, feeds.url),
            eq(feedSources.userId, user.userId),
          ),
        )
        .where(eq(feeds.url, stream.slice("feed/".length)))
    : stream === "user/-/state/com.google/starred" && useArticleStatuses
      ? await db
          .select({ articleId: articles.id })
          .from(articles)
          .innerJoin(feeds, eq(feeds.id, articles.feedId))
          .innerJoin(
            feedSources,
            and(
              eq(feedSources.url, feeds.url),
              eq(feedSources.userId, user.userId),
            ),
          )
          .innerJoin(
            articleStatuses,
            and(
              eq(articleStatuses.userId, user.userId),
              eq(articleStatuses.articleId, articles.id),
            ),
          )
          .where(eq(articleStatuses.isStarred, true))
      : stream === "user/-/state/com.google/starred"
        ? []
        : await db
            .select({ articleId: articles.id })
            .from(articles)
            .innerJoin(feeds, eq(feeds.id, articles.feedId))
            .innerJoin(
              feedSources,
              and(
                eq(feedSources.url, feeds.url),
                eq(feedSources.userId, user.userId),
              ),
            );
  await upsertArticleStatuses(
    user.userId,
    rows.map((row) => row.articleId),
    { isRead: true },
  );

  return textResponse("OK\n");
}

async function handleUnreadCount(user: SessionUser): Promise<Response> {
  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();

  const rows = await (useArticleStatuses
    ? db
        .select({
          sourceUrl: feedSources.url,
          unreadCount: sql<number>`sum(case when coalesce(${articleStatuses.isRead}, false) = false then 1 else 0 end)`,
        })
        .from(feedSources)
        .innerJoin(feeds, eq(feeds.url, feedSources.url))
        .leftJoin(articles, eq(articles.feedId, feeds.id))
        .leftJoin(
          articleStatuses,
          and(
            eq(articleStatuses.userId, user.userId),
            eq(articleStatuses.articleId, articles.id),
          ),
        )
        .where(eq(feedSources.userId, user.userId))
        .groupBy(feedSources.url)
    : db
        .select({
          sourceUrl: feedSources.url,
          unreadCount: sql<number>`count(${articles.id})`,
        })
        .from(feedSources)
        .innerJoin(feeds, eq(feeds.url, feedSources.url))
        .leftJoin(articles, eq(articles.feedId, feeds.id))
        .where(eq(feedSources.userId, user.userId))
        .groupBy(feedSources.url));

  const totalUnread = rows.reduce(
    (accumulator, row) => accumulator + Number(row.unreadCount ?? 0),
    0,
  );

  return NextResponse.json({
    max: MAX_STREAM_ITEMS,
    unreadcounts: [
      {
        id: "user/-/state/com.google/reading-list",
        count: totalUnread,
        newestItemTimestampUsec: "0",
      },
      ...rows.map((row) => ({
        id: `feed/${row.sourceUrl}`,
        count: Number(row.unreadCount ?? 0),
        newestItemTimestampUsec: "0",
      })),
    ],
  });
}

async function handleEditTag(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
  const articleIds = Array.from(
    new Set(
      params
        .getAll("i")
        .map((value) => parseItemRefArticleId(value))
        .filter((value): value is number => value !== null),
    ),
  );

  if (articleIds.length === 0) {
    return textResponse("OK\n");
  }

  const addTags = params.getAll("a");
  const removeTags = params.getAll("r");

  if (addTags.includes("user/-/state/com.google/read")) {
    await upsertArticleStatuses(user.userId, articleIds, { isRead: true });
  }

  if (removeTags.includes("user/-/state/com.google/read")) {
    await upsertArticleStatuses(user.userId, articleIds, { isRead: false });
  }

  if (addTags.includes("user/-/state/com.google/starred")) {
    await upsertArticleStatuses(user.userId, articleIds, { isStarred: true });
  }

  if (removeTags.includes("user/-/state/com.google/starred")) {
    await upsertArticleStatuses(user.userId, articleIds, { isStarred: false });
  }

  return textResponse("OK\n");
}

async function handleReaderRequest(
  request: NextRequest,
  user: SessionUser,
  segments: string[],
): Promise<Response> {
  const resource = segments.slice(3).join("/");

  if (resource === "user-info") {
    return handleUserInfo(user);
  }

  if (resource === "token") {
    return handleToken();
  }

  if (resource === "tag/list") {
    return handleTagList(user);
  }

  if (resource === "disable-tag") {
    return handleDisableTag();
  }

  if (resource === "rename-tag") {
    return handleRenameTag();
  }

  if (resource === "subscription/list") {
    return handleSubscriptionList(user);
  }

  if (resource === "subscription/quickadd") {
    return handleSubscriptionQuickAdd(user, request);
  }

  if (resource === "subscription/edit") {
    return handleSubscriptionEdit(user, request);
  }

  if (resource === "unread-count") {
    return handleUnreadCount(user);
  }

  if (resource === "mark-all-as-read") {
    return handleMarkAllAsRead(user, request);
  }

  if (resource === "stream/items/ids") {
    return handleStreamItemIds(user, request);
  }

  if (resource === "stream/items/contents") {
    return handleStreamItemContents(user, request);
  }

  if (resource === "edit-tag") {
    return handleEditTag(user, request);
  }

  if (resource.startsWith("stream/contents/")) {
    return handleStreamContents(user, request, resource);
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

async function dispatch(
  request: NextRequest,
  segments: string[],
): Promise<Response> {
  if (segments[0] === "accounts" && segments[1] === "ClientLogin") {
    return handleClientLogin(request);
  }

  if (
    segments[0] === "reader" &&
    segments[1] === "api" &&
    segments[2] === "0"
  ) {
    const authResult = await requireGReaderUser(request);
    if (authResult instanceof Response) {
      return authResult;
    }

    return handleReaderRequest(request, authResult, segments);
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { segments } = await context.params;
  return dispatch(request, segments);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { segments } = await context.params;
  return dispatch(request, segments);
}
