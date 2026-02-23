import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  type CategoryTreeNode,
  type OpmlFeedImportEntry,
} from "@/lib";
import { Loader2, Plus } from "lucide-react";
import { useSettingsModalState } from "../../hooks/useSettingsModalState";
import { SettingsCategoryList } from "./SettingsCategoryList";
import { SettingsDisplaySection } from "./SettingsDisplaySection";
import { SettingsImportSkeleton } from "./SettingsImportSkeleton";

interface SettingsModalProps {
  onClose: () => void;
  categories: CategoryTreeNode[];
  categoryOptions: string[];
  pendingCategoryRemovalLabel: string | null;
  selectedCategory: string;
  pageSize: number;
  showFavicons: boolean;
  onPageSizeChange: (size: number) => void;
  onShowFaviconsChange: (value: boolean) => void;
  onImportOpml: (entries: OpmlFeedImportEntry[]) => Promise<void>;
  onDropFeed: (key: string, targetCategory: string, targetIndex: number) => Promise<void>;
  onAddFeed: (name: string, url: string, category: string) => Promise<boolean>;
  onAddCategory: (name: string) => boolean;
  onRenameCategory: (fromLabel: string, toLabel: string) => Promise<boolean>;
  onDropCategory: (label: string, targetIndex: number) => Promise<void>;
  onRemoveCategory: (label: string) => Promise<boolean>;
  onRemoveFeed: (key: string) => Promise<void>;
  onRenameFeed: (key: string, name: string, url: string) => Promise<boolean>;
}

export const SettingsModal = ({
  onClose,
  categories,
  categoryOptions,
  pendingCategoryRemovalLabel,
  selectedCategory,
  pageSize,
  showFavicons,
  onPageSizeChange,
  onShowFaviconsChange,
  onImportOpml,
  onDropFeed,
  onAddFeed,
  onAddCategory,
  onRenameCategory,
  onDropCategory,
  onRemoveCategory,
  onRemoveFeed,
  onRenameFeed,
}: SettingsModalProps) => {
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
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-[90vh] max-h-[90vh] max-w-3xl overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Reader Settings</DialogTitle>
          <DialogDescription>
            Manage categories, feeds, ordering, and runtime behavior.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 py-1 pr-3">
            <SettingsDisplaySection
              pageSize={pageSize}
              showFavicons={showFavicons}
              onPageSizeChange={onPageSizeChange}
              onShowFaviconsChange={onShowFaviconsChange}
            />

            <section className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">Feeds</h3>
                  <p className="text-xs text-muted-foreground">
                    Manage categories, feeds, and ordering.
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
                    onSaveCategoryRename={(label) => void state.handleSaveCategoryRename(label)}
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
