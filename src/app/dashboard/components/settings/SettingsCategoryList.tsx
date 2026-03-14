import { Layers, Plus } from "lucide-react";

import { type UseSettingsDragReturn } from "../../hooks/useSettingsDrag";

import { SettingsCategoryAccordionItem } from "./SettingsCategoryAccordionItem";
import { type SettingsFeedRowProps } from "./SettingsFeedRow";

import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CategoryTreeNode } from "@/lib";

interface AddCategoryControlsProps {
  buttonClassName: string;
  buttonLabel: string;
  buttonVariant?: "default" | "outline";
  inputPlaceholder: string;
  newCategoryName: string;
  onAddCategory: () => void;
  onNewCategoryNameChange: TextChangeHandler;
}

type CategoryLabelHandler = (categoryLabel: string) => void;
interface SettingsCategoryListProps {
  addingFeedInCategory: null | string;
  categories: CategoryTreeNode[];
  drag: UseSettingsDragReturn;
  editingCategory: null | string;
  editingCategoryName: string;
  isSavingFeed: boolean;
  newCategoryName: string;
  newFeedName: string;
  newFeedUrl: string;
  onAddCategory: () => void;
  onAddFeed: CategoryLabelHandler;
  onCancelAddFeed: () => void;
  onCancelCategoryEdit: () => void;
  onEditingCategoryNameChange: TextChangeHandler;
  onNewCategoryNameChange: TextChangeHandler;
  onNewFeedNameChange: TextChangeHandler;
  onNewFeedUrlChange: TextChangeHandler;
  onRemoveCategory: CategoryLabelHandler;
  onSaveCategoryRename: CategoryLabelHandler;
  onStartCategoryEdit: CategoryLabelHandler;
  onToggleAddFeed: CategoryLabelHandler;
  pendingCategoryRemovalLabel: null | string;
  savingCategoryLabel: null | string;
  sharedFeedRowProps: SharedFeedRowProps;
}

type SharedFeedRowProps = Omit<
  SettingsFeedRowProps,
  | "categoryLabel"
  | "feedNode"
  | "index"
  | "onCancelRename"
  | "onDragEnd"
  | "onDragOver"
  | "onDragStart"
  | "onDrop"
  | "onEditingNameChange"
  | "onEditingUrlChange"
  | "onRemove"
  | "onSaveRename"
  | "onStartEditing"
  | "onToggleEnabled"
> & {
  onCancelFeedEdit: SettingsFeedRowProps["onCancelRename"];
  onEditingFeedNameChange: SettingsFeedRowProps["onEditingNameChange"];
  onEditingFeedUrlChange: SettingsFeedRowProps["onEditingUrlChange"];
  onFeedDragEnd: UseSettingsDragReturn["onFeedDragEnd"];
  onFeedDragOver: UseSettingsDragReturn["onFeedDragOver"];
  onFeedDragStart: UseSettingsDragReturn["onFeedDragStart"];
  onFeedDrop: UseSettingsDragReturn["onFeedDrop"];
  onRemoveFeed: SettingsFeedRowProps["onRemove"];
  onSaveFeedRename: SettingsFeedRowProps["onSaveRename"];
  onStartFeedEdit: SettingsFeedRowProps["onStartEditing"];
  onToggleFeedEnabled: SettingsFeedRowProps["onToggleEnabled"];
};

type TextChangeHandler = (value: string) => void;

