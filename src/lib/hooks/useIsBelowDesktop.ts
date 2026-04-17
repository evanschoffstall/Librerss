"use client";

import { useEffect, useState } from "react";

const BELOW_DESKTOP_BREAKPOINT = 1024; // matches Tailwind's `lg`

/**
 * Reports whether the current viewport is below the dashboard desktop layout.
 *
 * The dashboard keeps several "mobile" preferences active until the `lg`
 * breakpoint, even across tablet widths where the phone-only hook is too
 * narrow to reflect the actual product behavior.
 */
export function useIsBelowDesktop() {
  const [isBelowDesktop, setIsBelowDesktop] = useState(false);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(
      `(max-width: ${BELOW_DESKTOP_BREAKPOINT - 1}px)`,
    );
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
