"use client";

import { useDebugState } from "@/src/hooks";
import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import "./DebugGrid.css";

const DebugGrid = () => {
  const { debug, toggleDebug, isClient } = useDebugState();

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
      id="debug-grid-overlay"
      className="debug-grid"
      style={{ display: !isClient ? "none" : undefined }}
    />
  );
};

export default DebugGrid;
