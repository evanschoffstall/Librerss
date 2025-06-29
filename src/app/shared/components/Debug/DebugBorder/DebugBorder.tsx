"use client";

import { useDebugState } from "@/src/hooks";
import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import "./DebugBorder.css";

const DebugBorder = () => {
  const { debug, toggleDebug, isClient } = useDebugState();

  useHotkeys("shift+d", toggleDebug);

  useEffect(() => {
    if (isClient) {
      if (debug) {
        document.body.classList.add("debug-border");
      } else {
        document.body.classList.remove("debug-border");
      }
    }
  }, [debug, isClient]);

  return null;
};

export default DebugBorder;
