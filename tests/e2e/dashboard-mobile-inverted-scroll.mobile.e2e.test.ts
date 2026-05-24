import type { Page } from "@playwright/test";

import {
  articleCard,
  configureArticlesPerPage,
  gotoPreviewDashboard,
  openDashboardSettings,
  readFeedViewportMetrics,
  readRenderedArticleCount,
  readVisibleFeedArticleCount,
  triggerFeedViewportWheelIntent,
  waitForPreviewDashboardHydration,
} from "./helpers";
import { expect, test } from "./test";

const MOBILE_INVERTED_SCROLL_STORAGE_KEY = "librerss:mobileInvertedScroll";
const DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY = "librerss:articlesPerPage";
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
async function alignArticleHeaderToStableOffset(
  page: Page,
  articleKey: string,
) {
  await expect
    .poll(async () => {
      const offsets = await maybeReadArticleHeaderViewportOffsets(
        page,
        articleKey,
      );

      if (!offsets) {
        return false;
      }

      const targetHeaderTop = resolveStableHeaderOffsetTop(
        offsets.viewportHeight,
      );
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
          const candidate =
            [
              ...document.querySelectorAll<HTMLElement>(
                `article[data-article-key="${CSS.escape(targetArticleKey)}"]`,
              ),
            ]
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
                    Math.abs(Math.min(0, viewport.clientHeight - headerBottom)),
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
            headerRect.top - viewportRect.top - targetHeaderTop;
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
    const article =
      [
        ...document.querySelectorAll<HTMLElement>(
          `article[data-article-key="${CSS.escape(targetArticleKey)}"]`,
        ),
      ].find(
        (candidate) => candidate.getAttribute("aria-expanded") === "true",
      ) ??
      document.querySelector<HTMLElement>(
        `article[data-article-key="${CSS.escape(targetArticleKey)}"]`,
      );

    if (!article) {
      throw new Error(
        "Expected the expanded article to remain mounted while collapsing.",
      );
    }

    const header = article.querySelector<HTMLElement>(
      "[data-article-swipe-zone='header']",
    );

    (header ?? article).click();
  }, articleKey);
}

/** Enables mobile inverted scroll before the preview dashboard hydrates. */
async function enableMobileInvertedScroll(page: Page) {
  await page.addInitScript((storageKey: string) => {
    window.localStorage.setItem(storageKey, "true");
  }, MOBILE_INVERTED_SCROLL_STORAGE_KEY);
}

/** Reads article header offsets when the article is currently rendered, otherwise returns null. */
async function maybeReadArticleHeaderViewportOffsets(
  page: Page,
  articleKey: string,
) {
  const state = await page.evaluate(
    (targetArticleKey): null | RenderedArticleState => {
      const candidates = [
        ...document.querySelectorAll<HTMLElement>(
          `article[data-article-key="${CSS.escape(targetArticleKey)}"]`,
        ),
      ]
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
            expanded: article.getAttribute("aria-expanded"),
            headerTop: Math.round(headerTop * 100) / 100,
            intersectsViewport:
              headerBottom > 0 && headerTop < viewport.clientHeight,
            scrollTop: Math.round(viewport.scrollTop * 100) / 100,
            viewportHeight: viewport.clientHeight,
            visibleScore:
              Math.abs(Math.max(0, headerTop)) +
              Math.abs(Math.min(0, viewport.clientHeight - headerBottom)),
          };
        })
        .filter(
          (candidate): candidate is NonNullable<typeof candidate> =>
            candidate !== null,
        )
        .sort((left, right) => {
          if (left.intersectsViewport !== right.intersectsViewport) {
            return left.intersectsViewport ? -1 : 1;
          }

          return left.visibleScore - right.visibleScore;
        });

      return candidates[0] ?? null;
    },
    articleKey,
  );

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
    const candidates = [
      ...document.querySelectorAll<HTMLElement>(
        `article[data-article-key="${CSS.escape(targetArticleKey)}"]`,
      ),
    ]
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

        const viewportRect = viewport.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const headerTop = headerRect.top - viewportRect.top;
        const headerBottom = headerRect.bottom - viewportRect.top;

        return {
          expanded: article.getAttribute("aria-expanded"),
          intersectsViewport:
            headerBottom > 0 && headerTop < viewport.clientHeight,
          visibleScore:
            Math.abs(Math.max(0, headerTop)) +
            Math.abs(Math.min(0, viewport.clientHeight - headerBottom)),
        };
      })
      .filter(
        (candidate): candidate is NonNullable<typeof candidate> =>
          candidate !== null,
      )
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
async function readArticleHeaderViewportOffsets(
  page: Page,
  articleKey: string,
) {
  const state = await maybeReadArticleHeaderViewportOffsets(page, articleKey);

  if (!state) {
    throw new Error(
      "Expected an article header rendered inside the feed viewport.",
    );
  }

  return state;
}

