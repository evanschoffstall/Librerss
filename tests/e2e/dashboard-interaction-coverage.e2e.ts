import type { Page } from "@playwright/test";

import {
    articleCard,
    articleCardByKey,
    expectArticleExpanded,
  expectDashboardLogin,
    gotoPreviewDashboard,
    hasLoadMoreSentinel,
    openDashboardSettings,
    readArticleKey,
    readRenderedArticleCount,
    scrollFeedViewportToBottom,
    selectExpandedArticleText,
    swipeArticle,
    toggleArticle,
} from "./helpers";
import { expect, test } from "./test";

type ArticleFrameAction = "button-read" | "swipe-read";
const FOLLOWER_FRAME_SAMPLE_COUNT = process.env.CI ? 24 : 12;

interface ArticleTopFrameSample {
  label: string;
  rows: Record<
    string,
    | undefined
    | {
        animation: null | string;
        opacity: null | string;
        state: null | string;
      }
  >;
  tops: Record<string, number>;
}

async function clickArticleReadButtonAndCollectFrameSamples(
  page: Page,
  articleKey: string,
  articleKeys: string[],
  rowKeys: string[],
  frameCount = 4,
) {
  return await performArticleActionAndCollectFrameSamples(
    page,
    articleKey,
    articleKeys,
    rowKeys,
    "button-read",
    frameCount,
  );
}

async function collectArticleTopFrameSamples(
  page: Page,
  articleKeys: string[],
  frameCount = FOLLOWER_FRAME_SAMPLE_COUNT,
) {
  return (await page.evaluate(
    async ({ nextFrameCount, targetArticleKeys }) => {
      const readArticleTopWithinActiveViewport = (articleKey: string) => {
        const articles = Array.from(
          document.querySelectorAll<HTMLElement>("article[data-article-key]"),
        );
        const article = articles.find(
          (candidate) => candidate.dataset.articleKey === articleKey,
        );
        const viewports = Array.from(
          document.querySelectorAll<HTMLElement>("[data-radix-scroll-area-viewport]"),
        );
        let viewport: HTMLElement | null = null;

        for (const candidate of viewports) {
          if (!viewport || candidate.scrollHeight > viewport.scrollHeight) {
            viewport = candidate;
          }
        }

        if (!article || !viewport) {
          throw new Error("Expected article and active feed viewport to be present.");
        }

        return article.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      };

      const sample = (label: string) => {
        const tops: Record<string, number> = {};

        for (const articleKey of targetArticleKeys) {
          tops[articleKey] = readArticleTopWithinActiveViewport(articleKey);
        }

        return {
          label,
          rows: {},
          tops,
        };
      };

      const samples = [sample("current")];
      for (let frameIndex = 0; frameIndex < nextFrameCount; frameIndex += 1) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
        samples.push(sample(`raf-${frameIndex + 1}`));
      }

      return samples;
    },
    { nextFrameCount: frameCount, targetArticleKeys: articleKeys },
  )) as ArticleTopFrameSample[];
}

function expectFrameSampleLabels(
  samples: ArticleTopFrameSample[],
  labels: string[],
) {
  expect(samples.map((sample) => sample.label)).toEqual(labels);
}

function expectImmediateLayoutRelease(
  articleLabel: string,
  baselineTop: number,
  frameSamples: ArticleTopFrameSample[],
) {
  const topTimeline = readArticleTopTimeline(frameSamples, articleLabel);

  expect(frameSamples.length).toBeGreaterThanOrEqual(3);
  expect(topTimeline[0] ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
    baselineTop + 1,
  );
  expect(topTimeline[1] ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
    baselineTop + 1,
  );

  expect(
    topTimeline.some((sampleTop) => sampleTop < baselineTop - 4),
    `${articleLabel} should move above baseline within the sampled frames after button-read`,
  ).toBe(true);

  for (let sampleIndex = 1; sampleIndex < topTimeline.length; sampleIndex += 1) {
    expect(
      topTimeline[sampleIndex] - topTimeline[sampleIndex - 1],
      `${articleLabel} moved downward during the first animation frames after button-read`,
    ).toBeLessThanOrEqual(2);
  }
}

