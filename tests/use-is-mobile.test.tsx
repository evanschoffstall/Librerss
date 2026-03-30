import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";

import { useIsMobile } from "@/lib/hooks/useIsMobile";

type MatchMediaListener = (event: { matches: boolean }) => void;

function installMatchMedia(initialMatches = false) {
  const listeners = new Set<MatchMediaListener>();
  const addEventListener = mock(
    (_type: string, listener: MatchMediaListener) => {
      listeners.add(listener);
    },
  );
  const removeEventListener = mock(
    (_type: string, listener: MatchMediaListener) => {
      listeners.delete(listener);
    },
  );

  const mediaQueryList = {
    addEventListener,
    matches: initialMatches,
    media: "(max-width: 639px)",
    removeEventListener,
  };

  const originalMatchMedia = window.matchMedia;
  const matchMedia = mock((query: string) => {
    expect(query).toBe("(max-width: 639px)");
    return mediaQueryList as unknown as MediaQueryList;
  });

  window.matchMedia = matchMedia as typeof window.matchMedia;

  return {
    addEventListener,
    emit(matches: boolean) {
      mediaQueryList.matches = matches;
      for (const listener of listeners) {
        listener({ matches });
      }
    },
    matchMedia,
    removeEventListener,
    restore() {
      window.matchMedia = originalMatchMedia;
    },
  };
}

afterEach(() => {
  mock.restore();
});

describe("useIsMobile", () => {
  test("reads the initial matchMedia result and subscribes to changes", () => {
    const env = installMatchMedia(false);

    try {
      const { result } = renderHook(() => useIsMobile());

      expect(env.matchMedia).toHaveBeenCalledTimes(1);
      expect(result.current).toBe(false);
      expect(env.addEventListener).toHaveBeenCalledTimes(1);

      act(() => {
        env.emit(true);
      });

      expect(result.current).toBe(true);
    } finally {
      env.restore();
    }
  });

  test("cleans up the matchMedia listener on unmount", () => {
    const env = installMatchMedia(true);

    try {
      const { result, unmount } = renderHook(() => useIsMobile());

      expect(result.current).toBe(true);

      unmount();

      expect(env.removeEventListener).toHaveBeenCalledTimes(1);
      expect(env.removeEventListener.mock.calls[0]?.[0]).toBe("change");
    } finally {
      env.restore();
    }
  });
});