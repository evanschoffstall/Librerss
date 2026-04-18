"use client";

import { useEffect, useState } from "react";

const BELOW_DESKTOP_BREAKPOINT = 1024; // matches Tailwind's `lg`

/**
 * Manage the is below desktop.
 * @returns Whether is below desktop.
 */
export function useIsBelowDesktop() {
  const [isBelowDesktop, setIsBelowDesktop] = useState(false);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(
      `(max-width: ${BELOW_DESKTOP_BREAKPOINT - 1}px)`,
    );
    /**
     * Process the handle change.
     */
    const handleChange = () => {
      setIsBelowDesktop(mediaQueryList.matches);
    };

    handleChange();
    mediaQueryList.addEventListener("change", handleChange);

    return () => {
      mediaQueryList.removeEventListener("change", handleChange);
    };
  }, []);

  return isBelowDesktop;
}
