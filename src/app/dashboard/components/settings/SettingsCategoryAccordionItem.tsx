import { GripVertical, Loader2, Plus, Trash2 } from "lucide-react";

import { SettingsFeedRow, type SettingsFeedRowProps } from "./SettingsFeedRow";
import {
  animTransitionColorsClass,
  settingsDragHandleCls,
  SettingsIconButton,
} from "./SettingsIconButton";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CategoryTreeNode, isSameCategoryLabel } from "@/lib";

interface SettingsCategoryAccordionItemProps {
  // Inline add-feed form
  addingFeedInCategory: null | string;
  categoryDropIndex: null | number;
  categoryIndex: number;
  categoryNode: CategoryTreeNode;
  deletingKey: SettingsFeedRowProps["deletingKey"];
  draggingFeedKey: SettingsFeedRowProps["draggingFeedKey"];
  // Category edit
  editingCategory: null | string;
  editingCategoryName: string;
  // Feed edit/state
  editingFeedKey: SettingsFeedRowProps["editingFeedKey"];
  editingFeedName: SettingsFeedRowProps["editingFeedName"];
  editingFeedUrl: SettingsFeedRowProps["editingFeedUrl"];
  feedDropTarget: SettingsFeedRowProps["feedDropTarget"];
  isSavingFeed: boolean;
  movingFeedKey: SettingsFeedRowProps["movingFeedKey"];
  newFeedName: string;
  newFeedUrl: string;
  onAddFeed: (categoryLabel: string) => void;
  onCancelAddFeed: () => void;
  onCancelCategoryEdit: () => void;
  onCancelFeedEdit: SettingsFeedRowProps["onCancelRename"];
  onCategoryDragEnd: () => void;
  onCategoryDragOver: (
    event: React.DragEvent<HTMLElement>,
    index: number,
  ) => void;
  // Callbacks — category
  onCategoryDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    label: string,
  ) => void;
  onCategoryDrop: (event: React.DragEvent<HTMLElement>, index: number) => void;
  onEditingCategoryNameChange: (name: string) => void;
  onEditingFeedNameChange: SettingsFeedRowProps["onEditingNameChange"];
  onEditingFeedUrlChange: SettingsFeedRowProps["onEditingUrlChange"];
  onFeedDragEnd: SettingsFeedRowProps["onDragEnd"];
  onFeedDragOver: SettingsFeedRowProps["onDragOver"];
  // Callbacks — feed row
  onFeedDragStart: SettingsFeedRowProps["onDragStart"];
  onFeedDrop: SettingsFeedRowProps["onDrop"];
  // Callbacks — feed form
  onNewFeedNameChange: (name: string) => void;
  onNewFeedUrlChange: (url: string) => void;
  onRemoveCategory: (label: string) => void;
  onRemoveFeed: SettingsFeedRowProps["onRemove"];
  onSaveCategoryRename: (label: string) => void;
  onSaveFeedRename: SettingsFeedRowProps["onSaveRename"];
  onStartCategoryEdit: (label: string) => void;
  onStartFeedEdit: SettingsFeedRowProps["onStartEditing"];
  onToggleAddFeed: (label: string) => void;
  onToggleExtractionDisabled: SettingsFeedRowProps["onToggleExtractionDisabled"];
  onToggleFeedEnabled: SettingsFeedRowProps["onToggleEnabled"];
  onToggleProxyEnabled: SettingsFeedRowProps["onToggleProxyEnabled"];
  pendingCategoryRemovalLabel: null | string;
  savingCategoryLabel: null | string;
  savingFeedKey: SettingsFeedRowProps["savingFeedKey"];
  selectedCategory: string;
  togglingFeedKey: SettingsFeedRowProps["togglingFeedKey"];
  updatingSettingsKey: SettingsFeedRowProps["updatingSettingsKey"];
}

