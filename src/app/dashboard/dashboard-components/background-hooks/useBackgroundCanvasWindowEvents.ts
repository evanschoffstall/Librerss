"use client";

import { useEffect } from "react";

/**
 * Describes the options for use background canvas window events.
 */
interface UseBackgroundCanvasWindowEventsOptions {
  onMouseMove: (event: MouseEvent) => void;
  onResize: () => void;
}

/**
 * Manage the background canvas window events.
 * @param options - The options used to manage the background canvas window events.
 */
export function useBackgroundCanvasWindowEvents(
  options: UseBackgroundCanvasWindowEventsOptions,
) {
  const { onMouseMove, onResize } = options;
  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
    };
  }, [onMouseMove, onResize]);
}
