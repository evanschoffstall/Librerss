import { Button } from "@/components/ui/button";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { type CategoryTreeNode, type OpmlFeedImportEntry } from "@/lib";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { Loader2, Plus, X } from "lucide-react";
import type { BackgroundMode } from "../../constants";
import { useSettingsModalState } from "../../hooks/useSettingsModalState";
import { SettingsCategoryList } from "./SettingsCategoryList";
import { SettingsDisplaySection } from "./SettingsDisplaySection";
import { SettingsImportSkeleton } from "./SettingsImportSkeleton";
import { SettingsProxySection } from "./SettingsProxySection";

const TITLE = "Reader Settings";
const DESCRIPTION = "Manage categories, feeds, ordering, and runtime behavior.";

interface SettingsModalProps {
  onClose: () => void;
  categories: CategoryTreeNode[];
  categoryOptions: string[];
  pendingCategoryRemovalLabel: string | null;
  selectedCategory: string;
  pageSize: number;
  showFavicons: boolean;
  backgroundMode: BackgroundMode;
  onPageSizeChange: (size: number) => void;
  onShowFaviconsChange: (value: boolean) => void;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  onImportOpml: (entries: OpmlFeedImportEntry[]) => Promise<void>;
  onDropFeed: (
    key: string,
    targetCategory: string,
    targetIndex: number,
  ) => Promise<void>;
  onAddFeed: (name: string, url: string, category: string) => Promise<boolean>;
  onAddCategory: (name: string) => boolean;
  onRenameCategory: (fromLabel: string, toLabel: string) => Promise<boolean>;
  onDropCategory: (label: string, targetIndex: number) => Promise<void>;
  onRemoveCategory: (label: string) => Promise<boolean>;
  onRemoveFeed: (key: string) => Promise<void>;
  onRenameFeed: (key: string, name: string, url: string) => Promise<boolean>;
  onSetFeedEnabled: (key: string, enabled: boolean) => Promise<boolean>;
  onUpdateFeedSettings: (
    key: string,
    settings: { extractionDisabled?: boolean; proxyEnabled?: boolean },
  ) => Promise<boolean>;
}

/** Shared body rendered inside both the Dialog and the Drawer. */
function SettingsBody({
  state,
  categories,
  pendingCategoryRemovalLabel,
  pageSize,
  showFavicons,
  backgroundMode,
  onPageSizeChange,
  onShowFaviconsChange,
  onBackgroundModeChange,
  onRemoveCategory,
}: {
  state: ReturnType<typeof useSettingsModalState>;
  categories: CategoryTreeNode[];
  pendingCategoryRemovalLabel: string | null;
  pageSize: number;
  showFavicons: boolean;
  backgroundMode: BackgroundMode;
  onPageSizeChange: (size: number) => void;
  onShowFaviconsChange: (value: boolean) => void;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  onRemoveCategory: (label: string) => Promise<boolean>;
}) {
  return (
    <div className="space-y-4 py-1 pr-3">
      <SettingsDisplaySection
        pageSize={pageSize}
        showFavicons={showFavicons}
        backgroundMode={backgroundMode}
        onPageSizeChange={onPageSizeChange}
        onShowFaviconsChange={onShowFaviconsChange}
        onBackgroundModeChange={onBackgroundModeChange}
      />

      <section className="rounded-lg border bg-card p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Feeds</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Add, edit, organize, and import feed sources.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <input
              ref={state.opmlInputRef}
              type="file"
              accept=".opml,.xml,text/xml,application/xml"
              className="hidden"
              onChange={state.handleOpmlFileChange}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => state.opmlInputRef.current?.click()}
              disabled={state.isImportingOpml}
            >
              {state.isImportingOpml ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1.5 size-3.5" />
              )}
              Import OPML
            </Button>
          </div>
        </div>

        <TooltipProvider delayDuration={300}>
          {state.isImportingOpml ? (
            <SettingsImportSkeleton />
          ) : (
            <SettingsCategoryList
              categories={categories}
              pendingCategoryRemovalLabel={pendingCategoryRemovalLabel}
              newCategoryName={state.newCategoryName}
              addingFeedInCategory={state.addingFeedInCategory}
              newFeedName={state.newFeedName}
              newFeedUrl={state.newFeedUrl}
              isSavingFeed={state.isSavingFeed}
              editingCategory={state.editingCategory}
              editingCategoryName={state.editingCategoryName}
              savingCategoryLabel={state.savingCategoryLabel}
              drag={state.drag}
              onNewCategoryNameChange={state.setNewCategoryName}
              onAddCategory={state.handleAddCategory}
              onEditingCategoryNameChange={state.setEditingCategoryName}
              onSaveCategoryRename={(label) =>
                void state.handleSaveCategoryRename(label)
              }
              onCancelCategoryEdit={state.onCancelCategoryEdit}
              onStartCategoryEdit={state.onStartCategoryEdit}
              onToggleAddFeed={state.onToggleAddFeed}
              onRemoveCategory={(label) => void onRemoveCategory(label)}
              onNewFeedNameChange={state.setNewFeedName}
              onNewFeedUrlChange={state.setNewFeedUrl}
              onAddFeed={(label) => void state.handleAddFeed(label)}
              onCancelAddFeed={state.onCancelAddFeed}
              sharedFeedRowProps={state.sharedFeedRowProps}
            />
          )}
        </TooltipProvider>
      </section>

      <SettingsProxySection />
    </div>
  );
}

export const SettingsModal = ({
  onClose,
  categories,
  categoryOptions,
  pendingCategoryRemovalLabel,
  selectedCategory,
  pageSize,
  showFavicons,
  backgroundMode,
  onPageSizeChange,
  onShowFaviconsChange,
  onBackgroundModeChange,
  onImportOpml,
  onDropFeed,
  onAddFeed,
  onAddCategory,
  onRenameCategory,
  onDropCategory,
  onRemoveCategory,
  onRemoveFeed,
  onRenameFeed,
  onSetFeedEnabled,
  onUpdateFeedSettings,
}: SettingsModalProps) => {
  const isMobile = useIsMobile();
  const state = useSettingsModalState({
    categories,
    categoryOptions,
    selectedCategory,
    onImportOpml,
    onDropFeed,
    onAddFeed,
    onAddCategory,
    onRenameCategory,
    onDropCategory,
    onRemoveFeed,
    onRenameFeed,
    onSetFeedEnabled,
    onUpdateFeedSettings,
  });

  const bodyProps = {
    state,
    categories,
    pendingCategoryRemovalLabel,
    pageSize,
    showFavicons,
    backgroundMode,
    onPageSizeChange,
    onShowFaviconsChange,
    onBackgroundModeChange,
    onRemoveCategory,
  } as const;

  if (isMobile) {
    return (
      <Drawer open onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerHeader className="relative">
            <DrawerTitle>{TITLE}</DrawerTitle>
            <DrawerDescription>{DESCRIPTION}</DrawerDescription>
            <DrawerClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DrawerClose>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            <SettingsBody {...bodyProps} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-[90vh] max-h-[90vh] max-w-3xl overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <SettingsBody {...bodyProps} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
