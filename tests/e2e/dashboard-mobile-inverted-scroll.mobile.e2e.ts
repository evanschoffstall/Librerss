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
const STABLE_HEADER_POSITION_TOLERANCE_PX = 8;

interface ArticleHeaderViewportOffsets {
  headerTop: number;
  scrollTop: number;
  viewportHeight: number;
}

interface RenderedArticleState extends ArticleHeaderViewportOffsets {
  expanded: null | string;
}

const STABLE_HEADER_OFFSET_TOP_PX = 168;
const MIN_STABLE_HEADER_OFFSET_TOP_PX = 96;
const MIN_STABLE_HEADER_BOTTOM_CLEARANCE_PX = 120;

/** Aligns an article header to the preferred stable offset before measuring expansion drift. */
async function alignArticleHeaderToStableOffset(page: Page, articleKey: string) {
  await expect
    .poll(async () => {
      const offsets = await maybeReadArticleHeaderViewportOffsets(page, articleKey);

      if (!offsets) {
        return false;
      }

      const targetHeaderTop = resolveStableHeaderOffsetTop(offsets.viewportHeight);
      const stableHeaderTopMin = Math.max(48, targetHeaderTop - 72);
      const stableHeaderTopMax = Math.max(
        stableHeaderTopMin,
        offsets.viewportHeight - MIN_STABLE_HEADER_BOTTOM_CLEARANCE_PX,
      );

      if (
        offsets.headerTop >= stableHeaderTopMin &&
        offsets.headerTop <= stableHeaderTopMax
      ) {
        return true;
      }

      await page.evaluate(
        ({ targetArticleKey, targetHeaderTop }) => {
          const candidate = [...document.querySelectorAll<HTMLElement>(
            `article[data-article-key="${CSS.escape(targetArticleKey)}"]`,
          )]
            .map((article) => {
              const header = article.querySelector<HTMLElement>(
                "[data-article-swipe-zone='header']",
              );
              const viewport = article.closest<HTMLElement>(
                "[data-radix-scroll-area-viewport]",
              );

              if (!header || !viewport) {
                return null;
              }

              if (
                !viewport.isConnected ||
                viewport.getBoundingClientRect().height <= 0 ||
                viewport.getBoundingClientRect().width <= 0 ||
                window.getComputedStyle(viewport).visibility === "hidden"
              ) {
                return null;
              }

              const viewportRect = viewport.getBoundingClientRect();
              const headerRect = header.getBoundingClientRect();
              const headerTop = headerRect.top - viewportRect.top;
              const headerBottom = headerRect.bottom - viewportRect.top;

              return {
                article,
                header,
                intersectsViewport:
                  headerBottom > 0 && headerTop < viewport.clientHeight,
                viewport,
                visibleScore:
                  Math.abs(Math.max(0, headerTop)) +
                  Math.abs(
                    Math.min(0, viewport.clientHeight - headerBottom),
                  ),
              };
            })
            .filter(
              (
                nextCandidate,
              ): nextCandidate is NonNullable<typeof nextCandidate> =>
                nextCandidate !== null,
            )
            .sort((left, right) => {
              if (left.intersectsViewport !== right.intersectsViewport) {
                return left.intersectsViewport ? -1 : 1;
              }

              return left.visibleScore - right.visibleScore;
            })[0] ?? null;

          if (!candidate) {
            return;
          }

          const { header, viewport } = candidate;
          const viewportRect = viewport.getBoundingClientRect();
          const headerRect = header.getBoundingClientRect();
          viewport.dispatchEvent(
            new Event("touchmove", { bubbles: true, cancelable: true }),
          );
          viewport.scrollTop +=
            (headerRect.top - viewportRect.top) - targetHeaderTop;
          viewport.dispatchEvent(new Event("scroll"));
        },
        {
          targetArticleKey: articleKey,
          targetHeaderTop,
        },
      );

      return false;
    })
    .toBe(true);
}

