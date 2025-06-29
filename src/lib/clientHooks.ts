"use client";

import { useEffect, useState } from "react";

// =============================================================================
// CLIENT-ONLY CUSTOM HOOKS
// =============================================================================

export const useIsClient = (): boolean => {
  const [isClientState, setIsClientState] = useState(false);
  useEffect(() => setIsClientState(true), []);
  return isClientState;
};

export const useDebugState = (initialValue: boolean = false) => {
  const [debugState, setDebugState] = useState(initialValue);
  const isClientState = useIsClient();

  const toggleDebug = () => setDebugState(prev => !prev);

  return { debug: debugState, toggleDebug, isClient: isClientState };
};
