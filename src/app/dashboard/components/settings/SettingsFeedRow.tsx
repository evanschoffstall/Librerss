import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CategoryTreeNode } from "@/lib";
import { GripVertical, Loader2, Trash2 } from "lucide-react";
import { SettingsIconBtn } from "./SettingsIconBtn";

interface SettingsFeedRowProps {
  feedNode: CategoryTreeNode;
  index: number;
  categoryLabel: string;
  selectedCategory: string;
  editingFeedKey: string | null;
  editingFeedName: string;
  savingFeedKey: string | null;
  deletingKey: string | null;
  movingFeedKey: string | null;
  draggingFeedKey: string | null;
  feedDropTarget: { categoryLabel: string; index: number } | null;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, key: string) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLElement>, categoryLabel: string, index: number) => void;
  onDrop: (event: React.DragEvent<HTMLElement>, categoryLabel: string, index: number) => void;
  onSelect: (key: string) => void;
  onEditingNameChange: (name: string) => void;
  onSaveRename: (key: string) => void;
  onCancelRename: () => void;
  onStartEditing: (key: string, currentName: string) => void;
  onRemove: (key: string) => void;
}

export function SettingsFeedRow({
  feedNode,
  index,
  categoryLabel,
  selectedCategory,
  editingFeedKey,
  editingFeedName,
  savingFeedKey,
  deletingKey,
  movingFeedKey,
  draggingFeedKey,
  feedDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onSelect,
  onEditingNameChange,
  onSaveRename,
  onCancelRename,
  onStartEditing,
  onRemove,
}: SettingsFeedRowProps) {
  const isEditing = editingFeedKey === feedNode.key;
  const isDropTarget =
    feedDropTarget?.categoryLabel === categoryLabel && feedDropTarget?.index === index;

  return (
    <div
      key={feedNode.key}
      className={`flex items-center gap-2 rounded-md border px-3 py-2 transition-colors duration-150 ${isDropTarget ? "border-primary bg-primary/5" : ""}`}
      onDragOver={(event) => onDragOver(event, categoryLabel, index)}
      onDrop={(event) => onDrop(event, categoryLabel, index)}
    >
      <button
        type="button"
        draggable
        onDragStart={(event) => onDragStart(event, feedNode.key)}
        onDragEnd={onDragEnd}
        className="shrink-0 cursor-grab text-muted-foreground/70 transition-colors hover:text-foreground active:cursor-grabbing"
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
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => onSaveRename(feedNode.key)}
            disabled={!editingFeedName.trim() || savingFeedKey === feedNode.key}
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
        <button
          onClick={() => onSelect(feedNode.key)}
          className={`min-w-0 flex-1 text-left ${movingFeedKey === feedNode.key ? "opacity-60" : ""}`}
          type="button"
        >
          <p
            className={`truncate text-sm ${selectedCategory === feedNode.key ? "font-medium text-foreground" : "text-foreground/80"}`}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onStartEditing(feedNode.key, feedNode.label);
            }}
            title="Double-click to rename"
          >
            {feedNode.label}
          </p>
          {feedNode.data?.url && (
            <p className="truncate text-xs text-muted-foreground/70">{feedNode.data.url}</p>
          )}
        </button>
      )}

      <div className="flex shrink-0 items-center gap-1">
        <SettingsIconBtn
          tip="Remove feed"
          onClick={() => onRemove(feedNode.key)}
          disabled={deletingKey === feedNode.key || draggingFeedKey === feedNode.key}
          className="text-muted-foreground hover:text-destructive"
        >
          {deletingKey === feedNode.key ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </SettingsIconBtn>
      </div>
    </div>
  );
}
