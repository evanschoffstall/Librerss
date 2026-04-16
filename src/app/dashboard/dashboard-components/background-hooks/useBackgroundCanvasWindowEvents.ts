"use client";

import { useEffect } from "react";

interface UseBackgroundCanvasWindowEventsOptions {
  onMouseMove: (event: MouseEvent) => void;
  onResize: () => void;
}

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
