import { useEffect, useState } from "react";

/**
 * Custom hook to detect when the component has hydrated on the client
 * Useful for preventing hydration mismatches
 */
export const useIsClient = (): boolean => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient;
};

/**
 * Custom hook for managing debug state with client-side persistence
 */
export const useDebugState = (initialValue: boolean = false) => {
  const [debugState, setDebugState] = useState(initialValue);
  const isClient = useIsClient();

  const toggleDebug = () => {
    setDebugState(prev => !prev);
  };

  return {
    debug: debugState,
    toggleDebug,
    isClient,
  };
};