/** Reads the feed list surface data attribute indicating inverted scroll is active. */
async function readInvertedScrollAttribute(page: Page) {
  const feedSurface = page.locator("[data-feed-surface-mode]").first();
  return await feedSurface.getAttribute("data-inverted-scroll");
}

/** Returns a fully visible article key whose header already sits in a stable viewport band. */
async function readStableVisibleArticleKey(page: Page) {
  return await page.evaluate((targetHeaderTop) => {
    const viewport =
      [
        ...document.querySelectorAll<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        ),
      ].find(
        (candidate) =>
          candidate.isConnected &&
          candidate.getBoundingClientRect().height > 0 &&
          candidate.getBoundingClientRect().width > 0 &&
          window.getComputedStyle(candidate).visibility !== "hidden" &&
          candidate.querySelector("article[data-article-key]") !== null,
      ) ?? null;

    if (!viewport) {
      throw new Error(
        "Expected a feed viewport before reading the visible article key.",
      );
    }

    const viewportRect = viewport.getBoundingClientRect();
    const viewportBottom = viewportRect.bottom;
    const resolvedTargetHeaderTop = Math.min(
      targetHeaderTop,
      Math.max(96, viewport.clientHeight - 120),
    );
    const stableTop =
      viewportRect.top + Math.max(48, resolvedTargetHeaderTop - 72);
    const stableBottom = viewportRect.top + viewport.clientHeight - 120;
    const visibleArticles = [
      ...document.querySelectorAll<HTMLElement>("article[data-article-key]"),
    ]
      .map((article) => ({
        article,
        header: article.querySelector<HTMLElement>(
          "[data-article-swipe-zone='header']",
        ),
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
        const leftInStableBand =
          leftTop >= stableTop && leftTop <= stableBottom;
        const rightInStableBand =
          rightTop >= stableTop && rightTop <= stableBottom;

        if (leftInStableBand !== rightInStableBand) {
          return leftInStableBand ? -1 : 1;
        }

        return (
          Math.abs(leftTop - (viewportRect.top + resolvedTargetHeaderTop)) -
          Math.abs(rightTop - (viewportRect.top + resolvedTargetHeaderTop))
        );
      });

    const visibleArticle = visibleArticles[0]?.article ?? null;

    if (!visibleArticle) {
      throw new Error(
        "Expected at least one visible article in the feed viewport.",
      );
    }

    return visibleArticle.getAttribute("data-article-key");
  }, STABLE_HEADER_OFFSET_TOP_PX);
}

