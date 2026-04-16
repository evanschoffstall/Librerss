import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import type { CategoryTreeNode } from "@/lib/core";

import { useSettingsCategoryState } from "@/app/dashboard/settings-state/useSettingsCategoryState";
import { useSettingsDrag } from "@/app/dashboard/settings-state/useSettingsDrag";
import { useSettingsFeedEditorState } from "@/app/dashboard/settings-state/useSettingsFeedEditorState";

const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;

interface MinimalDataTransfer {
  dropEffect: string;
  effectAllowed: string;
  getData(type: string): string;
  setData(type: string, value: string): void;
  readonly types: readonly string[];
}

beforeEach(() => {
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = mock(
    () => {},
  ) as typeof window.cancelAnimationFrame;
});

afterEach(() => {
  mock.restore();
  window.requestAnimationFrame = originalRequestAnimationFrame;
  window.cancelAnimationFrame = originalCancelAnimationFrame;
});

describe("useSettingsCategoryState", () => {
  test("adds categories with trimmed names and clears the draft on success", () => {
    const onAddCategory = mock(() => true);

    const { result } = renderHook(() =>
      useSettingsCategoryState({
        categories: [],
        onAddCategory,
        onRenameCategory: mock(async () => true),
      }),
    );

    act(() => {
      result.current.setNewCategoryName("  Science  ");
    });

    act(() => {
      result.current.handleAddCategory();
    });

    expect(onAddCategory).toHaveBeenCalledWith("Science");
    expect(result.current.newCategoryName).toBe("");
  });

  test("keeps the category draft when validation rejects the add", () => {
    const onAddCategory = mock(() => false);

    const { result } = renderHook(() =>
      useSettingsCategoryState({
        categories: [],
        onAddCategory,
        onRenameCategory: mock(async () => true),
      }),
    );

    act(() => {
      result.current.setNewCategoryName("Existing");
      result.current.handleAddCategory();
    });

    expect(result.current.newCategoryName).toBe("Existing");
  });

  test("saves category renames and clears edit state on success", async () => {
    const onRenameCategory = mock(async () => true);

    const { result } = renderHook(() =>
      useSettingsCategoryState({
        categories: [createCategory("News")],
        onAddCategory: mock(() => true),
        onRenameCategory,
      }),
    );

    act(() => {
      result.current.onStartCategoryEdit("News");
      result.current.setEditingCategoryName("  World News  ");
    });

    await act(async () => {
      await result.current.handleSaveCategoryRename("News");
    });

    expect(onRenameCategory).toHaveBeenCalledWith("News", "World News");
    expect(result.current.editingCategory).toBeNull();
    expect(result.current.editingCategoryName).toBe("");
    expect(result.current.savingCategoryLabel).toBeNull();
  });

  test("keeps rename state when a save is rejected and clears it when the category disappears", async () => {
    const onRenameCategory = mock(async () => false);
    const initialCategories = [createCategory("News")];

    const { rerender, result } = renderHook(
      ({ categories }) =>
        useSettingsCategoryState({
          categories,
          onAddCategory: mock(() => true),
          onRenameCategory,
        }),
      {
        initialProps: { categories: initialCategories },
      },
    );

    act(() => {
      result.current.onStartCategoryEdit("News");
      result.current.setEditingCategoryName("Updated News");
    });

    await act(async () => {
      await result.current.handleSaveCategoryRename("News");
    });

    expect(result.current.editingCategory).toBe("News");
    expect(result.current.editingCategoryName).toBe("Updated News");

    rerender({ categories: [createCategory("Tech")] });

    await waitFor(() => {
      expect(result.current.editingCategory).toBeNull();
      expect(result.current.editingCategoryName).toBe("");
    });
  });
});

