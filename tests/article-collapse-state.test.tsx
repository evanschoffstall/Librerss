import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";

import { DASHBOARD_EVENTS } from "@/app/dashboard/constants";
import { useArticleCollapseState } from "@/app/dashboard/hooks/useArticleCollapseState";

import { buildFeedListArticle } from "./feed-list-test-utils";

afterEach(() => {
  document.body.innerHTML = "";
});

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

function mountArticle(viewport: HTMLElement, articleKey: string) {
  const articleElement = document.createElement("article");
  articleElement.dataset.articleKey = articleKey;
  articleElement.getBoundingClientRect = () => createRect(140, 120);

  const headerElement = document.createElement("div");
  headerElement.dataset.articleSwipeZone = "header";
  headerElement.getBoundingClientRect = () => createRect(150, 36);

  articleElement.append(headerElement);
  viewport.append(articleElement);
  return articleElement;
}

describe("useArticleCollapseState", () => {
  test("captures and returns the pre-expand viewport snapshot only for the matching article", async () => {
    const article = buildFeedListArticle({
      id: 1,
      link: "https://example.com/a",
    });
    const viewport = document.createElement("div");
    viewport.dataset.radixScrollAreaViewport = "";
    viewport.getBoundingClientRect = () => createRect(100, 400);
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 440,
      writable: true,
    });
    mountArticle(viewport, article.link);
    document.body.append(viewport);

    const prepared = mock((_event: Event) => {});
    viewport.addEventListener(
      DASHBOARD_EVENTS.ARTICLE_EXPAND_PREPARED,
      prepared,
    );

    const { result } = renderHook(() =>
      useArticleCollapseState({ feed: [article] }),
    );

    await act(async () => {
      result.current.capturePreExpandSnapshot(article);
    });

    expect(
      result.current.getPreExpandViewportSnapshot(article.link)?.articleKey,
    ).toBe(article.link);
    expect(
      result.current.getPreExpandViewportSnapshot(
        "https://example.com/missing",
      ),
    ).toBeNull();
    expect(prepared).toHaveBeenCalledTimes(1);
  });

  test("starts, clears, and expires staged removal animations", async () => {
    const article = buildFeedListArticle({
      id: 2,
      link: "https://example.com/b",
    });
    const { result } = renderHook(() =>
      useArticleCollapseState({ feed: [article] }),
    );

    await act(async () => {
      result.current.startRemovalAnimation(article, "collapse");
    });

    expect(result.current.collapsingArticles[article.link]?.mode).toBe(
      "collapse",
    );

    await act(async () => {
      result.current.clearRemovalAnimation(article.link);
      result.current.clearRemovalAnimation("https://example.com/missing");
      result.current.startRemovalAnimation(
        buildFeedListArticle({ id: 99, link: "https://example.com/missing" }),
        "collapse",
      );
    });

    expect(result.current.collapsingArticles[article.link]).toBeUndefined();

    await act(async () => {
      result.current.startRemovalAnimation(article, "de-expanding");
      result.current.startRemovalAnimation(article, "collapse");
    });

    await waitFor(
      () => {
        expect(result.current.collapsingArticles[article.link]).toBeUndefined();
      },
      { timeout: 500 },
    );
  });

  test("restores against replacement viewport anchors and releases cleanly", async () => {
    const article = buildFeedListArticle({
      id: 3,
      link: "https://example.com/c",
    });
    const initialViewport = document.createElement("div");
    initialViewport.dataset.radixScrollAreaViewport = "";
    initialViewport.getBoundingClientRect = () => createRect(100, 400);
    Object.defineProperty(initialViewport, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(initialViewport, "scrollTop", {
      configurable: true,
      value: 320,
      writable: true,
    });
    const articleElement = mountArticle(initialViewport, article.link);
    document.body.append(initialViewport);

    const dashboardViewport = document.createElement("div");
    dashboardViewport.dataset.radixScrollAreaViewport = "";
    Object.defineProperty(dashboardViewport, "scrollTop", {
      configurable: true,
      value: 0,
      writable: true,
    });
    const virtualizer = document.createElement("div");
    virtualizer.dataset.feedVirtualizer = "true";
    const placeholder = document.createElement("div");
    placeholder.dataset.scrollRestoreKey = article.link;
    virtualizer.append(placeholder);
    dashboardViewport.append(virtualizer);

    const { result } = renderHook(() =>
      useArticleCollapseState({ feed: [article] }),
    );

    await act(async () => {
      result.current.capturePreExpandSnapshot(article);
    });

    articleElement.remove();
    document.body.append(dashboardViewport);

    await act(async () => {
      result.current.restoreCollapseScrollPosition(article.link);
    });

    expect(result.current.isCollapseScrollRestoreActive).toBe(true);
    expect(dashboardViewport.scrollTop).toBe(320);
    expect(dashboardViewport.style.overflowAnchor).toBe("none");

    await act(async () => {
      dashboardViewport.dispatchEvent(new Event("wheel"));
    });

    expect(result.current.isCollapseScrollRestoreActive).toBe(false);
    expect(dashboardViewport.style.overflowAnchor).toBe("");
  });

  test("releases the active restore when the viewport disappears before the next sync", async () => {
    const nativePerformanceNow = performance.now;
    let now = 0;
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: () => now,
    });

    const article = buildFeedListArticle({
      id: 5,
      link: "https://example.com/e",
    });
    const viewport = document.createElement("div");
    viewport.dataset.radixScrollAreaViewport = "";
    viewport.getBoundingClientRect = () => createRect(100, 400);
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 220,
      writable: true,
    });
    mountArticle(viewport, article.link);
    document.body.append(viewport);

    const { result } = renderHook(() =>
      useArticleCollapseState({ feed: [article] }),
    );

    await act(async () => {
      result.current.capturePreExpandSnapshot(article);
      result.current.restoreCollapseScrollPosition(article.link);
    });

    expect(result.current.isCollapseScrollRestoreActive).toBe(true);

    viewport.remove();
    now = 10_000;

    await waitFor(() => {
      expect(result.current.isCollapseScrollRestoreActive).toBe(false);
    });

    Object.defineProperty(performance, "now", {
      configurable: true,
      value: nativePerformanceNow,
    });
  });

  test("ignores non-restorable or missing snapshots", async () => {
    const article = buildFeedListArticle({
      id: 4,
      link: "https://example.com/d",
    });
    const viewport = document.createElement("div");
    viewport.dataset.radixScrollAreaViewport = "";
    viewport.getBoundingClientRect = () => createRect(100, 400);
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 900,
      writable: true,
    });

    const articleElement = document.createElement("article");
    articleElement.dataset.articleKey = article.link;
    articleElement.getBoundingClientRect = () => createRect(-520, 0);
    viewport.append(articleElement);
    document.body.append(viewport);

    const { result } = renderHook(() =>
      useArticleCollapseState({ feed: [article] }),
    );

    await act(async () => {
      result.current.restoreCollapseScrollPosition(article.link);
      result.current.capturePreExpandSnapshot(article);
      result.current.restoreCollapseScrollPosition(article.link);
      result.current.cancelCollapseScrollRestore();
    });

    expect(result.current.isCollapseScrollRestoreActive).toBe(false);
    expect(
      result.current.getPreExpandViewportSnapshot(article.link),
    ).toBeNull();
  });
});
