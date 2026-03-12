"use client";

import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useDebugState } from "../lib";

import "./components.css";

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