/** Reads visible article keys in top-to-bottom viewport order. */
async function readVisibleArticleKeys(page: Page) {
  return await page.evaluate(() => {
    const viewport = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      ),
    ].find(
      (candidate) =>
        candidate.isConnected &&
        candidate.getBoundingClientRect().height > 0 &&
        candidate.getBoundingClientRect().width > 0 &&
        window.getComputedStyle(candidate).visibility !== "hidden" &&
        candidate.querySelector("article[data-article-key]") !== null,
    );

    if (!viewport) {
      throw new Error("Expected a feed viewport before reading visible keys.");
    }

    const viewportRect = viewport.getBoundingClientRect();

    return [
      ...viewport.querySelectorAll<HTMLElement>("article[data-article-key]"),
    ]
      .map((article) => {
        const articleKey = article.dataset.articleKey ?? null;
        const articleRect = article.getBoundingClientRect();

        if (
          !articleKey ||
          articleRect.bottom <= viewportRect.top ||
          articleRect.top >= viewportRect.bottom
        ) {
          return null;
        }

        return {
          articleKey,
          top: articleRect.top - viewportRect.top,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          articleKey: string;
          top: number;
        } => entry !== null,
      )
      .sort((left, right) => left.top - right.top)
      .map((entry) => entry.articleKey);
  });
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
async function scrollFeedViewportWithIntent(
  page: Page,
  targetScrollTop: number,
) {
  const resolvedScrollTop = await page.evaluate((nextScrollTop) => {
    const viewport =
      [
        ...document.querySelectorAll<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        ),
      ].find(
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

    viewport.dispatchEvent(
      new Event("touchmove", { bubbles: true, cancelable: true }),
    );
    viewport.scrollTop = nextScrollTop;
    viewport.dispatchEvent(new Event("scroll"));

    return Math.round(viewport.scrollTop * 100) / 100;
  }, targetScrollTop);

  await page.evaluate(
    () => new Promise((resolve) => window.requestAnimationFrame(resolve)),
  );

  return resolvedScrollTop;
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
    const candidates = [
      ...document.querySelectorAll<HTMLElement>(
        `article[data-article-key="${CSS.escape(targetArticleKey)}"]`,
      ),
    ]
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
          expanded: article.getAttribute("aria-expanded") === "true",
          header,
          intersectsViewport:
            headerBottom > 0 && headerTop < viewport.clientHeight,
          visibleScore:
            Math.abs(Math.max(0, headerTop)) +
            Math.abs(Math.min(0, viewport.clientHeight - headerBottom)),
        };
      })
      .filter(
        (candidate): candidate is NonNullable<typeof candidate> =>
          candidate !== null,
      )
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

/** Drives the inverted top-boundary load gesture with scroll and wheel intent. */
async function triggerInvertedTopBoundaryLoadGesture(page: Page) {
  await scrollFeedViewportWithIntent(page, 0);
  await triggerFeedViewportWheelIntent(page, -240);
}