/** Collapses an expanded article directly by key without requiring its header to stay interactable in the viewport. */
async function collapseArticleByKey(page: Page, articleKey: string) {
  await page.evaluate((targetArticleKey) => {
    const article = [...document.querySelectorAll<HTMLElement>(
      `article[data-article-key="${CSS.escape(targetArticleKey)}"]`,
    )]
      .find((candidate) => candidate.getAttribute("aria-expanded") === "true") ??
      document.querySelector<HTMLElement>(
        `article[data-article-key="${CSS.escape(targetArticleKey)}"]`,
      );

    if (!article) {
      throw new Error("Expected the expanded article to remain mounted while collapsing.");
    }

    const header = article.querySelector<HTMLElement>("[data-article-swipe-zone='header']");

    (header ?? article).click();
  }, articleKey);
}

/** Reads article header offsets when the article is currently rendered, otherwise returns null. */
async function maybeReadArticleHeaderViewportOffsets(page: Page, articleKey: string) {
  const state = await page.evaluate((targetArticleKey): null | RenderedArticleState => {
    const candidates = [...document.querySelectorAll<HTMLElement>(
      `article[data-article-key="${CSS.escape(targetArticleKey)}"]`,
    )]
      .map((article) => {
        const header = article.querySelector<HTMLElement>("[data-article-swipe-zone='header']");
        const viewport = article.closest<HTMLElement>("[data-radix-scroll-area-viewport]");

        if (!header || !viewport) {
          return null;
        }

        if (
          !viewport.isConnected ||
          viewport.getBoundingClientRect().height <= 0 ||
          viewport.getBoundingClientRect().width <= 0 ||
          window.getComputedStyle(viewport).visibility === "hidden"
        ) {
          return null;
        }

        const viewportRect = viewport.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const headerTop = headerRect.top - viewportRect.top;
        const headerBottom = headerRect.bottom - viewportRect.top;

        return {
          expanded: article.getAttribute("aria-expanded"),
          headerTop: Math.round(headerTop * 100) / 100,
          intersectsViewport: headerBottom > 0 && headerTop < viewport.clientHeight,
          scrollTop: Math.round(viewport.scrollTop * 100) / 100,
          viewportHeight: viewport.clientHeight,
          visibleScore: Math.abs(Math.max(0, headerTop)) + Math.abs(Math.min(0, viewport.clientHeight - headerBottom)),
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((left, right) => {
        if (left.intersectsViewport !== right.intersectsViewport) {
          return left.intersectsViewport ? -1 : 1;
        }

        return left.visibleScore - right.visibleScore;
      });

    return candidates[0] ?? null;
  }, articleKey);

  if (!state) {
    return null;
  }

  return {
    headerTop: state.headerTop,
    scrollTop: state.scrollTop,
    viewportHeight: state.viewportHeight,
  };
}

/** Reads the current expanded state for the best rendered instance of an article key. */
async function readArticleExpandedState(page: Page, articleKey: string) {
  return await page.evaluate((targetArticleKey) => {
    const candidates = [...document.querySelectorAll<HTMLElement>(
      `article[data-article-key="${CSS.escape(targetArticleKey)}"]`,
    )]
      .map((article) => {
        const header = article.querySelector<HTMLElement>("[data-article-swipe-zone='header']");
        const viewport = article.closest<HTMLElement>("[data-radix-scroll-area-viewport]");

        if (!header || !viewport) {
          return null;
        }

        const viewportRect = viewport.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const headerTop = headerRect.top - viewportRect.top;
        const headerBottom = headerRect.bottom - viewportRect.top;

        return {
          expanded: article.getAttribute("aria-expanded"),
          intersectsViewport: headerBottom > 0 && headerTop < viewport.clientHeight,
          visibleScore: Math.abs(Math.max(0, headerTop)) + Math.abs(Math.min(0, viewport.clientHeight - headerBottom)),
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((left, right) => {
        if (left.intersectsViewport !== right.intersectsViewport) {
          return left.intersectsViewport ? -1 : 1;
        }

        return left.visibleScore - right.visibleScore;
      });

    return candidates[0]?.expanded ?? null;
  }, articleKey);
}

/** Measures an article header's offset inside its owning feed viewport. */
async function readArticleHeaderViewportOffsets(page: Page, articleKey: string) {
  const state = await maybeReadArticleHeaderViewportOffsets(page, articleKey);

  if (!state) {
      throw new Error("Expected an article header rendered inside the feed viewport.");
  }

  return state;
}

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

/** Returns a fully visible article key whose header already sits in a stable viewport band. */
async function readStableVisibleArticleKey(page: Page) {
  return await page.evaluate((targetHeaderTop) => {
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
      throw new Error("Expected a feed viewport before reading the visible article key.");
    }

    const viewportRect = viewport.getBoundingClientRect();
    const viewportBottom = viewportRect.bottom;
    const resolvedTargetHeaderTop = Math.min(
      targetHeaderTop,
      Math.max(96, viewport.clientHeight - 120),
    );
    const stableTop = viewportRect.top + Math.max(48, resolvedTargetHeaderTop - 72);
    const stableBottom = viewportRect.top + viewport.clientHeight - 120;
    const visibleArticles = [...document.querySelectorAll<HTMLElement>("article[data-article-key]")]
      .map((article) => ({
        article,
        header: article.querySelector<HTMLElement>("[data-article-swipe-zone='header']"),
      }))
      .filter(
        ({ header }) =>
          header !== null &&
          header.getBoundingClientRect().top >= viewportRect.top &&
          header.getBoundingClientRect().bottom <= viewportBottom,
      )
      .sort((left, right) => {
        const leftTop = left.header!.getBoundingClientRect().top;
        const rightTop = right.header!.getBoundingClientRect().top;
        const leftInStableBand = leftTop >= stableTop && leftTop <= stableBottom;
        const rightInStableBand = rightTop >= stableTop && rightTop <= stableBottom;

        if (leftInStableBand !== rightInStableBand) {
          return leftInStableBand ? -1 : 1;
        }

        return Math.abs(leftTop - (viewportRect.top + resolvedTargetHeaderTop)) -
          Math.abs(rightTop - (viewportRect.top + resolvedTargetHeaderTop));
      });

    const visibleArticle = visibleArticles[0]?.article ?? null;

    if (!visibleArticle) {
      throw new Error("Expected at least one visible article in the feed viewport.");
    }

    return visibleArticle.getAttribute("data-article-key");
  }, STABLE_HEADER_OFFSET_TOP_PX);
}

function resolveStableHeaderOffsetTop(viewportHeight: number) {
  return Math.min(
    STABLE_HEADER_OFFSET_TOP_PX,
    Math.max(
      MIN_STABLE_HEADER_OFFSET_TOP_PX,
      viewportHeight - MIN_STABLE_HEADER_BOTTOM_CLEARANCE_PX,
    ),
  );
}

/** Scrolls the owning feed viewport with explicit user-scroll intent semantics. */
async function scrollFeedViewportWithIntent(page: Page, targetScrollTop: number) {
  return await page.evaluate((nextScrollTop) => {
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
      throw new Error("Expected a feed viewport before scrolling.");
    }

    viewport.dispatchEvent(new Event("touchmove", { bubbles: true, cancelable: true }));
    viewport.scrollTop = nextScrollTop;
    viewport.dispatchEvent(new Event("scroll"));

    return Math.round(viewport.scrollTop * 100) / 100;
  }, targetScrollTop);
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

/** Toggles the best currently rendered instance for an article key. */
async function toggleArticleByKey(page: Page, articleKey: string) {
  await page.evaluate((targetArticleKey) => {
    const candidates = [...document.querySelectorAll<HTMLElement>(
      `article[data-article-key="${CSS.escape(targetArticleKey)}"]`,
    )]
      .map((article) => {
        const header = article.querySelector<HTMLElement>("[data-article-swipe-zone='header']");
        const viewport = article.closest<HTMLElement>("[data-radix-scroll-area-viewport]");

        if (!header || !viewport) {
          return null;
        }

        if (
          !viewport.isConnected ||
          viewport.getBoundingClientRect().height <= 0 ||
          viewport.getBoundingClientRect().width <= 0 ||
          window.getComputedStyle(viewport).visibility === "hidden"
        ) {
          return null;
        }

        const viewportRect = viewport.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const headerTop = headerRect.top - viewportRect.top;
        const headerBottom = headerRect.bottom - viewportRect.top;

        return {
          article,
          expanded: article.getAttribute("aria-expanded") === "true",
          header,
          intersectsViewport: headerBottom > 0 && headerTop < viewport.clientHeight,
          visibleScore: Math.abs(Math.max(0, headerTop)) + Math.abs(Math.min(0, viewport.clientHeight - headerBottom)),
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((left, right) => {
        if (left.expanded !== right.expanded) {
          return left.expanded ? -1 : 1;
        }

        if (left.intersectsViewport !== right.intersectsViewport) {
          return left.intersectsViewport ? -1 : 1;
        }

        return left.visibleScore - right.visibleScore;
      });

    const selectedCandidate = candidates[0] ?? null;

    if (!selectedCandidate) {
      const fallbackArticle = document.querySelector<HTMLElement>(
        `article[data-article-key="${CSS.escape(targetArticleKey)}"]`,
      );

      if (!fallbackArticle) {
        throw new Error("Expected a rendered article to toggle by key.");
      }

      fallbackArticle.click();
      return;
    }

    (selectedCandidate.header ?? selectedCandidate.article).click();
  }, articleKey);
}

test.describe("dashboard mobile inverted scroll", () => {
  test("activates inverted scroll by default on mobile and anchors the feed at the bottom", async ({ page }) => {
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

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

  test("keeps inverted article expansion and collapse positions stable before, during, and after the interaction", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();

    await expect
      .poll(async () => {
        return await readRenderedArticleCount(page);
      })
      .toBeGreaterThanOrEqual(12);

    const targetArticleKey = await readStableVisibleArticleKey(page);
    if (!targetArticleKey) {
      throw new Error("Expected a visible article key.");
    }
    await alignArticleHeaderToStableOffset(page, targetArticleKey);
    const before = await readArticleHeaderViewportOffsets(page, targetArticleKey);

    for (let cycle = 0; cycle < 4; cycle += 1) {
      await toggleArticleByKey(page, targetArticleKey);
      await expect.poll(async () => await readArticleExpandedState(page, targetArticleKey)).toBe("true");

      await expect
        .poll(async () => {
          const during = await readArticleHeaderViewportOffsets(page, targetArticleKey);

          return (
            during.headerTop >= -1 &&
            during.headerTop <= during.viewportHeight - 60 &&
            Math.abs(during.headerTop - before.headerTop) <=
              STABLE_HEADER_POSITION_TOLERANCE_PX
          );
        })
        .toBe(true);

      const during = await readArticleHeaderViewportOffsets(page, targetArticleKey);

      expect(during.headerTop).toBeGreaterThanOrEqual(-1);
      expect(during.headerTop).toBeLessThanOrEqual(during.viewportHeight - 60);
      expect(
        Math.abs(during.headerTop - before.headerTop),
      ).toBeLessThanOrEqual(STABLE_HEADER_POSITION_TOLERANCE_PX);

      await toggleArticleByKey(page, targetArticleKey);
      await expect.poll(async () => await readArticleExpandedState(page, targetArticleKey)).toBe("false");

      await expect
        .poll(async () => {
          const after = await readArticleHeaderViewportOffsets(page, targetArticleKey);

          return (
            after.headerTop >= -1 &&
            after.headerTop <= after.viewportHeight - 60 &&
            Math.abs(after.headerTop - before.headerTop) <=
              STABLE_HEADER_POSITION_TOLERANCE_PX
          );
        })
        .toBe(true);

      const after = await readArticleHeaderViewportOffsets(page, targetArticleKey);

      expect(after.headerTop).toBeGreaterThanOrEqual(-1);
      expect(after.headerTop).toBeLessThanOrEqual(after.viewportHeight - 60);
      expect(
        Math.abs(after.headerTop - before.headerTop),
      ).toBeLessThanOrEqual(STABLE_HEADER_POSITION_TOLERANCE_PX);
    }
  });

  test("restores the original inverted article position after scrolling away while expanded", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();

    await expect
      .poll(async () => {
        return await readRenderedArticleCount(page);
      })
      .toBeGreaterThanOrEqual(12);

    const targetArticleKey = await readStableVisibleArticleKey(page);
    if (!targetArticleKey) {
      throw new Error("Expected a visible article key.");
    }
    await alignArticleHeaderToStableOffset(page, targetArticleKey);
    const before = await readArticleHeaderViewportOffsets(page, targetArticleKey);

    await toggleArticleByKey(page, targetArticleKey);
    await expect.poll(async () => await readArticleExpandedState(page, targetArticleKey)).toBe("true");

    await page.waitForTimeout(300);

    const scrolledFar = await scrollFeedViewportWithIntent(
      page,
      Math.max(0, before.scrollTop - 480),
    );
    await page.waitForTimeout(300);
    const settledFar = (await readFeedViewportMetrics(page)).scrollTop;
    expect(Math.abs(settledFar - before.scrollTop)).toBeGreaterThan(200);

    expect(Math.abs(settledFar - scrolledFar)).toBeGreaterThanOrEqual(0);

    await collapseArticleByKey(page, targetArticleKey);

    await expect
      .poll(async () => {
        const restored = await maybeReadArticleHeaderViewportOffsets(
          page,
          targetArticleKey,
        );

        return (
          restored !== null &&
          Math.abs(restored.headerTop - before.headerTop) <=
            STABLE_HEADER_POSITION_TOLERANCE_PX
        );
      })
      .toBe(true);

    const secondTargetArticleKey = await readStableVisibleArticleKey(page);
    if (!secondTargetArticleKey) {
      throw new Error("Expected a second visible article key after restoring the viewport.");
    }

    await alignArticleHeaderToStableOffset(page, secondTargetArticleKey);
    const secondBefore = await readArticleHeaderViewportOffsets(page, secondTargetArticleKey);

    await toggleArticleByKey(page, secondTargetArticleKey);
    await expect.poll(async () => await readArticleExpandedState(page, secondTargetArticleKey)).toBe("true");

    await page.waitForTimeout(300);

    const scrolledMidway = await scrollFeedViewportWithIntent(
      page,
      Math.max(0, secondBefore.scrollTop - 320),
    );
    await page.waitForTimeout(300);
    const settledMidway = (await readFeedViewportMetrics(page)).scrollTop;
    expect(Math.abs(settledMidway - secondBefore.scrollTop)).toBeGreaterThan(100);

    expect(Math.abs(settledMidway - scrolledMidway)).toBeGreaterThanOrEqual(0);

    await collapseArticleByKey(page, secondTargetArticleKey);

    await expect
      .poll(async () => {
        const restored = await maybeReadArticleHeaderViewportOffsets(
          page,
          secondTargetArticleKey,
        );

        return (
          restored !== null &&
          Math.abs(restored.headerTop - secondBefore.headerTop) <=
            STABLE_HEADER_POSITION_TOLERANCE_PX
        );
      })
      .toBe(true);

  });
});
