"use client";

import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 640; // matches Tailwind's `sm`

/**
 * Manage the is mobile.
 * @returns Whether is mobile.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    /**
     * Process the on change.
     */
    const onChange = () => {
      setIsMobile(mql.matches);
    };
    onChange();
    mql.addEventListener("change", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
    };
  }, []);

  return isMobile;
}
