"use client";

import { useEffect, useState } from "react";

/**
 * Manage the debug state.
 * @param initialValue - The initial value.
 * @returns The debug state and callbacks.
 */
export const useDebugState = (initialValue = false) => {
  const [debugState, setDebugState] = useState(initialValue);
  const [isClientState, setIsClientState] = useState(false);

  useEffect(() => {
    setIsClientState(true);
  }, []);

  /**
   * Toggle the debug flag between enabled and disabled.
   */
  const toggleDebug = () => {
    setDebugState((prev) => !prev);
  };

  return { debug: debugState, isClient: isClientState, toggleDebug };
};
