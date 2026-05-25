import { Plus } from "lucide-react";

import type {
  SettingsCategoryDraftFeedProps,
  SharedFeedRowProps,
} from "@/app/dashboard/components/settings-dialog/SettingsCategoryFeedContracts";
import type { CategoryTreeNode } from "@/lib/core";

import { SettingsCategoryFeedList } from "@/app/dashboard/components/settings-dialog/SettingsCategoryFeedList";
import { animTransitionColorsClass } from "@/app/dashboard/components/settings-dialog/SettingsIconButton";
import { MotionSpinner } from "@/app/dashboard/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Describes the props for the settings category accordion body component.
 */
export interface SettingsCategoryAccordionBodyProps
  extends SettingsCategoryDraftFeedProps, SharedFeedRowProps {
  categoryFeeds: CategoryTreeNode[];
  categoryNode: CategoryTreeNode;
  isAddingFeed: boolean;
}

/**
 * Describes the props for the category add feed actions component.
 */
interface CategoryAddFeedActionsProps {
  canAddFeed: boolean;
  isSavingFeed: boolean;
  onCancelAddFeed: () => void;
  onSubmit: () => void;
}
/**
 * Describes the options for category feed URL key down handler.
 */
interface CategoryFeedUrlKeyDownHandlerOptions {
  canAddFeed: boolean;
  handleAddFeed: () => void;
  onCancelAddFeed: () => void;
}

/**
 * Describes the props for the empty category feed drop zone component.
 */
interface EmptyCategoryFeedDropZoneProps {
  categoryLabel: string;
  draggingFeedKey: null | string;
  feedDropTarget: SharedFeedRowProps["feedDropTarget"];
  onFeedDragOver: SharedFeedRowProps["onFeedDragOver"];
  onFeedDrop: SharedFeedRowProps["onFeedDrop"];
}

/**
 * Render the settings category accordion body component.
 * @param props - The component props.
 * @returns The rendered settings category accordion body component.
 */
export function SettingsCategoryAccordionBody(
  props: SettingsCategoryAccordionBodyProps,
) {
  return (
    <>
      {props.isAddingFeed ? <CategoryAddFeedForm {...props} /> : null}
      {props.categoryFeeds.length === 0 && !props.isAddingFeed ? (
        <EmptyCategoryFeedDropZone
          categoryLabel={props.categoryNode.label}
          draggingFeedKey={props.draggingFeedKey}
          feedDropTarget={props.feedDropTarget}
          onFeedDragOver={props.onFeedDragOver}
          onFeedDrop={props.onFeedDrop}
        />
      ) : (
        <SettingsCategoryFeedList
          categoryFeeds={props.categoryFeeds}
          categoryLabel={props.categoryNode.label}
          deletingKey={props.deletingKey}
          draggingFeedKey={props.draggingFeedKey}
          editingFeedKey={props.editingFeedKey}
          editingFeedName={props.editingFeedName}
          editingFeedUrl={props.editingFeedUrl}
          feedDropTarget={props.feedDropTarget}
          movingFeedKey={props.movingFeedKey}
          onCancelFeedEdit={props.onCancelFeedEdit}
          onEditingFeedNameChange={props.onEditingFeedNameChange}
          onEditingFeedUrlChange={props.onEditingFeedUrlChange}
          onFeedDragEnd={props.onFeedDragEnd}
          onFeedDragOver={props.onFeedDragOver}
          onFeedDragStart={props.onFeedDragStart}
          onFeedDrop={props.onFeedDrop}
          onRemoveFeed={props.onRemoveFeed}
          onSaveFeedRename={props.onSaveFeedRename}
          onStartFeedEdit={props.onStartFeedEdit}
          onToggleExtractionDisabled={props.onToggleExtractionDisabled}
          onToggleFeedEnabled={props.onToggleFeedEnabled}
          onToggleProxyEnabled={props.onToggleProxyEnabled}
          savingFeedKey={props.savingFeedKey}
          selectedCategory={props.selectedCategory}
          togglingFeedKey={props.togglingFeedKey}
          updatingSettingsKey={props.updatingSettingsKey}
        />
      )}
    </>
  );
}
/**
 * Render the category add feed actions component.
 * @param props - The component props.
 * @returns The rendered category add feed actions component.
 */
