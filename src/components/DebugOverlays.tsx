"use client";

import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useDebugState } from "@/lib/hooks";

import "./components.css";

/**
 * Render the debug border component.
 * @returns The rendered debug border component.
 */
export const DebugBorder = () => {
  const { debug, isClient, toggleDebug } = useDebugState();

  useHotkeys("shift+d", toggleDebug);

  useEffect(() => {
    if (isClient) {
      document.body.classList.toggle("debug-border", debug);
    }
  }, [debug, isClient]);

  return null;
};

/**
 * Render the debug grid component.
 * @returns The rendered debug grid component.
 */
export const DebugGrid = () => {
  const { debug, isClient, toggleDebug } = useDebugState();

  useHotkeys("shift+g", toggleDebug);

  useEffect(() => {
    if (isClient) {
      const gridOverlay = document.getElementById("debug-grid-overlay");
      if (gridOverlay) {
        gridOverlay.style.display = debug ? "block" : "none";
      }
    }
  }, [debug, isClient]);

  return (
    <div
      className="debug-grid"
      id="debug-grid-overlay"
      style={{ display: !isClient ? "none" : undefined }}
    />
  );
};
