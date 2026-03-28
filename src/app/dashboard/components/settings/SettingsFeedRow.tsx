import {
  Ellipsis,
  Eye,
  EyeOff,
  FileSearch,
  FileX,
  GripVertical,
  Pencil,
  Shield,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { type CategoryTreeNode, useIsMobile } from "@/lib";

import { MotionSpinner } from "../MotionSpinner";
import {
  animTransitionColorsClass,
  settingsDragHandleCls,
  SettingsIconButton,
} from "./SettingsIconButton";

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

export function SettingsFeedRow({
  categoryLabel,
  deletingKey,
  draggingFeedKey,
  editingFeedKey,
  editingFeedName,
  editingFeedUrl,
  feedDropTarget,
  feedNode,
  index,
  movingFeedKey,
  onCancelRename,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onEditingNameChange,
  onEditingUrlChange,
  onRemove,
  onSaveRename,
  onStartEditing,
  onToggleEnabled,
  onToggleExtractionDisabled,
  onToggleProxyEnabled,
  savingFeedKey,
  selectedCategory,
  togglingFeedKey,
  updatingSettingsKey,
}: SettingsFeedRowProps) {
  const isMobile = useIsMobile();
  const isEnabled = feedNode.data?.enabled !== false;
  const isExtractionDisabled = feedNode.data?.extractionDisabled === true;
  const isProxyEnabled = feedNode.data?.proxyEnabled === true;
  const isTogglingEnabled = togglingFeedKey === feedNode.key;
  const isUpdatingSettings = updatingSettingsKey === feedNode.key;
  const isDeleting = deletingKey === feedNode.key;
  const isDragging = draggingFeedKey === feedNode.key;
  const isEditing = editingFeedKey === feedNode.key;
  const settingsBusy = isUpdatingSettings || isTogglingEnabled || isDeleting;
  const isDropBefore =
    feedDropTarget?.categoryLabel === categoryLabel &&
    feedDropTarget.index === index;
  const isDropAfter =
    feedDropTarget?.categoryLabel === categoryLabel &&
    feedDropTarget.index === index + 1;

  const [pendingSetting, setPendingSetting] = useState<
    "extraction" | "proxy" | null
  >(null);

  const startEditingFeed = () => {
    onStartEditing(feedNode.key, feedNode.label, feedNode.data?.url ?? "");
  };

  useEffect(() => {
    if (!isUpdatingSettings) setPendingSetting(null);
  }, [isUpdatingSettings]);

  const resolveTargetIndexFromPointer = (
    event: React.DragEvent<HTMLElement>,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const midpoint = bounds.top + bounds.height / 2;
    return event.clientY < midpoint ? index : index + 1;
  };

  return (
    <div
      className={`
        group relative flex items-center gap-2 rounded-md border px-3 py-2
        ${animTransitionColorsClass}
        ${isDeleting ? `border-destructive/30 opacity-50` : ""}
      `}
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
        <div
          className="
            pointer-events-none absolute inset-x-2 top-0 h-0.5 rounded-sm
            bg-primary
          "
        />
      ) : null}
      {draggingFeedKey && isDropAfter ? (
        <div
          className="
            pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-sm
            bg-primary
          "
        />
      ) : null}

      <button
        aria-label={`Drag ${feedNode.label}`}
        className={settingsDragHandleCls}
        draggable
        onDragEnd={onDragEnd}
        onDragStart={(event) => {
          onDragStart(event, feedNode.key);
        }}
        type="button"
      >
        <GripVertical className="size-4" />
      </button>

      {isEditing ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            autoFocus
            className="h-7 text-xs"
            onChange={(event) => {
              onEditingNameChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSaveRename(feedNode.key);
              if (event.key === "Escape") onCancelRename();
            }}
            value={editingFeedName}
          />
          <Input
            className="h-7 text-xs"
            onChange={(event) => {
              onEditingUrlChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSaveRename(feedNode.key);
              if (event.key === "Escape") onCancelRename();
            }}
            placeholder="https://example.com/feed.xml"
            value={editingFeedUrl}
          />
          <Button
            className="h-7 text-xs"
            disabled={
              !editingFeedName.trim() ||
              !editingFeedUrl.trim() ||
              savingFeedKey === feedNode.key
            }
            onClick={() => {
              onSaveRename(feedNode.key);
            }}
            size="sm"
          >
            {savingFeedKey === feedNode.key ? (
              <MotionSpinner className="mr-1" iconClassName="size-3" />
            ) : null}
            Save
          </Button>
          <Button
            className="h-7 text-xs"
            onClick={onCancelRename}
            size="sm"
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div
          className={`
            min-w-0 flex-1
            ${movingFeedKey === feedNode.key || !isEnabled ? `opacity-60` : ""}
          `}
        >
          <p
            className={`
              truncate text-sm
              ${
                selectedCategory === feedNode.key
                  ? `font-medium text-foreground`
                  : `text-foreground/80`
              }
            `}
          >
            {feedNode.label}
          </p>
          {feedNode.data?.url && (
            <p
              className="
                cursor-text truncate text-xs text-muted-foreground/70
                select-text
              "
              title="Click and drag to select URL"
            >
              {feedNode.data.url}
            </p>
          )}
        </div>
      )}

      {isMobile ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Open actions for ${feedNode.label}`}
              className="size-7 shrink-0"
              disabled={isDragging}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8}>
            <DropdownMenuItem disabled={settingsBusy} onSelect={startEditingFeed}>
              <Pencil className="size-4" />
              Edit feed
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isTogglingEnabled || isDeleting}
              onSelect={() => {
                onToggleEnabled(feedNode.key, !isEnabled);
              }}
            >
              {isTogglingEnabled ? (
                <MotionSpinner iconClassName="size-3.5" />
              ) : isEnabled ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
              {isEnabled ? "Disable feed" : "Enable feed"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={settingsBusy}
              onSelect={() => {
                setPendingSetting("extraction");
                onToggleExtractionDisabled(feedNode.key, !isExtractionDisabled);
              }}
            >
              {isUpdatingSettings && pendingSetting === "extraction" ? (
                <MotionSpinner iconClassName="size-3.5" />
              ) : isExtractionDisabled ? (
                <FileSearch className="size-4" />
              ) : (
                <FileX className="size-4" />
              )}
              {isExtractionDisabled ? "Enable extraction" : "Disable extraction"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={settingsBusy}
              onSelect={() => {
                setPendingSetting("proxy");
                onToggleProxyEnabled(feedNode.key, !isProxyEnabled);
              }}
            >
              {isUpdatingSettings && pendingSetting === "proxy" ? (
                <MotionSpinner iconClassName="size-3.5" />
              ) : isProxyEnabled ? (
                <ShieldOff className="size-4" />
              ) : (
                <Shield className="size-4" />
              )}
              {isProxyEnabled ? "Disable proxy" : "Enable proxy"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="
                text-destructive
                focus:text-destructive
              "
              disabled={isDeleting || isTogglingEnabled}
              onSelect={() => {
                onRemove(feedNode.key);
              }}
            >
              {isDeleting ? (
                <MotionSpinner iconClassName="size-3.5" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Remove feed
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <SettingsIconButton
            ariaLabel={`Edit ${feedNode.label}`}
            className="
              opacity-0 transition-opacity duration-150
              group-focus-within:opacity-100
              group-hover:opacity-100
            "
            disabled={settingsBusy || isDragging}
            onClick={startEditingFeed}
            tip="Edit feed"
          >
            <Pencil className="size-3.5" />
          </SettingsIconButton>
          <SettingsIconButton
            className={isExtractionDisabled ? "text-muted-foreground/50" : ""}
            disabled={settingsBusy}
            onClick={() => {
              setPendingSetting("extraction");
              onToggleExtractionDisabled(feedNode.key, !isExtractionDisabled);
            }}
            tip={
              isExtractionDisabled ? "Enable extraction" : "Disable extraction"
            }
          >
            {isUpdatingSettings && pendingSetting === "extraction" ? (
              <MotionSpinner iconClassName="size-3.5" />
            ) : isExtractionDisabled ? (
              <FileX className="size-3.5" />
            ) : (
              <FileSearch className="size-3.5" />
            )}
          </SettingsIconButton>
          <SettingsIconButton
            className={
              isProxyEnabled ? "text-primary/80" : "text-muted-foreground/50"
            }
            disabled={settingsBusy}
            onClick={() => {
              setPendingSetting("proxy");
              onToggleProxyEnabled(feedNode.key, !isProxyEnabled);
            }}
            tip={isProxyEnabled ? "Disable proxy" : "Enable proxy"}
          >
            {isUpdatingSettings && pendingSetting === "proxy" ? (
              <MotionSpinner iconClassName="size-3.5" />
            ) : isProxyEnabled ? (
              <Shield className="size-3.5" />
            ) : (
              <ShieldOff className="size-3.5" />
            )}
          </SettingsIconButton>
          <SettingsIconButton
            disabled={isTogglingEnabled || isDeleting || isDragging}
            onClick={() => {
              onToggleEnabled(feedNode.key, !isEnabled);
            }}
            tip={isEnabled ? "Disable feed" : "Enable feed"}
          >
            {isTogglingEnabled ? (
              <MotionSpinner iconClassName="size-3.5" />
            ) : isEnabled ? (
              <Eye className="size-3.5" />
            ) : (
              <EyeOff className="size-3.5" />
            )}
          </SettingsIconButton>
          <div className="mx-0.5 h-4 w-px bg-border/40" />
          <SettingsIconButton
            className="
              text-muted-foreground
              hover:text-destructive
            "
            disabled={isDeleting || isDragging || isTogglingEnabled}
            onClick={() => {
              onRemove(feedNode.key);
            }}
            tip="Remove feed"
          >
            {isDeleting ? (
              <MotionSpinner iconClassName="size-3.5" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </SettingsIconButton>
        </div>
      )}
    </div>
  );
}
