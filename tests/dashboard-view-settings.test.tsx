import { render } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";

import type { CategoryTreeNode } from "@/lib/core";

const settings = {
  articlesPerPage: 12,
  autoRefreshIntervalMinutes: 30,
  backgroundMode: "none" as const,
  canManageInvitations: false,
  categories: [
    {
      children: [],
      key: "category-1",
      label: "News",
    },
  ] satisfies CategoryTreeNode[],
  categoryTree: {
    addCategory: mock(() => true),
    addFeedSource: mock(async () => true),
    importOpmlFeeds: mock(async () => {}),
    moveCategoryByDrop: mock(() => {}),
    moveFeedByDrop: mock(async () => {}),
    pendingCategoryRemovalLabel: null,
    removeCategory: mock(async () => true),
    removeFeedSource: mock(async () => {}),
    renameCategory: mock(async () => true),
    renameFeedSource: mock(async () => true),
    setFeedSourceEnabled: mock(async () => true),
    updateFeedSettings: mock(async () => true),
  },
  distillStrategy: "librerss",
  handleCloseSettings: mock(() => {}),
  onBackgroundModeChange: mock(() => {}),
  onDistillStrategyChange: mock(() => {}),
  selectedCategory: "category-1",
  setArticlesPerPage: mock(() => {}),
  setAutoRefreshIntervalMinutes: mock(() => {}),
  setShowFavicons: mock(() => {}),
  showFavicons: true,
  showSettingsModal: true,
  usePlaceholderData: false,
};

afterEach(() => {
  mock.restore();
});

describe("DashboardView settings wiring", () => {
  test("renders the tabbed settings panel when settings are open", async () => {
    mock.restore();
    mock.module(
      "@/app/dashboard/components/settings-dialog/SettingsPanel",
      () => ({
        SettingsPanel: () => <div data-testid="settings-panel" />,
      }),
    );

    const { DashboardSettingsModal } =
      await import("@/app/dashboard/view/DashboardSettingsModal");
    const { getByTestId } = render(
      <DashboardSettingsModal settings={settings as never} />,
    );

    expect(getByTestId("settings-panel")).toBeTruthy();
  });
});
