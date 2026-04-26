import type { AuthSession } from "@/lib/core";

/**
 * Describes the dashboard page bootstrap state.
 */
export interface DashboardPageBootstrapState {
  hasPreviewQuery: boolean;
  initialAutoLoginPath?: string;
  initialLoginErrorMessage?: string;
  initialPreviewMode: boolean;
  initialSession: AuthSession;
}

/**
 * Describes the dashboard page search params.
 */
export interface DashboardPageSearchParams {
  devLogin?: string | string[];
  explore?: string | string[];
}

/**
 * Describes the dashboard cookie store.
 */
interface DashboardCookieStore {
  get(name: string): undefined | { value: string };
}

/**
 * Describes the dashboard page bootstrap deps.
 */
interface DashboardPageBootstrapDeps {
  buildDevAutoLoginRequestPath: (returnTo: string) => string;
  getUserFromSessionToken: (
    sessionToken: string,
  ) => Promise<null | { email: string; userId: number }>;
  isDevAutoLoginEnabled: () => boolean;
  isDevAutoLoginFailure: (value: string | string[] | undefined) => boolean;
  resolveDashboardPreviewMode: (options: {
    hasExploreQuery: boolean;
  }) => boolean;
  runtimeFlags: Pick<AuthSession, "allowSignup" | "usePlaceholderData">;
  sessionCookieName: string;
}

/**
 * Describes the dashboard page bootstrap input.
 */
interface DashboardPageBootstrapInput {
  cookieStore: DashboardCookieStore;
  deps: DashboardPageBootstrapDeps;
  searchParams: DashboardPageSearchParams;
}

/**
 * Build the anonymous dashboard session.
 * @param runtimeFlags - The runtime flags.
 * @returns The anonymous dashboard session.
 */
export function buildAnonymousDashboardSession(
  runtimeFlags: Pick<AuthSession, "allowSignup" | "usePlaceholderData">,
): AuthSession {
  return {
    allowSignup: runtimeFlags.allowSignup,
    authenticated: false,
    usePlaceholderData: runtimeFlags.usePlaceholderData,
    user: null,
  };
}

/**
 * Return the initial dashboard session.
 * @param cookieStore - The cookie store.
 * @param deps - The deps.
 * @returns The initial dashboard session.
 */
export async function getInitialDashboardSession(
  cookieStore: DashboardCookieStore,
  deps: Pick<
    DashboardPageBootstrapDeps,
    "getUserFromSessionToken" | "runtimeFlags" | "sessionCookieName"
  >,
): Promise<AuthSession> {
  const sessionToken = cookieStore.get(deps.sessionCookieName)?.value;
  if (!sessionToken) {
    return buildAnonymousDashboardSession(deps.runtimeFlags);
  }

  try {
    const user = await deps.getUserFromSessionToken(sessionToken);
    if (!user) {
      return buildAnonymousDashboardSession(deps.runtimeFlags);
    }

    return {
      allowSignup: deps.runtimeFlags.allowSignup,
      authenticated: true,
      usePlaceholderData: deps.runtimeFlags.usePlaceholderData,
      user: { email: user.email, id: user.userId },
    };
  } catch {
    return buildAnonymousDashboardSession(deps.runtimeFlags);
  }
}
/**
 * Return the search param value.
 * @param value - The value.
 * @returns The search param value.
 */
export function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Resolve the dashboard page bootstrap.
 * @param input - The input used to resolve the dashboard page bootstrap.
 * @returns The dashboard page bootstrap.
 */
export async function resolveDashboardPageBootstrap(
  input: DashboardPageBootstrapInput,
): Promise<DashboardPageBootstrapState> {
  const hasPreviewQuery =
    getSearchParamValue(input.searchParams.explore) === "1";
  const hasDevAutoLoginFailure = input.deps.isDevAutoLoginFailure(
    input.searchParams.devLogin,
  );
  const initialPreviewMode = input.deps.resolveDashboardPreviewMode({
    hasExploreQuery: hasPreviewQuery,
  });
  const initialSession = initialPreviewMode
    ? buildAnonymousDashboardSession(input.deps.runtimeFlags)
    : await getInitialDashboardSession(input.cookieStore, input.deps);

  return {
    hasPreviewQuery,
    initialAutoLoginPath:
      !initialPreviewMode &&
      !initialSession.authenticated &&
      !hasDevAutoLoginFailure &&
      input.deps.isDevAutoLoginEnabled()
        ? input.deps.buildDevAutoLoginRequestPath("/dashboard")
        : undefined,
    initialLoginErrorMessage: hasDevAutoLoginFailure
      ? "Dev auto-login failed. Check DEV_AUTO_LOGIN_EMAIL and DEV_AUTO_LOGIN_PASSWORD."
      : undefined,
    initialPreviewMode,
    initialSession,
  };
}
