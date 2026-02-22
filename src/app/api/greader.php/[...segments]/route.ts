import { type SessionUser } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { handleClientLogin, requireGReaderUser } from "./handlers/auth";
import {
  handleStreamContents,
  handleStreamItemContents,
  handleStreamItemIds,
} from "./handlers/stream";
import {
  handleDisableTag,
  handleRenameTag,
  handleSubscriptionEdit,
  handleSubscriptionList,
  handleSubscriptionQuickAdd,
  handleTagList,
} from "./handlers/subscription";
import {
  handleEditTag,
  handleMarkAllAsRead,
  handleUnreadCount,
} from "./handlers/tag";
import { notFoundResponse, textResponse } from "./utils/responses";

export const dynamic = "force-dynamic";

const READER_API_EDIT_TOKEN = randomBytes(24).toString("hex");

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
  console.info("[greader] token", {
    tokenLength: READER_API_EDIT_TOKEN.length,
    isAlphanumeric: /^[a-z0-9]+$/i.test(READER_API_EDIT_TOKEN),
  });
  return textResponse(`${READER_API_EDIT_TOKEN}\n`);
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

  if (handler) return handler();

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
    if (authResult instanceof Response) return authResult;
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