export function SettingsCategoryList({
  addingFeedInCategory,
  categories,
  drag,
  editingCategory,
  editingCategoryName,
  isSavingFeed,
  newCategoryName,
  newFeedName,
  newFeedUrl,
  onAddCategory,
  onAddFeed,
  onCancelAddFeed,
  onCancelCategoryEdit,
  onEditingCategoryNameChange,
  onNewCategoryNameChange,
  onNewFeedNameChange,
  onNewFeedUrlChange,
  onRemoveCategory,
  onSaveCategoryRename,
  onStartCategoryEdit,
  onToggleAddFeed,
  pendingCategoryRemovalLabel,
  savingCategoryLabel,
  sharedFeedRowProps,
}: SettingsCategoryListProps) {
  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="relative flex items-center justify-center">
          <div
            aria-hidden="true"
            className="absolute size-16 rounded-xl border border-border/15"
          />
          <div className="
            relative flex size-10 items-center justify-center rounded-lg border
            border-border/40 bg-card/60 shadow-sm backdrop-blur-sm
          ">
            <Layers className="size-4 text-muted-foreground" />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">No categories</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Add a category to start organizing your feeds.
          </p>
        </div>
        <AddCategoryControls
          buttonClassName="shrink-0"
          buttonLabel="Add"
          inputPlaceholder="Category name…"
          newCategoryName={newCategoryName}
          onAddCategory={onAddCategory}
          onNewCategoryNameChange={onNewCategoryNameChange}
        />
      </div>
    );
  }

  return (
    <div>
      <Accordion
        className="space-y-2"
        defaultValue={categories.map((c) => c.key)}
        key={categories
          .map((n) => `${n.key}:${(n.children ?? []).length}`)
          .join("|")}
        type="multiple"
      >
        {categories.map((categoryNode, categoryIndex) => (
          <SettingsCategoryAccordionItem
            addingFeedInCategory={addingFeedInCategory}
            categoryDropIndex={drag.categoryDropIndex}
            categoryIndex={categoryIndex}
            categoryNode={categoryNode}
            editingCategory={editingCategory}
            editingCategoryName={editingCategoryName}
            isSavingFeed={isSavingFeed}
            key={categoryNode.key}
            newFeedName={newFeedName}
            newFeedUrl={newFeedUrl}
            onAddFeed={onAddFeed}
            onCancelAddFeed={onCancelAddFeed}
            onCancelCategoryEdit={onCancelCategoryEdit}
            onCategoryDragEnd={drag.onCategoryDragEnd}
            onCategoryDragOver={drag.onCategoryDragOver}
            onCategoryDragStart={drag.onCategoryDragStart}
            onCategoryDrop={(event, index) => {
              void drag.onCategoryDrop(event, index);
            }}
            onEditingCategoryNameChange={onEditingCategoryNameChange}
            onNewFeedNameChange={onNewFeedNameChange}
            onNewFeedUrlChange={onNewFeedUrlChange}
            onRemoveCategory={onRemoveCategory}
            onSaveCategoryRename={onSaveCategoryRename}
            onStartCategoryEdit={onStartCategoryEdit}
            onToggleAddFeed={onToggleAddFeed}
            pendingCategoryRemovalLabel={pendingCategoryRemovalLabel}
            savingCategoryLabel={savingCategoryLabel}
            {...sharedFeedRowProps}
          />
        ))}

        {drag.draggingCategoryLabel && (
          <div
            className={`
              rounded-md border border-dashed px-3 py-2 text-center text-xs
              ${
              drag.categoryDropIndex === categories.length
                ? "border-primary bg-primary/5 text-foreground"
                : "text-muted-foreground"
            }
            `}
            onDragOver={(event) => {
              drag.onCategoryDragOver(event, categories.length);
            }}
            onDrop={(event) => {
              void drag.onCategoryDrop(event, categories.length);
            }}
          >
            Drop category here
          </div>
        )}

        <div className="rounded-md border border-dashed p-2.5">
          <AddCategoryControls
            buttonClassName="h-8 shrink-0"
            buttonLabel="Add Category"
            buttonVariant="outline"
            inputPlaceholder="New category name..."
            newCategoryName={newCategoryName}
            onAddCategory={onAddCategory}
            onNewCategoryNameChange={onNewCategoryNameChange}
          />
        </div>
      </Accordion>
    </div>
  );
}

function AddCategoryControls({
  buttonClassName,
  buttonLabel,
  buttonVariant,
  inputPlaceholder,
  newCategoryName,
  onAddCategory,
  onNewCategoryNameChange,
}: AddCategoryControlsProps) {
  return (
    <div className="flex w-full max-w-xs items-center gap-2">
      <Input
        className="h-8 text-sm"
        onChange={(event) => {
          onNewCategoryNameChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onAddCategory();
          }
        }}
        placeholder={inputPlaceholder}
        value={newCategoryName}
      />
      <Button
        className={buttonClassName}
        disabled={!newCategoryName.trim()}
        onClick={() => {
          onAddCategory();
        }}
        size="sm"
        variant={buttonVariant}
      >
        <Plus className="mr-1.5 size-3.5" />
        {buttonLabel}
      </Button>
    </div>
  );
}
