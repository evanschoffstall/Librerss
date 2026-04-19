import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import type { CategoryTreeNode } from "@/lib/core";

import {
  CompatibilityResultBadge,
  ProxyRoutingBadge,
  StatusBadge,
} from "@/app/dashboard/dashboard-components/settings-dialog/SettingsProxyBadges";
import { TooltipProvider } from "@/components/ui/tooltip";

import type { SettingsModalState } from "../src/app/dashboard/settings-state/useSettingsModalState";

import { SettingsProxyCompatibilityPanel } from "../src/app/dashboard/dashboard-components/settings-dialog/SettingsProxyCompatibilityPanel";

async function loadSettingsFeedManagementSection() {
  const module = await import(
    `../src/app/dashboard/dashboard-components/settings-dialog/SettingsFeedManagementSection?test=${Date.now()}-${Math.random()}`
  );

  return module.SettingsFeedManagementSection;
}

const originalGlobalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const originalWindowLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);
beforeEach(() => {
  const isolatedLocalStorage = new StorageMock();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: isolatedLocalStorage,
    writable: true,
  });
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: isolatedLocalStorage,
    writable: true,
  });
});

afterEach(() => {
  if (originalGlobalLocalStorageDescriptor) {
    Object.defineProperty(
      globalThis,
      "localStorage",
      originalGlobalLocalStorageDescriptor,
    );
  }
  if (originalWindowLocalStorageDescriptor) {
    Object.defineProperty(
      window,
      "localStorage",
      originalWindowLocalStorageDescriptor,
    );
  }
});

