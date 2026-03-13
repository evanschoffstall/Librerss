import { cookies } from "next/headers";
import { Suspense } from "react";

import { DashboardRouter } from "./DashboardRouter";

import { Skeleton } from "@/components/ui/skeleton";
import {
  getUserFromSessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import type { AuthSession } from "@/lib/core/types";

export default async function Dashboard(props: PageProps<"/dashboard">) {
  const [initialSession, resolvedSearchParams] = await Promise.all([
    getInitialSession(),
    props.searchParams,
  ]);
  const hasPreviewQuery =
    getSearchParamValue(resolvedSearchParams.preview) === "1" ||
    getSearchParamValue(resolvedSearchParams.explore) === "1";

  return (
    <div className="h-dvh overflow-hidden overscroll-contain">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center overflow-hidden px-4">
            <div className="w-full max-w-3xl space-y-2">
              <Skeleton className="h-8 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          </div>
        }
      >
        <DashboardRouter
          hasPreviewQuery={hasPreviewQuery}
          initialSession={initialSession}
        />
      </Suspense>
    </div>
  );
}

function buildAnonymousSession(): AuthSession {
  return {
    allowSignup: RUNTIME_FLAGS.allowSignup,
    authenticated: false,
    usePlaceholderData: RUNTIME_FLAGS.usePlaceholderData,
    user: null,
  };
}

async function getInitialSession(): Promise<AuthSession> {
  const sessionToken = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
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

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
