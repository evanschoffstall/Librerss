import {
  articleCard,
  expectArticleExpanded,
  gotoPreviewDashboard,
  openDashboardSettingsTab,
  waitForPreviewDashboardHydration,
} from "./helpers";
import { expect, test } from "./test";

type DashboardPage = Parameters<typeof gotoPreviewDashboard>[0];

/** Returns the dashboard feed's measured custom scrollbar overflow gate. */
async function hasDashboardFeedScrollbarOverflow(page: DashboardPage) {
  return await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(
      '[data-feed-scroll-viewport="true"]',
    );

    if (!viewport) {
      throw new Error("Expected the dashboard feed viewport.");
    }

    return viewport.dataset.dashboardFeedScrollbarOverflow === "true";
  });
}

async function installTransientPaginationSkeletonFixture(page: DashboardPage) {
  await page.evaluate(async () => {
    const viewport = document.querySelector<HTMLElement>(
      '[data-feed-scroll-viewport="true"]',
    );
    const feedSurface = viewport?.querySelector<HTMLElement>(
      "[data-feed-surface-mode]",
    );

    if (!viewport || !feedSurface) {
      throw new Error("Expected the hydrated dashboard feed surface.");
    }

    const committedHeight = Math.max(viewport.clientHeight + 900, 1800);
    const transientLiveHeight = committedHeight + 900;
    const committedMaxScrollTop = committedHeight - viewport.clientHeight;

    feedSurface.dataset.feedLoadMoreSkeletonsVisible = "true";
    feedSurface.dataset.feedTotalListHeight = String(committedHeight);
    feedSurface.style.height = `${transientLiveHeight}px`;
    feedSurface.style.minHeight = `${transientLiveHeight}px`;
    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });
    viewport.scrollTop = committedMaxScrollTop;
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

/** Returns whether the dashboard feed's custom shadcn-style rail is visually exposed. */
async function isDashboardFeedScrollbarVisible(page: DashboardPage) {
  return await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(
      '[data-feed-scroll-viewport="true"]',
    );
    const scrollbar = viewport?.nextElementSibling as HTMLElement | null;

    if (!viewport || !scrollbar) {
      throw new Error("Expected the dashboard feed scrollbar overlay.");
    }

    return Number.parseFloat(getComputedStyle(scrollbar).opacity) > 0.95;
  });
}

/** Returns whether the settings dialog's Radix scrollbar is visually exposed. */
async function isSettingsRadixScrollbarVisible(page: DashboardPage) {
  return await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const viewport = dialog?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    const scrollbar = Array.from(viewport?.parentElement?.children ?? []).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        child.dataset.orientation === "vertical",
    );

    if (!viewport || !scrollbar) {
      return false;
    }

    return Number.parseFloat(getComputedStyle(scrollbar).opacity) > 0.95;
  });
}

async function readFeedScrollbarState(page: DashboardPage) {
  return await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(
      '[data-feed-scroll-viewport="true"]',
    );
    const thumb = document.querySelector<HTMLElement>(
      '[data-dashboard-feed-scrollbar-thumb="true"]',
    );

    if (!viewport || !thumb) {
      throw new Error("Expected the feed viewport and scrollbar thumb.");
    }

    return {
      hasTransientPaginationSkeletons:
        viewport.querySelector<HTMLElement>("[data-feed-surface-mode]")?.dataset
          .feedLoadMoreSkeletonsVisible === "true",
      thumbHeight: Number.parseFloat(thumb.style.height || "0"),
      thumbOffsetTop: Number.parseFloat(
        thumb.style.transform.match(/translateY\(([-\d.]+)px\)/u)?.[1] ?? "0",
      ),
      totalListHeight: Number.parseFloat(
        viewport.querySelector<HTMLElement>("[data-feed-total-list-height]")
          ?.dataset.feedTotalListHeight ?? "0",
      ),
      viewportClientHeight: viewport.clientHeight,
      viewportScrollHeight: viewport.scrollHeight,
    };
  });
}

/** Returns the settings dialog ScrollArea root so pointer hover targets the owning surface. */
function settingsScrollAreaRoot(page: DashboardPage) {
  return page
    .getByRole("dialog", { name: "Reader Settings" })
    .locator("[data-radix-scroll-area-viewport]")
    .locator("xpath=..");
}

