"use client";

import { useEffect } from "react";

/** Describes a viewport-relative motion input consumed by background canvas parallax. */
interface BackgroundCanvasMotionInput {
  clientX: number;
  clientY: number;
}

/** Describes the options for use background canvas window events. */
interface UseBackgroundCanvasWindowEventsOptions {
  onMotionChange: (event: BackgroundCanvasMotionInput) => void;
  onResize: () => void;
}

/**
 * Manage the background canvas window events.
 *
 * Desktop and mobile browsers use pointer-like viewport events to steer the
 * background parallax surface.
 * @param options - The options used to manage the background canvas window events.
 */
export function useBackgroundCanvasWindowEvents(
  options: UseBackgroundCanvasWindowEventsOptions,
) {
  const { onMotionChange, onResize } = options;
  useEffect(() => {
    const pointerEventNames =
      "PointerEvent" in window
        ? (["pointermove", "pointerdown", "mousemove"] as const)
        : (["mousemove"] as const);
    let lastPointerX = Number.NaN;
    let lastPointerY = Number.NaN;
    /**
     * Forward a pointer-like movement event unless it repeats the exact last
     * coordinates already handled from another event family for the same
     * physical input.
     * @param event - The pointer-like input carrying viewport coordinates.
     */
    const handleMotionInput = (event: BackgroundCanvasMotionInput) => {
      if (event.clientX === lastPointerX && event.clientY === lastPointerY) {
        return;
      }

      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      onMotionChange(event);
    };

    for (const pointerEventName of pointerEventNames) {
      window.addEventListener(pointerEventName, handleMotionInput, {
        passive: true,
      });
    }

    window.addEventListener("resize", onResize);

    return () => {
      for (const pointerEventName of pointerEventNames) {
        window.removeEventListener(pointerEventName, handleMotionInput);
      }

      window.removeEventListener("resize", onResize);
    };
  }, [onMotionChange, onResize]);
}