describe("useSettingsDrag", () => {
  test("tracks feed dragging, drop targets, and drop completion", async () => {
    const onDropFeed = mock(async () => {});

    const { result } = renderHook(() =>
      useSettingsDrag({
        onDropCategory: mock(async () => {}),
        onDropFeed,
      }),
    );

    const startEvent = createButtonDragEvent();
    act(() => {
      result.current.onFeedDragStart(startEvent, "feed-1");
    });

    await waitFor(() => {
      expect(result.current.draggingFeedKey).toBe("feed-1");
    });
    expect(
      startEvent.dataTransfer.getData("application/x-librerss-feed-key"),
    ).toBe("feed-1");

    const overEvent = createDragEvent(startEvent.dataTransfer);
    act(() => {
      result.current.onFeedDragOver(overEvent, "News", 2);
    });

    expect(result.current.feedDropTarget).toEqual({
      categoryLabel: "News",
      index: 2,
    });

    const dropEvent = createDragEvent(startEvent.dataTransfer);
    await act(async () => {
      await result.current.onFeedDrop(dropEvent, "News", 2);
    });

    expect(onDropFeed).toHaveBeenCalledWith("feed-1", "News", 2);
    expect(result.current.draggingFeedKey).toBeNull();
    expect(result.current.feedDropTarget).toBeNull();
    expect(result.current.movingFeedKey).toBeNull();
  });

  test("tracks category dragging and falls back to text/plain payloads", async () => {
    const onDropCategory = mock(async () => {});

    const { result } = renderHook(() =>
      useSettingsDrag({
        onDropCategory,
        onDropFeed: mock(async () => {}),
      }),
    );

    const startEvent = createButtonDragEvent();
    act(() => {
      result.current.onCategoryDragStart(startEvent, "News");
    });

    await waitFor(() => {
      expect(result.current.draggingCategoryLabel).toBe("News");
    });

    const overEvent = createDragEvent(startEvent.dataTransfer);
    act(() => {
      result.current.onCategoryDragOver(overEvent, 1);
    });

    expect(result.current.categoryDropIndex).toBe(1);

    const plainTextData = createDataTransfer();
    plainTextData.setData("text/plain", "Tech");
    const dropEvent = createDragEvent(plainTextData);
    await act(async () => {
      await result.current.onCategoryDrop(dropEvent, 3);
    });

    expect(onDropCategory).toHaveBeenCalledWith("Tech", 3);
    expect(result.current.draggingCategoryLabel).toBeNull();
    expect(result.current.categoryDropIndex).toBeNull();
  });

  test("ignores drag-over and drop events that do not carry a supported payload", async () => {
    const onDropFeed = mock(async () => {});
    const onDropCategory = mock(async () => {});

    const { result } = renderHook(() =>
      useSettingsDrag({
        onDropCategory,
        onDropFeed,
      }),
    );

    const unsupportedEvent = createDragEvent();

    act(() => {
      result.current.onFeedDragOver(unsupportedEvent, "News", 0);
      result.current.onCategoryDragOver(unsupportedEvent, 0);
    });

    await act(async () => {
      await result.current.onFeedDrop(unsupportedEvent, "News", 0);
      await result.current.onCategoryDrop(unsupportedEvent, 0);
    });

    expect(onDropFeed).not.toHaveBeenCalled();
    expect(onDropCategory).not.toHaveBeenCalled();
    expect(result.current.feedDropTarget).toBeNull();
    expect(result.current.categoryDropIndex).toBeNull();
  });

  test("clears feed and category drag state on drag end", async () => {
    const { result } = renderHook(() =>
      useSettingsDrag({
        onDropCategory: mock(async () => {}),
        onDropFeed: mock(async () => {}),
      }),
    );

    const feedStartEvent = createButtonDragEvent();
    const categoryStartEvent = createButtonDragEvent();

    act(() => {
      result.current.onFeedDragStart(feedStartEvent, "feed-1");
      result.current.onCategoryDragStart(categoryStartEvent, "News");
    });

    await waitFor(() => {
      expect(result.current.draggingFeedKey).toBe("feed-1");
      expect(result.current.draggingCategoryLabel).toBe("News");
    });

    act(() => {
      result.current.onFeedDragEnd();
      result.current.onCategoryDragEnd();
    });

    expect(result.current.draggingFeedKey).toBeNull();
    expect(result.current.draggingCategoryLabel).toBeNull();
    expect(result.current.feedDropTarget).toBeNull();
    expect(result.current.categoryDropIndex).toBeNull();
  });
});

