"use client";

import { useEffect, useState } from "react";

/**
 * @param initialValue
 */
export const useDebugState = (initialValue = false) => {
  const [debugState, setDebugState] = useState(initialValue);
  const [isClientState, setIsClientState] = useState(false);

  useEffect(() => {
    setIsClientState(true);
  }, []);

  /**
   *
   */
  const toggleDebug = () => {
    setDebugState((prev) => !prev);
  };

  return { debug: debugState, isClient: isClientState, toggleDebug };
};
