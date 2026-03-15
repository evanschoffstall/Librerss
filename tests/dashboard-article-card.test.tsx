import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { fireEvent, render, waitFor } from "@testing-library/react";

import { ArticleCard } from "@/app/dashboard/components/ArticleCard";
import { type Article } from "@/lib";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

function buildArticle(overrides?: Partial<Article>): Article {
  return {
    content: "",
    feedId: 1,
    feedName: "Example Feed",
    feedUrl: "https://example.com/feed.xml",
    id: 1,
    isRead: false,
    isStarred: false,
    lastChecked: new Date("2026-03-13T10:00:00.000Z"),
    link: "https://example.com/articles/perf",
    publicationDate: new Date("2026-03-13T09:00:00.000Z"),
    title: "Performance-sensitive article",
    ...overrides,
  };
}

function installPointerCaptureSpies(surface: HTMLElement) {
  const setPointerCapture = mock(() => {});
  const releasePointerCapture = mock(() => {});

  Object.assign(surface, {
    hasPointerCapture: () => true,
    releasePointerCapture,
    setPointerCapture,
  });

  return { releasePointerCapture, setPointerCapture };
}

function swipeOnTouch(
  target: Element,
  pointerId: number,
  startX: number,
  endX: number,
) {
  fireEvent.pointerDown(target, {
    clientX: startX,
    clientY: 10,
    pointerId,
    pointerType: "touch",
  });
  fireEvent.pointerMove(target, {
    clientX: endX,
    clientY: 12,
    pointerId,
    pointerType: "touch",
  });
  fireEvent.pointerUp(target, {
    clientX: endX,
    clientY: 12,
    pointerId,
    pointerType: "touch",
  });
}

