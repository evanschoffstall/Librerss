import type { SetStateAction } from "react";

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { toast } from "sonner";

import { ALL_FEEDS_NODE_KEY } from "@/app/dashboard/constants";
import {
  addCategoryLabel,
  moveCategoryByDropInOrder,
  removeCategoryAndRefresh,
  renameCategoryAndRefresh,
} from "@/app/dashboard/services/category-operations";
import {
  addFeedSourceAndRefresh,
  moveFeedByDropAndPersist,
  removeFeedSourceAndRefresh,
  renameFeedSourceAndRefresh,
  selectFeedByKeyFromCategories,
  setFeedSourceEnabledAndRefresh,
  updateFeedSettingsAndRefresh,
} from "@/app/dashboard/services/feed-source-operations";
import { importOpmlFeedsAndRefresh } from "@/app/dashboard/services/opml-import";
import { type Article, type CategoryTreeNode, DEFAULT_CATEGORY_LABEL, FeedService } from "@/lib";

const originalCreateFeedSource = FeedService.createFeedSource;
const originalDeleteFeedSource = FeedService.deleteFeedSource;
const originalRenameFeedSource = FeedService.renameFeedSource;
const originalSetFeedSourceEnabled = FeedService.setFeedSourceEnabled;
const originalUpdateFeedSettings = FeedService.updateFeedSettings;
const originalConsoleError = console.error;
const originalToastError = toast.error;
const originalToastSuccess = toast.success;

function createStateHarness<T>(initialValue: T) {
  let currentValue = initialValue;
  const setter = mock((nextValue: SetStateAction<T>) => {
    currentValue =
      typeof nextValue === "function"
        ? (nextValue as (current: T) => T)(currentValue)
        : nextValue;
  });

  return {
    get current() {
      return currentValue;
    },
    setter,
  };
}

function makeCategoryNode(
  label: string,
  children: CategoryTreeNode[] = [],
): CategoryTreeNode {
  return {
    children,
    key: `cat-${label.toLowerCase()}`,
    label,
  };
}

function makeFeedNode(options: {
  category?: string;
  key?: string;
  label?: string;
  sourceId?: number;
  url?: string;
} = {}): CategoryTreeNode {
  const {
    category = DEFAULT_CATEGORY_LABEL,
    key = `cat-${category.toLowerCase()}-${options.sourceId ?? 1}`,
    label = `Feed ${options.sourceId ?? 1}`,
    sourceId = 1,
    url = `https://example.com/feed-${sourceId}.xml`,
  } = options;

  return {
    data: { category, enabled: true, sourceId, url },
    key,
    label,
  };
}