test.describe("dashboard feed scrollbar", () => {
  test("only reveals the dashboard feed overlay scrollbar while the feed ScrollArea is hovered", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    const feedScrollAreaRoot = page
      .locator('[data-feed-scroll-viewport="true"]')
      .locator("xpath=..");

    await page.mouse.move(1, 1);
    await expect
      .poll(async () => await isDashboardFeedScrollbarVisible(page))
      .toBe(false);

    await feedScrollAreaRoot.hover();
    await expect
      .poll(async () => await isDashboardFeedScrollbarVisible(page))
      .toBe(true);

    await page.mouse.move(1, 1);
    await expect
      .poll(async () => await isDashboardFeedScrollbarVisible(page))
      .toBe(false);
  });

  test("does not reveal the dashboard feed overlay scrollbar without clipped content", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);

    await page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>(
        '[data-feed-scroll-viewport="true"]',
      );

      if (!viewport) {
        throw new Error("Expected the dashboard feed viewport.");
      }

      viewport.replaceChildren();
    });

    await expect
      .poll(async () => await hasDashboardFeedScrollbarOverflow(page))
      .toBe(false);

    const feedScrollAreaRoot = page
      .locator('[data-feed-scroll-viewport="true"]')
      .locator("xpath=..");

    await feedScrollAreaRoot.hover();
    await expect
      .poll(async () => await isDashboardFeedScrollbarVisible(page))
      .toBe(false);
  });

  test("only reveals Radix shadcn scrollbars while their ScrollArea is hovered", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);
    await openDashboardSettingsTab(page, "Feeds");

    const scrollAreaRoot = settingsScrollAreaRoot(page);
    await expect(scrollAreaRoot).toBeVisible();

    await page.mouse.move(1, 1);
    await expect
      .poll(async () => await isSettingsRadixScrollbarVisible(page))
      .toBe(false);

    await scrollAreaRoot.hover();
    await expect
      .poll(async () => await isSettingsRadixScrollbarVisible(page))
      .toBe(true);

    await page.mouse.move(1, 1);
    await expect
      .poll(async () => await isSettingsRadixScrollbarVisible(page))
      .toBe(false);
  });

  test("shrinks the overlay thumb after article expansion increases the live scroll range", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const article = articleCard(page, 0);
    await expect(article).toBeVisible({ timeout: 15_000 });

    const initialState = await readFeedScrollbarState(page);
    expect(initialState.thumbHeight).toBeGreaterThan(0);
    expect(initialState.viewportScrollHeight).toBeGreaterThan(
      initialState.viewportClientHeight,
    );

    await article.click();
    await expectArticleExpanded(article, true);
    await expect
      .poll(async () => {
        return await article
          .locator('[data-article-hydration-state="loading"]')
          .count();
      })
      .toBe(0);

    await expect
      .poll(async () => {
        const nextState = await readFeedScrollbarState(page);

        return {
          thumbHeight: nextState.thumbHeight,
          viewportScrollHeight: nextState.viewportScrollHeight,
        };
      })
      .toMatchObject({
        thumbHeight: expect.any(Number),
        viewportScrollHeight: expect.any(Number),
      });

    const expandedState = await readFeedScrollbarState(page);

    expect(expandedState.viewportScrollHeight).toBeGreaterThan(
      initialState.viewportScrollHeight,
    );
    expect(expandedState.thumbHeight).toBeLessThan(initialState.thumbHeight);
  });

  test("keeps the overlay thumb pinned while pagination skeletons temporarily inflate scrollHeight", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    await installTransientPaginationSkeletonFixture(page);

    await expect
      .poll(async () => {
        const state = await readFeedScrollbarState(page);
        const trackBottom = state.viewportClientHeight - state.thumbHeight;

        return {
          hasTransientPaginationSkeletons:
            state.hasTransientPaginationSkeletons,
          isPinnedToCommittedBottom:
            Math.abs(state.thumbOffsetTop - trackBottom) <= 1,
          liveScrollHeightExceedsCommittedHeight:
            state.viewportScrollHeight > state.totalListHeight,
        };
      })
      .toEqual({
        hasTransientPaginationSkeletons: true,
        isPinnedToCommittedBottom: true,
        liveScrollHeightExceedsCommittedHeight: true,
      });
  });
});
