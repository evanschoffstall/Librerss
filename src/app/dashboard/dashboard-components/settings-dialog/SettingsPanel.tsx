import { Globe, Monitor, Rss, Settings2, Shield, X } from "lucide-react";
import { useEffect } from "react";

import type { CategoryTreeNode } from "@/lib/core";
import type { OpmlFeedImportEntry } from "@/lib/utils";

import { SettingsAccountSection } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsAccountSection";
import {
  SettingsDisplaySection,
  type SettingsDisplaySectionProps,
} from "@/app/dashboard/dashboard-components/settings-dialog/SettingsDisplaySection";
import { SettingsFeedManagementSection } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsFeedManagementSection";
import { SettingsPreviewSection } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsPreviewSection";
import { SettingsProxySection } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsProxySection";
import { SETTINGS_PANEL_TAB_STORAGE_KEY } from "@/app/dashboard/dashboard-services/dashboard-constants";
import { useSettingsModalState } from "@/app/dashboard/settings-state";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile, useLocalStorage } from "@/lib/hooks";

const SETTINGS_SURFACE_TITLE = "Reader Settings";
const SETTINGS_SURFACE_DESCRIPTION =
  "Manage categories, feeds, ordering, and runtime behavior.";

interface SettingsPanelShellOptions {
  activeTab: SettingsTabValue;
  handleOpenChange: (open: boolean) => void;
  handleTabChange: (nextValue: string) => void;
  isPreviewMode: boolean;
  tabContent: React.ReactNode;
}

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

/**
 * Tabbed settings panel replacing the old monolithic scrolling modal.
 * @param props
 */
export function SettingsPanel(props: SettingsPanelProps) {
  const isMobile = useIsMobile();
  const isPreviewMode = props.isPreviewMode ?? false;
  const runtime = useSettingsPanelRuntime(
    buildSettingsPanelRuntimeOptions(props),
  );
  const shellProps = {
    activeTab: runtime.activeTab,
    handleOpenChange: runtime.handleOpenChange,
    handleTabChange: runtime.handleTabChange,
    isPreviewMode,
    tabContent: runtime.tabContent,
  };

  if (isMobile) {
    return <SettingsPanelMobileShell {...shellProps} />;
  }

  return <SettingsPanelDesktopShell {...shellProps} />;
}

/**
 * @param props
 */
function buildSettingsPanelRuntimeOptions(props: SettingsPanelProps) {
  return {
    ...props,
    isPreviewMode: props.isPreviewMode ?? false,
  };
}

/**
 * Returns true for tabs that should be hidden entirely in preview/demo mode.
 * @param value
 */
function isPreviewOnlyTab(value: SettingsTabValue): boolean {
  return value === "account";
}

/**
 * Validates persisted tab state and strips preview-incompatible tabs.
 * @param value
 * @param isPreviewMode
 */
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
 * @param options
 */
