"use client";

/**
 * Encapsulates HTML5 drag-and-drop state and handlers for the settings modal:
 * feed rows within a category, and category accordion items.
 */

import { useCallback, useState } from "react";

interface UseSettingsDragOptions {
  onDropFeed: (key: string, targetCategory: string, targetIndex: number) => Promise<void>;
  onDropCategory: (label: string, targetIndex: number) => Promise<void>;
}

export type UseSettingsDragReturn = ReturnType<typeof useSettingsDrag>;

export function useSettingsDrag({ onDropFeed, onDropCategory }: UseSettingsDragOptions) {
  // ── Feed drag ─────────────────────────────────────────────────────────────

  const [draggingFeedKey, setDraggingFeedKey] = useState<string | null>(null);
  const [movingFeedKey, setMovingFeedKey] = useState<string | null>(null);
  const [feedDropTarget, setFeedDropTarget] = useState<{
    categoryLabel: string;
    index: number;
  } | null>(null);

  const handleFeedDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, key: string) => {
      setDraggingFeedKey(key);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", key);
    },
    [],
  );

  const handleFeedDragEnd = useCallback(() => {
    setDraggingFeedKey(null);
    setFeedDropTarget(null);
  }, []);

  const handleFeedDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>, categoryLabel: string, index: number) => {
      if (!draggingFeedKey) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setFeedDropTarget({ categoryLabel, index });
    },
    [draggingFeedKey],
  );

  const handleFeedDrop = useCallback(
    async (event: React.DragEvent<HTMLElement>, categoryLabel: string, index: number) => {
      event.preventDefault();
      const droppedKey = event.dataTransfer.getData("text/plain") || draggingFeedKey;
      setFeedDropTarget(null);
      if (!droppedKey) return;
      setMovingFeedKey(droppedKey);
      try {
        await onDropFeed(droppedKey, categoryLabel, index);
      } finally {
        setMovingFeedKey(null);
        setDraggingFeedKey(null);
      }
    },
    [draggingFeedKey, onDropFeed],
  );

  // ── Category drag ─────────────────────────────────────────────────────────

  const [draggingCategoryLabel, setDraggingCategoryLabel] = useState<string | null>(null);
  const [categoryDropIndex, setCategoryDropIndex] = useState<number | null>(null);

  const handleCategoryDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, label: string) => {
      setDraggingCategoryLabel(label);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", label);
    },
    [],
  );

  const handleCategoryDragEnd = useCallback(() => {
    setDraggingCategoryLabel(null);
    setCategoryDropIndex(null);
  }, []);

  const handleCategoryDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>, index: number) => {
      if (!draggingCategoryLabel) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setCategoryDropIndex(index);
    },
    [draggingCategoryLabel],
  );

  const handleCategoryDrop = useCallback(
    async (event: React.DragEvent<HTMLElement>, index: number) => {
      event.preventDefault();
      const droppedLabel = event.dataTransfer.getData("text/plain") || draggingCategoryLabel;
      setCategoryDropIndex(null);
      if (!droppedLabel) return;
      try {
        await onDropCategory(droppedLabel, index);
      } finally {
        setDraggingCategoryLabel(null);
      }
    },
    [draggingCategoryLabel, onDropCategory],
  );

  return {
    // Feed drag
    draggingFeedKey,
    movingFeedKey,
    feedDropTarget,
    onFeedDragStart: handleFeedDragStart,
    onFeedDragEnd: handleFeedDragEnd,
    onFeedDragOver: handleFeedDragOver,
    onFeedDrop: handleFeedDrop,
    // Category drag
    draggingCategoryLabel,
    categoryDropIndex,
    onCategoryDragStart: handleCategoryDragStart,
    onCategoryDragEnd: handleCategoryDragEnd,
    onCategoryDragOver: handleCategoryDragOver,
    onCategoryDrop: handleCategoryDrop,
  };
}
