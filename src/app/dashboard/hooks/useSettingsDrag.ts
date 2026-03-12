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

export type UseSettingsDragReturn = ReturnType<typeof useSettingsDrag>;

interface UseSettingsDragOptions {
  onDropCategory: (label: string, targetIndex: number) => Promise<void>;
  onDropFeed: (
    key: string,
    targetCategory: string,
    targetIndex: number,
  ) => Promise<void>;
}

export function useSettingsDrag({
  onDropCategory,
  onDropFeed,
}: UseSettingsDragOptions) {
  // ── Payload guards ────────────────────────────────────────────────────────

  const hasFeedPayload = (event: React.DragEvent<HTMLElement>) =>
    Boolean(draggingFeedKeyRef.current) ||
    hasDragType(event, FEED_DRAG_DATA_KEY);

  const hasCategoryPayload = (event: React.DragEvent<HTMLElement>) =>
    Boolean(draggingCategoryLabelRef.current) ||
    hasDragType(event, CATEGORY_DRAG_DATA_KEY);

  // ── Feed drag ─────────────────────────────────────────────────────────────

  const [draggingFeedKey, setDraggingFeedKey] = useState<null | string>(null);
  const draggingFeedKeyRef = useRef<null | string>(null);
  const [movingFeedKey, setMovingFeedKey] = useState<null | string>(null);
  const [feedDropTarget, setFeedDropTarget] = useState<null | {
    categoryLabel: string;
    index: number;
  }>(null);

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
      if (!hasFeedPayload(event)) return;

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
      if (!hasFeedPayload(event)) return;

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
    null | string
  >(null);
  const draggingCategoryLabelRef = useRef<null | string>(null);
  const [categoryDropIndex, setCategoryDropIndex] = useState<null | number>(
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
      if (!hasCategoryPayload(event)) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setCategoryDropIndex(index);
    },
    [],
  );

  const handleCategoryDrop = useCallback(
    async (event: React.DragEvent<HTMLElement>, index: number) => {
      if (!hasCategoryPayload(event)) return;

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
    categoryDropIndex,
    // Category drag
    draggingCategoryLabel,
    // Feed drag
    draggingFeedKey,
    feedDropTarget,
    movingFeedKey,
    onCategoryDragEnd: handleCategoryDragEnd,
    onCategoryDragOver: handleCategoryDragOver,
    onCategoryDragStart: handleCategoryDragStart,
    onCategoryDrop: handleCategoryDrop,
    onFeedDragEnd: handleFeedDragEnd,
    onFeedDragOver: handleFeedDragOver,
    onFeedDragStart: handleFeedDragStart,
    onFeedDrop: handleFeedDrop,
  };
}
