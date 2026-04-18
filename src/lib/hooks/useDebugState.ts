"use client";

import { useEffect, useState } from "react";

/**
 * Manage the debug state.
 * @param initialValue - The initial value.
 * @returns The debug state state and callbacks.
 */
export const useDebugState = (initialValue = false) => {
  const [debugState, setDebugState] = useState(initialValue);
  const [isClientState, setIsClientState] = useState(false);

  useEffect(() => {
    setIsClientState(true);
  }, []);

  /**
   * Process the toggle debug.
   */
  const toggleDebug = () => {
    setDebugState((prev) => !prev);
  };

  return { debug: debugState, isClient: isClientState, toggleDebug };
};