export function SettingsCategoryAccordionItem({
  addingFeedInCategory,
  categoryDropIndex,
  categoryIndex,
  categoryNode,
  deletingKey,
  draggingFeedKey,
  editingCategory,
  editingCategoryName,
  editingFeedKey,
  editingFeedName,
  editingFeedUrl,
  feedDropTarget,
  isSavingFeed,
  movingFeedKey,
  newFeedName,
  newFeedUrl,
  onAddFeed,
  onCancelAddFeed,
  onCancelCategoryEdit,
  onCancelFeedEdit,
  onCategoryDragEnd,
  onCategoryDragOver,
  onCategoryDragStart,
  onCategoryDrop,
  onEditingCategoryNameChange,
  onEditingFeedNameChange,
  onEditingFeedUrlChange,
  onFeedDragEnd,
  onFeedDragOver,
  onFeedDragStart,
  onFeedDrop,
  onNewFeedNameChange,
  onNewFeedUrlChange,
  onRemoveCategory,
  onRemoveFeed,
  onSaveCategoryRename,
  onSaveFeedRename,
  onStartCategoryEdit,
  onStartFeedEdit,
  onToggleAddFeed,
  onToggleExtractionDisabled,
  onToggleFeedEnabled,
  onToggleProxyEnabled,
  pendingCategoryRemovalLabel,
  savingCategoryLabel,
  savingFeedKey,
  selectedCategory,
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
          ? `
            rounded-md border border-primary bg-primary/5
            ${animTransitionColorsClass}
          `
          : animTransitionColorsClass
      }
      onDragOver={(event) => {
        onCategoryDragOver(event, categoryIndex);
      }}
      onDrop={(event) => {
        onCategoryDrop(event, categoryIndex);
      }}
    >
      <AccordionItem
        className="rounded-md border border-b px-0"
        value={categoryNode.key}
      >
        <div className="flex items-center gap-2 px-3">
          {!isEditing && (
            <button
              aria-label={`Drag category ${categoryNode.label}`}
              className={settingsDragHandleCls}
              draggable
              onDragEnd={onCategoryDragEnd}
              onDragStart={(event) => {
                onCategoryDragStart(event, categoryNode.label);
              }}
              type="button"
            >
              <GripVertical className="size-4" />
            </button>
          )}

          {isEditing ? (
            <div className="mr-2 flex flex-1 items-center gap-2 py-2.5">
              <Input
                autoFocus
                className="h-7 text-xs"
                onChange={(e) => {
                  onEditingCategoryNameChange(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    onSaveCategoryRename(categoryNode.label);
                  if (e.key === "Escape") onCancelCategoryEdit();
                }}
                value={editingCategoryName}
              />
              <Button
                className="h-7 text-xs"
                disabled={
                  !editingCategoryName.trim() ||
                  savingCategoryLabel === categoryNode.label
                }
                onClick={() => {
                  onSaveCategoryRename(categoryNode.label);
                }}
                size="sm"
              >
                {savingCategoryLabel === categoryNode.label && (
                  <Loader2 className="mr-1 size-3 animate-spin" />
                )}
                Save
              </Button>
              <Button
                className="h-7 text-xs"
                onClick={onCancelCategoryEdit}
                size="sm"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <AccordionTrigger className="
              flex-1 py-2.5 text-xs font-medium tracking-wide
              text-muted-foreground/70 uppercase
              hover:no-underline
            ">
              <span
                className="flex cursor-pointer items-center gap-2"
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onStartCategoryEdit(categoryNode.label);
                }}
                title="Double-click to rename"
              >
                {categoryNode.label}
                {categoryFeeds.length > 0 && (
                  <span className="
                    rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none
                    font-normal tracking-normal text-muted-foreground/60
                    normal-case tabular-nums
                  ">
                    {categoryFeeds.length}
                  </span>
                )}
              </span>
            </AccordionTrigger>
          )}

          {!isEditing && (
            <div className="flex shrink-0 items-center gap-0.5">
              <SettingsIconButton
                className={isAddingFeed ? "bg-accent" : ""}
                onClick={() => {
                  onToggleAddFeed(categoryNode.label);
                }}
                tip="Add feed"
              >
                <Plus className="size-3.5" />
              </SettingsIconButton>
              <SettingsIconButton
                className={
                  isPendingRemoval
                    ? `
                      bg-destructive/10 text-destructive
                      hover:bg-destructive/20 hover:text-destructive
                    `
                    : `
                      text-muted-foreground
                      hover:text-destructive
                    `
                }
                onClick={() => {
                  onRemoveCategory(categoryNode.label);
                }}
                tip={
                  isPendingRemoval
                    ? "Click again to confirm"
                    : "Delete category"
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
              className={`
                mb-2 space-y-2 rounded-md border border-dashed p-2.5
                ${animTransitionColorsClass}
              `}
            >
              <div className="flex gap-2">
                <Input
                  autoFocus
                  className="h-8 text-sm"
                  onChange={(e) => {
                    onNewFeedNameChange(e.target.value);
                  }}
                  placeholder="Feed name"
                  value={newFeedName}
                />
                <Input
                  className="h-8 flex-2 text-sm"
                  onChange={(e) => {
                    onNewFeedUrlChange(e.target.value);
                  }}
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
                  placeholder="https://example.com/feed.xml"
                  value={newFeedUrl}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  className="h-7 px-3 text-xs"
                  onClick={onCancelAddFeed}
                  size="sm"
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  className="h-7 px-3 text-xs"
                  disabled={
                    !newFeedName.trim() || !newFeedUrl.trim() || isSavingFeed
                  }
                  onClick={() => {
                    onAddFeed(categoryNode.label);
                  }}
                  size="sm"
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
              className={`
                rounded-md border border-dashed px-3 py-4 text-center text-xs
                transition-colors
                ${
                feedDropTarget?.categoryLabel === categoryNode.label &&
                feedDropTarget.index === 0
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border/50 text-muted-foreground/60"
              }
              `}
              onDragOver={(event) => {
                onFeedDragOver(event, categoryNode.label, 0);
              }}
              onDrop={(event) => {
                onFeedDrop(event, categoryNode.label, 0);
              }}
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
                    categoryLabel={categoryNode.label}
                    deletingKey={deletingKey}
                    draggingFeedKey={draggingFeedKey}
                    editingFeedKey={editingFeedKey}
                    editingFeedName={editingFeedName}
                    editingFeedUrl={editingFeedUrl}
                    feedDropTarget={feedDropTarget}
                    feedNode={feedNode}
                    index={index}
                    key={feedNode.key}
                    movingFeedKey={movingFeedKey}
                    onCancelRename={onCancelFeedEdit}
                    onDragEnd={onFeedDragEnd}
                    onDragOver={onFeedDragOver}
                    onDragStart={onFeedDragStart}
                    onDrop={onFeedDrop}
                    onEditingNameChange={onEditingFeedNameChange}
                    onEditingUrlChange={onEditingFeedUrlChange}
                    onRemove={onRemoveFeed}
                    onSaveRename={onSaveFeedRename}
                    onStartEditing={onStartFeedEdit}
                    onToggleEnabled={onToggleFeedEnabled}
                    onToggleExtractionDisabled={onToggleExtractionDisabled}
                    onToggleProxyEnabled={onToggleProxyEnabled}
                    savingFeedKey={savingFeedKey}
                    selectedCategory={selectedCategory}
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
