"use client";

import { useCallback, useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import "./DebugGrid.css";

const DebugGrid = () => {
  const [debug, setDebug] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const toggle = useCallback(() => {
    setDebug((prevDebug) => !prevDebug);
  }, []);

  useHotkeys("shift+g", toggle);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient) {
      const gridOverlay = document.getElementById("debug-grid-overlay");
      if (gridOverlay) {
        gridOverlay.style.display = debug ? "block" : "none";
      }
    }
  }, [debug, isClient]);

  return <div id="debug-grid-overlay" className="debug-grid" style={{ display: !isClient ? "none" : undefined }}></div>;
};

export default DebugGrid;