describe("settings real components", () => {
  test("commits display preferences and local mobile toggles", async () => {
    mock.module("@/lib/hooks/useLocalStorage", () => ({
      useLocalStorage: (key: string, initialValue: boolean) => {
        if (key.includes("grouped")) {
          return [true, mock(() => {})] as const;
        }

        if (key.includes("inverted")) {
          return [false, mock(() => {})] as const;
        }

        return [initialValue, mock((_value: boolean) => {})] as const;
      },
    }));
    const { SettingsDisplaySection } = await import(
      `../src/app/dashboard/dashboard-components/settings-dialog/SettingsDisplaySection?test=${Date.now()}-${Math.random()}`
    );
    const onArticlesPerPageChange = mock(() => {});
    const onAutoRefreshIntervalMinutesChange = mock(() => {});
    const onBackgroundModeChange = mock(() => {});
    const onDistillStrategyChange = mock(() => {});
    const onShowFaviconsChange = mock((_value: boolean) => {});

    const { getByRole } = render(
      <SettingsDisplaySection
        articlesPerPage={12}
        autoRefreshIntervalMinutes={30}
        backgroundMode="stars"
        distillStrategy="readability"
        onArticlesPerPageChange={onArticlesPerPageChange}
        onAutoRefreshIntervalMinutesChange={onAutoRefreshIntervalMinutesChange}
        onBackgroundModeChange={onBackgroundModeChange}
        onDistillStrategyChange={onDistillStrategyChange}
        onShowFaviconsChange={onShowFaviconsChange}
        showFavicons={true}
      />,
    );

    const faviconsSwitch = getByRole("switch", { name: "Show favicons" });
    const mobileGroupedLayoutSwitch = getByRole("switch", {
      name: "Mobile grouped layout",
    });
    const mobileInvertedSwitch = getByRole("switch", {
      name: "Mobile inverted scroll",
    });

    expect(mobileInvertedSwitch.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(faviconsSwitch);
    fireEvent.click(mobileGroupedLayoutSwitch);
    fireEvent.click(mobileInvertedSwitch);

    await waitFor(() => {
      expect(onShowFaviconsChange).toHaveBeenCalled();
    });
    expect(onShowFaviconsChange.mock.calls.at(-1)?.[0]).toBe(false);

    expect(onBackgroundModeChange).not.toHaveBeenCalled();
    expect(onArticlesPerPageChange).not.toHaveBeenCalled();
    expect(onDistillStrategyChange).not.toHaveBeenCalled();
  });

  test("renders feed management controls, exports OPML, and drives category or feed actions", async () => {
    const SettingsFeedManagementSection =
      await loadSettingsFeedManagementSection();
    const state = createSettingsState({
      addingFeedInCategory: "News",
      newCategoryName: "Science",
      newFeedName: "New Feed",
      newFeedUrl: "https://example.com/new.xml",
    });
    const categories = [createCategory("News", "feed-1")];

    const {
      container,
      getByLabelText,
      getByPlaceholderText,
      getByRole,
      getByText,
    } = render(
      <SettingsFeedManagementSection
        categories={categories}
        onRemoveCategory={mock(async () => true)}
        pendingCategoryRemovalLabel={null}
        state={state}
      />,
    );

    fireEvent.click(getByRole("button", { name: "Import OPML" }));
    fireEvent.click(getByLabelText("Add feed"));
    fireEvent.change(getByPlaceholderText("Feed name"), {
      target: { value: "New Feed" },
    });
    fireEvent.change(getByPlaceholderText("https://example.com/feed.xml"), {
      target: { value: "https://example.com/new.xml" },
    });
    fireEvent.click(getByText("Add Feed"));
    fireEvent.click(getByLabelText("Edit Example Feed"));
    fireEvent.click(getByLabelText("Disable extraction"));
    fireEvent.click(getByLabelText("Enable proxy"));
    fireEvent.click(getByLabelText("Disable feed"));
    fireEvent.click(getByLabelText("Remove feed"));
    fireEvent.change(getByPlaceholderText("New category name..."), {
      target: { value: "Science" },
    });
    fireEvent.click(getByText("Add Category"));

    const fileInput =
      container.querySelector<HTMLInputElement>("input[type='file']");
    if (!fileInput) {
      throw new Error("Expected the OPML input to render.");
    }
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["<opml />"], "feeds.opml", { type: "text/xml" })],
      },
    });

    await waitFor(() => {
      expect(state.onToggleAddFeed).toHaveBeenCalledWith("News");
      expect(state.handleAddFeed).toHaveBeenCalledWith("News");
      expect(state.sharedFeedRowProps.onStartFeedEdit).toHaveBeenCalledWith(
        "feed-1",
        "Example Feed",
        "https://example.com/feed-1.xml",
      );
      expect(
        state.sharedFeedRowProps.onToggleExtractionDisabled,
      ).toHaveBeenCalledWith("feed-1", true);
      expect(
        state.sharedFeedRowProps.onToggleProxyEnabled,
      ).toHaveBeenCalledWith("feed-1", true);
      expect(state.sharedFeedRowProps.onToggleFeedEnabled).toHaveBeenCalledWith(
        "feed-1",
        false,
      );
      expect(state.sharedFeedRowProps.onRemoveFeed).toHaveBeenCalledWith(
        "feed-1",
      );
      expect(state.handleAddCategory).toHaveBeenCalled();
      expect(state.handleOpmlFileChange).toHaveBeenCalled();
    });
  });

  test("renders the import skeleton and demo overlay in preview mode", async () => {
    const SettingsFeedManagementSection =
      await loadSettingsFeedManagementSection();
    const state = createSettingsState({ isImportingOpml: true });

    const { getAllByText, getByText } = render(
      <SettingsFeedManagementSection
        categories={[createCategory("News", "feed-1")]}
        isPreviewMode={true}
        onRemoveCategory={mock(async () => true)}
        pendingCategoryRemovalLabel={null}
        state={state}
      />,
    );

    expect(getByText("Importing feeds…")).toBeTruthy();
    expect(getByText("Not available in demo mode")).toBeTruthy();
  });

  test("renders proxy compatibility states and runs the compatibility check", async () => {
    const onRunCompatibilityCheck = mock(async () => {});
    const resultsRef = { current: null };

    const { getAllByText, getByText } = render(
      <TooltipProvider>
        <div>
          <StatusBadge status="checking" />
          <StatusBadge status="reachable" />
          <StatusBadge status="unreachable" />
          <ProxyRoutingBadge status="checking" />
          <ProxyRoutingBadge
            routingCheck={{
              directIp: "198.51.100.7",
              error: null,
              proxyExitIp: "203.0.113.21",
              status: "verified",
            }}
          />
          <CompatibilityResultBadge
            result={{
              compatibilitySignalDetected: false,
              statusCode: 200,
              success: true,
              vendor: "Direct",
            }}
          />
          <CompatibilityResultBadge
            result={{
              compatibilitySignalDetected: true,
              statusCode: 403,
              success: true,
              vendor: "Protected CDN",
            }}
          />
          <CompatibilityResultBadge
            result={{
              compatibilitySignalDetected: false,
              error: "connection reset by peer",
              statusCode: 0,
              success: false,
              vendor: "Legacy Host",
            }}
          />
          <SettingsProxyCompatibilityPanel
            compatibilityCheckedAt={1_000}
            compatibilityError="Proxy authentication failed because the upstream rejected the credentials."
            compatibilityResults={[
              {
                compatibilitySignalDetected: false,
                statusCode: 200,
                success: true,
                vendor: "Direct",
              },
              {
                compatibilitySignalDetected: true,
                statusCode: 403,
                success: true,
                vendor: "Protected CDN",
              },
              {
                compatibilitySignalDetected: false,
                error: "connection reset by peer",
                statusCode: 0,
                success: false,
                vendor: "Legacy Host",
              },
            ]}
            hasProxy={true}
            isRunningCompatibilityCheck={false}
            nowTs={61_000}
            onRunCompatibilityCheck={onRunCompatibilityCheck}
            resultsRef={resultsRef}
            saving={false}
          />
        </div>
      </TooltipProvider>,
    );

    fireEvent.click(getByText("Run Check"));

    await waitFor(() => {
      expect(onRunCompatibilityCheck).toHaveBeenCalled();
    });

    expect(getAllByText("Checking").length).toBeGreaterThan(0);
    expect(getByText("Connected")).toBeTruthy();
    expect(getByText("Exit 203.0.113.21")).toBeTruthy();
    expect(getByText("Unreachable")).toBeTruthy();
    expect(getAllByText("Passed").length).toBeGreaterThan(0);
    expect(getAllByText("Limited").length).toBeGreaterThan(0);
    expect(getAllByText("Connection Error").length).toBeGreaterThan(0);
    expect(getByText("Last check 1m ago")).toBeTruthy();
  });

  test("renders a route-failed primary badge when routing proof reports an error", () => {
    const { getByText, queryByText } = render(
      <TooltipProvider>
        <StatusBadge
          routingCheck={{
            directIp: "152.208.62.191",
            error: "dial_proxy api64.ipify.org: host unreachable",
            proxyExitIp: null,
            status: "error",
          }}
          status="reachable"
        />
      </TooltipProvider>,
    );

    expect(getByText("Route Failed")).toBeTruthy();
    expect(queryByText("Connected")).toBeNull();
  });
});

