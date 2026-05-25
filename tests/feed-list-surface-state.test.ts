import { afterEach, describe, expect, test } from "bun:test";

import {
  findTopVisibleInvertedPaginationAnchorArticleKey,
  findVisibleInvertedRemovalAnchorArticleKey,
} from "@/app/dashboard/components/feed-view/list-state/useFeedListSurfaceState";

function appendViewportArticle(
  viewport: HTMLElement,
  articleKey: string,
  headerTop: number,
  headerHeight = 44,
) {
  const articleElement = document.createElement("article");
  articleElement.dataset.articleKey = articleKey;
  articleElement.dataset.scrollRestoreKey = articleKey;
  articleElement.getBoundingClientRect = () => createRect(headerTop, 96);

  const headerElement = document.createElement("div");
  headerElement.dataset.articleSwipeZone = "header";
  headerElement.getBoundingClientRect = () =>
    createRect(headerTop, headerHeight);

  articleElement.append(headerElement);
  viewport.append(articleElement);

  return articleElement;
}

function createRect(top: number, height: number) {
  return {
    bottom: top + height,
    height,
    left: 0,
    right: 320,
    toJSON: () => ({}),
    top,
    width: 320,
    x: 0,
    y: top,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("findVisibleInvertedRemovalAnchorArticleKey", () => {
  test("prefers the next fully visible survivor when the first visible unread row is removed", () => {
    const viewport = document.createElement("div");
    viewport.dataset.radixScrollAreaViewport = "";
    viewport.getBoundingClientRect = () => createRect(100, 400);

    const virtualizerElement = document.createElement("div");
    virtualizerElement.dataset.feedVirtualizer = "true";
    viewport.append(virtualizerElement);

    appendViewportArticle(viewport, "article-1", 120);
    appendViewportArticle(viewport, "article-2", 220);
    appendViewportArticle(viewport, "article-3", 320);
    document.body.append(viewport);

    expect(
      findVisibleInvertedRemovalAnchorArticleKey(new Set(["article-1"])),
    ).toBe("article-2");
  });

  test("falls back to a partially visible survivor when no fully visible headers remain", () => {
    const viewport = document.createElement("div");
    viewport.dataset.radixScrollAreaViewport = "";
    viewport.getBoundingClientRect = () => createRect(100, 220);

    const virtualizerElement = document.createElement("div");
    virtualizerElement.dataset.feedVirtualizer = "true";
    viewport.append(virtualizerElement);

    appendViewportArticle(viewport, "article-1", 90);
    appendViewportArticle(viewport, "article-2", 290);
    appendViewportArticle(viewport, "article-3", 330);
    document.body.append(viewport);

    expect(
      findVisibleInvertedRemovalAnchorArticleKey(new Set(["article-1"])),
    ).toBe("article-2");
  });
});

describe("findTopVisibleInvertedPaginationAnchorArticleKey", () => {
  test("prefers the first article that reaches the stable anchor offset", () => {
    const viewport = document.createElement("div");
    viewport.dataset.radixScrollAreaViewport = "";
    viewport.getBoundingClientRect = () => createRect(100, 400);

    const virtualizerElement = document.createElement("div");
    virtualizerElement.dataset.feedVirtualizer = "true";
    viewport.append(virtualizerElement);

    appendViewportArticle(viewport, "article-1", 80);
    appendViewportArticle(viewport, "article-2", 180);
    appendViewportArticle(viewport, "article-3", 280);
    document.body.append(viewport);

    expect(findTopVisibleInvertedPaginationAnchorArticleKey()).toBe(
      "article-3",
    );
  });

  test("skips nearer rows until one reaches the stable anchor offset", () => {
    const viewport = document.createElement("div");
    viewport.dataset.radixScrollAreaViewport = "";
    viewport.getBoundingClientRect = () => createRect(100, 400);

    const virtualizerElement = document.createElement("div");
    virtualizerElement.dataset.feedVirtualizer = "true";
    viewport.append(virtualizerElement);

    appendViewportArticle(viewport, "article-1", 40);
    appendViewportArticle(viewport, "article-2", 130);
    appendViewportArticle(viewport, "article-3", 260);
    document.body.append(viewport);

    expect(findTopVisibleInvertedPaginationAnchorArticleKey()).toBe(
      "article-3",
    );
  });
});