function expectMonotonicUpwardMotion(
  articleLabel: string,
  topTimeline: number[],
) {
  expect(topTimeline.length).toBeGreaterThan(1);
  expect(topTimeline.at(-1) ?? Number.POSITIVE_INFINITY).toBeLessThan(
    (topTimeline[0] ?? 0) - 40,
  );

  for (let sampleIndex = 1; sampleIndex < topTimeline.length; sampleIndex += 1) {
    expect(
      topTimeline[sampleIndex] - topTimeline[sampleIndex - 1],
      `${articleLabel} moved downward during unread swipe reflow`,
    ).toBeLessThanOrEqual(2);
  }
}

async function performArticleActionAndCollectFrameSamples(
  page: Page,
  articleKey: string,
  articleKeys: string[],
  rowKeys: string[],
  action: ArticleFrameAction,
  frameCount = 4,
) {
  return (await page.evaluate(
    async ({ actionName, nextFrameCount, targetArticleKey, targetArticleKeys, targetRowKeys }) => {
      const readArticleTopWithinActiveViewport = (articleKey: string) => {
        const article = [...document.querySelectorAll<HTMLElement>("article[data-article-key]")].find(
          (candidate) => candidate.dataset.articleKey === articleKey,
        );
        const viewports = [...document.querySelectorAll<HTMLElement>("[data-radix-scroll-area-viewport]")];
        const viewport = viewports.reduce<HTMLElement | null>((selected, candidate) => {
          if (!selected) {
            return candidate;
          }

          return candidate.scrollHeight > selected.scrollHeight ? candidate : selected;
        }, null);

        if (!article || !viewport) {
          throw new Error("Expected article and active feed viewport to be present.");
        }

        return article.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      };

      const sample = (label: string) => {
        const rows = Object.fromEntries(
          targetRowKeys.map((rowKey) => {
            const row = Array.from(document.querySelectorAll<HTMLElement>("[data-scroll-restore-key]")).find(
              (candidate) => candidate.dataset.scrollRestoreKey === rowKey,
            );

            return [
              rowKey,
              row
                ? {
                    animation: row.dataset.feedRowAnimation ?? null,
                    opacity: row.style.opacity || null,
                    state: row.dataset.feedRowState ?? null,
                  }
                : undefined,
            ];
          }),
        );

        return {
          label,
          rows,
          tops: Object.fromEntries(
            targetArticleKeys.map((articleKey) => [
              articleKey,
              readArticleTopWithinActiveViewport(articleKey),
            ]),
          ),
        };
      };

      const article = Array.from(
        document.querySelectorAll<HTMLElement>("article[data-article-key]"),
      ).find((candidate) => candidate.dataset.articleKey === targetArticleKey);

      if (!article) {
        throw new Error("Expected target article to be present for frame sampling.");
      }

      if (actionName === "button-read") {
        const button = Array.from(article.querySelectorAll<HTMLButtonElement>("button")).find(
          (candidate) => candidate.getAttribute("aria-label") === "Mark as read",
        );

        if (!button) {
          throw new Error("Expected Mark as read button to exist for frame sampling.");
        }

        button.click();
      } else {
        const rect = article.getBoundingClientRect();
        const pointerId = 501;
        const y = rect.top + rect.height * 0.5;
        const dispatchPointer = (type: string, clientX: number) => {
          article.dispatchEvent(new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY: y,
            pointerId,
            pointerType: "touch",
          }));
        };

        dispatchPointer("pointerdown", rect.left + rect.width * 0.24);
        dispatchPointer("pointermove", rect.left + rect.width * 0.92);
        dispatchPointer("pointerup", rect.left + rect.width * 0.92);
      }

      const samples = [sample("sync-after-action")];
      for (let frameIndex = 0; frameIndex < nextFrameCount; frameIndex += 1) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
        samples.push(sample(`raf-${frameIndex + 1}`));
      }

      return samples;
    },
    {
      actionName: action,
      nextFrameCount: frameCount,
      targetArticleKey: articleKey,
      targetArticleKeys: articleKeys,
      targetRowKeys: rowKeys,
    },
  )) as ArticleTopFrameSample[];
}

