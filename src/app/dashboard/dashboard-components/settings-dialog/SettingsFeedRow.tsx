import { GripVertical } from "lucide-react";
import { useEffect, useState } from "react";

import type { CategoryTreeNode } from "@/lib/core";

import {
  FeedRowActions,
  type SettingsFeedRowDerivedState,
} from "@/app/dashboard/dashboard-components/settings-dialog/SettingsFeedRowActions";
import {
  animTransitionColorsClass,
  settingsDragHandleCls,
} from "@/app/dashboard/dashboard-components/settings-dialog/SettingsIconButton";
import {
  handleInlineEditorKeyDown,
  SettingsInlineEditorControls,
} from "@/app/dashboard/dashboard-components/settings-dialog/SettingsInlineEditorControls";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/lib/hooks";

/** Feed-row contract shared by the settings category list and feed editor state. */
export interface SettingsFeedRowProps {
  categoryLabel: string;
  deletingKey: null | string;
  draggingFeedKey: null | string;
  editingFeedKey: null | string;
  editingFeedName: string;
  editingFeedUrl: string;
  feedDropTarget: null | { categoryLabel: string; index: number };
  feedNode: CategoryTreeNode;
  index: number;
  movingFeedKey: null | string;
  onCancelRename: () => void;
  onDragEnd: () => void;
  onDragOver: (
    event: React.DragEvent<HTMLElement>,
    categoryLabel: string,
    index: number,
  ) => void;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, key: string) => void;
  onDrop: (
    event: React.DragEvent<HTMLElement>,
    categoryLabel: string,
    index: number,
  ) => void;
  onEditingNameChange: (name: string) => void;
  onEditingUrlChange: (url: string) => void;
  onRemove: (key: string) => void;
  onSaveRename: (key: string) => void;
  onStartEditing: (
    key: string,
    currentName: string,
    currentUrl: string,
  ) => void;
  onToggleEnabled: (key: string, enabled: boolean) => void;
  onToggleExtractionDisabled: (key: string, disabled: boolean) => void;
  onToggleProxyEnabled: (key: string, enabled: boolean) => void;
  savingFeedKey: null | string;
  selectedCategory: string;
  togglingFeedKey: null | string;
  updatingSettingsKey: null | string;
}

interface FeedRowDisplayContentProps {
  feedNode: CategoryTreeNode;
  isEnabled: boolean;
  movingFeedKey: null | string;
  selectedCategory: string;
}
interface FeedRowDropMarkerProps {
  position: "bottom" | "top";
}

interface FeedRowEditingFieldsProps {
  editingFeedName: string;
  editingFeedUrl: string;
  feedKey: string;
  onCancelRename: () => void;
  onEditingNameChange: (name: string) => void;
  onEditingUrlChange: (url: string) => void;
  onSaveRename: (key: string) => void;
  savingFeedKey: null | string;
}
/**
 * Render the settings feed row component.
 * @param props - The component props.
 * @returns The rendered settings feed row component.
 */
export function SettingsFeedRow(props: SettingsFeedRowProps) {
  const isMobile = useIsMobile();
  const rowState = useSettingsFeedRowState(props);

  return (
    <div
      className={[
        "group relative flex items-center gap-2 rounded-md border px-3 py-2",
        animTransitionColorsClass,
        rowState.isDeleting ? "border-destructive/30 opacity-50" : "",
      ].join(" ")}
      onDragOver={(event) => {
        const targetIndex = resolveTargetIndexFromPointer(event, props.index);
        props.onDragOver(event, props.categoryLabel, targetIndex);
        if (event.defaultPrevented) {
          event.stopPropagation();
        }
      }}
      onDrop={(event) => {
        const targetIndex = resolveTargetIndexFromPointer(event, props.index);
        props.onDrop(event, props.categoryLabel, targetIndex);
      }}
    >
      {props.draggingFeedKey && rowState.isDropBefore ? (
        <FeedRowDropMarker position="top" />
      ) : null}
      {props.draggingFeedKey && rowState.isDropAfter ? (
        <FeedRowDropMarker position="bottom" />
      ) : null}

      <button
        aria-label={`Drag ${props.feedNode.label}`}
        className={settingsDragHandleCls}
        draggable
        onDragEnd={props.onDragEnd}
        onDragStart={(event) => {
          props.onDragStart(event, props.feedNode.key);
        }}
        type="button"
      >
        <GripVertical className="size-4" />
      </button>

      {rowState.isEditing ? (
        <FeedRowEditingFields
          editingFeedName={props.editingFeedName}
          editingFeedUrl={props.editingFeedUrl}
          feedKey={props.feedNode.key}
          onCancelRename={props.onCancelRename}
          onEditingNameChange={props.onEditingNameChange}
          onEditingUrlChange={props.onEditingUrlChange}
          onSaveRename={props.onSaveRename}
          savingFeedKey={props.savingFeedKey}
        />
      ) : (
        <FeedRowDisplayContent
          feedNode={props.feedNode}
          isEnabled={rowState.isEnabled}
          movingFeedKey={props.movingFeedKey}
          selectedCategory={props.selectedCategory}
        />
      )}

      <FeedRowActions
        isMobile={isMobile}
        rowProps={props}
        rowState={rowState}
      />
    </div>
  );
}

/**
 * Render the feed row display content component.
 * @param props - The component props.
 * @returns The rendered feed row display content component.
 */
