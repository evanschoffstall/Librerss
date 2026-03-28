import type { Page } from "@playwright/test";

import {
  articleCard,
  gotoPreviewDashboard,
  openDashboardSettings,
  readFeedViewportMetrics,
  readRenderedArticleCount,
} from "./helpers";
import { expect, test } from "./test";

const MOBILE_INVERTED_SCROLL_STORAGE_KEY = "librerss:mobileInvertedScroll";

/** Reads the feed list surface data attribute indicating inverted scroll is active. */
async function readInvertedScrollAttribute(page: Page) {
  const feedSurface = page.locator("[data-feed-surface-mode]").first();
  return await feedSurface.getAttribute("data-inverted-scroll");
}

/** Measures the visible gap between the last rendered article and the viewport bottom edge. */
async function readLastArticleViewportGap(page: Page) {
  return await page.evaluate(() => {
    const viewport =
      [...document.querySelectorAll<HTMLElement>("[data-radix-scroll-area-viewport]")].find(
        (candidate) =>
          candidate.isConnected &&
          candidate.getBoundingClientRect().height > 0 &&
          candidate.getBoundingClientRect().width > 0 &&
          window.getComputedStyle(candidate).visibility !== "hidden" &&
          candidate.querySelector("article[data-article-key]") !== null,
      ) ?? null;

    if (!viewport) {
      throw new Error("Expected a feed viewport and at least one rendered article.");
    }

    const viewportBottom = viewport.getBoundingClientRect().bottom;
    const bottomVisibleArticle = [...document.querySelectorAll<HTMLElement>("article[data-article-key]")]
      .map((article) => ({
        bottom: article.getBoundingClientRect().bottom,
        top: article.getBoundingClientRect().top,
      }))
      .filter((article) => article.top < viewportBottom && article.bottom <= viewportBottom + 0.5)
      .reduce<null | { bottom: number; top: number }>((selected, candidate) => {
        if (!selected) {
          return candidate;
        }

        return candidate.bottom > selected.bottom ? candidate : selected;
      }, null);

    if (!bottomVisibleArticle) {
      throw new Error("Expected a bottommost visible article in the feed viewport.");
    }

    return Math.round((viewportBottom - bottomVisibleArticle.bottom) * 100) / 100;
  });
}

/** Injects a localStorage value before the app reads it. */
async function setLocalStoragePreference(
  page: Page,
  key: string,
  value: string,
) {
  await page.evaluate(
    ({ key: storageKey, value: storageValue }) => {
      window.localStorage.setItem(storageKey, storageValue);
    },
    { key, value },
  );
}

test.describe("dashboard mobile inverted scroll", () => {
  test("activates inverted scroll by default on mobile and anchors the feed at the bottom", async ({ page }) => {
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const invertedAttr = await readInvertedScrollAttribute(page);
    expect(invertedAttr).toBe("true");

    await expect
      .poll(async () => {
        return await readRenderedArticleCount(page);
      })
      .toBe(12);

    await expect
      .poll(async () => {
        const { clientHeight, scrollHeight, scrollTop } = await readFeedViewportMetrics(page);
        return Math.round(scrollHeight - (scrollTop + clientHeight));
      })
      .toBeLessThanOrEqual(2);

    await expect
      .poll(async () => {
        return await readLastArticleViewportGap(page);
      })
      .toBeLessThanOrEqual(1);
  });

  test("deactivates inverted scroll when the setting is turned off and keeps the feed at the top", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "unread" }).click();
    await expect(
      page.getByRole("button", { exact: true, name: "unread" }),
    ).toHaveAttribute("aria-pressed", "true");

    await setLocalStoragePreference(
      page,
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      "false",
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const invertedAttr = await readInvertedScrollAttribute(page);
    expect(invertedAttr).toBeNull();

    await expect
      .poll(async () => {
        const { scrollTop } = await readFeedViewportMetrics(page);
        return Math.round(scrollTop);
      })
      .toBeLessThanOrEqual(1);
  });

  test("displays the inverted scroll toggle in the display settings section", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    await openDashboardSettings(page);

    const invertedScrollSwitch = page.locator("#mobile-inverted-scroll");
    await expect(invertedScrollSwitch).toBeVisible();
    await expect(invertedScrollSwitch).toBeChecked();
  });

  test("toggling the setting off removes the inverted scroll attribute after reload", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    await openDashboardSettings(page);

    const invertedScrollSwitch = page.locator("#mobile-inverted-scroll");
    await expect(invertedScrollSwitch).toBeChecked();
    await invertedScrollSwitch.click();
    await expect(invertedScrollSwitch).not.toBeChecked();

    await page.keyboard.press("Escape");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    const invertedAttr = await readInvertedScrollAttribute(page);
    expect(invertedAttr).toBeNull();
  });

  test("renders article cards with a valid feed surface in inverted mode", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    const invertedAttr = await readInvertedScrollAttribute(page);
    expect(invertedAttr).toBe("true");

    const articleCount = await page.locator("article[data-article-key]").count();
    expect(articleCount).toBeGreaterThan(0);

    const feedMetrics = await readFeedViewportMetrics(page);
    expect(feedMetrics.scrollHeight).toBeGreaterThan(0);
    expect(feedMetrics.clientHeight).toBeGreaterThan(0);
  });
});
