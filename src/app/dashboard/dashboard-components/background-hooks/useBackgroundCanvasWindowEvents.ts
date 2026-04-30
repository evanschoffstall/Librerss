"use client";

import { useEffect } from "react";

/** Describes the pointer-like events consumed by background canvas parallax. */
type BackgroundCanvasPointerEvent = MouseEvent | PointerEvent;

/** Describes the options for use background canvas window events. */
interface UseBackgroundCanvasWindowEventsOptions {
  onMouseMove: (event: BackgroundCanvasPointerEvent) => void;
  onResize: () => void;
}

/**
 * Manage the background canvas window events.
 *
 * Pointer events are used so touch-capable browsers, including mobile WebKit,
 * feed the same parallax path as desktop mouse input. Pointer down is included
 * because touch screens often express a user's intentional location as a tap
 * rather than a hover-style move. Mouse movement is also registered because
 * Firefox and browser automation stacks can emit mouse input without a matching
 * pointermove event. Duplicate same-coordinate events are ignored to avoid
 * double-applying a single physical movement in browsers that emit both.
 * @param options - The options used to manage the background canvas window events.
 */
export function useBackgroundCanvasWindowEvents(
  options: UseBackgroundCanvasWindowEventsOptions,
) {
  const { onMouseMove, onResize } = options;
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
     * @param event - The pointer or mouse event carrying viewport coordinates.
     */
    const handlePointerMove = (event: BackgroundCanvasPointerEvent) => {
      if (event.clientX === lastPointerX && event.clientY === lastPointerY) {
        return;
      }

      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      onMouseMove(event);
    };

    for (const pointerEventName of pointerEventNames) {
      window.addEventListener(pointerEventName, handlePointerMove, {
        passive: true,
      });
    }
    window.addEventListener("resize", onResize);

    return () => {
      for (const pointerEventName of pointerEventNames) {
        window.removeEventListener(pointerEventName, handlePointerMove);
      }
      window.removeEventListener("resize", onResize);
    };
  }, [onMouseMove, onResize]);
}
