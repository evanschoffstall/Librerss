"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Tracks collapsed and expanded content heights for article body animations.
 *
 * The hook uses ResizeObserver instead of window-level resize listeners so each
 * article can react to local layout changes without adding global listeners.
 *
 * @param content Plain-text article content used as a measurement invalidation key.
 * @param preview Plain-text preview used as a measurement invalidation key.
 * @param richContentClassName Expanded-content class name used as a measurement invalidation key.
 * @param shouldMeasureExpandedHeight Whether the expanded body should currently be measured.
 * @returns Measured heights plus refs for the preview and full-content elements.
 */
export function useArticleHeights(
  content: string,
  preview: string,
  richContentClassName: string,
  shouldMeasureExpandedHeight: boolean,
) {
  const previewRef = useRef<HTMLParagraphElement>(null);
  const fullContentRef = useRef<HTMLDivElement>(null);
  const [collapsedHeight, setCollapsedHeight] = useState(0);
  const [expandedHeight, setExpandedHeight] = useState(0);

  useLayoutEffect(() => {
    const previewElement = previewRef.current;
    if (!previewElement) return;

    const fullContentElement = fullContentRef.current;

    const measureHeights = () => {
      setCollapsedHeight(previewElement.scrollHeight);
      if (shouldMeasureExpandedHeight && fullContentElement) {
        setExpandedHeight(fullContentElement.scrollHeight);
      }
    };
    measureHeights();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measureHeights);
    resizeObserver?.observe(previewElement);
    if (shouldMeasureExpandedHeight && fullContentElement) {
      resizeObserver?.observe(fullContentElement);
    }

    return () => {
      resizeObserver?.disconnect();
    };
  }, [content, preview, richContentClassName, shouldMeasureExpandedHeight]);

  return { collapsedHeight, expandedHeight, fullContentRef, previewRef };
}
