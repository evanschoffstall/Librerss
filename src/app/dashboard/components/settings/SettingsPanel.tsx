import { useEffect } from "react";
import { Globe, Monitor, Rss, Settings2, Shield, X } from "lucide-react";

import { SettingsAccountSection } from "@/app/dashboard/components/settings/SettingsAccountSection";
import { SETTINGS_PANEL_TAB_STORAGE_KEY } from "@/app/dashboard/constants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type CategoryTreeNode, type OpmlFeedImportEntry } from "@/lib";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";

import { useSettingsModalState } from "../../hooks/useSettingsModalState";
import {
  SettingsDisplaySection,
  type SettingsDisplaySectionProps,
} from "./SettingsDisplaySection";
import { SettingsFeedManagementSection } from "./SettingsFeedManagementSection";
import { SettingsPreviewSection } from "./SettingsPreviewSection";
import { SettingsProxySection } from "./SettingsProxySection";

const TITLE = "Settings";
const DESCRIPTION =
  "Manage categories, feeds, ordering, and runtime behavior.";

const DEFAULT_TAB = "display";

/**
 * Tab definitions for the settings panel.
 *
 * Each tab maps to exactly one settings section, providing icon-labeled
 * navigation that replaces the old single-scroll layout.
 */
const SETTINGS_TABS = [
  { icon: Monitor, label: "Display", value: "display" },
  { icon: Rss, label: "Feeds", value: "feeds" },
  { icon: Globe, label: "Network", value: "network" },
  { icon: Shield, label: "Account", value: "account" },
] as const;

export interface SettingsPanelProps extends SettingsDisplaySectionProps {
  categories: CategoryTreeNode[];
  isPreviewMode?: boolean;
  onAddCategory: (name: string) => boolean;
  onAddFeed: (name: string, url: string, category: string) => Promise<boolean>;
  onClose: () => void;
  onDropCategory: (label: string, targetIndex: number) => Promise<void>;
  onDropFeed: (
    key: string,
    targetCategory: string,
    targetIndex: number,
  ) => Promise<void>;
  onImportOpml: (entries: OpmlFeedImportEntry[]) => Promise<void>;
  onRemoveCategory: (label: string) => Promise<boolean>;
  onRemoveFeed: (key: string) => Promise<void>;
  onRenameCategory: (fromLabel: string, toLabel: string) => Promise<boolean>;
  onRenameFeed: (key: string, name: string, url: string) => Promise<boolean>;
  onSetFeedEnabled: (key: string, enabled: boolean) => Promise<boolean>;
  onUpdateFeedSettings: (
    key: string,
    settings: { extractionDisabled?: boolean; proxyEnabled?: boolean },
  ) => Promise<boolean>;
  pendingCategoryRemovalLabel: null | string;
  selectedCategory: string;
}

type SettingsTabValue = (typeof SETTINGS_TABS)[number]["value"];

const SETTINGS_TAB_VALUES = new Set<SettingsTabValue>(
  SETTINGS_TABS.map((tab) => tab.value),
);

