export const DASHBOARD_PREVIEW_COOKIE_NAME = "librerss_dashboard_preview";

const DASHBOARD_PREVIEW_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const DASHBOARD_PREVIEW_ENABLED_VALUE = "1";

/** Returns whether dashboard preview mode is enabled for a request/session. */
export function isDashboardPreviewModeEnabled(
  cookieValue: null | string | undefined,
): boolean {
  return cookieValue === DASHBOARD_PREVIEW_ENABLED_VALUE;
}

/** Resolves preview mode from the explicit explore query only. */
export function resolveDashboardPreviewMode(options: {
  hasExploreQuery: boolean;
}): boolean {
  return options.hasExploreQuery;
}

/** Writes or clears the legacy preview cookie for cleanup-only flows. */
export function setDashboardPreviewPersistence(enabled: boolean): void {
  if (typeof document === "undefined") {
    return;
  }

  const serializedCookie = enabled
    ? `${DASHBOARD_PREVIEW_COOKIE_NAME}=${DASHBOARD_PREVIEW_ENABLED_VALUE}; Path=/; Max-Age=${DASHBOARD_PREVIEW_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
    : `${DASHBOARD_PREVIEW_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;

  document.cookie = serializedCookie;
}
