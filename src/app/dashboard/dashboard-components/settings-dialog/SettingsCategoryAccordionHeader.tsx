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

interface CategoryDragHandleProps {
  categoryLabel: string;
  isEditing: boolean;
  onCategoryDragEnd: () => void;
  onCategoryDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    label: string,
  ) => void;
}

interface CategoryRenameFieldsProps {
  categoryLabel: string;
  editingCategoryName: string;
  onCancelCategoryEdit: () => void;
  onEditingCategoryNameChange: (name: string) => void;
  onSaveCategoryRename: (label: string) => void;
  savingCategoryLabel: null | string;
}

interface CategorySummaryTriggerProps {
  categoryFeeds: CategoryTreeNode[];
  categoryLabel: string;
  onStartCategoryEdit: (label: string) => void;
}
interface SettingsCategoryAccordionHeaderProps extends SettingsCategoryHeaderCallbacks {
  categoryFeeds: CategoryTreeNode[];
  categoryNode: CategoryTreeNode;
  editingCategoryName: string;
  isAddingFeed: boolean;
  isEditing: boolean;
  isPendingRemoval: boolean;
}

/**
 * Render the settings category accordion header component.
 * @param props - The component props.
 * @returns The rendered settings category accordion header component.
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
 * Render the category action buttons component.
 * @param props - The component props.
 * @returns The rendered category action buttons component.
 */
function CategoryActionButtons(
  props: Pick<
    SettingsCategoryAccordionHeaderProps,
    | "categoryNode"
    | "isAddingFeed"
    | "isPendingRemoval"
    | "onRemoveCategory"
    | "onToggleAddFeed"
  >,
) {
  const {
    categoryNode,
    isAddingFeed,
    isPendingRemoval,
    onRemoveCategory,
    onToggleAddFeed,
  } = props;
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
 * Render the category drag handle component.
 * @param props - The component props.
 * @returns The rendered category drag handle component.
 */
function CategoryDragHandle(props: CategoryDragHandleProps) {
  const { categoryLabel, isEditing, onCategoryDragEnd, onCategoryDragStart } =
    props;
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
 * Render the category header content component.
 * @param props - The component props.
 * @returns The rendered category header content component.
 */
function CategoryHeaderContent(
  props: Pick<
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
  >,
) {
  const {
    categoryFeeds,
    categoryNode,
    editingCategoryName,
    isEditing,
    onCancelCategoryEdit,
    onEditingCategoryNameChange,
    onSaveCategoryRename,
    onStartCategoryEdit,
    savingCategoryLabel,
  } = props;
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
 * Render the category rename fields component.
 * @param props - The component props.
 * @returns The rendered category rename fields component.
 */
function CategoryRenameFields(props: CategoryRenameFieldsProps) {
  const {
    categoryLabel,
    editingCategoryName,
    onCancelCategoryEdit,
    onEditingCategoryNameChange,
    onSaveCategoryRename,
    savingCategoryLabel,
  } = props;
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
 * Render the category summary trigger component.
 * @param props - The component props.
 * @returns The rendered category summary trigger component.
 */
function CategorySummaryTrigger(props: CategorySummaryTriggerProps) {
  const { categoryFeeds, categoryLabel, onStartCategoryEdit } = props;
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
