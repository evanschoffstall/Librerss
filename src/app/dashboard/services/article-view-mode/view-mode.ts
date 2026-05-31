/**
 * Enumerates the collapsed article density modes supported by the dashboard.
 */
export type DashboardArticleViewMode = "card" | "compact";

/** Default collapsed article density used before persisted preferences hydrate. */
export const DEFAULT_DASHBOARD_ARTICLE_VIEW_MODE: DashboardArticleViewMode =
  "card";

/**
 * Build the visible menu label for the article view mode toggle.
 * @param current - The currently active article view mode.
 * @returns The visible menu item copy.
 */
export function getDashboardArticleViewModeMenuLabel(
  current: DashboardArticleViewMode,
): string {
  return current === "compact" ? "Card view" : "Compact view";
}

/**
 * Build the accessible toolbar label for the article view mode toggle.
 * @param current - The currently active article view mode.
 * @returns The label announced by assistive technology.
 */
export function getDashboardArticleViewModeToggleLabel(
  current: DashboardArticleViewMode,
): string {
  return current === "compact"
    ? "Switch article list to card view"
    : "Switch article list to compact view";
}

/**
 * Resolve the next dashboard article view mode after a toolbar toggle.
 * @param current - The currently active article view mode.
 * @returns The next article view mode.
 */
export function getNextDashboardArticleViewMode(
  current: DashboardArticleViewMode,
): DashboardArticleViewMode {
  return current === "compact" ? "card" : "compact";
}

/**
 * Normalize potentially stale persisted values into a supported dashboard
 * article view mode.
 * @param value - The untrusted persisted value.
 * @returns A supported article view mode.
 */
export function normalizeDashboardArticleViewMode(
  value: unknown,
): DashboardArticleViewMode {
  return value === "compact" ? "compact" : "card";
}
