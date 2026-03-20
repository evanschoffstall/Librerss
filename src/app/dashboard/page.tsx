import { cookies } from "next/headers";
import { Suspense } from "react";

import type { AuthSession } from "@/lib/core/types";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getUserFromSessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";

import {
  DashboardFeedViewport,
  DashboardScaffold,
} from "./components/DashboardScaffold";
import { DashboardSidebarSkeleton } from "./components/DashboardSidebarContent";
import { DashboardTopBarSkeleton } from "./components/DashboardTopTokenBar";
import { FeedListSkeleton } from "./components/feed/FeedListSkeleton";
import { LoginViewSkeleton } from "./components/login/LoginViewSkeleton";
import { DashboardRouter } from "./DashboardRouter";
import {
  DASHBOARD_PREVIEW_COOKIE_NAME,
  resolveDashboardPreviewMode,
} from "./preview-mode";

interface DashboardPageProps {
  searchParams: Promise<{
    explore?: string | string[];
    preview?: string | string[];
  }>;
}

/** Resolves the dashboard route shell and authenticated session state. */
export default async function Dashboard(props: DashboardPageProps) {
  const [cookieStore, resolvedSearchParams] = await Promise.all([
    cookies(),
    props.searchParams,
  ]);
  const hasPreviewQuery =
    getSearchParamValue(resolvedSearchParams.preview) === "1" ||
    getSearchParamValue(resolvedSearchParams.explore) === "1";
  const initialPreviewMode = resolveDashboardPreviewMode({
    cookieValue: cookieStore.get(DASHBOARD_PREVIEW_COOKIE_NAME)?.value,
    hasPreviewQuery,
  });
  const initialSession = initialPreviewMode
    ? buildAnonymousSession()
    : await getInitialSession(cookieStore);

  const showLoginSkeleton =
    !initialPreviewMode && !initialSession.authenticated;

  return (
    <div className="h-dvh overflow-hidden overscroll-contain">
      <Suspense
        fallback={
          showLoginSkeleton ? (
            <LoginViewSkeleton />
          ) : (
            <DashboardShellFallback />
          )
        }
      >
        <DashboardRouter
          hasPreviewQuery={hasPreviewQuery}
          initialPreviewMode={initialPreviewMode}
          initialSession={initialSession}
        />
      </Suspense>
    </div>
  );
}

/** Builds an anonymous dashboard session snapshot from runtime flags alone. */
function buildAnonymousSession(): AuthSession {
  return {
    allowSignup: RUNTIME_FLAGS.allowSignup,
    authenticated: false,
    usePlaceholderData: RUNTIME_FLAGS.usePlaceholderData,
    user: null,
  };
}

/**
 * Inline shell skeleton fallback that composes the native component skeletons
 * through the same `DashboardScaffold` used by the hydrated dashboard.
 */
function DashboardShellFallback() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading dashboard"
      className="h-full overflow-hidden bg-background"
    >
      <div className="relative h-full overflow-hidden">
        <div
          aria-hidden="true"
          className="
            pointer-events-none absolute top-1/2 size-64 -translate-y-1/2
            rounded-full bg-primary/5 blur-3xl
          "
        />
        <DashboardScaffold
          feed={
            <DashboardFeedViewport>
              <FeedListSkeleton />
            </DashboardFeedViewport>
          }
          sidebar={
            <ScrollArea className="h-full">
              <DashboardSidebarSkeleton />
            </ScrollArea>
          }
          topBar={<DashboardTopBarSkeleton />}
        />
      </div>
    </main>
  );
}

/**
 * Resolves the initial dashboard session using the session cookie when present.
 *
 * Falling back to an anonymous snapshot keeps the route shell stable for both
 * unauthenticated users and invalid/expired sessions.
 */
async function getInitialSession(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): Promise<AuthSession> {
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) {
    return buildAnonymousSession();
  }

  try {
    const user = await getUserFromSessionToken(sessionToken);
    if (!user) {
      return buildAnonymousSession();
    }

    return {
      allowSignup: RUNTIME_FLAGS.allowSignup,
      authenticated: true,
      usePlaceholderData: RUNTIME_FLAGS.usePlaceholderData,
      user: { email: user.email, id: user.userId },
    };
  } catch {
    return buildAnonymousSession();
  }
}

/** Normalizes a Next.js search-param value to its first scalar entry. */
function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
