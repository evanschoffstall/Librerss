import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CategoryTreeNode } from "@/lib";
import { Layers, Plus } from "lucide-react";
import { type UseSettingsDragReturn } from "../../hooks/useSettingsDrag";
import { SettingsCategoryAccordionItem } from "./SettingsCategoryAccordionItem";
import { type SettingsFeedRowProps } from "./SettingsFeedRow";

type SharedFeedRowProps = Omit<
  SettingsFeedRowProps,
  | "feedNode"
  | "index"
  | "categoryLabel"
  | "onDragStart"
  | "onDragEnd"
  | "onDragOver"
  | "onDrop"
  | "onEditingNameChange"
  | "onEditingUrlChange"
  | "onSaveRename"
  | "onCancelRename"
  | "onStartEditing"
  | "onRemove"
  | "onToggleEnabled"
> & {
  onFeedDragStart: UseSettingsDragReturn["onFeedDragStart"];
  onFeedDragEnd: UseSettingsDragReturn["onFeedDragEnd"];
  onFeedDragOver: UseSettingsDragReturn["onFeedDragOver"];
  onFeedDrop: UseSettingsDragReturn["onFeedDrop"];
  onEditingFeedNameChange: SettingsFeedRowProps["onEditingNameChange"];
  onEditingFeedUrlChange: SettingsFeedRowProps["onEditingUrlChange"];
  onSaveFeedRename: SettingsFeedRowProps["onSaveRename"];
  onCancelFeedEdit: SettingsFeedRowProps["onCancelRename"];
  onStartFeedEdit: SettingsFeedRowProps["onStartEditing"];
  onRemoveFeed: SettingsFeedRowProps["onRemove"];
  onToggleFeedEnabled: SettingsFeedRowProps["onToggleEnabled"];
};

type TextChangeHandler = (value: string) => void;
type CategoryLabelHandler = (categoryLabel: string) => void;

interface SettingsCategoryListProps {
  categories: CategoryTreeNode[];
  pendingCategoryRemovalLabel: string | null;
  newCategoryName: string;
  addingFeedInCategory: string | null;
  newFeedName: string;
  newFeedUrl: string;
  isSavingFeed: boolean;
  editingCategory: string | null;
  editingCategoryName: string;
  savingCategoryLabel: string | null;
  drag: UseSettingsDragReturn;
  onNewCategoryNameChange: TextChangeHandler;
  onAddCategory: () => void;
  onEditingCategoryNameChange: TextChangeHandler;
  onSaveCategoryRename: CategoryLabelHandler;
  onCancelCategoryEdit: () => void;
  onStartCategoryEdit: CategoryLabelHandler;
  onToggleAddFeed: CategoryLabelHandler;
  onRemoveCategory: CategoryLabelHandler;
  onNewFeedNameChange: TextChangeHandler;
  onNewFeedUrlChange: TextChangeHandler;
  onAddFeed: CategoryLabelHandler;
  onCancelAddFeed: () => void;
  sharedFeedRowProps: SharedFeedRowProps;
}

export function SettingsCategoryList({
  categories,
  pendingCategoryRemovalLabel,
  newCategoryName,
  addingFeedInCategory,
  newFeedName,
  newFeedUrl,
  isSavingFeed,
  editingCategory,
  editingCategoryName,
  savingCategoryLabel,
  drag,
  onNewCategoryNameChange,
  onAddCategory,
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
  sharedFeedRowProps,
}: SettingsCategoryListProps) {
  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="relative flex items-center justify-center">
          <div
            className="absolute size-16 rounded-xl border border-border/15"
            aria-hidden="true"
          />
          <div className="relative flex size-10 items-center justify-center rounded-lg border border-border/40 bg-card/60 shadow-sm backdrop-blur-sm">
            <Layers className="size-4 text-muted-foreground" />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">No categories</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Add a category to start organizing your feeds.
          </p>
        </div>
        <div className="flex w-full max-w-xs items-center gap-2">
          <Input
            value={newCategoryName}
            onChange={(e) => onNewCategoryNameChange(e.target.value)}
            placeholder="Category name…"
            className="h-8 text-sm"
            onKeyDown={(e) => e.key === "Enter" && onAddCategory()}
          />
          <Button
            size="sm"
            onClick={onAddCategory}
            disabled={!newCategoryName.trim()}
            className="shrink-0"
          >
            <Plus className="mr-1.5 size-3.5" />
            Add
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Accordion
        key={categories
          .map((n) => `${n.key}:${(n.children ?? []).length}`)
          .join("|")}
        type="multiple"
        defaultValue={categories.map((c) => c.key)}
        className="space-y-2"
      >
        {categories.map((categoryNode, categoryIndex) => (
          <SettingsCategoryAccordionItem
            key={categoryNode.key}
            categoryNode={categoryNode}
            categoryIndex={categoryIndex}
            pendingCategoryRemovalLabel={pendingCategoryRemovalLabel}
            addingFeedInCategory={addingFeedInCategory}
            newFeedName={newFeedName}
            newFeedUrl={newFeedUrl}
            isSavingFeed={isSavingFeed}
            editingCategory={editingCategory}
            editingCategoryName={editingCategoryName}
            savingCategoryLabel={savingCategoryLabel}
            categoryDropIndex={drag.categoryDropIndex}
            onCategoryDragStart={drag.onCategoryDragStart}
            onCategoryDragEnd={drag.onCategoryDragEnd}
            onCategoryDragOver={drag.onCategoryDragOver}
            onCategoryDrop={drag.onCategoryDrop}
            onEditingCategoryNameChange={onEditingCategoryNameChange}
            onSaveCategoryRename={onSaveCategoryRename}
            onCancelCategoryEdit={onCancelCategoryEdit}
            onStartCategoryEdit={onStartCategoryEdit}
            onToggleAddFeed={onToggleAddFeed}
            onRemoveCategory={onRemoveCategory}
            onNewFeedNameChange={onNewFeedNameChange}
            onNewFeedUrlChange={onNewFeedUrlChange}
            onAddFeed={onAddFeed}
            onCancelAddFeed={onCancelAddFeed}
            {...sharedFeedRowProps}
          />
        ))}

        {drag.draggingCategoryLabel && (
          <div
            className={`rounded-md border border-dashed px-3 py-2 text-center text-xs ${
              drag.categoryDropIndex === categories.length
                ? "border-primary bg-primary/5 text-foreground"
                : "text-muted-foreground"
            }`}
            onDragOver={(event) =>
              drag.onCategoryDragOver(event, categories.length)
            }
            onDrop={(event) => drag.onCategoryDrop(event, categories.length)}
          >
            Drop category here
          </div>
        )}

        <div className="flex items-center gap-2 rounded-md border border-dashed p-2.5">
          <Input
            value={newCategoryName}
            onChange={(e) => onNewCategoryNameChange(e.target.value)}
            placeholder="New category name..."
            className="h-8 text-sm"
            onKeyDown={(e) => e.key === "Enter" && onAddCategory()}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            onClick={onAddCategory}
            disabled={!newCategoryName.trim()}
          >
            <Plus className="mr-1.5 size-3.5" />
            Add Category
          </Button>
        </div>
      </Accordion>
    </div>
  );
}