describe("useSettingsFeedEditorState", () => {
  test("adds a feed successfully and resets the inline draft", async () => {
    const onAddFeed = mock(async () => true);
    const onSetFeedEnabled = mock(async () => true);
    const onUpdateFeedSettings = mock(async () => true);

    const { result } = renderHook(() =>
      useSettingsFeedEditorState({
        categories: [createCategory("News", "feed-1")],
        onAddFeed,
        onDropCategory: mock(async () => {}),
        onDropFeed: mock(async () => {}),
        onRemoveFeed: mock(async () => {}),
        onRenameFeed: mock(async () => true),
        onSetFeedEnabled,
        onUpdateFeedSettings,
        selectedCategory: "cat-news",
      }),
    );

    act(() => {
      result.current.onToggleAddFeed("News");
      result.current.setNewFeedName("  Example Feed  ");
      result.current.setNewFeedUrl("  https://example.com/feed.xml  ");
    });

    await act(async () => {
      await result.current.handleAddFeed("News");
    });

    expect(onAddFeed).toHaveBeenCalledWith(
      "Example Feed",
      "https://example.com/feed.xml",
      "News",
    );
    expect(result.current.addingFeedInCategory).toBeNull();
    expect(result.current.newFeedName).toBe("");
    expect(result.current.newFeedUrl).toBe("");
    expect(result.current.isSavingFeed).toBe(false);
  });

  test("keeps feed drafts open when add-feed persistence rejects the save", async () => {
    const onAddFeed = mock(async () => false);

    const { result } = renderHook(() =>
      useSettingsFeedEditorState({
        categories: [createCategory("News", "feed-1")],
        onAddFeed,
        onDropCategory: mock(async () => {}),
        onDropFeed: mock(async () => {}),
        onRemoveFeed: mock(async () => {}),
        onRenameFeed: mock(async () => true),
        onSetFeedEnabled: mock(async () => true),
        onUpdateFeedSettings: mock(async () => true),
        selectedCategory: "cat-news",
      }),
    );

    act(() => {
      result.current.onToggleAddFeed("News");
      result.current.setNewFeedName("Example Feed");
      result.current.setNewFeedUrl("https://example.com/feed.xml");
    });

    await act(async () => {
      await result.current.handleAddFeed("News");
    });

    expect(result.current.addingFeedInCategory).toBe("News");
    expect(result.current.newFeedName).toBe("Example Feed");
    expect(result.current.newFeedUrl).toBe("https://example.com/feed.xml");
  });

  test("clears edit state after a successful feed rename and preserves it on failure", async () => {
    const onRenameFeed = mock(async () => true);

    const { result } = renderHook(() =>
      useSettingsFeedEditorState({
        categories: [createCategory("News", "feed-1")],
        onAddFeed: mock(async () => true),
        onDropCategory: mock(async () => {}),
        onDropFeed: mock(async () => {}),
        onRemoveFeed: mock(async () => {}),
        onRenameFeed,
        onSetFeedEnabled: mock(async () => true),
        onUpdateFeedSettings: mock(async () => true),
        selectedCategory: "cat-news",
      }),
    );

    act(() => {
      result.current.sharedFeedRowProps.onStartFeedEdit(
        "feed-1",
        "Feed Name",
        "https://example.com/feed.xml",
      );
      result.current.sharedFeedRowProps.onEditingFeedNameChange(
        "  Updated Feed  ",
      );
      result.current.sharedFeedRowProps.onEditingFeedUrlChange(
        "  https://example.com/updated.xml  ",
      );
    });

    await act(async () => {
      await result.current.sharedFeedRowProps.onSaveFeedRename("feed-1");
    });

    expect(onRenameFeed).toHaveBeenCalledWith(
      "feed-1",
      "Updated Feed",
      "https://example.com/updated.xml",
    );
    expect(result.current.sharedFeedRowProps.editingFeedKey).toBeNull();

    onRenameFeed.mockImplementation(async () => false);

    act(() => {
      result.current.sharedFeedRowProps.onStartFeedEdit(
        "feed-1",
        "Feed Name",
        "https://example.com/feed.xml",
      );
      result.current.sharedFeedRowProps.onEditingFeedNameChange("Retry Feed");
    });

    await act(async () => {
      await result.current.sharedFeedRowProps.onSaveFeedRename("feed-1");
    });

    expect(result.current.sharedFeedRowProps.editingFeedKey).toBe("feed-1");
    expect(result.current.sharedFeedRowProps.editingFeedName).toBe(
      "Retry Feed",
    );
  });

  test("tracks remove, enablement, and settings toggles through their busy keys", async () => {
    const onRemoveFeed = mock(async () => {});
    const onSetFeedEnabled = mock(async () => true);
    const onUpdateFeedSettings = mock(async () => true);

    const { result } = renderHook(() =>
      useSettingsFeedEditorState({
        categories: [createCategory("News", "feed-1")],
        onAddFeed: mock(async () => true),
        onDropCategory: mock(async () => {}),
        onDropFeed: mock(async () => {}),
        onRemoveFeed,
        onRenameFeed: mock(async () => true),
        onSetFeedEnabled,
        onUpdateFeedSettings,
        selectedCategory: "cat-news",
      }),
    );

    await act(async () => {
      await result.current.sharedFeedRowProps.onRemoveFeed("feed-1");
      await result.current.sharedFeedRowProps.onToggleFeedEnabled(
        "feed-1",
        false,
      );
      await result.current.sharedFeedRowProps.onToggleExtractionDisabled(
        "feed-1",
        true,
      );
      await result.current.sharedFeedRowProps.onToggleProxyEnabled(
        "feed-1",
        true,
      );
    });

    expect(onRemoveFeed).toHaveBeenCalledWith("feed-1");
    expect(onSetFeedEnabled).toHaveBeenCalledWith("feed-1", false);
    expect(onUpdateFeedSettings).toHaveBeenCalledWith("feed-1", {
      extractionDisabled: true,
    });
    expect(onUpdateFeedSettings).toHaveBeenCalledWith("feed-1", {
      proxyEnabled: true,
    });
    expect(result.current.sharedFeedRowProps.deletingKey).toBeNull();
    expect(result.current.sharedFeedRowProps.togglingFeedKey).toBeNull();
    expect(result.current.sharedFeedRowProps.updatingSettingsKey).toBeNull();
  });

  test("clears add-feed and edit state when the relevant category or feed disappears", async () => {
    const { rerender, result } = renderHook(
      ({ categories }) =>
        useSettingsFeedEditorState({
          categories,
          onAddFeed: mock(async () => true),
          onDropCategory: mock(async () => {}),
          onDropFeed: mock(async () => {}),
          onRemoveFeed: mock(async () => {}),
          onRenameFeed: mock(async () => true),
          onSetFeedEnabled: mock(async () => true),
          onUpdateFeedSettings: mock(async () => true),
          selectedCategory: "cat-news",
        }),
      {
        initialProps: { categories: [createCategory("News", "feed-1")] },
      },
    );

    act(() => {
      result.current.onToggleAddFeed("News");
      result.current.sharedFeedRowProps.onStartFeedEdit(
        "feed-1",
        "Feed Name",
        "https://example.com/feed.xml",
      );
    });

    rerender({ categories: [createCategory("Tech", "feed-2")] });

    await waitFor(() => {
      expect(result.current.addingFeedInCategory).toBeNull();
      expect(result.current.sharedFeedRowProps.editingFeedKey).toBeNull();
      expect(result.current.sharedFeedRowProps.editingFeedName).toBe("");
      expect(result.current.sharedFeedRowProps.editingFeedUrl).toBe("");
    });
  });

  test("cancels the add-feed draft and resets the inline fields", () => {
    const { result } = renderHook(() =>
      useSettingsFeedEditorState({
        categories: [createCategory("News", "feed-1")],
        onAddFeed: mock(async () => true),
        onDropCategory: mock(async () => {}),
        onDropFeed: mock(async () => {}),
        onRemoveFeed: mock(async () => {}),
        onRenameFeed: mock(async () => true),
        onSetFeedEnabled: mock(async () => true),
        onUpdateFeedSettings: mock(async () => true),
        selectedCategory: "cat-news",
      }),
    );

    act(() => {
      result.current.onToggleAddFeed("News");
      result.current.setNewFeedName("Example Feed");
      result.current.setNewFeedUrl("https://example.com/feed.xml");
      result.current.onCancelAddFeed();
    });

    expect(result.current.addingFeedInCategory).toBeNull();
    expect(result.current.newFeedName).toBe("Example Feed");
    expect(result.current.newFeedUrl).toBe("https://example.com/feed.xml");
  });
});

