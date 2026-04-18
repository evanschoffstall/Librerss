import { GripVertical, Plus, Trash2 } from "lucide-react";

import type { SettingsCategoryHeaderCallbacks } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsCategoryFeedContracts";
import type { CategoryTreeNode } from "@/lib/core";

import {
  settingsDragHandleCls,
  SettingsIconButton,
} from "@/app/dashboard/dashboard-components/settings-dialog/SettingsIconButton";
import {
  handleInlineEditorKeyDown,
  SettingsInlineEditorControls,
} from "@/app/dashboard/dashboard-components/settings-dialog/SettingsInlineEditorControls";
import { AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";

interface SettingsCategoryAccordionHeaderProps extends SettingsCategoryHeaderCallbacks {
  categoryFeeds: CategoryTreeNode[];
  categoryNode: CategoryTreeNode;
  editingCategoryName: string;
  isAddingFeed: boolean;
  isEditing: boolean;
  isPendingRemoval: boolean;
}

/**
 * @param props
 */
export function SettingsCategoryAccordionHeader(
  props: SettingsCategoryAccordionHeaderProps,
) {
  return (
    <div className="flex items-center gap-2 px-3">
      <CategoryDragHandle
        categoryLabel={props.categoryNode.label}
        isEditing={props.isEditing}
        onCategoryDragEnd={props.onCategoryDragEnd}
        onCategoryDragStart={props.onCategoryDragStart}
      />
      <CategoryHeaderContent {...props} />
      {props.isEditing ? null : <CategoryActionButtons {...props} />}
    </div>
  );
}

/**
 * @param root0
 * @param root0.categoryNode
 * @param root0.isAddingFeed
 * @param root0.isPendingRemoval
 * @param root0.onRemoveCategory
 * @param root0.onToggleAddFeed
 */
function CategoryActionButtons({
  categoryNode,
  isAddingFeed,
  isPendingRemoval,
  onRemoveCategory,
  onToggleAddFeed,
}: Pick<
  SettingsCategoryAccordionHeaderProps,
  | "categoryNode"
  | "isAddingFeed"
  | "isPendingRemoval"
  | "onRemoveCategory"
  | "onToggleAddFeed"
>) {
  return (
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
        tip={isPendingRemoval ? "Click again to confirm" : "Delete category"}
      >
        <Trash2 className="size-3.5" />
      </SettingsIconButton>
    </div>
  );
}

/**
 * @param root0
 * @param root0.categoryLabel
 * @param root0.isEditing
 * @param root0.onCategoryDragEnd
 * @param root0.onCategoryDragStart
 */
function CategoryDragHandle({
  categoryLabel,
  isEditing,
  onCategoryDragEnd,
  onCategoryDragStart,
}: {
  categoryLabel: string;
  isEditing: boolean;
  onCategoryDragEnd: () => void;
  onCategoryDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    label: string,
  ) => void;
}) {
  if (isEditing) {
    return null;
  }

  return (
    <button
      aria-label={`Drag category ${categoryLabel}`}
      className={settingsDragHandleCls}
      draggable
      onDragEnd={onCategoryDragEnd}
      onDragStart={(event) => {
        onCategoryDragStart(event, categoryLabel);
      }}
      type="button"
    >
      <GripVertical className="size-4" />
    </button>
  );
}

/**
 * @param root0
 * @param root0.categoryFeeds
 * @param root0.categoryNode
 * @param root0.editingCategoryName
 * @param root0.isEditing
 * @param root0.onCancelCategoryEdit
 * @param root0.onEditingCategoryNameChange
 * @param root0.onSaveCategoryRename
 * @param root0.onStartCategoryEdit
 * @param root0.savingCategoryLabel
 */
