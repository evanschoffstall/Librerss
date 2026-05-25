import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import type { Article } from "@/lib/core";

import {
  applyReadSwipeAction,
  ArticleCard,
} from "@/app/dashboard/components/article-view/ArticleCard";

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
    const articleSurface = container.querySelector<HTMLElement>(
      'article[data-article-key="article-1"]',
    );

    expect(hydrationEl).toBeTruthy();
    expect(hydrationEl?.querySelectorAll("div").length).toBeGreaterThan(0);
    expect(container.querySelector('[data-article-preview="true"]')).toBeNull();
    expect(articleSurface?.style.userSelect).toBe("text");
    expect(
      (hydrationEl as HTMLElement | null)?.style.transform ?? "",
    ).not.toContain("translateY");
  });

  test("swaps loading skeleton for hydrated expanded content", async () => {
    const hydratedContent =
      "Expanded hydration content with enough detail to prove the full article body replaced the loading placeholder.";
    const article = buildArticle({ content: "" });

    const { container, rerender } = render(
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

    expect(
      container.querySelector('[data-article-hydration-state="loading"]'),
    ).toBeTruthy();

    rerender(
      <ArticleCard
        article={buildArticle({ content: hydratedContent })}
        articleKey="article-1"
        hasScrapedContent={true}
        isDark={false}
        isExpanded={true}
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

    await waitFor(() => {
      expect(
        container.querySelector('[data-article-hydration-state="loading"]'),
      ).toBeNull();
      expect(
        container.querySelector('[data-article-preview="true"]'),
      ).toBeNull();
      expect(container.textContent?.includes(hydratedContent)).toBe(true);
    });
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

    expect(heading.className).toContain("line-clamp-2");
    expect(heading.className).toContain("max-h-12");
    expect(collapsedPreview?.textContent).toBe(
      "First line Second line Third line after spacing.",
    );
  });

  test("collapsed preview decodes HTML entities to visible characters", () => {
    const article = buildArticle({
      content:
        "<p>The team&rsquo;s &ldquo;Project X&rdquo; &mdash; is great.</p>",
    });

    const { container } = render(
      <ArticleCard
        article={article}
        articleKey="article-entities"
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

    const collapsedPreview = container.querySelector(
      '[data-article-preview="true"]',
    );
    const previewText = collapsedPreview?.textContent ?? "";

    expect(previewText).toContain("team\u2019s");
    expect(previewText).toContain("\u201CProject X\u201D");
    expect(previewText).toContain("\u2014");
    expect(previewText).not.toContain("&rsquo;");
    expect(previewText).not.toContain("&ldquo;");
    expect(previewText).not.toContain("&rdquo;");
    expect(previewText).not.toContain("&mdash;");
  });

  test("collapsed preview preserves angle brackets from &lt; and &gt;", () => {
    const article = buildArticle({
      content: "<p>Check if x &lt; 10 and y &gt; 5 in your formula.</p>",
    });

    const { container } = render(
      <ArticleCard
        article={article}
        articleKey="article-angle-brackets"
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

    const collapsedPreview = container.querySelector(
      '[data-article-preview="true"]',
    );
    const previewText = collapsedPreview?.textContent ?? "";

    expect(previewText).toContain("x < 10");
    expect(previewText).toContain("y > 5");
    expect(previewText).not.toContain("&lt;");
    expect(previewText).not.toContain("&gt;");
  });

  test("collapsed preview preserves numeric entity decoded characters", () => {
    const article = buildArticle({
      content:
        "<p>It&#8217;s a &#8220;wonderful&#8221; day &#8212; really.</p>",
    });

    const { container } = render(
      <ArticleCard
        article={article}
        articleKey="article-numeric-entities"
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

    const collapsedPreview = container.querySelector(
      '[data-article-preview="true"]',
    );
    const previewText = collapsedPreview?.textContent ?? "";

    expect(previewText).toBe(
      "It\u2019s a \u201Cwonderful\u201D day \u2014 really.",
    );
  });

  test("full extract→sanitize→hydrate pipeline preserves all characters", () => {
    // Simulate the feed extraction + sanitization pipeline that stores content
    const { sanitizeArticleHtml } = require("@/lib/sanitize");
    const rawFeedContent = `
      <p>The study&rsquo;s plan &mdash; its most detailed mission &mdash; sends
      observers to the site. Scientists suggest the mission&rsquo;s success
      depends on systems &amp; processes working together.</p>
    `;
    // This is what gets stored in the DB after extraction
    const storedContent = sanitizeArticleHtml(rawFeedContent);

    const article = buildArticle({ content: storedContent });

    const { container } = render(
      <ArticleCard
        article={article}
        articleKey="article-full-pipeline"
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

    const collapsedPreview = container.querySelector(
      '[data-article-preview="true"]',
    );
    const preview = collapsedPreview?.textContent ?? "";

    // Every "s" character must survive the pipeline (sanitize-html decodes &rsquo; to literal ')
    expect(preview).toContain("study\u2019s plan");
    expect(preview).toContain("observers");
    expect(preview).toContain("Scientists");
    expect(preview).toContain("suggest");
    expect(preview).toContain("mission\u2019s success depends on");

    // No raw entity text should appear
    expect(preview).not.toContain("&rsquo;");
    expect(preview).not.toContain("&mdash;");
    expect(preview).not.toContain("&amp;");
  });

  test("full pipeline preserves M&S brand and s-heavy content", () => {
    const { sanitizeArticleHtml } = require("@/lib/sanitize");
    const rawFeedContent =
      "<p>M&amp;S scientists suggest several species success stories are special.</p>";
    const storedContent = sanitizeArticleHtml(rawFeedContent);

    const article = buildArticle({ content: storedContent });

    const { container } = render(
      <ArticleCard
        article={article}
        articleKey="article-s-heavy"
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

    const collapsedPreview = container.querySelector(
      '[data-article-preview="true"]',
    );
    const preview = collapsedPreview?.textContent ?? "";

    expect(preview).toContain("M&S");
    expect(preview).toContain("scientists");
    expect(preview).toContain("suggest");
    expect(preview).toContain("several");
    expect(preview).toContain("species");
    expect(preview).toContain("success");
    expect(preview).toContain("stories");
    expect(preview).toContain("special");
  });

  test("full pipeline with semicolons near s does not strip text", () => {
    const { sanitizeArticleHtml } = require("@/lib/sanitize");
    const rawFeedContent =
      "<p>business; services &amp; specialists; discussion; success;</p>";
    const storedContent = sanitizeArticleHtml(rawFeedContent);

    const article = buildArticle({ content: storedContent });

    const { container } = render(
      <ArticleCard
        article={article}
        articleKey="article-semicolons"
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

    const collapsedPreview = container.querySelector(
      '[data-article-preview="true"]',
    );
    const preview = collapsedPreview?.textContent ?? "";

    expect(preview).toContain("business;");
    expect(preview).toContain("services");
    expect(preview).toContain("specialists;");
    expect(preview).toContain("discussion;");
    expect(preview).toContain("success;");
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

  test("does not toggle the card when the read button is clicked", () => {
    const article = buildArticle();
    const onPrepareExpand = mock(() => {});
    const onToggle = mock(() => {});
    const onToggleRead = mock(() => {});

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
        onExpandedSwipeRead={() => {}}
        onPrepareExpand={onPrepareExpand}
        onToggle={onToggle}
        onToggleRead={onToggleRead}
        onToggleStarred={() => {}}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    fireEvent.pointerDown(getByRole("button", { name: "Mark as read" }), {
      clientX: 24,
      clientY: 20,
      pointerId: 7,
      pointerType: "mouse",
    });
    fireEvent.click(getByRole("button", { name: "Mark as read" }));

    expect(onToggleRead).toHaveBeenCalledTimes(1);
    expect(onPrepareExpand).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
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

    applyReadSwipeAction({
      article,
      isExpanded: true,
      onExpandedSwipeRead,
      onToggleRead,
    });

    await waitFor(() => {
      expect(onExpandedSwipeRead).toHaveBeenCalledTimes(1);
      expect(onExpandedSwipeRead).toHaveBeenCalledWith(article);
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

  test("read swipe indicator reaches at-threshold state while finger is still dragging past 30%", async () => {
    // Regression: data-swipe-read-at-threshold must flip to "true" as soon as
    // the drag crosses 30% of the container width, not only after pointer-up.
    // Previously the visual state was gated on SwipeState.committed which only
    // became true post-release, so the colour and icon never changed during the
    // drag.
    const article = buildArticle({ content: "" });
    const noop = () => {};

    const { container } = render(
      <ArticleCard
        article={article}
        articleKey="article-swipe-read-threshold"
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

    const articleSurface = container.querySelector<HTMLElement>(
      'article[data-article-key="article-swipe-read-threshold"]',
    );
    expect(articleSurface).not.toBeNull();
    installPointerCaptureSpies(articleSurface as HTMLElement);

    // Container width falls back to 300px in jsdom. Drag past 30% (90px) while
    // keeping the pointer down so committed is still false.
    fireEvent.pointerDown(articleSurface as HTMLElement, {
      clientX: 0,
      clientY: 10,
      pointerId: 30,
      pointerType: "touch",
    });
    fireEvent.pointerMove(articleSurface as HTMLElement, {
      clientX: 100, // 100 / 300 ≈ 33% – past the 30% threshold
      clientY: 10,
      pointerId: 30,
      pointerType: "touch",
    });

    await waitFor(() => {
      // Active swipe must be detected.
      expect(articleSurface?.getAttribute("data-swipe-active")).toBe("true");
      expect(articleSurface?.getAttribute("data-swipe-direction")).toBe("read");
      // At-threshold flag must be set before pointer-up.
      expect(articleSurface?.getAttribute("data-swipe-read-at-threshold")).toBe(
        "true",
      );
    });

    // Release the pointer so the gesture resets properly between tests.
    fireEvent.pointerUp(articleSurface as HTMLElement, {
      clientX: 100,
      clientY: 10,
      pointerId: 30,
      pointerType: "touch",
    });
  });

  test("read swipe indicator stays below at-threshold state when drag is under 30%", async () => {
    // The at-threshold flag must remain false while the user is still below the
    // commit threshold — showing the wrong state early would be a false signal.
    const article = buildArticle({ content: "" });
    const noop = () => {};

    const { container } = render(
      <ArticleCard
        article={article}
        articleKey="article-swipe-read-below"
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

    const articleSurface = container.querySelector<HTMLElement>(
      'article[data-article-key="article-swipe-read-below"]',
    );
    expect(articleSurface).not.toBeNull();
    installPointerCaptureSpies(articleSurface as HTMLElement);

    // Drag only 20% of the 300px fallback container width (60px).
    fireEvent.pointerDown(articleSurface as HTMLElement, {
      clientX: 0,
      clientY: 10,
      pointerId: 31,
      pointerType: "touch",
    });
    fireEvent.pointerMove(articleSurface as HTMLElement, {
      clientX: 60, // 60 / 300 = 20% – below threshold
      clientY: 10,
      pointerId: 31,
      pointerType: "touch",
    });

    await waitFor(() => {
      expect(articleSurface?.getAttribute("data-swipe-active")).toBe("true");
      // Below threshold: at-threshold attribute must be "false".
      expect(articleSurface?.getAttribute("data-swipe-read-at-threshold")).toBe(
        "false",
      );
    });

    fireEvent.pointerUp(articleSurface as HTMLElement, {
      clientX: 60,
      clientY: 10,
      pointerId: 31,
      pointerType: "touch",
    });
  });

  test("star swipe indicator reaches at-threshold state while finger is still dragging past 30%", async () => {
    // Same regression as the read swipe test but for the left-swipe star action.
    const article = buildArticle({ content: "" });
    const noop = () => {};

    const { container } = render(
      <ArticleCard
        article={article}
        articleKey="article-swipe-star-threshold"
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

    const articleSurface = container.querySelector<HTMLElement>(
      'article[data-article-key="article-swipe-star-threshold"]',
    );
    expect(articleSurface).not.toBeNull();
    installPointerCaptureSpies(articleSurface as HTMLElement);

    // Drag left past 30% of the 300px fallback container.
    fireEvent.pointerDown(articleSurface as HTMLElement, {
      clientX: 300,
      clientY: 10,
      pointerId: 32,
      pointerType: "touch",
    });
    fireEvent.pointerMove(articleSurface as HTMLElement, {
      clientX: 195, // 105px leftward = 35% of 300 – past threshold
      clientY: 10,
      pointerId: 32,
      pointerType: "touch",
    });

    await waitFor(() => {
      expect(articleSurface?.getAttribute("data-swipe-active")).toBe("true");
      // Note: data-swipe-direction shows "read" here even during a left drag
      // because the read gesture also enters swiping phase with offsetX=0 (its
      // direction check zeroes out the negative delta). The star-at-threshold
      // flag is the canonical signal for star-swipe visual state.
      expect(articleSurface?.getAttribute("data-swipe-star-at-threshold")).toBe(
        "true",
      );
      // The read indicator must NOT be in at-threshold state during a left swipe.
      expect(articleSurface?.getAttribute("data-swipe-read-at-threshold")).toBe(
        "false",
      );
    });

    fireEvent.pointerUp(articleSurface as HTMLElement, {
      clientX: 195,
      clientY: 10,
      pointerId: 32,
      pointerType: "touch",
    });
  });
});