function SettingsPanelDesktopShell(options: SettingsPanelShellOptions) {
  return (
    <TooltipProvider delayDuration={300}>
      <Dialog onOpenChange={options.handleOpenChange} open>
        <DialogContent
          className="
            flex h-[85vh] max-h-[85vh] max-w-3xl flex-col overflow-hidden p-0
          "
        >
          <Tabs
            className="flex min-h-0 flex-1 flex-col"
            onValueChange={options.handleTabChange}
            value={options.activeTab}
          >
            <div className="shrink-0 border-b px-6 pt-5 pb-0">
              <DialogHeader className="pb-3">
                <DialogTitle className="flex items-center gap-2">
                  <Settings2 className="size-4 shrink-0 text-muted-foreground" />
                  {SETTINGS_SURFACE_TITLE}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {SETTINGS_SURFACE_DESCRIPTION}
                </DialogDescription>
              </DialogHeader>

              <TabsList
                className="
                h-auto rounded-none border-none bg-transparent p-0
              "
              >
                <SettingsTabTriggers isPreviewMode={options.isPreviewMode} />
              </TabsList>
            </div>

            <ScrollArea className="min-h-0 flex-1 px-6 py-4">
              {options.tabContent}
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

/**
 * @param options
 */
function SettingsPanelMobileShell(options: SettingsPanelShellOptions) {
  return (
    <TooltipProvider delayDuration={300}>
      <Drawer onOpenChange={options.handleOpenChange} open>
        <DrawerContent className="flex max-h-[90dvh] flex-col">
          <DrawerHeader className="relative shrink-0 pb-0">
            <DrawerTitle className="flex items-center gap-2 text-left">
              <Settings2 className="size-4 shrink-0 text-muted-foreground" />
              {SETTINGS_SURFACE_TITLE}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              {SETTINGS_SURFACE_DESCRIPTION}
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
            onValueChange={options.handleTabChange}
            value={options.activeTab}
          >
            <div className="shrink-0 px-4 pt-2 pb-1">
              <TabsList className="w-full">
                <SettingsTabTriggers
                  isPreviewMode={options.isPreviewMode}
                  mobile
                />
              </TabsList>
            </div>

            <ScrollArea
              className="
                flex min-h-0 flex-1 flex-col px-4 pb-6
                **:data-radix-scroll-area-viewport:touch-pan-y
                **:data-radix-scroll-area-viewport:overscroll-contain
                **:data-radix-scroll-area-viewport:[-webkit-overflow-scrolling:touch]
                [&_[data-radix-scroll-area-viewport]>div]:block!
                [&_[data-radix-scroll-area-viewport]>div]:w-full!
                [&_[data-radix-scroll-area-viewport]>div]:min-w-0!
              "
            >
              {options.tabContent}
            </ScrollArea>
          </Tabs>
        </DrawerContent>
      </Drawer>
    </TooltipProvider>
  );
}

/**
 * Renders the content pane for each settings tab.
 *
 * Using TabsContent ensures only the active tab's DOM is reachable, giving
 * focused keyboard navigation and eliminating the old monolithic scroll.
 * @param root0
 * @param root0.articlesPerPage
 * @param root0.autoRefreshIntervalMinutes
 * @param root0.backgroundMode
 * @param root0.categories
 * @param root0.distillStrategy
 * @param root0.isPreviewMode
 * @param root0.onAccountDeleted
 * @param root0.onArticlesPerPageChange
 * @param root0.onAutoRefreshIntervalMinutesChange
 * @param root0.onBackgroundModeChange
 * @param root0.onDistillStrategyChange
 * @param root0.onRemoveCategory
 * @param root0.onShowFaviconsChange
 * @param root0.pendingCategoryRemovalLabel
 * @param root0.showFavicons
 * @param root0.state
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
          <SettingsProxySection isPreviewMode={isPreviewMode} />
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

/**
 * @param options
 * @param options.isPreviewMode
 * @param options.mobile
 */
function SettingsTabTriggers(options: {
  isPreviewMode: boolean;
  mobile?: boolean;
}) {
  return SETTINGS_TABS.map(({ icon: Icon, label, value }) => {
    if (options.isPreviewMode && isPreviewOnlyTab(value)) return null;
    return (
      <TabsTrigger
        className={
          options.mobile
            ? "flex-1 gap-1.5 text-xs"
            : `
              gap-1.5 rounded-none border-b-2 border-transparent bg-transparent
              px-4 pb-2.5 shadow-none
              data-[state=active]:border-primary
              data-[state=active]:bg-transparent data-[state=active]:shadow-none
            `
        }
        key={value}
        value={value}
      >
        <Icon className={options.mobile ? "size-3" : "size-3.5"} />
        {label}
      </TabsTrigger>
    );
  });
}

/**
 * @param options
 */
function useSettingsPanelRuntime(
  options: Omit<SettingsPanelProps, "isPreviewMode"> & {
    isPreviewMode: boolean;
  },
) {
  const [persistedTab, setPersistedTab] = useLocalStorage(
    SETTINGS_PANEL_TAB_STORAGE_KEY,
    DEFAULT_TAB,
  );
  const state = useSettingsModalState({
    categories: options.categories,
    onAddCategory: options.onAddCategory,
    onAddFeed: options.onAddFeed,
    onDropCategory: options.onDropCategory,
    onDropFeed: options.onDropFeed,
    onImportOpml: options.onImportOpml,
    onRemoveFeed: options.onRemoveFeed,
    onRenameCategory: options.onRenameCategory,
    onRenameFeed: options.onRenameFeed,
    onSetFeedEnabled: options.onSetFeedEnabled,
    onUpdateFeedSettings: options.onUpdateFeedSettings,
    selectedCategory: options.selectedCategory,
  });
  const activeTab = normalizeSettingsTabValue(
    persistedTab,
    options.isPreviewMode,
  );

  useEffect(() => {
    if (persistedTab !== activeTab) {
      setPersistedTab(activeTab);
    }
  }, [activeTab, persistedTab, setPersistedTab]);

  /**
   * @param open
   */
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      options.onClose();
    }
  };
  /**
   * @param nextValue
   */
  const handleTabChange = (nextValue: string) => {
    setPersistedTab(
      normalizeSettingsTabValue(nextValue, options.isPreviewMode),
    );
  };
  const tabContent = (
    <SettingsTabContent
      articlesPerPage={options.articlesPerPage}
      autoRefreshIntervalMinutes={options.autoRefreshIntervalMinutes}
      backgroundMode={options.backgroundMode}
      categories={options.categories}
      distillStrategy={options.distillStrategy}
      isPreviewMode={options.isPreviewMode}
      onAccountDeleted={() => {
        options.onClose();
        window.location.assign("/landing");
      }}
      onArticlesPerPageChange={options.onArticlesPerPageChange}
      onAutoRefreshIntervalMinutesChange={
        options.onAutoRefreshIntervalMinutesChange
      }
      onBackgroundModeChange={options.onBackgroundModeChange}
      onDistillStrategyChange={options.onDistillStrategyChange}
      onRemoveCategory={options.onRemoveCategory}
      onShowFaviconsChange={options.onShowFaviconsChange}
      pendingCategoryRemovalLabel={options.pendingCategoryRemovalLabel}
      showFavicons={options.showFavicons}
      state={state}
    />
  );

  return {
    activeTab,
    handleOpenChange,
    handleTabChange,
    tabContent,
  };
}