function CategoryAddFeedActions(props: CategoryAddFeedActionsProps) {
  const { canAddFeed, isSavingFeed, onCancelAddFeed, onSubmit } = props;
  return (
    <>
      <Button
        className="h-8 px-3 text-xs"
        onClick={onCancelAddFeed}
        size="sm"
        variant="ghost"
      >
        Cancel
      </Button>
      <Button
        aria-label={isSavingFeed ? "Saving feed" : "Add Feed"}
        className="h-8 px-2 text-xs md:px-3"
        disabled={!canAddFeed || isSavingFeed}
        onClick={onSubmit}
        size="sm"
      >
        {isSavingFeed ? (
          <>
            <MotionSpinner className="md:mr-1" iconClassName="size-3" />
            <span aria-hidden="true" className="hidden md:inline">
              Saving…
            </span>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="text-sm md:hidden">
              +
            </span>
            <Plus
              aria-hidden="true"
              className="hidden size-3 md:mr-1 md:inline-block"
            />
            <span aria-hidden="true" className="hidden md:inline">
              Add Feed
            </span>
          </>
        )}
      </Button>
    </>
  );
}

/**
 * Render the category add feed form component.
 * @param props - The component props.
 * @returns The rendered category add feed form component.
 */
function CategoryAddFeedForm(
  props: Pick<
    SettingsCategoryAccordionBodyProps,
    | "categoryNode"
    | "isSavingFeed"
    | "newFeedName"
    | "newFeedUrl"
    | "onAddFeed"
    | "onCancelAddFeed"
    | "onNewFeedNameChange"
    | "onNewFeedUrlChange"
  >,
) {
  const {
    categoryNode,
    isSavingFeed,
    newFeedName,
    newFeedUrl,
    onAddFeed,
    onCancelAddFeed,
    onNewFeedNameChange,
    onNewFeedUrlChange,
  } = props;
  const canAddFeed = newFeedName.trim() && newFeedUrl.trim();
  /**
   * Process the handle add feed.
   */
  const handleAddFeed = () => {
    onAddFeed(categoryNode.label);
  };
  const handleUrlKeyDown = createCategoryFeedUrlKeyDownHandler({
    canAddFeed: Boolean(canAddFeed),
    handleAddFeed,
    onCancelAddFeed,
  });

  return (
    <div
      className={`
        mb-2 rounded-md border border-dashed p-2.5
        ${animTransitionColorsClass}
      `}
    >
      <div className="flex gap-2">
        <Input
          autoFocus
          className="h-8 flex-1"
          onChange={(event) => {
            onNewFeedNameChange(event.target.value);
          }}
          placeholder="Feed name"
          value={newFeedName}
        />
        <Input
          className="h-8 flex-2"
          onChange={(event) => {
            onNewFeedUrlChange(event.target.value);
          }}
          onKeyDown={handleUrlKeyDown}
          placeholder="https://example.com/feed.xml"
          value={newFeedUrl}
        />
        <CategoryAddFeedActions
          canAddFeed={Boolean(canAddFeed)}
          isSavingFeed={isSavingFeed}
          onCancelAddFeed={onCancelAddFeed}
          onSubmit={handleAddFeed}
        />
      </div>
    </div>
  );
}
/**
 * Create the category feed url key down handler.
 * @param options - The options used to create the category feed url key down handler.
 * @returns The category feed url key down handler.
 */
function createCategoryFeedUrlKeyDownHandler(
  options: CategoryFeedUrlKeyDownHandlerOptions,
) {
  return (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && options.canAddFeed) {
      options.handleAddFeed();
    }

    if (event.key === "Escape") {
      options.onCancelAddFeed();
    }
  };
}

/**
 * Render the empty category feed drop zone component.
 * @param props - The component props.
 * @returns The rendered empty category feed drop zone component.
 */
function EmptyCategoryFeedDropZone(props: EmptyCategoryFeedDropZoneProps) {
  const {
    categoryLabel,
    draggingFeedKey,
    feedDropTarget,
    onFeedDragOver,
    onFeedDrop,
  } = props;
  const isDropTarget =
    feedDropTarget?.categoryLabel === categoryLabel &&
    feedDropTarget.index === 0;

  return (
    <div
      className={[
        "rounded-md border border-dashed px-3 py-4 text-center text-xs transition-colors",
        isDropTarget
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border/50 text-muted-foreground/60",
      ].join(" ")}
      onDragOver={(event) => {
        onFeedDragOver(event, categoryLabel, 0);
      }}
      onDrop={(event) => {
        void onFeedDrop(event, categoryLabel, 0);
      }}
    >
      {draggingFeedKey ? "Drop feed here" : "No feeds — click + to add one."}
    </div>
  );
}
