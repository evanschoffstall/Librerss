"use client";

import { useRef } from "react";

/**
 * Manage the shared canvas element refs used by animated dashboard backgrounds.
 * @returns The container and canvas refs used to size and render the background.
 */
export function useBackgroundCanvasRefs() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  return {
    canvasContainerRef,
    canvasRef,
  };
}
