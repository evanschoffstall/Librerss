import { cookies } from "next/headers";
import { Suspense } from "react";

import { DashboardToolbarSkeleton } from "@/app/dashboard/dashboard-components";
import { FeedListSkeleton } from "@/app/dashboard/dashboard-components/feed-view";
import {
  DashboardFeedViewport,
  DashboardFilterBarSkeleton,
  DashboardScaffold,
  DashboardSidebarSkeleton,
} from "@/app/dashboard/dashboard-components/layout";
import { LoginViewSkeleton } from "@/app/dashboard/dashboard-components/login";
import { DashboardRouter } from "@/app/dashboard/dashboard-router";
import { resolveDashboardPageBootstrap } from "@/app/dashboard/page-bootstrap/state";
import { resolveDashboardPreviewMode } from "@/app/dashboard/preview-mode";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  buildDevAutoLoginRequestPath,
  getUserFromSessionToken,
  isDevAutoLoginEnabled,
  isDevAutoLoginFailure,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { RUNTIME_FLAGS } from "@/lib/core";

interface DashboardPageProps {
  searchParams: Promise<{
    devLogin?: string | string[];
    explore?: string | string[];
  }>;
}

/**
 * Resolves the dashboard route shell and authenticated session state.
 * @param props
 */
export default async function Dashboard(props: DashboardPageProps) {
  const [cookieStore, searchParams] = await Promise.all([
    cookies(),
    props.searchParams,
  ]);
  const bootstrapState = await resolveDashboardPageBootstrap({
    cookieStore,
    deps: {
      buildDevAutoLoginRequestPath,
      getUserFromSessionToken,
      isDevAutoLoginEnabled,
      isDevAutoLoginFailure,
      resolveDashboardPreviewMode,
      runtimeFlags: RUNTIME_FLAGS,
      sessionCookieName: SESSION_COOKIE_NAME,
    },
    searchParams,
  });

  const showLoginSkeleton =
    !bootstrapState.initialPreviewMode &&
    !bootstrapState.initialSession.authenticated;

  return (
    <div className="h-dvh overflow-hidden overscroll-contain">
      <Suspense
        fallback={
          showLoginSkeleton ? <LoginViewSkeleton /> : <DashboardShellFallback />
        }
      >
        <DashboardRouter
          hasPreviewQuery={bootstrapState.hasPreviewQuery}
          initialAutoLoginPath={bootstrapState.initialAutoLoginPath}
          initialLoginErrorMessage={bootstrapState.initialLoginErrorMessage}
          initialPreviewMode={bootstrapState.initialPreviewMode}
          initialSession={bootstrapState.initialSession}
        />
      </Suspense>
    </div>
  );
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
        <DashboardToolbarSkeleton
          isDevelopmentMode={process.env.NODE_ENV === "development"}
          mobileToolbarBottom={true}
          mobileToolbarMirror={true}
        />
        <DashboardScaffold
          feed={
            <DashboardFeedViewport>
              <FeedListSkeleton />
            </DashboardFeedViewport>
          }
          filterBar={<DashboardFilterBarSkeleton />}
          sidebar={
            <ScrollArea className="h-full">
              <DashboardSidebarSkeleton />
            </ScrollArea>
          }
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
