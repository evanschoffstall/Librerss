import {
  handleClientLogin,
  requireGReaderMutableUser,
  requireGReaderUser,
} from "@/lib/api/greader/auth";
import { handleStreamContents } from "@/lib/api/greader/stream-contents";
import { handleStreamItemContents } from "@/lib/api/greader/stream-item-contents";
import { handleStreamItemIds } from "@/lib/api/greader/stream-item-ids";
import {
  handleSubscriptionEdit,
  handleSubscriptionList,
  handleSubscriptionQuickAdd,
} from "@/lib/api/greader/subscription";
import {
  handleEditTag,
  handleMarkAllAsRead,
  handleUnreadCount,
} from "@/lib/api/greader/tag";
import {
  handleDisableTag,
  handleRenameTag,
  handleTagList,
} from "@/lib/api/greader/tag-labels";
import {
  getSearchParams,
  notFoundResponse,
  textResponse,
} from "@/lib/api/http";
import { SESSION_COOKIE_NAME, type SessionUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

// Lazily computed on first request — avoids module-init throws at build time.
// AUTH_SECRET MUST be set — an empty fallback would produce a predictable,
// offline-computable token, making edit-token authentication meaningless.
let _editToken: string | undefined;
function getEditToken(): string {
  if (!_editToken) {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      throw new Error(
        "[greader] AUTH_SECRET environment variable is required but not set.",
      );
    }
    _editToken = createHash("sha256")
      .update(`greader-edit-token:${secret}`)
      .digest("hex")
      .slice(0, 48);
  }
  return _editToken;
}

type RouteContext = {
  params: Promise<{ segments: string[] }>;
};

type ReaderResourceHandler = () => Promise<Response>;

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
  logger.info("[greader] token requested");
  return textResponse(`${getEditToken()}\n`);
}

function createReaderResourceHandlers(
  request: NextRequest,
  user: SessionUser,
): Record<string, ReaderResourceHandler> {
  return {
    "user-info": () => handleUserInfo(user),
    token: () => handleToken(),
    "tag/list": () => handleTagList(user),
    "disable-tag": () => handleDisableTag(user, request),
    "rename-tag": () => handleRenameTag(user, request),
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

  if (handler) return handler();

  if (resource.startsWith("stream/contents/")) {
    return handleStreamContents(user, request, resource);
  }

  return notFoundResponse();
}

// Endpoints that are read-only despite being POST (no edit-token required).
const READ_ONLY_RESOURCES = new Set([
  "stream/items/ids",
  "stream/items/contents",
]);

function isReadOnlyResource(resource: string): boolean {
  return (
    READ_ONLY_RESOURCES.has(resource) || resource.startsWith("stream/contents/")
  );
}

async function dispatch(
  request: NextRequest,
  segments: string[],
): Promise<Response> {
  if (isClientLoginRoute(segments)) {
    return handleClientLogin(request);
  }

  if (isReaderApiRoute(segments)) {
    const isPost = request.method.toUpperCase() === "POST";
    const authResult = isPost
      ? await requireGReaderMutableUser(request)
      : await requireGReaderUser(request);
    if (authResult instanceof Response) return authResult;

    // Validate the edit token (T parameter) for mutating POST requests
    // authenticated via bearer token (external RSS reader clients).
    // Cookie-authenticated browser requests are already protected by
    // requireSameOrigin CSRF checks and don't use the T-token flow.
    if (isPost) {
      const resource = segments.slice(3).join("/");
      const isCookieAuth = Boolean(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );
      if (
        !isCookieAuth &&
        resource !== "token" &&
        !isReadOnlyResource(resource)
      ) {
        const editToken =
          getSearchParams(request).get("T") ??
          (await request
            .clone()
            .formData()
            .then((fd) => fd.get("T") as string | null)
            .catch(() => null));

        if (editToken !== getEditToken()) {
          return textResponse("Error=InvalidToken\n", 403);
        }
      }
    }

    return handleReaderRequest(request, authResult, segments);
  }

  return notFoundResponse();
}

async function handleRequest(
  request: NextRequest,
  context: RouteContext,
  method: string,
): Promise<Response> {
  try {
    const { segments } = await context.params;
    return dispatch(request, segments);
  } catch (error) {
    logger.error(`[greader] Unhandled ${method} error`, {
      error: error instanceof Error ? error : undefined,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handleRequest(request, context, "GET");
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handleRequest(request, context, "POST");
}
