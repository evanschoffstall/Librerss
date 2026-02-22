import { parseFormOrQueryParams, parsePositiveInt } from "@/lib/api/request";
import {
  parseEmailPasswordFromFormData,
  parseEmailPasswordFromRecord,
  parseEmailPasswordFromSearchParams,
} from "@/lib/auth/credentials";
import {
  createSession,
  getUserFromRequest,
  getUserFromSessionToken,
  verifyPassword,
  type SessionUser,
} from "@/lib/auth/session";
import { parseReaderItemId, toReaderItemId } from "@/lib/core/reader-item-id";
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
import { DEFAULT_CATEGORY_LABEL } from "@/lib/utils/categories";
import {
  isValidUrl,
  tryGetUrlHostname,
  tryNormalizeFeedUrl,
} from "@/lib/utils/url";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

const GOOGLE_LOGIN_PREFIX = "googlelogin auth=";
const MAX_STREAM_ITEMS = 250;
const DEFAULT_STREAM_ITEMS = 50;
const NETNEWSWIRE_MAX_STREAM_ITEMS = 250;
const READER_API_EDIT_TOKEN = randomBytes(24).toString("hex");
let articleStatusesTableState: "unknown" | "available" | "missing" = "unknown";
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

type ReaderResourceHandler = () => Promise<Response>;

type TagMutation = {
  target: "a" | "r";
  tag: string;
  patch: {
    isRead?: boolean;
    isStarred?: boolean;
  };
};

