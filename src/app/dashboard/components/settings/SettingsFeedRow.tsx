import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CategoryTreeNode } from "@/lib";
import { Eye, EyeOff, GripVertical, Loader2, Trash2 } from "lucide-react";
import { SettingsIconButton, settingsDragHandleCls } from "./SettingsIconButton";

const animTransitionColorsClass = "transition-colors anim-duration-ui anim-ease-ui";

export interface SettingsFeedRowProps {
  feedNode: CategoryTreeNode;
  index: number;
  categoryLabel: string;
  selectedCategory: string;
  editingFeedKey: string | null;
  editingFeedName: string;
  editingFeedUrl: string;
  savingFeedKey: string | null;
  deletingKey: string | null;
  movingFeedKey: string | null;
  draggingFeedKey: string | null;
  feedDropTarget: { categoryLabel: string; index: number } | null;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, key: string) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLElement>, categoryLabel: string, index: number) => void;
  onDrop: (event: React.DragEvent<HTMLElement>, categoryLabel: string, index: number) => void;
  onEditingNameChange: (name: string) => void;
  onEditingUrlChange: (url: string) => void;
  onSaveRename: (key: string) => void;
  onCancelRename: () => void;
  onStartEditing: (key: string, currentName: string, currentUrl: string) => void;
  onRemove: (key: string) => void;
  onToggleEnabled: (key: string, enabled: boolean) => void;
  togglingFeedKey: string | null;
}

export function SettingsFeedRow({
  feedNode,
  index,
  categoryLabel,
  selectedCategory,
  editingFeedKey,
  editingFeedName,
  editingFeedUrl,
  savingFeedKey,
  deletingKey,
  movingFeedKey,
  draggingFeedKey,
  feedDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onEditingNameChange,
  onEditingUrlChange,
  onSaveRename,
  onCancelRename,
  onStartEditing,
  onRemove,
  onToggleEnabled,
  togglingFeedKey,
}: SettingsFeedRowProps) {
  const isEnabled = feedNode.data?.enabled !== false;
  const isTogglingEnabled = togglingFeedKey === feedNode.key;
  const isEditing = editingFeedKey === feedNode.key;
  const isDropBefore =
    feedDropTarget?.categoryLabel === categoryLabel &&
    feedDropTarget?.index === index;
  const isDropAfter =
    feedDropTarget?.categoryLabel === categoryLabel &&
    feedDropTarget?.index === index + 1;

  const resolveTargetIndexFromPointer = (event: React.DragEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const midpoint = bounds.top + bounds.height / 2;
    return event.clientY < midpoint ? index : index + 1;
  };

  return (
    <div
      key={feedNode.key}
      className={`relative flex items-center gap-2 rounded-md border px-3 py-2 ${animTransitionColorsClass}`}
      onDragOver={(event) => {
        const targetIndex = resolveTargetIndexFromPointer(event);
        onDragOver(event, categoryLabel, targetIndex);
        // If the handler accepted this drag (called preventDefault),
        // stop the event from bubbling to the parent "drop-at-end" handler.
        if (event.defaultPrevented) {
          event.stopPropagation();
        }
      }}
      onDrop={(event) => {
        const targetIndex = resolveTargetIndexFromPointer(event);
        onDrop(event, categoryLabel, targetIndex);
      }}
    >
      {draggingFeedKey && isDropBefore ? (
        <div className="pointer-events-none absolute inset-x-2 top-0 h-0.5 rounded bg-primary" />
      ) : null}
      {draggingFeedKey && isDropAfter ? (
        <div className="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded bg-primary" />
      ) : null}

      <button
        type="button"
        draggable
        onDragStart={(event) => onDragStart(event, feedNode.key)}
        onDragEnd={onDragEnd}
        className={settingsDragHandleCls}
        aria-label={`Drag ${feedNode.label}`}
      >
        <GripVertical className="size-4" />
      </button>

      {isEditing ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            value={editingFeedName}
            onChange={(event) => onEditingNameChange(event.target.value)}
            className="h-7 text-xs"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") onSaveRename(feedNode.key);
              if (event.key === "Escape") onCancelRename();
            }}
          />
          <Input
            value={editingFeedUrl}
            onChange={(event) => onEditingUrlChange(event.target.value)}
            className="h-7 text-xs"
            placeholder="https://example.com/feed.xml"
            onKeyDown={(event) => {
              if (event.key === "Enter") onSaveRename(feedNode.key);
              if (event.key === "Escape") onCancelRename();
            }}
          />
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => onSaveRename(feedNode.key)}
            disabled={
              !editingFeedName.trim() ||
              !editingFeedUrl.trim() ||
              savingFeedKey === feedNode.key
            }
          >
            {savingFeedKey === feedNode.key ? (
              <Loader2 className="mr-1 size-3 animate-spin" />
            ) : null}
            Save
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancelRename}>
            Cancel
          </Button>
        </div>
      ) : (
        <div
          className={`min-w-0 flex-1 ${movingFeedKey === feedNode.key || !isEnabled ? "opacity-60" : ""}`}
        >
          <p
            className={`truncate text-sm ${selectedCategory === feedNode.key ? "font-medium text-foreground" : "text-foreground/80"}`}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onStartEditing(feedNode.key, feedNode.label, feedNode.data?.url ?? "");
            }}
            title="Double-click to rename"
          >
            {feedNode.label}
          </p>
          {feedNode.data?.url && (
            <p
              className="truncate select-text text-xs text-muted-foreground/70"
              onDoubleClick={(event) => {
                event.stopPropagation();
                onStartEditing(feedNode.key, feedNode.label, feedNode.data?.url ?? "");
              }}
              title="Click and drag to select URL • Double-click to edit"
            >
              {feedNode.data.url}
            </p>
          )}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-1">
        <SettingsIconButton
          tip={isEnabled ? "Disable feed" : "Enable feed"}
          onClick={() => onToggleEnabled(feedNode.key, !isEnabled)}
          disabled={
            isTogglingEnabled ||
            deletingKey === feedNode.key ||
            draggingFeedKey === feedNode.key
          }
        >
          {isTogglingEnabled ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : isEnabled ? (
            <Eye className="size-3.5" />
          ) : (
            <EyeOff className="size-3.5" />
          )}
        </SettingsIconButton>
        <SettingsIconButton
          tip="Remove feed"
          onClick={() => onRemove(feedNode.key)}
          disabled={
            deletingKey === feedNode.key ||
            draggingFeedKey === feedNode.key ||
            isTogglingEnabled
          }
          className="text-muted-foreground hover:text-destructive"
        >
          {deletingKey === feedNode.key ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </SettingsIconButton>
      </div>
    </div>
  );
}
