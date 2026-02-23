import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isSameCategoryLabel, type CategoryTreeNode } from "@/lib";
import { GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { SettingsFeedRow } from "./SettingsFeedRow";
import { SettingsIconBtn } from "./SettingsIconBtn";

interface SettingsCategoryAccordionItemProps {
  categoryNode: CategoryTreeNode;
  categoryIndex: number;
  selectedCategory: string;
  pendingCategoryRemovalLabel: string | null;
  // Inline add-feed form
  addingFeedInCategory: string | null;
  newFeedName: string;
  newFeedUrl: string;
  isSavingFeed: boolean;
  // Category edit
  editingCategory: string | null;
  editingCategoryName: string;
  savingCategoryLabel: string | null;
  // Feed edit/state
  editingFeedKey: string | null;
  editingFeedName: string;
  savingFeedKey: string | null;
  deletingKey: string | null;
  movingFeedKey: string | null;
  draggingFeedKey: string | null;
  feedDropTarget: { categoryLabel: string; index: number } | null;
  categoryDropIndex: number | null;
  // Callbacks — category
  onCategoryDragStart: (event: React.DragEvent<HTMLButtonElement>, label: string) => void;
  onCategoryDragEnd: () => void;
  onCategoryDragOver: (event: React.DragEvent<HTMLElement>, index: number) => void;
  onCategoryDrop: (event: React.DragEvent<HTMLElement>, index: number) => void;
  onEditingCategoryNameChange: (name: string) => void;
  onSaveCategoryRename: (label: string) => void;
  onCancelCategoryEdit: () => void;
  onStartCategoryEdit: (label: string) => void;
  onToggleAddFeed: (label: string) => void;
  onRemoveCategory: (label: string) => void;
  // Callbacks — feed form
  onNewFeedNameChange: (name: string) => void;
  onNewFeedUrlChange: (url: string) => void;
  onAddFeed: (categoryLabel: string) => void;
  onCancelAddFeed: () => void;
  // Callbacks — feed row
  onFeedDragStart: (event: React.DragEvent<HTMLButtonElement>, key: string) => void;
  onFeedDragEnd: () => void;
  onFeedDragOver: (event: React.DragEvent<HTMLElement>, categoryLabel: string, index: number) => void;
  onFeedDrop: (event: React.DragEvent<HTMLElement>, categoryLabel: string, index: number) => void;
  onSelectFeed: (key: string) => void;
  onEditingFeedNameChange: (name: string) => void;
  onSaveFeedRename: (key: string) => void;
  onCancelFeedEdit: () => void;
  onStartFeedEdit: (key: string, currentName: string) => void;
  onRemoveFeed: (key: string) => void;
}

export function SettingsCategoryAccordionItem({
  categoryNode,
  categoryIndex,
  selectedCategory,
  pendingCategoryRemovalLabel,
  addingFeedInCategory,
  newFeedName,
  newFeedUrl,
  isSavingFeed,
  editingCategory,
  editingCategoryName,
  savingCategoryLabel,
  editingFeedKey,
  editingFeedName,
  savingFeedKey,
  deletingKey,
  movingFeedKey,
  draggingFeedKey,
  feedDropTarget,
  categoryDropIndex,
  onCategoryDragStart,
  onCategoryDragEnd,
  onCategoryDragOver,
  onCategoryDrop,
  onEditingCategoryNameChange,
  onSaveCategoryRename,
  onCancelCategoryEdit,
  onStartCategoryEdit,
  onToggleAddFeed,
  onRemoveCategory,
  onNewFeedNameChange,
  onNewFeedUrlChange,
  onAddFeed,
  onCancelAddFeed,
  onFeedDragStart,
  onFeedDragEnd,
  onFeedDragOver,
  onFeedDrop,
  onSelectFeed,
  onEditingFeedNameChange,
  onSaveFeedRename,
  onCancelFeedEdit,
  onStartFeedEdit,
  onRemoveFeed,
}: SettingsCategoryAccordionItemProps) {
  const categoryFeeds = categoryNode.children ?? [];
  const isEditing = editingCategory === categoryNode.label;
  const isAddingFeed = addingFeedInCategory === categoryNode.label;
  const isPendingRemoval = isSameCategoryLabel(categoryNode.label, pendingCategoryRemovalLabel);

  return (
    <div
      key={`${categoryNode.key}-motion`}
      className={
        categoryDropIndex === categoryIndex
          ? "rounded-md border border-primary bg-primary/5 transition-colors duration-150"
          : "transition-colors duration-150"
      }
      onDragOver={(event) => onCategoryDragOver(event, categoryIndex)}
      onDrop={(event) => onCategoryDrop(event, categoryIndex)}
    >
      <AccordionItem
        value={categoryNode.key}
        className="rounded-md border border-b px-0"
      >
        <div className="flex items-center gap-2 px-3">
          {!isEditing && (
            <button
              type="button"
              draggable
              onDragStart={(event) => onCategoryDragStart(event, categoryNode.label)}
              onDragEnd={onCategoryDragEnd}
              className="shrink-0 cursor-grab text-muted-foreground/70 transition-colors hover:text-foreground active:cursor-grabbing"
              aria-label={`Drag category ${categoryNode.label}`}
            >
              <GripVertical className="size-4" />
            </button>
          )}

          {isEditing ? (
            <div className="mr-2 flex flex-1 items-center gap-2 py-2.5">
              <Input
                value={editingCategoryName}
                onChange={(e) => onEditingCategoryNameChange(e.target.value)}
                className="h-7 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSaveCategoryRename(categoryNode.label);
                  if (e.key === "Escape") onCancelCategoryEdit();
                }}
              />
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => onSaveCategoryRename(categoryNode.label)}
                disabled={!editingCategoryName.trim() || savingCategoryLabel === categoryNode.label}
              >
                {savingCategoryLabel === categoryNode.label && (
                  <Loader2 className="mr-1 size-3 animate-spin" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={onCancelCategoryEdit}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <AccordionTrigger className="flex-1 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70 hover:no-underline">
              <span
                className="flex items-center gap-2"
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onStartCategoryEdit(categoryNode.label);
                }}
                title="Double-click to rename"
              >
                {categoryNode.label}
              </span>
            </AccordionTrigger>
          )}

          {!isEditing && (
            <div className="flex shrink-0 items-center gap-0.5">
              <SettingsIconBtn
                tip="Add feed"
                onClick={() => onToggleAddFeed(categoryNode.label)}
                className={isAddingFeed ? "bg-accent" : ""}
              >
                <Plus className="size-3.5" />
              </SettingsIconBtn>
              <SettingsIconBtn
                tip={isPendingRemoval ? "Click again to confirm" : "Delete category"}
                onClick={() => onRemoveCategory(categoryNode.label)}
                className={
                  isPendingRemoval
                    ? "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                    : "text-muted-foreground hover:text-destructive"
                }
              >
                <Trash2 className="size-3.5" />
              </SettingsIconBtn>
            </div>
          )}
        </div>

        <AccordionContent className="px-3 pb-3">
          {isAddingFeed && (
            <div className="mb-2 flex items-center gap-2 rounded-md border border-dashed p-2 transition-colors duration-150">
              <Input
                value={newFeedName}
                onChange={(e) => onNewFeedNameChange(e.target.value)}
                placeholder="Feed name"
                className="h-8 text-sm"
                autoFocus
              />
              <Input
                value={newFeedUrl}
                onChange={(e) => onNewFeedUrlChange(e.target.value)}
                placeholder="https://example.com/feed.xml"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newFeedName.trim() && newFeedUrl.trim()) {
                    onAddFeed(categoryNode.label);
                  }
                  if (e.key === "Escape") onCancelAddFeed();
                }}
              />
              <Button
                size="sm"
                className="h-8 shrink-0"
                onClick={() => onAddFeed(categoryNode.label)}
                disabled={!newFeedName.trim() || !newFeedUrl.trim() || isSavingFeed}
              >
                {isSavingFeed ? <Loader2 className="size-3.5 animate-spin" /> : "Add"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 shrink-0 px-2"
                onClick={onCancelAddFeed}
              >
                Cancel
              </Button>
            </div>
          )}

          {categoryFeeds.length === 0 && !isAddingFeed ? (
            <div
              className={`rounded-md border border-dashed px-3 py-4 text-center text-xs ${feedDropTarget?.categoryLabel === categoryNode.label && feedDropTarget?.index === 0
                ? "border-primary bg-primary/5 text-foreground"
                : "text-muted-foreground"
                }`}
              onDragOver={(event) => onFeedDragOver(event, categoryNode.label, 0)}
              onDrop={(event) => onFeedDrop(event, categoryNode.label, 0)}
            >
              {draggingFeedKey ? "Drop feed here" : "Empty — click + to add a feed."}
            </div>
          ) : (
            <div className="space-y-1.5">
              {categoryFeeds.map((feedNode: CategoryTreeNode, index: number) => (
                <SettingsFeedRow
                  key={feedNode.key}
                  feedNode={feedNode}
                  index={index}
                  categoryLabel={categoryNode.label}
                  selectedCategory={selectedCategory}
                  editingFeedKey={editingFeedKey}
                  editingFeedName={editingFeedName}
                  savingFeedKey={savingFeedKey}
                  deletingKey={deletingKey}
                  movingFeedKey={movingFeedKey}
                  draggingFeedKey={draggingFeedKey}
                  feedDropTarget={feedDropTarget}
                  onDragStart={onFeedDragStart}
                  onDragEnd={onFeedDragEnd}
                  onDragOver={onFeedDragOver}
                  onDrop={onFeedDrop}
                  onSelect={onSelectFeed}
                  onEditingNameChange={onEditingFeedNameChange}
                  onSaveRename={onSaveFeedRename}
                  onCancelRename={onCancelFeedEdit}
                  onStartEditing={onStartFeedEdit}
                  onRemove={onRemoveFeed}
                />
              ))}
              {draggingFeedKey && (
                <div
                  className={`rounded-md border border-dashed px-3 py-2 text-center text-xs ${feedDropTarget?.categoryLabel === categoryNode.label &&
                    feedDropTarget?.index === categoryFeeds.length
                    ? "border-primary bg-primary/5 text-foreground"
                    : "text-muted-foreground"
                    }`}
                  onDragOver={(event) =>
                    onFeedDragOver(event, categoryNode.label, categoryFeeds.length)
                  }
                  onDrop={(event) => onFeedDrop(event, categoryNode.label, categoryFeeds.length)}
                >
                  Drop here to place at end
                </div>
              )}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </div>
  );
}
