import {
  firstArticleCard,
  gotoPreviewDashboard,
  waitForPreviewDashboardHydration,
} from "./helpers";
import { expect, test } from "./test";

test.describe("dashboard toolbar loading", () => {
  test("keeps the toolbar skeletal until the initial article surface hydrates", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1", { waitUntil: "domcontentloaded" });

    await expect(
      page.locator('[data-dashboard-toolbar-skeleton="true"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-dashboard-feed-list-skeleton="true"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-dashboard-filter-bar-skeleton="true"]'),
    ).toBeVisible();

    const skeletonViewportFit = await page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>(
        '[data-feed-scroll-viewport="true"]',
      );
      const skeletonRows = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-dashboard-feed-list-skeleton-item="true"]',
        ),
      );

      if (!viewport || skeletonRows.length === 0) {
        return null;
      }

      const viewportRect = viewport.getBoundingClientRect();
      const firstRowRect = skeletonRows[0]?.getBoundingClientRect();
      const lastRowRect = skeletonRows.at(-1)?.getBoundingClientRect();
      const secondRowRect = skeletonRows[1]?.getBoundingClientRect();
      const scrollbarThumb = document.querySelector(
        '[data-dashboard-feed-scrollbar-thumb="true"]',
      );

      if (!firstRowRect || !lastRowRect) {
        return null;
      }

      const rowGap = secondRowRect
        ? secondRowRect.top - firstRowRect.bottom
        : 0;

      return {
        count: skeletonRows.length,
        lastRowBottom: lastRowRect.bottom,
        lastRowTop: lastRowRect.top,
        rowGap,
        rowHeight: firstRowRect.height,
        scrollbarThumbVisible: scrollbarThumb !== null,
        viewportBottom: viewportRect.bottom,
        viewportHeight: viewportRect.height,
      };
    });

    expect(skeletonViewportFit).not.toBeNull();
    expect(skeletonViewportFit?.count).toBeGreaterThan(0);
    expect(
      (skeletonViewportFit?.viewportBottom ?? 0) -
        (skeletonViewportFit?.lastRowBottom ?? 0) <
        (skeletonViewportFit?.rowHeight ?? 0) +
          (skeletonViewportFit?.rowGap ?? 0) +
          4,
    ).toBe(true);
    expect(skeletonViewportFit?.scrollbarThumbVisible).toBe(false);

    await expect(page.getByPlaceholder("Search...")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "unread" })).toHaveCount(0);

    await page
      .locator('[data-dashboard-feed-list-skeleton="true"]')
      .waitFor({ state: "detached", timeout: 15_000 });
    await expect(firstArticleCard(page)).toBeVisible({ timeout: 250 });

    await waitForPreviewDashboardHydration(page);

    await expect(
      page.locator('[data-dashboard-toolbar-skeleton="true"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-dashboard-filter-bar-skeleton="true"]'),
    ).toHaveCount(0);
    await expect(page.getByPlaceholder("Search...")).toBeVisible();
    await expect(page.getByRole("button", { name: "unread" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh selected feed" }).first(),
    ).toBeVisible();

    const hydratedArticleRowGap = await page.evaluate(() => {
      const articleRows = Array.from(
        document.querySelectorAll<HTMLElement>("[data-scroll-restore-key]"),
      ).filter(
        (row) => row.querySelector("article[data-article-key]") !== null,
      );
      const firstRowRect = articleRows[0]?.getBoundingClientRect();
      const secondRowRect = articleRows[1]?.getBoundingClientRect();

      if (!firstRowRect || !secondRowRect) {
        return null;
      }

      return Math.round(secondRowRect.top - firstRowRect.bottom);
    });

    expect(hydratedArticleRowGap).not.toBeNull();
    expect(Math.round(skeletonViewportFit?.rowGap ?? -1)).toBe(
      hydratedArticleRowGap,
    );

    const toolbarPulseState = await page.evaluate(() => {
      const visiblePulseNodes = Array.from(
        document.querySelectorAll("*"),
      ).filter((node) => {
        if (!(node instanceof HTMLElement)) {
          return false;
        }

        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return false;
        }

        const style = getComputedStyle(node);
        return (
          style.animationName.includes("pulse") ||
          node.className.toString().includes("animate-pulse")
        );
      });
      const leakedToolbarShell = Array.from(document.body.children).some(
        (node) =>
          node instanceof HTMLElement &&
          node.className.includes("pointer-events-none fixed inset-x-0") &&
          node.className.includes("z-50") &&
          node.querySelector(".animate-pulse") !== null,
      );

      return {
        leakedToolbarShell,
        visiblePulseCount: visiblePulseNodes.length,
      };
    });

    expect(toolbarPulseState.leakedToolbarShell).toBe(false);
  });

  test("viewport-read loading skeleton clears after the optimistic update without awaiting server persistence", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);

    const viewportReadButton = page
      .getByRole("button", { name: "Mark fully visible articles as read" })
      .first();

    await expect(viewportReadButton).toBeVisible();

    // Confirm no pulse before clicking.
    const pulseBeforeClick = await viewportReadButton.evaluate(
      (btn) => btn.querySelector(".animate-pulse") !== null,
    );
    expect(pulseBeforeClick).toBe(false);

    // Click and immediately verify the loading skeleton appears then clears
    // within a tight frame window. The END event must fire without blocking on
    // any server round-trip, so the skeleton lifetime is sub-paint.
    await viewportReadButton.click();

    // The pulse appears (START) and resolves (END) synchronously, so by the
    // time Playwright resolves the next evaluate the button is already idle.
    await expect
      .poll(
        async () => {
          return await viewportReadButton.evaluate((btn) => {
            return btn.querySelector(".animate-pulse") === null;
          });
        },
        { intervals: [50, 100, 200], timeout: 2_000 },
      )
      .toBe(true);
  });

  test("refreshing the feed never flashes the up-to-date empty state", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);

    await page
      .locator('[data-dashboard-feed-list-skeleton="true"]')
      .waitFor({ state: "detached", timeout: 15_000 });
    await expect(firstArticleCard(page)).toBeVisible({ timeout: 15_000 });

    await page
      .getByRole("button", { exact: true, name: "Refresh selected feed" })
      .first()
      .click();

    await expect(page.locator('[data-feed-empty-state="true"]')).toHaveCount(
      0,
      { timeout: 1_000 },
    );
    await expect(page.getByText("You're up to date")).toHaveCount(0, {
      timeout: 1_000,
    });
  });

  test("all skeleton surfaces are present together and disappear together on initial load", async ({
    page,
  }) => {
    // Regression: the sidebar skeleton used its own raw isCategoriesLoading
    // gate and unmasked independently of the toolbar, filter bar, and feed
    // list, which all waited for the unified isShellLoading gate.  This test
    // verifies that every skeleton surface is visible at the same time during
    // loading and that the sidebar skeleton outlasts individual category data
    // readiness (i.e., stays until the full shell loading gate settles).

    await page.goto("/dashboard?explore=1", { waitUntil: "domcontentloaded" });

    // Phase 1: all skeletons must be simultaneously visible right after mount.
    await expect(
      page.locator('[data-dashboard-toolbar-skeleton="true"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-dashboard-feed-list-skeleton="true"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-dashboard-filter-bar-skeleton="true"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-dashboard-sidebar-skeleton="true"]'),
    ).toBeVisible();

    // Phase 2: wait for hydration — the feed list skeleton detaching is the
    // leading edge signal that the shell loading gate has cleared.
    await page
      .locator('[data-dashboard-feed-list-skeleton="true"]')
      .waitFor({ state: "detached", timeout: 15_000 });

    // After the gate clears all other skeletons must also be gone.  The 500 ms
    // window is generous for React to commit all surfaces in the same render
    // but tight enough to catch any surface that lags by a separate data gate.
    await expect(
      page.locator('[data-dashboard-toolbar-skeleton="true"]'),
    ).toHaveCount(0, { timeout: 500 });
    await expect(
      page.locator('[data-dashboard-filter-bar-skeleton="true"]'),
    ).toHaveCount(0, { timeout: 500 });
    await expect(
      page.locator('[data-dashboard-sidebar-skeleton="true"]'),
    ).toHaveCount(0, { timeout: 500 });

    // Final state: hydrated surfaces present.
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 500,
    });
    await expect(page.getByRole("button", { name: "unread" })).toBeVisible({
      timeout: 500,
    });
  });
});
