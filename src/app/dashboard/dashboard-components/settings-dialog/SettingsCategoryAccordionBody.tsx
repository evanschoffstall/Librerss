import { Plus } from "lucide-react";

import type {
  SettingsCategoryDraftFeedProps,
  SharedFeedRowProps,
} from "@/app/dashboard/dashboard-components/settings-dialog/SettingsCategoryFeedContracts";
import type { CategoryTreeNode } from "@/lib/core";

import { SettingsCategoryFeedList } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsCategoryFeedList";
import { animTransitionColorsClass } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsIconButton";
import { MotionSpinner } from "@/app/dashboard/dashboard-components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SettingsCategoryAccordionBodyProps
  extends SettingsCategoryDraftFeedProps, SharedFeedRowProps {
  categoryFeeds: CategoryTreeNode[];
  categoryNode: CategoryTreeNode;
  isAddingFeed: boolean;
}

/**
 * @param props
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
 * @param root0
 * @param root0.canAddFeed
 * @param root0.isSavingFeed
 * @param root0.onCancelAddFeed
 * @param root0.onSubmit
 */
function CategoryAddFeedActions({
  canAddFeed,
  isSavingFeed,
  onCancelAddFeed,
  onSubmit,
}: {
  canAddFeed: boolean;
  isSavingFeed: boolean;
  onCancelAddFeed: () => void;
  onSubmit: () => void;
}) {
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
        className="h-8 px-3 text-xs"
        disabled={!canAddFeed || isSavingFeed}
        onClick={onSubmit}
        size="sm"
      >
        {isSavingFeed ? (
          <MotionSpinner className="mr-1" iconClassName="size-3" />
        ) : (
          <Plus className="mr-1 size-3" />
        )}
        {isSavingFeed ? "Saving…" : "Add Feed"}
      </Button>
    </>
  );
}

/**
 * @param root0
 * @param root0.categoryNode
 * @param root0.isSavingFeed
 * @param root0.newFeedName
 * @param root0.newFeedUrl
 * @param root0.onAddFeed
 * @param root0.onCancelAddFeed
 * @param root0.onNewFeedNameChange
 * @param root0.onNewFeedUrlChange
 */
function CategoryAddFeedForm({
  categoryNode,
  isSavingFeed,
  newFeedName,
  newFeedUrl,
  onAddFeed,
  onCancelAddFeed,
  onNewFeedNameChange,
  onNewFeedUrlChange,
}: Pick<
  SettingsCategoryAccordionBodyProps,
  | "categoryNode"
  | "isSavingFeed"
  | "newFeedName"
  | "newFeedUrl"
  | "onAddFeed"
  | "onCancelAddFeed"
  | "onNewFeedNameChange"
  | "onNewFeedUrlChange"
>) {
  const canAddFeed = newFeedName.trim() && newFeedUrl.trim();
  /**
   *
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
          className="h-8 flex-1 text-sm"
          onChange={(event) => {
            onNewFeedNameChange(event.target.value);
          }}
          placeholder="Feed name"
          value={newFeedName}
        />
        <Input
          className="h-8 flex-2 text-sm"
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
 * @param options
 * @param options.canAddFeed
 * @param options.handleAddFeed
 * @param options.onCancelAddFeed
 */
function createCategoryFeedUrlKeyDownHandler(options: {
  canAddFeed: boolean;
  handleAddFeed: () => void;
  onCancelAddFeed: () => void;
}) {
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
 * @param root0
 * @param root0.categoryLabel
 * @param root0.draggingFeedKey
 * @param root0.feedDropTarget
 * @param root0.onFeedDragOver
 * @param root0.onFeedDrop
 */
function EmptyCategoryFeedDropZone({
  categoryLabel,
  draggingFeedKey,
  feedDropTarget,
  onFeedDragOver,
  onFeedDrop,
}: {
  categoryLabel: string;
  draggingFeedKey: null | string;
  feedDropTarget: SharedFeedRowProps["feedDropTarget"];
  onFeedDragOver: SharedFeedRowProps["onFeedDragOver"];
  onFeedDrop: SharedFeedRowProps["onFeedDrop"];
}) {
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