describe("ArticleCard", () => {
  test("renders skeleton placeholders while expanded content is being fetched", () => {
    const article = buildArticle({ content: "" });

    const { container } = render(
      <ArticleCard
        article={article}
        articleKey="article-1"
        hasScrapedContent={false}
        isDark={false}
        isExpanded={true}
        isHydrating={true}
        isMobile={false}
        isUpdatingState={false}
        onExpandedSwipeRead={() => {}}
        onToggle={() => {}}
        onToggleRead={() => {}}
        onToggleStarred={() => {}}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    const hydrationEl = container.querySelector(
      '[data-article-hydration-state="loading"]',
    );
    expect(hydrationEl).toBeTruthy();
    expect(hydrationEl?.querySelectorAll("div").length).toBeGreaterThan(0);
    expect(container.querySelector('[data-article-preview="true"]')).toBeNull();
  });

  test("does not mount the full article body while collapsed", async () => {
    const longContent = Array.from({ length: 80 }, () => "expanded-body").join(
      " ",
    );
    const article = buildArticle({ content: longContent });
    const noop = () => {};

    const { container, rerender } = render(
      <ArticleCard
        article={article}
        articleKey="article-1"
        hasScrapedContent={false}
        isDark={false}
        isExpanded={false}
        isHydrating={false}
        isMobile={false}
        isUpdatingState={false}
        onExpandedSwipeRead={noop}
        onToggle={noop}
        onToggleRead={noop}
        onToggleStarred={noop}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    expect(container.textContent?.includes(longContent)).toBe(false);

    rerender(
      <ArticleCard
        article={article}
        articleKey="article-1"
        hasScrapedContent={false}
        isDark={false}
        isExpanded={true}
        isHydrating={false}
        isMobile={false}
        isUpdatingState={false}
        onExpandedSwipeRead={noop}
        onToggle={noop}
        onToggleRead={noop}
        onToggleStarred={noop}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    await waitFor(() => {
      expect(container.textContent?.includes(longContent)).toBe(true);
    });
  });

  test("keeps collapsed preview single-line and title clamped to two lines", () => {
    const article = buildArticle({
      content: "First line\n\n\nSecond line\t\tThird line after spacing.",
      title:
        "A very long article title that should remain clamped to exactly two lines in collapsed mode",
    });

    const { container, getByRole } = render(
      <ArticleCard
        article={article}
        articleKey="article-1"
        hasScrapedContent={false}
        isDark={false}
        isExpanded={false}
        isHydrating={false}
        isMobile={false}
        isUpdatingState={false}
        onExpandedSwipeRead={() => {}}
        onToggle={() => {}}
        onToggleRead={() => {}}
        onToggleStarred={() => {}}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    const heading = getByRole("heading", { name: article.title });
    const collapsedPreview = container.querySelector(
      '[data-article-preview="true"]',
    );
    const measurePreview = container.querySelector(
      '[data-article-preview-measure="true"]',
    );

    expect(heading.className).toContain("line-clamp-2");
    expect(heading.className).toContain("max-h-12");
    expect(collapsedPreview?.textContent).toBe(
      "First line Second line Third line after spacing.",
    );
    expect(measurePreview?.textContent).toBe(
      "First line Second line Third line after spacing.…",
    );
  });

  test("primes the pre-expand snapshot on pointer down before toggling", () => {
    const article = buildArticle();
    const onPrepareExpand = mock(() => {});
    const onToggle = mock(() => {});

    const { container } = render(
      <ArticleCard
        article={article}
        articleKey="article-1"
        hasScrapedContent={false}
        isDark={false}
        isExpanded={false}
        isHydrating={false}
        isMobile={false}
        isUpdatingState={false}
        onExpandedSwipeRead={() => {}}
        onPrepareExpand={onPrepareExpand}
        onToggle={onToggle}
        onToggleRead={() => {}}
        onToggleStarred={() => {}}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    const articleSurface = container.querySelector(
      'article[data-article-key="article-1"][role="button"]',
    );

    expect(articleSurface).not.toBeNull();

    fireEvent.pointerDown(articleSurface as HTMLElement, {
      clientX: 24,
      clientY: 20,
      pointerId: 21,
      pointerType: "mouse",
    });
    fireEvent.click(articleSurface as HTMLElement, {
      clientX: 24,
      clientY: 20,
    });

    expect(onPrepareExpand).toHaveBeenCalledTimes(1);
    expect(onPrepareExpand.mock.invocationCallOrder[0]).toBeLessThan(
      onToggle.mock.invocationCallOrder[0],
    );
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test("primes the pre-expand snapshot for click fallback without pointer down", () => {
    const article = buildArticle();
    const onPrepareExpand = mock(() => {});
    const onToggle = mock(() => {});

    const { container } = render(
      <ArticleCard
        article={article}
        articleKey="article-1"
        hasScrapedContent={false}
        isDark={false}
        isExpanded={false}
        isHydrating={false}
        isMobile={false}
        isUpdatingState={false}
        onExpandedSwipeRead={() => {}}
        onPrepareExpand={onPrepareExpand}
        onToggle={onToggle}
        onToggleRead={() => {}}
        onToggleStarred={() => {}}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    const articleSurface = container.querySelector(
      'article[data-article-key="article-1"][role="button"]',
    );

    expect(articleSurface).not.toBeNull();

    fireEvent.click(articleSurface as HTMLElement, {
      clientX: 24,
      clientY: 20,
    });

    expect(onPrepareExpand).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onPrepareExpand.mock.invocationCallOrder[0]).toBeLessThan(
      onToggle.mock.invocationCallOrder[0],
    );
  });

  test("commits swipe-to-read from the collapsed header", async () => {
    const article = buildArticle();
    const onToggle = mock(() => {});
    const onToggleRead = mock(() => {});
    const onExpandedSwipeRead = mock(() => {});
    const onSwipeRead = mock(() => {});

    const { getByRole } = render(
      <ArticleCard
        article={article}
        articleKey="article-1"
        hasScrapedContent={false}
        isDark={false}
        isExpanded={false}
        isHydrating={false}
        isMobile={false}
        isUpdatingState={false}
        onExpandedSwipeRead={onExpandedSwipeRead}
        onSwipeRead={onSwipeRead}
        onToggle={onToggle}
        onToggleRead={onToggleRead}
        onToggleStarred={() => {}}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    const heading = getByRole("heading", { name: article.title });
    const articleSurface = heading.closest("article");

    expect(articleSurface).not.toBeNull();
    const { releasePointerCapture, setPointerCapture } =
      installPointerCaptureSpies(articleSurface as HTMLElement);

    swipeOnTouch(heading, 11, 20, 190);

    await waitFor(() => {
      expect(setPointerCapture).toHaveBeenCalledWith(11);
      expect(releasePointerCapture).toHaveBeenCalledWith(11);
      expect(onSwipeRead).toHaveBeenCalledTimes(1);
      expect(onToggleRead).not.toHaveBeenCalled();
      expect(onExpandedSwipeRead).not.toHaveBeenCalled();
      expect(onToggle).not.toHaveBeenCalled();
    });
  });

  test("commits swipe-to-read from the expanded header without toggling", async () => {
    const article = buildArticle({ content: "Expanded body copy" });
    const onToggle = mock(() => {});
    const onToggleRead = mock(() => {});
    const onExpandedSwipeRead = mock(() => {});

    const { getByRole } = render(
      <ArticleCard
        article={article}
        articleKey="article-1"
        hasScrapedContent={true}
        isDark={false}
        isExpanded={true}
        isHydrating={false}
        isMobile={false}
        isUpdatingState={false}
        onExpandedSwipeRead={onExpandedSwipeRead}
        onToggle={onToggle}
        onToggleRead={onToggleRead}
        onToggleStarred={() => {}}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    const heading = getByRole("heading", { name: article.title });
    const articleSurface = heading.closest("article");

    expect(articleSurface).not.toBeNull();
    const { releasePointerCapture, setPointerCapture } =
      installPointerCaptureSpies(articleSurface as HTMLElement);

    swipeOnTouch(heading, 12, 24, 210);

    await waitFor(() => {
      expect(setPointerCapture).toHaveBeenCalledWith(12);
      expect(releasePointerCapture).toHaveBeenCalledWith(12);
      expect(onExpandedSwipeRead).toHaveBeenCalledTimes(1);
      expect(onToggleRead).not.toHaveBeenCalled();
      expect(onToggle).not.toHaveBeenCalled();
    });
  });

  test("commits swipe-to-read from the expanded article body", async () => {
    const article = buildArticle({
      content: "Expanded body copy repeated for swipe surface coverage.",
    });
    const onToggle = mock(() => {});
    const onToggleRead = mock(() => {});
    const onExpandedSwipeRead = mock(() => {});

    const { container } = render(
      <ArticleCard
        article={article}
        articleKey="article-1"
        hasScrapedContent={true}
        isDark={false}
        isExpanded={true}
        isHydrating={false}
        isMobile={false}
        isUpdatingState={false}
        onExpandedSwipeRead={onExpandedSwipeRead}
        onToggle={onToggle}
        onToggleRead={onToggleRead}
        onToggleStarred={() => {}}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    const articleSurface = container.querySelector("article");
    const bodySurface = container.querySelector(".article-swipe-body p");

    expect(articleSurface).not.toBeNull();
    expect(bodySurface).not.toBeNull();
    const { releasePointerCapture, setPointerCapture } =
      installPointerCaptureSpies(articleSurface as HTMLElement);

    swipeOnTouch(bodySurface as Element, 15, 30, 220);

    await waitFor(() => {
      expect(setPointerCapture).toHaveBeenCalledWith(15);
      expect(releasePointerCapture).toHaveBeenCalledWith(15);
      expect(onExpandedSwipeRead).toHaveBeenCalledTimes(1);
      expect(onToggleRead).not.toHaveBeenCalled();
      expect(onToggle).not.toHaveBeenCalled();
    });
  });

  test("commits swipe-to-read from the header after expanding an already-mounted card", async () => {
    const article = buildArticle({ content: "Expanded body copy" });
    const onToggle = mock(() => {});
    const onToggleRead = mock(() => {});
    const onExpandedSwipeRead = mock(() => {});

    const { getByRole, rerender } = render(
      <ArticleCard
        article={article}
        articleKey="article-1"
        hasScrapedContent={false}
        isDark={false}
        isExpanded={false}
        isHydrating={false}
        isMobile={false}
        isUpdatingState={false}
        onExpandedSwipeRead={onExpandedSwipeRead}
        onToggle={onToggle}
        onToggleRead={onToggleRead}
        onToggleStarred={() => {}}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    rerender(
      <ArticleCard
        article={article}
        articleKey="article-1"
        hasScrapedContent={true}
        isDark={false}
        isExpanded={true}
        isHydrating={false}
        isMobile={false}
        isUpdatingState={false}
        onExpandedSwipeRead={onExpandedSwipeRead}
        onToggle={onToggle}
        onToggleRead={onToggleRead}
        onToggleStarred={() => {}}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    const heading = getByRole("heading", { name: article.title });
    const articleSurface = heading.closest("article");

    expect(articleSurface).not.toBeNull();
    const { releasePointerCapture, setPointerCapture } =
      installPointerCaptureSpies(articleSurface as HTMLElement);

    swipeOnTouch(heading, 13, 30, 215);

    await waitFor(() => {
      expect(setPointerCapture).toHaveBeenCalledWith(13);
      expect(releasePointerCapture).toHaveBeenCalledWith(13);
      expect(onExpandedSwipeRead).toHaveBeenCalledTimes(1);
      expect(onToggleRead).not.toHaveBeenCalled();
    });
  });

  test("commits swipe-to-read from the header after collapsing back to compact mode", async () => {
    const article = buildArticle({ content: "Expanded body copy" });
    const onToggle = mock(() => {});
    const onToggleRead = mock(() => {});
    const onExpandedSwipeRead = mock(() => {});

    const { getByRole, rerender } = render(
      <ArticleCard
        article={article}
        articleKey="article-1"
        hasScrapedContent={true}
        isDark={false}
        isExpanded={true}
        isHydrating={false}
        isMobile={false}
        isUpdatingState={false}
        onExpandedSwipeRead={onExpandedSwipeRead}
        onToggle={onToggle}
        onToggleRead={onToggleRead}
        onToggleStarred={() => {}}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    rerender(
      <ArticleCard
        article={article}
        articleKey="article-1"
        hasScrapedContent={false}
        isDark={false}
        isExpanded={false}
        isHydrating={false}
        isMobile={false}
        isUpdatingState={false}
        onExpandedSwipeRead={onExpandedSwipeRead}
        onToggle={onToggle}
        onToggleRead={onToggleRead}
        onToggleStarred={() => {}}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    const heading = getByRole("heading", { name: article.title });
    const articleSurface = heading.closest("article");

    expect(articleSurface).not.toBeNull();
    const { releasePointerCapture, setPointerCapture } =
      installPointerCaptureSpies(articleSurface as HTMLElement);

    swipeOnTouch(heading, 14, 22, 195);

    await waitFor(() => {
      expect(setPointerCapture).toHaveBeenCalledWith(14);
      expect(releasePointerCapture).toHaveBeenCalledWith(14);
      expect(onToggleRead).toHaveBeenCalledTimes(1);
      expect(onExpandedSwipeRead).not.toHaveBeenCalled();
    });
  });
});
