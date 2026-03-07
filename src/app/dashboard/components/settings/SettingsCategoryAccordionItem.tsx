import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isSameCategoryLabel, type CategoryTreeNode } from "@/lib";
import { GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { SettingsFeedRow, type SettingsFeedRowProps } from "./SettingsFeedRow";
import {
  SettingsIconButton,
  animTransitionColorsClass,
  settingsDragHandleCls,
} from "./SettingsIconButton";

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
  editingFeedKey: SettingsFeedRowProps["editingFeedKey"];
  editingFeedName: SettingsFeedRowProps["editingFeedName"];
  editingFeedUrl: SettingsFeedRowProps["editingFeedUrl"];
  savingFeedKey: SettingsFeedRowProps["savingFeedKey"];
  deletingKey: SettingsFeedRowProps["deletingKey"];
  movingFeedKey: SettingsFeedRowProps["movingFeedKey"];
  draggingFeedKey: SettingsFeedRowProps["draggingFeedKey"];
  feedDropTarget: SettingsFeedRowProps["feedDropTarget"];
  categoryDropIndex: number | null;
  // Callbacks — category
  onCategoryDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    label: string,
  ) => void;
  onCategoryDragEnd: () => void;
  onCategoryDragOver: (
    event: React.DragEvent<HTMLElement>,
    index: number,
  ) => void;
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
  onFeedDragStart: SettingsFeedRowProps["onDragStart"];
  onFeedDragEnd: SettingsFeedRowProps["onDragEnd"];
  onFeedDragOver: SettingsFeedRowProps["onDragOver"];
  onFeedDrop: SettingsFeedRowProps["onDrop"];
  onEditingFeedNameChange: SettingsFeedRowProps["onEditingNameChange"];
  onEditingFeedUrlChange: SettingsFeedRowProps["onEditingUrlChange"];
  onSaveFeedRename: SettingsFeedRowProps["onSaveRename"];
  onCancelFeedEdit: SettingsFeedRowProps["onCancelRename"];
  onStartFeedEdit: SettingsFeedRowProps["onStartEditing"];
  onRemoveFeed: SettingsFeedRowProps["onRemove"];
  onToggleFeedEnabled: SettingsFeedRowProps["onToggleEnabled"];
  onToggleExtractionDisabled: SettingsFeedRowProps["onToggleExtractionDisabled"];
  onToggleProxyEnabled: SettingsFeedRowProps["onToggleProxyEnabled"];
  togglingFeedKey: SettingsFeedRowProps["togglingFeedKey"];
  updatingSettingsKey: SettingsFeedRowProps["updatingSettingsKey"];
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
  editingFeedUrl,
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
  onEditingFeedNameChange,
  onEditingFeedUrlChange,
  onSaveFeedRename,
  onCancelFeedEdit,
  onStartFeedEdit,
  onRemoveFeed,
  onToggleFeedEnabled,
  onToggleExtractionDisabled,
  onToggleProxyEnabled,
  togglingFeedKey,
  updatingSettingsKey,
}: SettingsCategoryAccordionItemProps) {
  const categoryFeeds = categoryNode.children ?? [];
  const isEditing = editingCategory === categoryNode.label;
  const isAddingFeed = addingFeedInCategory === categoryNode.label;
  const isPendingRemoval = isSameCategoryLabel(
    categoryNode.label,
    pendingCategoryRemovalLabel,
  );

  return (
    <div
      className={
        categoryDropIndex === categoryIndex
          ? `rounded-md border border-primary bg-primary/5 ${animTransitionColorsClass}`
          : animTransitionColorsClass
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
              onDragStart={(event) =>
                onCategoryDragStart(event, categoryNode.label)
              }
              onDragEnd={onCategoryDragEnd}
              className={settingsDragHandleCls}
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
                  if (e.key === "Enter")
                    onSaveCategoryRename(categoryNode.label);
                  if (e.key === "Escape") onCancelCategoryEdit();
                }}
              />
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => onSaveCategoryRename(categoryNode.label)}
                disabled={
                  !editingCategoryName.trim() ||
                  savingCategoryLabel === categoryNode.label
                }
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
                {categoryFeeds.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none tabular-nums font-normal normal-case tracking-normal text-muted-foreground/60">
                    {categoryFeeds.length}
                  </span>
                )}
              </span>
            </AccordionTrigger>
          )}

          {!isEditing && (
            <div className="flex shrink-0 items-center gap-0.5">
              <SettingsIconButton
                tip="Add feed"
                onClick={() => onToggleAddFeed(categoryNode.label)}
                className={isAddingFeed ? "bg-accent" : ""}
              >
                <Plus className="size-3.5" />
              </SettingsIconButton>
              <SettingsIconButton
                tip={
                  isPendingRemoval
                    ? "Click again to confirm"
                    : "Delete category"
                }
                onClick={() => onRemoveCategory(categoryNode.label)}
                className={
                  isPendingRemoval
                    ? "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                    : "text-muted-foreground hover:text-destructive"
                }
              >
                <Trash2 className="size-3.5" />
              </SettingsIconButton>
            </div>
          )}
        </div>

        <AccordionContent className="px-3 pb-3">
          {isAddingFeed && (
            <div
              className={`mb-2 space-y-2 rounded-md border border-dashed p-2.5 ${animTransitionColorsClass}`}
            >
              <div className="flex gap-2">
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
                  className="h-8 flex-[2] text-sm"
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      newFeedName.trim() &&
                      newFeedUrl.trim()
                    ) {
                      onAddFeed(categoryNode.label);
                    }
                    if (e.key === "Escape") onCancelAddFeed();
                  }}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-3 text-xs"
                  onClick={onCancelAddFeed}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => onAddFeed(categoryNode.label)}
                  disabled={
                    !newFeedName.trim() || !newFeedUrl.trim() || isSavingFeed
                  }
                >
                  {isSavingFeed ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : (
                    <Plus className="mr-1 size-3" />
                  )}
                  {isSavingFeed ? "Saving…" : "Add Feed"}
                </Button>
              </div>
            </div>
          )}

          {categoryFeeds.length === 0 && !isAddingFeed ? (
            <div
              className={`rounded-md border border-dashed px-3 py-4 text-center text-xs transition-colors ${
                feedDropTarget?.categoryLabel === categoryNode.label &&
                feedDropTarget?.index === 0
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border/50 text-muted-foreground/60"
              }`}
              onDragOver={(event) =>
                onFeedDragOver(event, categoryNode.label, 0)
              }
              onDrop={(event) => onFeedDrop(event, categoryNode.label, 0)}
            >
              {draggingFeedKey
                ? "Drop feed here"
                : "No feeds — click + to add one."}
            </div>
          ) : (
            <div
              className="space-y-1.5"
              onDragOver={(event) => {
                // Fallback: if no specific row handled the event, treat it
                // as "drop at end of category" (cursor is in the gap/padding).
                if (!event.defaultPrevented) {
                  onFeedDragOver(
                    event,
                    categoryNode.label,
                    categoryFeeds.length,
                  );
                }
              }}
              onDrop={(event) => {
                if (!event.defaultPrevented) {
                  onFeedDrop(event, categoryNode.label, categoryFeeds.length);
                }
              }}
            >
              {categoryFeeds.map(
                (feedNode: CategoryTreeNode, index: number) => (
                  <SettingsFeedRow
                    key={feedNode.key}
                    feedNode={feedNode}
                    index={index}
                    categoryLabel={categoryNode.label}
                    selectedCategory={selectedCategory}
                    editingFeedKey={editingFeedKey}
                    editingFeedName={editingFeedName}
                    editingFeedUrl={editingFeedUrl}
                    savingFeedKey={savingFeedKey}
                    deletingKey={deletingKey}
                    movingFeedKey={movingFeedKey}
                    draggingFeedKey={draggingFeedKey}
                    feedDropTarget={feedDropTarget}
                    onDragStart={onFeedDragStart}
                    onDragEnd={onFeedDragEnd}
                    onDragOver={onFeedDragOver}
                    onDrop={onFeedDrop}
                    onEditingNameChange={onEditingFeedNameChange}
                    onEditingUrlChange={onEditingFeedUrlChange}
                    onCancelRename={onCancelFeedEdit}
                    onSaveRename={onSaveFeedRename}
                    onStartEditing={onStartFeedEdit}
                    onRemove={onRemoveFeed}
                    onToggleEnabled={onToggleFeedEnabled}
                    onToggleExtractionDisabled={onToggleExtractionDisabled}
                    onToggleProxyEnabled={onToggleProxyEnabled}
                    togglingFeedKey={togglingFeedKey}
                    updatingSettingsKey={updatingSettingsKey}
                  />
                ),
              )}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </div>
  );
}