const TAG_MUTATIONS: TagMutation[] = [
  {
    target: "a",
    tag: "user/-/state/com.google/read",
    patch: { isRead: true },
  },
  {
    target: "r",
    tag: "user/-/state/com.google/read",
    patch: { isRead: false },
  },
  {
    target: "a",
    tag: "user/-/state/com.google/starred",
    patch: { isStarred: true },
  },
  {
    target: "r",
    tag: "user/-/state/com.google/starred",
    patch: { isStarred: false },
  },
];

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
  if (articleStatusesTableState === "available") {
    return true;
  }

  if (articleStatusesTableState === "missing") {
    return false;
  }

  try {
    const db = getDb();
    await db.select({ id: articleStatuses.id }).from(articleStatuses).limit(1);
    articleStatusesTableState = "available";
    return true;
  } catch (error) {
    if (isMissingArticleStatusesTableError(error)) {
      articleStatusesTableState = "missing";
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

function notFoundResponse(): Response {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function parseClientLoginParams(
  searchParams: URLSearchParams,
): ClientLoginPayload | null {
  return parseEmailPasswordFromSearchParams(searchParams, {
    emailKeys: ["Email", "email", "username"],
    passwordKeys: ["Passwd", "password", "passwd"],
  });
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
    return parseEmailPasswordFromFormData(form, {
      emailKeys: ["Email", "email", "username"],
      passwordKeys: ["Passwd", "password", "passwd"],
    });
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
    return parseEmailPasswordFromRecord(json, {
      emailKeys: ["Email", "email", "username"],
      passwordKeys: ["Passwd", "password", "passwd"],
    });
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

function isSafePositiveItemId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
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

function toReaderCategoryLabel(category: string | null | undefined): string {
  const trimmed = category?.trim();
  return trimmed ? trimmed : DEFAULT_CATEGORY_LABEL;
}

function toReaderIconUrl(feedUrl: string): string {
  const hostname = tryGetUrlHostname(feedUrl);
  if (!hostname) {
    return "";
  }

  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
}

function mapArticleAsItem(row: ListedArticle) {
  const publishedSec = Math.floor(row.publicationDate.getTime() / 1000);
  const categories = ["user/-/state/com.google/reading-list"];
  const categoryLabel = toReaderCategoryLabel(row.category);

  categories.push(`user/-/label/${categoryLabel}`);

  if (row.isRead) {
    categories.push("user/-/state/com.google/read");
  }

  if (row.isStarred) {
    categories.push("user/-/state/com.google/starred");
  }

  return {
    id: toReaderItemId(row.articleId),
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
  console.info("[greader] token", {
    tokenLength: READER_API_EDIT_TOKEN.length,
    isAlphanumeric: /^[a-z0-9]+$/i.test(READER_API_EDIT_TOKEN),
  });

  return textResponse(`${READER_API_EDIT_TOKEN}\n`);
}

async function handleTagList(user: SessionUser): Promise<Response> {
  const db = getDb();
  const labels = await db
    .select({ category: feedCategories.category })
    .from(feedCategories)
    .where(eq(feedCategories.userId, user.userId))
    .groupBy(feedCategories.category);

  const normalizedLabels = Array.from(
    new Set([
      DEFAULT_CATEGORY_LABEL,
      ...labels
        .map((label) => label.category?.trim())
        .filter((label): label is string => Boolean(label)),
    ]),
  );

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
      ...normalizedLabels.map((label, index) => ({
        id: `user/-/label/${label}`,
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
    .leftJoin(feeds, eq(feeds.url, feedSources.url))
    .leftJoin(
      feedCategories,
      and(
        eq(feedCategories.userId, feedSources.userId),
        eq(feedCategories.feedId, feeds.id),
      ),
    )
    .where(eq(feedSources.userId, user.userId));

  console.info("[greader] subscription/list", {
    userId: user.userId,
    subscriptionCount: rows.length,
  });

  return NextResponse.json({
    subscriptions: rows.map((row) => {
      const categoryLabel = toReaderCategoryLabel(row.category);

      return {
        id: `feed/${row.url}`,
        title: row.title,
        url: row.url,
        htmlUrl: row.url,
        iconUrl: toReaderIconUrl(row.url),
        sortid: String(row.sourceId),
        categories: [
          {
            id: `user/-/label/${categoryLabel}`,
            label: categoryLabel,
          },
        ],
      };
    }),
  });
}

function parseStreamPaging(
  searchParams: URLSearchParams,
  userAgent: string,
): {
  limit: number;
  offset: number;
  continuationId: number | null;
  isNetNewsWire: boolean;
} {
  const isNetNewsWire = /netnewswire/i.test(userAgent);
  const requested = parsePositiveInt(searchParams.get("n"));
  const maxStreamItems = isNetNewsWire
    ? NETNEWSWIRE_MAX_STREAM_ITEMS
    : MAX_STREAM_ITEMS;
  const limit = Math.min(requested ?? DEFAULT_STREAM_ITEMS, maxStreamItems);

  const continuation = searchParams.get("c");
  if (!continuation) {
    return { limit, offset: 0, continuationId: null, isNetNewsWire };
  }

  if (continuation.startsWith("offset:")) {
    const continuationOffset = Number.parseInt(
      continuation.slice("offset:".length),
      10,
    );

    if (Number.isInteger(continuationOffset) && continuationOffset >= 0) {
      return {
        limit,
        offset: continuationOffset,
        continuationId: null,
        isNetNewsWire,
      };
    }
  }

  const parsedContinuationId = Number.parseInt(continuation, 10);

  if (Number.isInteger(parsedContinuationId) && parsedContinuationId > 0) {
    return {
      limit,
      offset: 0,
      continuationId: parsedContinuationId,
      isNetNewsWire,
    };
  }

  return { limit, offset: 0, continuationId: null, isNetNewsWire };
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
  const {
    limit: requestedLimit,
    offset,
    continuationId,
    isNetNewsWire,
  } = parseStreamPaging(searchParams, request.headers.get("user-agent") ?? "");
  const limit = requestedLimit;
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

  async function queryRows(dateFilter: Date | null): Promise<ListedArticle[]> {
    if (useArticleStatuses) {
      const conditions: Parameters<typeof and> = [];

      if (feedUrl && dateFilter) {
        conditions.push(
          and(
            eq(feeds.url, feedUrl),
            gte(articles.publicationDate, dateFilter),
          ),
        );
      } else if (feedUrl) {
        conditions.push(eq(feeds.url, feedUrl));
      } else if (dateFilter) {
        conditions.push(gte(articles.publicationDate, dateFilter));
      }

      if (isStarredStream) {
        conditions.push(eq(articleStatuses.isStarred, true));
      }

      if (continuationId) {
        conditions.push(lt(articles.id, continuationId));
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
        .orderBy(desc(articles.id))
        .limit(limit)
        .offset(offset);

      return query;
    }

    const conditions: Parameters<typeof and> = [];

    if (feedUrl && dateFilter) {
      conditions.push(
        and(eq(feeds.url, feedUrl), gte(articles.publicationDate, dateFilter)),
      );
    } else if (feedUrl) {
      conditions.push(eq(feeds.url, feedUrl));
    } else if (dateFilter) {
      conditions.push(gte(articles.publicationDate, dateFilter));
    }

    if (continuationId) {
      conditions.push(lt(articles.id, continuationId));
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
      .orderBy(desc(articles.id))
      .limit(limit)
      .offset(offset);

    return query;
  }

  let rows = await queryRows(sinceDate);
  let usedOtFallback = false;

  if (rows.length === 0 && sinceDate) {
    rows = await queryRows(null);
    usedOtFallback = true;
  }

  const items = rows.map(mapArticleAsItem);

  const nextContinuationId =
    rows.length === limit ? rows.at(-1)?.articleId : null;

  console.info("[greader] stream/contents", {
    userId: user.userId,
    streamId,
    limit,
    isNetNewsWire,
    offset,
    continuationId,
    ot: searchParams.get("ot"),
    itemCount: rows.length,
    usedOtFallback,
    continuation: nextContinuationId ? String(nextContinuationId) : null,
  });

  return NextResponse.json({
    id: streamId,
    direction: "ltr",
    updated: Math.floor(Date.now() / 1000),
    continuation: nextContinuationId ? String(nextContinuationId) : undefined,
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

  const {
    limit: requestedLimit,
    offset,
    continuationId,
    isNetNewsWire,
  } = parseStreamPaging(searchParams, request.headers.get("user-agent") ?? "");
  const limit = requestedLimit;
  const olderThanSec = Number.parseInt(searchParams.get("ot") ?? "", 10);
  const sinceDate = Number.isInteger(olderThanSec)
    ? new Date(olderThanSec * 1000)
    : null;

  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();

  if (streamId === "user/-/state/com.google/starred" && !useArticleStatuses) {
    return NextResponse.json({ itemRefs: [], continuation: undefined });
  }

  async function queryRows(dateFilter: Date | null): Promise<
    Array<{
      articleId: number;
      isRead: boolean | null;
      isStarred: boolean | null;
    }>
  > {
    if (useArticleStatuses) {
      const conditions: Parameters<typeof and> = [];

      if (feedUrl && dateFilter) {
        conditions.push(
          and(
            eq(feeds.url, feedUrl),
            gte(articles.publicationDate, dateFilter),
          ),
        );
      } else if (feedUrl) {
        conditions.push(eq(feeds.url, feedUrl));
      } else if (dateFilter) {
        conditions.push(gte(articles.publicationDate, dateFilter));
      }

      if (streamId === "user/-/state/com.google/starred") {
        conditions.push(eq(articleStatuses.isStarred, true));
      }

      if (excludeRead) {
        conditions.push(
          sql`coalesce(${articleStatuses.isRead}, false) = false`,
        );
      }

      if (continuationId) {
        conditions.push(lt(articles.id, continuationId));
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
        .orderBy(desc(articles.id))
        .limit(limit)
        .offset(offset);

      return query;
    }

    const conditions: Parameters<typeof and> = [];

    if (feedUrl && dateFilter) {
      conditions.push(
        and(eq(feeds.url, feedUrl), gte(articles.publicationDate, dateFilter)),
      );
    } else if (feedUrl) {
      conditions.push(eq(feeds.url, feedUrl));
    } else if (dateFilter) {
      conditions.push(gte(articles.publicationDate, dateFilter));
    }

    if (continuationId) {
      conditions.push(lt(articles.id, continuationId));
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
      .orderBy(desc(articles.id))
      .limit(limit)
      .offset(offset);

    return query;
  }

  let rows: Array<{
    articleId: number;
    isRead: boolean | null;
    isStarred: boolean | null;
  }> = await queryRows(sinceDate);
  let usedOtFallback = false;

  if (rows.length === 0 && sinceDate) {
    rows = await queryRows(null);
    usedOtFallback = true;
  }

  const safeRows = rows.filter((row) => isSafePositiveItemId(row.articleId));
  const itemIds = safeRows.map((row) => row.articleId);
  const minItemId = itemIds.length > 0 ? Math.min(...itemIds) : null;
  const maxItemId = itemIds.length > 0 ? Math.max(...itemIds) : null;
  const continuationIdToReturn =
    safeRows.length === limit ? (safeRows.at(-1)?.articleId ?? null) : null;
  const continuation = continuationIdToReturn
    ? String(continuationIdToReturn)
    : undefined;

  console.info("[greader] stream/items/ids", {
    userId: user.userId,
    streamId,
    limit,
    isNetNewsWire,
    offset,
    continuationId,
    ot: searchParams.get("ot"),
    excludeRead,
    itemRefCount: safeRows.length,
    droppedUnsafeItemRefCount: rows.length - safeRows.length,
    usedOtFallback,
    minItemId,
    maxItemId,
    sampleItemIds: itemIds.slice(0, 5),
    continuation: continuation ?? null,
  });

  return NextResponse.json({
    itemRefs: safeRows.map((row) => ({ id: String(row.articleId) })),
    continuation,
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
        .map((value) => parseReaderItemId(value))
        .filter((value): value is number => value !== null),
    ),
  );

  if (articleIds.length === 0) {
    console.info("[greader] stream/items/contents", {
      userId: user.userId,
      requestedItemCount: 0,
      returnedItemCount: 0,
    });

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

  console.info("[greader] stream/items/contents", {
    userId: user.userId,
    requestedItemCount: articleIds.length,
    returnedItemCount: rows.length,
  });

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
        .map((value) => parseReaderItemId(value))
        .filter((value): value is number => value !== null),
    ),
  );

  if (articleIds.length === 0) {
    return textResponse("OK\n");
  }

  const addTags = params.getAll("a");
  const removeTags = params.getAll("r");

  for (const mutation of TAG_MUTATIONS) {
    const tags = mutation.target === "a" ? addTags : removeTags;
    if (!tags.includes(mutation.tag)) {
      continue;
    }

    await upsertArticleStatuses(user.userId, articleIds, mutation.patch);
  }

  return textResponse("OK\n");
}

function createReaderResourceHandlers(
  request: NextRequest,
  user: SessionUser,
): Record<string, ReaderResourceHandler> {
  return {
    "user-info": () => handleUserInfo(user),
    token: () => handleToken(),
    "tag/list": () => handleTagList(user),
    "disable-tag": () => handleDisableTag(),
    "rename-tag": () => handleRenameTag(),
    "subscription/list": () => handleSubscriptionList(user),
    "subscription/quickadd": () => handleSubscriptionQuickAdd(user, request),
    "subscription/edit": () => handleSubscriptionEdit(user, request),
    "unread-count": () => handleUnreadCount(user),
    "mark-all-as-read": () => handleMarkAllAsRead(user, request),
    "stream/items/ids": () => handleStreamItemIds(user, request),
    "stream/items/contents": () => handleStreamItemContents(user, request),
    "edit-tag": () => handleEditTag(user, request),
  };
}

function isClientLoginRoute(segments: string[]): boolean {
  return segments[0] === "accounts" && segments[1] === "ClientLogin";
}

function isReaderApiRoute(segments: string[]): boolean {
  return (
    segments[0] === "reader" && segments[1] === "api" && segments[2] === "0"
  );
}

async function handleReaderRequest(
  request: NextRequest,
  user: SessionUser,
  segments: string[],
): Promise<Response> {
  const resource = segments.slice(3).join("/");
  const handler = createReaderResourceHandlers(request, user)[resource];

  if (handler) {
    return handler();
  }

  if (resource.startsWith("stream/contents/")) {
    return handleStreamContents(user, request, resource);
  }

  return notFoundResponse();
}

async function dispatch(
  request: NextRequest,
  segments: string[],
): Promise<Response> {
  if (isClientLoginRoute(segments)) {
    return handleClientLogin(request);
  }

  if (isReaderApiRoute(segments)) {
    const authResult = await requireGReaderUser(request);
    if (authResult instanceof Response) {
      return authResult;
    }

    return handleReaderRequest(request, authResult, segments);
  }

  return notFoundResponse();
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { segments } = await context.params;
    return dispatch(request, segments);
  } catch (error) {
    console.error("[greader] Unhandled GET error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { segments } = await context.params;
    return dispatch(request, segments);
  } catch (error) {
    console.error("[greader] Unhandled POST error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
