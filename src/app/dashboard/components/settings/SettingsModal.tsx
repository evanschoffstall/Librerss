import { Settings2, X } from "lucide-react";

import { type SettingsPanelProps } from "./SettingsPanel";
import { SettingsSections } from "./SettingsSections";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  ScrollArea,
  SETTINGS_SURFACE_DESCRIPTION,
  SETTINGS_SURFACE_TITLE,
  useIsMobile,
  useSettingsModalState,
} from "./SettingsSurface";

export type SettingsModalProps = SettingsPanelProps;

/**
 * Restores the original scrollable settings modal surface used by the live
 * dashboard while reusing the shared settings section composition.
 */
export function SettingsModal(props: SettingsModalProps) {
  const {
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
  } = props;
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

  const sectionsProps = {
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
    if (open) {
      return;
    }

    onClose();
  };

  if (isMobile) {
    return (
      <Drawer onOpenChange={handleModalOpenChange} open>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerHeader className="relative">
            <DrawerTitle className="flex items-center gap-2 text-left">
              <Settings2 className="size-4 shrink-0 text-muted-foreground" />
              {SETTINGS_SURFACE_TITLE}
            </DrawerTitle>
            <DrawerDescription>{SETTINGS_SURFACE_DESCRIPTION}</DrawerDescription>
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
            <SettingsSections {...sectionsProps} />
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
            {SETTINGS_SURFACE_TITLE}
          </DialogTitle>
          <DialogDescription>{SETTINGS_SURFACE_DESCRIPTION}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <SettingsSections {...sectionsProps} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