describe("dashboard category operations", () => {
  beforeEach(() => {
    mock.restore();
    FeedService.createFeedSource = mock(async () => ({})) as typeof FeedService.createFeedSource;
    FeedService.deleteFeedSource = mock(async () => ({})) as typeof FeedService.deleteFeedSource;
    FeedService.renameFeedSource = mock(async () => ({})) as typeof FeedService.renameFeedSource;
    FeedService.setFeedSourceEnabled = mock(async () => ({})) as typeof FeedService.setFeedSourceEnabled;
    FeedService.updateFeedSettings = mock(async () => ({})) as typeof FeedService.updateFeedSettings;
    toast.error = mock(() => "") as typeof toast.error;
    toast.success = mock(() => "") as typeof toast.success;
    console.error = (() => {}) as typeof console.error;
  });

  afterAll(() => {
    FeedService.createFeedSource =
      originalCreateFeedSource as typeof FeedService.createFeedSource;
    FeedService.deleteFeedSource =
      originalDeleteFeedSource as typeof FeedService.deleteFeedSource;
    FeedService.renameFeedSource =
      originalRenameFeedSource as typeof FeedService.renameFeedSource;
    FeedService.setFeedSourceEnabled =
      originalSetFeedSourceEnabled as typeof FeedService.setFeedSourceEnabled;
    FeedService.updateFeedSettings =
      originalUpdateFeedSettings as typeof FeedService.updateFeedSettings;
    toast.error = originalToastError;
    toast.success = originalToastSuccess;
    console.error = originalConsoleError;
    mock.restore();
  });

  test("validates and adds normalized category labels", () => {
    const customLabels = createStateHarness<string[]>(["Tech"]);

    expect(
      addCategoryLabel({
        categories: [makeCategoryNode(DEFAULT_CATEGORY_LABEL)],
        customCategoryLabels: [],
        label: "   ",
        setCustomCategoryLabels:
          customLabels.setter as unknown as React.Dispatch<
            React.SetStateAction<string[]>
          >,
      }),
    ).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Category already exists.");

    expect(
      addCategoryLabel({
        categories: [],
        customCategoryLabels: ["Tech"],
        label: "tech",
        setCustomCategoryLabels:
          customLabels.setter as unknown as React.Dispatch<
            React.SetStateAction<string[]>
          >,
      }),
    ).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Category already exists.");

    expect(
      addCategoryLabel({
        categories: [],
        customCategoryLabels: customLabels.current,
        label: "  Science  ",
        setCustomCategoryLabels:
          customLabels.setter as unknown as React.Dispatch<
            React.SetStateAction<string[]>
          >,
      }),
    ).toBe(true);
    expect(customLabels.current).toEqual(["Tech", "Science"]);
  });

  test("reorders categories by drop position and leaves unknown labels untouched", () => {
    expect(moveCategoryByDropInOrder(["News", "Tech", "Science"], "Tech", 0)).toEqual([
      "Tech",
      "News",
      "Science",
    ]);
    expect(
      moveCategoryByDropInOrder(["News", "Tech", "Science"], "Unknown", 2),
    ).toEqual(["News", "Tech", "Science"]);
  });

  test("removes empty categories immediately from local state", async () => {
    const categories = createStateHarness<CategoryTreeNode[]>([
      makeCategoryNode("News"),
      makeCategoryNode("Tech", [makeFeedNode({ category: "Tech", sourceId: 2 })]),
    ]);
    const customLabels = createStateHarness<string[]>(["News", "Tech"]);
    const orderedLabels = createStateHarness<string[]>(["News", "Tech"]);
    const pendingRemoval = createStateHarness<null | string>("News");
    const selectedCategory = createStateHarness("cat-tech-2");

    const removed = await removeCategoryAndRefresh({
      categories: categories.current,
      customCategoryLabels: customLabels.current,
      ensureCategoryLabelExists: mock(() => {}),
      label: "News",
      loadFeedSources: mock(async () => categories.current),
      pendingCategoryRemovalLabel: pendingRemoval.current,
      selectedCategory: selectedCategory.current,
      setCategories:
        categories.setter as unknown as React.Dispatch<
          React.SetStateAction<CategoryTreeNode[]>
        >,
      setCustomCategoryLabels:
        customLabels.setter as unknown as React.Dispatch<
          React.SetStateAction<string[]>
        >,
      setOrderedCategoryLabels:
        orderedLabels.setter as unknown as React.Dispatch<
          React.SetStateAction<string[]>
        >,
      setPendingCategoryRemovalLabel:
        pendingRemoval.setter as unknown as React.Dispatch<
          React.SetStateAction<null | string>
        >,
      setSelectedCategory:
        selectedCategory.setter as unknown as React.Dispatch<
          React.SetStateAction<string>
        >,
    });

    expect(removed).toBe(true);
    expect(categories.current.map((category) => category.label)).toEqual(["Tech"]);
    expect(customLabels.current).toEqual(["Tech"]);
    expect(orderedLabels.current).toEqual(["Tech"]);
    expect(pendingRemoval.current).toBeNull();
  });

  test("requires confirmation before removing populated categories and refuses the last remaining category", async () => {
    const categories = [
      makeCategoryNode("News", [makeFeedNode({ category: "News", sourceId: 1 })]),
    ];
    const pendingRemoval = createStateHarness<null | string>(null);

    const firstAttempt = await removeCategoryAndRefresh({
      categories,
      customCategoryLabels: ["News"],
      ensureCategoryLabelExists: mock(() => {}),
      label: "News",
      loadFeedSources: mock(async () => categories),
      pendingCategoryRemovalLabel: pendingRemoval.current,
      selectedCategory: "cat-news-1",
      setCategories: mock(() => {}) as unknown as React.Dispatch<
        React.SetStateAction<CategoryTreeNode[]>
      >,
      setCustomCategoryLabels: mock(() => {}) as unknown as React.Dispatch<
        React.SetStateAction<string[]>
      >,
      setOrderedCategoryLabels: mock(() => {}) as unknown as React.Dispatch<
        React.SetStateAction<string[]>
      >,
      setPendingCategoryRemovalLabel:
        pendingRemoval.setter as unknown as React.Dispatch<
          React.SetStateAction<null | string>
        >,
      setSelectedCategory: mock(() => {}) as unknown as React.Dispatch<
        React.SetStateAction<string>
      >,
    });

    expect(firstAttempt).toBe(false);
    expect(pendingRemoval.current).toBe("News");

    const confirmedAttempt = await removeCategoryAndRefresh({
      categories,
      customCategoryLabels: ["News"],
      ensureCategoryLabelExists: mock(() => {}),
      label: "News",
      loadFeedSources: mock(async () => categories),
      pendingCategoryRemovalLabel: "News",
      selectedCategory: "cat-news-1",
      setCategories: mock(() => {}) as unknown as React.Dispatch<
        React.SetStateAction<CategoryTreeNode[]>
      >,
      setCustomCategoryLabels: mock(() => {}) as unknown as React.Dispatch<
        React.SetStateAction<string[]>
      >,
      setOrderedCategoryLabels: mock(() => {}) as unknown as React.Dispatch<
        React.SetStateAction<string[]>
      >,
      setPendingCategoryRemovalLabel:
        pendingRemoval.setter as unknown as React.Dispatch<
          React.SetStateAction<null | string>
        >,
      setSelectedCategory: mock(() => {}) as unknown as React.Dispatch<
        React.SetStateAction<string>
      >,
    });

    expect(confirmedAttempt).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      "Add another category before removing this one.",
    );
    expect(pendingRemoval.current).toBeNull();
  });

  test("reassigns feeds when removing a populated category and restores the selected feed", async () => {
    const feedToMove = makeFeedNode({ category: "News", key: "cat-news-1", sourceId: 1 });
    const existingFeed = makeFeedNode({ category: "Tech", key: "cat-tech-2", sourceId: 2 });
    const refreshedCategories = [
      makeCategoryNode("Tech", [
        makeFeedNode({ category: "Tech", key: "cat-tech-2", sourceId: 2 }),
        makeFeedNode({
          category: "Tech",
          key: "cat-tech-1",
          label: feedToMove.label,
          sourceId: 1,
          url: feedToMove.data?.url,
        }),
      ]),
    ];
    const categories = createStateHarness<CategoryTreeNode[]>([
      makeCategoryNode("News", [feedToMove]),
      makeCategoryNode("Tech", [existingFeed]),
    ]);
    const customLabels = createStateHarness<string[]>(["News", "Tech"]);
    const orderedLabels = createStateHarness<string[]>(["News", "Tech"]);
    const pendingRemoval = createStateHarness<null | string>("News");
    const selectedCategory = createStateHarness("cat-news-1");
    const ensureCategoryLabelExists = mock(() => {});
    const loadFeedSources = mock(async () => refreshedCategories);

    const removed = await removeCategoryAndRefresh({
      categories: categories.current,
      customCategoryLabels: customLabels.current,
      ensureCategoryLabelExists,
      label: "News",
      loadFeedSources,
      pendingCategoryRemovalLabel: pendingRemoval.current,
      selectedCategory: selectedCategory.current,
      setCategories:
        categories.setter as unknown as React.Dispatch<
          React.SetStateAction<CategoryTreeNode[]>
        >,
      setCustomCategoryLabels:
        customLabels.setter as unknown as React.Dispatch<
          React.SetStateAction<string[]>
        >,
      setOrderedCategoryLabels:
        orderedLabels.setter as unknown as React.Dispatch<
          React.SetStateAction<string[]>
        >,
      setPendingCategoryRemovalLabel:
        pendingRemoval.setter as unknown as React.Dispatch<
          React.SetStateAction<null | string>
        >,
      setSelectedCategory:
        selectedCategory.setter as unknown as React.Dispatch<
          React.SetStateAction<string>
        >,
    });

    expect(removed).toBe(true);
    expect(ensureCategoryLabelExists).toHaveBeenCalledWith("Tech");
    expect(FeedService.createFeedSource).toHaveBeenCalledWith({
      category: "Tech",
      name: feedToMove.label,
      url: feedToMove.data?.url ?? "",
    });
    expect(loadFeedSources).toHaveBeenCalledTimes(1);
    expect(selectedCategory.current).toBe("cat-tech-1");
    expect(customLabels.current).toEqual(["Tech"]);
    expect(orderedLabels.current).toEqual(["Tech"]);
    expect(pendingRemoval.current).toBeNull();
  });

  test("renames categories with feed reassignment and preserves the selected feed", async () => {
    const currentCategories = [
      makeCategoryNode("News", [makeFeedNode({ category: "News", key: "cat-news-1", sourceId: 1 })]),
      makeCategoryNode("Tech", [makeFeedNode({ category: "Tech", key: "cat-tech-2", sourceId: 2 })]),
    ];
    const refreshedCategories = [
      makeCategoryNode("World", [makeFeedNode({ category: "World", key: "cat-world-1", sourceId: 1 })]),
      makeCategoryNode("Tech", [makeFeedNode({ category: "Tech", key: "cat-tech-2", sourceId: 2 })]),
    ];
    const customLabels = createStateHarness<string[]>(["News", "Tech"]);
    const orderedLabels = createStateHarness<string[]>(["News", "Tech"]);
    const selectedCategory = createStateHarness("cat-news-1");
    const loadFeedSources = mock(async () => refreshedCategories);

    expect(
      await renameCategoryAndRefresh({
        categories: currentCategories,
        currentLabel: "News",
        customCategoryLabels: customLabels.current,
        loadFeedSources,
        nextLabel: " news ",
        selectedCategory: selectedCategory.current,
        setCustomCategoryLabels:
          customLabels.setter as unknown as React.Dispatch<
            React.SetStateAction<string[]>
          >,
        setOrderedCategoryLabels:
          orderedLabels.setter as unknown as React.Dispatch<
            React.SetStateAction<string[]>
          >,
        setSelectedCategory:
          selectedCategory.setter as unknown as React.Dispatch<
            React.SetStateAction<string>
          >,
      }),
    ).toBe(false);

    expect(
      await renameCategoryAndRefresh({
        categories: currentCategories,
        currentLabel: "News",
        customCategoryLabels: customLabels.current,
        loadFeedSources,
        nextLabel: "Tech",
        selectedCategory: selectedCategory.current,
        setCustomCategoryLabels:
          customLabels.setter as unknown as React.Dispatch<
            React.SetStateAction<string[]>
          >,
        setOrderedCategoryLabels:
          orderedLabels.setter as unknown as React.Dispatch<
            React.SetStateAction<string[]>
          >,
        setSelectedCategory:
          selectedCategory.setter as unknown as React.Dispatch<
            React.SetStateAction<string>
          >,
      }),
    ).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Category already exists.");

    expect(
      await renameCategoryAndRefresh({
        categories: currentCategories,
        currentLabel: "News",
        customCategoryLabels: customLabels.current,
        loadFeedSources,
        nextLabel: "World",
        selectedCategory: selectedCategory.current,
        setCustomCategoryLabels:
          customLabels.setter as unknown as React.Dispatch<
            React.SetStateAction<string[]>
          >,
        setOrderedCategoryLabels:
          orderedLabels.setter as unknown as React.Dispatch<
            React.SetStateAction<string[]>
          >,
        setSelectedCategory:
          selectedCategory.setter as unknown as React.Dispatch<
            React.SetStateAction<string>
          >,
      }),
    ).toBe(true);
    expect(FeedService.createFeedSource).toHaveBeenCalledWith({
      category: "World",
      name: "Feed 1",
      url: "https://example.com/feed-1.xml",
    });
    expect(customLabels.current).toEqual(["World", "Tech"]);
    expect(orderedLabels.current).toEqual(["World", "Tech"]);
    expect(selectedCategory.current).toBe("cat-world-1");
    expect(toast.success).toHaveBeenCalledWith("Category updated.");
  });
});

