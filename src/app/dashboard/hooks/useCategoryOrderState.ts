"use client";

import { useEffect, useRef, useState } from "react";

import { FeedService } from "@/lib";

interface UseCategoryOrderStateOptions {
  usePlaceholderData: boolean;
}

export function useCategoryOrderState({
  usePlaceholderData,
}: UseCategoryOrderStateOptions) {
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
      .catch(() => {});
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
      void FeedService.saveCategoryOrder(orderedCategoryLabels).catch(() => {});
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