test.describe("dashboard mobile inverted scroll", () => {
  test("keeps inverted scroll off by default on mobile and anchors the feed at the top", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    const invertedAttr = await readInvertedScrollAttribute(page);
    expect(invertedAttr).toBeNull();

    await expect
      .poll(async () => {
        return await readRenderedArticleCount(page);
      })
      .toBeGreaterThan(0);

    await expect
      .poll(async () => {
        const { scrollTop } = await readFeedViewportMetrics(page);
        return Math.round(scrollTop);
      })
      .toBeLessThanOrEqual(2);
  });

  test("activates inverted scroll when the setting is turned on and anchors the feed at the bottom", async ({
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
      "true",
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const invertedAttr = await readInvertedScrollAttribute(page);
    expect(invertedAttr).toBe("true");

    await expect
      .poll(async () => {
        const { clientHeight, scrollHeight, scrollTop } =
          await readFeedViewportMetrics(page);
        return Math.round(scrollHeight - (scrollTop + clientHeight));
      })
      .toBeLessThanOrEqual(20);
  });

  test("displays the inverted scroll toggle in the display settings section", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    await openDashboardSettings(page);

    const invertedScrollSwitch = page.locator("#mobile-inverted-scroll");
    await expect(invertedScrollSwitch).toBeVisible();
    await expect(invertedScrollSwitch).not.toBeChecked();
  });

  test("toggling the setting on adds the inverted scroll attribute after reload", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    await openDashboardSettings(page);

    const invertedScrollSwitch = page.locator("#mobile-inverted-scroll");
    await expect(invertedScrollSwitch).not.toBeChecked();
    await invertedScrollSwitch.click();
    await expect(invertedScrollSwitch).toBeChecked();

    await page.keyboard.press("Escape");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await waitForPreviewDashboardHydration(page);

    const invertedAttr = await readInvertedScrollAttribute(page);
    expect(invertedAttr).toBe("true");
  });

  test("reloads the inverted setting and loads the next page after one quick away-and-return gesture plus renewed upward intent", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await setLocalStoragePreference(
      page,
      DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
      "4",
    );
    await setLocalStoragePreference(
      page,
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      "true",
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await waitForPreviewDashboardHydration(page);

    const invertedAttr = await readInvertedScrollAttribute(page);
    expect(invertedAttr).toBe("true");

    await expect
      .poll(async () => {
        return (await readFeedViewportMetrics(page)).scrollHeight;
      })
      .toBeGreaterThan(0);
    const baselineVisibleArticleCount = await readVisibleFeedArticleCount(page);

    const firstMoveTarget = Math.max(
      320,
      Math.floor((await readFeedViewportMetrics(page)).scrollHeight * 0.6),
    );
    await scrollFeedViewportWithIntent(page, firstMoveTarget);

    expect((await readVisibleArticleKeys(page)).length).toBeGreaterThan(0);

    await triggerInvertedTopBoundaryLoadGesture(page);

    await expect
      .poll(async () => {
        return (
          (await readVisibleFeedArticleCount(page)) >
          baselineVisibleArticleCount
        );
      })
      .toBe(true);

    const postHydrationMetrics = await readFeedViewportMetrics(page);
    expect(await readVisibleFeedArticleCount(page)).toBeGreaterThan(
      baselineVisibleArticleCount,
    );
    expect(postHydrationMetrics.scrollTop).toBeGreaterThanOrEqual(0);
  });

  test("does not surface CancelledError during rapid inverted pagination and filter churn", async ({
    page,
  }) => {
    await enableMobileInvertedScroll(page);
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await configureArticlesPerPage(page, 4);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const cancellationSignals: string[] = [];
    const captureCancellationSignal = (message: string) => {
      if (/CancelledError|canceled|cancelled/iu.test(message)) {
        cancellationSignals.push(message);
      }
    };
    const handleConsole = (message: {
      text: () => string;
      type: () => string;
    }) => {
      if (message.type() !== "error") {
        return;
      }

      captureCancellationSignal(message.text());
    };
    const handlePageError = (error: Error) => {
      captureCancellationSignal(error.stack ?? error.message);
    };

    page.on("console", handleConsole);
    page.on("pageerror", handlePageError);

    try {
      for (let cycle = 0; cycle < 4; cycle += 1) {
        await page
          .getByRole("button", {
            exact: true,
            name: cycle % 2 === 0 ? "unread" : "all",
          })
          .click();

        const currentMetrics = await readFeedViewportMetrics(page);
        await scrollFeedViewportWithIntent(
          page,
          Math.max(320, Math.floor(currentMetrics.scrollHeight * 0.6)),
        );
        await scrollFeedViewportWithIntent(page, 0);
      }

      await expect
        .poll(() => cancellationSignals.length, {
          intervals: [120, 180, 220],
          timeout: 1_200,
        })
        .toBe(0);
      expect(cancellationSignals).toEqual([]);
    } finally {
      page.off("console", handleConsole);
      page.off("pageerror", handlePageError);
    }
  });

  test("renders article cards with a valid feed surface in inverted mode", async ({
    page,
  }) => {
    await enableMobileInvertedScroll(page);
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    const invertedAttr = await readInvertedScrollAttribute(page);
    expect(invertedAttr).toBe("true");

    const articleCount = await page
      .locator("article[data-article-key]")
      .count();
    expect(articleCount).toBeGreaterThan(0);

    const feedMetrics = await readFeedViewportMetrics(page);
    expect(feedMetrics.scrollHeight).toBeGreaterThan(0);
    expect(feedMetrics.clientHeight).toBeGreaterThan(0);
  });

  test("keeps inverted article expansion and collapse positions stable before, during, and after the interaction", async ({
    page,
  }) => {
    await enableMobileInvertedScroll(page);
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();

    await expect
      .poll(async () => {
        return await readRenderedArticleCount(page);
      })
      .toBeGreaterThanOrEqual(10);

    const targetArticleKey = await readStableVisibleArticleKey(page);
    if (!targetArticleKey) {
      throw new Error("Expected a visible article key.");
    }
    await alignArticleHeaderToStableOffset(page, targetArticleKey);
    const before = await readArticleHeaderViewportOffsets(
      page,
      targetArticleKey,
    );

    for (let cycle = 0; cycle < 4; cycle += 1) {
      await toggleArticleByKey(page, targetArticleKey);
      await expect
        .poll(
          async () => await readArticleExpandedState(page, targetArticleKey),
        )
        .toBe("true");

      await expect
        .poll(async () => {
          const during = await readArticleHeaderViewportOffsets(
            page,
            targetArticleKey,
          );

          return (
            during.headerTop >= -1 &&
            during.headerTop <= during.viewportHeight - 60 &&
            Math.abs(during.headerTop - before.headerTop) <=
              STABLE_HEADER_POSITION_TOLERANCE_PX
          );
        })
        .toBe(true);

      const during = await readArticleHeaderViewportOffsets(
        page,
        targetArticleKey,
      );

      expect(during.headerTop).toBeGreaterThanOrEqual(-1);
      expect(during.headerTop).toBeLessThanOrEqual(during.viewportHeight - 60);
      expect(Math.abs(during.headerTop - before.headerTop)).toBeLessThanOrEqual(
        STABLE_HEADER_POSITION_TOLERANCE_PX,
      );

      await toggleArticleByKey(page, targetArticleKey);
      await expect
        .poll(
          async () => await readArticleExpandedState(page, targetArticleKey),
        )
        .toBe("false");

      await expect
        .poll(async () => {
          const after = await readArticleHeaderViewportOffsets(
            page,
            targetArticleKey,
          );

          return (
            after.headerTop >= -1 &&
            after.headerTop <= after.viewportHeight - 60 &&
            Math.abs(after.headerTop - before.headerTop) <=
              STABLE_HEADER_POSITION_TOLERANCE_PX
          );
        })
        .toBe(true);

      const after = await readArticleHeaderViewportOffsets(
        page,
        targetArticleKey,
      );

      expect(after.headerTop).toBeGreaterThanOrEqual(-1);
      expect(after.headerTop).toBeLessThanOrEqual(after.viewportHeight - 60);
      expect(Math.abs(after.headerTop - before.headerTop)).toBeLessThanOrEqual(
        STABLE_HEADER_POSITION_TOLERANCE_PX,
      );
    }
  });

  test("restores the original inverted article position after scrolling away while expanded", async ({
    page,
  }) => {
    await enableMobileInvertedScroll(page);
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();

    await expect
      .poll(async () => {
        return await readRenderedArticleCount(page);
      })
      .toBeGreaterThanOrEqual(10);

    const targetArticleKey = await readStableVisibleArticleKey(page);
    if (!targetArticleKey) {
      throw new Error("Expected a visible article key.");
    }
    await alignArticleHeaderToStableOffset(page, targetArticleKey);
    const before = await readArticleHeaderViewportOffsets(
      page,
      targetArticleKey,
    );

    await toggleArticleByKey(page, targetArticleKey);
    await expect
      .poll(async () => await readArticleExpandedState(page, targetArticleKey))
      .toBe("true");

    await expect
      .poll(
        async () => {
          return await readArticleExpandedState(page, targetArticleKey);
        },
        {
          intervals: [50, 80, 100],
          timeout: 500,
        },
      )
      .toBe("true");

    const scrolledFar = await scrollFeedViewportWithIntent(
      page,
      Math.max(0, before.scrollTop - 480),
    );
    await expect
      .poll(
        async () => {
          return (await readFeedViewportMetrics(page)).scrollTop;
        },
        {
          intervals: [60, 90, 120],
          timeout: 500,
        },
      )
      .toBeGreaterThanOrEqual(0);
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
      throw new Error(
        "Expected a second visible article key after restoring the viewport.",
      );
    }

    await alignArticleHeaderToStableOffset(page, secondTargetArticleKey);
    const secondBefore = await readArticleHeaderViewportOffsets(
      page,
      secondTargetArticleKey,
    );

    await toggleArticleByKey(page, secondTargetArticleKey);
    await expect
      .poll(
        async () =>
          await readArticleExpandedState(page, secondTargetArticleKey),
      )
      .toBe("true");

    await expect
      .poll(
        async () => {
          return await readArticleExpandedState(page, secondTargetArticleKey);
        },
        {
          intervals: [50, 80, 100],
          timeout: 500,
        },
      )
      .toBe("true");

    const scrolledMidway = await scrollFeedViewportWithIntent(
      page,
      Math.max(0, secondBefore.scrollTop - 320),
    );
    await expect
      .poll(
        async () => {
          return (await readFeedViewportMetrics(page)).scrollTop;
        },
        {
          intervals: [60, 90, 120],
          timeout: 500,
        },
      )
      .toBeGreaterThanOrEqual(0);
    const settledMidway = (await readFeedViewportMetrics(page)).scrollTop;
    expect(Math.abs(settledMidway - secondBefore.scrollTop)).toBeGreaterThan(
      100,
    );

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
