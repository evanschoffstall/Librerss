"use client";

import { useEffect, useRef, useState } from "react";

import { FeedService } from "@/lib/api";

/**
 * Describes the options for use category order state.
 */
interface UseCategoryOrderStateOptions {
  usePlaceholderData: boolean;
}

/**
 * Manage the category order state.
 * @param options - The options used to manage the category order state.
 * @returns The category order state state and callbacks.
 */
export function useCategoryOrderState(options: UseCategoryOrderStateOptions) {
  const { usePlaceholderData } = options;
  const [orderedCategoryLabels, setOrderedCategoryLabels] = useState<string[]>(
    [],
  );
  const hasLoadedOrderRef = useRef(false);
  const hasMountedRef = useRef(false);
  const savePendingRef = useRef<null | ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (usePlaceholderData || hasLoadedOrderRef.current) {
      return;
    }

    hasLoadedOrderRef.current = true;
    void FeedService.getCategoryOrder()
      .then((labels) => {
        if (labels.length > 0) {
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