class StorageMock implements Storage {
  get length() {
    return this.#store.size;
  }

  #store = new Map<string, string>();

  clear() {
    this.#store.clear();
  }

  getItem(key: string) {
    return this.#store.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.#store.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.#store.delete(key);
  }

  setItem(key: string, value: string) {
    this.#store.set(key, value);
  }
}

function createCategory(label: string, feedKey: string): CategoryTreeNode {
  return {
    children: [
      {
        children: [],
        data: {
          enabled: true,
          extractionDisabled: false,
          proxyEnabled: false,
          url: `https://example.com/${feedKey}.xml`,
        },
        key: feedKey,
        label: "Example Feed",
      },
    ],
    key: `cat-${label.toLowerCase()}`,
    label,
  };
}

function createSettingsState(overrides?: Partial<SettingsModalState>) {
  const sharedFeedRowProps = {
    deletingKey: null,
    draggingFeedKey: null,
    editingFeedKey: null,
    editingFeedName: "",
    editingFeedUrl: "",
    feedDropTarget: null,
    movingFeedKey: null,
    onCancelFeedEdit: mock(() => {}),
    onEditingFeedNameChange: mock(() => {}),
    onEditingFeedUrlChange: mock(() => {}),
    onFeedDragEnd: mock(() => {}),
    onFeedDragOver: mock(() => {}),
    onFeedDragStart: mock(() => {}),
    onFeedDrop: mock(async () => {}),
    onRemoveFeed: mock(() => {}),
    onSaveFeedRename: mock(() => {}),
    onStartFeedEdit: mock(() => {}),
    onToggleExtractionDisabled: mock(() => {}),
    onToggleFeedEnabled: mock(() => {}),
    onToggleProxyEnabled: mock(() => {}),
    savingFeedKey: null,
    selectedCategory: "cat-news",
    togglingFeedKey: null,
    updatingSettingsKey: null,
  };

  return {
    addingFeedInCategory: null,
    drag: {
      categoryDropIndex: null,
      draggingCategoryLabel: null,
      draggingFeedKey: null,
      feedDropTarget: null,
      movingFeedKey: null,
      onCategoryDragEnd: mock(() => {}),
      onCategoryDragOver: mock(() => {}),
      onCategoryDragStart: mock(() => {}),
      onCategoryDrop: mock(async () => {}),
      onFeedDragEnd: sharedFeedRowProps.onFeedDragEnd,
      onFeedDragOver: sharedFeedRowProps.onFeedDragOver,
      onFeedDragStart: sharedFeedRowProps.onFeedDragStart,
      onFeedDrop: sharedFeedRowProps.onFeedDrop,
    },
    editingCategory: null,
    editingCategoryName: "",
    handleAddCategory: mock(() => {}),
    handleAddFeed: mock(async (_label: string) => {}),
    handleOpmlFileChange: mock(async () => {}),
    handleSaveCategoryRename: mock(async () => {}),
    isImportingOpml: false,
    isSavingFeed: false,
    newCategoryName: "",
    newFeedName: "",
    newFeedUrl: "",
    onCancelAddFeed: mock(() => {}),
    onCancelCategoryEdit: mock(() => {}),
    onStartCategoryEdit: mock(() => {}),
    onToggleAddFeed: mock(() => {}),
    opmlInputRef: { current: null } as { current: HTMLInputElement | null },
    savingCategoryLabel: null,
    setEditingCategoryName: mock(() => {}),
    setNewCategoryName: mock(() => {}),
    setNewFeedName: mock(() => {}),
    setNewFeedUrl: mock(() => {}),
    sharedFeedRowProps,
    ...overrides,
  } as unknown as SettingsModalState;
}