function FeedRowDisplayContent(props: FeedRowDisplayContentProps) {
  const { feedNode, isEnabled, movingFeedKey, selectedCategory } = props;
  return (
    <div
      className={[
        "min-w-0 flex-1",
        movingFeedKey === feedNode.key || !isEnabled ? "opacity-60" : "",
      ].join(" ")}
    >
      <p
        className={[
          "truncate text-sm",
          selectedCategory === feedNode.key
            ? "font-medium text-foreground"
            : "text-foreground/80",
        ].join(" ")}
      >
        {feedNode.label}
      </p>
      {feedNode.data?.url ? (
        <p
          className="
            cursor-text truncate text-xs text-muted-foreground/70 select-text
          "
          title="Click and drag to select URL"
        >
          {feedNode.data.url}
        </p>
      ) : null}
    </div>
  );
}
/**
 * Render the feed row drop marker component.
 * @param props - The component props.
 * @returns The rendered feed row drop marker component.
 */
function FeedRowDropMarker(props: FeedRowDropMarkerProps) {
  const { position } = props;
  return (
    <div
      className={[
        "pointer-events-none absolute inset-x-2 h-0.5 rounded-sm bg-primary",
        position === "top" ? "top-0" : "bottom-0",
      ].join(" ")}
    />
  );
}

/**
 * Render the feed row editing fields component.
 * @param props - The component props.
 * @returns The rendered feed row editing fields component.
 */
function FeedRowEditingFields(props: FeedRowEditingFieldsProps) {
  const {
    editingFeedName,
    editingFeedUrl,
    feedKey,
    onCancelRename,
    onEditingNameChange,
    onEditingUrlChange,
    onSaveRename,
    savingFeedKey,
  } = props;
  const isSaving = savingFeedKey === feedKey;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Input
        autoFocus
        className="h-7 text-xs"
        onChange={(event) => {
          onEditingNameChange(event.target.value);
        }}
        onKeyDown={(event) => {
          handleInlineEditorKeyDown(
            event,
            () => {
              onSaveRename(feedKey);
            },
            onCancelRename,
          );
        }}
        value={editingFeedName}
      />
      <Input
        className="h-7 text-xs"
        onChange={(event) => {
          onEditingUrlChange(event.target.value);
        }}
        onKeyDown={(event) => {
          handleInlineEditorKeyDown(
            event,
            () => {
              onSaveRename(feedKey);
            },
            onCancelRename,
          );
        }}
        placeholder="https://example.com/feed.xml"
        value={editingFeedUrl}
      />
      <SettingsInlineEditorControls
        disabled={!editingFeedName.trim() || !editingFeedUrl.trim()}
        isSaving={isSaving}
        onCancel={onCancelRename}
        onSave={() => {
          onSaveRename(feedKey);
        }}
      />
    </div>
  );
}

/**
 * Resolve the target index from pointer.
 * @param event - The event.
 * @param index - The index.
 * @returns The target index from pointer.
 */
function resolveTargetIndexFromPointer(
  event: React.DragEvent<HTMLElement>,
  index: number,
) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientY < bounds.top + bounds.height / 2 ? index : index + 1;
}

/**
 * Manage the settings feed row state.
 * @param options - The options used to manage the settings feed row state.
 * @returns The settings feed row state state and callbacks.
 */
function useSettingsFeedRowState(
  options: Pick<
    SettingsFeedRowProps,
    | "categoryLabel"
    | "deletingKey"
    | "draggingFeedKey"
    | "editingFeedKey"
    | "feedDropTarget"
    | "feedNode"
    | "index"
    | "onStartEditing"
    | "togglingFeedKey"
    | "updatingSettingsKey"
  >,
): SettingsFeedRowDerivedState {
  const {
    categoryLabel,
    deletingKey,
    draggingFeedKey,
    editingFeedKey,
    feedDropTarget,
    feedNode,
    index,
    onStartEditing,
    togglingFeedKey,
    updatingSettingsKey,
  } = options;
  const [pendingSetting, setPendingSetting] = useState<
    "extraction" | "proxy" | null
  >(null);
  const isEnabled = feedNode.data?.enabled !== false;
  const isExtractionDisabled = feedNode.data?.extractionDisabled === true;
  const isProxyEnabled = feedNode.data?.proxyEnabled === true;
  const isTogglingEnabled = togglingFeedKey === feedNode.key;
  const isUpdatingSettings = updatingSettingsKey === feedNode.key;
  const isDeleting = deletingKey === feedNode.key;
  const isDragging = draggingFeedKey === feedNode.key;
  const isEditing = editingFeedKey === feedNode.key;

  useEffect(() => {
    if (!isUpdatingSettings) {
      setPendingSetting(null);
    }
  }, [isUpdatingSettings]);

  return {
    isDeleting,
    isDragging,
    isDropAfter:
      feedDropTarget?.categoryLabel === categoryLabel &&
      feedDropTarget.index === index + 1,
    isDropBefore:
      feedDropTarget?.categoryLabel === categoryLabel &&
      feedDropTarget.index === index,
    isEditing,
    isEnabled,
    isExtractionDisabled,
    isProxyEnabled,
    isTogglingEnabled,
    isUpdatingSettings,
    pendingSetting,
    setPendingSetting,
    settingsBusy: isUpdatingSettings || isTogglingEnabled || isDeleting,
    /**
     * Opens the inline feed editor with the current feed values prefilled.
     */
    startEditingFeed: () => {
      onStartEditing(feedNode.key, feedNode.label, feedNode.data?.url ?? "");
    },
  };
}
