"use client";

import { useEffect } from "react";

interface UseBackgroundCanvasWindowEventsOptions {
  onMouseMove: (event: MouseEvent) => void;
  onResize: () => void;
}

/**
 * @param root0
 * @param root0.onMouseMove
 * @param root0.onResize
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
