import { Download, Loader2, Plus, Rss, Settings2, X } from "lucide-react";

import { useSettingsModalState } from "../../hooks/useSettingsModalState";

import { SettingsCategoryList } from "./SettingsCategoryList";
import {
  SettingsDisplaySection,
  type SettingsDisplaySectionProps,
} from "./SettingsDisplaySection";
import { SettingsImportSkeleton } from "./SettingsImportSkeleton";
import { SettingsProxySection } from "./SettingsProxySection";

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
import {
  type CategoryTreeNode,
  generateOpml,
  type OpmlFeedImportEntry,
} from "@/lib";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

const TITLE = "Reader Settings";
const DESCRIPTION = "Manage categories, feeds, ordering, and runtime behavior.";
interface SettingsModalProps extends SettingsDisplaySectionProps {
  categories: CategoryTreeNode[];
  categoryOptions: string[];
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

const DEMO_OVERLAY_LABEL = "Not available in demo mode";

function DemoOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[2px]">
      <span className="rounded-md border bg-card px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
        {DEMO_OVERLAY_LABEL}
      </span>
    </div>
  );
}

/** Shared body rendered inside both the Dialog and the Drawer. */
function SettingsBody({
  backgroundMode,
  categories,
  distillStrategy,
  isPreviewMode = false,
  onBackgroundModeChange,
  onDistillStrategyChange,
  onPageSizeChange,
  onRemoveCategory,
  onShowFaviconsChange,
  pageSize,
  pendingCategoryRemovalLabel,
  showFavicons,
  state,
}: SettingsDisplaySectionProps & {
  categories: CategoryTreeNode[];
  isPreviewMode?: boolean;
  onRemoveCategory: (label: string) => Promise<boolean>;
  pendingCategoryRemovalLabel: null | string;
  state: ReturnType<typeof useSettingsModalState>;
}) {
  return (
    <div className="space-y-4 py-1 pr-3">
      <SettingsDisplaySection
        backgroundMode={backgroundMode}
        distillStrategy={distillStrategy}
        onBackgroundModeChange={onBackgroundModeChange}
        onDistillStrategyChange={onDistillStrategyChange}
        onPageSizeChange={onPageSizeChange}
        onShowFaviconsChange={onShowFaviconsChange}
        pageSize={pageSize}
        showFavicons={showFavicons}
      />

      <div className="relative">
        {isPreviewMode && <DemoOverlay />}
        <section className="settings-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="section-heading">
                <Rss className="icon-muted" />
                Feeds
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Add, edit, organize, and import feed sources.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                accept=".opml,.xml,text/xml,application/xml"
                className="hidden"
                onChange={(event) => {
                  void state.handleOpmlFileChange(event);
                }}
                ref={state.opmlInputRef}
                type="file"
              />
              <Button
                className="h-8"
                onClick={() => {
                  const xml = generateOpml(categories);
                  const blob = new Blob([xml], { type: "text/xml" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "librerss-subscriptions.opml";
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                <Download className="mr-1.5 size-3.5" />
                Export OPML
              </Button>
              <Button
                className="h-8"
                disabled={state.isImportingOpml}
                onClick={() => state.opmlInputRef.current?.click()}
                size="sm"
                type="button"
                variant="outline"
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
                addingFeedInCategory={state.addingFeedInCategory}
                categories={categories}
                drag={state.drag}
                editingCategory={state.editingCategory}
                editingCategoryName={state.editingCategoryName}
                isSavingFeed={state.isSavingFeed}
                newCategoryName={state.newCategoryName}
                newFeedName={state.newFeedName}
                newFeedUrl={state.newFeedUrl}
                onAddCategory={state.handleAddCategory}
                onAddFeed={(label) => void state.handleAddFeed(label)}
                onCancelAddFeed={state.onCancelAddFeed}
                onCancelCategoryEdit={state.onCancelCategoryEdit}
                onEditingCategoryNameChange={state.setEditingCategoryName}
                onNewCategoryNameChange={state.setNewCategoryName}
                onNewFeedNameChange={state.setNewFeedName}
                onNewFeedUrlChange={state.setNewFeedUrl}
                onRemoveCategory={(label) => void onRemoveCategory(label)}
                onSaveCategoryRename={(label) =>
                  void state.handleSaveCategoryRename(label)
                }
                onStartCategoryEdit={state.onStartCategoryEdit}
                onToggleAddFeed={state.onToggleAddFeed}
                pendingCategoryRemovalLabel={pendingCategoryRemovalLabel}
                savingCategoryLabel={state.savingCategoryLabel}
                sharedFeedRowProps={state.sharedFeedRowProps}
              />
            )}
          </TooltipProvider>
        </section>
      </div>

      <div className="relative">
        {isPreviewMode && <DemoOverlay />}
        <SettingsProxySection />
      </div>
    </div>
  );
}

export const SettingsModal = ({
  backgroundMode,
  categories,
  categoryOptions,
  distillStrategy,
  isPreviewMode = false,
  onAddCategory,
  onAddFeed,
  onBackgroundModeChange,
  onClose,
  onDistillStrategyChange,
  onDropCategory,
  onDropFeed,
  onImportOpml,
  onPageSizeChange,
  onRemoveCategory,
  onRemoveFeed,
  onRenameCategory,
  onRenameFeed,
  onSetFeedEnabled,
  onShowFaviconsChange,
  onUpdateFeedSettings,
  pageSize,
  pendingCategoryRemovalLabel,
  selectedCategory,
  showFavicons,
}: SettingsModalProps) => {
  const isMobile = useIsMobile();
  const state = useSettingsModalState({
    categories,
    categoryOptions,
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
    backgroundMode,
    categories,
    distillStrategy,
    isPreviewMode,
    onBackgroundModeChange,
    onDistillStrategyChange,
    onPageSizeChange,
    onRemoveCategory,
    onShowFaviconsChange,
    pageSize,
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
            <DrawerClose className="absolute right-4 top-4 cursor-pointer rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DrawerClose>
          </DrawerHeader>
          <ScrollArea className="flex-1 px-4 pb-6">
            <SettingsBody {...bodyProps} />
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog onOpenChange={handleModalOpenChange} open>
      <DialogContent className="h-[90vh] max-h-[90vh] max-w-3xl overflow-hidden flex flex-col">
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