function CategoryHeaderContent({
  categoryFeeds,
  categoryNode,
  editingCategoryName,
  isEditing,
  onCancelCategoryEdit,
  onEditingCategoryNameChange,
  onSaveCategoryRename,
  onStartCategoryEdit,
  savingCategoryLabel,
}: Pick<
  SettingsCategoryAccordionHeaderProps,
  | "categoryFeeds"
  | "categoryNode"
  | "editingCategoryName"
  | "isEditing"
  | "onCancelCategoryEdit"
  | "onEditingCategoryNameChange"
  | "onSaveCategoryRename"
  | "onStartCategoryEdit"
  | "savingCategoryLabel"
>) {
  return isEditing ? (
    <CategoryRenameFields
      categoryLabel={categoryNode.label}
      editingCategoryName={editingCategoryName}
      onCancelCategoryEdit={onCancelCategoryEdit}
      onEditingCategoryNameChange={onEditingCategoryNameChange}
      onSaveCategoryRename={onSaveCategoryRename}
      savingCategoryLabel={savingCategoryLabel}
    />
  ) : (
    <CategorySummaryTrigger
      categoryFeeds={categoryFeeds}
      categoryLabel={categoryNode.label}
      onStartCategoryEdit={onStartCategoryEdit}
    />
  );
}

/**
 * @param root0
 * @param root0.categoryLabel
 * @param root0.editingCategoryName
 * @param root0.onCancelCategoryEdit
 * @param root0.onEditingCategoryNameChange
 * @param root0.onSaveCategoryRename
 * @param root0.savingCategoryLabel
 */
function CategoryRenameFields({
  categoryLabel,
  editingCategoryName,
  onCancelCategoryEdit,
  onEditingCategoryNameChange,
  onSaveCategoryRename,
  savingCategoryLabel,
}: {
  categoryLabel: string;
  editingCategoryName: string;
  onCancelCategoryEdit: () => void;
  onEditingCategoryNameChange: (name: string) => void;
  onSaveCategoryRename: (label: string) => void;
  savingCategoryLabel: null | string;
}) {
  const isSaving = savingCategoryLabel === categoryLabel;

  return (
    <div className="mr-2 flex flex-1 items-center gap-2 py-2.5">
      <Input
        autoFocus
        className="h-7 text-xs"
        onChange={(event) => {
          onEditingCategoryNameChange(event.target.value);
        }}
        onKeyDown={(event) => {
          handleInlineEditorKeyDown(
            event,
            () => {
              onSaveCategoryRename(categoryLabel);
            },
            onCancelCategoryEdit,
          );
        }}
        value={editingCategoryName}
      />
      <SettingsInlineEditorControls
        disabled={!editingCategoryName.trim()}
        isSaving={isSaving}
        onCancel={onCancelCategoryEdit}
        onSave={() => {
          onSaveCategoryRename(categoryLabel);
        }}
      />
    </div>
  );
}

/**
 * @param root0
 * @param root0.categoryFeeds
 * @param root0.categoryLabel
 * @param root0.onStartCategoryEdit
 */
function CategorySummaryTrigger({
  categoryFeeds,
  categoryLabel,
  onStartCategoryEdit,
}: {
  categoryFeeds: CategoryTreeNode[];
  categoryLabel: string;
  onStartCategoryEdit: (label: string) => void;
}) {
  return (
    <AccordionTrigger
      className="
        flex-1 py-2.5 text-xs font-medium tracking-wide text-muted-foreground/70
        uppercase
        hover:no-underline
      "
    >
      <span
        className="flex cursor-pointer items-center gap-2"
        onDoubleClick={(event) => {
          event.stopPropagation();
          onStartCategoryEdit(categoryLabel);
        }}
        title="Double-click to rename"
      >
        {categoryLabel}
        {categoryFeeds.length > 0 ? (
          <span
            className="
              rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none
              font-normal tracking-normal text-muted-foreground/60 normal-case
              tabular-nums
            "
          >
            {categoryFeeds.length}
          </span>
        ) : null}
      </span>
    </AccordionTrigger>
  );
}
