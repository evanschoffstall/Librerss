"use client";

import React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useCallback, useEffect, useState } from "react";
import "./DebugGrid.css";

const DebugGrid = () => {
  const [debug, setDebug] = useState(false);

  const toggle = useCallback(() => {
    setDebug((prevDebug) => !prevDebug);
  }, []);

  useHotkeys("shift+g", toggle);

  useEffect(() => {
    const gridOverlay = document.getElementById("debug-grid-overlay");
    if (gridOverlay) {
      gridOverlay.style.display = debug ? "block" : "none";
    }
  }, [debug]);

  if (typeof window === "undefined") {
    return null;
  }

  return <div id="debug-grid-overlay" className="debug-grid"></div>;
};

export default DebugGrid;