function createButtonDragEvent(dataTransfer = createDataTransfer()) {
  return {
    dataTransfer,
    preventDefault: mock(() => {}),
    stopPropagation: mock(() => {}),
  } as unknown as React.DragEvent<HTMLButtonElement>;
}

function createCategory(label: string, feedKey?: string): CategoryTreeNode {
  return {
    children: feedKey
      ? [
          {
            children: [],
            data: {
              enabled: true,
              extractionDisabled: false,
              proxyEnabled: false,
              url: `https://example.com/${feedKey}.xml`,
            },
            key: feedKey,
            label: `${label} Feed`,
          },
        ]
      : [],
    key: `cat-${label.toLowerCase()}`,
    label,
  };
}

function createDataTransfer(): MinimalDataTransfer {
  const store = new Map<string, string>();
  const types: string[] = [];

  return {
    dropEffect: "none",
    effectAllowed: "all",
    getData(type: string) {
      return store.get(type) ?? "";
    },
    setData(type: string, value: string) {
      store.set(type, value);
      if (!types.includes(type)) {
        types.push(type);
      }
    },
    get types() {
      return [...types];
    },
  };
}

function createDragEvent(dataTransfer = createDataTransfer()) {
  return {
    dataTransfer,
    preventDefault: mock(() => {}),
    stopPropagation: mock(() => {}),
  } as unknown as React.DragEvent<HTMLElement>;
}
