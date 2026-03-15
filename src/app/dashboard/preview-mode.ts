export const DASHBOARD_PREVIEW_COOKIE_NAME = "librerss_dashboard_preview";
export const DASHBOARD_PREVIEW_STORAGE_KEY = "librerss:dashboardPreviewMode";

const DASHBOARD_PREVIEW_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const DASHBOARD_PREVIEW_ENABLED_VALUE = "1";

/** Returns whether dashboard preview mode is enabled for a request/session. */
export function isDashboardPreviewModeEnabled(
  cookieValue: null | string | undefined,
): boolean {
  return cookieValue === DASHBOARD_PREVIEW_ENABLED_VALUE;
}

/** Resolves preview mode from either the URL or persisted browser state. */
export function resolveDashboardPreviewMode(options: {
  cookieValue: null | string | undefined;
  hasPreviewQuery: boolean;
}): boolean {
  return (
    options.hasPreviewQuery ||
    isDashboardPreviewModeEnabled(options.cookieValue)
  );
}

/** Persists dashboard preview mode so reloads remain on the local-only path. */
export function setDashboardPreviewPersistence(enabled: boolean): void {
  if (typeof document === "undefined") {
    return;
  }

  const serializedCookie = enabled
    ? `${DASHBOARD_PREVIEW_COOKIE_NAME}=${DASHBOARD_PREVIEW_ENABLED_VALUE}; Path=/; Max-Age=${DASHBOARD_PREVIEW_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
    : `${DASHBOARD_PREVIEW_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;

  document.cookie = serializedCookie;
}