async function readArticleBodyState(page: Page, articleKey: string) {
  return await page.evaluate((targetArticleKey) => {
    const article = [...document.querySelectorAll<HTMLElement>('article[data-article-key]')].find(
      (candidate) => candidate.dataset.articleKey === targetArticleKey,
    );

    if (!article) {
      throw new Error('Expected article to exist while reading body state.');
    }

    const body = article.querySelector<HTMLElement>('.article-swipe-body');
    if (!body) {
      throw new Error('Expected article body surface to exist.');
    }

    return {
      bodyTextLength: body.innerText.trim().length,
      hasHydrationLoading: Boolean(
        article.querySelector('[data-article-hydration-state="loading"]'),
      ),
      hasPreview: Boolean(article.querySelector('[data-article-preview="true"]')),
    };
  }, articleKey);
}

async function readArticleTopSnapshot(page: Page, articleKeys: string[]) {
  const snapshot = new Map<string, number>();

  for (const articleKey of articleKeys) {
    snapshot.set(
      articleKey,
      await readArticleTopWithinActiveViewport(page, articleKey),
    );
  }

  return snapshot;
}

function readArticleTopTimeline(
  samples: ArticleTopFrameSample[],
  articleKey: string,
) {
  return samples.map(
    (sample) => sample.tops[articleKey] ?? Number.POSITIVE_INFINITY,
  );
}

async function readArticleTopWithinActiveViewport(
  page: Page,
  articleKey: string,
) {
  return await page.evaluate((targetArticleKey) => {
    const article = [...document.querySelectorAll<HTMLElement>("article[data-article-key]")].find(
      (candidate) => candidate.dataset.articleKey === targetArticleKey,
    );
    const viewports = [...document.querySelectorAll<HTMLElement>("[data-radix-scroll-area-viewport]")];
    const viewport = viewports.reduce<HTMLElement | null>((selected, candidate) => {
      if (!selected) {
        return candidate;
      }

      return candidate.scrollHeight > selected.scrollHeight ? candidate : selected;
    }, null);

    if (!article || !viewport) {
      throw new Error("Expected article and active feed viewport to be present.");
    }

    return article.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
  }, articleKey);
}

async function swipeArticleReadAndCollectFrameSamples(
  page: Page,
  articleKey: string,
  articleKeys: string[],
  rowKeys: string[],
  frameCount = 4,
) {
  return await performArticleActionAndCollectFrameSamples(
    page,
    articleKey,
    articleKeys,
    rowKeys,
    "swipe-read",
    frameCount,
  );
}

