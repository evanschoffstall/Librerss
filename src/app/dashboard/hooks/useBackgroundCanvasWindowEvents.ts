"use client";

import { useEffect } from "react";

interface UseBackgroundCanvasWindowEventsOptions {
  /** Pointer handler used to update decorative canvas offsets. */
  onMouseMove: (event: MouseEvent) => void;
  /** Resize handler that keeps the canvas aligned with its container. */
  onResize: () => void;
}

/**
 * Registers shared window listeners for decorative dashboard canvases.
 *
 * Both dashboard background canvases react to pointer movement and viewport
 * resizing. Centralizing the listener lifecycle keeps those components aligned
 * and avoids duplicate listener boilerplate.
 *
 * @param options Stable handlers for window mousemove and resize events.
 */
export function useBackgroundCanvasWindowEvents({
  onMouseMove,
  onResize,
}: UseBackgroundCanvasWindowEventsOptions) {
  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
    };
  }, [onMouseMove, onResize]);
}
