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
  generateOpml,
  type CategoryTreeNode,
  type OpmlFeedImportEntry,
} from "@/lib";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { Download, Loader2, Plus, Rss, Settings2, X } from "lucide-react";
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
  isPreviewMode?: boolean;
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
  isPreviewMode = false,
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
  isPreviewMode?: boolean;
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
                onClick={() => {
                  const xml = generateOpml(categories);
                  const blob = new Blob([xml], { type: "text/xml" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "librerss-subscriptions.opml";
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                <Download className="mr-1.5 size-3.5" />
                Export OPML
              </Button>
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
      </div>

      <div className="relative">
        {isPreviewMode && <DemoOverlay />}
        <SettingsProxySection />
      </div>
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
  isPreviewMode = false,
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
    isPreviewMode,
  } as const;

  const handleModalOpenChange = (open: boolean) => {
    if (open) return;
    onClose();
  };

  if (isMobile) {
    return (
      <Drawer open onOpenChange={handleModalOpenChange}>
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
    <Dialog open onOpenChange={handleModalOpenChange}>
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
