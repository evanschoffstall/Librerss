import type {
  SettingsCategoryDraftFeedProps,
  SettingsCategoryHeaderCallbacks,
  SharedFeedRowProps,
} from "@/app/dashboard/dashboard-components/settings-dialog/SettingsCategoryFeedContracts";
import type { CategoryTreeNode } from "@/lib/core";

import { SettingsCategoryAccordionBody } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsCategoryAccordionBody";
import { SettingsCategoryAccordionHeader } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsCategoryAccordionHeader";
import { animTransitionColorsClass } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsIconButton";
import { AccordionContent, AccordionItem } from "@/components/ui/accordion";
import { isSameCategoryLabel } from "@/lib/utils";

interface SettingsCategoryAccordionItemProps
  extends
    SettingsCategoryDraftFeedProps,
    SettingsCategoryHeaderCallbacks,
    SharedFeedRowProps {
  addingFeedInCategory: null | string;
  categoryDropIndex: null | number;
  categoryIndex: number;
  categoryNode: CategoryTreeNode;
  editingCategory: null | string;
  editingCategoryName: string;
  onCategoryDragOver: (
    event: React.DragEvent<HTMLElement>,
    index: number,
  ) => void;
  onCategoryDrop: (event: React.DragEvent<HTMLElement>, index: number) => void;
  pendingCategoryRemovalLabel: null | string;
}

/**
 * Renders one settings category accordion item, including its feeds and inline editors.
 * @param props
 */
export function SettingsCategoryAccordionItem(
  props: SettingsCategoryAccordionItemProps,
) {
  const categorySurfaceState = resolveCategorySurfaceState(props);

  return (
    <div
      className={resolveCategoryDropClassName(
        props.categoryDropIndex,
        props.categoryIndex,
      )}
      onDragOver={(event) => {
        props.onCategoryDragOver(event, props.categoryIndex);
      }}
      onDrop={(event) => {
        props.onCategoryDrop(event, props.categoryIndex);
      }}
    >
      <AccordionItem
        className="rounded-md border border-b px-0"
        value={props.categoryNode.key}
      >
        <SettingsCategoryAccordionHeader
          categoryFeeds={categorySurfaceState.categoryFeeds}
          categoryNode={props.categoryNode}
          editingCategoryName={props.editingCategoryName}
          isAddingFeed={categorySurfaceState.isAddingFeed}
          isEditing={categorySurfaceState.isEditing}
          isPendingRemoval={categorySurfaceState.isPendingRemoval}
          onCancelCategoryEdit={props.onCancelCategoryEdit}
          onCategoryDragEnd={props.onCategoryDragEnd}
          onCategoryDragStart={props.onCategoryDragStart}
          onEditingCategoryNameChange={props.onEditingCategoryNameChange}
          onRemoveCategory={props.onRemoveCategory}
          onSaveCategoryRename={props.onSaveCategoryRename}
          onStartCategoryEdit={props.onStartCategoryEdit}
          onToggleAddFeed={props.onToggleAddFeed}
          savingCategoryLabel={props.savingCategoryLabel}
        />
        <SettingsCategoryAccordionContent
          bodyProps={buildBodyProps(props, categorySurfaceState)}
        />
      </AccordionItem>
    </div>
  );
}

/**
 * @param props
 * @param categorySurfaceState
 */
function buildBodyProps(
  props: SettingsCategoryAccordionItemProps,
  categorySurfaceState: ReturnType<typeof resolveCategorySurfaceState>,
): React.ComponentProps<typeof SettingsCategoryAccordionBody> {
  return {
    categoryFeeds: categorySurfaceState.categoryFeeds,
    categoryNode: props.categoryNode,
    deletingKey: props.deletingKey,
    draggingFeedKey: props.draggingFeedKey,
    editingFeedKey: props.editingFeedKey,
    editingFeedName: props.editingFeedName,
    editingFeedUrl: props.editingFeedUrl,
    feedDropTarget: props.feedDropTarget,
    isAddingFeed: categorySurfaceState.isAddingFeed,
    isSavingFeed: props.isSavingFeed,
    movingFeedKey: props.movingFeedKey,
    newFeedName: props.newFeedName,
    newFeedUrl: props.newFeedUrl,
    onAddFeed: props.onAddFeed,
    onCancelAddFeed: props.onCancelAddFeed,
    onCancelFeedEdit: props.onCancelFeedEdit,
    onEditingFeedNameChange: props.onEditingFeedNameChange,
    onEditingFeedUrlChange: props.onEditingFeedUrlChange,
    onFeedDragEnd: props.onFeedDragEnd,
    onFeedDragOver: props.onFeedDragOver,
    onFeedDragStart: props.onFeedDragStart,
    onFeedDrop: props.onFeedDrop,
    onNewFeedNameChange: props.onNewFeedNameChange,
    onNewFeedUrlChange: props.onNewFeedUrlChange,
    onRemoveFeed: props.onRemoveFeed,
    onSaveFeedRename: props.onSaveFeedRename,
    onStartFeedEdit: props.onStartFeedEdit,
    onToggleExtractionDisabled: props.onToggleExtractionDisabled,
    onToggleFeedEnabled: props.onToggleFeedEnabled,
    onToggleProxyEnabled: props.onToggleProxyEnabled,
    savingFeedKey: props.savingFeedKey,
    selectedCategory: props.selectedCategory,
    togglingFeedKey: props.togglingFeedKey,
    updatingSettingsKey: props.updatingSettingsKey,
  };
}

/**
 * @param categoryDropIndex
 * @param categoryIndex
 */
function resolveCategoryDropClassName(
  categoryDropIndex: null | number,
  categoryIndex: number,
) {
  return categoryDropIndex === categoryIndex
    ? `rounded-md border border-primary bg-primary/5 ${animTransitionColorsClass}`
    : animTransitionColorsClass;
}

/**
 * @param props
 */
function resolveCategorySurfaceState(
  props: SettingsCategoryAccordionItemProps,
) {
  return {
    categoryFeeds: props.categoryNode.children ?? [],
    isAddingFeed: props.addingFeedInCategory === props.categoryNode.label,
    isEditing: props.editingCategory === props.categoryNode.label,
    isPendingRemoval: isSameCategoryLabel(
      props.categoryNode.label,
      props.pendingCategoryRemovalLabel,
    ),
  };
}

/**
 * @param root0
 * @param root0.bodyProps
 */
function SettingsCategoryAccordionContent({
  bodyProps,
}: {
  bodyProps: React.ComponentProps<typeof SettingsCategoryAccordionBody>;
}) {
  return (
    <AccordionContent className="px-3 pb-3">
      <SettingsCategoryAccordionBody {...bodyProps} />
    </AccordionContent>
  );
}
