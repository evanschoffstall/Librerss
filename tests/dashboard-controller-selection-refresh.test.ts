import { describe, expect, test } from "bun:test";

import { resolveDashboardSelectionRefreshArticleLimit } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardControllerCoordinator";

describe("dashboard controller selection refresh", () => {
  test("uses the reset page size instead of an expanded article window for filter and sort refreshes", () => {
    const expandedArticleWindowLimit = 120;
    const configuredArticlesPerPage = 12;

    expect(
      resolveDashboardSelectionRefreshArticleLimit({
        selectionArticleLimit: configuredArticlesPerPage,
      }),
    ).toBe(configuredArticlesPerPage);
    expect(
      resolveDashboardSelectionRefreshArticleLimit({
        selectionArticleLimit: configuredArticlesPerPage,
      }),
    ).not.toBe(expandedArticleWindowLimit);
  });
});
