"use client";

import { useHotkeys } from "react-hotkeys-hook";
import { useCallback } from "react";
import "./DebugBorder.css";

const DebugBorder = () => {
  const toggle = useCallback((debug: boolean) => {
    if (debug) {
      document.body.classList.add("debug-border");
    } else {
      document.body.classList.remove("debug-border");
    }
  }, []);

  let debug = false;

  useHotkeys("shift+d", () => {
    debug = !debug;
    toggle(debug);
  });

  return null;
};

export default DebugBorder;
