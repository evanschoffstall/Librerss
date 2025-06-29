"use client";

import { useCallback, useState, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import "./DebugBorder.css";

const DebugBorder = () => {
  const [debug, setDebug] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const toggle = useCallback(() => {
    setDebug((prevDebug) => !prevDebug);
  }, []);

  useHotkeys("shift+d", toggle);

  useEffect(() => {
    setIsClient(true);
  }, []);

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
