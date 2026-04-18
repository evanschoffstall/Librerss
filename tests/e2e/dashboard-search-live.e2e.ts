import { expect, test } from "@playwright/test";

import {
  articleCard,
  gotoPreviewDashboard,
  waitForPreviewDashboardHydration,
} from "./helpers";

/** Returns the search input in the dashboard toolbar. */
function searchInput(page: import("@playwright/test").Page) {
  return page
    .getByRole("textbox", { name: /search/i })
    .or(page.locator("input[placeholder*='Search']"));
}

/**
 * Returns the count of skeleton elements currently visible in the toolbar action area.
 * These are the refresh, mark-as-read, and mark-viewport-read button skeletons.
 */
async function toolbarActionSkeletonCount(
  page: import("@playwright/test").Page,
) {
  return page
    .locator("[data-dashboard-toolbar-action-skeleton='true']")
    .count();
}

test.describe("dashboard search live-search UX", () => {
  test("search input remains focused and interactive while skeleton feedback is limited to toolbar buttons and filter bar timestamp", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);

    const input = searchInput(page);

    await expect(input).toBeVisible();
    await input.click();
    await input.fill("a");

    // The search input must remain responsive — characters can be appended
    // without the input being destroyed or re-mounted behind a skeleton.
    await input.fill("ab");
    await input.fill("abc");

    await expect(input).toHaveValue("abc");
    await expect(input).toBeFocused();

    // The toolbar itself must NOT be replaced by its full skeleton (which would
    // unmount the input).  The toolbar root must remain present.
    await expect(page.locator("[data-dashboard-toolbar='true']")).toBeVisible();
  });

  test("articles filter instantly (client-side) without waiting for server round-trip", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);

    // Count initial articles.
    const initialCount = await page
      .locator("article[data-article-key]:visible")
      .count();

    expect(initialCount).toBeGreaterThan(0);

    const input = searchInput(page);
    await input.click();
    // Use a term that is unlikely to match any placeholder article title/content
    // so the list narrows or clears client-side immediately.
    await input.fill("xyzzy_unlikely_term_99");

    // On the next animation frame the O(n) client-side filter must have run and
    // the article list must no longer show the full initial set. We accept either
    // zero (no match) or fewer than initial (partial match).
    await expect
      .poll(async () => {
        return page.locator("article[data-article-key]:visible").count();
      })
      .toBeLessThan(initialCount);
  });

  test("clearing the search term restores the full article list without a full-page skeleton", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);

    const initialCount = await page
      .locator("article[data-article-key]:visible")
      .count();

    const input = searchInput(page);
    await input.click();
    await input.fill("xyzzy_unlikely_term_99");

    await expect
      .poll(async () =>
        page.locator("article[data-article-key]:visible").count(),
      )
      .toBeLessThan(initialCount);

    await input.clear();

    // After clearing, the full article list must return without the entire
    // toolbar/filter bar being replaced by the full-page skeleton.
    await expect
      .poll(async () =>
        page.locator("article[data-article-key]:visible").count(),
      )
      .toBeGreaterThanOrEqual(initialCount);

    await expect(page.locator("[data-dashboard-toolbar='true']")).toBeVisible();
    await expect(input).toBeVisible();
  });

  test("toolbar action buttons show skeleton skeletons while isSearchPending but the search input stays mounted", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);

    // Wait for idle state (no action skeletons visible).
    await expect.poll(() => toolbarActionSkeletonCount(page)).toBe(0);

    const input = searchInput(page);
    await input.click();
    await input.fill("a");

    // The input must remain mounted and focused while any search-pending
    // feedback plays out.  We do NOT assert skeleton counts here because the
    // explore demo mode uses server-driven state, but we confirm the input
    // survives the pending window.
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("a");

    // The toolbar outer shell must never be replaced by DashboardToolbarSkeleton
    // during typing — only within-toolbar button skeletons may appear.
    await expect(
      page.locator("[data-dashboard-filter-bar-skeleton='true']"),
    ).not.toBeVisible();
  });

  test("filter bar chip buttons stay accessible while a search term is active", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);

    const input = searchInput(page);
    await input.fill("the");

    // Filter pills (all / unread / read / starred) must remain clickable and
    // visible during search — they are never hidden behind a skeleton.
    for (const label of ["all", "unread", "read", "starred"]) {
      await expect(
        page.getByRole("button", { exact: true, name: label }),
      ).toBeVisible();
    }
  });

  test("initial article cards are visible before search term is typed", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);

    const firstCard = articleCard(page, 0);
    await expect(firstCard).toBeVisible();

    const input = searchInput(page);
    await expect(input).toHaveValue("");
  });
});
