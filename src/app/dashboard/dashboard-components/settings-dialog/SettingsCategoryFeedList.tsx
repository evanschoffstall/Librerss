import type { SettingsCategoryFeedListProps } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsCategoryFeedContracts";

import { SettingsFeedRow } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsFeedRow";

export type { SettingsCategoryFeedListProps } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsCategoryFeedContracts";

/**
 * @param props
 */
export function SettingsCategoryFeedList(props: SettingsCategoryFeedListProps) {
  return (
    <div
      className="space-y-1.5"
      onDragOver={(event) => {
        if (!event.defaultPrevented) {
          props.onFeedDragOver(
            event,
            props.categoryLabel,
            props.categoryFeeds.length,
          );
        }
      }}
      onDrop={(event) => {
        if (!event.defaultPrevented) {
          void props.onFeedDrop(
            event,
            props.categoryLabel,
            props.categoryFeeds.length,
          );
        }
      }}
    >
      {props.categoryFeeds.map((feedNode, index) => (
        <SettingsFeedRow
          categoryLabel={props.categoryLabel}
          deletingKey={props.deletingKey}
          draggingFeedKey={props.draggingFeedKey}
          editingFeedKey={props.editingFeedKey}
          editingFeedName={props.editingFeedName}
          editingFeedUrl={props.editingFeedUrl}
          feedDropTarget={props.feedDropTarget}
          feedNode={feedNode}
          index={index}
          key={feedNode.key}
          movingFeedKey={props.movingFeedKey}
          onCancelRename={props.onCancelFeedEdit}
          onDragEnd={props.onFeedDragEnd}
          onDragOver={props.onFeedDragOver}
          onDragStart={props.onFeedDragStart}
          onDrop={(event, categoryLabel, index) => {
            void props.onFeedDrop(event, categoryLabel, index);
          }}
          onEditingNameChange={props.onEditingFeedNameChange}
          onEditingUrlChange={props.onEditingFeedUrlChange}
          onRemove={props.onRemoveFeed}
          onSaveRename={props.onSaveFeedRename}
          onStartEditing={props.onStartFeedEdit}
          onToggleEnabled={props.onToggleFeedEnabled}
          onToggleExtractionDisabled={props.onToggleExtractionDisabled}
          onToggleProxyEnabled={props.onToggleProxyEnabled}
          savingFeedKey={props.savingFeedKey}
          selectedCategory={props.selectedCategory}
          togglingFeedKey={props.togglingFeedKey}
          updatingSettingsKey={props.updatingSettingsKey}
        />
      ))}
    </div>
  );
}
