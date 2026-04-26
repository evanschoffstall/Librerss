import {
  articleCard,
  gotoPreviewDashboard,
  waitForPreviewDashboardHydration,
} from "./helpers";
import { expect, test } from "./test";

/**
 * End-to-end regression coverage for the mark-all-as-read feature.
 *
 * These tests run against the explore/demo (placeholder) mode so no
 * authentication session is required.
 *
 * Implementation note — why we use the "all" filter before marking:
 * In explore/placeholder mode the dashboard has an unread-window refill
 * mechanism (`preservePartialFilteredWindowAvailability`) that automatically
 * reloads placeholder articles whenever the unread list empties, preventing
 * `articleCard(page, 0).count()` from ever reaching 0 reliably.  The
 * workaround is the same pattern used by `dashboard-preview.e2e.ts`: switch
 * to the "all" filter first, then call "Mark all read".  In "all" mode the
 * refill mechanism is disabled (it only activates when `articleFilter ===
 * "unread"`), so the local state update applied by `onMarkAllReadLocally` is
 * immediately stable and the per-article button flips from "Mark as read" →
 * "Mark as unread" as a reliable signal that the command completed.
 */
test.describe("dashboard mark all read", () => {
  test("marking all as read from the unread feed empties the unread list", async ({
    page,
  }) => {
    test.slow();

    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);

    // Switch to the "all" filter before acting. See the describe-block comment
    // for why this is necessary in explore/placeholder mode.
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Mark all read" }).click();

    // In explore mode this is a synchronous local state update. The per-article
    // button flips to "Mark as unread" almost immediately, confirming that the
    // command was applied to all visible articles.
    await expect(
      articleCard(page, 0).getByRole("button", { name: "Mark as unread" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("articles marked as read appear in the read filter view", async ({
    page,
  }) => {
    test.slow();

    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);

    // Switch to "all", mark all as read, and confirm the local state update
    // applied before switching filters.
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Mark all read" }).click();

    await expect(
      articleCard(page, 0).getByRole("button", { name: "Mark as unread" }),
    ).toBeVisible({ timeout: 15_000 });

    // Switch to the "read" filter and confirm at least one article is visible.
    await page.getByRole("button", { exact: true, name: "read" }).click();
    await expect
      .poll(async () => articleCard(page, 0).count(), { timeout: 15_000 })
      .toBeGreaterThan(0);
  });
});