/** Tabbed settings panel replacing the old monolithic scrolling modal. */
export function SettingsPanel({
  articlesPerPage,
  autoRefreshIntervalMinutes,
  backgroundMode,
  categories,
  distillStrategy,
  isPreviewMode = false,
  onAddCategory,
  onAddFeed,
  onArticlesPerPageChange,
  onAutoRefreshIntervalMinutesChange,
  onBackgroundModeChange,
  onClose,
  onDistillStrategyChange,
  onDropCategory,
  onDropFeed,
  onImportOpml,
  onRemoveCategory,
  onRemoveFeed,
  onRenameCategory,
  onRenameFeed,
  onSetFeedEnabled,
  onShowFaviconsChange,
  onUpdateFeedSettings,
  pendingCategoryRemovalLabel,
  selectedCategory,
  showFavicons,
}: SettingsPanelProps) {
  const isMobile = useIsMobile();
  const [persistedTab, setPersistedTab] = useLocalStorage<string>(
    SETTINGS_PANEL_TAB_STORAGE_KEY,
    DEFAULT_TAB,
  );
  const state = useSettingsModalState({
    categories,
    onAddCategory,
    onAddFeed,
    onDropCategory,
    onDropFeed,
    onImportOpml,
    onRemoveFeed,
    onRenameCategory,
    onRenameFeed,
    onSetFeedEnabled,
    onUpdateFeedSettings,
    selectedCategory,
  });
  const activeTab = normalizeSettingsTabValue(persistedTab, isPreviewMode);

  useEffect(() => {
    if (persistedTab === activeTab) return;
    setPersistedTab(activeTab);
  }, [activeTab, persistedTab, setPersistedTab]);

  const handleAccountDeleted = () => {
    onClose();
    window.location.assign("/landing");
  };

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    onClose();
  };

  const handleTabChange = (nextValue: string) => {
    setPersistedTab(normalizeSettingsTabValue(nextValue, isPreviewMode));
  };

  const tabContent = (
    <SettingsTabContent
      articlesPerPage={articlesPerPage}
      autoRefreshIntervalMinutes={autoRefreshIntervalMinutes}
      backgroundMode={backgroundMode}
      categories={categories}
      distillStrategy={distillStrategy}
      isPreviewMode={isPreviewMode}
      onAccountDeleted={handleAccountDeleted}
      onArticlesPerPageChange={onArticlesPerPageChange}
      onAutoRefreshIntervalMinutesChange={onAutoRefreshIntervalMinutesChange}
      onBackgroundModeChange={onBackgroundModeChange}
      onDistillStrategyChange={onDistillStrategyChange}
      onRemoveCategory={onRemoveCategory}
      onShowFaviconsChange={onShowFaviconsChange}
      pendingCategoryRemovalLabel={pendingCategoryRemovalLabel}
      showFavicons={showFavicons}
      state={state}
    />
  );

  if (isMobile) {
    return (
      <Drawer onOpenChange={handleOpenChange} open>
        <DrawerContent className="flex max-h-[90dvh] flex-col">
          <DrawerHeader className="relative shrink-0 pb-0">
            <DrawerTitle className="flex items-center gap-2 text-left">
              <Settings2 className="size-4 shrink-0 text-muted-foreground" />
              {TITLE}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              {DESCRIPTION}
            </DrawerDescription>
            <DrawerClose
              className="
                absolute top-3 right-4 cursor-pointer rounded-sm opacity-70
                ring-offset-background transition-opacity
                hover:opacity-100
              "
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DrawerClose>
          </DrawerHeader>

          <Tabs
            className="flex min-h-0 flex-1 flex-col"
            onValueChange={handleTabChange}
            value={activeTab}
          >
            <div className="shrink-0 px-4 pt-2 pb-1">
              <TabsList className="w-full">
                {SETTINGS_TABS.map(({ icon: Icon, label, value }) => {
                  if (isPreviewMode && isPreviewOnlyTab(value)) return null;
                  return (
                    <TabsTrigger
                      className="flex-1 gap-1.5 text-xs"
                      key={value}
                      value={value}
                    >
                      <Icon className="size-3" />
                      {label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <ScrollArea
              className="
                flex min-h-0 flex-1 flex-col px-4 pb-6
                [&_[data-radix-scroll-area-viewport]]:overscroll-contain
                [&_[data-radix-scroll-area-viewport]]:touch-pan-y
                [&_[data-radix-scroll-area-viewport]]:[-webkit-overflow-scrolling:touch]
                [&_[data-radix-scroll-area-viewport]>div]:block!
                [&_[data-radix-scroll-area-viewport]>div]:w-full!
                [&_[data-radix-scroll-area-viewport]>div]:min-w-0!
              "
            >
              {tabContent}
            </ScrollArea>
          </Tabs>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open>
      <DialogContent
        className="
          flex h-[85vh] max-h-[85vh] max-w-3xl flex-col overflow-hidden p-0
        "
      >
        <Tabs
          className="flex min-h-0 flex-1 flex-col"
          onValueChange={handleTabChange}
          value={activeTab}
        >
          <div className="shrink-0 border-b px-6 pt-5 pb-0">
            <DialogHeader className="pb-3">
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="size-4 shrink-0 text-muted-foreground" />
                {TITLE}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {DESCRIPTION}
              </DialogDescription>
            </DialogHeader>

            <TabsList className="
              h-auto rounded-none border-none bg-transparent p-0
            ">
              {SETTINGS_TABS.map(({ icon: Icon, label, value }) => {
                if (isPreviewMode && isPreviewOnlyTab(value)) return null;
                return (
                  <TabsTrigger
                    className="
                      gap-1.5 rounded-none border-b-2 border-transparent
                      bg-transparent px-4 pb-2.5 shadow-none
                      data-[state=active]:border-primary
                      data-[state=active]:bg-transparent
                      data-[state=active]:shadow-none
                    "
                    key={value}
                    value={value}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <ScrollArea className="min-h-0 flex-1 px-6 py-4">
            {tabContent}
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** Returns true for tabs that should be hidden entirely in preview/demo mode. */
function isPreviewOnlyTab(value: SettingsTabValue): boolean {
  return value === "account";
}

/** Validates persisted tab state and strips preview-incompatible tabs. */
function normalizeSettingsTabValue(
  value: string,
  isPreviewMode: boolean,
): SettingsTabValue {
  if (!SETTINGS_TAB_VALUES.has(value as SettingsTabValue)) return DEFAULT_TAB;

  const tabValue = value as SettingsTabValue;
  if (isPreviewMode && isPreviewOnlyTab(tabValue)) return DEFAULT_TAB;
  return tabValue;
}

/**
 * Renders the content pane for each settings tab.
 *
 * Using TabsContent ensures only the active tab's DOM is reachable, giving
 * focused keyboard navigation and eliminating the old monolithic scroll.
 */
function SettingsTabContent({
  articlesPerPage,
  autoRefreshIntervalMinutes,
  backgroundMode,
  categories,
  distillStrategy,
  isPreviewMode,
  onAccountDeleted,
  onArticlesPerPageChange,
  onAutoRefreshIntervalMinutesChange,
  onBackgroundModeChange,
  onDistillStrategyChange,
  onRemoveCategory,
  onShowFaviconsChange,
  pendingCategoryRemovalLabel,
  showFavicons,
  state,
}: SettingsDisplaySectionProps & {
  categories: CategoryTreeNode[];
  isPreviewMode: boolean;
  onAccountDeleted: () => void;
  onRemoveCategory: (label: string) => Promise<boolean>;
  pendingCategoryRemovalLabel: null | string;
  state: ReturnType<typeof useSettingsModalState>;
}) {
  return (
    <>
      <TabsContent className="mt-0" value="display">
        <SettingsDisplaySection
          articlesPerPage={articlesPerPage}
          autoRefreshIntervalMinutes={autoRefreshIntervalMinutes}
          backgroundMode={backgroundMode}
          distillStrategy={distillStrategy}
          onArticlesPerPageChange={onArticlesPerPageChange}
          onAutoRefreshIntervalMinutesChange={
            onAutoRefreshIntervalMinutesChange
          }
          onBackgroundModeChange={onBackgroundModeChange}
          onDistillStrategyChange={onDistillStrategyChange}
          onShowFaviconsChange={onShowFaviconsChange}
          showFavicons={showFavicons}
        />
      </TabsContent>

      <TabsContent className="mt-0" value="feeds">
        <SettingsFeedManagementSection
          categories={categories}
          isPreviewMode={isPreviewMode}
          onRemoveCategory={onRemoveCategory}
          pendingCategoryRemovalLabel={pendingCategoryRemovalLabel}
          state={state}
        />
      </TabsContent>

      <TabsContent className="mt-0" value="network">
        <SettingsPreviewSection isPreviewMode={isPreviewMode}>
          <SettingsProxySection />
        </SettingsPreviewSection>
      </TabsContent>

      {!isPreviewMode && (
        <TabsContent className="mt-0" value="account">
          <SettingsAccountSection onAccountDeleted={onAccountDeleted} />
        </TabsContent>
      )}
    </>
  );
}
