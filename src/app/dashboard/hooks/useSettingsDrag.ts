"use client";

/**
 * Encapsulates HTML5 drag-and-drop state and handlers for the settings modal:
 * feed rows within a category, and category accordion items.
 */

import { useCallback, useRef, useState } from "react";

const FEED_DRAG_DATA_KEY = "application/x-librerss-feed-key";
const CATEGORY_DRAG_DATA_KEY = "application/x-librerss-category-label";

const hasDragType = (event: React.DragEvent<HTMLElement>, dragType: string) =>
  Array.from(event.dataTransfer.types).includes(dragType);

interface UseSettingsDragOptions {
  onDropFeed: (
    key: string,
    targetCategory: string,
    targetIndex: number,
  ) => Promise<void>;
  onDropCategory: (label: string, targetIndex: number) => Promise<void>;
}

export type UseSettingsDragReturn = ReturnType<typeof useSettingsDrag>;

export function useSettingsDrag({
  onDropFeed,
  onDropCategory,
}: UseSettingsDragOptions) {
  // ── Feed drag ─────────────────────────────────────────────────────────────

  const [draggingFeedKey, setDraggingFeedKey] = useState<string | null>(null);
  const draggingFeedKeyRef = useRef<string | null>(null);
  const [movingFeedKey, setMovingFeedKey] = useState<string | null>(null);
  const [feedDropTarget, setFeedDropTarget] = useState<{
    categoryLabel: string;
    index: number;
  } | null>(null);

  const handleFeedDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, key: string) => {
      draggingFeedKeyRef.current = key;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(FEED_DRAG_DATA_KEY, key);
      event.dataTransfer.setData("text/plain", key);
      // Defer state update so the re-render doesn't shift layout during the
      // browser's drag-ghost capture phase.
      requestAnimationFrame(() => {
        setDraggingFeedKey(key);
        setFeedDropTarget(null);
      });
    },
    [],
  );

  const handleFeedDragEnd = useCallback(() => {
    draggingFeedKeyRef.current = null;
    setDraggingFeedKey(null);
    setFeedDropTarget(null);
  }, []);

  const handleFeedDragOver = useCallback(
    (
      event: React.DragEvent<HTMLElement>,
      categoryLabel: string,
      index: number,
    ) => {
      const hasFeedDragPayload =
        Boolean(draggingFeedKeyRef.current) ||
        hasDragType(event, FEED_DRAG_DATA_KEY);
      if (!hasFeedDragPayload) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setFeedDropTarget({ categoryLabel, index });
    },
    [],
  );

  const handleFeedDrop = useCallback(
    async (
      event: React.DragEvent<HTMLElement>,
      categoryLabel: string,
      index: number,
    ) => {
      const hasFeedDragPayload =
        Boolean(draggingFeedKeyRef.current) ||
        hasDragType(event, FEED_DRAG_DATA_KEY);
      if (!hasFeedDragPayload) return;

      event.preventDefault();
      event.stopPropagation();
      const droppedKey =
        event.dataTransfer.getData(FEED_DRAG_DATA_KEY) ||
        draggingFeedKeyRef.current;
      setFeedDropTarget(null);
      if (!droppedKey) return;
      setMovingFeedKey(droppedKey);
      try {
        await onDropFeed(droppedKey, categoryLabel, index);
      } finally {
        setMovingFeedKey(null);
        draggingFeedKeyRef.current = null;
        setDraggingFeedKey(null);
        setFeedDropTarget(null);
      }
    },
    [onDropFeed],
  );

  // ── Category drag ─────────────────────────────────────────────────────────

  const [draggingCategoryLabel, setDraggingCategoryLabel] = useState<
    string | null
  >(null);
  const draggingCategoryLabelRef = useRef<string | null>(null);
  const [categoryDropIndex, setCategoryDropIndex] = useState<number | null>(
    null,
  );

  const handleCategoryDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, label: string) => {
      draggingCategoryLabelRef.current = label;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(CATEGORY_DRAG_DATA_KEY, label);
      event.dataTransfer.setData("text/plain", label);
      requestAnimationFrame(() => {
        setDraggingCategoryLabel(label);
      });
    },
    [],
  );

  const handleCategoryDragEnd = useCallback(() => {
    draggingCategoryLabelRef.current = null;
    setDraggingCategoryLabel(null);
    setCategoryDropIndex(null);
  }, []);

  const handleCategoryDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>, index: number) => {
      const hasCategoryDragPayload =
        Boolean(draggingCategoryLabelRef.current) ||
        hasDragType(event, CATEGORY_DRAG_DATA_KEY);
      if (!hasCategoryDragPayload) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setCategoryDropIndex(index);
    },
    [],
  );

  const handleCategoryDrop = useCallback(
    async (event: React.DragEvent<HTMLElement>, index: number) => {
      const hasCategoryDragPayload =
        Boolean(draggingCategoryLabelRef.current) ||
        hasDragType(event, CATEGORY_DRAG_DATA_KEY);
      if (!hasCategoryDragPayload) return;

      event.preventDefault();
      const droppedLabel =
        event.dataTransfer.getData(CATEGORY_DRAG_DATA_KEY) ||
        event.dataTransfer.getData("text/plain") ||
        draggingCategoryLabelRef.current;
      setCategoryDropIndex(null);
      if (!droppedLabel) return;
      try {
        await onDropCategory(droppedLabel, index);
      } finally {
        draggingCategoryLabelRef.current = null;
        setDraggingCategoryLabel(null);
      }
    },
    [onDropCategory],
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