test.describe("dashboard interaction coverage", () => {
  test("covers article actions, expanded text selection, and collapse flows", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const articleKey = await readArticleKey(articleCard(page, 0));
    const article = articleCardByKey(page, articleKey);

    await article.hover();
    await article.getByRole("button", { name: "Mark as read" }).click();
    await expect(
      article.getByRole("button", { name: "Mark as unread" }),
    ).toBeVisible();

    await article.hover();
    await article.getByRole("button", { name: "Star article" }).click();
    await expect(
      article.getByRole("button", { name: "Remove star" }),
    ).toBeVisible();

    const collapsedBodyState = await readArticleBodyState(page, articleKey);

    await toggleArticle(article);
    await expectArticleExpanded(article, true);
    await expect
      .poll(async () => {
        return await readArticleBodyState(page, articleKey);
      })
      .toMatchObject({
        hasHydrationLoading: false,
        hasPreview: false,
      });
    await expect
      .poll(async () => {
        const expandedBodyState = await readArticleBodyState(page, articleKey);
        return expandedBodyState.bodyTextLength;
      })
      .toBeGreaterThan(collapsedBodyState.bodyTextLength + 80);
    await expect(article.getByRole("link", { name: "Open article" })).toHaveAttribute(
      "href",
      articleKey,
    );

    await article.getByRole("button", { name: "Share article options" }).click();
    await expect(page.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Email" })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Share to Reddit" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Share to Bluesky" }),
    ).toBeVisible();

    await page.getByRole("menuitem", { name: "Copy link" }).click();
    const copyLinkDialog = page.getByRole("dialog", { name: "Copy Link" });

    await expect(copyLinkDialog).toBeVisible();
    const articleLinkInput = copyLinkDialog.getByRole("textbox", {
      name: "Article link",
    });

    await expect(articleLinkInput).toHaveValue(articleKey);
    await page.getByRole("button", { name: "Select" }).click();
    await expect
      .poll(async () => {
        return await articleLinkInput.evaluate((element) => {
          const input = element as HTMLInputElement;
          return (input.selectionEnd ?? 0) - (input.selectionStart ?? 0);
        });
      })
      .toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Copy Link" })).toHaveCount(0);

    await article.hover();
    await article.getByRole("button", { name: "View raw article HTML" }).click();
    await expect(
      page.getByRole("heading", { name: "Raw Article HTML" }),
    ).toBeVisible();
    const rawHtmlInput = page.locator("textarea[aria-label='Raw article HTML']").last();

    await expect
      .poll(async () => {
        return (await rawHtmlInput.inputValue()).length;
      })
      .toBeGreaterThan(20);

    await page.getByRole("button", { name: "Select" }).click();
    await expect
      .poll(async () => {
        return await rawHtmlInput.evaluate((element) => {
          const textarea = element as HTMLTextAreaElement;
          return (textarea.selectionEnd ?? 0) - (textarea.selectionStart ?? 0);
        });
      })
      .toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "Raw Article HTML" }),
    ).toHaveCount(0);

    const expandedArticle = page
      .locator("article[data-article-key][aria-expanded='true']")
      .first();

    await expect
      .poll(async () => {
        return (await selectExpandedArticleText(expandedArticle)).length;
      })
      .toBeGreaterThan(20);
    await expectArticleExpanded(expandedArticle, true);

    await page.evaluate(() => {
      window.getSelection()?.removeAllRanges();
    });
    await expandedArticle.focus();
    await expandedArticle.press("Enter");
    await expectArticleExpanded(article, false);
  });

  test("covers preview-safe toolbar and filter controls", async ({ page }) => {
    await gotoPreviewDashboard(page);

    const initialThemeIsDark = await page.evaluate(() => {
      return document.documentElement.classList.contains("dark");
    });

    await page.getByRole("button", { name: /Switch to .* mode|Toggle theme/ }).click();
    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          return document.documentElement.classList.contains("dark");
        });
      })
      .toBe(!initialThemeIsDark);

    await page.getByRole("button", { name: "Refresh selected feed" }).click();
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    const firstArticleTitle =
      (await articleCard(page, 0).getByRole("heading").textContent())?.trim() ?? "";
    if (firstArticleTitle === "") {
      throw new Error("Expected the first preview article to include a title.");
    }

    await page.getByRole("button", { exact: true, name: "unread" }).click();
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { exact: true, name: "all" }).click();
    await page.getByRole("button", { name: "Mark all read" }).click();
    await page.getByRole("button", { exact: true, name: "read" }).click();
    await expect(
      page.getByRole("heading", { name: firstArticleTitle }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { exact: true, name: "all" }).click();
    await openDashboardSettings(page);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "Reader Settings" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Reset app state" }).click();
    await expectDashboardLogin(page);
  });

  test("keeps mixed unread button-read and swipe-read removals moving sibling rows upward", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await page.getByRole("button", { exact: true, name: "unread" }).click();

    const firstArticleKey = await readArticleKey(articleCard(page, 0));
    const secondArticleKey = await readArticleKey(articleCard(page, 1));
    const thirdArticleKey = await readArticleKey(articleCard(page, 2));
    const fourthArticleKey = await readArticleKey(articleCard(page, 3));

    const firstRemovalBaseline = await readArticleTopSnapshot(page, [
      secondArticleKey,
      thirdArticleKey,
    ]);
    const firstRemovalFrameSamples = await clickArticleReadButtonAndCollectFrameSamples(
      page,
      firstArticleKey,
      [secondArticleKey, thirdArticleKey],
      [firstArticleKey],
    );
    await expect(
      page.locator("article[data-article-key][aria-expanded='true']"),
    ).toHaveCount(0);

    expectFrameSampleLabels(firstRemovalFrameSamples, [
      "sync-after-action",
      "raf-1",
      "raf-2",
      "raf-3",
      "raf-4",
    ]);
    expectImmediateLayoutRelease(
      secondArticleKey,
      firstRemovalBaseline.get(secondArticleKey) ?? 0,
      firstRemovalFrameSamples,
    );
    expectImmediateLayoutRelease(
      thirdArticleKey,
      firstRemovalBaseline.get(thirdArticleKey) ?? 0,
      firstRemovalFrameSamples,
    );

    const firstRemovalSamples = await collectArticleTopFrameSamples(page, [
      secondArticleKey,
      thirdArticleKey,
    ]);
    const firstRemovalTimeline = readArticleTopTimeline(
      firstRemovalSamples,
      secondArticleKey,
    );
    const firstRemovalThirdTimeline = readArticleTopTimeline(
      firstRemovalSamples,
      thirdArticleKey,
    );

    await expect.poll(async () => {
      return await articleCardByKey(page, firstArticleKey).count();
    }).toBe(
      0,
    );
    await expect(articleCardByKey(page, firstArticleKey)).toHaveCount(0);
    expectMonotonicUpwardMotion(
      secondArticleKey,
      [
        firstRemovalBaseline.get(secondArticleKey) ?? 0,
        ...firstRemovalTimeline,
      ],
    );
    expectMonotonicUpwardMotion(
      thirdArticleKey,
      [
        firstRemovalBaseline.get(thirdArticleKey) ?? 0,
        ...firstRemovalThirdTimeline,
      ],
    );

    expect(await readArticleKey(articleCard(page, 0))).toBe(secondArticleKey);
    expect(await readArticleKey(articleCard(page, 1))).toBe(thirdArticleKey);
    expect(await readArticleKey(articleCard(page, 2))).toBe(fourthArticleKey);

    const secondArticle = articleCardByKey(page, secondArticleKey);
    const secondSwipeBaseline = await readArticleTopSnapshot(page, [
      thirdArticleKey,
      fourthArticleKey,
    ]);
    await swipeArticle(secondArticle, { endRatio: 0.92, startRatio: 0.24 });

    const secondSwipeFrameSamples = await collectArticleTopFrameSamples(page, [
      thirdArticleKey,
      fourthArticleKey,
    ]);
    const secondSwipeTimeline = readArticleTopTimeline(
      secondSwipeFrameSamples,
      thirdArticleKey,
    );
    const secondSwipeFourthTimeline = readArticleTopTimeline(
      secondSwipeFrameSamples,
      fourthArticleKey,
    );

    await expect.poll(async () => {
      return await articleCardByKey(page, secondArticleKey).count();
    }).toBe(
      0,
    );
    await expect(articleCardByKey(page, secondArticleKey)).toHaveCount(0);
    expectMonotonicUpwardMotion(
      thirdArticleKey,
      [
        secondSwipeBaseline.get(thirdArticleKey) ?? 0,
        ...secondSwipeTimeline,
      ],
    );
    expectMonotonicUpwardMotion(
      fourthArticleKey,
      [
        secondSwipeBaseline.get(fourthArticleKey) ?? 0,
        ...secondSwipeFourthTimeline,
      ],
    );
  });

  test("keeps consecutive top unread button-read removals from flashing downward", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await page.getByRole("button", { exact: true, name: "unread" }).click();

    for (let removalIndex = 0; removalIndex < 3; removalIndex += 1) {
      const removalArticleKey = await readArticleKey(articleCard(page, 0));
      const secondArticleKey = await readArticleKey(articleCard(page, 1));
      const thirdArticleKey = await readArticleKey(articleCard(page, 2));
      const fourthArticleKey = await readArticleKey(articleCard(page, 3));
      const baseline = await readArticleTopSnapshot(page, [
        secondArticleKey,
        thirdArticleKey,
      ]);
      const frameSamples = await clickArticleReadButtonAndCollectFrameSamples(
        page,
        removalArticleKey,
        [secondArticleKey, thirdArticleKey],
        [removalArticleKey],
      );

      expectFrameSampleLabels(frameSamples, [
        "sync-after-action",
        "raf-1",
        "raf-2",
        "raf-3",
        "raf-4",
      ]);
      expectImmediateLayoutRelease(
        secondArticleKey,
        baseline.get(secondArticleKey) ?? 0,
        frameSamples,
      );
      expectImmediateLayoutRelease(
        thirdArticleKey,
        baseline.get(thirdArticleKey) ?? 0,
        frameSamples,
      );

      await expect(articleCardByKey(page, removalArticleKey)).toHaveCount(0);
      expect(await readArticleKey(articleCard(page, 0))).toBe(secondArticleKey);
      expect(await readArticleKey(articleCard(page, 1))).toBe(thirdArticleKey);
      expect(await readArticleKey(articleCard(page, 2))).toBe(fourthArticleKey);
    }
  });

  test("keeps alternating top unread swipe and button removals moving rows upward without a downward flash", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await page.getByRole("button", { exact: true, name: "unread" }).click();

    const firstArticleKey = await readArticleKey(articleCard(page, 0));
    const secondArticleKey = await readArticleKey(articleCard(page, 1));
    const thirdArticleKey = await readArticleKey(articleCard(page, 2));
    const fourthArticleKey = await readArticleKey(articleCard(page, 3));

    const swipeBaseline = await readArticleTopSnapshot(page, [
      secondArticleKey,
      thirdArticleKey,
    ]);
    const swipeFrameSamples = await swipeArticleReadAndCollectFrameSamples(
      page,
      firstArticleKey,
      [secondArticleKey, thirdArticleKey],
      [firstArticleKey],
    );

    expectFrameSampleLabels(swipeFrameSamples, [
      "sync-after-action",
      "raf-1",
      "raf-2",
      "raf-3",
      "raf-4",
    ]);

    const swipeFollowerSamples = await collectArticleTopFrameSamples(page, [
      secondArticleKey,
      thirdArticleKey,
    ]);

    await expect(articleCardByKey(page, firstArticleKey)).toHaveCount(0);
    expectMonotonicUpwardMotion(
      secondArticleKey,
      [
        swipeBaseline.get(secondArticleKey) ?? 0,
        ...readArticleTopTimeline(swipeFollowerSamples, secondArticleKey),
      ],
    );
    expectMonotonicUpwardMotion(
      thirdArticleKey,
      [
        swipeBaseline.get(thirdArticleKey) ?? 0,
        ...readArticleTopTimeline(swipeFollowerSamples, thirdArticleKey),
      ],
    );

    const buttonBaseline = await readArticleTopSnapshot(page, [
      thirdArticleKey,
      fourthArticleKey,
    ]);
    const buttonFrameSamples = await clickArticleReadButtonAndCollectFrameSamples(
      page,
      secondArticleKey,
      [thirdArticleKey, fourthArticleKey],
      [secondArticleKey],
    );

    expectFrameSampleLabels(buttonFrameSamples, [
      "sync-after-action",
      "raf-1",
      "raf-2",
      "raf-3",
      "raf-4",
    ]);
    expectImmediateLayoutRelease(
      thirdArticleKey,
      buttonBaseline.get(thirdArticleKey) ?? 0,
      buttonFrameSamples,
    );
    expectImmediateLayoutRelease(
      fourthArticleKey,
      buttonBaseline.get(fourthArticleKey) ?? 0,
      buttonFrameSamples,
    );

    await expect(articleCardByKey(page, secondArticleKey)).toHaveCount(0);
    expect(await readArticleKey(articleCard(page, 0))).toBe(thirdArticleKey);
    expect(await readArticleKey(articleCard(page, 1))).toBe(fourthArticleKey);
  });

  test("never pushes sibling rows downward during button-read standard collapse", async ({
    page,
  }) => {
    // Regression for: reading an article briefly introduces space at the top
    // (pre-collapse row height painted for one RAF frame via Framer Motion's
    // deferred style write), which causes siblings below to appear to move down
    // before jumping back up.  The fix: height and marginBottom are written via
    // the React inline style prop directly (bypassing Framer Motion's RAF
    // scheduler) so the browser first paint always sees the final collapsed
    // values.
    await gotoPreviewDashboard(page);
    await page.getByRole("button", { exact: true, name: "unread" }).click();

    // Track articles below the top one so we can verify they never move DOWN.
    const firstArticleKey = await readArticleKey(articleCard(page, 0));
    const secondArticleKey = await readArticleKey(articleCard(page, 1));
    const thirdArticleKey = await readArticleKey(articleCard(page, 2));
    const fourthArticleKey = await readArticleKey(articleCard(page, 3));

    const trackedKeys = [secondArticleKey, thirdArticleKey, fourthArticleKey];

    // Baseline top positions before the removal.
    const baseline = await readArticleTopSnapshot(page, trackedKeys);

    // Collect sync + 6 RAF frames sampling positions and row dataset state.
    const frameSamples = await clickArticleReadButtonAndCollectFrameSamples(
      page,
      firstArticleKey,
      trackedKeys,
      [firstArticleKey],
      6,
    );

    // --- Core invariant: no sibling must move DOWN at any point ---
    // A row is allowed to stay in place (delta = 0) or move up (delta < 0).
    // Any positive delta (moved down) indicates the flash regression.
    for (const sample of frameSamples) {
      for (const trackedKey of trackedKeys) {
        const baselineTop = baseline.get(trackedKey) ?? 0;
        const sampleTop = sample.tops[trackedKey] ?? baselineTop;
        expect(
          sampleTop,
          `${trackedKey} moved DOWN at sample "${sample.label}" (${sampleTop}px > baseline ${baselineTop}px)`,
        ).toBeLessThanOrEqual(baselineTop + 1); // 1px tolerance for subpixel rounding
      }
    }

    // --- Upward shift invariant: siblings must move above baseline within the
    // sampled frames, even if the first sync frame remains at baseline. --
    const baselineSecond = baseline.get(secondArticleKey) ?? 0;
    expect(
      readArticleTopTimeline(frameSamples, secondArticleKey)
        .slice(1)
        .some((sampleTop) => sampleTop < baselineSecond - 4),
      "second article should move above baseline within the first RAF samples",
    ).toBe(true);
  });

  test("supports swipe actions and loads more feed pages in preview", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const firstArticleKey = await readArticleKey(articleCard(page, 0));
    const secondArticleKey = await readArticleKey(articleCard(page, 1));
    const firstArticle = articleCardByKey(page, firstArticleKey);
    const secondArticle = articleCardByKey(page, secondArticleKey);

    await expect(
      firstArticle.getByRole("button", { name: "Mark as read" }),
    ).toBeVisible();
    await swipeArticle(firstArticle, { endRatio: 0.92, startRatio: 0.24 });
    await expect(
      firstArticle.getByRole("button", { name: "Mark as unread" }),
    ).toBeVisible();
    await expectArticleExpanded(firstArticle, false);

    await expect(
      secondArticle.getByRole("button", { name: "Star article" }),
    ).toBeVisible();
    await swipeArticle(secondArticle, {
      endRatio: 0.08,
      startRatio: 0.78,
    });
    await expect(
      secondArticle.getByRole("button", { name: "Remove star" }),
    ).toBeVisible();
    await expectArticleExpanded(secondArticle, false);

    const initialArticleCount = await readRenderedArticleCount(page);

    expect(initialArticleCount).toBeGreaterThan(0);
    expect(await hasLoadMoreSentinel(page)).toBe(true);

    await scrollFeedViewportToBottom(page);
    await expect
      .poll(async () => {
        return await readRenderedArticleCount(page);
      })
      .toBeGreaterThan(initialArticleCount);
  });

});