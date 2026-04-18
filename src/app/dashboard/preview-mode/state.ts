export const DASHBOARD_PREVIEW_COOKIE_NAME = "librerss_dashboard_preview";

const DASHBOARD_PREVIEW_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const DASHBOARD_PREVIEW_ENABLED_VALUE = "1";

interface DashboardPreviewModeOptions {
  hasExploreQuery: boolean;
}
/**
 * Return whether is dashboard preview mode enabled.
 * @param cookieValue - The cookie value.
 * @returns Whether is dashboard preview mode enabled.
 */
export function isDashboardPreviewModeEnabled(
  cookieValue: null | string | undefined,
): boolean {
  return cookieValue === DASHBOARD_PREVIEW_ENABLED_VALUE;
}

/**
 * Resolve the dashboard preview mode.
 * @param options - The options used to resolve the dashboard preview mode.
 * @returns Whether dashboard preview mode.
 */
export function resolveDashboardPreviewMode(
  options: DashboardPreviewModeOptions,
): boolean {
  return options.hasExploreQuery;
}

/**
 * Process the set dashboard preview persistence.
 * @param enabled - The enabled.
 */
export function setDashboardPreviewPersistence(enabled: boolean): void {
  if (typeof document === "undefined") {
    return;
  }

  const serializedCookie = enabled
    ? `${DASHBOARD_PREVIEW_COOKIE_NAME}=${DASHBOARD_PREVIEW_ENABLED_VALUE}; Path=/; Max-Age=${DASHBOARD_PREVIEW_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
    : `${DASHBOARD_PREVIEW_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;

  document.cookie = serializedCookie;
}
