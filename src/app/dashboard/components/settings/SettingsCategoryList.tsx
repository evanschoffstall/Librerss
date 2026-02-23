import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CategoryTreeNode } from "@/lib";
import { Plus } from "lucide-react";
import { type UseSettingsDragReturn } from "../../hooks/useSettingsDrag";
import { SettingsCategoryAccordionItem } from "./SettingsCategoryAccordionItem";

interface SharedFeedRowProps {
  selectedCategory: string;
  editingFeedKey: string | null;
  editingFeedName: string;
  editingFeedUrl: string;
  savingFeedKey: string | null;
  deletingKey: string | null;
  movingFeedKey: string | null;
  draggingFeedKey: string | null;
  feedDropTarget: { categoryLabel: string; index: number } | null;
  onFeedDragStart: UseSettingsDragReturn["onFeedDragStart"];
  onFeedDragEnd: UseSettingsDragReturn["onFeedDragEnd"];
  onFeedDragOver: UseSettingsDragReturn["onFeedDragOver"];
  onFeedDrop: UseSettingsDragReturn["onFeedDrop"];
  onEditingFeedNameChange: (name: string) => void;
  onEditingFeedUrlChange: (url: string) => void;
  onSaveFeedRename: (key: string) => void;
  onCancelFeedEdit: () => void;
  onStartFeedEdit: (key: string, name: string, url: string) => void;
  onRemoveFeed: (key: string) => void;
}

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
  onNewCategoryNameChange: (name: string) => void;
  onAddCategory: () => void;
  onEditingCategoryNameChange: (name: string) => void;
  onSaveCategoryRename: (label: string) => void;
  onCancelCategoryEdit: () => void;
  onStartCategoryEdit: (label: string) => void;
  onToggleAddFeed: (label: string) => void;
  onRemoveCategory: (label: string) => void;
  onNewFeedNameChange: (name: string) => void;
  onNewFeedUrlChange: (url: string) => void;
  onAddFeed: (label: string) => void;
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
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">No categories yet.</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Input
            value={newCategoryName}
            onChange={(e) => onNewCategoryNameChange(e.target.value)}
            placeholder="Category name..."
            className="max-w-[200px]"
            onKeyDown={(e) => e.key === "Enter" && onAddCategory()}
          />
          <Button size="sm" onClick={onAddCategory} disabled={!newCategoryName.trim()}>
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
        key={categories.map((n) => `${n.key}:${(n.children ?? []).length}`).join("|")}
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
            onSaveCategoryRename={(label) => onSaveCategoryRename(label)}
            onCancelCategoryEdit={onCancelCategoryEdit}
            onStartCategoryEdit={(label) => onStartCategoryEdit(label)}
            onToggleAddFeed={(label) => onToggleAddFeed(label)}
            onRemoveCategory={(label) => onRemoveCategory(label)}
            onNewFeedNameChange={onNewFeedNameChange}
            onNewFeedUrlChange={onNewFeedUrlChange}
            onAddFeed={(label) => onAddFeed(label)}
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
            onDragOver={(event) => drag.onCategoryDragOver(event, categories.length)}
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
