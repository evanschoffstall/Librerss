"use client";

import { useEffect, useRef, useState } from "react";

import { FeedService } from "@/lib/api";

/**
 * Configures how the dashboard category-order hook loads and persists saved
 * ordering state.
 */
interface UseCategoryOrderStateOptions {
  usePlaceholderData: boolean;
}

/**
 * Coordinates the dashboard category order by loading the saved label sequence
 * once real feed data is available, debouncing user-driven order changes, and
 * exposing the current ordered labels for category rendering.
 * @param options - Controls whether placeholder dashboard data should defer
 * persisted order loading and saving.
 * @returns The ordered category labels and the setter used by drag-and-drop or
 * other category-reordering controls.
 */
export function useCategoryOrderState(options: UseCategoryOrderStateOptions) {
  const { usePlaceholderData } = options;
  const [orderedCategoryLabels, setOrderedCategoryLabels] = useState<string[]>(
    [],
  );
  const hasLoadedOrderRef = useRef(false);
  const hasMountedRef = useRef(false);
  const isApplyingLoadedOrderRef = useRef(false);
  const savePendingRef = useRef<null | ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (usePlaceholderData || hasLoadedOrderRef.current) {
      return;
    }

    hasLoadedOrderRef.current = true;
    void FeedService.getCategoryOrder()
      .then((labels) => {
        if (labels.length > 0) {
          isApplyingLoadedOrderRef.current = true;
          setOrderedCategoryLabels(labels);
        }
      })
      .catch(() => undefined);
  }, [usePlaceholderData]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (usePlaceholderData || orderedCategoryLabels.length === 0) {
      return;
    }

    if (isApplyingLoadedOrderRef.current) {
      isApplyingLoadedOrderRef.current = false;
      return;
    }

    if (savePendingRef.current) {
      clearTimeout(savePendingRef.current);
    }

    savePendingRef.current = setTimeout(() => {
      void FeedService.saveCategoryOrder(orderedCategoryLabels).catch(
        () => undefined,
      );
    }, 500);

    return () => {
      if (savePendingRef.current) {
        clearTimeout(savePendingRef.current);
      }
    };
  }, [orderedCategoryLabels, usePlaceholderData]);

  return {
    orderedCategoryLabels,
    setOrderedCategoryLabels,
  };
}
