import { Layers, Plus } from "lucide-react";

import type {
  SharedFeedRowProps,
  TextChangeHandler,
} from "@/app/dashboard/dashboard-components/settings-dialog/SettingsCategoryFeedContracts";
import type { CategoryTreeNode } from "@/lib/core";

import { SettingsCategoryAccordionItem } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsCategoryAccordionItem";
import { type UseSettingsDragReturn } from "@/app/dashboard/settings-state";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Describes the props for the add category controls component.
 */
interface AddCategoryControlsProps {
  buttonClassName: string;
  buttonLabel: string;
  buttonVariant?: "default" | "outline";
  inputPlaceholder: string;
  newCategoryName: string;
  onAddCategory: () => void;
  onNewCategoryNameChange: TextChangeHandler;
}

/**
 * Defines the category label handler type.
 */
type CategoryLabelHandler = (categoryLabel: string) => void;
/**
 * Describes the props for the settings category list component.
 */
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

/**
 * Render the settings category list component.
 * @param props - The component props.
 * @returns The rendered settings category list component.
 */
export function SettingsCategoryList(props: SettingsCategoryListProps) {
  if (props.categories.length === 0) {
    return (
      <EmptyCategoryState
        newCategoryName={props.newCategoryName}
        onAddCategory={props.onAddCategory}
        onNewCategoryNameChange={props.onNewCategoryNameChange}
      />
    );
  }

  return (
    <div>
      <CategoryAccordionList {...props} />
    </div>
  );
}

/**
 * Render the add category controls component.
 * @param props - The component props.
 * @returns The rendered add category controls component.
 */
function AddCategoryControls(props: AddCategoryControlsProps) {
  const {
    buttonClassName,
    buttonLabel,
    buttonVariant,
    inputPlaceholder,
    newCategoryName,
    onAddCategory,
    onNewCategoryNameChange,
  } = props;
  return (
    <div className="flex w-full max-w-xs items-center gap-2">
      <Input
        className="h-8"
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

/**
 * Render the category accordion items component.
 * @param props - The component props.
 * @returns The rendered category accordion items component.
 */
function CategoryAccordionItems(
  props: Omit<
    SettingsCategoryListProps,
    "newCategoryName" | "onAddCategory" | "onNewCategoryNameChange"
  >,
) {
  const {
    addingFeedInCategory,
    categories,
    drag,
    editingCategory,
    editingCategoryName,
    isSavingFeed,
    newFeedName,
    newFeedUrl,
    onAddFeed,
    onCancelAddFeed,
    onCancelCategoryEdit,
    onEditingCategoryNameChange,
    onNewFeedNameChange,
    onNewFeedUrlChange,
    onRemoveCategory,
    onSaveCategoryRename,
    onStartCategoryEdit,
    onToggleAddFeed,
    pendingCategoryRemovalLabel,
    savingCategoryLabel,
    sharedFeedRowProps,
  } = props;
  return categories.map((categoryNode, categoryIndex) => (
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
  ));
}

/**
 * Render the category accordion list component.
 * @param props - The component props.
 * @returns The rendered category accordion list component.
 */
function CategoryAccordionList(props: SettingsCategoryListProps) {
  return (
    <Accordion
      className="space-y-2"
      defaultValue={props.categories.map((category) => category.key)}
      key={props.categories
        .map(
          (category) => `${category.key}:${(category.children ?? []).length}`,
        )
        .join("|")}
      type="multiple"
    >
      <CategoryAccordionItems
        addingFeedInCategory={props.addingFeedInCategory}
        categories={props.categories}
        drag={props.drag}
        editingCategory={props.editingCategory}
        editingCategoryName={props.editingCategoryName}
        isSavingFeed={props.isSavingFeed}
        newFeedName={props.newFeedName}
        newFeedUrl={props.newFeedUrl}
        onAddFeed={props.onAddFeed}
        onCancelAddFeed={props.onCancelAddFeed}
        onCancelCategoryEdit={props.onCancelCategoryEdit}
        onEditingCategoryNameChange={props.onEditingCategoryNameChange}
        onNewFeedNameChange={props.onNewFeedNameChange}
        onNewFeedUrlChange={props.onNewFeedUrlChange}
        onRemoveCategory={props.onRemoveCategory}
        onSaveCategoryRename={props.onSaveCategoryRename}
        onStartCategoryEdit={props.onStartCategoryEdit}
        onToggleAddFeed={props.onToggleAddFeed}
        pendingCategoryRemovalLabel={props.pendingCategoryRemovalLabel}
        savingCategoryLabel={props.savingCategoryLabel}
        sharedFeedRowProps={props.sharedFeedRowProps}
      />

      <CategoryDropZone categories={props.categories} drag={props.drag} />

      <CategoryFooterAddControls
        newCategoryName={props.newCategoryName}
        onAddCategory={props.onAddCategory}
        onNewCategoryNameChange={props.onNewCategoryNameChange}
      />
    </Accordion>
  );
}

/**
 * Render the category drop zone component.
 * @param props - The component props.
 * @returns The rendered category drop zone component.
 */
function CategoryDropZone(
  props: Pick<SettingsCategoryListProps, "categories" | "drag">,
) {
  const { categories, drag } = props;
  if (!drag.draggingCategoryLabel) {
    return null;
  }

  return (
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
  );
}

/**
 * Render the category footer add controls component.
 * @param props - The component props.
 * @returns The rendered category footer add controls component.
 */
function CategoryFooterAddControls(
  props: Pick<
    SettingsCategoryListProps,
    "newCategoryName" | "onAddCategory" | "onNewCategoryNameChange"
  >,
) {
  const { newCategoryName, onAddCategory, onNewCategoryNameChange } = props;
  return (
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
  );
}

/**
 * Render the empty category state component.
 * @param props - The component props.
 * @returns The rendered empty category state component.
 */
function EmptyCategoryState(
  props: Pick<
    SettingsCategoryListProps,
    "newCategoryName" | "onAddCategory" | "onNewCategoryNameChange"
  >,
) {
  const { newCategoryName, onAddCategory, onNewCategoryNameChange } = props;
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="relative flex items-center justify-center">
        <div
          aria-hidden="true"
          className="absolute size-16 rounded-xl border border-border/15"
        />
        <div
          className="
            relative flex size-10 items-center justify-center rounded-lg border
            border-border/40 bg-card/60 shadow-sm backdrop-blur-sm
          "
        >
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
