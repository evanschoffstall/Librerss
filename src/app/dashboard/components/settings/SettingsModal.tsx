import { Settings2, X } from "lucide-react";

import { SettingsAccountSection } from "@/app/dashboard/components/settings/SettingsAccountSection";
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
import { type CategoryTreeNode, type OpmlFeedImportEntry } from "@/lib";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

import {
  type SettingsModalState,
  useSettingsModalState,
} from "../../hooks/useSettingsModalState";
import {
  SettingsDisplaySection,
  type SettingsDisplaySectionProps,
} from "./SettingsDisplaySection";
import { SettingsFeedManagementSection } from "./SettingsFeedManagementSection";
import { SettingsPreviewSection } from "./SettingsPreviewSection";
import { SettingsProxySection } from "./SettingsProxySection";

const TITLE = "Reader Settings";
const DESCRIPTION = "Manage categories, feeds, ordering, and runtime behavior.";

interface SettingsModalProps extends SettingsDisplaySectionProps {
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

/** Shared body rendered inside both the Dialog and the Drawer. */
function SettingsBody({
  articlesPerPage,
  autoRefreshIntervalMinutes,
  backgroundMode,
  categories,
  distillStrategy,
  isPreviewMode = false,
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
  isPreviewMode?: boolean;
  onAccountDeleted: () => void;
  onRemoveCategory: (label: string) => Promise<boolean>;
  pendingCategoryRemovalLabel: null | string;
  state: SettingsModalState;
}) {
  return (
    <div className="space-y-4 py-1 pr-3">
      <SettingsDisplaySection
        articlesPerPage={articlesPerPage}
        autoRefreshIntervalMinutes={autoRefreshIntervalMinutes}
        backgroundMode={backgroundMode}
        distillStrategy={distillStrategy}
        onArticlesPerPageChange={onArticlesPerPageChange}
        onAutoRefreshIntervalMinutesChange={onAutoRefreshIntervalMinutesChange}
        onBackgroundModeChange={onBackgroundModeChange}
        onDistillStrategyChange={onDistillStrategyChange}
        onShowFaviconsChange={onShowFaviconsChange}
        showFavicons={showFavicons}
      />

      <SettingsFeedManagementSection
        categories={categories}
        isPreviewMode={isPreviewMode}
        onRemoveCategory={onRemoveCategory}
        pendingCategoryRemovalLabel={pendingCategoryRemovalLabel}
        state={state}
      />

      <SettingsPreviewSection isPreviewMode={isPreviewMode}>
        <SettingsProxySection />
      </SettingsPreviewSection>

      {!isPreviewMode && (
        <SettingsAccountSection onAccountDeleted={onAccountDeleted} />
      )}
    </div>
  );
}

export const SettingsModal = ({
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
}: SettingsModalProps) => {
  const isMobile = useIsMobile();
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

  const bodyProps = {
    articlesPerPage,
    autoRefreshIntervalMinutes,
    backgroundMode,
    categories,
    distillStrategy,
    isPreviewMode,
    onAccountDeleted: () => {
      onClose();
      window.location.assign("/landing");
    },
    onArticlesPerPageChange,
    onAutoRefreshIntervalMinutesChange,
    onBackgroundModeChange,
    onDistillStrategyChange,
    onRemoveCategory,
    onShowFaviconsChange,
    pendingCategoryRemovalLabel,
    showFavicons,
    state,
  } as const;

  const handleModalOpenChange = (open: boolean) => {
    if (open) return;
    onClose();
  };

  if (isMobile) {
    return (
      <Drawer onOpenChange={handleModalOpenChange} open>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerHeader className="relative">
            <DrawerTitle className="flex items-center gap-2 text-left">
              <Settings2 className="size-4 shrink-0 text-muted-foreground" />
              {TITLE}
            </DrawerTitle>
            <DrawerDescription>{DESCRIPTION}</DrawerDescription>
            <DrawerClose
              className="
                absolute top-4 right-4 cursor-pointer rounded-sm opacity-70
                ring-offset-background transition-opacity
                hover:opacity-100
              "
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DrawerClose>
          </DrawerHeader>
          <ScrollArea className="
            flex min-h-0 flex-1 flex-col px-4 pb-6
            [&>[data-radix-scroll-area-viewport]>div]:block!
          ">
            <SettingsBody {...bodyProps} />
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog onOpenChange={handleModalOpenChange} open>
      <DialogContent
        className="
          flex h-[90vh] max-h-[90vh] max-w-3xl flex-col overflow-hidden
        "
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-4 shrink-0 text-muted-foreground" />
            {TITLE}
          </DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <SettingsBody {...bodyProps} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
