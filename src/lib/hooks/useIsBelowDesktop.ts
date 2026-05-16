"use client";

import { useLayoutEffect, useRef, useState } from "react";

const BELOW_DESKTOP_BREAKPOINT = 1024; // matches Tailwind's `lg`

/**
 * Manage the is below desktop.
 * @returns Whether is below desktop.
 */
export function useIsBelowDesktop() {
  const mediaQueryListRef = useRef<MediaQueryList | null>(null);
  if (mediaQueryListRef.current === null && typeof window !== "undefined") {
    mediaQueryListRef.current = window.matchMedia(
      `(max-width: ${BELOW_DESKTOP_BREAKPOINT - 1}px)`,
    );
  }
  const mediaQueryList = mediaQueryListRef.current;
  const [isBelowDesktop, setIsBelowDesktop] = useState(
    mediaQueryList?.matches ?? false,
  );

  useLayoutEffect(() => {
    if (!mediaQueryList) {
      return;
    }
    /**
     * Update isBelowDesktop state when the breakpoint media query changes.
     */
    const handleChange = () => {
      setIsBelowDesktop(mediaQueryList.matches);
    };

    handleChange();
    mediaQueryList.addEventListener("change", handleChange);

    return () => {
      mediaQueryList.removeEventListener("change", handleChange);
    };
  }, [mediaQueryList]);

  return isBelowDesktop;
}