describe("dashboard OPML and feed-source operations", () => {
  beforeEach(() => {
    mock.restore();
    FeedService.createFeedSource = mock(async () => ({})) as typeof FeedService.createFeedSource;
    FeedService.deleteFeedSource = mock(async () => ({})) as typeof FeedService.deleteFeedSource;
    FeedService.renameFeedSource = mock(async () => ({})) as typeof FeedService.renameFeedSource;
    FeedService.setFeedSourceEnabled = mock(async () => ({})) as typeof FeedService.setFeedSourceEnabled;
    FeedService.updateFeedSettings = mock(async () => ({})) as typeof FeedService.updateFeedSettings;
    toast.error = mock(() => "") as typeof toast.error;
    toast.success = mock(() => "") as typeof toast.success;
    console.error = (() => {}) as typeof console.error;
  });

  test("imports OPML feeds, adds new labels, and selects the first imported feed", async () => {
    const customLabels = createStateHarness<string[]>(["Tech"]);
    const selectedCategory = createStateHarness("cat-tech-9");
    const fetchFeed = mock(async () => {});
    let createIndex = 0;
    FeedService.createFeedSource = mock(async () => {
      createIndex += 1;
      if (createIndex === 2) throw new Error("duplicate");
      return {};
    }) as typeof FeedService.createFeedSource;

    await importOpmlFeedsAndRefresh({
      categories: [
        makeCategoryNode("Tech", [
          makeFeedNode({ category: "Tech", key: "cat-tech-9", sourceId: 9 }),
        ]),
      ],
      entries: [
        {
          category: "News",
          name: " Morning News ",
          url: " https://example.com/news.xml ",
        },
        {
          category: "News",
          name: "Duplicate",
          url: "https://example.com/duplicate.xml",
        },
        {
          category: "Tech",
          name: "Tech Feed",
          url: "https://example.com/tech.xml",
        },
      ],
      fetchFeed,
      loadFeedSources: mock(async () => [
        makeCategoryNode("News", [
          makeFeedNode({ category: "News", key: "cat-news-1", sourceId: 1, url: "https://example.com/news.xml" }),
        ]),
        makeCategoryNode("Tech", [
          makeFeedNode({ category: "Tech", key: "cat-tech-9", sourceId: 9 }),
          makeFeedNode({ category: "Tech", key: "cat-tech-3", sourceId: 3, url: "https://example.com/tech.xml" }),
        ]),
      ]),
      selectedCategory: selectedCategory.current,
      setCustomCategoryLabels:
        customLabels.setter as unknown as React.Dispatch<
          React.SetStateAction<string[]>
        >,
      setSelectedCategory:
        selectedCategory.setter as unknown as React.Dispatch<
          React.SetStateAction<string>
        >,
    });

    expect(FeedService.createFeedSource).toHaveBeenCalledTimes(3);
    expect(customLabels.current).toEqual(["Tech", "News"]);
    expect(selectedCategory.current).toBe("cat-news-1");
    expect(fetchFeed).toHaveBeenCalledWith("https://example.com/news.xml", {
      forceRefresh: true,
      requestSource: "opml-imported",
    });
    expect(toast.success).toHaveBeenCalledWith("Imported 2 feeds (1 skipped).");
  });

  test("rejects empty and fully failed OPML imports", async () => {
    await importOpmlFeedsAndRefresh({
      categories: [],
      entries: [],
      fetchFeed: mock(async () => {}),
      loadFeedSources: mock(async () => []),
      selectedCategory: "",
      setCustomCategoryLabels: mock(() => {}) as unknown as React.Dispatch<
        React.SetStateAction<string[]>
      >,
      setSelectedCategory: mock(() => {}) as unknown as React.Dispatch<
        React.SetStateAction<string>
      >,
    });
    expect(toast.error).toHaveBeenCalledWith("No valid feeds found in OPML file.");

    FeedService.createFeedSource = mock(async () => {
      throw new Error("boom");
    }) as typeof FeedService.createFeedSource;

    await importOpmlFeedsAndRefresh({
      categories: [],
      entries: [
        { category: "News", name: "News", url: "https://example.com/news.xml" },
      ],
      fetchFeed: mock(async () => {}),
      loadFeedSources: mock(async () => []),
      selectedCategory: "",
      setCustomCategoryLabels: mock(() => {}) as unknown as React.Dispatch<
        React.SetStateAction<string[]>
      >,
      setSelectedCategory: mock(() => {}) as unknown as React.Dispatch<
        React.SetStateAction<string>
      >,
    });

    expect(toast.error).toHaveBeenCalledWith("Unable to import feeds from OPML.");
  });

  test("adds feed sources with validation and selects the newly loaded feed", async () => {
    const selectedCategory = createStateHarness("");
    const fetchFeed = mock(async () => {});

    expect(
      await addFeedSourceAndRefresh({
        category: "News",
        fetchFeed,
        loadFeedSources: mock(async () => []),
        name: " ",
        setSelectedCategory:
          selectedCategory.setter as unknown as React.Dispatch<
            React.SetStateAction<string>
          >,
        url: " ",
      }),
    ).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Feed name and URL are required.");

    expect(
      await addFeedSourceAndRefresh({
        category: "News",
        fetchFeed,
        loadFeedSources: mock(async () => []),
        name: "News",
        setSelectedCategory:
          selectedCategory.setter as unknown as React.Dispatch<
            React.SetStateAction<string>
          >,
        url: "notaurl",
      }),
    ).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Please enter a valid feed URL.");

    expect(
      await addFeedSourceAndRefresh({
        category: "News",
        fetchFeed,
        loadFeedSources: mock(async () => [
          makeCategoryNode("News", [
            makeFeedNode({ category: "News", key: "cat-news-4", sourceId: 4, url: "https://example.com/news.xml" }),
          ]),
        ]),
        name: "Daily News",
        setSelectedCategory:
          selectedCategory.setter as unknown as React.Dispatch<
            React.SetStateAction<string>
          >,
        url: "https://example.com/news.xml",
      }),
    ).toBe(true);
    expect(selectedCategory.current).toBe("cat-news-4");
    expect(fetchFeed).toHaveBeenCalledWith("https://example.com/news.xml", {
      forceRefresh: true,
      requestSource: "feed-added",
    });
  });

  test("reorders feeds locally and persists cross-category moves", async () => {
    const sameCategory = createStateHarness<CategoryTreeNode[]>([
      makeCategoryNode("News", [
        makeFeedNode({ category: "News", key: "cat-news-1", sourceId: 1 }),
        makeFeedNode({ category: "News", key: "cat-news-2", sourceId: 2 }),
      ]),
    ]);

    await moveFeedByDropAndPersist({
      categories: sameCategory.current,
      ensureCategoryLabelExists: mock(() => {}),
      key: "cat-news-2",
      loadFeedSources: mock(async () => sameCategory.current),
      setCategories:
        sameCategory.setter as unknown as React.Dispatch<
          React.SetStateAction<CategoryTreeNode[]>
        >,
      targetCategory: "News",
      targetIndex: 0,
    });

    expect(
      sameCategory.current[0]?.children?.map((feedNode) => feedNode.key),
    ).toEqual(["cat-news-2", "cat-news-1"]);
    expect(FeedService.createFeedSource).not.toHaveBeenCalled();

    FeedService.createFeedSource = mock(async () => {
      throw new Error("persist failed");
    }) as typeof FeedService.createFeedSource;
    const crossCategory = createStateHarness<CategoryTreeNode[]>([
      makeCategoryNode("News", [makeFeedNode({ category: "News", key: "cat-news-1", sourceId: 1 })]),
      makeCategoryNode("Tech"),
    ]);
    const ensureCategoryLabelExists = mock(() => {});
    const loadFeedSources = mock(async () => crossCategory.current);

    await moveFeedByDropAndPersist({
      categories: crossCategory.current,
      ensureCategoryLabelExists,
      key: "cat-news-1",
      loadFeedSources,
      setCategories:
        crossCategory.setter as unknown as React.Dispatch<
          React.SetStateAction<CategoryTreeNode[]>
        >,
      targetCategory: "Tech",
      targetIndex: 0,
    });

    expect(ensureCategoryLabelExists).toHaveBeenCalledWith("News");
    expect(ensureCategoryLabelExists).toHaveBeenCalledWith("Tech");
    expect(loadFeedSources).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("Unable to move feed right now.");
  });

  test("removes feed sources and resolves clear, feed, and category fallbacks", async () => {
    const feedState = createStateHarness<Article[]>([
      {
        content: "body",
        feedId: 1,
        id: 1,
        lastChecked: new Date("2024-01-01T00:00:00.000Z"),
        link: "https://example.com/articles/1",
        publicationDate: new Date("2024-01-01T00:00:00.000Z"),
        title: "Article 1",
      },
    ]);
    const selectedCategory = createStateHarness("cat-news-1");
    const fetchFeed = mock(async () => {});
    const fetchCategoryFeeds = mock(async () => {});

    await removeFeedSourceAndRefresh({
      categories: [
        makeCategoryNode("News", [makeFeedNode({ category: "News", key: "cat-news-1", sourceId: 1 })]),
      ],
      fetchCategoryFeeds,
      fetchFeed,
      key: "cat-news-1",
      loadFeedSources: mock(async () => []),
      selectedCategory: selectedCategory.current,
      setFeed:
        feedState.setter as unknown as React.Dispatch<
          React.SetStateAction<Article[]>
        >,
      setSelectedCategory:
        selectedCategory.setter as unknown as React.Dispatch<
          React.SetStateAction<string>
        >,
    });

    expect(selectedCategory.current).toBe("");
    expect(feedState.current).toEqual([]);

    await removeFeedSourceAndRefresh({
      categories: [
        makeCategoryNode("News", [
          makeFeedNode({ category: "News", key: "cat-news-1", sourceId: 1 }),
          makeFeedNode({ category: "News", key: "cat-news-2", sourceId: 2 }),
        ]),
      ],
      fetchCategoryFeeds,
      fetchFeed,
      key: "cat-news-1",
      loadFeedSources: mock(async () => [
        makeCategoryNode("News", [
          makeFeedNode({ category: "News", key: "cat-news-2", sourceId: 2 }),
        ]),
      ]),
      selectedCategory: "cat-news-1",
      setFeed: mock(() => {}) as unknown as React.Dispatch<
        React.SetStateAction<Article[]>
      >,
      setSelectedCategory:
        selectedCategory.setter as unknown as React.Dispatch<
          React.SetStateAction<string>
        >,
    });

    expect(selectedCategory.current).toBe("cat-news-2");
    expect(fetchFeed).toHaveBeenCalledWith("https://example.com/feed-2.xml");

    await removeFeedSourceAndRefresh({
      categories: [
        makeCategoryNode("Tech", [
          makeFeedNode({ category: "Tech", key: "cat-tech-3", sourceId: 3 }),
        ]),
      ],
      fetchCategoryFeeds,
      fetchFeed,
      key: "cat-tech-3",
      loadFeedSources: mock(async () => [
        makeCategoryNode("Tech", [
          makeFeedNode({ category: "Tech", key: "cat-tech-4", sourceId: 4 }),
        ]),
      ]),
      selectedCategory: "cat-tech",
      setFeed: mock(() => {}) as unknown as React.Dispatch<
        React.SetStateAction<Article[]>
      >,
      setSelectedCategory: mock(() => {}) as unknown as React.Dispatch<
        React.SetStateAction<string>
      >,
    });

    expect(fetchCategoryFeeds).toHaveBeenCalledWith(
      expect.objectContaining({ key: "cat-tech", label: "Tech" }),
    );
  });

  test("renames feed sources, selects feeds by key, and updates enabled or settings state", async () => {
    const categories = [
      makeCategoryNode("News", [
        makeFeedNode({ category: "News", key: "cat-news-1", sourceId: 1 }),
      ]),
    ];

    expect(
      await renameFeedSourceAndRefresh({
        categories,
        key: "cat-news-1",
        loadFeedSources: mock(async () => categories),
        nextName: " ",
        nextUrl: "https://example.com/news.xml",
      }),
    ).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Feed name is required.");

    expect(
      await renameFeedSourceAndRefresh({
        categories,
        key: "cat-news-1",
        loadFeedSources: mock(async () => categories),
        nextName: "News",
        nextUrl: "notaurl",
      }),
    ).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Please enter a valid feed URL.");

    expect(
      await renameFeedSourceAndRefresh({
        categories,
        key: "cat-news-1",
        loadFeedSources: mock(async () => categories),
        nextName: "Renamed News",
        nextUrl: "https://example.com/renamed.xml",
      }),
    ).toBe(true);
    expect(FeedService.renameFeedSource).toHaveBeenCalledWith(
      1,
      "Renamed News",
      "https://example.com/renamed.xml",
    );
    expect(toast.success).toHaveBeenCalledWith("Feed source updated.");

    const setSelectedCategory = createStateHarness("");
    const fetchFeed = mock(async () => {});
    selectFeedByKeyFromCategories(
      categories,
      "cat-news-1",
      setSelectedCategory.setter as unknown as React.Dispatch<
        React.SetStateAction<string>
      >,
      fetchFeed,
    );
    expect(setSelectedCategory.current).toBe("cat-news-1");
    expect(fetchFeed).toHaveBeenCalledWith("https://example.com/feed-1.xml");

    const enabledSelection = createStateHarness("cat-news-1");
    const fetchAllFeeds = mock(async () => {});
    expect(
      await setFeedSourceEnabledAndRefresh({
        categories,
        enabled: false,
        fetchAllFeeds,
        fetchFeed,
        key: "cat-news-1",
        loadFeedSources: mock(async () => categories),
        selectedCategory: "cat-news-1",
        setSelectedCategory:
          enabledSelection.setter as unknown as React.Dispatch<
            React.SetStateAction<string>
          >,
      }),
    ).toBe(true);
    expect(enabledSelection.current).toBe(ALL_FEEDS_NODE_KEY);
    expect(fetchAllFeeds).toHaveBeenCalledWith(categories, {
      requestSource: "feed-hidden-selection-fallback",
    });

    expect(
      await setFeedSourceEnabledAndRefresh({
        categories,
        enabled: true,
        fetchAllFeeds,
        fetchFeed,
        key: "cat-news-1",
        loadFeedSources: mock(async () => categories),
        selectedCategory: "cat-news",
        setSelectedCategory:
          enabledSelection.setter as unknown as React.Dispatch<
            React.SetStateAction<string>
          >,
      }),
    ).toBe(true);
    expect(fetchFeed).toHaveBeenCalledWith("https://example.com/feed-1.xml", {
      forceRefresh: true,
      requestSource: "feed-reenabled",
    });

    expect(
      await updateFeedSettingsAndRefresh({
        categories,
        key: "missing",
        loadFeedSources: mock(async () => categories),
        settings: { proxyEnabled: true },
      }),
    ).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Unable to update this feed.");

    expect(
      await updateFeedSettingsAndRefresh({
        categories,
        key: "cat-news-1",
        loadFeedSources: mock(async () => categories),
        settings: { extractionDisabled: true, proxyEnabled: true },
      }),
    ).toBe(true);
    expect(FeedService.updateFeedSettings).toHaveBeenCalledWith(1, {
      extractionDisabled: true,
      proxyEnabled: true,
    });
  });
});