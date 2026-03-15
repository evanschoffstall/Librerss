import { cookies } from "next/headers";
import { Suspense } from "react";

import { DashboardShellSkeleton } from "./components/DashboardShellSkeleton";
import { DashboardRouter } from "./DashboardRouter";
import {
  DASHBOARD_PREVIEW_COOKIE_NAME,
  resolveDashboardPreviewMode,
} from "./preview-mode";

import {
  getUserFromSessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import type { AuthSession } from "@/lib/core/types";

/** Resolves the dashboard route shell and authenticated session state. */
export default async function Dashboard(props: PageProps<"/dashboard">) {
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

  return (
    <div className="h-dvh overflow-hidden overscroll-contain">
      <Suspense fallback={<DashboardShellSkeleton />}>
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
