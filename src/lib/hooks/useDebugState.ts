"use client";

import { useEffect, useState } from "react";

export const useDebugState = (initialValue: boolean = false) => {
  const [debugState, setDebugState] = useState(initialValue);
  const [isClientState, setIsClientState] = useState(false);

  useEffect(() => setIsClientState(true), []);

  const toggleDebug = () => setDebugState((prev) => !prev);

  return { debug: debugState, toggleDebug, isClient: isClientState };
};
